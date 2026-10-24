'use client';

import type { Agent, NetworkPayload } from '@/lib/types';

// Plain canvas: own agent center, peers on a ring.
// Solid edge = trusted, dashed = discovered. Text list below is the
// accessible equivalent of the graph relationships.
export default function NetworkGraph({
  network,
  myAgentId,
}: {
  network: NetworkPayload;
  myAgentId: string | null;
}) {
  const { agents, trusted, discovered } = network;
  const peers = agents.filter((a) => a.id !== myAgentId);
  const me = agents.find((a) => a.id === myAgentId);
  const displayName = (name: string) => name.replace(/['’]s Agent$/i, '');

  const W = 720;
  const H = 440;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 80;

  const pos = new Map<string, { x: number; y: number }>();
  peers.forEach((a, i) => {
    const angle = (2 * Math.PI * i) / Math.max(peers.length, 1) - Math.PI / 2;
    pos.set(a.id, { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
  });

  const edgeFor = (a: Agent): 'trusted' | 'discovered' | null => {
    if (trusted.includes(a.id)) return 'trusted';
    if (discovered.includes(a.id)) return 'discovered';
    return null;
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="max-h-full w-full max-w-3xl"
        role="img"
        aria-label={`Agent network: ${trusted.length} trusted, ${discovered.length} discovered`}
      >
        {peers.map((a) => {
          const p = pos.get(a.id)!;
          const kind = edgeFor(a);
          if (!kind) return null;
          return (
            <line
              key={`e-${a.id}`}
              x1={cx}
              y1={cy}
              x2={p.x}
              y2={p.y}
              stroke={kind === 'trusted' ? '#0a84ff' : '#94a3b8'}
              strokeWidth={kind === 'trusted' ? 1.5 : 1}
              strokeDasharray={kind === 'discovered' ? '5 5' : undefined}
              opacity={0.8}
            />
          );
        })}
        {peers.map((a) => {
          const p = pos.get(a.id)!;
          const kind = edgeFor(a);
          return (
            <g key={a.id} transform={`translate(${p.x},${p.y})`}>
              <circle
                r={30}
                fill="#ffffff"
                stroke={kind === 'trusted' ? '#0a84ff' : kind === 'discovered' ? '#94a3b8' : '#d4d4d4'}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                dy={4}
                fill="#171717"
                fontSize={11}
                fontFamily="sans-serif"
              >
                {displayName(a.name)}
              </text>
              <text
                textAnchor="middle"
                y={44}
                fill="#525252"
                fontSize={10}
                fontFamily="sans-serif"
              >
                {kind ?? 'known'}
              </text>
            </g>
          );
        })}
        <g transform={`translate(${cx},${cy})`}>
          <circle r={38} fill="#eaf4ff" stroke="#0a84ff" strokeWidth={2} />
          <text
            textAnchor="middle"
            dy={4}
            fill="#0a84ff"
            fontSize={12}
            fontFamily="sans-serif"
            fontWeight={600}
          >
            {me ? displayName(me.name) : 'You'}
          </text>
        </g>
      </svg>
      <div className="mt-3 flex items-center gap-6 text-xs text-neutral-500">
        <span>
          <span className="text-[#0a84ff]">——</span> trusted ({trusted.length})
        </span>
        <span>
          <span className="text-slate-400">- - -</span> discovered (
          {discovered.length})
        </span>
      </div>
      {/* accessible text equivalent of the graph */}
      <ul className="sr-only">
        {peers.map((a) => (
          <li key={`l-${a.id}`}>
            {a.name}: {edgeFor(a) ?? 'known'}
          </li>
        ))}
      </ul>
    </div>
  );
}
