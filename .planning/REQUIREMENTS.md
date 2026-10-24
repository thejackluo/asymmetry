# REQUIREMENTS.md — Asymmetry

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

**Defined:** 2026-10-24 · **Core value:** scoped-trust agent negotiation
**Rule:** every requirement is falsifiable — a test or check proves PASS/FAIL.

This file defines required behavior, not a list of suggested features.
The index preserves existing IDs; the detailed sections define acceptance.
Use the GSD planner's goal -> requirement -> task -> evidence chain.
No checkbox is complete merely because a file or a UI mock exists.

## Requirement Index

### PLAT — Platform & scaffolding (Phase 1 · Devin 1)

- [ ] **PLAT-01**: `npm install` at repo root installs all workspaces (`apps/web`, `apps/server`, `packages/shared`)
- [ ] **PLAT-02**: `npm run dev` at root starts the server on `:3001` (and web on `:3000` once it exists) without errors
- [ ] **PLAT-03**: `packages/shared` exports every type in CONTRACTS.md §1 verbatim-named (`User`, `Agent`, `TrustEdge`, `Task`, `Message`, `Subchat`, `MemoryItem`, `Goal`, `InfoScope`, `Disclosure`, `Classification`, `AgentStatus`, `SenderType`, `ID`)
- [ ] **PLAT-04**: `packages/shared` exports socket event-name constants matching CONTRACTS.md §3 and the `MemoryEngine` interface + `stubMemoryEngine` from §6
- [ ] **PLAT-05**: `apps/server/src/schema.sql` contains all 12 tables from CONTRACTS.md §5, including canonical task scopes; `db.ts` applies it idempotently on boot to `asymmetry.db`
- [ ] **PLAT-06**: `index.ts` constructs memory through `createMemoryEngine(db, openai, io)` and calls `registerMemory(app, db)` plus `registerAgents(io, db, memory)`; explicit dev/test stubs permit foundation boot, while demo mode requires the real engine
- [ ] **PLAT-07**: `apps/server/package.json` preinstalls every server dep other Devins need: `express`, `socket.io`, `better-sqlite3`, `bcryptjs`, `uuid`, `openai`, `dotenv`, `tsx`, `typescript`, `vitest`, `supertest`, `@types/*`
- [ ] **PLAT-08**: `.env.example` lists `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o-mini`, `PORT=3001`; `.env` is gitignored
- [ ] **PLAT-09**: `npm run seed` executes `apps/server/src/seed.ts`; `npm test` runs all workspace tests

### AUTH — Login & session (Phase 1 · Devin 1)

- [ ] **AUTH-01**: `POST /api/login` with an unknown username auto-registers: creates user + agent rows, bcrypt-hashes password, returns `{token, user}`
- [ ] **AUTH-02**: `POST /api/login` with correct credentials returns a token; wrong password returns 401 with no user data
- [ ] **AUTH-03**: Socket.IO handshake with `auth.token` succeeds and sets `socket.data.userId`; missing/bad token is rejected
- [ ] **AUTH-04**: On socket connect, the browser joins only its own `user:{userId}` room; agent inboxes are internal server routing, not browser subscriptions
- [ ] **AUTH-05**: REST endpoints reject requests without `Authorization: Bearer <token>`

### MEM — Memory ingest (Phase 3 · Devin 3)

- [ ] **MEM-01**: `ingest(userId, text, 'chat')` splits input into atomic facts via LLM and writes one `memory_items` row each with `classification` + `field_tags`
- [ ] **MEM-02**: Classifier assigns `private` to credentials, IDs, finances, contact info, exact addresses; `network` to shareable needs/offers; `public` to explicitly public info
- [ ] **MEM-03**: Ambiguous or unclassifiable input defaults to `private` (fail closed)
- [ ] **MEM-04**: `extractGoals(userId, taskId, text)` writes `goals` rows for stated objectives
- [ ] **MEM-05**: Memory content never enters agent prompts directly — agents only ever see `query_memory` tool results

### PERM — Permissioning & disclosure (Phase 3 · Devin 3)

- [ ] **PERM-01**: `queryMemory(owner, requester, scope)` implements the full CONTRACTS §2 matrix: owner sees all; trusted sees `public`+`network`; stranger sees `public` only
- [ ] **PERM-02**: Returned atomic facts match explicit allowed tags in persisted canonical task scope; purpose keywords cannot bypass the field allowlist or expand scope
- [ ] **PERM-03**: Every `queryMemory` call writes exactly one `disclosures` row with released ids, withheld count, decision (`released`|`partial`|`denied`)
- [ ] **PERM-04**: Withheld item content is never included in the tool response — only the count
- [ ] **PERM-05**: Each evaluated query emits a DisclosureNotice only to its task/data owners, with exact taskId/subchatId and counts; never globally broadcast the audit row

### A2A — Agent runtime & A2A protocol (Phase 2 · Devin 2)

- [ ] **A2A-01**: `chat:send` persists a Message (`subchatId: null`, `senderType: 'human'`), broadcasts to `user:{userId}`, and triggers the owner's agent loop
- [ ] **A2A-02**: Agent loop calls OpenAI with tools `query_memory`, `open_subchat`, `send_subchat_message`, `report_to_human` and executes returned tool calls
- [ ] **A2A-03**: `open_subchat` persists pair/group participants and emits subchat metadata only to authorized observers; never globally join browser sockets
- [ ] **A2A-04**: `send_subchat_message` persists + emits `subchat:message`, then triggers the recipient agents' loops (A2A ping-pong)
- [ ] **A2A-05**: A turn counter halts any subchat loop at ≤12 agent messages and forces `report_to_human(stuck)` if unresolved
- [ ] **A2A-06**: The task owner's agent persists its summary, sets task status, emits updates, and derives aggregate agent activity without hiding other active tasks
- [ ] **A2A-07**: `agent:status` emitted on every transition (`idle`→`clarifying`→`negotiating`→`done`/`stuck`)
- [ ] **A2A-08**: An agent can hold ≥2 concurrent subchats (inbound requests create new subchats, not a queue that deadlocks)
- [ ] **A2A-09**: Each prompt contains identity and the current authorized task goal, never unrelated goals or other threads; peer text cannot change tool permissions

