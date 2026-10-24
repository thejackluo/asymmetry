# REQUIREMENTS.md — Asymmetry

**Defined:** 2026-10-24 · **Core value:** scoped-trust agent negotiation
**Rule:** every requirement is falsifiable — a test or check proves PASS/FAIL.

## v1 Requirements

### PLAT — Platform & scaffolding (Phase 1 · Devin 1)

- [ ] **PLAT-01**: `npm install` at repo root installs all workspaces (`apps/web`, `apps/server`, `packages/shared`)
- [ ] **PLAT-02**: `npm run dev` at root starts the server on `:3001` (and web on `:3000` once it exists) without errors
- [ ] **PLAT-03**: `packages/shared` exports every type in CONTRACTS.md §1 verbatim-named (`User`, `Agent`, `TrustEdge`, `Task`, `Message`, `Subchat`, `MemoryItem`, `Goal`, `InfoScope`, `Disclosure`, `Classification`, `AgentStatus`, `SenderType`, `ID`)
- [ ] **PLAT-04**: `packages/shared` exports socket event-name constants matching CONTRACTS.md §3 and the `MemoryEngine` interface + `stubMemoryEngine` from §6
- [ ] **PLAT-05**: `apps/server/src/schema.sql` contains all 10 tables from CONTRACTS.md §5 verbatim; `db.ts` applies it idempotently on boot to `asymmetry.db`
- [ ] **PLAT-06**: `index.ts` calls `registerMemory(app, db)` and `registerAgents(io, db, memory)`; stub implementations exist at `src/memory/index.ts` and `src/agents/index.ts` so the server boots before D2/D3 land
- [ ] **PLAT-07**: `apps/server/package.json` preinstalls every server dep other Devins need: `express`, `socket.io`, `better-sqlite3`, `bcryptjs`, `uuid`, `openai`, `dotenv`, `tsx`, `typescript`, `vitest`, `supertest`, `@types/*`
- [ ] **PLAT-08**: `.env.example` lists `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`, `PORT=3001`; `.env` is gitignored
- [ ] **PLAT-09**: `npm run seed` executes `apps/server/src/seed.ts`; `npm test` runs all workspace tests

### AUTH — Login & session (Phase 1 · Devin 1)

- [ ] **AUTH-01**: `POST /api/login` with an unknown username auto-registers: creates user + agent rows, bcrypt-hashes password, returns `{token, user}`
- [ ] **AUTH-02**: `POST /api/login` with correct credentials returns a token; wrong password returns 401 with no user data
- [ ] **AUTH-03**: Socket.IO handshake with `auth.token` succeeds and sets `socket.data.userId`; missing/bad token is rejected
- [ ] **AUTH-04**: On socket connect, client is joined to `user:{userId}` and `agent:{agentId}` rooms
- [ ] **AUTH-05**: REST endpoints reject requests without `Authorization: Bearer <token>`

### MEM — Memory ingest (Phase 3 · Devin 3)

- [ ] **MEM-01**: `ingest(userId, text, 'chat')` splits input into atomic facts via LLM and writes one `memory_items` row each with `classification` + `field_tags`
- [ ] **MEM-02**: Classifier assigns `private` to credentials, IDs, finances, contact info, exact addresses; `network` to shareable needs/offers; `public` to explicitly public info
- [ ] **MEM-03**: Ambiguous or unclassifiable input defaults to `private` (fail closed)
- [ ] **MEM-04**: `extractGoals(userId, taskId, text)` writes `goals` rows for stated objectives
- [ ] **MEM-05**: Memory content never enters agent prompts directly — agents only ever see `query_memory` tool results

### PERM — Permissioning & disclosure (Phase 3 · Devin 3)

- [ ] **PERM-01**: `queryMemory(owner, requester, scope)` implements the full CONTRACTS §2 matrix: owner sees all; trusted sees `public`+`network`; stranger sees `public` only
- [ ] **PERM-02**: Results are additionally filtered to items matching `scope.fields`/`purpose` (field_tags ∩ fields + keyword match)
- [ ] **PERM-03**: Every `queryMemory` call writes exactly one `disclosures` row with released ids, withheld count, decision (`released`|`partial`|`denied`)
- [ ] **PERM-04**: Withheld item content is never included in the tool response — only the count
- [ ] **PERM-05**: `disclosure:logged` socket event emitted per query (see Changelog note in CONTRACTS.md — engine receives `io`)

### A2A — Agent runtime & A2A protocol (Phase 2 · Devin 2)

