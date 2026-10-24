# Phase 4: Frontend — Specification

**Created:** 2026-10-24 · **Owner:** Devin 4 · **Requirements:** UI-01…10 locked

## Goal

Ship the entire visual product: login, a tasks page where human↔agent chat
and live agent↔agent subchats are unmistakably different, and a network page
showing trusted vs discovered agents — all over Socket.IO per CONTRACTS §3/§4.

## Background

You own everything judges see (`apps/web/**`). Backend is built in parallel —
your socket layer goes behind a `SocketClient` interface with a mock so you
never block. Dark/hacker aesthetic; Tailwind only; no component library.

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

## Acceptance Criteria

- [ ] `npm run build` + `npx tsc --noEmit` green, output in PR
- [ ] Login → task → chat round-trip works against real server
- [ ] Subchat pane + disclosure line + network edges all demo-able
- [ ] Mock SocketClient lets every page render without backend
- [ ] No files touched outside `apps/web/`
