'use client';

import { useEffect, useRef } from 'react';
import { forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { interpolateZoom, type ZoomView } from 'd3-interpolate';
import { easeBackOut, easeCubicInOut, easeCubicOut } from 'd3-ease';
import {
  arrivalTimes,
  BOB_WITHHELD_COUNT,
  DEMO_EDGES,
  DEMO_NODES,
  DEMO_TOTAL_MS,
  GRAPH_H,
  GRAPH_W,
  INTRODUCER,
  isOnMatchPath,
  JACK_PRIVATE_WITHHELD,
  layout,
  PHASES,
  R1,
  R2,
  seenTimes,
  TIMING,
  type DemoNodeKind,
} from '@/lib/demo-network';

export const PALETTE = {
  bg: '#05060a',
  ink: '#f1f0fa',
  muted: '#7d7c8c',
  trusted: '#5b8cff',
  discovered: '#6e6e7c',
  accent: '#ff8a4c',
  hop1: '#9b87ff',
} as const;
const FUTURE_HUES = ['#9b87ff', '#34d399', '#fbbf24', '#5b8cff', '#f472b6'];

interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: DemoNodeKind;
  via: string | null;
  tx: number;
  ty: number;
  i: number;
}
type P = { x: number; y: number };

const TARGET = layout();
const ARR = arrivalTimes();
const SEEN = seenTimes();
const { matchAt, factsAt, factsEnd, introAt, futureAt, outroAt } = PHASES;
const CX = GRAPH_W / 2;
const CY = GRAPH_H / 2;
const STEP_MS = 16;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const prog = (t: number, at: number, dur: number) => clamp01((t - at) / dur);

const appearAt = (id: string, kind: DemoNodeKind) =>
  kind === 'start' ? 0 : kind === 'discovered' ? SEEN.get(id)! : ARR.get(id)!;
const departAt = (id: string, kind: DemoNodeKind) =>
  kind === 'start' ? -1 : kind === 'discovered' ? SEEN.get(id)! - 500 : ARR.get(id)! - TIMING.travel;

// ── Camera: smooth zoom/pan between shots (van Wijk & Nuij via d3-interpolate).
const pathCentre = (() => {
  const ps = ['jack', 'carol', 'bob'].map((id) => TARGET.get(id)!);
  return { x: ps.reduce((s, p) => s + p.x, 0) / 3, y: ps.reduce((s, p) => s + p.y, 0) / 3 };
})();
const SHOTS: { at: number; dur: number; view: ZoomView }[] = [
  { at: 0, dur: 0, view: [CX, CY, 140] },
  { at: TIMING.hop1At - 300, dur: 1600, view: [CX, CY, 520] },
  { at: TIMING.hop1At + 1400, dur: 1300, view: [CX, CY, 900] },
  { at: matchAt - 100, dur: 1300, view: [pathCentre.x, pathCentre.y, 640] },
  { at: futureAt - 200, dur: 1800, view: [CX, CY, 960] },
  { at: outroAt - 400, dur: 4200, view: [CX, CY, 1250] },
];
function cameraAt(t: number): ZoomView {
  let v = SHOTS[0].view;
  for (const s of SHOTS.slice(1)) {
    if (t <= s.at) break;
    const p = s.dur ? clamp01((t - s.at) / s.dur) : 1;
    if (p < 1) return interpolateZoom(v, s.view)(easeCubicInOut(p)) as ZoomView;
    v = s.view;
  }
  return v;
}

// ── After the intro, every agent starts searching for its own person.
const ADJ = new Map<string, string[]>();
for (const e of DEMO_EDGES.filter((x) => x.kind === 'trusted')) {
  ADJ.set(e.from, [...(ADJ.get(e.from) ?? []), e.to]);
  ADJ.set(e.to, [...(ADJ.get(e.to) ?? []), e.from]);
}
const SEARCHES = (() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const asked = DEMO_NODES.filter((n) => n.kind === 'hop1' || n.kind === 'hop2');
  return Array.from({ length: 18 }, (_, k) => ({
    at: futureAt + 200 + k * 260,
    origin: asked[Math.floor(rnd() * asked.length)].id,
    hue: FUTURE_HUES[k % FUTURE_HUES.length],
  }));
})();

