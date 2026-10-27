import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  askedNodes,
  BOB_RELEASED,
  BOB_WITHHELD_COUNT,
  countByKind,
  DEMO_EDGES,
  DEMO_NODES,
  DEMO_REQUEST,
  DEMO_SCOPE,
  arrivalTimes,
  DEMO_TOTAL_MS,
  INTRODUCER,
  isOnMatchPath,
  layout,
  MATCH_PATH,
  PHASES,
  seenTimes,
} from './demo-network';
import { DEMO_LINK_GROUPS } from './demo-links';
import { BOB_RELEASED_FACTS, DEMO_SCOPE_FIELDS, DEMO_TOTAL_FACTS } from './mock';

const repo = (rel: string) => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));

// Parse seed.ts as text so the test never needs (or commits) private values.
function seedFacts(user: string) {
  const src = readFileSync(repo('apps/server/src/seed.ts'), 'utf8');
  const re = /user: '(\w+)', content: (['"])(.*?)\2, classification: '(\w+)', fieldTags: \[([^\]]*)\]/g;
  return [...src.matchAll(re)]
    .filter((m) => m[1] === user)
    .map((m) => ({
      content: m[3],
      classification: m[4],
      tags: [...m[5].matchAll(/'(\w+)'/g)].map((t) => t[1]),
    }));
}

describe('demo network graph', () => {
  it('has 23 nodes: Jack start, 6 hop-1, 12 hop-2, 4 discovered', () => {
    expect(DEMO_NODES).toHaveLength(23);
    expect(countByKind('start')).toBe(1);
    expect(countByKind('hop1')).toBe(6);
    expect(countByKind('hop2')).toBe(12);
    expect(countByKind('discovered')).toBe(4);
    const start = DEMO_NODES.find((n) => n.kind === 'start')!;
    expect(start.label).toBe('Jack — start');
    expect(DEMO_REQUEST).toMatch(/summer sublet near Georgia Tech, May–Aug, under \$1200\/mo/);
  });

  it('hop-1 hang off Jack, hop-2 off hop-1, discovered off hop-2', () => {
    const kind = new Map(DEMO_NODES.map((n) => [n.id, n.kind]));
    for (const n of DEMO_NODES) {
      if (n.kind === 'hop1') expect(n.via).toBe('jack');
      if (n.kind === 'hop2') expect(kind.get(n.via!)).toBe('hop1');
      if (n.kind === 'discovered') expect(kind.get(n.via!)).toBe('hop2');
    }
    expect(new Set(DEMO_NODES.map((n) => n.id)).size).toBe(23);
  });

  it('edges: trusted for asked agents, discovered for never-asked ones', () => {
    expect(DEMO_EDGES).toHaveLength(22);
    for (const e of DEMO_EDGES) {
      const to = DEMO_NODES.find((n) => n.id === e.to)!;
      expect(e.kind).toBe(to.kind === 'discovered' ? 'discovered' : 'trusted');
    }
    expect(askedNodes().some((n) => n.kind === 'discovered')).toBe(false);
    expect(askedNodes()).toHaveLength(18);
  });

  it('match is Bob two hops out via Carol, and the intro goes through Carol', () => {
    expect([...MATCH_PATH]).toEqual(['jack', 'carol', 'bob']);
    const bob = DEMO_NODES.find((n) => n.id === 'bob')!;
    expect(bob.kind).toBe('hop2');
    expect(bob.via).toBe('carol');
    expect(INTRODUCER).toBe('carol');
    expect(DEMO_EDGES.filter(isOnMatchPath).map((e) => `${e.from}>${e.to}`)).toEqual(['jack>carol', 'carol>bob']);
    // Bob is not a direct contact of Jack.
    expect(DEMO_EDGES.some((e) => e.from === 'jack' && e.to === 'bob')).toBe(false);
  });

  it('lays out every node inside the viewBox without overlap', () => {
    const pos = layout();
    expect(pos.size).toBe(23);
    const pts = [...pos.values()];
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(20);
      expect(p.x).toBeLessThan(780);
      expect(p.y).toBeGreaterThan(20);
      expect(p.y).toBeLessThan(760);
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(38);
  });

  it('animation: request ripples hop by hop, discovered agents are never sent it', () => {
    const arr = arrivalTimes();
    const seen = seenTimes();
    expect(arr.size).toBe(19);
    for (const n of askedNodes()) expect(arr.get(n.id)!).toBeGreaterThan(arr.get(n.via!)!);
    for (const n of DEMO_NODES.filter((d) => d.kind === 'discovered')) {
      expect(arr.has(n.id)).toBe(false);
      expect(seen.get(n.id)!).toBeGreaterThan(arr.get(n.via!)!);
    }
    expect(Math.max(...arr.values())).toBeLessThan(PHASES.matchAt);
    expect(PHASES.matchAt < PHASES.factsAt && PHASES.factsEnd < PHASES.introAt).toBe(true);
    expect(PHASES.introAt < PHASES.futureAt && PHASES.futureAt < PHASES.outroAt).toBe(true);
    expect(DEMO_TOTAL_MS).toBeLessThan(120_000);
  });
});

describe('demo privacy invariants vs seed.ts', () => {
  const bob = seedFacts('bob');

  it('releases exactly Bob’s in-scope network facts', () => {
    const inScope = bob.filter(
      (f) => f.classification !== 'private' && f.tags.some((t) => (DEMO_SCOPE as readonly string[]).includes(t)),
    );
    expect(BOB_RELEASED.map((f) => f.value).sort()).toEqual(inScope.map((f) => f.content).sort());
    expect([...DEMO_SCOPE]).toEqual([...DEMO_SCOPE_FIELDS]);
    expect(bob).toHaveLength(DEMO_TOTAL_FACTS);
    expect(BOB_WITHHELD_COUNT).toBe(bob.length - inScope.length);
    expect(BOB_RELEASED_FACTS).toContain('$950/mo');
  });

  it('never includes Bob’s private fact content in demo code or docs', () => {
    const priv = bob.filter((f) => f.classification === 'private');
    expect(priv.length).toBeGreaterThanOrEqual(2);
    const needles = priv.flatMap((f) => [f.content, f.content.split(': ').pop()!, f.content.replace(/^\S+\s/, '')]);
    const files = [
      'apps/web/lib/demo-network.ts',
      'apps/web/lib/demo-links.ts',
      'apps/web/components/DemoCanvas.tsx',
      'apps/web/app/demo/page.tsx',
      'docs/DEMO.md',
      'README.md',
      'apps/web/README.md',
    ].filter((f) => existsSync(repo(f)));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const text = readFileSync(repo(f), 'utf8');
      for (const needle of needles) expect(text.includes(needle), `${f} leaks a private seed fact`).toBe(false);
      expect(text).not.toMatch(/\b\d{3}-\d{3}-\d{4}\b/);
    }
    expect(JSON.stringify(DEMO_NODES)).not.toMatch(/address|phone/i);
  });
});

describe('demo links', () => {
  it('includes every required URL', () => {
    const hrefs = DEMO_LINK_GROUPS.flatMap((g) => g.links.map((l) => l.href));
    for (const url of [
      'https://www.linkedin.com/feed/update/urn:li:activity:7520388543140143104/',
      'https://www.linkedin.com/posts/bayzhan8_yesterday-we-got-2nd-place-at-the-cognition-ugcPost-7520259507004997632-pvH1/',
      'https://www.linkedin.com/in/thejackluo/',
      'https://www.linkedin.com/in/jad-matthew-bardawil/recent-activity/all/',
      'https://www.linkedin.com/in/akash-si/recent-activity/all/',
      'https://www.gthackerhouse.com/events/devin-hackathon/projects',
      'https://luma.com/7my0pg5g',
      'https://www.youtube.com/watch?v=7YhwRBV33PU',
      'https://github.com/thejackluo/asymmetry',
      'https://app.devin.ai/sessions/3f6ed8da12944a3294f4ed4deb971c95',
      'https://www.gthackerhouse.com/events/devin-hackathon/projects/481d499f-9e34-4b73-8805-a96aa4eea89d',
      'https://gthackerhouse.com/',
    ])
      expect(hrefs).toContain(url);
  });
});
