# STATE.md — Asymmetry project memory

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-24)

**Core value:** scoped-trust agent negotiation
**Current focus:** spec freeze → Phase 1 kickoff

## Current Position

Phase: 0 of 5 (planning complete, execution not started)
Plan: — 
Status: Ready to execute
Last activity: 2026-10-24 — spec package written and committed

Progress: [░░░░░░░░░░] 0%

## Next Actions

1. Devin 1 executes `phases/01-foundation/01-01-PLAN.md` → merge → post
   "Phase 0 landed" as a `[ALL]` issue comment.
2. Devins 2/3/4 branch off `main` and execute their phase plans in parallel.
3. Phase 5: integration on `main`.

## Decisions Log

- 2026-10-24: Stack locked — npm-workspaces monorepo (Next.js + Node/Socket.IO + SQLite + shared TS pkg)
- 2026-10-24: Agent runtime = hybrid (chat completions + function calling for memory/subchat/report tools)
- 2026-10-24: GSD installed locally (`.claude/`, v1.42.3); simplified loop adopted: Plan → Execute → Ship
- 2026-10-24: `.planning/` is committed to git — it IS the spec the Devins execute against

## Open Questions

(none — all decisions locked; new questions go in GitHub issues)

## Metrics

| Phase | Plans | Status | Owner |
|---|---|---|---|
| 1 — Foundation | 01-01 | pending | Devin 1 |
| 2 — Agent Runtime | 02-01 | pending | Devin 2 |
| 3 — Memory & Permissions | 03-01 | pending | Devin 3 |
| 4 — Frontend | 04-01 | pending | Devin 4 |
| 5 — Integration | — | pending | All |
