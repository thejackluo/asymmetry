# Status: product roadmap

Plan: `docs/PRODUCT-PLAN.md`. Rules for working on it: `docs/EXECUTION-BRIEF.md`.
Each session takes one item, sets it to `in progress` with its branch, and updates this file in its PR.

States: `todo` · `in progress` · `in review` · `done` · `blocked`

## Phase 1: closed beta (one campus, housing)

| # | Item | Depends on | State | Branch / PR | Notes |
|---|---|---|---|---|---|
| 1.1 | Postgres, migrations, deploy, CI, observability | — | todo | | Must land first |
| 1.2 | Real accounts (signup, email verification, sessions, deletion) | 1.1 | todo | | Removes auto-register in `auth.ts` |
| 1.3 | Connections (invites, requests, block) | 1.1 | todo | | Today `trust_edges` is written only by `seed.ts` |
| 1.4 | Field registry, onboarding, memory page | 1.1 | todo | | Replaces hardcoded `ALLOWED_FIELDS` in `scope.ts` |
| 1.5 | Owner in the loop (approve mode, notifications, async tasks) | 1.4 | todo | | |
| 1.6 | Scope confirmation, receipts, results, intros | 1.5 | todo | | |
| 1.7 | Beta hardening (budgets, admin, feedback) | 1.2–1.6 | todo | | |

## Phase 2: plug-in agents

| # | Item | Depends on | State | Branch / PR | Notes |
|---|---|---|---|---|---|
| 2.1 | Public API `/v1` | Phase 1 | todo | | |
| 2.2 | OAuth 2.1 authorization server | 2.1 | todo | | |
| 2.3 | Remote MCP server | 2.2 | todo | | |
| 2.4 | Async delivery and webhooks | 2.3 | todo | | |

## Phase 3: safe public launch

| # | Item | Depends on | State | Branch / PR | Notes |
|---|---|---|---|---|---|
| 3.1 | Privacy red-team suite and outbound PII checks | Phase 2 | todo | | Can start earlier; required CI check |
| 3.2 | Abuse and safety | 3.1 | todo | | |
| 3.3 | Cost and latency | Phase 2 | todo | | |
| 3.4 | More categories (jobs, cars) | 1.4 | todo | | |
| 3.5 | Mobile and legal | Phase 2 | todo | | |

## Baseline

Recorded by the first session: Node version, `npm run typecheck` and `npm test` results on main.

- (not recorded yet)

## Open decisions

From `docs/PRODUCT-PLAN.md`. Record the answer and date here once decided.

1. Hosted-agent app first or MCP-first: plan assumes app first. (open)
2. Default release mode after beta. (open)
3. Model provider: OpenAI only or pluggable. (open)
4. Contact sharing at intro time. (open)
5. Hop limit per category. (open)

## Log

- 2026-10-24: plan, execution brief and status tracker added.