- [ ] **A2A-01**: `chat:send` persists a Message (`subchatId: null`, `senderType: 'human'`), broadcasts to `user:{userId}`, and triggers the owner's agent loop
- [ ] **A2A-02**: Agent loop calls OpenAI with tools `query_memory`, `open_subchat`, `send_subchat_message`, `report_to_human` and executes returned tool calls
- [ ] **A2A-03**: `open_subchat` creates `subchats` + `subchat_participants` rows (`kind: 'pair'` for 2 agents, `'group'` for ≥3), joins `subchat:{id}` room, emits `subchat:started`
- [ ] **A2A-04**: `send_subchat_message` persists + emits `subchat:message`, then triggers the recipient agents' loops (A2A ping-pong)
- [ ] **A2A-05**: A turn counter halts any subchat loop at ≤12 agent messages and forces `report_to_human(stuck)` if unresolved
- [ ] **A2A-06**: `report_to_human` persists the summary, sets `tasks.status` (`done`|`stuck`), sets agent `idle`, emits `task:updated`
- [ ] **A2A-07**: `agent:status` emitted on every transition (`idle`→`clarifying`→`negotiating`→`done`/`stuck`)
- [ ] **A2A-08**: An agent can hold ≥2 concurrent subchats (inbound requests create new subchats, not a queue that deadlocks)
- [ ] **A2A-09**: Each agent's system prompt includes owner name, open goals, and the rule "ask only for what the task requires"

### UI — Frontend (Phase 4 · Devin 4)

- [ ] **UI-01**: `/login` submits to `POST /api/login`, stores token, redirects to `/tasks`
- [ ] **UI-02**: `/tasks` lists session user's tasks and creates new ones via `task:create`
- [ ] **UI-03**: Main thread renders `subchatId === null` messages; human vs agent bubbles visually distinct (label "You" / "{name}'s Agent")
- [ ] **UI-04**: `subchat:started` opens a distinct pane per subchat; `subchat:message` streams in live; `subchat:closed` shows outcome chip + summary
- [ ] **UI-05**: A2A messages are machine-styled (mono/terminal look) — visibly not human chat
- [ ] **UI-06**: `disclosure:logged` renders a line like "🔒 shared 3 · withheld 2 (out of scope)" in the relevant subchat
- [ ] **UI-07**: Agent status pill reflects `agent:status` (`negotiating…`, `clarifying…`, etc.)
- [ ] **UI-08**: `/network` renders agent nodes: solid edge = trusted, dashed/glow = discovered; current user's agent highlighted; updates on `network:updated`
- [ ] **UI-09**: Socket client reconnects with stored token; REST calls send Bearer header
- [ ] **UI-10**: `npm run build` + `npx tsc --noEmit` pass with zero errors

### SEED — Demo data (Phase 3 · Devin 3)

- [ ] **SEED-01**: `npm run seed` is idempotent — wipes and recreates CONTRACTS.md §7 exactly (4 users pw `demo`, agents, 5 trust edges, ≥7 classified memory items with field_tags)
- [ ] **SEED-02**: Demo path (PROJECT.md §Demo Script) completes: alice's task → subchat with bob's agent → partial disclosure (withheldCount ≥2) → done report

### OPS — Autonomous workflow (all Devins)

- [ ] **OPS-01**: Each Devin commits+pushes to `devin-N` every ≤30 min
- [ ] **OPS-02**: Each Devin opens a draft PR in its first session and keeps the body current (summary, contract sections, verification output)
- [ ] **OPS-03**: Every PR is reviewed by a different model; comments are addressed before merge
- [ ] **OPS-04**: Devins poll `gh issue list` + project board every ~5 min and respond where tagged
- [ ] **OPS-05**: Every layer ships tests for its own code; `npm test` green at merge time
- [ ] **OPS-06**: No Devin edits files outside its owned paths (see ROADMAP ownership table); contract changes go through issue → PR → Changelog

## v2 Requirements (post-hackathon, NOT in scope)

- Real digital-twin connectors (Gmail, calendar, Muse)
- Persistent trust invitations (friending flow) — currently trust edges are seed-only
- Semantic/embedding scope matching — v1 uses field_tags + keywords
- Multi-device, real auth, E2E encryption
- Agent marketplaces / reputation scoring

## Traceability

| Req | Phase | Owner |
|---|---|---|
| PLAT-01…09, AUTH-01…05 | 1 — Foundation | Devin 1 |
| A2A-01…09 | 2 — Agent Runtime | Devin 2 |
| MEM-01…05, PERM-01…05, SEED-01…02 | 3 — Memory & Permissions | Devin 3 |
| UI-01…10 | 4 — Frontend | Devin 4 |
| Demo end-to-end | 5 — Integration | All |
| OPS-01…06 | continuous | All |