### UI — Frontend (Phase 4 · Devin 4)

- [ ] **UI-01**: `/login` submits to `POST /api/login`, stores token, redirects to `/tasks`
- [ ] **UI-02**: `/tasks` lists session user's tasks and creates new ones via `task:create`
- [ ] **UI-03**: Main thread renders `subchatId === null` messages; human vs agent bubbles visually distinct (label "You" / "{name}'s Agent")
- [ ] **UI-04**: `subchat:started` opens a distinct pane per subchat; `subchat:message` streams in live; `subchat:closed` shows outcome chip + summary
- [ ] **UI-05**: A2A messages are machine-styled (mono/terminal look) — visibly not human chat
- [ ] **UI-06**: `disclosure:logged` renders counts in the exact task/subchat, labeled "private or outside task scope", without denied contents
- [ ] **UI-07**: Agent status pill reflects `agent:status` (`negotiating…`, `clarifying…`, etc.)
- [ ] **UI-08**: `/network` renders agent nodes: solid edge = trusted, dashed/glow = discovered; current user's agent highlighted; updates on `network:updated`
- [ ] **UI-09**: Socket client reconnects with stored token; REST calls send Bearer header
- [ ] **UI-10**: `npm run build` + `npx tsc --noEmit` pass with zero errors

### SEED — Demo data (Phase 3 · Devin 3)

- [ ] **SEED-01**: `npm run seed` additively creates CONTRACTS.md §7 fixtures with stable IDs (Alice/Bob/Carol/Dave/Erin, pw `demo`, five trust edges, atomic tagged facts); repeated runs do not duplicate or delete existing data
- [ ] **SEED-02**: Demo path (PROJECT.md §Demo Script) completes: alice's task → subchat with bob's agent → partial disclosure (withheldCount ≥2) → done report

### OPS — Autonomous workflow (all Devins)

- [ ] **OPS-01**: Each Devin commits and pushes meaningful checkpoints to its role branch every 2-3 minutes while actively editing; no empty commits
- [ ] **OPS-02**: Each Devin opens a draft PR in its first session and keeps the body current (summary, contract sections, verification output)
- [ ] **OPS-03**: Every PR is reviewed by a different model; comments are addressed before merge
- [ ] **OPS-04**: Devins poll `gh issue list` + project board every ~5 min and respond where tagged
- [ ] **OPS-05**: Every layer ships tests for its own code; `npm test` green at merge time
- [ ] **OPS-06**: No Devin edits files outside its owned paths (see ROADMAP ownership table); contract changes go through issue → PR → Changelog

## v2 Requirements (post-hackathon, NOT in scope)

- Real digital-twin connectors (Gmail, calendar, Muse)
- Persistent trust invitations (friending flow) — currently trust edges are seed-only
- Semantic/embedding scope matching — current scope uses explicit field tags, not keyword bypasses
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

## Detailed Acceptance Contracts

### Reading And Execution Rules

- Owner means accountable implementer, not the Git commit author.
- Jack / @thejackluo owns platform and integration decisions.
- Bayzhan / @bayzhan8 owns runtime and peer messaging.
- Jad / @jmb245 owns memory classification and disclosure.
- Akash / @AkashSingirikonda owns browser behavior and visual evidence.
- Requirement IDs are stable across PRs, tests, plans, and bug reports.
- A passing test must assert behavior, not only implementation text.
- Each task summary records the tested SHA and actual command exit code.
- Fixture model responses do not count as live-OpenAI verification.
- Unit tests use disposable SQLite databases, never the shared demo DB.
- On failure, preserve evidence and file a routed issue before moving on.
- Shared type changes land through Jack before consumers silently diverge.

### PLAT-01 - Workspace Installation

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Trigger: a developer clones the repository into a clean directory.
- Input: tracked manifests, root lockfile, supported Node/npm runtime.
- Behavior: root installation resolves server, web, and shared packages.
- Require one root lockfile; do not create competing workspace lockfiles.
- Declare the supported runtime in package metadata and the README.
- Shared imports use `@asymmetry/shared`, not relative cross-app paths.
- Reject an unsupported runtime with an actionable error, not silent failure.
- Acceptance: fresh install resolves imports from server and web.
- Acceptance: a second install does not unexpectedly rewrite the lockfile.
- Evidence: install exit code, selected runtime versions, and lockfile diff.

### PLAT-02 - Development Boot And Shutdown

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Trigger: root `npm run dev` after installation and configuration.
- Behavior: web listens on 3000; API/socket server listens on 3001.
- Read port/origin settings from environment, with documented defaults.
- A public health endpoint returns only readiness and service identity.
- A second server on an occupied port must fail visibly.
- Do not silently choose another port and strand the frontend.
- Shutdown closes HTTP, socket connections, and SQLite handles.
- Acceptance: both processes boot from one root command after integration.
- Acceptance: a stopped/restarted server can reuse its configured port.
- Evidence: startup logs, health response, and clean shutdown result.

