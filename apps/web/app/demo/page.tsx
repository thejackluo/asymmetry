'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DemoCanvas, { PALETTE } from '@/components/DemoCanvas';
import { DEMO_LINK_GROUPS, DEMO_TEAM } from '@/lib/demo-links';
import { DEMO_NODES } from '@/lib/demo-network';

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="h-screen" style={{ background: PALETTE.bg }} />}>
      <Demo />
    </Suspense>
  );
}

const KIND_LABEL = {
  start: 'start',
  hop1: 'trusted friend',
  hop2: 'friend of a friend',
  discovered: 'discovered, never asked',
} as const;

function Demo() {
  const params = useSearchParams();
  const tSec = Number(params.get('t') ?? NaN);
  const tParam = Number.isFinite(tSec) && tSec >= 0 ? tSec : null;
  const [frozenAt, setFrozenAt] = useState<number | null>(() =>
    tParam != null
      ? tParam * 1000
      : typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 9000
        : null,
  );
  const [paused, setPaused] = useState(false);
  const [links, setLinks] = useState(false);
  const [ended, setEnded] = useState(false);
  const [replayKey, setReplayKey] = useState(0);

  const replay = () => {
    setFrozenAt(null);
    setEnded(false);
    setPaused(false);
    setReplayKey((k) => k + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLinks(false);
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
      if (e.key === 'r') replay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main
      className="relative h-screen w-full select-none overflow-hidden font-mono"
      style={{ background: PALETTE.bg, color: PALETTE.ink }}
      onClick={() => (ended ? replay() : setPaused((p) => !p))}
    >
      <DemoCanvas paused={paused || links} frozenAt={frozenAt} replayKey={replayKey} onEnd={() => setEnded(true)} />

      <ul className="sr-only">
        {DEMO_NODES.map((n) => (
          <li key={n.id}>
            {n.label}: {KIND_LABEL[n.kind]}
          </li>
        ))}
      </ul>

      <button
        className="absolute right-[3%] top-[4%] text-xs opacity-60 hover:opacity-100"
        style={{ color: PALETTE.muted }}
        onClick={(e) => (e.stopPropagation(), setLinks(true))}
      >
        links
      </button>

      <div
        className="pointer-events-none absolute bottom-[4%] left-[3%] flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] opacity-60"
        style={{ color: PALETTE.muted }}
      >
        <span className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" y1="3" x2="20" y2="3" stroke={PALETTE.trusted} strokeWidth="1.6" />
          </svg>
          trusted
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" y1="3" x2="20" y2="3" stroke={PALETTE.discovered} strokeWidth="1.4" strokeDasharray="3 4" />
          </svg>
          discovered · never asked
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden>
            <line x1="0" y1="3" x2="20" y2="3" stroke={PALETTE.accent} strokeWidth="2.4" />
          </svg>
          match
        </span>
        <span>demo network · illustrative</span>
      </div>

      {ended && (
        <div className="absolute bottom-[4%] right-[3%] text-xs opacity-60" style={{ color: PALETTE.muted }}>
          click to replay
        </div>
      )}

      {links && <LinksOverlay onClose={() => setLinks(false)} />}
    </main>
  );
}

function LinksOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Links"
      className="absolute inset-0 z-10 overflow-y-auto px-[7%] py-[6%]"
      style={{ background: 'rgba(5,6,10,0.96)', color: PALETTE.ink }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          asymmetry<span style={{ color: PALETTE.accent }}>.</span>
        </h2>
        <button className="text-sm hover:underline" style={{ color: PALETTE.muted }} onClick={onClose}>
          close ✕
        </button>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: PALETTE.muted }}>
        Personal agents that talk to each other across your trusted network. This page runs entirely in the browser.
        The network is illustrative and the housing story mirrors the seeded sublet in apps/server/src/seed.ts.
      </p>
      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_LINK_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-xs uppercase tracking-widest" style={{ color: PALETTE.muted }}>
              {g.title}
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer" className="hover:underline">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-xs uppercase tracking-widest" style={{ color: PALETTE.muted }}>
            Team
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {DEMO_TEAM.map((m) => (
              <li key={m.href}>
                <a href={m.href} target="_blank" rel="noreferrer" className="hover:underline">
                  {m.label} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
