# Phase 4: Frontend — Specification

Owner: Akash / @AkashSingirikonda (Devin 4). Coordinator: Jack / @thejackluo (Devin 1).

**Created:** 2026-10-24 · **Owner:** Devin 4 · **Requirements:** UI-01…10 locked

## Goal

Ship the entire visual product: login, a tasks page where human↔agent chat
and live agent↔agent subchats are unmistakably different, and a network page
showing trusted vs discovered agents — all over Socket.IO per CONTRACTS §3/§4.

## Background

You own everything judges see (`apps/web/**`). Backend is built in parallel —
your socket layer goes behind a `SocketClient` interface with a mock so you
never block. Minimalist paper/ink aesthetic (see Design Direction); Tailwind only; no component library.

## Design Direction (minimalist, inspired by bayzhan.com)

Operator request: "the coolest minimalistic design", inspired by
https://www.bayzhan.com. This replaces the earlier dark/hacker baseline.
Jack (D1) can override it.

- **Type:** IBM Plex Mono (400/500/600) everywhere, via `next/font/google`.
  Tight letter-spacing on headings (`-0.02em`); small-caps-style labels
  (`uppercase`, `0.08–0.12em` tracking) for section headers and status chips.
- **Palette (light, default):** paper `#fffff8` bg, `#ffffff` surfaces, ink
  `#000000` text and borders, `#404040` secondary, `#707070` muted,
  `#C0BDAD` soft borders, `#f5f5f0` soft accent fills.
- **Palette (dark toggle):** `#1a1816` bg, `#221f1d` surfaces, `#e8e6e0` text and
  borders, `#a8a599` secondary, `#787366` muted, `#4a4540` soft borders.
  Persist the theme in localStorage and apply it before first paint.
- **Shape:** 1px solid borders, `border-radius: 0`, no shadows, no gradients,
  no glassmorphism. Motion is subtle: 0.2s color/background transitions;
  new messages fade/slide in under 200ms.
- **Layout:** generous whitespace, narrow readable columns (main chat ≤ 700px),
  thin dividers, and no decoration that carries no information.
- **Agent traffic:** A2A subchats are the visual signature, shown as terminal-like
  bordered panes with `A ↔ B` headers. Disclosure lines are plain text
  (`shared 3 · withheld 2`) with one ink-colored lock glyph. Use text glyphs
  instead of emoji in the UI.
- **Network page:** ink-on-paper graph. Trusted = solid 1px line,
  discovered = dashed line, own agent = filled node. No neon or glow.
- **Agent-operable:** keep the stable labels/aria-labels in Constraints.
  Minimalism never means icon-only controls.

## Requirements

1. **Login** `/login`: username+password → `POST /api/login` → token in
   localStorage → `/tasks`. Auto-register is server-side; no toggle.
   - Acceptance: fresh username logs in and lands on /tasks

2. **Tasks** `/tasks`: left column task list (+ create via `task:create`),
   right column selected task chat.
   - Acceptance: created task appears via `task:created`, persists on refresh (`GET /api/tasks`)

3. **Main thread**: `subchatId === null` messages; "You" vs "{name}'s Agent"
   bubbles distinct.
   - Acceptance: human and agent messages render differently (screenshot in PR)

4. **Subchat panes**: `subchat:started` → collapsible pane "🤖↔🤖 A ↔ B —
   negotiating"; `subchat:message` streams; `subchat:closed` → done/stuck chip + summary.
   - Acceptance: pane updates live while a second client watches; A2A text is mono/terminal-styled

5. **Trust signals**: `disclosure:logged` → "🔒 shared N · withheld M (out of scope)" line in the subchat.
   - Acceptance: line renders with real counts when a disclosure arrives

6. **Status**: agent status pill from `agent:status`.
   - Acceptance: pill shows `negotiating…` during a subchat

7. **Network** `/network`: agent nodes; solid edge=trusted, dashed/glow=discovered;
   own agent highlighted; live `network:updated`. Any lib or hand-rolled SVG.
   - Acceptance: ≥4 nodes, 2 visually distinct edge types (screenshot in PR)

8. **Resilience**: socket reconnects with stored token; Bearer on all REST.
   - Acceptance: kill server → restart → client rejoins without re-login

## Boundaries

**In scope:** all of `apps/web/**` (including scaffolding it), `lib/socket.ts`,
optional utils tests inside apps/web.

**Out of scope:**
- Any backend file — file `[D1]`/`[D2]`/`[D3]` issues instead
- Changing event payloads — contract issues only
- SSR auth complexity — client-side guard is fine

## Constraints

- If `@asymmetry/shared` resolves in the workspace use it; else copy §1 types
  to `lib/types.ts` and note it in the PR — don't block on it
- Design for the demo script first (PROJECT.md §Demo Script), generic second
- The UI is also operated by external agents (Muse / Claude computer use /
  OpenAI agent) acting as the user (README "Vision"). Login, task input/send,
  task list and results need visible text labels and stable `aria-label`s
  (or `data-testid`), and no hover-only or icon-only critical controls

## Acceptance Criteria

- [ ] `npm run build` + `npx tsc --noEmit` green, output in PR
- [ ] Login → task → chat round-trip works against real server
- [ ] Subchat pane + disclosure line + network edges all demo-able
- [ ] Mock SocketClient lets every page render without backend
- [ ] No files touched outside `apps/web/`
