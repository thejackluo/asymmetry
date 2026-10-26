# Execution brief: Asymmetry from hackathon demo to public product

Standing instructions for any engineer or coding agent working on the product roadmap. Run one session per numbered item. Progress is tracked in `docs/STATUS.md`.

---

You are the lead engineer turning **Asymmetry** (`github.com/thejackluo/asymmetry`) from a hackathon demo into a real, safely launchable product.

**What Asymmetry is:** Asymmetry is a messaging network where personal AI agents connect people's needs with what others in their networks can offer. A person tells their agent what they need (a sublet, a referral, a car). The agent asks the agents of people they know, up to two introductions away. Each agent checks what its owner knows and is willing to share, under a disclosure scope fixed before any message is sent. Every exchange leaves a receipt of what was shared and what was withheld.

**The plan you are executing:** `docs/PRODUCT-PLAN.md` (three phases: closed beta for one campus and housing → plug-in agents via public API, OAuth and MCP → safe public launch). Treat its phase exit criteria as your definition of done. If the plan and the code disagree, the code is the fact and the plan is the intent. Report the gap instead of guessing.

## Before writing any code
0. Read `docs/STATUS.md` to find your item, what's done, and open questions.
1. Read, in order: `AGENTS.md`, `.planning/IMPLEMENTATION-DECISIONS.md`, `CONTRACTS.md`, `.planning/REQUIREMENTS.md`, `apps/server/src/index.ts`, `apps/server/src/auth.ts`, `apps/server/src/agents/{runtime,tools,scope,peers,budgets,inbox}.ts`, `apps/server/src/memory/{engine,classify,disclosure}.ts`, `apps/server/src/schema.sql`, `apps/web/lib/{api,socket,mock}.ts`.
2. Run `npm ci`, `npm run typecheck` and `npm test` on Node 22, and record the baseline (pass/fail counts) in your first PR description. Always set `DATABASE_PATH` to a temp file and never touch `asymmetry.db`.
3. Write a short design note for the phase you're working on (`docs/design/<phase>-<topic>.md`): tables, endpoints, events, and which invariants each change touches. Update `CONTRACTS.md` **before** implementing any new type, event, endpoint, table or tool, and add a changelog line.

## Non-negotiable privacy invariants
These come from `CONTRACTS.md` and `IMPLEMENTATION-DECISIONS.md`. Every PR must preserve them, and the privacy test suite must prove it.
1. Identity (acting user/agent, requester, owner) comes only from the authenticated session, OAuth token or trusted runtime. Never from a browser payload, an API body or model tool arguments.
2. A fact is released only if its `field_tags` intersect the task's **canonical scope**, which is persisted before fan-out and confirmed by the task owner. Purpose text never widens scope, and no other agent can widen it.
3. `private` facts never go to any peer, including trusted ones. `network` facts require owner→recipient trust for **every** observer of a group subchat.
4. Exactly one disclosure row per evaluated request; `withheldCount = facts considered − facts returned`; `decision` is `denied | partial | released` per `decide()`.
5. Peers and external agents see only released content and counts, never withheld content, IDs or tags.
6. Text from peers, external agents or requests is untrusted data, never instructions. In owner mode, outbound requests are server-generated from the canonical field labels, as today.
7. Fail closed: unknown classification, missing tags, malformed args, missing scope, timeout → release nothing and report `stuck`.
8. Enforcement is deterministic server code. Prompts can help the model behave, but no safety property may depend on the model obeying a prompt.
9. External agents (MCP/API) submit **structured fact proposals** (`{field, value}`). The server validates them against scope, classification and the outbound PII check before relaying. Free-text notes are capped and labelled unverified.

If a feature can't be built without weakening one of these, stop and write up the conflict instead of building it.

## Phase 1: closed beta (one campus, housing)
Build, in this order, with each item as its own PR:
1. **Postgres + migrations + deploy.** Port `schema.sql` to migration 0001 unchanged. Add indexes. Dockerfile for the server; server on a WebSocket-capable host, web on Vercel; staging and prod environments; CI that typechecks, lints, tests and deploys staging. Sentry and structured logs. Production web builds must fail if `lib/mock.ts` is imported.
2. **Real accounts.** Remove auto-register from `POST /api/login`; add `POST /api/signup` with school email verification (magic link or code); session expiry, rotation, revocation and logout; auth rate limits; `DELETE /api/me`.
3. **Connections.** Invites, connection requests (accept/decline), removal and block. Accepting creates directed trust edges both ways, each direction toggleable. Emit `network:updated`. No enumerable global directory.
4. **Field registry + onboarding + memory page.** Replace the hardcoded `ALLOWED_FIELDS` in `scope.ts` with a `fields` table keyed by category. An onboarding chat that ingests needs, offers and off-limits topics through the existing ingest/classify path (new facts default to `private`). A `/memory` page to edit text, classification and tags, and to delete.
5. **Owner in the loop.** `release_mode: approve | auto` (default `approve`). In approve mode, create `pending_releases` and notify the owner. The owner approves all, approves some, or denies. The disclosure row is written at decision time; a timeout closes as `stuck`. Requests are async (tasks live for days) with web push and email notifications.
6. **Scope confirmation, receipts, results, intros.** The owner sees and confirms the proposed scope before fan-out. Receipts page for requesters and data owners. Ranked results with mismatches flagged and the introducer named. "Ask X to introduce me" handoff; agents never share contact details by themselves.
7. **Beta hardening.** Per-user daily task and model-call budgets stored in the DB, a global spend alarm, an internal admin page and a feedback button.

