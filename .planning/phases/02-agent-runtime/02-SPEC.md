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

8. **Network search depth (1–2 handshakes)**: the originating agent picks
   peers by request. It asks directly trusted agents (hop 1) first. It widens
   to discovered agents (hop 2, friends-of-friends) when the request needs a
   wider net (housing, cars, jobs) or hop 1 returns too few options. Hop-2
   peers release only `public` facts (CONTRACTS §2; discovered is not a
   permission level). The total stays at ≤4 peers per task (IMPLEMENTATION-DECISIONS §5).
   - Current: nothing
   - Target: `report_to_human` summary lists a couple of options, each with a
     warm-intro *proposal*; nothing is sent, booked or revealed without consent
   - Acceptance: scripted LLMClient on Alice's sublet task contacts trusted
     peers, then discovered Erin; never opens subchats with >4 peers; Erin's
     replies contain only public facts

9. **External agent as the human**: the task may be opened by the user's own
   external agent (Muse / Claude computer use / OpenAI agent) driving the web
   app as that user. The runtime treats it exactly like the human: same
   authenticated identity, same task scope. It adds no new API or contract.

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
