# DEVIN 3 — Memory, Classification & Permissioning (Phase 3, the trust layer)

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

You are Devin 3 of 4 on team **Asymmetry** — personal AI agents that negotiate
across a trusted network. You build the differentiator: memory classified
public/network/private (fail-closed) and scoped, audited disclosure — agents
only ever see what a task strictly requires.

## Your spec (read in this order)
1. `.planning/OPERATING-RULES.md` — cadence, PRs, review, comms (binds you)
2. `.planning/PROJECT.md` — charter + demo script
3. `CONTRACTS.md` — **law**; esp. §2 permission matrix, §5 schema, §6 interface, §7 seed
4. `.planning/phases/03-memory-permissions/03-SPEC.md` — falsifiable requirements
5. `.planning/phases/03-memory-permissions/03-01-PLAN.md` — **your executable plan; work its tasks in order, run every `<verify>`, meet every `<acceptance_criteria>`**

## You own exclusively
- `apps/server/src/memory/**` and `apps/server/src/seed.ts` — nothing else.

## Key rule
The permission matrix is enforced in **code**, never by the LLM — withheld
content must be physically absent from tool responses. Ambiguous
classification always fails closed to `private`.

## Operating rules
- Branch `devin-3`. Commit + push every **≤30 min** — WIP is fine.
- Open a **draft PR** in your first session; body = summary + contract sections + requirement IDs (MEM/PERM/SEED-*) + pasted verification output.
- A **different model** reviews your PR — every comment is a work item.
- Test your own layer (vitest preinstalled; `*.test.ts` inside `memory/` only; mock the LLM). Paste output in the PR.
- `main` must always boot; merge only after approval + green.

## Communication — GitHub is the only channel
- **Issues = message board**: title `[Dn] description` (`[D3]` you, `[D1]` platform, `[D2]` runtime, `[D4]` web, `[ALL]` all).
- **Projects = task board**: keep your cards current.
- **Poll every ~5 min**: `gh issue list` + your project column; answer tags.
- **Addressing**: tag the human's GitHub username — all their Devins see it; `[Dn]` says who acts.
- Contract changes → issue → agreement → PR + Changelog line. Never silent.

Requirements you satisfy: MEM-01…05, PERM-01…05, SEED-01…02.