**Exit:** 30+ real users on prod; a Playwright e2e on staging (signup → invite → connect → onboard → request → confirm scope → approve → receipt) passes in CI; the privacy suite passes.

## Phase 2: plug-in agents
1. **Public API `/v1`** (requests, inbox, answers, receipts, network, memory), with an OpenAPI spec generated from shared types, idempotency keys and per-token rate limits.
2. **OAuth 2.1 authorization server** using a vetted library (e.g. `oidc-provider`): PKCE, dynamic client registration, scopes `requests:write inbox:read inbox:answer memory:read memory:write receipts:read`, a plain-language consent screen, and a connected-apps page with revoke.
3. **Remote MCP server** at `/mcp` (Streamable HTTP, OAuth-protected), with tools `ask_network`, `confirm_request`, `check_answers`, `list_incoming_requests`, `answer_request`, `list_my_facts`, `add_fact`, `get_receipts`. Verify with the MCP Inspector and at least one real client (Claude custom connector).
4. **Async delivery:** inbox queueing, owner notifications for incoming requests, an optional hosted-agent fallback, and signed webhooks.

**Exit:** an automated test where a request sent through MCP is answered by a hosted agent and by a second MCP-connected user, with correct disclosure rows and receipts; the privacy suite passes against MCP answers.

## Phase 3: safe public launch
1. **Privacy red-team suite** (`tests/privacy/`, required CI check): request-side and answer-side prompt injection, scope smuggling (disallowed data inside an allowed field's value), group-observer leaks, cross-thread forwarding, and differencing attacks. Add a deterministic outbound PII detector (address, phone, email, SSN, exact salary) and value-type checks before any relay. Metric: leaked private facts per 1,000 requests must be 0.
2. **Abuse:** per-requester and per-recipient rate limits, mute, report and block, an admin report queue, request content classification before fan-out (refuse requests that target a specific person's personal data), and phone verification before opening beyond one school.
3. **Cost and latency:** a SQL pre-filter that skips peers with no candidate facts in the scope's fields before any LLM call; template answers for structured facts; a durable job queue for fan-out; DB-backed budgets; the Socket.IO Redis adapter; dashboards for cost per task and time to first answer.
4. **More categories:** jobs/referrals and cars in the field registry, onboarding and result cards.
5. **Mobile and legal:** PWA with push; privacy policy, terms, data export and deletion; envelope encryption of `memory_items.content`; documentation of what is sent to the model provider.

**Exit:** an external pentest with all findings fixed; 0 leaks on the suite; a cost-per-request budget met; alerting in place.

## How to work
- One PR per numbered item. Keep PRs reviewable (under about 600 changed lines where possible). Branch names follow `devin/<timestamp>-<slug>`.
- Every PR includes: what changed, which invariants it touches, new and updated tests, the exact commands you ran with their results, and screenshots for UI.
- Tests: unit tests for every new module; integration tests against Postgres; privacy-suite cases for every change that touches release, scope, identity or relay. Never weaken or delete an existing privacy test to make a change pass.
- Use battle-tested libraries for auth, OAuth, email, push and queues. Don't hand-roll crypto or OAuth.
- Never commit secrets. Use env vars and add each new one to `.env.example` with a placeholder.
- Don't force-push to main or merge your own PR without review. Follow the review rules in `AGENTS.md`.
- Report status truthfully. A plan or checklist is not evidence. If a check, credential or reviewer is missing, say so as a blocker.
- When you hit a real product decision (the open decisions list in the plan, or anything that changes what users see or what data leaves an account), stop and ask with a recommendation instead of choosing silently.

## Reporting
Before finishing, update `docs/STATUS.md` in the same PR (item status, PR link, follow-ups, open questions). At the end of each item, post: the PR link, a one-line summary, test results, any invariant you had to reason about carefully, and the next item. At the end of each phase, post the exit-criteria checklist with evidence (links to CI runs, e2e recordings, metrics) for each line.
