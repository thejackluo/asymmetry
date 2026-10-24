# Phase 1: Foundation & Contracts — Specification

**Created:** 2026-10-24 · **Owner:** Devin 1 · **Requirements:** PLAT-01…09, AUTH-01…05 locked

## Goal

Go from empty repo to a runnable monorepo skeleton — workspaces, shared
contract package, SQLite schema, auth'd socket server — that unblocks three
parallel Devins without any of them editing the same file.

## Background

Repo currently contains only spec docs (`GST.md`, `CONTRACTS.md`, `.planning/`,
`prompts/`, `.claude/` GSD install). No `package.json`, no code. Three Devins
are blocked until this merges.

## Requirements

1. **Monorepo scaffold**: npm workspaces with `apps/web` (placeholder),
   `apps/server`, `packages/shared`.
   - Current: empty repo
   - Target: `npm install` at root resolves all workspaces; `npm run dev` boots server
   - Acceptance: `npm install && npm run dev` exits clean; `curl localhost:3001/health` (or any REST stub) responds

2. **Shared contract package** `@asymmetry/shared`
   - Current: types exist only as prose in CONTRACTS.md
   - Target: compilable TS exports of every §1 type, §3 event constants, §6 `MemoryEngine` + `stubMemoryEngine`
   - Acceptance: `import { MemoryEngine, Message } from '@asymmetry/shared'` compiles in apps/server; `stubMemoryEngine().queryMemory(...)` resolves ≥2 items

3. **SQLite layer**
   - Current: nothing
   - Target: `schema.sql` = CONTRACTS §5 DDL verbatim; `db.ts` opens `asymmetry.db`, applies schema idempotently (`CREATE TABLE IF NOT EXISTS` wrapper or guard), exports typed helpers
   - Acceptance: `sqlite3 asymmetry.db ".tables"` lists all 10 tables after boot

4. **Auth (REST + socket)**
   - Current: nothing
   - Target: `POST /api/login` auto-registers (bcrypt) → `{token, user}`; sessions table; `Authorization: Bearer` middleware; socket handshake auth → `socket.data.userId` + auto-join `user:{id}`/`agent:{id}`
   - Acceptance: unknown username → 200 + token; wrong password → 401; socket connect without token → error; with token → connect + rooms joined (smoke test proves it)

5. **Extension points + REST stubs**
   - Current: nothing
   - Target: `index.ts` boots Express+Socket.IO, mounts §4 REST (real queries where trivial, `[]` otherwise), calls `registerMemory(app,db)` and `registerAgents(io,db,memory)`; no-op stubs exist at `src/memory/index.ts`, `src/agents/index.ts`
   - Acceptance: server boots with stubs; D2/D3 later replace stub bodies only — index.ts untouched (grep their PR diffs to confirm)

6. **Test infra + deps for downstream Devins**
   - Current: nothing
   - Target: vitest + supertest configured in apps/server; all deps D2/D3 need preinstalled (`openai`, etc. — full list in plan)
   - Acceptance: `npm test` runs `auth.smoke.test.ts` green; `npx vitest run` works inside `src/agents/` and `src/memory/` (empty dirs pass)

## Boundaries

**In scope:** root configs, shared package, server scaffold+auth+db+stubs,
test harness, `.env.example`, git hygiene.

**Out of scope:**
- Any logic inside `agents/` or `memory/` beyond no-op exports — D2/D3's job
- Anything under `apps/web/` beyond a placeholder `package.json` — D4's job
- Seed content — D3 writes `seed.ts`; D1 only creates the stub + npm script
- Pretty logging, Docker, CI workflows — no time

## Constraints

- Phase-0 PR merges FIRST; optimize for mergeability over polish
- Copy DDL verbatim from CONTRACTS §5 — do not "improve" column names
- bcrypt via `bcryptjs` (pure JS, no native build pain on WSL)

## Acceptance Criteria

- [ ] `npm install && npm run dev` boots server on :3001
- [ ] Login auto-registers and returns token (curl output in PR)
- [ ] Socket auth + room join proven by `auth.smoke.test.ts`
- [ ] All 10 tables exist
- [ ] `@asymmetry/shared` imports compile
- [ ] `npm test` green; PR approved by cross-model review