### PLAT-03 - Shared Domain Types

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Input: the current domain model in CONTRACTS.md.
- Behavior: export User, Agent, Task, Message, Subchat, MemoryItem, Goal.
- Also export ID, TrustEdge, Classification, SenderType, and AgentStatus.
- Export InfoScope, Disclosure, and the browser-safe DisclosureNotice.
- JSON responses use camelCase, even when SQLite columns use snake_case.
- All createdAt fields are Unix epoch milliseconds.
- Browser-safe User never contains a password hash or session token field.
- Acceptance: server and browser compile against the same exported types.
- Acceptance: message serialization preserves null task/subchat fields.
- Evidence: shared typecheck plus fixture round-trip assertions.

### PLAT-04 - Event Types And Memory Boundary

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Behavior: publish typed socket event names and payloads once in shared.
- Publish MemoryEngine without importing a server implementation.
- Its three operations are ingest, queryMemory, and extractGoals.
- Publish user/agent/subchat room-name helpers for server use.
- Development memory returns only synthetic authorized facts.
- It must implement every method, not omit methods callers depend on.
- The temporary engine must be explicitly marked development/test-only.
- Acceptance: changing the injected engine requires no runtime caller edit.
- Acceptance: demo mode refuses synthetic memory results.
- Evidence: interface conformance and real/stub composition tests.

### PLAT-05 - SQLite Schema And Isolation

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Behavior: create all 12 CONTRACTS tables, including task_scopes.
- Persist room messages, subchat membership, canonical scope, and audits.
- Apply schema initialization idempotently without deleting stored records.
- Use parameterized SQL for every username, ID, message, and scope value.
- Enable foreign-key checking; ensure fixture insert order is valid.
- DATABASE_PATH selects the file; tests pass a fresh disposable location.
- Never let a test fall back to the developer's demo database.
- Acceptance: two boots retain data and do not duplicate schema objects.
- Acceptance: rollback leaves no half-created user/agent or subchat pair.
- Evidence: schema inspection, transaction tests, and persistence restart test.

### PLAT-06 - Application Composition

- Owner: Jack / @thejackluo; phase: 01-foundation and integration.
- Behavior: composition passes db, OpenAI client, and io into memory.
- Register memory HTTP routes once, behind authenticated middleware.
- Register runtime socket handlers once, with the injected MemoryEngine.
- D2/D3 never patch index.ts to make their implementation load.
- Real engine export matches createMemoryEngine(db, openai, io?).
- OpenAI client construction must not make a network call on import.
- Missing API key is allowed in deterministic tests, not a fake live demo.
- Acceptance: boot the real engine/runtime together without signature edits.
- Acceptance: no duplicate HTTP handlers or double socket listeners.
- Evidence: integrated composition smoke test and listener-count assertion.

### PLAT-07 - Dependencies And Build Boundaries

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Behavior: server supplies Express, Socket.IO, SQLite, hashing, and OpenAI.
- Supply TypeScript, tsx, vitest, supertest, and socket.io-client for tests.
- Include only type packages needed by the selected library versions.
- Pin compatible major versions and commit the resolved root lockfile.
- Other owners request missing root dependencies through a [D1 Jack] issue.
- Browser bundles must not include SQLite, password hashing, or server keys.
- A native SQLite build failure is a platform blocker, not a data fallback.
- Acceptance: server typecheck and test runner execute after root install.
- Acceptance: client build contains no server-only imports.
- Evidence: dependency manifest, build logs, and import-boundary review.

### PLAT-08 - Configuration And Secret Handling

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Root .env.example documents API key, model, ports, origins, and DB path.
- OPENAI_MODEL defaults to gpt-4o-mini; it is not a browser environment key.
- Root env loading works regardless of the workspace command's cwd.
- Git ignore covers local env files and SQLite sidecar files.
- The public API origin is allowed in browser config; secret values are not.
- Startup errors identify missing variable names, never print their values.
- Logging must not dump Authorization headers or OpenAI client options.
- Acceptance: run from root and workspace with the same explicit env file.
- Acceptance: tracked-file inspection finds no real API key or local DB.
- Evidence: config tests and the reviewed staged-file list.

### PLAT-09 - Seed And Verification Commands

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Root seed command invokes Jad's seed module using DATABASE_PATH.
- Root test command runs every implemented workspace's deterministic tests.
- Typecheck and build commands fail with nonzero exit codes on real errors.
- A workspace with tests must not be silently skipped by orchestration.
- Test commands do not require an OpenAI key or external account.
- The live smoke check is a separate, explicitly labeled operation.
- A seed failure propagates; do not print success after a rejected promise.
- Acceptance: deliberately failing one test makes the root test command fail.
- Acceptance: seed targets a disposable file provided by the caller.
- Evidence: command definitions plus passing/failing orchestration results.

### AUTH-01 - Atomic Registration Through Login

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Trigger: POST /api/login with a previously unused normalized username.
- Username: trim, lowercase, 3-32 ASCII letters/digits/underscore/hyphen.
- Password: 4-128 characters; demo is a valid password.
- Behavior: transactionally create exactly one user and their one agent.
- Hash the password with bcrypt cost 10; never store plaintext.
- Agent display name derives from the user, not an arbitrary owner ID.
- Return 200 with `{token,user}` only after the transaction commits.
- Rejection: invalid input returns 400 without partial identity records.
- Acceptance: parallel registration of one username creates one identity.
- Evidence: registration, hash verification, and collision tests.

### AUTH-02 - Returning Login And Failed Credentials

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Trigger: POST /api/login for an existing normalized username.
- Behavior: verify the submitted password against the stored bcrypt hash.
- A valid login creates an opaque session token tied to that user.
- Wrong password returns 401 with a generic credential error.
- No error includes the hash, expected password, or private memory.
- Never treat a wrong password as permission to overwrite the user.
- Sessions survive API restarts through the sessions table.
- Acceptance: correct login works after restart; wrong login changes no user.
- Acceptance: response User contains only the public contract fields.
- Evidence: success/failure/restart tests and serialized-response assertion.

