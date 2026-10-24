# ASYMMETRY — Start Here

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

All sessions start with `AGENTS.md` and `.planning/AUTONOMOUS-RUNBOOK.md`; independent reviewers read `.planning/REVIEW-INSTRUCTIONS.md`.

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

Personal AI agents ("digital twins") that negotiate across a trusted network
to surface mutually beneficial opportunities — jobs, housing, sales, warm
intros — while sharing only what each task strictly requires.

This repo is spec-first under a **simplified GSD** loop:

```
PLAN: discussion + specs
  -> EXECUTE: phase plans + tests + push every 2-3min + PR + review + ship
```

## Read order

| File | What it is |
|---|---|
| `.planning/PROJECT.md` | charter, core value, demo script, definition of done |
| `.planning/CONTEXT.md` | locked decisions from combined discussion/planning |
| `.planning/REQUIREMENTS.md` | 40+ falsifiable reqs with IDs + traceability |
| `.planning/PLAN-REVIEW.md` | GSD source coverage and planning-gap review |
| `.planning/ROADMAP.md` | 5 phases, path ownership, timeline |
| `.planning/OPERATING-RULES.md` | cadence, PRs, review, GitHub-issue comms |
| `CONTRACTS.md` | **frozen interfaces** — types, socket events, REST, DDL, permission matrix, seed data |
| `.planning/phases/NN-*/NN-SPEC.md` | what each phase must deliver (falsifiable) |
| `.planning/phases/NN-*/NN-01-PLAN.md` | executable task contracts per Devin |
| `.planning/STATE.md` | live project memory |
| `prompts/DEVIN-*.md` | paste-ready kickoff prompt per Devin |

## The four Devins

| Devin | Phase | Owns |
|---|---|---|
| D1 | 01-foundation | scaffold, shared contracts, DB, auth |
| D2 | 02-agent-runtime | agent loop, A2A subchats, LLM tools |
| D3 | 03-memory-permissions | classifier, scoped disclosure, seed |
| D4 | 04-frontend | entire Next.js app |

D1 merges first (~25 min); D2/D3/D4 branch off `main` and build in parallel;
Phase 5 integrates. Kick each off with its username-named Markdown file in `prompts/`.

Each owner now has three bounded PLAN batches, not one large plan.
Follow the dependency waves in ROADMAP.md and preserve completed implementation.
All 51 original requirement IDs have detailed acceptance contracts.
