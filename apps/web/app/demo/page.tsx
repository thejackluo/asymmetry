'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import DemoGraph from '@/components/DemoGraph';
import { DEMO_LINK_GROUPS, DEMO_TEAM } from '@/lib/demo-links';
import {
  askedNodes,
  BOB_RELEASED,
  BOB_WITHHELD_COUNT,
  countByKind,
  DEMO_NODES,
  DEMO_REQUEST,
  DEMO_SCOPE,
  DEMO_STEPS,
  DEMO_TOTAL_MS,
  JACK_PRIVATE_WITHHELD,
  JACK_SHARED_FACTS,
  type DemoNodeKind,
  type DemoStepId,
} from '@/lib/demo-network';

const clampStep = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= DEMO_STEPS.length ? n - 1 : 0;
};

const byId = new Map(DEMO_NODES.map((n) => [n.id, n]));
const fmtSecs = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

export default function DemoPage() {
  return (
    <Suspense fallback={null}>
      <Demo />
    </Suspense>
  );
}

function Demo() {
  const params = useSearchParams();
  const [idx, setIdx] = useState(() => clampStep(params.get('step')));
  const [playing, setPlaying] = useState(() => params.get('autoplay') === '1');
  const step = DEMO_STEPS[idx];
  const last = DEMO_STEPS.length - 1;

  const go = useCallback((next: number) => setIdx(Math.max(0, Math.min(last, next))), [last]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= last) {
      const t = setTimeout(() => setPlaying(false), step.durationMs);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setIdx((i) => i + 1), step.durationMs);
    return () => clearTimeout(t);
  }, [playing, idx, last, step.durationMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setPlaying(false);
        setIdx((i) => Math.min(last, i + 1));
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        setIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last]);

  const at = (id: DemoStepId) => DEMO_STEPS.findIndex((s) => s.id === id);
  const active: DemoNodeKind | null = step.id === 'hop1' ? 'hop1' : step.id === 'hop2' ? 'hop2' : null;

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
              Asymmetry · 2nd place, Devin Hackathon @ HackerHouse GT
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              Your agent finds what your network already has
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-600">
              Jack needs a summer sublet. His agent asks his trusted network, two hops out, and finds Bob through
              Carol. Only scoped facts are shared. Follow the 7 steps (about {fmtSecs(DEMO_TOTAL_MS)} on autoplay).
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <a href="#links" className="rounded-md px-3 py-1.5 text-neutral-600 hover:text-neutral-900">
              Links &amp; credits
            </a>
            <Link
              href="/login"
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-neutral-700 hover:border-neutral-400"
            >
              Try the mock app
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
          <DemoGraph
            reveal={step.reveal}
            matchFound={idx >= at('match')}
            introDone={idx >= at('intro')}
            active={active}
          />
          <p className="mt-2 text-center text-[11px] text-neutral-500">
            {DEMO_NODES.length} agents: 1 start (Jack) · {countByKind('hop1')} trusted friends · {countByKind('hop2')}{' '}
            friends of friends · {countByKind('discovered')} discovered, never asked
          </p>
        </section>

        <section className="flex flex-col gap-4">
          <ol className="grid grid-cols-7 gap-1" aria-label="Demo steps">
            {DEMO_STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setPlaying(false);
                    go(i);
                  }}
                  aria-current={i === idx ? 'step' : undefined}
                  title={s.title}
                  className={`h-1.5 w-full rounded-full transition ${i < idx ? 'bg-blue-600' : i === idx ? 'bg-blue-400' : 'bg-neutral-200'}`}
                >
                  <span className="sr-only">
                    Step {i + 1}: {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="font-mono text-xs text-neutral-500">
              Step {idx + 1} of {DEMO_STEPS.length}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{step.title}</h2>
            <p className="mt-1 text-sm text-neutral-600">{step.caption}</p>
            {playing && (
              <div className="mt-3 h-0.5 overflow-hidden rounded bg-neutral-100">
                <div key={idx} className="demo-progress h-full bg-blue-500" style={{ animationDuration: `${step.durationMs}ms` }} />
              </div>
            )}
            <div className="mt-4">
              <StepBody id={step.id} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPlaying(false);
                go(idx - 1);
              }}
              disabled={idx === 0}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 disabled:opacity-40"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                if (!playing && idx === last) setIdx(0);
                setPlaying((p) => !p);
              }}
              className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700"
            >
              {playing ? 'Pause' : idx === last ? 'Replay' : 'Autoplay'}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                go(idx + 1);
              }}
              disabled={idx === last}
              className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">Tip: use ← / → keys. Share a step with ?step=4.</p>
        </section>
      </div>

      <WhyItMatters />
      <LinksSection />
    </main>
  );
}

