# Phase 5: Integration & Demo Hardening — Specification

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

**Created:** 2026-10-24 · **Owner:** all Devins · **Requirements:** SEED-02 + project DoD

## Goal

Merge all phase PRs, prove the demo script end-to-end on `main`, fix
integration bugs in the owning layer, and freeze a rehearsal path.

## Success Criteria

- [ ] Fresh clone → `npm install && npm run seed && npm run dev` → demo works
- [ ] Demo script (PROJECT.md) runs twice back-to-back, no code edits between
- [ ] Fresh disposable DB = clean demo state; no destructive shared reset
- [ ] `npm test` green on `main`
- [ ] P0/P1 issues all closed

## Protocol

- Integration bugs → `[Dn]`-tagged issues to the owning layer; owner fixes on
  their branch, PRs back to `main`
- D4 owns all Phase-3 polish (animations, styling)
- Pair and group protocol tests are required. Additional group-demo polish
  follows the base demo; it does not replace the group privacy test.
