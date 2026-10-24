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
import MessageBubble from './MessageBubble';
import SubchatPane from './SubchatPane';

const statusStyle: Record<AgentStatus, string> = {
  idle: 'border-neutral-300 bg-white text-neutral-500',
  clarifying: 'border-blue-200 bg-blue-50 text-blue-700',
  negotiating: 'border-blue-200 bg-blue-50 text-blue-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stuck: 'border-amber-200 bg-amber-50 text-amber-700',
};

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

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
  // reconnect never drops events that arrived mid-flight (UI-09).
  const fetchHistory = () =>
    getTaskMessages(task.id)
      .then((h) => {
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
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));

  // REST history on select — replay reconstructs participants + transcripts.
  useEffect(() => {
    let cancelled = false;
    getTaskMessages(task.id)
      .then((h) => {
        if (cancelled) return;
        setMessages(h.messages);
        setSubchats(h.subchats);
        if (h.disclosures) setDisclosures(h.disclosures);
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
    const input = (e.target as HTMLFormElement).elements.namedItem(
      'body',
    ) as HTMLInputElement;
    const body = input.value.trim();
    if (!body) return;
    input.value = '';

    const localId = `local-${Date.now()}-${pendingSends.length}`;
    setPendingSends((p) => [...p, { id: localId, body, state: 'sending' }]);

    // Ack = server confirmed persistence; the human echo renders it.
    // No silent replay — a missing ack surfaces as delivery uncertainty.
    getSocket().emit(EVT.CHAT_SEND, { taskId: task.id, body }, () => {
      setPendingSends((p) => p.filter((x) => x.id !== localId));
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

  const pill = !connected ? (
    <span className="ml-3 shrink-0 rounded-full border border-amber-500/50 px-2 py-0.5 font-mono text-[10px] text-amber-400">
      reconnecting…
    </span>
  ) : (
    <span
      className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${statusStyle[agentStatus]}`}
    >
      {agentStatus === 'idle' ? 'agent idle' : `agent ${agentStatus}…`}
    </span>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <h2 className="truncate text-sm font-medium text-neutral-900">
          {task.title}
        </h2>
        {pill}
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-white p-4"
      >
        {loading && (
          <p className="text-xs text-neutral-400">Loading history…</p>
        )}
        {loadError && (
          <p className="text-xs text-red-600">
            Couldn&apos;t load history — reconnecting will retry.
          </p>
        )}
        {main.map((m) => (
          <MessageBubble key={m.id} message={m} agentName={agentName} />
        ))}
        {disclosureRoutes.main.map((n) => (
          <div
            key={n.id}
            className="my-1.5 border-l-2 border-amber-400 pl-2 text-xs text-amber-800"
          >
            {agentName(n.ownerAgentId)} shared {n.releasedCount} · withheld{' '}
            {n.withheldCount} — private or outside task scope ({n.decision})
          </div>
        ))}
        {subchats.map((s) => (
          <SubchatPane
            key={s.id}
            subchat={s}
            messages={bySubchat.get(s.id) ?? []}
            disclosures={disclosureRoutes.bySubchat.get(s.id) ?? []}
            agentName={agentName}
          />
        ))}
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
      <form onSubmit={send} className="border-t border-neutral-200 bg-white p-3">
        <div className="flex gap-2">
          <label htmlFor="chat-body" className="sr-only">
            Message your agent
          </label>
          <input
            id="chat-body"
            name="body"
            placeholder="Message your agent…"
            autoComplete="off"
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