### AUTH-03 - Socket Handshake Authentication

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Input: Socket.IO handshake.auth.token, resolved against sessions.
- Behavior: place authenticated userId and agentId in server socket context.
- Missing, malformed, or unknown token causes connect_error/unauthorized.
- No task or chat handlers run before authentication completes.
- Ignore browser-supplied userId/agentId identity claims.
- Do not log the handshake token.
- Disconnect invalid sessions rather than joining a guest room.
- Acceptance: two sessions cannot swap identities by editing handshake fields.
- Acceptance: unauthenticated client receives no room events.
- Evidence: real socket-client tests on an ephemeral test port.

### AUTH-04 - Room Subscription Authorization

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Behavior: browser automatically joins only its own user room.
- Agent and subchat rooms are internal server routing conventions.
- Browser cannot choose a room name or join a peer inbox.
- Runtime emits peer transcripts only to permitted observer user rooms.
- A peer participant's human cannot read the initiating main task thread.
- Discovery does not add a room membership or a trust edge.
- Reconnect re-authenticates before authorized subscriptions are restored.
- Acceptance: Alice/Bob/Eve clients observe exactly their permitted events.
- Acceptance: forged join/agent:info_request events have no privileged effect.
- Evidence: negative event-delivery tests, not just successful room joins.

### AUTH-05 - REST Authentication And Resource Ownership

- Owner: Jack / @thejackluo; phase: 01-foundation.
- Require Authorization: Bearer token on tasks/history/network/memory routes.
- Missing or invalid session returns 401 in a stable JSON error shape.
- Task history resolves task ownership before loading transcript contents.
- Missing task and another user's task both return 404 to avoid enumeration.
- GET /api/tasks returns only the session owner's tasks.
- GET /api/memory returns only the session owner's memory.
- GET /api/network is calculated relative to the session user.
- Acceptance: Bob cannot fetch Alice's task by guessing its UUID.
- Acceptance: private rows never appear in another user's REST responses.
- Evidence: authenticated cross-user and missing-token route tests.

### MEM-01 - Atomic Fact Ingest

- Owner: Jad / @jmb245; caller: Bayzhan / @bayzhan8.
- Trigger: an accepted human chat message, not arbitrary peer traffic.
- Input: authenticated userId, nonempty text, and source chat or seed.
- Behavior: split independent factual claims before writing memory_items.
- Price, approximate area, dates, and exact address are separate facts.
- Each returned item has ID, userId, content, class, tags, source, createdAt.
- Do not store tool instructions or peer claims as the owner's verified facts.
- Do not ingest system prompts or credentials from runtime configuration.
- A failed insert rolls back the ingest batch rather than leaving half a fact.
- Acceptance: a mixed room/address sentence becomes separately classified facts.
- Evidence: classifier fixture, actual SQLite rows, and rollback assertion.

### MEM-02 - Classification Policy

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Public means explicitly intended for general sharing, not merely non-secret.
- Network means a shareable offer, need, skill, or availability for trusted peers.
- Private covers contact details, precise home addresses, identifiers, finances.
- Medical details, credentials, passwords, and private relationship facts are private.
- A task's budget may be network; salary/income is private by default.
- A street-level area may be network; an apartment's exact address is private.
- A statement containing both must be split; never select its least-private class.
- User text asking the classifier to ignore these rules has no authority.
- Acceptance: fixture table distinguishes budget/salary and area/exact address.
- Evidence: positive and adversarial classification examples with expected outputs.

### MEM-03 - Fail-Closed Model Output

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Trigger: invalid JSON, invalid enum, missing content/tags, timeout, or refusal.
- Behavior: never promote ambiguous content to public or network.
- If retained as fallback, original input is private with no releasable tags.
- Unknown field tags do not become a wildcard.
- Reject non-string content and tags; do not stringify arbitrary model objects.
- Do not retry indefinitely or fall back to unrestricted prompt stuffing.
- Caller receives a typed failure or safe private result and can keep chatting.
- No model parse failure may bypass the permission engine.
- Acceptance: malformed/model-error fixtures release no peer-visible content.
- Evidence: invalid-output tests and one captured handled-error path.

### MEM-04 - Goal Extraction

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Trigger: runtime asks to extract goals from an owner's accepted task text.
- Input: authenticated owner userId, existing taskId, and human request text.
- Behavior: write an open goal tied to that owner and that task.
- Distinguish offers/facts from objectives; not every sentence is a goal.
- A peer agent may not create or alter another human's goal.
- Repeated identical extraction for one task must not multiply the same goal.
- Do not infer dating/employment/financial objectives from unrelated private facts.
- On malformed model output, create no invented goal.
- Acceptance: a sublet request yields a housing goal; a bare phone fact does not.
- Evidence: extraction, duplicate, ownership, and no-objective tests.

### MEM-05 - Prompt Context Minimization

- Owner: Jad / @jmb245 plus Bayzhan / @bayzhan8.
- Main-thread prompts contain current task context, not every database row.
- Peer prompts contain only authorized scope, transcript, and tool results.
- Do not SELECT all memory and attach it to a system prompt.
- Do not attach the recipient's unrelated goals to inbound peer conversations.
- A room fact used in one task must not leak into an unrelated task's history.
- query_memory is the only peer fact-read path.
- Debug logs are not an alternate memory export mechanism.
- Rejection: a model requesting the full memory table gets no such tool.
- Acceptance: inspect captured prompts from two tasks for cross-thread secrets.
- Evidence: prompt-capture tests using unmistakable private sentinel strings.

