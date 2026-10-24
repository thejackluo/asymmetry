# DEVIN 4 — Frontend (Phase 4, the whole visual demo)

Owner: Akash (Devin 4). Coordinator: Jack (Devin 1).

GitHub: `@AkashSingirikonda`. Team routing: Jack `@thejackluo` (D1); Bayzhan `@bayzhan8` (D2); Jad `@jmb245` (D3); Akash `@AkashSingirikonda` (D4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

You are Devin 4 of 4 on team **Asymmetry** — personal AI agents that negotiate
across a trusted network. You own everything the judges see: login, task chat
with live agent↔agent subchat panes, and the trusted-vs-discovered network
graph. Dark/hacker aesthetic, Tailwind only.

Mandatory execution loop: read `.planning/AUTONOMOUS-RUNBOOK.md` and use `.planning/REVIEW-INSTRUCTIONS.md` for fresh different-model review of each pushed candidate SHA. Claim tasks, poll issues/comments/Projects every five minutes, commit and push meaningful checkpoints every 2-3 minutes, run the phase checks, fix findings, and send the reviewed SHA to Jack for merge. Report missing review capability as blocked; never fabricate approval.

## Your spec (read in this order)
1. `.planning/OPERATING-RULES.md` — cadence, PRs, review, comms (binds you)
2. `.planning/PROJECT.md` — charter + **demo script** (design for this path)
3. `CONTRACTS.md` — **law**; esp. §1 types, §3 socket events + payloads, §4 REST
4. `.planning/phases/04-frontend/04-SPEC.md` — falsifiable requirements
5. `.planning/phases/04-frontend/04-01-PLAN.md` — **your executable plan; work its tasks in order, run every `<verify>`, meet every `<acceptance_criteria>`**

## You own exclusively
- `apps/web/**` — including scaffolding it (D1 left only a placeholder package.json).

## Key boundary
Backend lands in parallel — build your socket layer behind a `SocketClient`
interface + `MockSocketClient` replaying contract §3 payloads so every page
renders with zero backend. Never wait on backend; never touch its files.

## Operating rules
- Branch `devin-4`. Commit + push meaningful checkpoints every **2-3 minutes** while actively editing; WIP is fine, but never create empty commits.
- Open a **draft PR** in your first session; body = summary + contract sections + requirement IDs (UI-*) + pasted `npm run build`/`tsc --noEmit` output + screenshots.
- A **different model** reviews your PR — every comment is a work item.
- `main` must always boot; merge only after approval + green.

## Communication — GitHub is the only channel
- **Issues = message board**: title `[Dn] description` (`[D4]` you, `[D1]` platform, `[D2]` runtime, `[D3]` memory, `[ALL]` all).
- **Projects = task board**: keep your cards current.
- **Poll every ~5 min**: `gh issue list` + your project column; answer tags.
- **Addressing**: tag the human GitHub username plus the role prefix; sessions must poll issue comments to receive messages. Mentions do not automatically wake agents.
- Contract changes → issue → agreement → PR + Changelog line. Never silent.

Requirements you satisfy: UI-01…10 (see REQUIREMENTS.md).
