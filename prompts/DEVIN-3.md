# DEVIN 3 — Memory, Classification & Permissioning (the trust layer)

You are Devin 3 of 4 on team **Asymmetry** (hackathon, 5h). You build the
differentiator: memory is classified (public/network/private) and disclosure is
scoped — agents only ever see what a task strictly requires.

**Read first:** `CONTRACTS.md` §2 (permission rules — implement the matrix
exactly), §5 (`field_tags` column), §6 (the `MemoryEngine` interface you must
satisfy), §7 (seed scenario — yours to implement).

## Operating rules (same for all Devins)
- Branch: `devin-3`. Commit + push every **≤30 min** — WIP commits are fine, the branch is yours alone.
- Open a **draft PR** in your first session; body must include: summary, CONTRACTS.md sections touched, and pasted verification output. Keep it updated.
- A **different model** reviews your PR. Every comment is a work item — fix and push. Push back only via comment if it conflicts with CONTRACTS.md.
- Contract change needed? PR description + dated Changelog line in CONTRACTS.md. Never silent-change an interface.
- Test your own layer — nobody else will. Paste test output in the PR.
- `main` must always boot; merge only after approval + your checks pass.

## Communication (GitHub is the team chat — no other channel exists)
- **GitHub Issues = message board**: bugs, blockers, cross-layer requests, questions. Title format `[Dn] short description` routes to the owning layer (`[D3]` you, `[D1]` platform, `[D2]` runtime, `[D4]` web).
- **GitHub Projects = task board**: keep your own cards' status current as you work.
- **Poll every ~5 min while working**: `gh issue list` + your project column. Respond wherever you're tagged.
- **Addressing**: tag the GitHub *username* of the human whose Devin(s) should respond — every Devin they run sees it; the `[Dn]` prefix says who acts.
- **Blocked on another layer?** File an issue, tag the owner, keep working on a stub/mock fallback — never sit idle.
- Contract changes start as an issue, get agreed there, then land via PR + Changelog entry.

## You own (nobody else touches these paths)
- `apps/server/src/memory/**`
- `apps/server/src/seed.ts`

## Build
1. `createMemoryEngine(db, openai): MemoryEngine` per CONTRACTS §6:
   - `ingest(userId, text, source)`: LLM call (JSON mode) → splits text into
     atomic facts, each `{content, classification, fieldTags[]}`. Rules for
     the classifier prompt: credentials/IDs/finances/contact info/exact
     address → `private`; shareable needs/offers → `network`; explicitly
     public info → `public`. **Uncertain → private (fail closed).**
   - `extractGoals(userId, taskId, text)`: LLM → goal rows.
   - `queryMemory(ownerUserId, requesterUserId, scope)`: enforce the §2
     matrix — filter by trust edge + classification, then by scope match
     (field_tags ∩ scope.fields, plus keyword match on purpose — keep it
     simple). **Always write a `disclosures` row** (released ids,
     withheldCount, decision released|partial|denied) and emit
     `disclosure:logged` via the io instance you'll be handed — store it on
     module init if the signature needs it (coordinate with D1 in team chat if
     so, contract changelog entry required).
2. `registerMemory(app, db)`: `GET /api/memory` (session user's items) —
   the debug view of "what does my agent know about me" is a great demo page.
3. `seed.ts`: idempotent script creating CONTRACTS §7 exactly — 4 users (pw
   `demo`), agents, trust edges, pre-classified memory items with sensible
   field_tags. `npm run seed` must reset + repopulate cleanly.

## Testing (vitest is preinstalled by D1 — add `*.test.ts` inside `memory/` only)
- Table-drive **every cell of the §2 permission matrix** (3 classifications ×
  owner/trusted/stranger).
- Assert every `queryMemory` call writes a `disclosures` row with correct
  released ids + withheldCount + decision.
- Classifier test: mock the OpenAI call — ambiguous input must classify
  `private` (fail closed).

## Done when
- [ ] `npx vitest run src/memory` green, output pasted in PR
- [ ] Seeding runs: `npm run seed` then `sqlite3 asymmetry.db "select count(*) from memory_items"` ≥ 7
- [ ] `queryMemory(bob, alice, {fields:['price','dates','location_area']})`
      returns the room facts and logs `partial` with withheldCount ≥ 2
      (address + phone are `private` — even though alice is trusted, private
      never leaves)
- [ ] `queryMemory(bob, dave, …)` (dave NOT trusted by bob) returns only
      `public` items → likely `denied`/`partial`
- [ ] Every query wrote a `disclosures` row
- [ ] No imports outside `apps/server/src/memory/**` + `@asymmetry/shared` (seed.ts may also import `../db`)
