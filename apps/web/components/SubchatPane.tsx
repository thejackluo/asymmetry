'use client';

import { useState } from 'react';
import type { DisclosureNotice, Message, Subchat } from '@/lib/types';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';

type FeedEntry =
  | { kind: 'message'; message: Message }
  | { kind: 'disclosure'; notice: DisclosureNotice };

// Collapsible "Agent conversation" region — A2A traffic stays visually
// distinct but reads as product UI, not a terminal window.
export default function SubchatPane({
  subchat,
  messages,
  disclosures,
  agentName,
  myAgentId,
}: {
  subchat: Subchat;
  messages: Message[];
  disclosures: DisclosureNotice[];
  agentName: (agentId: string) => string;
  myAgentId: string | null;
}) {
  const [open, setOpen] = useState(true);

  const title = subchat.participantAgentIds.map(agentName).join(' ↔ ');

  const feed: FeedEntry[] = [
    ...messages.map((m): FeedEntry => ({ kind: 'message', message: m })),
    ...disclosures.map((n): FeedEntry => ({ kind: 'disclosure', notice: n })),
  ].sort((a, b) => {
    const ta =
      a.kind === 'message' ? a.message.createdAt : Number.MAX_SAFE_INTEGER;
    const tb =
      b.kind === 'message' ? b.message.createdAt : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  // Notices carry no timestamp — they append in arrival order after messages.

  const outcome = subchat.outcome;
  const isClosed = subchat.status === 'closed' || outcome !== null;
  const stateText = isClosed ? (outcome ?? 'done') : 'open';

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Agent conversation: ${title}, ${stateText}`}
        className="flex w-full items-center justify-between gap-3 bg-white px-3 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 -space-x-2">
            {subchat.participantAgentIds.map((agentId) => (
              <Avatar key={agentId} name={agentName(agentId)} size="sm" />
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-neutral-800">
              {title}
            </span>
            <span className="block text-[10px] capitalize text-neutral-500">
              {stateText} · {subchat.kind === 'group' ? 'group thread' : 'thread'}
            </span>
          </span>
        </span>
        <span aria-hidden="true" className="text-sm text-neutral-400">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="max-h-72 space-y-1 overflow-y-auto border-t border-neutral-100 bg-[#eef1f5] px-3 py-3">
          {feed.map((entry, index) => {
            if (entry.kind === 'message') {
              const previous = feed[index - 1];
              const next = feed[index + 1];
              const showName =
                previous?.kind !== 'message'
                || previous.message.senderId !== entry.message.senderId;
              const showAvatar =
                next?.kind !== 'message'
                || next.message.senderId !== entry.message.senderId;

              return (
                <MessageBubble
                  key={entry.message.id}
                  message={entry.message}
                  agentName={agentName}
                  align={
                    entry.message.senderId === myAgentId ? 'right' : 'left'
                  }
                  showName={showName}
                  showAvatar={showAvatar}
                  compact
                />
              );
            }

            return (
              <div key={entry.notice.id} className="my-2 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-medium text-emerald-800">
                  shared {entry.notice.releasedCount}
                </span>
                <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-[10px] font-medium text-neutral-600">
                  withheld {entry.notice.withheldCount}
                </span>
              </div>
            );
          })}
          {feed.length === 0 && (
            <p className="text-xs text-neutral-400">Waiting for agents…</p>
          )}
        </div>
      )}
      {isClosed && subchat.summary && (
        <div className="border-t border-neutral-100 px-3 py-2">
          <span
            className={`mr-2 inline-block rounded-full px-2.5 py-1 text-[10px] uppercase ${
              outcome === 'stuck'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {outcome ?? 'done'}
          </span>
          <span className="text-xs text-neutral-600">{subchat.summary}</span>
        </div>
      )}
    </div>
  );
}
