'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  DEMO_EDGES,
  DEMO_NODES,
  GRAPH_H,
  GRAPH_W,
  isOnMatchPath,
  layout,
  MATCH_PATH,
  type DemoNodeKind,
} from '@/lib/demo-network';

export const INK = '#1c1c1a';
export const MUTED = '#8a8984';
export const TRUSTED = '#4f74d1';
export const DISCOVERED = '#b9b8b2';
export const ACCENT = '#e07a4f';

const RADIUS: Record<DemoNodeKind, number> = { start: 15, hop1: 10, hop2: 9, discovered: 7 };

interface Props {
  reveal: DemoNodeKind[];
  path: boolean;
  /** Changes per slide, so the travelling pulses replay. */
  pulseKey: string;
  pulse: 'none' | 'hop1' | 'hop2' | 'path';
}

export default function DemoGraph({ reveal, path, pulseKey, pulse }: Props) {
  const pos = useMemo(() => layout(), []);
  const shown = new Set(reveal);
  const kindOf = useMemo(() => new Map(DEMO_NODES.map((n) => [n.id, n.kind])), []);
  const svgRef = useRef<SVGSVGElement>(null);
  const visible = DEMO_NODES.filter((n) => shown.has(n.kind)).length;

  useEffect(() => {
    svgRef.current
      ?.querySelectorAll<SVGAnimationElement>('[data-pulse] animateMotion, [data-pulse] animate')
      .forEach((a) => a.beginElement());
  }, [pulseKey]);

  const delay = (id: string) => {
    const n = DEMO_NODES.find((d) => d.id === id)!;
    const same = DEMO_NODES.filter((d) => d.kind === n.kind);
    return same.indexOf(n) * 110 + (n.kind === 'discovered' ? 900 : 0);
  };

  const pulseEdges =
    pulse === 'hop1' || pulse === 'hop2'
      ? DEMO_EDGES.filter((e) => e.kind === 'trusted' && kindOf.get(e.to) === pulse)
      : [];
  const p = (id: string) => pos.get(id)!;
  const pathD = MATCH_PATH.map((id, i) => `${i ? 'L' : 'M'}${p(id).x} ${p(id).y}`).join(' ');

  return (
    <figure className="h-full w-full" aria-label="Demo-only network graph">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
        className="h-full w-full"
        role="img"
        aria-label={`Demo-only network: ${visible} of ${DEMO_NODES.length} agents visible. Jack is the start.`}
      >
        {DEMO_EDGES.map((e) => {
          const a = p(e.from);
          const b = p(e.to);
          const on = shown.has(kindOf.get(e.to)!);
          const t = { transitionDelay: `${on ? delay(e.to) : 0}ms` };
          return e.kind === 'trusted' ? (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={TRUSTED}
              strokeOpacity={0.55}
              strokeWidth={1.4}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={on ? 0 : 1}
              style={{ ...t, transitionProperty: 'stroke-dashoffset', transitionDuration: '900ms', transitionTimingFunction: 'ease-out' }}
            />
          ) : (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={DISCOVERED}
              strokeWidth={1.2}
              strokeDasharray="4 5"
              opacity={on ? 1 : 0}
              style={{ ...t, transitionProperty: 'opacity', transitionDuration: '700ms', transitionTimingFunction: 'ease-out' }}
            />
          );
        })}

        {DEMO_EDGES.filter(isOnMatchPath).map((e) => {
          const a = p(e.from);
          const b = p(e.to);
          return (
            <line
              key={`path-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={ACCENT}
              strokeWidth={3}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={path ? 0 : 1}
              style={{
                transitionProperty: 'stroke-dashoffset',
                transitionDuration: '1100ms',
                transitionTimingFunction: 'ease-in-out',
                transitionDelay: path && e.from !== 'jack' ? '700ms' : '0ms',
              }}
            />
          );
        })}

        <g data-pulse key={pulseKey}>
          {pulseEdges.map((e) => (
            <circle key={e.to} r={3.5} fill={TRUSTED} opacity={0}>
              <animateMotion
                begin="indefinite"
                dur="1.1s"
                fill="freeze"
                path={`M${p(e.from).x} ${p(e.from).y} L${p(e.to).x} ${p(e.to).y}`}
              />
              <animate attributeName="opacity" begin="indefinite" dur="1.3s" values="0;1;1;0" fill="freeze" />
            </circle>
          ))}
          {pulse === 'path' && (
            <circle r={5} fill={ACCENT}>
              <animateMotion begin="indefinite" dur="2.4s" repeatCount="indefinite" path={pathD} />
            </circle>
          )}
        </g>

        {DEMO_NODES.map((n) => {
          const { x, y } = p(n.id);
          const r = RADIUS[n.kind];
          const on = shown.has(n.kind);
          const lit = path && (MATCH_PATH as readonly string[]).includes(n.id);
          const start = n.kind === 'start';
          const label = start ? 'Jack — start' : n.name;
          return (
            <g key={n.id} transform={`translate(${x} ${y})`}>
              <g
                style={{
                  opacity: on ? 1 : 0,
                  transform: on ? 'scale(1)' : 'scale(0.4)',
                  transitionProperty: 'opacity, transform',
                  transitionDuration: '600ms',
                  transitionTimingFunction: 'ease-out',
                  transitionDelay: `${on ? delay(n.id) : 0}ms`,
                }}
              >
                <circle
                  r={r}
                  fill={start ? INK : lit ? ACCENT : '#f6f5f1'}
                  stroke={n.kind === 'discovered' ? DISCOVERED : lit ? ACCENT : INK}
                  strokeWidth={n.kind === 'discovered' ? 1.2 : 1.6}
                  strokeDasharray={n.kind === 'discovered' ? '2.5 2.5' : undefined}
                  style={{ transition: 'fill 600ms, stroke 600ms' }}
                />
                <text
                  y={r + 17}
                  textAnchor="middle"
                  fontFamily="var(--font-geist-mono), ui-monospace, monospace"
                  fontSize={start ? 17 : n.kind === 'discovered' ? 12 : 14}
                  fontWeight={start || lit ? 700 : 400}
                  fill={lit ? ACCENT : n.kind === 'discovered' ? DISCOVERED : start ? INK : '#4a4a46'}
                  style={{ transition: 'fill 600ms' }}
                >
                  {label}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        <ul>
          {DEMO_NODES.map((n) => (
            <li key={n.id}>
              {n.kind === 'start'
                ? 'Jack — start'
                : n.kind === 'discovered'
                  ? `${n.name}: discovered via ${n.via}, never asked`
                  : `${n.name}: trusted, asked via ${n.via}`}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
