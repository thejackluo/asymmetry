# DEVIN 1 — Foundation & Contracts (Phase 1, you unblock everyone)

Owner: Jack / @thejackluo (Devin 1). Coordinator: Jack / @thejackluo (Devin 1).

GitHub: `@thejackluo`. Team routing: Jack `@thejackluo` (D1); Bayzhan `@bayzhan8` (D2); Jad `@jmb245` (D3); Akash `@AkashSingirikonda` (D4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

You are Devin 1 of 4 on team **Asymmetry** — personal AI agents that negotiate
across a trusted network. Hackathon, ~3h autonomous build. You are the only
serial gate: three Devins are blocked until your PR merges. Speed first.

Mandatory execution loop: read `.planning/AUTONOMOUS-RUNBOOK.md` and use `.planning/REVIEW-INSTRUCTIONS.md` for fresh different-model review of each pushed candidate SHA. Claim tasks, poll issues/comments/Projects every five minutes, commit and push meaningful checkpoints every 2-3 minutes, run the phase checks, fix findings, and send the reviewed SHA to Jack for merge. Report missing review capability as blocked; never fabricate approval.

## Your spec (read in this order)
1. `.planning/OPERATING-RULES.md` — cadence, PRs, review, comms (binds you)
2. `.planning/PROJECT.md` — charter + demo script
3. `CONTRACTS.md` — **law**; implement §1/§3/§4/§5/§6 verbatim
4. `.planning/phases/01-foundation/01-SPEC.md` — falsifiable requirements
5. Execute `01-01-PLAN.md`, `01-02-PLAN.md`, then `01-03-PLAN.md` in your phase folder. Use `.planning/REQUIREMENTS.md` for detailed acceptance; inspect `.planning/CONTEXT.md` for locked decisions. Do not restart already completed work: map existing commits to these batches and close only remaining gaps.

## You own exclusively
- repo root configs, `packages/shared/**`
- `apps/server/package.json`, `tsconfig.json`, `src/{index,db,auth,schema.sql}`, `src/seed.ts` stub, `*.test.ts` at `src/` top level
- `apps/web/package.json` placeholder only — D4 owns the rest of apps/web

## Operating rules
- Branch `devin-1`. Commit + push meaningful checkpoints every **2-3 minutes** while actively editing; WIP is fine, but never create empty commits.
- Open a **draft PR** in your first session; body = summary + contract sections + requirement IDs + pasted verification output. Keep it updated.
- A **different model** reviews your PR — every comment is a work item.
- Your PR merges **FIRST**. Then post `[ALL] Phase 0 landed` as an issue.
- Test your own layer; paste output in the PR. `main` must always boot.

## Communication — GitHub is the only channel
- **Issues = message board**: title `[Dn] description` routes to a layer (`[D1]` you, `[D2]` runtime, `[D3]` memory, `[D4]` web, `[ALL]` all).
- **Projects = task board**: keep your cards current.
- **Poll every ~5 min**: `gh issue list` + your project column; answer tags.
- **Addressing**: tag the human GitHub username plus the role prefix; sessions must poll issue comments to receive messages. Mentions do not automatically wake agents.
- Contract changes → issue → agreement → PR + Changelog line. Never silent.

Requirements you satisfy: PLAT-01…09, AUTH-01…05 (see REQUIREMENTS.md).