### PERM-01 - Directional Classification Authorization

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Input: owner, authenticated requester, and validated canonical task scope.
- Owner-self access permits all classes, still within the requested fields.
- A trusted requester gets only public and network candidates.
- A stranger gets only public candidates.
- Trust is checked as ownerUserId -> requesterUserId, not the reverse.
- Bob trusting Alice permits Alice's scoped room query; Alice trusting Bob alone does not.
- Private facts never become peer-visible through a trusted relationship.
- Acceptance: exercise all nine classification/requester matrix cells.
- Acceptance: reverse-only trust fails the network release case.
- Evidence: table-driven permission tests with actual trust_edges rows.

### PERM-02 - Canonical Task Scope Enforcement

- Owner: Jad / @jmb245; scope writer: Bayzhan / @bayzhan8.
- Canonical scope is persisted under the initiating task before peer queries.
- Housing fields are location_area, price, dates, and optional furnished.
- A narrower request may choose a subset; an expanded request is rejected.
- Caller purpose text is descriptive, never an authorization predicate.
- Keywords like "housing" cannot authorize contact, salary, or exact address.
- Requested fields must be recognized strings; empty/unknown scopes fail closed.
- Validate that requester and peer owner participate in the supplied subchat.
- Rejection: missing task, missing scope, forged subchat, or unrelated requester.
- Acceptance: appending contact to a housing request returns no contact data.
- Evidence: expanded-scope, forged-context, and purpose-keyword attack tests.

### PERM-03 - Disclosure Audit And Counts

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Each evaluated authorized-context query writes one audit row, even if denied.
- An invalid caller/context fails before data evaluation and returns an error.
- released stores only IDs of facts actually returned.
- withheldCount equals all owner facts considered minus the returned facts.
- decision is denied if zero returned, else partial if withheld > 0, else released.
- Count private and out-of-field facts; do not count only permitted candidates.
- Persist the audit before emitting a notice or returning successful data.
- On audit write failure, fail the query; do not disclose unaudited results.
- Acceptance: owner with seven facts and three released yields withheldCount 4.
- Evidence: exact row-count, ID-list, decision, and failed-write tests.

### PERM-04 - Withheld Data Absence

- Owner: Jad / @jmb245; consumer: Bayzhan / @bayzhan8.
- Tool response contains only authorized items and summary counts.
- It never includes denied content, denied IDs, denied tags, or denial excerpts.
- The runtime receives the stored audit only for trusted server bookkeeping.
- The model must not receive internal audit fields that enumerate hidden data.
- Errors never echo the withheld content for "debugging."
- Do not build a summary by asking an LLM to redact a full-memory prompt.
- The application makes no claim of production-grade information-flow proofs.
- Count metadata is intentional demo leakage; fact contents remain withheld.
- Acceptance: recursively serialize tool output and search private sentinels.
- Evidence: negative sentinel assertions for success, denial, and error cases.

### PERM-05 - Scoped Browser Disclosure Notices

- Owner: Jad / @jmb245; rendering owner: Akash / @AkashSingirikonda.
- Payload is DisclosureNotice, not the full internal Disclosure record.
- Include ID, taskId, subchatId, ownerAgentId, counts, and decision.
- Send only to the initiating task owner's and fact owner's user rooms.
- Never globally emit disclosure events or infer observers from all sockets.
- Deduplicate recipients when both identities are the same user.
- Two simultaneous subchats must receive correctly routed notice IDs.
- UI uses releasedCount, not a raw released-ID array.
- Acceptance: unrelated Carol client receives zero notices for Alice/Bob.
- Acceptance: authorized clients see the same ID and accurate counts.
- Evidence: real socket privacy test plus frontend routing test.

### A2A-01 - Human Message Intake

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Input: chat:send with an existing taskId and body of 1-4000 characters.
- Derive sender identity from socket context, never the submitted payload.
- Reject empty/oversized bodies and unowned tasks before writing a message.
- Persist one human message with subchatId null and senderId equal to userId.
- Commit before broadcasting chat:message to the owner's user room.
- Trigger one owner task loop; the loop loads the persisted message once.
- Ingest and goal-extract through the injected engine with handled errors.
- Do not automatically retry an uncertain browser send and duplicate it.
- Acceptance: one accepted send produces one row, one broadcast, one trigger.
- Evidence: intake unit test and authenticated socket round-trip.

### A2A-02 - Structured Tool Execution

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Tools: query_memory, open_subchat, send_subchat_message, report_to_human.
- Validate tool names and JSON arguments against explicit server schemas.
- Unknown tools and malformed arguments return typed tool errors.
- Tool results are appended with their originating tool-call IDs.
- Do not execute shell commands, SQL, URLs, or arbitrary methods from model text.
- A model prose reply is displayed as text, not parsed as an executable tool.
- Maximum eight tool iterations per invocation, including malformed attempts.
- Owner/requester/task permissions are enforced in code for every tool call.
- Acceptance: scripted valid calls work; invalid-name/argument calls do not mutate DB.
- Evidence: injected model fixtures and tool-dispatch assertions.

### A2A-03 - Pair And Group Subchat Creation

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Originating owner agent creates a subchat for its own active task.
- Normalize participant IDs, require known agents, and include the originator.
- Two unique agents means pair; three or four unique agents means group.
- Reject fewer than two, more than four, duplicate-only, or foreign-task requests.
- Transactionally insert subchat and all participant rows before events.
- Emit subchat:started only to authorized observer user rooms.
- Creating a subchat does not create trust_edges.
- Acceptance: pair and three-agent group persist exact membership.
- Acceptance: failed membership insertion leaves no orphan subchat.
- Evidence: pair/group/rollback/unauthorized-creation tests.

