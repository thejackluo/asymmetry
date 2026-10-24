# Phase 2: Agent Runtime & A2A Messaging — Specification

Owner: Bayzhan / @bayzhan8 (Devin 2). Coordinator: Jack / @thejackluo (Devin 1).

**Created:** 2026-10-24 · **Owner:** Devin 2 · **Requirements:** A2A-01…09 locked

## Goal

Implement `registerAgents` so each user's agent autonomously clarifies tasks,
opens pair/group subchats with other users' agents, negotiates through OpenAI
tool calls, and reports done/stuck to its human — all persisted and streamed
per CONTRACTS §3.

## Background

The demo's wow factor is watching A2A traffic happen live. Phase 1 delivers
socket plumbing, room joins, and a `stubMemoryEngine`; this phase is the only
one allowed inside `apps/server/src/agents/**`.

## Requirements

1. **Human inbox**: `chat:send` → persist Message → broadcast → kick agent loop.
   - Current: D1 stub does nothing
   - Target: full pipeline A2A-01
   - Acceptance: message row in DB + `chat:message` observed by a second client in the room

2. **Agent loop**: OpenAI (`OPENAI_MODEL`) with the 4 contract tools; executes
   tool calls until model returns a user-facing reply or `report_to_human`.
   - Current: nothing
   - Target: loop behind an injectable `LLMClient` interface (tests mock it)
   - Acceptance: a scripted LLMClient returning `open_subchat` + `send_subchat_message` produces real DB rows + socket emissions — no live API needed in test

3. **Subchat protocol**: `open_subchat` (pair/group) → rows + room + `subchat:started`; `send_subchat_message` → persist + emit + **trigger recipient loops**.
   - Current: nothing
   - Target: A2A ping-pong works between two seeded agents
   - Acceptance: ≥3 `subchat:message` events then `subchat:closed` with summary

4. **Runaway guard**: reserve turns per subchat before scheduling; at 12 agent
   messages stop invoking loops and notify the originating agent to report stuck.
   - Current: nothing
   - Target: hard cap
   - Acceptance: test with a mock that always replies → halts at ≤12, task ends `stuck`

5. **Status + reporting**: emit agent activity; only the originating agent
   may report its task done/stuck, without hiding other active negotiations.
   - Acceptance: `agent:status` `negotiating` observed during subchat; task row flips

6. **Concurrency**: inbound `info_request` while busy → new subchat, not a deadlock.
   - Acceptance: two concurrent subchats involving one agent both progress

7. **Persona prompt**: trusted identity plus current authorized scope; peer
   contexts exclude unrelated goals and main-thread histories.
   - Acceptance: prompt builder rejects private/unrelated context and peer instructions

## Boundaries

**In scope:** everything under `src/agents/**`; emitting all §3 events your
layer produces; calling `memory.queryMemory` via the injected `MemoryEngine`.

**Out of scope:**
- Permission logic itself — that's D3's engine; you call the interface
- `index.ts`, `db.ts`, `auth.ts` — D1's; file `[D1]` issues if something's missing
- `apps/web` — D4 renders what you emit
- Classifying user messages into memory — D3's `ingest` (call it if exposed; else file issue)

## Constraints

- Never put memory content into prompts — tools only (this is PERM/K1, the product)
- One OpenAI client instance; read key from env; no retries beyond 1
- Guard every LLM call path in tests via `LLMClient` mock — CI must not need `OPENAI_API_KEY`

## Acceptance Criteria

- [ ] `npx vitest run src/agents` green (mocked LLM; covers A2A-01,03,04,05,06)
- [ ] Live path works against real API when key present (manual verify, note in PR)
- [ ] Group subchat (3 agents) functional via test
- [ ] No files touched outside `src/agents/**`
