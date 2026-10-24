# STATE.md — Asymmetry project memory

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-10-24)

**Core value:** scoped-trust agent negotiation
**Current focus:** expanded acceptance contracts and bounded GSD execution batches

## Current Position

Phase: planning revision; foundation execution has started in a separate checkout
Plan: — 
Status: Ready to execute
Last activity: 2026-10-24 — detailed requirements published; per-role GSD batches updated

Progress: [░░░░░░░░░░] 0%

## Next Actions

1. Devin 1 maps existing work to foundation batches 01-01/02/03 → merge → post
   "Phase 0 landed" as a `[ALL]` issue comment.
2. Devins 2/3/4 reconcile updated requirements and execute their three batches in parallel.
3. Phase 5: integration on `main`.

## Decisions Log

- 2026-10-24: Stack locked — npm-workspaces monorepo (Next.js + Node/Socket.IO + SQLite + shared TS pkg)
- 2026-10-24: Agent runtime = hybrid (chat completions + function calling for memory/subchat/report tools)
- 2026-10-24: GSD installed locally (`.claude/`, v1.42.3); simplified loop adopted: Plan → Execute (including tests, review, and ship)
- 2026-10-24: `.planning/` is committed to git — it IS the spec the Devins execute against

## Open Questions

(none — all decisions locked; new questions go in GitHub issues)

## Metrics

| Phase | Plans | Status | Owner |
|---|---|---|---|
| 1 — Foundation | 01-01/02/03 | implementation underway; reconcile evidence | Jack / @thejackluo |
| 2 — Agent Runtime | 02-01/02/03 | reconcile active session status | Bayzhan / @bayzhan8 |
| 3 — Memory & Permissions | 03-01/02/03 | reconcile active session status | Jad / @jmb245 |
| 4 — Frontend | 04-01/02/03 | reconcile active session status | Akash / @AkashSingirikonda |
| 5 — Integration | 05-01 | pending | Jack coordinating all |