### A2A-04 - Peer Message Routing And Replies

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- A sending agent must be a participant in the open subchat.
- Persist senderId as the acting agent ID and senderType as agent.
- Persist taskId and subchatId from trusted conversation context.
- Emit subchat:message only to that conversation's permitted observers.
- Schedule recipient work without recursively awaiting the entire reply chain.
- A group recipient may reply without claiming ownership of the initiating task.
- Never broadcast peer replies into an unrelated main chat.
- Closed subchats reject new ordinary peer messages.
- Acceptance: Alice/Bob/Carol group progresses with correctly labeled senders.
- Evidence: scheduling, membership, closed-room, and no-cross-room tests.

### A2A-05 - Termination And Resource Budgets

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Limit one subchat to 12 persisted agent messages.
- Reserve the turn atomically before scheduling each model response.
- Limit one task to 30 model requests and at most four discovered peers.
- Each model request times out after 30 seconds.
- The per-invocation eight-tool-iteration limit also applies.
- On exhaustion, stop scheduling and notify the originating agent of the reason.
- The owner reports stuck once; recipients cannot mark the task terminal.
- Never invent a successful opportunity to hide a timeout or budget exhaustion.
- Acceptance: always-reply model and concurrent group responses cannot exceed caps.
- Evidence: fake-clock timeout and adversarial always-reply tests.

### A2A-06 - Owner Report And Task Completion

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Only the initiating task owner's agent can invoke report_to_human.
- Input status is done or stuck; summary is a nonempty bounded string.
- Persist the summary as a main-thread message before task:updated.
- done means a scoped result/proposal was found, not that a real deal was executed.
- stuck includes a concrete missing requirement, denial, timeout, or no-match reason.
- Close resolved subchats without terminating another task's conversations.
- Repeated terminal reports must not produce contradictory final statuses.
- Agent activity remains negotiating if another task is still running.
- Acceptance: remote agent completion attempt is rejected without status mutation.
- Evidence: owner-only report, multi-task activity, and persisted-summary tests.

### A2A-07 - Clarification And Visible Progress

- Owner: Bayzhan / @bayzhan8; consumer: Akash / @AkashSingirikonda.
- Active task phases: clarifying, negotiating, then done or stuck.
- Task status remains active during clarification/negotiation.
- Housing requires approximate area, maximum monthly rent, and desired dates.
- Ask only for missing task constraints, not income, phone, or precise address.
- A complete first request proceeds without redundant clarification.
- Persist the canonical allowed fields before sending any peer information request.
- Emit agent:status to its authorized owner UI when activity changes.
- Never present a loading badge as evidence that a model request succeeded.
- Acceptance: incomplete request asks a relevant question; complete one opens peers.
- Evidence: scripted model exchanges and captured status events.

### A2A-08 - Concurrent Conversations

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Maintain distinct contexts keyed by task and subchat.
- A busy agent may serve two independent inbound requests concurrently.
- Serialize work inside one conversation, not across the whole agent.
- Do not reuse one mutable messages array for unrelated requests.
- Turn reservations and terminal transitions must remain safe under overlap.
- A blocked peer must not deadlock another peer's task.
- On process restart, do not replay incomplete sends as if never delivered.
- Mark interrupted work honestly and require a deliberate continuation.
- Acceptance: two subchats for Bob both progress with isolated sentinel histories.
- Evidence: concurrent scheduling, queue, and restart/interruption tests.

### A2A-09 - Persona And Untrusted Peer Content

- Owner: Bayzhan / @bayzhan8; phase: 02-agent-runtime.
- Persona includes agent name, owner display name, and the current task role.
- Owner main thread may use that owner's task goal.
- Peer context excludes unrelated private goals and main-thread transcripts.
- A peer message asking to ignore rules remains an ordinary peer message.
- Tool capabilities cannot be expanded by a model or by user-supplied role text.
- Recipient memory queries use the initiating peer as requester, not self.
- Introductions remain proposals until the human agrees; no real contact/booking.
- Do not execute content that looks like embedded system/tool instructions.
- Acceptance: prompt-injection peer cannot expose a private sentinel or call a fifth tool.
- Evidence: captured prompt/tool trace with adversarial peer fixtures.

### UI-01 - Login, Session Storage, And Route Guard

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Login has username, password, submit, inline error, and pending state.
- Submit once while pending; do not issue overlapping registration requests.
- On 200 store asym_token and the returned safe User, then open /tasks.
- On 401 show a credential error without exposing server diagnostics.
- On network failure retain input and offer a deliberate retry.
- A protected route without a token redirects to /login.
- A rejected stored session clears local identity and disconnects the socket.
- Passwords are never saved to localStorage or displayed in logs.
- Acceptance: new login, returning login, bad password, stale token, offline API.
- Evidence: browser interaction tests and login screenshot.

### UI-02 - Task List And Task Creation

- Owner: Akash / @AkashSingirikonda; runtime endpoint owner: Bayzhan.
- GET /api/tasks hydrates only the session user's persisted task list.
- Show active/done/stuck badges and a selected-task indicator.
- Task titles are nonempty, trimmed, and at most 200 characters.
- Creating a task does not itself claim that an agent has started searching.
- After creation, select it and show its empty main-thread composer.
- The human sends the initial detailed request in that composer.
- A task:create failure keeps the form value and shows an error.
- Refresh preserves tasks through REST, not merely browser component state.
- Acceptance: create/select/refresh two tasks without mixing transcripts.
- Evidence: socket-create test and browser persistence scenario.

