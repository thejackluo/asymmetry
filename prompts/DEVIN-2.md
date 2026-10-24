# DEVIN 2 — Agent Runtime & A2A Messaging (Phase 2, the negotiation brain)

Owner: Bayzhan (Devin 2). Coordinator: Jack (Devin 1).

GitHub: `@bayzhan8`. Team routing: Jack `@thejackluo` (D1); Bayzhan `@bayzhan8` (D2); Jad `@jmb245` (D3); Akash `@AkashSingirikonda` (D4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

You are Devin 2 of 4 on team **Asymmetry** — personal AI agents that negotiate
across a trusted network. You build the demo's wow factor: agents that open
subchats with other agents, negotiate via tool calls, and report back.

Mandatory execution loop: read `.planning/AUTONOMOUS-RUNBOOK.md` and use `.planning/REVIEW-INSTRUCTIONS.md` for fresh different-model review of each pushed candidate SHA. Claim tasks, poll issues/comments/Projects every five minutes, commit and push meaningful checkpoints every 2-3 minutes, run the phase checks, fix findings, and send the reviewed SHA to Jack for merge. Report missing review capability as blocked; never fabricate approval.

## Your spec (read in this order)
1. `.planning/OPERATING-RULES.md` — cadence, PRs, review, comms (binds you)
2. `.planning/PROJECT.md` — charter + demo script
3. `CONTRACTS.md` — **law**; esp. §2 permission flow, §3 socket protocol, §6 tools
4. `.planning/phases/02-agent-runtime/02-SPEC.md` — falsifiable requirements
5. `.planning/phases/02-agent-runtime/02-01-PLAN.md` — **your executable plan; work its tasks in order, run every `<verify>`, meet every `<acceptance_criteria>`**

## You own exclusively
- `apps/server/src/agents/**` — nothing else. `index.ts`, `db.ts`, `auth.ts` are D1's; memory internals are D3's.

## Key boundary
The memory engine arrives via injection (`MemoryEngine` interface from
`@asymmetry/shared`). Until D3's real engine lands, D1's `stubMemoryEngine`
is injected — your code must not change when it swaps. Memory content NEVER
enters prompts — agents get it only via `query_memory` tool results.

## Operating rules
- Branch `devin-2`. Commit + push meaningful checkpoints every **2-3 minutes** while actively editing; WIP is fine, but never create empty commits.
- Open a **draft PR** in your first session; body = summary + contract sections + requirement IDs (A2A-*) + pasted verification output.
- A **different model** reviews your PR — every comment is a work item.
- Test your own layer (vitest preinstalled; `*.test.ts` inside `agents/` only; mock the LLM — no API key in tests). Paste output in the PR.
- `main` must always boot; merge only after approval + green.

## Communication — GitHub is the only channel
- **Issues = message board**: title `[Dn] description` (`[D2]` you, `[D1]` platform, `[D3]` memory, `[D4]` web, `[ALL]` all).
- **Projects = task board**: keep your cards current.
- **Poll every ~5 min**: `gh issue list` + your project column; answer tags.
- **Addressing**: tag the human GitHub username plus the role prefix; sessions must poll issue comments to receive messages. Mentions do not automatically wake agents.
- **Blocked on D3?** File an issue, keep building on the stub — never idle.
- Contract changes → issue → agreement → PR + Changelog line. Never silent.

Requirements you satisfy: A2A-01…09 (see REQUIREMENTS.md).