function bendOf(i: number) {
  return (i % 2 ? 1 : -1) * (0.16 + (i % 3) * 0.04);
}
function ctrl(a: P, b: P, bend: number): P {
  return { x: (a.x + b.x) / 2 - (b.y - a.y) * bend, y: (a.y + b.y) / 2 + (b.x - a.x) * bend };
}
function quad(a: P, c: P, b: P, s: number): P {
  const u = 1 - s;
  return { x: u * u * a.x + 2 * u * s * c.x + s * s * b.x, y: u * u * a.y + 2 * u * s * c.y + s * s * b.y };
}
function strokeCurve(ctx: CanvasRenderingContext2D, a: P, c: P, b: P, s0: number, s1: number) {
  ctx.beginPath();
  const n = 28;
  for (let j = 0; j <= n; j++) {
    const p = quad(a, c, b, s0 + ((s1 - s0) * j) / n);
    if (j === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}
function glowDot(ctx: CanvasRenderingContext2D, p: P, r: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
function ring(ctx: CanvasRenderingContext2D, p: P, r: number, color: string, alpha: number, width: number) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
}
function lockBadge(ctx: CanvasRenderingContext2D, p: P, m: number, count: number, alpha: number, font: string) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PALETTE.muted;
  ctx.fillStyle = PALETTE.muted;
  ctx.lineWidth = 1.2 * m;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 3.2 * m, 2.6 * m, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(p.x - 3.6 * m, p.y - 3.2 * m, 7.2 * m, 5.6 * m);
  ctx.font = `${10 * m}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(count), p.x + 6 * m, p.y - 0.6 * m);
}

function createSim() {
  const nodes: SimNode[] = DEMO_NODES.map((n, i) => ({
    id: n.id,
    kind: n.kind,
    via: n.via,
    tx: TARGET.get(n.id)!.x,
    ty: TARGET.get(n.id)!.y,
    i,
    x: CX,
    y: CY,
  }));
  const sim = forceSimulation(nodes)
    .alpha(0.35)
    .alphaDecay(0)
    .velocityDecay(0.28)
    .force('x', forceX<SimNode>((d) => d.tx).strength(0.055))
    .force('y', forceY<SimNode>((d) => d.ty).strength(0.055))
    .stop();
  return { sim, nodes, byId: new Map(nodes.map((n) => [n.id, n])) };
}

function stepSim(world: ReturnType<typeof createSim>, t: number) {
  for (const n of world.nodes) {
    if (t < departAt(n.id, n.kind)) {
      const parent = n.via ? world.byId.get(n.via)! : null;
      n.x = parent?.x ?? CX;
      n.y = parent?.y ?? CY;
      n.vx = 0;
      n.vy = 0;
    } else {
      n.vx! += Math.sin(t / 1900 + n.i * 1.7) * 0.025;
      n.vy! += Math.cos(t / 2300 + n.i * 1.3) * 0.025;
    }
  }
  world.sim.tick();
}

function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  world: ReturnType<typeof createSim>,
  font: string,
) {
  const view = cameraAt(t);
  const k = Math.min(W, H) / view[2];
  const u = Math.min(W, H) / 900;
  const m = u * Math.pow(k / u, 0.5);
  const S = (p: P): P => ({ x: (p.x - view[0]) * k + W / 2, y: (p.y - view[1]) * k + H / 2 });
  const pos = (id: string) => S(world.byId.get(id) as P);

  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, W, H);
  const jack = pos('jack');
  const g = ctx.createRadialGradient(jack.x, jack.y, 0, jack.x, jack.y, 520 * k);
  g.addColorStop(0, 'rgba(120,100,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Faint orbit rings for each hop.
  ring(ctx, jack, R1 * k, PALETTE.hop1, 0.07 * prog(t, TIMING.hop1At + 400, 900), 26 * k);
  ring(ctx, jack, R1 * k, PALETTE.hop1, 0.12 * prog(t, TIMING.hop1At + 400, 900), 1);
  ring(ctx, jack, R2 * k, PALETTE.trusted, 0.05 * prog(t, TIMING.hop1At + 1600, 900), 30 * k);
  ring(ctx, jack, R2 * k, PALETTE.trusted, 0.1 * prog(t, TIMING.hop1At + 1600, 900), 1);

  const dimAsked = 1 - 0.6 * prog(t, matchAt, 600) + 0.45 * prog(t, futureAt, 900);
  const curves = DEMO_EDGES.map((e, i) => {
    const a = pos(e.from);
    const b = pos(e.to);
    return { e, a, b, c: ctrl(a, b, bendOf(i)) };
  });

  // Edges draw out behind the travelling request.
  ctx.lineCap = 'round';
  for (const { e, a, b, c } of curves) {
    if (e.kind === 'discovered') {
      const al = prog(t, SEEN.get(e.to)! - 500, 900) * 0.6;
      if (al <= 0) continue;
      ctx.globalAlpha = al;
      ctx.setLineDash([3 * m, 4 * m]);
      ctx.strokeStyle = PALETTE.discovered;
      ctx.lineWidth = 1.1 * m;
      strokeCurve(ctx, a, c, b, 0, 1);
      ctx.setLineDash([]);
      continue;
    }
    const s = easeCubicInOut(prog(t, ARR.get(e.to)! - TIMING.travel, TIMING.travel));
    if (s <= 0) continue;
    const dim = isOnMatchPath(e) ? 1 : dimAsked;
    ctx.globalAlpha = 0.55 * Math.min(1, dim);
    ctx.strokeStyle = PALETTE.trusted;
    ctx.lineWidth = 1.3 * m;
    ctx.shadowColor = PALETTE.trusted;
    ctx.shadowBlur = 6 * m;
    strokeCurve(ctx, a, c, b, 0, s);
    ctx.shadowBlur = 0;
    if (s < 1) {
      for (let j = 6; j >= 0; j--) {
        const p = quad(a, c, b, Math.max(0, s - j * 0.025));
        glowDot(ctx, p, (2.8 - j * 0.3) * m, j ? PALETTE.trusted : '#dfe7ff', j ? 0.5 - j * 0.06 : 1);
      }
    }
  }

  // Match: the path lights up from Bob back to Jack, then flows.
  const pathCurves = curves.filter((x) => isOnMatchPath(x.e));
  const toCarol = pathCurves.find((x) => x.e.to === INTRODUCER)!;
  const toBob = pathCurves.find((x) => x.e.from === INTRODUCER)!;
  const litBob = easeCubicOut(prog(t, matchAt, 500));
  const litCarol = easeCubicOut(prog(t, matchAt + 400, 500));
  ctx.strokeStyle = PALETTE.accent;
  ctx.shadowColor = PALETTE.accent;
  ctx.shadowBlur = 14 * m;
  ctx.lineWidth = 2.2 * m;
  ctx.globalAlpha = 0.9 * (1 - 0.5 * prog(t, futureAt, 900));
  if (litBob > 0) strokeCurve(ctx, toBob.a, toBob.c, toBob.b, 1 - litBob, 1);
  if (litCarol > 0) strokeCurve(ctx, toCarol.a, toCarol.c, toCarol.b, 1 - litCarol, 1);
  ctx.shadowBlur = 0;
  if (litCarol >= 1) {
    ctx.setLineDash([5 * m, 16 * m]);
    ctx.lineDashOffset = (t * 0.05 * m) % (21 * m);
    ctx.strokeStyle = '#ffd2b8';
    ctx.lineWidth = 1.6 * m;
    strokeCurve(ctx, toCarol.a, toCarol.c, toCarol.b, 0, 1);
    strokeCurve(ctx, toBob.a, toBob.c, toBob.b, 0, 1);
    ctx.setLineDash([]);
  }

  // Bob's three in-scope facts travel back via Carol. The rest stay with Bob.
  for (let j = 0; j < 3; j++) {
    const p = prog(t, factsAt + j * 180, 1500);
    if (p <= 0 || p >= 1) continue;
    const at =
      p < 0.5
        ? quad(toBob.a, toBob.c, toBob.b, 1 - easeCubicInOut(p * 2))
        : quad(toCarol.a, toCarol.c, toCarol.b, 1 - easeCubicInOut((p - 0.5) * 2));
    glowDot(ctx, at, 3.2 * m, PALETTE.accent, 1);
  }

  // Intro through Carol: she reaches out to both sides at once.
  const carol = pos(INTRODUCER);
  for (let q = 0; q < 2; q++) {
    const f = prog(t, introAt + q * 350, 1100);
    if (f > 0 && f < 1) ring(ctx, carol, (9 + 42 * easeCubicOut(f)) * m, PALETTE.accent, 0.8 * (1 - f), 1.5 * m);
  }
  const hs = prog(t, introAt + 300, 900);
  if (hs > 0 && hs < 1) {
    glowDot(ctx, quad(toCarol.a, toCarol.c, toCarol.b, 1 - easeCubicInOut(hs)), 3.4 * m, '#ffe2cf', 1);
    glowDot(ctx, quad(toBob.a, toBob.c, toBob.b, easeCubicInOut(hs)), 3.4 * m, '#ffe2cf', 1);
  }

  // Everyone else's agents start searching too.
  const flashes: { id: string; at: number; hue: string }[] = [];
  for (const s of SEARCHES) {
    if (t < s.at) continue;
    const o = world.byId.get(s.origin)!;
    for (const [hop, from, list] of [[0, s.origin, ADJ.get(s.origin) ?? []]] as [number, string, string[]][]) {
      for (const to of list) {
        const p = prog(t, s.at + hop * 700, 700);
        if (p <= 0) continue;
        const curve = curves.find((x) => (x.e.from === from && x.e.to === to) || (x.e.from === to && x.e.to === from))!;
        const fwd = curve.e.from === from;
        const sp = easeCubicInOut(p);
        if (p < 1) {
          const s0 = fwd ? Math.max(0, sp - 0.25) : 1 - sp;
          const s1 = fwd ? sp : Math.min(1, 1 - sp + 0.25);
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = s.hue;
          ctx.shadowColor = s.hue;
          ctx.shadowBlur = 10 * m;
          ctx.lineWidth = 1.8 * m;
          strokeCurve(ctx, curve.a, curve.c, curve.b, s0, s1);
          ctx.shadowBlur = 0;
          glowDot(ctx, quad(curve.a, curve.c, curve.b, fwd ? sp : 1 - sp), 2.6 * m, s.hue, 1);
        } else flashes.push({ id: to, at: s.at + hop * 700 + 700, hue: s.hue });
      }
    }
    flashes.push({ id: o.id, at: s.at, hue: s.hue });
  }

  // Nodes bloom in as the request reaches them.
  const labelPx = Math.max(9, 10.5 * m);
  for (const n of world.nodes) {
    const A = appearAt(n.id, n.kind);
    const vis = prog(t, A - 150, 450);
    if (vis <= 0) continue;
    const p = pos(n.id);
    const base = n.kind === 'start' ? 11 : n.kind === 'hop1' ? 7.5 : n.kind === 'hop2' ? 6 : 4;
    const r = base * m * easeBackOut(vis);
    const onPath = n.id === 'bob' ? t > matchAt : n.id === INTRODUCER ? t > matchAt + 400 : false;
    const color =
      n.kind === 'start'
        ? PALETTE.ink
        : onPath
          ? PALETTE.accent
          : n.kind === 'hop1'
            ? PALETTE.hop1
            : n.kind === 'hop2'
              ? PALETTE.trusted
              : PALETTE.discovered;
    const alpha =
      (n.kind === 'discovered' ? 0.55 : n.kind === 'start' || onPath ? 1 : Math.min(1, dimAsked)) * vis;

    const f = prog(t, A, 900);
    if (f > 0 && f < 1 && n.kind !== 'discovered') ring(ctx, p, r * (1 + 2.4 * easeCubicOut(f)), color, 0.5 * (1 - f), 1.2 * m);
    for (const fl of flashes) {
      if (fl.id !== n.id) continue;
      const ff = prog(t, fl.at, 800);
      if (ff > 0 && ff < 1) ring(ctx, p, r * (1 + 2 * easeCubicOut(ff)), fl.hue, 0.7 * (1 - ff), 1.3 * m);
    }

    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = (n.kind === 'discovered' ? 4 : 16) * m;
    ctx.fillStyle = n.kind === 'start' ? PALETTE.ink : '#0c0d16';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = (n.kind === 'discovered' ? 1 : 1.6) * m;
    if (n.kind === 'discovered') ctx.setLineDash([2 * m, 2 * m]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = alpha * (n.kind === 'discovered' ? 0.6 : 0.85);
    ctx.fillStyle = n.kind === 'start' ? PALETTE.ink : onPath ? PALETTE.accent : '#c9c8d8';
    ctx.font = n.kind === 'start' ? `600 ${labelPx * 1.2}px ${font}` : `${labelPx}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(DEMO_NODES[n.i].label, p.x, p.y + r + 5 * m);
  }

  // Private facts orbit their owner and never leave: Jack keeps 2, Bob keeps 3.
  const orbit = (c: P, count: number, color: string, alpha: number, phase: number) => {
    for (let j = 0; j < count; j++) {
      const a = t * 0.0016 + phase + (j * Math.PI * 2) / count;
      glowDot(ctx, { x: c.x + Math.cos(a) * 19 * m, y: c.y + Math.sin(a) * 19 * m }, 1.8 * m, color, alpha);
    }
  };
  const fadeOut = 1 - prog(t, outroAt, 800);
  orbit(jack, 3, PALETTE.trusted, prog(t, TIMING.askAt, 400) * (1 - prog(t, TIMING.hop1At, 300)), 0.4);
  orbit(jack, JACK_PRIVATE_WITHHELD, PALETTE.muted, prog(t, TIMING.askAt, 400) * 0.9 * fadeOut, 0);
  lockBadge(ctx, { x: jack.x + 20 * m, y: jack.y - 17 * m }, m, JACK_PRIVATE_WITHHELD, prog(t, TIMING.askAt + 300, 400) * 0.85 * fadeOut, font);
  const bob = pos('bob');
  orbit(bob, BOB_WITHHELD_COUNT, PALETTE.muted, prog(t, matchAt, 400) * 0.9 * fadeOut, 1.2);
  lockBadge(ctx, { x: bob.x + 15 * m, y: bob.y - 14 * m }, m, BOB_WITHHELD_COUNT, prog(t, matchAt + 200, 400) * 0.85 * fadeOut, font);
  orbit(bob, 3, PALETTE.accent, prog(t, matchAt, 300) * (1 - prog(t, factsAt, 200)), 0.6);

  // Two quiet captions: what Jack asked for, and what came back.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${Math.max(10, 11.5 * m)}px ${font}`;
  const capY = jack.y + 11 * m + 26 * m;
  const ask = prog(t, TIMING.askAt, 500) * (1 - prog(t, TIMING.hop1At + 1700, 600));
  if (ask > 0) {
    ctx.globalAlpha = ask * 0.9;
    ctx.fillStyle = '#9fb6ff';
    ctx.fillText('summer sublet · near GT · May–Aug · < $1200/mo', jack.x, capY);
  }
  const got = prog(t, factsEnd, 500) * fadeOut;
  if (got > 0) {
    ctx.globalAlpha = got;
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('0.4 mi · $950/mo · May 15–Aug 10', jack.x, capY);
  }

  // Outro wordmark.
  const out = prog(t, outroAt, 1400);
  if (out > 0) {
    ctx.globalAlpha = 0.72 * out;
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, W, H);
    const size = Math.min(W * 0.085, 110);
    const a1 = easeCubicOut(prog(t, outroAt + 400, 1000));
    ctx.font = `700 ${size}px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const word = 'asymmetry';
    const w = ctx.measureText(word + '.').width;
    const x0 = W / 2 - w / 2;
    const y0 = H / 2 - size * 0.15 + 14 * (1 - a1);
    ctx.globalAlpha = a1;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillText(word, x0, y0);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillText('.', x0 + ctx.measureText(word).width, y0);
    const a2 = easeCubicOut(prog(t, outroAt + 1100, 1000));
    ctx.globalAlpha = a2;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'center';
    ctx.font = `${size * 0.26}px ${font}`;
    ctx.fillText('let the agents talk', W / 2, y0 + size * 0.75);
  }

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, H - 2, (W * t) / DEMO_TOTAL_MS, 2);
  ctx.globalAlpha = 1;
}

interface Props {
  paused: boolean;
  /** Freeze at this time (ms) instead of playing. */
  frozenAt?: number | null;
  /** Change to restart from the beginning. */
  replayKey: number;
  onEnd?: () => void;
}

export default function DemoCanvas({ paused, frozenAt, replayKey, onEnd }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    pausedRef.current = paused;
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const font = getComputedStyle(canvas).fontFamily || 'monospace';
    const world = createSim();
    let t = 0;
    let simT = 0;
    const advance = (to: number) => {
      while (simT + STEP_MS <= to) {
        simT += STEP_MS;
        stepSim(world, simT);
      }
    };
    if (frozenAt != null) {
      t = Math.min(frozenAt, DEMO_TOTAL_MS);
      advance(t);
    }
    let ended = false;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (frozenAt == null && !pausedRef.current && t < DEMO_TOTAL_MS) {
        t = Math.min(DEMO_TOTAL_MS, t + dt);
        advance(t);
      } else if (frozenAt == null && !pausedRef.current) {
        simT += STEP_MS;
        stepSim(world, simT);
      }
      if (!ended && t >= DEMO_TOTAL_MS) {
        ended = true;
        onEndRef.current?.();
      }
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, W, H, t, world, font);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [frozenAt, replayKey]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full font-mono" aria-hidden />;
}

