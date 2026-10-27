'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DemoGraph, { ACCENT, DISCOVERED, INK, MUTED, TRUSTED } from '@/components/DemoGraph';
import { DEMO_LINK_GROUPS, DEMO_TEAM } from '@/lib/demo-links';
import { BOB_WITHHELD_COUNT, DEMO_STEPS, JACK_PRIVATE_WITHHELD } from '@/lib/demo-network';

const BG = '#f6f5f1';

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="h-screen" style={{ background: BG }} />}>
      <Slideshow />
    </Suspense>
  );
}

function Slideshow() {
  const params = useSearchParams();
  const fromParam = Number(params.get('step'));
  const initial = fromParam >= 1 && fromParam <= DEMO_STEPS.length ? fromParam - 1 : 0;
  const [index, setIndex] = useState(initial);
  const [paused, setPaused] = useState(Boolean(params.get('step')));
  const [links, setLinks] = useState(false);
  const remaining = useRef({ i: initial, ms: DEMO_STEPS[initial].durationMs });
  const last = DEMO_STEPS.length - 1;
  const step = DEMO_STEPS[index];

  const go = useCallback((i: number) => {
    const next = Math.max(0, Math.min(DEMO_STEPS.length - 1, i));
    remaining.current = { i: next, ms: DEMO_STEPS[next].durationMs };
    setIndex(next);
  }, []);

  useEffect(() => {
    if (paused || links || index === last) return;
    const started = Date.now();
    const t = setTimeout(() => go(index + 1), remaining.current.ms);
    return () => {
      clearTimeout(t);
      if (remaining.current.i === index) remaining.current.ms -= Date.now() - started;
    };
  }, [index, paused, links, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLinks(false);
      if (links) return;
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, links, go]);

  const graphMode = step.kind === 'graph';
  const pulse =
    step.id === 'hop1' ? 'hop1' : step.id === 'hop2' ? 'hop2' : step.id === 'intro' ? 'path' : 'none';

  return (
    <main
      className="relative h-screen w-full select-none overflow-hidden font-mono"
      style={{ background: BG, color: INK }}
      onClick={() => (index === last ? undefined : go(index + 1))}
    >
      <div
        className={`absolute transition-all duration-1000 ease-in-out ${
          graphMode
            ? 'inset-x-0 bottom-[8%] top-[34%] opacity-100 md:inset-y-[5%] md:left-[40%] md:right-[3%]'
            : 'inset-0 opacity-[0.07] blur-[1px]'
        }`}
        aria-hidden={!graphMode}
      >
        <DemoGraph reveal={step.reveal} path={Boolean(step.path)} pulseKey={step.id} pulse={pulse} />
      </div>

      <section
        key={step.id}
        aria-live="polite"
        className={`pointer-events-none absolute flex flex-col ${
          graphMode
            ? 'inset-x-[7%] top-[9%] md:inset-y-0 md:left-[7%] md:right-auto md:w-[36%] md:justify-center'
            : 'inset-0 items-center justify-center px-8 text-center'
        }`}
      >
        {step.kind === 'title' ? (
          <>
            <h1 className="demo-in text-6xl font-extrabold tracking-tight md:text-8xl">{step.title}</h1>
            <p className="demo-in demo-in-2 mt-6 text-xl md:text-3xl" style={{ color: MUTED }}>
              {step.sub}
              <span style={{ color: ACCENT }}>.</span>
            </p>
          </>
        ) : (
          <>
            <h2
              className={`demo-in font-bold tracking-tight ${
                graphMode ? 'text-3xl leading-tight md:text-[2.6rem]' : 'max-w-4xl text-4xl leading-tight md:text-6xl'
              }`}
            >
              {step.title}
            </h2>
            {step.sub && (
              <p
                className={`demo-in demo-in-2 mt-5 leading-relaxed ${graphMode ? 'text-base md:text-lg' : 'max-w-2xl text-lg md:text-2xl'}`}
                style={{ color: MUTED }}
              >
                {step.id === 'ask' ? `“${step.sub}”` : step.sub}
              </p>
            )}
            {step.id === 'scope' && (
              <div className="demo-in demo-in-3 mt-6 flex flex-wrap gap-2 text-sm">
                {['location_area', 'price', 'dates'].map((f) => (
                  <span key={f} className="rounded-full border px-3 py-1" style={{ borderColor: TRUSTED, color: TRUSTED }}>
                    {f}
                  </span>
                ))}
                <span className="rounded-full border border-dashed px-3 py-1" style={{ borderColor: DISCOVERED, color: MUTED }}>
                  {JACK_PRIVATE_WITHHELD} private · withheld
                </span>
              </div>
            )}
            {step.id === 'match' && (
              <p className="demo-in demo-in-3 mt-6 text-sm" style={{ color: MUTED }}>
                <span style={{ color: ACCENT }}>●</span> {BOB_WITHHELD_COUNT} of Bob’s facts withheld. Jack sees the count,
                never the content.
              </p>
            )}
          </>
        )}
        {index === last && (
          <div className="demo-in demo-in-3 pointer-events-auto mt-10 flex gap-6 text-sm" style={{ color: MUTED }}>
            <button className="hover:underline" onClick={(e) => (e.stopPropagation(), go(0), setPaused(false))}>
              ↺ replay
            </button>
            <button className="hover:underline" onClick={(e) => (e.stopPropagation(), setLinks(true))}>
              links
            </button>
            <a
              className="hover:underline"
              href="https://github.com/thejackluo/asymmetry"
              onClick={(e) => e.stopPropagation()}
            >
              github
            </a>
          </div>
        )}
      </section>

      {step.kind !== 'title' && (
        <div className="absolute left-[3%] top-[4%] text-sm font-bold tracking-tight">
          asymmetry<span style={{ color: ACCENT }}>.</span>
        </div>
      )}
      <button
        className="absolute right-[3%] top-[4%] text-xs hover:underline"
        style={{ color: MUTED }}
        onClick={(e) => (e.stopPropagation(), setLinks(true))}
      >
        links
      </button>

      <div
        className={`absolute bottom-[4%] left-[3%] flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] transition-opacity duration-700 ${
          graphMode ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ color: MUTED }}
      >
        <span className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke={TRUSTED} strokeWidth="1.6" />
          </svg>
          trusted
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke={DISCOVERED} strokeWidth="1.4" strokeDasharray="4 4" />
          </svg>
          discovered · never asked
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <line x1="0" y1="3" x2="22" y2="3" stroke={ACCENT} strokeWidth="3" />
          </svg>
          match
        </span>
        <span>demo network · illustrative</span>
      </div>

      <div className="absolute bottom-[4%] right-[3%] flex items-center gap-4 text-xs" style={{ color: MUTED }}>
        <button aria-label="Previous" onClick={(e) => (e.stopPropagation(), go(index - 1))}>
          ←
        </button>
        <button
          aria-label={paused ? 'Play' : 'Pause'}
          onClick={(e) => (e.stopPropagation(), setPaused((p) => !p))}
          className="w-10"
        >
          {paused ? 'play' : 'pause'}
        </button>
        <button aria-label="Next" onClick={(e) => (e.stopPropagation(), go(index + 1))}>
          →
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-[3px] gap-[3px]">
        {DEMO_STEPS.map((s, i) => (
          <div key={s.id} className="h-full flex-1" style={{ background: '#e4e3de' }}>
            <div
              key={i === index ? `on-${index}` : 'off'}
              className={i === index ? 'demo-progress h-full' : 'h-full'}
              style={{
                background: INK,
                width: i < index ? '100%' : i === index ? undefined : '0%',
                animationDuration: `${s.durationMs}ms`,
                animationPlayState: paused || links || index === last ? 'paused' : 'running',
                ...(i === index && index === last ? { width: '100%', animation: 'none' } : {}),
              }}
            />
          </div>
        ))}
      </div>

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
      style={{ background: 'rgba(246,245,241,1)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          asymmetry<span style={{ color: ACCENT }}>.</span>
        </h2>
        <button className="text-sm hover:underline" style={{ color: MUTED }} onClick={onClose}>
          close ✕
        </button>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: MUTED }}>
        Personal agents that talk to each other across your trusted network. This page runs entirely in the browser.
        The network is illustrative and the housing story mirrors the seeded sublet in apps/server/src/seed.ts.
      </p>
      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_LINK_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
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
          <h3 className="text-xs uppercase tracking-widest" style={{ color: MUTED }}>
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