### UI-03 - Human And Owner-Agent Main Thread

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Render only messages with subchatId null in the main thread.
- Human bubble label is You; agent bubble names the owner's agent.
- System notices are visually distinct from both human and agent assertions.
- Message body is escaped text; model output is never injected as raw HTML.
- Show timestamp and stable message ID for reconciliation.
- Disable send for empty text or disconnected transport, with a visible reason.
- Successful send is displayed from the persisted server event, not fake model text.
- Deduplicate replayed events by message ID.
- Acceptance: malicious HTML remains inert and repeated events render once.
- Evidence: rendering, deduplication, and two-task partition tests.

### UI-04 - Pair/Group Subchat Panes And Replay

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Each subchatId maps to its own visible, collapsible pane.
- Header names participants and identifies pair versus group.
- Display sender agent on every message; do not imply the human sent it.
- Append live peer messages only to the matching task/subchat.
- Closed pane shows done/stuck outcome and the persisted summary.
- History must reconstruct membership, transcript, closed status, and summary.
- Multiple panes remain independently expandable during concurrent work.
- Never merge a group's messages into a pair just because participants overlap.
- Acceptance: refresh two simultaneous subchats and recover their exact states.
- Evidence: history-fixture test plus browser screenshot with pair/group panes.

### UI-05 - Visible Human/Agent Boundary

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Use layout, sender labels, and typography to distinguish main from peer chat.
- Agent-to-agent panes use a restrained monospace transcript treatment.
- Status and trust labels remain legible against the selected theme.
- Do not rely on color alone; include text for status and edge type.
- A collapsed pane still shows participants, state, and new-message count.
- Page-level navigation clearly separates Tasks from Network.
- Focus order reaches task list, composer, subchats, and navigation.
- Avoid decorative effects that conceal messages during the live demo.
- Acceptance: screenshot identifies who talks to whom without explanation.
- Evidence: desktop screenshot and keyboard navigation check.

### UI-06 - Exact Disclosure Rendering

- Owner: Akash / @AkashSingirikonda; event owner: Jad.
- Input is the shared DisclosureNotice shape.
- Locate the pane by taskId and subchatId, never by whichever pane is active.
- Show owner name, releasedCount, withheldCount, and decision.
- Label withheld as private or outside task scope; do not assert only one cause.
- A denied query shows zero shared and does not imply a technical failure.
- A task-level notice with null subchatId renders as an owner system line.
- Ignore unauthorized/unrecognized task notices and log only safe diagnostics.
- Notice IDs deduplicate live delivery and history replay.
- Acceptance: two out-of-order notices reach the correct panes with exact counts.
- Evidence: routing, denied, null-subchat, and duplicate tests.

### UI-07 - Honest Progress And Error States

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Distinguish idle, clarifying, negotiating, done, and stuck activity.
- Task terminal status comes from task:updated/history, not agent badge color.
- If one agent serves two tasks, completing one does not hide the other.
- A disconnected transport displays reconnecting, not still-negotiating certainty.
- Model errors and blocked collaboration appear as persisted system summaries.
- Loading, empty results, denied requests, and server failures have distinct text.
- No infinite spinner when a bounded model invocation has terminated.
- Refresh uses server task status rather than stale local activity.
- Acceptance: timeout becomes stuck with reason; another active task remains visible.
- Evidence: fake-clock state transition tests and error-state screenshot.

### UI-08 - Trusted And Discovered Network

- Owner: Akash / @AkashSingirikonda; graph endpoint owner: Jack.
- Fetch and subscribe to `{agents,trusted,discovered}` using the same shape.
- IDs in trusted/discovered are agent IDs relative to the session user.
- Current owner's agent is the central highlighted node.
- Solid labeled edge means directly trusted; dashed labeled edge means discovered.
- Discovery excludes self and directly trusted peers.
- Base fixture: Alice has Bob/Carol trusted and Erin discovered after interaction.
- No UI action silently converts discovery into trust.
- Empty network and loading/error states must not appear as broken SVG.
- Acceptance: Erin becomes discovered live without a trust_edges write.
- Evidence: graph derivation test, event update test, and labeled screenshot.

### UI-09 - Transport Lifecycle And Recovery

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Use one authenticated socket lifecycle per browser session.
- Attach/unsubscribe handlers deterministically on route/session changes.
- Send Bearer header on protected REST; never attach it to unrelated origins.
- On reconnect, refetch selected history/tasks/network to recover missed events.
- Merge by ID and stable createdAt/ID ordering, not event arrival order alone.
- Do not silently replay uncertain human sends after a lost acknowledgement.
- Show delivery uncertainty and let the human inspect history before retrying.
- Logout clears local identity and closes the old socket before another login.
- Acceptance: kill/restart API, reconnect, then switch users without stale listeners.
- Evidence: lifecycle, duplicate-subscription, and user-switch tests.

### UI-10 - Build, Accessibility, And Visual Evidence

- Owner: Akash / @AkashSingirikonda; phase: 04-frontend.
- Frontend build and TypeScript checks exit zero.
- Utility tests cover message partitioning, deduplication, and notice routing.
- Browser checks cover real login/task/history/network against integrated API.
- MockSocketClient is allowed for development, never as final integration evidence.
- Laptop layout must show the full demo without overlapping critical controls.
- At a narrow mobile width, navigation/composer remain usable without overflow.
- Focusable controls have names; status text is not solely animated decoration.
- Capture screenshots without exposing API keys, raw memory, or real PII.
- Acceptance: build/typecheck/tests pass and three core screens are captured.
- Evidence: commands, SHA, browser log, and artifact paths.

### SEED-01 - Stable Non-Destructive Demo Fixtures

