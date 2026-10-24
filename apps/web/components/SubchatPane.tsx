'use client';

import { useState } from 'react';
import type {
  DisclosureNotice,
  Message,
  Subchat,
  SubchatClosedPayload,
} from '@/lib/types';
import { formatTime } from '@/lib/utils';

type FeedEntry =
  | { kind: 'message'; message: Message }
  | { kind: 'disclosure'; notice: DisclosureNotice };

// Collapsible, terminal-styled pane for agent↔agent traffic — deliberately
// machine-looking (mono, green-on-dark) so it's unmistakable vs human chat.
export default function SubchatPane({
  subchat,
  messages,
  disclosures,
  closure,
  agentName,
}: {
  subchat: Subchat;
  messages: Message[];
  disclosures: DisclosureNotice[];
  closure: SubchatClosedPayload | null;
  agentName: (agentId: string) => string;
}) {
  const [open, setOpen] = useState(true);

  const title =
    subchat.kind === 'group'
      ? `group · ${subchat.participantAgentIds.length} agents`
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

  const outcome = closure?.outcome ?? null;
  const isClosed = subchat.status === 'closed' || outcome !== null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-emerald-500/40 bg-black/60">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-emerald-500/10 px-3 py-2 text-left"
      >
        <span className="font-mono text-xs text-emerald-300 a2a-glow">
          🤖↔🤖 {title} — {isClosed ? 'closed' : 'negotiating'}
        </span>
        <span className="font-mono text-xs text-emerald-500/70">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto px-3 py-2">
          {feed.map((entry) =>
            entry.kind === 'message' ? (
              <div key={entry.message.id} className="mb-1.5 font-mono text-xs">
                <span className="text-emerald-600">
                  [{formatTime(entry.message.createdAt)}]{' '}
                  {agentName(entry.message.senderId)}:
                </span>{' '}
                <span className="text-emerald-200">{entry.message.body}</span>
              </div>
            ) : (
              <div
                key={entry.notice.id}
                className="my-1.5 border-l-2 border-amber-500/60 pl-2 font-mono text-xs text-amber-300"
              >
                🔒 {agentName(entry.notice.ownerAgentId)} shared{' '}
                {entry.notice.releasedCount} · withheld{' '}
                {entry.notice.withheldCount} (out of scope) —{' '}
                {entry.notice.decision}
              </div>
            ),
          )}
          {feed.length === 0 && (
            <p className="font-mono text-xs text-emerald-700">
              waiting for agents…
            </p>
          )}
        </div>
      )}
      {isClosed && (
        <div className="border-t border-emerald-500/30 px-3 py-2">
          <span
            className={`mr-2 inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${
              outcome === 'stuck'
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
            }`}
          >
            {outcome ?? 'done'}
          </span>
          {closure?.summary && (
            <span className="font-mono text-xs text-zinc-400">
              {closure.summary}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
