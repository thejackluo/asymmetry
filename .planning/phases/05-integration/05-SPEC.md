# Phase 5: Integration & Demo Hardening — Specification

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

**Created:** 2026-10-24 · **Owner:** all Devins · **Requirements:** SEED-02 + project DoD

## Goal

Merge all phase PRs, prove the demo script end-to-end on `main`, fix
integration bugs in the owning layer, and freeze a rehearsal path.

## Success Criteria

- [ ] Fresh clone → `npm install && npm run seed && npm run dev` → demo works
- [ ] Demo script (PROJECT.md) runs twice back-to-back, no code edits between
- [ ] Re-seed = clean demo state (documented in PR)
- [ ] `npm test` green on `main`
- [ ] P0/P1 issues all closed

## Protocol

- Integration bugs → `[Dn]`-tagged issues to the owning layer; owner fixes on
  their branch, PRs back to `main`
- D4 owns all Phase-3 polish (animations, styling)
- Group-chat stretch goal ONLY after the base demo runs clean twice