- Owner: Jad / @jmb245; phase: 03-memory-permissions.
- Users: alice, bob, carol, dave, erin; each has exactly one agent.
- Use stable deterministic fixture IDs and password demo with bcrypt hashes.
- Trust: Alice->Bob, Alice->Carol, Bob->Alice, Carol->Alice, Bob->Dave.
- Bob's area/price/dates/furnished facts are separate network records.
- Bob's exact address and phone are separate private records.
- Erin has only a public housing tip and no trust edge to Alice.
- Seed repeated runs do not duplicate fixtures, overwrite passwords, or delete data.
- Fixtures are fictional; phone-number examples use reserved fictional ranges.
- Acceptance: seed twice beside an unrelated user and preserve the unrelated data.
- Evidence: fixture-state assertions and idempotency test on a disposable DB.

### SEED-02 - Rehearsable End-To-End Opportunity

- Owner: Jack coordinates; Bayzhan/Jad/Akash own their respective behavior.
- Alice logs in, creates a task, and sends the complete housing request.
- Request: near Georgia Tech, summer dates, monthly budget below $1200.
- Alice's agent queries Bob through an actual peer conversation.
- Bob's engine releases area/price/dates and withholds private contact details.
- Alice also discovers Erin's public tip without granting network access.
- Main report names a matching offer, its price/dates, and asks about an intro.
- No external introduction/contact is actually sent.
- Run twice using fresh disposable fixture databases, not destructive resets.
- Acceptance: live path produces persisted messages, audits, graph change, and report.
- Evidence: browser recording/screenshots plus sanitized model/tool trace.

### OPS-01 - Frequent Commits And Pushes

- Owners: all four sessions; coordinator: Jack / @thejackluo.
- While editing, publish meaningful checkpoints every 2-3 minutes.
- Stage owned, reviewed paths explicitly; never sweep another session's changes.
- No empty commits or secrets to satisfy the cadence.
- A commit is not published until the push succeeds and its SHA is recorded.
- This project uses Jack's authorized author identity as requested.
- Do not share credentials or impersonate a push account another operator lacks.
- On long blocking commands, report the delay and publish the next safe checkpoint.
- Separate worktrees prevent branch switches under another running session.
- Acceptance: PR history shows incremental work with truthful push status.
- Evidence: role branch commit/push SHAs and registry timestamps.

### OPS-02 - Early Draft PR And Status

- Owners: all four sessions; coordinator: Jack / @thejackluo.
- Open the role's draft PR during its first implementation session.
- Include owner, requirement IDs, task issue, dependencies, and summary.
- Record commands, exit codes, tested SHA, logs, and remaining blockers.
- Label mocked versus live verification explicitly.
- Update the existing PR on each meaningful checkpoint, not a new PR per commit.
- A draft may contain failing work; readiness may not claim failing tests passed.
- Do not post environment files, API keys, or unsanitized private fixture traces.
- Acceptance: another session can identify current work/next action from the PR.
- Evidence: draft PR body, issue links, and updated verification section.

### OPS-03 - Fresh Different-Model Review

- Owners: implementers initiate; reviewer is a distinct model session.
- Supply exact base/head SHAs, contracts, linked requirements, and test evidence.
- Reviewer identity differs from the implementer; Fusion records both models.
- Fresh context reviews the actual diff and surrounding code.
- Record findings with severity, file/line, failure path, and regression coverage.
- Fix or explain every finding; rerun affected checks after a code change.
- Re-review the new head; an old SHA's review does not approve a new commit.
- Same-account model comments do not count as independent GitHub account approval.
- If unavailable, report review blocked; never silently self-review or fake approval.
- Acceptance: readiness links real reviewer output for the exact candidate head.
- Evidence: model identity, SHA, findings, responses, and rerun output.

### OPS-04 - GitHub Inbox And Project Coordination

- Owners: all four sessions; coordinator: Jack / @thejackluo.
- Poll issues, updated comments, PR review threads, and Projects every five minutes.
- Use role/name prefix plus verified handle from TEAM.md.
- Mentions do not wake agents; each session owns its polling loop.
- Save last processed time with overlap and deduplicate event/comment IDs.
- Include recently closed issues so a closed thread's response is not lost.
- Claim a task before editing; another session cannot concurrently own that claim.
- Projects states: Todo, In Progress, Blocked, In Review, Done.
- If Projects access fails, use visible issue status and notify Jack.
- Acceptance: a posted cross-layer blocker gets acknowledged at the next active poll.
- Evidence: registry/poll timestamps and linked claim/response comments.

### OPS-05 - Test Gates And Truthful Completion

- Owners: every layer; Jack owns final integrated gate.
- Each implementation task adds or updates its behavioral regression tests.
- Run narrow affected checks during iteration and the full suite before final readiness.
- An unavailable command is unverified, not passed.
- Test evidence identifies command, result, timestamp, and tested SHA.
- Permission tests must run real authorization code, not mocked authorization results.
- Browser playback does not replace real socket/REST integration.
- Live model checks are separate from deterministic scripted-model tests.
- Acceptance: a deliberately failing privacy assertion blocks readiness.
- Evidence: layer reports, integration report, and final reviewer output.

### OPS-06 - Ownership, Contract Changes, And Merge Order

- Owners: D1 platform, D2 agents, D3 memory/seed, D4 web.
- Only D1 changes root lockfile and application composition.
- No role fixes another role's layer without an explicit issue reassignment.
- API/type/schema changes are discussed in an issue and recorded in contracts.
- Affected owners acknowledge before dependent code is merged.
- Foundation merges first; independent runtime/memory/frontend branches follow.
- Jack merges only reviewed heads satisfying required checks and branch protection.
- No force-push, destructive reset, or history rewrite is implied by autonomy.
- Acceptance: PR changed paths match its owner or include recorded reassignment.
- Evidence: ownership diff, contract decision, and reviewed merge SHA.
