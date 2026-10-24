# PROJECT.md — Asymmetry

Team: Jack (Devin 1, coordinator); Bayzhan (Devin 2); Jad (Devin 3); Akash (Devin 4).

> GSD project charter. Last updated: 2026-10-24 (spec freeze).

## What This Is

Asymmetry is a web app where every human user has a personal AI agent — a
"digital twin" that holds their memory, goals, and needs. Agents talk to each
other over a socket network to discover mutually beneficial opportunities
(jobs, housing, buyers/sellers, warm introductions) that already exist inside
the extended social graph but are invisible to the humans in it.

Demo framing for judges: "Facebook/WhatsApp for AI agents — your agent makes
friends, asks around, and comes back with opportunities — while only ever
sharing what a task strictly requires."

## Core Value

**Scoped-trust agent negotiation.** If everything else fails, this must work:
one user's agent asks another user's agent for help, the second agent releases
only the information that (a) its memory classification permits and (b) the
task scope requires — and the whole exchange is visible to the humans.

## Requirements

### Validated

(None yet — hackathon build, nothing shipped)

### Active

Full list with IDs in `.planning/REQUIREMENTS.md`. Summary:

- [ ] Username/password login → session token → socket auth
- [ ] Task list + per-task human↔agent chat
- [ ] Agent runtime: clarifies requirements, pursues goals, reports done/stuck
- [ ] Agent↔agent subchats (pair + group) over Socket.IO, visible live in UI
- [ ] Memory classification: public / network / private (fail-closed)
- [ ] Scoped disclosure engine + disclosure audit log
- [ ] Network page: trusted vs discovered agents
- [ ] Seeded demo scenario (Georgia Tech sublet — see CONTRACTS.md §7)

### Out of Scope

- Real "digital twin" ingestion (Gmail/calendar/Muse sync) — memory is seeded
  + user chat only. Reason: no time, not needed for the demo.
- Multi-device sync, logout, password reset, email verification — demo only.
- E2E encryption / real auth hardening — explicitly out for a hackathon.
- Mobile responsiveness beyond "readable on a laptop."
- Production OpenAI rate-limit handling, retries beyond one try.

## Context

- Fresh greenfield repo. Zero code at spec time.
- 4 Devin agents build in parallel against `CONTRACTS.md` (frozen interfaces —
  types, socket events, REST, DB schema, permission matrix, seed data).
- OpenAI API for agent intelligence: `OPENAI_API_KEY` + `OPENAI_MODEL`
  (default `gpt-4o-mini`).
- Team coordination is fully async through GitHub (see OPERATING-RULES.md).

## Constraints

- **Timeline**: ~5h total, ~3h of autonomous build. Hard deadline — cut scope,
  never cut the core value.
- **Stack**: npm-workspaces monorepo. `apps/web` Next.js+TS+Tailwind,
  `apps/server` Node+Express+Socket.IO+TS, `packages/shared` TS types,
  SQLite via `better-sqlite3`. Locked — do not re-litigate.
- **Budget**: minimize OpenAI spend — small model, short prompts, max-turn
  guards on A2A loops.
- **Parallelism**: zero shared file ownership across Devins; the only allowed
  coordination surface is CONTRACTS.md + GitHub issues.
- **Security**: secrets only via `.env` (gitignored). Never log or commit keys.

## Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| K1 | Hybrid agent runtime — chat completions for dialogue + OpenAI function calling for `query_memory`/`open_subchat`/`send_subchat_message`/`report_to_human` | Permissioning is real: withheld data never enters the model's context, because it never leaves the DB unless a tool returns it |
| K2 | Memory classification at ingest, not at query | Write-time LLM classification with `field_tags` makes scoped queries cheap and auditable |
| K3 | Fail closed: ambiguous → `private` | Trust layer is the product; over-sharing once is a demo-killer |
| K4 | Subchats are first-class persisted entities | UI needs to replay/show A2A threads; "discovered" network edges derive from subchat participation |
| K5 | Devins own disjoint path trees; `index.ts` has fixed extension points (`registerAgents`, `registerMemory`) | Eliminates the biggest parallel-merge hazard |
| K6 | Auto-register on login (no signup flow) | One less page; demo onboarding friction = 0 |
| K7 | "Discovered" edges derived, not stored | One less write path; always consistent with subchat history |
| K8 | Simplified GSD: Plan (discussion and specs) → Execute (phase plans, tests, autonomous PRs, cross-model review, and ship) | No human gates during the hackathon |

## Demo Script (win condition — verbatim path)

1. Seed: `npm run seed` (alice, bob, carol, dave — CONTRACTS.md §7).
2. Open app, log in as `alice` / `demo`.
3. New task: "Find a summer sublet near Georgia Tech, May–Aug, under $1200/mo."
4. Alice's agent asks ≤2 clarifying questions (or proceeds if seeded memory
   already answers them).
5. Agent opens subchat with Bob's agent → negotiation messages stream live.
6. Bob's agent calls `query_memory` → releases room facts (network-classified),
   withholds address + phone (private) → `disclosure:logged` shows
   "shared 3 · withheld 2".
7. Alice's agent reports: "Bob has a room 0.4mi from GT, $950/mo, May 15–Aug
   10. Want a warm intro?"
8. Open `/network` — bob/carol solid (trusted), any new participant dashed
   (discovered).
9. Stretch: second task about buying Dave's Civic pulls Carol's mechanic
   knowledge into a 3-agent group subchat.

## Definition of Done (whole project)

- [ ] Demo script runs live end-to-end on seed data
- [ ] Human↔agent and agent↔agent messages are visually distinct
- [ ] Out-of-scope info request → visible withholding (Disclosure row + UI line)
- [ ] Network page: ≥3 trusted + ≥1 discovered agent rendered
- [ ] `npm run dev` boots everything; `npm test` is green
- [ ] All 4 phase plans' acceptance criteria pass
