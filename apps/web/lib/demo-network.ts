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

  hop1('carol', 'Carol', 'No room myself — passing the scoped request to my trusted friends.'),
  hop1('dave', 'Dave', 'No sublet. Forwarding to my friends.'),
  hop1('erin', 'Erin', 'Public tip: GT campus housing board. Forwarding too.'),
  hop1('maya', 'Maya', 'No match. Forwarding.'),
  hop1('priya', 'Priya', 'No match. Forwarding.'),
  hop1('sam', 'Sam', 'No match. Forwarding.'),

  hop2('bob', 'Bob', 'carol', 'Match: room 0.4mi from GT, $950/mo, May 15–Aug 10.'),
  hop2('nina', 'Nina', 'carol', 'No sublet.'),
  hop2('omar', 'Omar', 'dave', 'Lease starts in June — no.'),
  hop2('lena', 'Lena', 'dave', 'No sublet.'),
  hop2('theo', 'Theo', 'erin', 'Over budget ($1,650/mo).'),
  hop2('grace', 'Grace', 'erin', 'No sublet.'),
  hop2('ivan', 'Ivan', 'maya', 'Near Emory, not GT.'),
  hop2('zoe', 'Zoe', 'maya', 'No sublet.'),
  hop2('ravi', 'Ravi', 'priya', 'Only June–July.'),
  hop2('hana', 'Hana', 'priya', 'No sublet.'),
  hop2('leo', 'Leo', 'sam', 'No sublet.'),
  hop2('mia', 'Mia', 'sam', 'No sublet.'),

  found('quinn', 'Quinn', 'nina'),
  found('uma', 'Uma', 'omar'),
  found('kai', 'Kai', 'ivan'),
  found('wes', 'Wes', 'leo'),
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

// ── Slides. Plays like a short launch film; `reveal` = node kinds visible.
export type DemoStepId =
  | 'title'
  | 'need'
  | 'ask'
  | 'hop1'
  | 'scope'
  | 'hop2'
  | 'match'
  | 'intro'
  | 'missed'
  | 'today'
  | 'tomorrow'
  | 'more'
  | 'trust'
  | 'end';

export type DemoStepKind = 'title' | 'text' | 'graph';

export interface DemoStep {
  id: DemoStepId;
  kind: DemoStepKind;
  title: string;
  sub?: string;
  reveal: DemoNodeKind[];
  /** Highlight Jack → Carol → Bob. */
  path?: boolean;
  durationMs: number;
}

const ALL: DemoNodeKind[] = ['start', 'hop1', 'hop2', 'discovered'];

export const DEMO_STEPS: DemoStep[] = [
  { id: 'title', kind: 'title', title: 'Asymmetry', sub: 'Let the agents talk', reveal: ALL, durationMs: 4500 },
  {
    id: 'need',
    kind: 'graph',
    title: 'Jack needs a room for the summer.',
    sub: 'Near Georgia Tech · May–Aug · under $1200/mo',
    reveal: ['start'],
    durationMs: 5500,
  },
  { id: 'ask', kind: 'graph', title: 'He asks his agent.', sub: DEMO_REQUEST, reveal: ['start'], durationMs: 5000 },
  {
    id: 'hop1',
    kind: 'graph',
    title: 'His agent asks theirs.',
    sub: '6 trusted friends. Each in its own subchat.',
    reveal: ['start', 'hop1'],
    durationMs: 5500,
  },
  {
    id: 'scope',
    kind: 'graph',
    title: 'Only what’s needed leaves.',
    sub: 'Area, price, dates. Everything else stays home.',
    reveal: ['start', 'hop1'],
    durationMs: 6000,
  },
  {
    id: 'hop2',
    kind: 'graph',
    title: 'Then their friends ask theirs.',
    sub: '12 friends of friends. 4 more seen, never asked.',
    reveal: ALL,
    durationMs: 6500,
  },
  {
    id: 'match',
    kind: 'graph',
    title: 'Two hops away, a match.',
    sub: 'Bob · 0.4mi from campus · $950/mo · May 15–Aug 10',
    reveal: ALL,
    path: true,
    durationMs: 7000,
  },
  {
    id: 'intro',
    kind: 'graph',
    title: 'Carol makes the intro.',
    sub: 'She trusts them both. Nothing moves without consent.',
    reveal: ALL,
    path: true,
    durationMs: 6000,
  },
  { id: 'missed', kind: 'text', title: 'Jack never knew Bob.', sub: 'The room was two hops away the whole time.', reveal: ALL, path: true, durationMs: 5000 },
  { id: 'today', kind: 'text', title: 'Today, your agent works for you.', reveal: ALL, durationMs: 3800 },
  { id: 'tomorrow', kind: 'text', title: 'Tomorrow, it works with theirs.', reveal: ALL, durationMs: 4200 },
  {
    id: 'more',
    kind: 'text',
    title: 'The sublet. The job. The cofounder.',
    sub: 'The opportunity you would never have found by asking around.',
    reveal: ALL,
    durationMs: 6000,
  },
  {
    id: 'trust',
    kind: 'text',
    title: 'Consent at every hop.',
    sub: 'Scoped sharing. Private facts never leave your agent.',
    reveal: ALL,
    durationMs: 5500,
  },
  { id: 'end', kind: 'title', title: 'Asymmetry', sub: 'Let the agents talk', reveal: ALL, durationMs: 6000 },
];

export const DEMO_TOTAL_MS = DEMO_STEPS.reduce((s, x) => s + x.durationMs, 0);