function Bubble({ who, tone, children }: { who: string; tone: 'human' | 'agent' | 'peer'; children: ReactNode }) {
  const cls =
    tone === 'human'
      ? 'ml-8 bg-blue-600 text-white'
      : tone === 'agent'
        ? 'mr-8 bg-neutral-100 text-neutral-900'
        : 'mr-8 border border-emerald-200 bg-emerald-50 text-emerald-950';
  return (
    <div className={`rounded-lg px-3 py-2 text-sm ${cls}`}>
      <p className={`text-[11px] font-semibold ${tone === 'human' ? 'text-blue-100' : 'text-neutral-500'}`}>{who}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700">{children}</code>;
}

function Withheld({ count, note }: { count: number; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2">
      <span className="font-mono text-xl font-semibold text-neutral-700">{count}</span>
      <span className="text-xs text-neutral-600">{note}</span>
    </div>
  );
}

function StepBody({ id }: { id: DemoStepId }) {
  switch (id) {
    case 'ask':
      return (
        <div className="space-y-2">
          <Bubble who="Jack" tone="human">
            {DEMO_REQUEST}
          </Bubble>
          <Bubble who="Jack’s agent" tone="agent">
            On it. I’ll ask your trusted network and share only what this request needs.
          </Bubble>
        </div>
      );
    case 'scope':
      return (
        <div className="space-y-3">
          <p className="font-mono text-[11px] text-neutral-500">
            info_request {'{'} scope: [{DEMO_SCOPE.map((s) => `'${s}'`).join(', ')}] {'}'}
          </p>
          <div>
            <p className="mb-1 text-xs font-semibold text-neutral-700">Shared with the network (scoped)</p>
            <ul className="space-y-1">
              {JACK_SHARED_FACTS.map((f) => (
                <li key={f.field} className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-1.5 text-sm">
                  <span>{f.value}</span>
                  <Tag>{f.field}</Tag>
                </li>
              ))}
            </ul>
          </div>
          <Withheld count={JACK_PRIVATE_WITHHELD} note="private facts withheld. They never leave Jack’s agent." />
        </div>
      );
    case 'hop1': {
      const friends = DEMO_NODES.filter((n) => n.kind === 'hop1');
      return (
        <div>
          <p className="mb-2 text-xs text-neutral-500">
            {friends.length} subchats opened · 0 matches · same scope for everyone
          </p>
          <ul className="space-y-1">
            {friends.map((n) => (
              <li key={n.id} className="flex gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-sm">
                <span className="w-28 shrink-0 font-medium text-blue-700">{n.name}’s agent</span>
                <span className="text-neutral-600">{n.reply}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case 'hop2': {
      const fof = DEMO_NODES.filter((n) => n.kind === 'hop2');
      const disc = DEMO_NODES.filter((n) => n.kind === 'discovered');
      return (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">
            {askedNodes().length} agents asked in total · {disc.length} discovered, never asked
          </p>
          <ul className="grid grid-cols-2 gap-1">
            {fof.map((n) => (
              <li key={n.id} className="rounded-md border border-neutral-200 px-2 py-1 text-xs">
                <span className="font-medium text-blue-700">{n.name}</span>
                <span className="text-neutral-400"> via {byId.get(n.via!)?.name}</span>
                <span className="block truncate text-neutral-600">{n.id === 'bob' ? 'Checking…' : n.reply}</span>
              </li>
            ))}
          </ul>
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <span className="font-semibold">Discovered:</span>{' '}
            {disc.map((n) => `${n.name} (seen in ${byId.get(n.via!)?.name}’s subchat)`).join(', ')}. Discovery does not
            grant trust, so these agents are never sent Jack’s request.
          </div>
        </div>
      );
    }
    case 'match':
      return (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">Bob’s agent → Jack’s agent, relayed by Carol’s agent</p>
          <div>
            <p className="mb-1 text-xs font-semibold text-emerald-800">Released (in scope)</p>
            <ul className="space-y-1">
              {BOB_RELEASED.map((f) => (
                <li key={f.field} className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm">
                  <span>{f.value}</span>
                  <Tag>{f.field}</Tag>
                </li>
              ))}
            </ul>
          </div>
          <Withheld count={BOB_WITHHELD_COUNT} note="facts withheld. Jack’s agent sees the count, never the content." />
        </div>
      );
    case 'intro':
      return (
        <div className="space-y-2">
          <Bubble who="Jack’s agent → Carol’s agent" tone="agent">
            Jack would like an intro to Bob about the sublet. OK to connect them?
          </Bubble>
          <Bubble who="Carol (approves) · Bob (opts in)" tone="peer">
            Carol: “Jack, meet Bob. Bob has the room near GT you’re looking for. Bob, meet Jack.”
          </Bubble>
          <Bubble who="Jack’s agent → Jack" tone="agent">
            Found it: a room 0.4mi from GT, $950/mo, May 15–Aug 10. Carol introduced you to Bob. Bob shares his exact
            address and contact details himself, when he chooses.
          </Bubble>
        </div>
      );
    case 'why':
      return (
        <div className="space-y-2 text-sm text-neutral-700">
          <p>
            Agents will not just help us one at a time. They will work with other people’s agents to find
            opportunities we would otherwise miss, with consent and scoped sharing.
          </p>
          <p className="text-neutral-500">Scroll down for the principles, links and credits.</p>
        </div>
      );
  }
}

function WhyItMatters() {
  const points = [
    ['Opportunities hide in your network', 'Jack never knew Bob. The room was two hops away the whole time.'],
    ['Consent at every hop', 'Requests only travel along trusted connections, and the intro goes through Carol.'],
    ['Scoped, not filtered', 'Peers release only facts in scope. Private facts never go to a peer; others see counts.'],
    ['Discovery is not trust', 'Agents seen along the way are shown, but never asked.'],
  ];
  return (
    <section className="border-t border-neutral-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h2 className="text-lg font-semibold">Why this matters</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Today our assistants work alone. Next, agents will work with other people’s agents to find the sublet, the
          job, the buyer or the intro that nobody would have found by asking around, with consent and scoped sharing
          at every step.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {points.map(([t, d]) => (
            <div key={t} className="rounded-lg border border-neutral-200 p-4">
              <p className="text-sm font-semibold">{t}</p>
              <p className="mt-1 text-xs text-neutral-600">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LinksSection() {
  return (
    <section id="links" className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h2 className="text-lg font-semibold">Links · About · Credits</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-600">
          Asymmetry was built in 5 hours by four people running four Devins in parallel at the Devin Hackathon at
          HackerHouse @ Georgia Tech, where it took 2nd place. This walkthrough runs entirely in the browser with no
          backend or API key; the network graph is demo-only and the housing story mirrors the seeded Alice ↔ Bob
          sublet in <code className="font-mono text-xs">apps/server/src/seed.ts</code>.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {DEMO_LINK_GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{g.title}</h3>
              <ul className="mt-2 space-y-1.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Team</h3>
            <ul className="mt-2 space-y-1.5">
              {DEMO_TEAM.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
