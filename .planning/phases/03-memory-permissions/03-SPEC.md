# Phase 3: Memory, Classification & Permissioning — Specification

**Created:** 2026-10-24 · **Owner:** Devin 3 · **Requirements:** MEM-01…05, PERM-01…05, SEED-01…02 locked

## Goal

Ship `createMemoryEngine` so user chat becomes classified memory
(public/network/private, fail-closed) and every cross-agent info request is
trust-checked + scope-filtered + audit-logged — plus the §7 seed that makes
the demo work.

## Background

This is the differentiator. The permission matrix (CONTRACTS §2) is enforced
server-side, never by the LLM: withheld content must be physically absent
from tool responses, so no prompt injection can leak it.

## Requirements

1. **Ingest classifier**: `ingest(userId, text, source)` → LLM (JSON mode) →
   atomic `{content, classification, fieldTags[]}` → `memory_items` rows.
   - Acceptance: "my SSN is 123-45-6789 and I need a sublet" → ≥2 rows, SSN `private`, sublet `network`

2. **Fail closed**: unparseable/ambiguous → `private`.
   - Acceptance: test with mock LLM returning garbage → classification `private`

3. **Goals**: `extractGoals` → `goals` rows.
   - Acceptance: task text containing "find X under $Y" yields an open Goal row

4. **queryMemory**: §2 matrix (owner=all / trusted=public+network / stranger=public)
   → scope filter (field_tags ∩ scope.fields + purpose keywords) → disclosures row.
   - Acceptance: all 9 matrix cells pass as table-driven tests; `partial`
     returns only releasable items + correct withheldCount

5. **Disclosure audit**: every query → disclosures row + `disclosure:logged`
   emit (engine takes `io` — see CONTRACTS Changelog entry).
   - Acceptance: row exists per call; event observed on socket

6. **Seed**: `seed.ts` wipes + recreates §7 exactly — users pw `demo`, agents,
   5 trust edges, ≥7 pre-classified memory items with field_tags.
   - Acceptance: idempotent (`npm run seed` twice → same counts); demo path
     query returns expected partial disclosure

## Boundaries

**In scope:** `src/memory/**`, `src/seed.ts`, `GET /api/memory` debug endpoint
inside `registerMemory`.

**Out of scope:**
- Triggering the agent loop — D2 calls your interface
- UI — D4 reads your events
- Embedding-based scope matching — v2; keywords + tags are enough for the demo

## Constraints

- NEVER trust LLM output for the permission decision — classification guides
  filtering; the matrix enforces it in code
- Mock OpenAI in all tests — no live key needed in CI
- `queryMemory` must be pure-ish: only DB reads + disclosures insert + emit

## Acceptance Criteria

- [ ] `npx vitest run src/memory` green — matrix, disclosures, fail-closed
- [ ] `npm run seed` → `select count(*) from memory_items` ≥ 7, idempotent
- [ ] `queryMemory(bob, alice, {fields:['price','dates','location_area']})` →
      `partial`, withheldCount ≥ 2 (address + phone withheld despite trust)
- [ ] `queryMemory(bob, dave, …)` (untrusted) → only public/denied
- [ ] No files touched outside `src/memory/**` + `src/seed.ts`
