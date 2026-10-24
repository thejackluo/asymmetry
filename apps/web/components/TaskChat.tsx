'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getTaskMessages } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type {
  AgentStatus,
  DisclosureNotice,
  Message,
  Subchat,
  SubchatClosedPayload,
  Task,
} from '@/lib/types';
import { EVT } from '@/lib/types';
import { mergeMessages, partitionMessages } from '@/lib/utils';
import MessageBubble from './MessageBubble';
import SubchatPane from './SubchatPane';

const statusStyle: Record<AgentStatus, string> = {
  idle: 'border-zinc-600 text-zinc-400',
  clarifying: 'border-sky-500/50 text-sky-400',
  negotiating: 'border-emerald-500/50 text-emerald-400',
  done: 'border-emerald-500/50 text-emerald-300',
  stuck: 'border-amber-500/50 text-amber-400',
};

export default function TaskChat({
  task,
  myAgentId,
  agentName,
}: {
  task: Task;
  myAgentId: string | null;
  agentName: (agentId: string) => string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [subchats, setSubchats] = useState<Subchat[]>([]);
  const [closures, setClosures] = useState<
    Record<string, SubchatClosedPayload>
  >({});
  const [disclosures, setDisclosures] = useState<DisclosureNotice[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // REST history on select — replay reconstructs participants + transcripts.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setSubchats([]);
    setClosures({});
    setDisclosures([]);
    getTaskMessages(task.id)
      .then((h) => {
        if (cancelled) return;
        setMessages(h.messages);
        setSubchats(h.subchats);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
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
      socket.on(EVT.SUBCHAT_CLOSED, (c: SubchatClosedPayload) => {
        setClosures((prev) => ({ ...prev, [c.subchatId]: c }));
        setSubchats((prev) =>
          prev.map((s) =>
            s.id === c.subchatId ? { ...s, status: 'closed' } : s,
          ),
        );
      }),
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
    ];
    return () => unsubs.forEach((u) => u());
  }, [task.id, myAgentId]);

  const { main, bySubchat } = useMemo(
    () => partitionMessages(messages),
    [messages],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, subchats.length]);

  // Route each disclosure to its pane: exact subchatId match, else the
  // task's most recent open subchat (best-effort fallback).
  const disclosuresFor = (subchatId: string): DisclosureNotice[] =>
    disclosures.filter(
      (n) =>
        n.subchatId === subchatId ||
        (n.subchatId === null &&
          subchats.filter((s) => s.status === 'open').at(-1)?.id === subchatId),
    );

  function send(e: React.FormEvent) {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).elements.namedItem(
      'body',
    ) as HTMLInputElement;
    const body = input.value.trim();
    if (!body) return;
    getSocket().emit(EVT.CHAT_SEND, { taskId: task.id, body });
    input.value = '';
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <h2 className="truncate text-sm text-zinc-300">{task.title}</h2>
        <span
          className={`ml-3 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${statusStyle[agentStatus]}`}
        >
          {agentStatus === 'idle'
            ? 'agent idle'
            : `agent ${agentStatus}…`}
        </span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {loading && (
          <p className="font-mono text-xs text-zinc-600">loading history…</p>
        )}
        {main.map((m) => (
          <MessageBubble key={m.id} message={m} agentName={agentName} />
        ))}
        {subchats.map((s) => (
          <SubchatPane
            key={s.id}
            subchat={s}
            messages={bySubchat.get(s.id) ?? []}
            disclosures={disclosuresFor(s.id)}
            closure={closures[s.id] ?? null}
            agentName={agentName}
          />
        ))}
        {!loading && main.length === 0 && subchats.length === 0 && (
          <p className="text-sm text-zinc-600">
            say something — your agent is listening.
          </p>
        )}
      </div>
      <form onSubmit={send} className="border-t border-zinc-800 p-3">
        <div className="flex gap-2">
          <input
            name="body"
            placeholder="message your agent…"
            autoComplete="off"
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
          <button
            type="submit"
            className="rounded bg-emerald-500/90 px-4 font-mono text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            send
          </button>
        </div>
      </form>
    </div>
  );
}
