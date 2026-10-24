'use client';

import type { Agent, NetworkPayload } from '@/lib/types';

// Hand-rolled SVG: own agent at center, peers on a ring.
// solid edge = trusted, dashed+glow = discovered (derived, not stored).
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

  const W = 720;
  const H = 520;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 90;

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
        aria-label="agent network graph"
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
              stroke={kind === 'trusted' ? '#34d399' : '#f59e0b'}
              strokeWidth={kind === 'trusted' ? 2 : 1.5}
              strokeDasharray={kind === 'discovered' ? '6 6' : undefined}
              opacity={kind === 'trusted' ? 0.7 : 0.9}
              className={kind === 'discovered' ? 'animate-pulse' : undefined}
            />
          );
        })}
        {peers.map((a) => {
          const p = pos.get(a.id)!;
          const kind = edgeFor(a);
          const color = kind === 'trusted' ? '#34d399' : '#f59e0b';
          return (
            <g key={a.id} transform={`translate(${p.x},${p.y})`}>
              <circle
                r={34}
                fill="#18181b"
                stroke={kind ? color : '#3f3f46'}
                strokeWidth={2}
              />
              <text
                textAnchor="middle"
                dy={-2}
                fill="#e4e4e7"
                fontSize={11}
                fontFamily="monospace"
              >
                🤖
              </text>
              <text
                textAnchor="middle"
                dy={14}
                fill="#a1a1aa"
                fontSize={10}
                fontFamily="monospace"
              >
                {a.name.split(' ')[0]}
              </text>
              <text
                textAnchor="middle"
                y={52}
                fill={kind === 'discovered' ? '#f59e0b' : '#71717a'}
                fontSize={10}
                fontFamily="monospace"
              >
                {kind ?? 'known'}
              </text>
            </g>
          );
        })}
        {/* own agent at center */}
        <g transform={`translate(${cx},${cy})`}>
          <circle
            r={44}
            fill="#052e22"
            stroke="#34d399"
            strokeWidth={3}
            className="animate-pulse"
            style={{ animationDuration: '3s' }}
          />
          <circle r={44} fill="none" stroke="#34d399" strokeWidth={1} opacity={0.3}>
            <animate attributeName="r" from="44" to="60" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
          <text
            textAnchor="middle"
            dy={-2}
            fill="#34d399"
            fontSize={13}
            fontFamily="monospace"
            fontWeight="bold"
          >
            🤖
          </text>
          <text
            textAnchor="middle"
            dy={14}
            fill="#a7f3d0"
            fontSize={10}
            fontFamily="monospace"
          >
            {me?.name ?? 'you'}
          </text>
        </g>
      </svg>
      <div className="mt-4 flex items-center gap-6 font-mono text-xs text-zinc-500">
        <span>
          <span className="text-emerald-400">——</span> trusted ({trusted.length})
        </span>
        <span>
          <span className="text-amber-400">┄┄</span> discovered (
          {discovered.length})
        </span>
      </div>
    </div>
  );
}
