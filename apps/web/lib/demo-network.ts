// Demo-only network for the /demo animation. Illustrative fixture data: it is
// NOT seed.ts and is never written to the database. Jack's agent asks for an
// apartment and a car; both are found two hops out through trusted friends.
//
// Privacy: matched people's private facts are represented ONLY as counts here.
// Bob's seed.ts private facts must never appear in this file, the UI or docs.

export type DemoNodeKind = 'start' | 'hop1' | 'hop2' | 'discovered';
export type DemoEdgeKind = 'trusted' | 'discovered';

export interface DemoNode {
  id: string;
  name: string;
  label: string;
  kind: DemoNodeKind;
  /** The node whose agent reached (or surfaced) this one. */
  via: string | null;
  /** One-line result the node's agent reported, if it was asked. */
  reply?: string;
}

export interface DemoEdge {
  from: string;
  to: string;
  kind: DemoEdgeKind;
}

export const DEMO_REQUEST =
  'Find me an apartment near Georgia Tech under $1,500/mo, and a reliable used car under $15k.';

// Fields the request scope asks for (same scope as lib/mock.ts DEMO_SCOPE_FIELDS).
export const DEMO_SCOPE = ['location_area', 'price', 'dates'] as const;

/** What Jack's agent shares, and the fields each request is scoped to. */
export const JACK_WANTS = [
  { id: 'apartment', text: 'apartment · near GT · ≤ $1.5k/mo', scope: ['unit_type', 'location_area', 'price'] },
  { id: 'car', text: 'used car · reliable · ≤ $15k', scope: ['model', 'mileage', 'price'] },
] as const;
export const JACK_PRIVATE_WITHHELD = 2;

export type DemoMatchId = (typeof JACK_WANTS)[number]['id'];

export interface DemoMatch {
  id: DemoMatchId;
  /** Jack → introducer → match. Never a direct edge. */
  path: readonly [string, string, string];
  introducer: string;
  /** Facts the match's agent releases; every field is in the request's scope. */
  shares: readonly { field: string; value: string }[];
  /** One-line headline shown at the match. */
  headline: string;
  /** What Jack ends up with, and why it meets his criteria. */
  found: string;
  criteria: string;
  /** Facts the match's agent keeps. Shown as a count only. */
  withheld: number;
}

export const DEMO_MATCHES: readonly DemoMatch[] = [
  {
    id: 'apartment',
    path: ['jack', 'carol', 'bob'],
    introducer: 'carol',
    shares: [
      { field: 'unit_type', value: '1BR' },
      { field: 'location_area', value: '0.4 mi from GT' },
      { field: 'price', value: '$1,350/mo' },
    ],
    headline: 'Bob · has an apartment',
    found: 'Bob, via Carol',
    criteria: 'near GT · $1,350 ≤ $1.5k',
    withheld: 3,
  },
  {
    id: 'car',
    path: ['jack', 'akash', 'justus'],
    introducer: 'akash',
    shares: [
      { field: 'model', value: '2019 Civic' },
      { field: 'mileage', value: '41k mi' },
      { field: 'price', value: '$13,900' },
    ],
    headline: 'Justus · selling a car',
    found: 'Justus, via Akash',
    criteria: 'reliable · $13,900 ≤ $15k',
    withheld: 2,
  },
];

const hop1 = (id: string, name: string, reply: string): DemoNode => ({
  id,
  name,
  label: name,
  kind: 'hop1',
  via: 'jack',
  reply,
});
const hop2 = (id: string, name: string, via: string, reply: string): DemoNode => ({
  id,
  name,
  label: name,
  kind: 'hop2',
  via,
  reply,
});
const found = (id: string, name: string, via: string): DemoNode => ({
  id,
  name,
  label: name,
  kind: 'discovered',
  via,
});

export const DEMO_NODES: DemoNode[] = [
  { id: 'jack', name: 'Jack', label: 'Jack — start', kind: 'start', via: null },

  hop1('carol', 'Carol', 'No match myself. Passing it to my trusted friends.'),
  hop1('jad', 'Jad', 'No match. Forwarding.'),
  hop1('bayzhan', 'Bayzhan', 'No match. Forwarding.'),
  hop1('akash', 'Akash', 'No match. Forwarding.'),
  hop1('arman', 'Arman', 'No match. Forwarding.'),
  hop1('sheila', 'Sheila', 'No match. Forwarding.'),

  hop2('bob', 'Bob', 'carol', 'Match: 1BR 0.4mi from GT, $1,350/mo.'),
  hop2('kevin', 'Kevin', 'carol', 'No match.'),
  hop2('alex', 'Alex', 'jad', 'No match.'),
  hop2('ryan', 'Ryan', 'jad', 'No match.'),
  hop2('leo', 'Leo', 'bayzhan', 'No match.'),
  hop2('ivan', 'Ivan', 'bayzhan', 'No match.'),
  hop2('justus', 'Justus', 'akash', 'Match: 2019 Civic, 41k mi, $13,900.'),
  hop2('albert', 'Albert', 'akash', 'No match.'),
  hop2('bailey', 'Bailey', 'arman', 'No match.'),
  hop2('jamie', 'Jamie', 'arman', 'No match.'),
  hop2('selin', 'Selin', 'sheila', 'No match.'),
  hop2('victoria', 'Victoria', 'sheila', 'No match.'),

  found('tom', 'Tom', 'kevin'),
  found('wesley', 'Wesley', 'ryan'),
  found('pete', 'Pete', 'ivan'),
  found('matheo', 'Mathéo', 'victoria'),
];

