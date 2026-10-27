'use client';

import {
  DEMO_EDGES,
  DEMO_NODES,
  GRAPH_H,
  GRAPH_W,
  INTRODUCER,
  isOnMatchPath,
  layout,
  MATCH_PATH,
  R1,
  R2,
  type DemoNode,
  type DemoNodeKind,
} from '@/lib/demo-network';

const BLUE = '#2563eb';
const GREY = '#94a3b8';
const MATCH = '#10b981';

const RADIUS: Record<DemoNodeKind, number> = { start: 40, hop1: 28, hop2: 23, discovered: 18 };
const POS = layout();

// Order within a ring, used to stagger nodes so the search visibly spreads.
const ORDER = new Map(DEMO_NODES.map((n) => [n.id, DEMO_NODES.filter((m) => m.kind === n.kind).indexOf(n)]));

export default function DemoGraph({
  reveal,
  matchFound,
  introDone,
  active,
}: {
  reveal: DemoNodeKind[];
  matchFound: boolean;
  introDone: boolean;
  /** Ring currently being asked; its edges pulse. */
  active: DemoNodeKind | null;
}) {
  const shown = (n: DemoNode) => reveal.includes(n.kind);
  const byId = new Map(DEMO_NODES.map((n) => [n.id, n]));
  const delay = (n: DemoNode) =>
    n.kind === 'start' ? 0 : (ORDER.get(n.id) ?? 0) * (n.kind === 'discovered' ? 450 : 160) + (n.kind === 'discovered' ? 1600 : 0);

  const labelFor = (n: DemoNode) => {
    if (n.id === MATCH_PATH[2] && matchFound) return 'Bob — match';
    if (n.id === INTRODUCER && introDone) return 'Carol — intro';
    return n.label;
  };

  const visibleCount = DEMO_NODES.filter(shown).length;

  return (
    <figure className="relative w-full">
      <div className="absolute left-3 top-3 z-10 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
        Demo-only network · illustrative
      </div>
      <div className="absolute right-3 top-3 z-10 rounded-full border border-neutral-200 bg-white/90 px-2.5 py-0.5 font-mono text-[11px] text-neutral-600">
        {visibleCount} / {DEMO_NODES.length} agents
      </div>
      <svg
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Demo network of ${DEMO_NODES.length} agents starting at Jack. Match path Jack to Carol to Bob.`}
      >
        <circle cx={GRAPH_W / 2} cy={GRAPH_H / 2} r={R1} fill="none" stroke="#e5e7eb" strokeDasharray="2 6" />
        <circle cx={GRAPH_W / 2} cy={GRAPH_H / 2} r={R2} fill="none" stroke="#e5e7eb" strokeDasharray="2 6" />

        {DEMO_EDGES.map((e) => {
          const to = byId.get(e.to)!;
          const a = POS.get(e.from)!;
          const b = POS.get(e.to)!;
          const visible = shown(to);
          const onPath = matchFound && isOnMatchPath(e);
          const pulsing = active !== null && to.kind === active;
          return (
            <g
              key={`${e.from}-${e.to}`}
              style={{ opacity: visible ? 1 : 0, transitionDelay: visible ? `${delay(to)}ms` : '0ms' }}
              className="transition-opacity duration-700"
            >
              {onPath && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MATCH} strokeWidth={10} strokeLinecap="round" opacity={0.35} />
              )}
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={e.kind === 'trusted' ? BLUE : GREY}
                strokeWidth={e.kind === 'trusted' ? (onPath ? 3 : 1.6) : 1.4}
                strokeDasharray={e.kind === 'discovered' ? '6 5' : undefined}
                className={pulsing ? 'demo-edge-pulse' : undefined}
              />
            </g>
          );
        })}

        {DEMO_NODES.map((n) => {
          const p = POS.get(n.id)!;
          const r = RADIUS[n.kind];
          const visible = shown(n);
          const isMatch = n.id === MATCH_PATH[2] && matchFound;
          const isIntro = n.id === INTRODUCER && introDone;
          const fill =
            n.kind === 'start' ? '#1d4ed8' : isMatch ? '#ecfdf5' : n.kind === 'discovered' ? '#f8fafc' : '#ffffff';
          const stroke = n.kind === 'discovered' ? GREY : isMatch || isIntro ? MATCH : BLUE;
          const label = labelFor(n);
          const labelY = r + 16;
          const labelAbove = n.kind === 'hop2' && p.y < GRAPH_H / 2;
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              style={{ opacity: visible ? 1 : 0, transitionDelay: visible ? `${delay(n)}ms` : '0ms' }}
              className="transition-opacity duration-700"
            >
              {(isMatch || n.kind === 'start') && (
                <circle r={r + 7} fill="none" stroke={isMatch ? MATCH : BLUE} strokeOpacity={0.3} strokeWidth={4} />
              )}
              <circle
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={n.kind === 'start' ? 0 : isMatch || isIntro ? 3 : 1.6}
                strokeDasharray={n.kind === 'discovered' ? '4 3' : undefined}
              />
              <text
                textAnchor="middle"
                dy={4}
                fill={n.kind === 'start' ? '#ffffff' : n.kind === 'discovered' ? '#64748b' : '#0f172a'}
                fontSize={n.kind === 'start' ? 16 : n.kind === 'discovered' ? 11 : n.kind === 'hop1' ? 13 : 12}
                fontWeight={n.kind === 'start' ? 700 : 600}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {n.name}
              </text>
              {n.kind === 'start' ? (
                <g transform={`translate(0,${labelY + 6})`}>
                  <rect x={-60} y={-14} width={120} height={25} rx={12.5} fill="#1e3a8a" />
                  <text textAnchor="middle" dy={4} fill="#ffffff" fontSize={14} fontWeight={700} fontFamily="ui-sans-serif, system-ui, sans-serif">
                    {label}
                  </text>
                </g>
              ) : label !== n.name ? (
                <text
                  textAnchor="middle"
                  y={labelAbove ? -r - 14 : labelY}
                  fill={MATCH === stroke ? '#047857' : '#334155'}
                  fontSize={13}
                  fontWeight={700}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {label}
                </text>
              ) : n.kind === 'discovered' ? (
                <text textAnchor="middle" y={labelY} fill="#94a3b8" fontSize={10} fontFamily="ui-sans-serif, system-ui, sans-serif">
                  never asked
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-neutral-600">
        <span className="flex items-center gap-1.5">
          <svg width="28" height="8" aria-hidden>
            <line x1="0" y1="4" x2="28" y2="4" stroke={BLUE} strokeWidth="2" />
          </svg>
          Trusted (asked with consent)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="28" height="8" aria-hidden>
            <line x1="0" y1="4" x2="28" y2="4" stroke={GREY} strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Discovered (never asked)
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="28" height="10" aria-hidden>
            <line x1="0" y1="5" x2="28" y2="5" stroke={MATCH} strokeWidth="8" strokeOpacity="0.35" strokeLinecap="round" />
            <line x1="0" y1="5" x2="28" y2="5" stroke={BLUE} strokeWidth="2.5" />
          </svg>
          Match path Jack → Carol → Bob
        </span>
      </figcaption>

      <ul className="sr-only">
        {DEMO_NODES.map((n) => (
          <li key={`l-${n.id}`}>
            {n.label}: {n.kind === 'start' ? 'start' : n.kind === 'discovered' ? `discovered via ${n.via}, never asked` : `trusted, reached via ${n.via}`}
          </li>
        ))}
      </ul>
    </figure>
  );
}
