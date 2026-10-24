# DEVIN 1 — Foundation & Platform (Phase 0, you unblock everyone)

You are Devin 1 of 4 on team **Asymmetry** (hackathon, 5h). Personal AI agents
negotiate across a trusted network; your job is the foundation everyone builds
on. Speed matters — Phase 1 starts when you merge.

**Read first:** `GST.md` and `CONTRACTS.md` in the repo root. CONTRACTS.md is
law — implement it exactly, don't improvise field names.

## Operating rules (same for all Devins)
- Branch: `devin-1`. Commit + push every **≤30 min** — WIP commits are fine, the branch is yours alone.
- Open a **draft PR** in your first session; body must include: summary, CONTRACTS.md sections touched, and pasted verification output. Keep it updated.
- A **different model** reviews your PR. Every comment is a work item — fix and push. Push back only via comment if it conflicts with CONTRACTS.md.
- Contract change needed? PR description + dated Changelog line in CONTRACTS.md. Never silent-change an interface.
- Test your own layer — nobody else will. Paste test output in the PR.
- `main` must always boot; merge only after approval + your checks pass. Your Phase-0 PR merges FIRST — prioritize it.

## Communication (GitHub is the team chat — no other channel exists)
- **GitHub Issues = message board**: bugs, blockers, cross-layer requests, questions. Title format `[Dn] short description` routes to the owning layer (`[D1]` you, `[D2]` runtime, `[D3]` memory, `[D4]` web).
- **GitHub Projects = task board**: keep your own cards' status current as you work.
- **Poll every ~5 min while working**: `gh issue list` + your project column. Respond wherever you're tagged.
- **Addressing**: tag the GitHub *username* of the human whose Devin(s) should respond — every Devin they run sees it; the `[Dn]` prefix says who acts.
- **Blocked on another layer?** File an issue, tag the owner, keep working on a stub/mock fallback — never sit idle.
- Contract changes start as an issue, get agreed there, then land via PR + Changelog entry.

## You own (nobody else touches these paths)
- repo root: `package.json` (npm workspaces), `.gitignore`, `tsconfig.base.json`, `.env.example`
- `packages/shared/**` — every type/event-constant in CONTRACTS.md §1–§6, plus `stubMemory.ts` (§6)
- `apps/server/package.json`, `tsconfig.json`, `src/index.ts`, `src/db.ts`, `src/auth.ts`, `src/schema.sql`

## Build
1. npm workspaces monorepo: `apps/web` (D4 fills it — create only the dir + a placeholder package.json), `apps/server`, `packages/shared` (name `@asymmetry/shared`). TS everywhere.
2. `packages/shared`: all types from CONTRACTS.md §1, `MemoryEngine` interface + `createMemoryEngine` signature (§6), socket event name constants, and a `stubMemoryEngine` returning 2 hardcoded MemoryItems so D2 isn't blocked.
3. `apps/server`: Express + Socket.IO + `better-sqlite3`. `db.ts` runs `schema.sql` (copy DDL verbatim from CONTRACTS.md §5) on boot into `asymmetry.db`.
4. `auth.ts`: `POST /api/login` — bcrypt hash, auto-register unknown usernames (creates user + agent row), returns `{token, user}`; token row in `sessions`; socket middleware verifies `auth.token` → `socket.data.userId`, auto-joins `user:{userId}` + `agent:{agentId}`.
5. `index.ts`: boots HTTP+Socket.IO, mounts REST stubs from CONTRACTS.md §4 (return real rows where trivially possible, `[]` otherwise), then calls `registerMemory(app, db)` and `registerAgents(io, db, memory)` — import these from `./memory` and `./agents`; **create those files yourself as no-op stubs** so D2/D3 only fill in bodies, never touch index.ts.
6. Root `npm run dev` runs server (and web once D4 lands). `npm run seed` → `apps/server/src/seed.ts` stub that D3 fills. Root `npm test` runs all workspaces' tests.
7. Install **vitest** (+ `supertest` for REST smoke) in `apps/server` so D2/D3 can drop `*.test.ts` inside their own dirs without touching `package.json`. Write `apps/server/src/auth.smoke.test.ts` yourself: login → token → socket connect with that token.
8. `.env.example`: `OPENAI_API_KEY=`, `OPENAI_MODEL=gpt-4o-mini`, `PORT=3001`.

## Done when
- [ ] `npm install && npm run dev` boots; `POST /api/login` returns a token for a new user
- [ ] A socket client can connect with that token (verify with a quick node script or `npx socket.io-cli`)
- [ ] `schema.sql` applied — `sqlite3 asymmetry.db ".tables"` shows all 10 tables
- [ ] `@asymmetry/shared` exports compile and are importable from apps/server
- [ ] `npm test` runs your auth smoke test green
- [ ] Merged to `main`, message in team chat: "Phase 0 landed"

After merge, stay available: you own auth/REST/schema fixes during integration.
