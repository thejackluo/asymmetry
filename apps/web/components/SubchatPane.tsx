'use client';

import { useState } from 'react';
import type { DisclosureNotice, Message, Subchat } from '@/lib/types';
import { formatTime } from '@/lib/utils';

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
}: {
  subchat: Subchat;
  messages: Message[];
  disclosures: DisclosureNotice[];
  agentName: (agentId: string) => string;
}) {
  const [open, setOpen] = useState(true);

  const title =
    subchat.kind === 'group'
      ? `${subchat.participantAgentIds.length} agents`
      : subchat.participantAgentIds.map(agentName).join(' ↔ ');

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
    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Agent conversation: ${title}, ${stateText}`}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-neutral-700">
          Agent conversation · {title} — {stateText}
        </span>
        <span className="text-xs text-neutral-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto border-t border-neutral-100 px-3 py-2">
          {feed.map((entry) =>
            entry.kind === 'message' ? (
              <div key={entry.message.id} className="mb-1.5 text-xs">
                <span className="text-neutral-500">
                  [{formatTime(entry.message.createdAt)}]{' '}
                  {agentName(entry.message.senderId)}:
                </span>{' '}
                <span className="text-neutral-800">{entry.message.body}</span>
              </div>
            ) : (
              <div
                key={entry.notice.id}
                className="my-1.5 border-l-2 border-amber-400 pl-2 text-xs text-amber-800"
              >
                {agentName(entry.notice.ownerAgentId)} shared{' '}
                {entry.notice.releasedCount} · withheld{' '}
                {entry.notice.withheldCount} — private or outside task scope
                ({entry.notice.decision})
              </div>
            ),
          )}
          {feed.length === 0 && (
            <p className="text-xs text-neutral-400">Waiting for agents…</p>
          )}
        </div>
      )}
      {isClosed && subchat.summary && (
        <div className="border-t border-neutral-100 px-3 py-2">
          <span
            className={`mr-2 inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase ${
              outcome === 'stuck'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
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