export const DEMO_EDGES: DemoEdge[] = DEMO_NODES.filter((n) => n.via).map((n) => ({
  from: n.via as string,
  to: n.id,
  kind: n.kind === 'discovered' ? 'discovered' : 'trusted',
}));

export const matchCard = (m: DemoMatch): string => m.shares.map((f) => f.value).join(' · ');

export const MATCH_PATH = DEMO_MATCHES[0].path;
export const INTRODUCER = DEMO_MATCHES[0].introducer;

export const countByKind = (kind: DemoNodeKind): number =>
  DEMO_NODES.filter((n) => n.kind === kind).length;

/** Agents that actually received the scoped request (discovered never do). */
export const askedNodes = (): DemoNode[] =>
  DEMO_NODES.filter((n) => n.kind === 'hop1' || n.kind === 'hop2');

export const isOnMatchPath = (e: DemoEdge): boolean =>
  DEMO_MATCHES.some(({ path }) => path.some((id, i) => i > 0 && path[i - 1] === e.from && id === e.to));

// ── Clusters: Jack's dense home cluster, and a looser cloud across a gap.
// Only a few bridges connect them (Jack–Carol, Sheila–Selin, Sheila–Victoria,
// Jamie–Carol); Carol is the bridge that reaches Bob.
export type DemoCluster = 'home' | 'cloud';
const CLOUD = new Set(['carol', 'bob', 'kevin', 'selin', 'victoria', 'tom', 'matheo']);
export const clusterOf = (id: string): DemoCluster => (CLOUD.has(id) ? 'cloud' : 'home');

/** Everyday social ties (not request paths): dense at home, sparse in the cloud. */
export const SOCIAL_LINKS: readonly (readonly [string, string])[] = [
  ['jad', 'bayzhan'],
  ['bayzhan', 'akash'],
  ['akash', 'arman'],
  ['arman', 'sheila'],
  ['sheila', 'jad'],
  ['jad', 'akash'],
  ['alex', 'ryan'],
  ['leo', 'ivan'],
  ['justus', 'albert'],
  ['bailey', 'jamie'],
  ['alex', 'leo'],
  ['ivan', 'justus'],
  ['albert', 'bailey'],
  ['ryan', 'sheila'],
  ['jamie', 'sheila'],
  ['bob', 'kevin'],
  ['selin', 'victoria'],
  ['jamie', 'carol'],
];

export const GRAPH_W = 1100;
export const GRAPH_H = 700;
const POS: Record<string, [number, number]> = {
  jack: [360, 370],
  jad: [290, 255],
  bayzhan: [230, 385],
  akash: [310, 510],
  arman: [440, 500],
  sheila: [470, 250],
  carol: [600, 360],
  alex: [200, 170],
  ryan: [330, 140],
  leo: [110, 330],
  ivan: [130, 470],
  justus: [220, 610],
  albert: [380, 630],
  bailey: [520, 600],
  jamie: [560, 520],
  bob: [820, 280],
  kevin: [860, 450],
  selin: [700, 150],
  victoria: [870, 130],
  wesley: [430, 60],
  pete: [40, 560],
  tom: [990, 520],
  matheo: [1020, 210],
};

export function layout(): Map<string, { x: number; y: number }> {
  return new Map(DEMO_NODES.map((n) => [n.id, { x: POS[n.id][0], y: POS[n.id][1] }]));
}

// ── Timeline (ms). One continuous animation: the request ripples out hop by
// hop through both clusters, then each match answers, its in-scope facts
// travel back via the introducer, Jack's criteria check off, the introducer
// makes the intro, then every agent starts searching for its own person.
export const TIMING = {
  askAt: 500,
  hop1At: 1500,
  hop1Stagger: 110,
  travel: 850,
  hop2Delay: 300,
  hop2Stagger: 200,
  seenDelay: 450,
  /** Non-matching agents check the request and pass. */
  checkDelay: 300,
} as const;

/** When the scoped request reaches each asked agent (and Jack at 0). */
export function arrivalTimes(): Map<string, number> {
  const t = new Map<string, number>([['jack', 0]]);
  DEMO_NODES.filter((n) => n.kind === 'hop1').forEach((n, i) =>
    t.set(n.id, TIMING.hop1At + i * TIMING.hop1Stagger + TIMING.travel),
  );
  for (const parent of DEMO_NODES.filter((n) => n.kind === 'hop1')) {
    DEMO_NODES.filter((n) => n.kind === 'hop2' && n.via === parent.id).forEach((n, j) =>
      t.set(n.id, t.get(parent.id)! + TIMING.hop2Delay + j * TIMING.hop2Stagger + TIMING.travel),
    );
  }
  return t;
}

/** Discovered agents are only seen as the search spreads; they are never sent the request. */
export function seenTimes(): Map<string, number> {
  const arr = arrivalTimes();
  return new Map(
    DEMO_NODES.filter((n) => n.kind === 'discovered').map((n) => [n.id, arr.get(n.via!)! + TIMING.seenDelay]),
  );
}

const lastArrival = Math.max(...arrivalTimes().values());
const MATCH_GAP = 4300;
const matches = DEMO_MATCHES.map((_, i) => {
  const matchAt = lastArrival + 1000 + i * MATCH_GAP;
  const factsAt = matchAt + 1000;
  const factsEnd = factsAt + 1500;
  return { matchAt, factsAt, factsEnd, introAt: factsEnd + 700 };
});
const futureAt = matches[matches.length - 1].introAt + 1800;
const outroAt = futureAt + 4500;

export const PHASES = { matchAt: matches[0].matchAt, matches, futureAt, outroAt } as const;
export const DEMO_TOTAL_MS = outroAt + 3000;
