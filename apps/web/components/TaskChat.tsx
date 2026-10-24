'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTaskMessages } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type {
  AgentStatus,
  DisclosureNotice,
  Message,
  Subchat,
  Task,
} from '@/lib/types';
import { EVT } from '@/lib/types';
import {
  applySubchatClosed,
  mergeMessages,
  mergeSubchats,
  partitionMessages,
  routeDisclosures,
} from '@/lib/utils';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import SubchatPane from './SubchatPane';

interface PendingSend {
  id: string;
  body: string;
  state: 'sending' | 'failed';
}

export default function TaskChat({
  task,
  myAgentId,
  agentName,
  connected,
}: {
  task: Task;
  myAgentId: string | null;
  agentName: (agentId: string) => string;
  connected: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [subchats, setSubchats] = useState<Subchat[]>([]);
  const [disclosures, setDisclosures] = useState<DisclosureNotice[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Generation guard: a fetch started under task A must never merge its
  // response into task B after the selection changes.
  const fetchGen = useRef(0);

  useEffect(
    () => () => timersRef.current.forEach(clearTimeout),
    [],
  );

  // Reset when the selected task changes — render-phase adjustment is the
  // sanctioned pattern over synchronous setState inside the effect.
  const [lastTaskId, setLastTaskId] = useState(task.id);
  if (lastTaskId !== task.id) {
    setLastTaskId(task.id);
    setMessages([]);
    setSubchats([]);
    setDisclosures([]);
    setPendingSends([]);
    setLoading(true);
    setLoadError(false);
  }

  // Merge a history fetch into live state — dedupe by id so a refetch on
  // reconnect never drops events that arrived mid-flight (UI-09). Stale
  // responses for a previously selected task are discarded.
  const fetchHistory = () => {
    const gen = fetchGen.current;
    const taskId = task.id;
    return getTaskMessages(taskId)
      .then((h) => {
        if (gen !== fetchGen.current) return;
        setMessages((prev) => mergeMessages(prev, h.messages));
        setSubchats((prev) => mergeSubchats(prev, h.subchats));
        if (h.disclosures) {
          setDisclosures((prev) =>
            [...prev, ...h.disclosures!].filter(
              (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i,
            ),
          );
        }
        setLoadError(false);
      })
      .catch(() => {
        if (gen === fetchGen.current) setLoadError(true);
      })
      .finally(() => {
        if (gen === fetchGen.current) setLoading(false);
      });
  };

  // REST history on select — replay reconstructs participants + transcripts.
  // Merges (never replaces) so live events received mid-fetch survive.
  // Bumping the generation here discards any in-flight response from a
  // previously selected task (replay race).
  useEffect(() => {
    fetchGen.current++;
    let cancelled = false;
    getTaskMessages(task.id)
      .then((h) => {
        if (cancelled) return;
        setMessages((prev) => mergeMessages(prev, h.messages));
        setSubchats((prev) => mergeSubchats(prev, h.subchats));
        if (h.disclosures) {
          setDisclosures((prev) =>
            [...prev, ...h.disclosures!].filter(
              (d, i, arr) => arr.findIndex((x) => x.id === d.id) === i,
            ),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // Live socket subscriptions, filtered to this task.
  useEffect(() => {
    const socket = getSocket();
    const unsubs = [
      socket.on(EVT.CHAT_MESSAGE, (m: Message) => {
        if (m.taskId === task.id && m.subchatId === null) {
          setMessages((prev) => mergeMessages(prev, [m]));
        }
      }),
      socket.on(EVT.SUBCHAT_STARTED, (s: Subchat) => {
        if (s.taskId === task.id) {
          setSubchats((prev) =>
            prev.some((x) => x.id === s.id) ? prev : [...prev, s],
          );
        }
      }),
      socket.on(EVT.SUBCHAT_MESSAGE, (m: Message) => {
        if (m.taskId === task.id) {
          setMessages((prev) => mergeMessages(prev, [m]));
        }
      }),
      socket.on(
        EVT.SUBCHAT_CLOSED,
        (c: { subchatId: string; outcome: 'done' | 'stuck'; summary: string }) => {
          setSubchats((prev) => applySubchatClosed(prev, c));
          // The closure may arrive before the subchat entity (or while a
          // stale 'open' snapshot is in flight). The DB commits the closure
          // before emitting, so a guarded refetch converges state; the
          // terminal-aware merge keeps an older 'open' reply from winning.
          void fetchHistory();
        },
      ),
      socket.on(EVT.DISCLOSURE_LOGGED, (n: DisclosureNotice) => {
        if (n.taskId === task.id) {
          setDisclosures((prev) =>
            prev.some((d) => d.id === n.id) ? prev : [...prev, n],
          );
        }
      }),
      socket.on(
        EVT.AGENT_STATUS,
        (p: { agentId: string; status: AgentStatus }) => {
          if (p.agentId === myAgentId) setAgentStatus(p.status);
        },
      ),
      // Reconnect recovery: refetch history so missed events surface (UI-09).
      socket.on('connect', () => {
        void fetchHistory();
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [task.id, myAgentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { main, bySubchat } = useMemo(
    () => partitionMessages(messages),
    [messages],
  );
  const disclosureRoutes = useMemo(
    () => routeDisclosures(disclosures, task.id),
    [disclosures, task.id],
  );

  // Follow new output only while the reader is already near the bottom —
  // never yank the view away from someone scrolling up (UI-10/a11y).
  const pinnedToBottom = useRef(true);
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };
  useEffect(() => {
    if (pinnedToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, subchats.length, disclosures.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');

    const localId = `local-${Date.now()}-${pendingSends.length}`;
    setPendingSends((p) => [...p, { id: localId, body, state: 'sending' }]);

    // Ack = server confirmed persistence; the human echo renders it.
    // No silent replay — a missing ack surfaces as delivery uncertainty,
    // and a rejection (ok:false) is surfaced, not silently dropped.
    getSocket().emit(EVT.CHAT_SEND, { taskId: task.id, body }, (result) => {
      setPendingSends((p) =>
        result?.ok
          ? p.filter((x) => x.id !== localId)
          : p.map((x) =>
              x.id === localId ? { ...x, state: 'failed' } : x,
            ),
      );
    });
    const t = setTimeout(() => {
      setPendingSends((p) =>
        p.map((x) =>
          x.id === localId && x.state === 'sending'
            ? { ...x, state: 'failed' }
            : x,
        ),
      );
    }, 5000);
    timersRef.current.push(t);
  }

  const taskStatus: Record<Task['status'], { label: string; color: string }> = {
    active: {
      label: 'searching your network…',
      color: 'text-[#0a84ff]',
    },
    done: { label: 'done', color: 'text-emerald-700' },
    stuck: { label: 'needs attention', color: 'text-amber-700' },
  };
  const showTyping =
    task.status === 'active'
    && (agentStatus === 'clarifying' || agentStatus === 'negotiating');

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[68px] items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={task.title} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-neutral-900">
              {task.title}
            </h2>
            <p className={`truncate text-xs ${taskStatus[task.status].color}`}>
              {taskStatus[task.status].label}
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${
            connected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}
          role="status"
        >
          {connected ? 'connected' : 'reconnecting…'}
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-[#eef1f5] px-4 py-5"
      >
        {loading && (
          <p className="text-xs text-neutral-400">Loading history…</p>
        )}
        {loadError && (
          <p className="text-xs text-red-600">
            Couldn&apos;t load history — reconnecting will retry.
          </p>
        )}
        {main.map((m, index) => {
          const previous = main[index - 1];
          const next = main[index + 1];
          return (
            <MessageBubble
              key={m.id}
              message={m}
              agentName={agentName}
              showName={
                !previous
                || previous.senderId !== m.senderId
                || previous.senderType !== m.senderType
              }
              showAvatar={
                m.senderType === 'agent'
                && (!next
                  || next.senderId !== m.senderId
                  || next.senderType !== m.senderType)
              }
            />
          );
        })}
        {disclosureRoutes.main.map((n) => (
          <div
            key={n.id}
            className="my-2 flex flex-wrap gap-1.5"
          >
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-medium text-emerald-800">
              shared {n.releasedCount}
            </span>
            <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-medium text-neutral-600">
              withheld {n.withheldCount}
            </span>
          </div>
        ))}
        {subchats.map((s) => (
          <SubchatPane
            key={s.id}
            subchat={s}
            messages={bySubchat.get(s.id) ?? []}
            disclosures={disclosureRoutes.bySubchat.get(s.id) ?? []}
            agentName={agentName}
            myAgentId={myAgentId}
          />
        ))}
        {showTyping && (
          <div className="mt-2 flex items-end gap-2" aria-label="Agent is typing">
            <Avatar name={agentName(myAgentId ?? '')} size="md" />
            <div className="flex items-center gap-1 rounded-[18px] rounded-bl-[4px] border border-[#e5e5ea] bg-white px-4 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-neutral-400" />
            </div>
          </div>
        )}
        {!loading && !loadError && main.length === 0 && subchats.length === 0 && (
          <p className="text-sm text-neutral-500">
            Say something — your agent is listening.
          </p>
        )}
        {pendingSends.map((s) => (
          <p
            key={s.id}
            className={`text-xs italic ${
              s.state === 'sending' ? 'text-neutral-400' : 'text-amber-700'
            }`}
          >
            {s.state === 'sending'
              ? `Sending… “${s.body}”`
              : `Not delivered yet: “${s.body}” — check history before resending.`}
          </p>
        ))}
      </div>
      <form
        onSubmit={send}
        className="sticky bottom-0 border-t border-neutral-200 bg-white px-3 py-3"
      >
        <div className="flex items-center gap-2">
          <label htmlFor="chat-body" className="sr-only">
            Message your agent
          </label>
          <input
            id="chat-body"
            name="body"
            placeholder={connected ? 'Message your agent…' : 'Reconnecting…'}
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!connected}
            className="min-w-0 flex-1 rounded-full border-0 bg-[#f2f2f7] px-4 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-[#0a84ff]/30 disabled:text-neutral-400"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!connected || !draft.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0a84ff] text-white transition hover:bg-[#0876e5] disabled:bg-neutral-300"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
            >
              <path
                d="M4 12 20 4l-5.5 16-3-6-7.5-2Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="m11.5 14 4-4"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
            <span className="sr-only">Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
