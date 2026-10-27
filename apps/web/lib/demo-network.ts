// Demo-only network for the /demo walkthrough. Illustrative fixture data:
// it is NOT seed.ts and is never written to the database. The housing story
// mirrors the seeded Alice ↔ Bob sublet in apps/server/src/seed.ts, retold
// with Jack as the requester so the match is found two hops out.
//
// Privacy: Bob's private facts are represented ONLY as counts here. Their
// content must never appear in this file, the demo UI, screenshots or docs.

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
  'Find me a summer sublet near Georgia Tech, May–Aug, under $1200/mo.';

// Fields the request scope asks for (same scope as lib/mock.ts DEMO_SCOPE_FIELDS).
export const DEMO_SCOPE = ['location_area', 'price', 'dates'] as const;

// Jack's side of the request: only these network facts leave his agent.
export const JACK_SHARED_FACTS = [
  { field: 'location_area', value: 'Summer sublet near Georgia Tech' },
  { field: 'dates', value: 'May–Aug' },
  { field: 'price', value: 'Under $1200/mo' },
] as const;
export const JACK_PRIVATE_WITHHELD = 2;

// Bob's released facts are his seed.ts `network` facts whose field tags are in
// DEMO_SCOPE (verified against seed.ts by demo-network.test.ts).
export const BOB_RELEASED = [
  { field: 'location_area', value: 'Has a room for sublet 0.4mi from Georgia Tech campus' },
  { field: 'price', value: 'Room rent is $950/mo' },
  { field: 'dates', value: 'Room available May 15–Aug 10' },
] as const;
/** Out-of-scope network facts + private facts. Shown as a count only. */
export const BOB_WITHHELD_COUNT = 3;
export const BOB_PRIVATE_WITHHELD = 2;

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

  hop1('carol', 'Carol', 'No room myself. Passing it to my trusted friends.'),
  hop1('jad', 'Jad', 'No sublet. Forwarding.'),
  hop1('bayzhan', 'Bayzhan', 'No sublet. Forwarding.'),
  hop1('akash', 'Akash', 'No match. Forwarding.'),
  hop1('arman', 'Arman', 'No match. Forwarding.'),
  hop1('sheila', 'Sheila', 'No match. Forwarding.'),

  hop2('bob', 'Bob', 'carol', 'Match: room 0.4mi from GT, $950/mo, May 15–Aug 10.'),
  hop2('kevin', 'Kevin', 'carol', 'No sublet.'),
  hop2('alex', 'Alex', 'jad', 'Lease starts in June.'),
  hop2('ryan', 'Ryan', 'jad', 'No sublet.'),
  hop2('leo', 'Leo', 'bayzhan', 'Over budget.'),
  hop2('ivan', 'Ivan', 'bayzhan', 'No sublet.'),
  hop2('justus', 'Justus', 'akash', 'Near Emory, not GT.'),
  hop2('albert', 'Albert', 'akash', 'No sublet.'),
  hop2('bailey', 'Bailey', 'arman', 'Only June–July.'),
  hop2('jamie', 'Jamie', 'arman', 'No sublet.'),
  hop2('selin', 'Selin', 'sheila', 'No sublet.'),
  hop2('victoria', 'Victoria', 'sheila', 'No sublet.'),

  found('tom', 'Tom', 'kevin'),
  found('wesley', 'Wesley', 'ryan'),
  found('pete', 'Pete', 'ivan'),
  found('matheo', 'Mathéo', 'jamie'),
];

export const DEMO_EDGES: DemoEdge[] = DEMO_NODES.filter((n) => n.via).map((n) => ({
  from: n.via as string,
  to: n.id,
  kind: n.kind === 'discovered' ? 'discovered' : 'trusted',
}));

export const MATCH_PATH = ['jack', 'carol', 'bob'] as const;
export const INTRODUCER = 'carol';

export const countByKind = (kind: DemoNodeKind): number =>
  DEMO_NODES.filter((n) => n.kind === kind).length;

/** Agents that actually received the scoped request (discovered never do). */
export const askedNodes = (): DemoNode[] =>
  DEMO_NODES.filter((n) => n.kind === 'hop1' || n.kind === 'hop2');

export const isOnMatchPath = (e: DemoEdge): boolean =>
  MATCH_PATH.some((id, i) => i > 0 && MATCH_PATH[i - 1] === e.from && id === e.to);

// ── Layout: Jack near the centre, friends around him, friends of friends
// further out near their friend, discovered agents at the edge. Small fixed
// offsets keep it organic but deterministic.
export const GRAPH_W = 800;
export const GRAPH_H = 780;
const CX = GRAPH_W / 2;
const CY = GRAPH_H / 2;
export const R1 = 150;
export const R2 = 268;
const R3 = 350;
const WOBBLE = [0.06, -0.09, 0.04, -0.05, 0.08, -0.03, 0.05, -0.07, 0.02, 0.07, -0.04, 0.03];
const STRETCH = [10, -14, 6, -8, 16, -4, 12, -10, 4, -16, 8, 2];

export function layout(): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const at = (r: number, a: number) => ({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
  pos.set('jack', { x: CX, y: CY });
  const firsts = DEMO_NODES.filter((n) => n.kind === 'hop1');
  const angle = new Map<string, number>();
  firsts.forEach((n, i) => {
    const a = -Math.PI / 6 + (2 * Math.PI * i) / firsts.length + WOBBLE[i];
    angle.set(n.id, a);
    pos.set(n.id, at(R1 + STRETCH[i], a));
  });
  let k = 0;
  for (const parent of firsts) {
    const kids = DEMO_NODES.filter((n) => n.kind === 'hop2' && n.via === parent.id);
    kids.forEach((n, i) => {
      const a = angle.get(parent.id)! + (i - (kids.length - 1) / 2) * 0.44 + WOBBLE[k] / 2;
      angle.set(n.id, a);
      pos.set(n.id, at(R2 + STRETCH[k], a));
      k++;
    });
  }
  for (const n of DEMO_NODES.filter((d) => d.kind === 'discovered')) {
    const a = angle.get(n.via!)! + 0.17;
    pos.set(n.id, at(R3, a));
  }
  return pos;
}

// ── Timeline (ms). One continuous animation: the request ripples out hop by
// hop, Bob answers, his in-scope facts travel back via Carol, Carol makes the
// intro, then every agent starts searching for its own person.
export const TIMING = {
  askAt: 500,
  hop1At: 1500,
  hop1Stagger: 110,
  travel: 750,
  hop2Delay: 250,
  hop2Stagger: 150,
  seenDelay: 450,
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
const matchAt = lastArrival + 350;
const factsAt = matchAt + 450;
const factsEnd = factsAt + 1900;
const introAt = factsEnd + 250;
const futureAt = introAt + 2000;
const outroAt = futureAt + 5200;

export const PHASES = { matchAt, factsAt, factsEnd, introAt, futureAt, outroAt } as const;
export const DEMO_TOTAL_MS = outroAt + 3000;
