# ROADMAP.md — Asymmetry

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

## Overview

Five phases, four parallel Devins. Phase 1 (foundation) is the only serial
gate — it freezes contracts in code and gives everyone a runnable skeleton.
Phases 2–4 run fully in parallel on disjoint path trees; Phase 5 merges and
hardens the demo. Simplified GSD: these phases ARE the plan — no separate
discuss step, no human gates until demo rehearsal.

## Path ownership (hard boundaries — violating = contract breach)

| Devin | Owns exclusively |
|---|---|
| D1 | repo root configs, `packages/shared/**`, `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/src/{index,db,auth,schema.sql}` + `*.test.ts` at `src/` top level |
| D2 | `apps/server/src/agents/**` |
| D3 | `apps/server/src/memory/**`, `apps/server/src/seed.ts` |
| D4 | `apps/web/**` |

## Phases

- [ ] **Phase 1: Foundation & Contracts** — runnable skeleton + frozen types
- [ ] **Phase 2: Agent Runtime & A2A Messaging** — the negotiation brain
- [ ] **Phase 3: Memory, Classification & Permissioning** — the trust layer
- [ ] **Phase 4: Frontend** — the entire visual demo
- [ ] **Phase 5: Integration & Demo Hardening** — merge, seed, rehearse

> Phases 2, 3, 4 all depend only on Phase 1 and execute **concurrently**.
> Numbering reflects dependency order, not chronology.

### Phase 1: Foundation & Contracts — DEVIN 1

**Goal**: `npm run dev` boots an authed socket server on a migrated SQLite DB,
with all contract types importable from `@asymmetry/shared` and no-op
extension points where D2/D3 plug in.
**Depends on**: nothing (first; everyone waits)
**Requirements**: PLAT-01…09, AUTH-01…05
**Success Criteria**:
 1. `POST /api/login` returns `{token, user}` for a new username
 2. Socket client connects with that token and joins only its authenticated user room
 3. Disposable SQLite database contains all 12 current contract tables
 4. `npm test` runs the auth smoke test green
 5. PR merged to `main` — team notified via issue comment "Phase 0 landed"
**Plans**: 1 plan — `phases/01-foundation/01-01-PLAN.md`

### Phase 2: Agent Runtime & A2A Messaging — DEVIN 2

**Goal**: agents autonomously clarify, open pair/group subchats, negotiate via
tool calls, and report done/stuck — with a hard turn cap.
**Depends on**: Phase 1 (codes against `stubMemoryEngine` until Phase 3 lands;
zero code change when it swaps)
**Requirements**: A2A-01…09
**Success Criteria**:
 1. Human sends the sublet task → agent clarifies or opens a subchat in one loop
 2. A→B subchat: ≥3 `subchat:message` events + `subchat:closed` with summary
 3. Runaway A2A loop halts at turn cap (test proves it)
 4. `report_to_human` flips task status; `agent:status` events fire
 5. `npx vitest run src/agents` green
**Plans**: 1 plan — `phases/02-agent-runtime/02-01-PLAN.md`

### Phase 3: Memory, Classification & Permissioning — DEVIN 3

**Goal**: every user message becomes classified memory; every cross-agent info
request is permission-checked, scope-filtered, and audit-logged.
**Depends on**: Phase 1
**Requirements**: MEM-01…05, PERM-01…05, SEED-01…02
**Success Criteria**:
 1. All 9 cells of the §2 permission matrix pass as table-driven tests
 2. `queryMemory(bob, alice, room-scope)` → `partial`, withheldCount ≥2
 3. Every query wrote a `disclosures` row; `disclosure:logged` emitted
 4. `npm run seed` idempotently creates the §7 scenario
 5. `npx vitest run src/memory` green
**Plans**: 1 plan — `phases/03-memory-permissions/03-01-PLAN.md`

### Phase 4: Frontend — DEVIN 4

**Goal**: two pages that make the demo undeniable — task chat with live A2A
subchat panes + a network graph distinguishing trusted vs discovered agents.
**Depends on**: Phase 1 (mocks socket layer until backend lands)
**Requirements**: UI-01…10
**Success Criteria**:
 1. Login → create task → chat round-trips over sockets
 2. A2A subchat pane updates live and is visually distinct from human chat
 3. Disclosure line ("withheld N") renders in subchat
 4. `/network` renders ≥4 nodes, 2 edge styles, live updates
 5. `npm run build` + `tsc --noEmit` green
**Plans**: 1 plan — `phases/04-frontend/04-01-PLAN.md`

### Phase 5: Integration & Demo Hardening — ALL

**Goal**: everything merged, demo script rehearsable, backup plan ready.
**Depends on**: Phases 2+3+4
**Requirements**: SEED-02, all project DoD checkboxes
**Success Criteria**:
 1. All phase PRs merged; `main` boots clean from fresh clone
 2. Demo script runs end-to-end twice in a row without code edits
 3. Reset procedure documented (re-seed = clean demo state)
 4. Any P0/P1 bugs filed as issues, owned, and fixed
**Plans**: coordinated live — integration bugs go to the owning layer's Devin
via `[Dn]`-tagged issues.

## Timeline

```
0:00 ─ Phase 1 (D1 solo)          ─ 0:25
0:25 ─ Phases 2‖3‖4 (parallel)    ─ 2:05   ← push checkpoints every 2-3 min
2:05 ─ Phase 5 integration        ─ 2:45
2:45 ─ demo hardening + rehearsal ─ 3:20+
```
