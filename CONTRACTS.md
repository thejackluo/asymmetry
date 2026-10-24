# ASYMMETRY — Contracts (frozen interfaces)

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

This file is the **single source of truth** for every boundary between Devins.
If your code disagrees with this file, your code is wrong. Changes require all
4 devs to agree; log any change at the bottom under Changelog.

All shared types live in `packages/shared/src/index.ts` and are imported as
`@asymmetry/shared`.

---

## 1. Domain model (TypeScript)

```ts
// ── Identity ──────────────────────────────────────────────
export type ID = string; // uuid v4

export interface User {
  id: ID;
  username: string;
  displayName: string;
  agentId: ID;            // 1:1 — every user has exactly one agent
  createdAt: number;
}

export interface Agent {
  id: ID;
  userId: ID;             // owner
  name: string;           // e.g. "Alice's Agent"
  status: AgentStatus;
}

export type AgentStatus = 'idle' | 'clarifying' | 'negotiating' | 'done' | 'stuck';

// ── Trust graph ───────────────────────────────────────────
export interface TrustEdge {
  ownerUserId: ID;        // who extends trust
  trustedUserId: ID;      // who is trusted
  createdAt: number;
}

// "discovered" is NOT stored as an edge — it is derived: any agent that
// appeared in a subchat involving one of my agent's tasks.

// ── Tasks & chat ──────────────────────────────────────────
export interface Task {
  id: ID;
  userId: ID;
  title: string;
  status: 'active' | 'done' | 'stuck';
  createdAt: number;
}

export type SenderType = 'human' | 'agent' | 'system';

export interface Message {
  id: ID;
  roomId: string;          // see §3 room naming
  taskId: ID | null;
  subchatId: ID | null;    // null = main human↔agent thread
  senderType: SenderType;
  senderId: ID;            // userId for human, agentId for agent
  body: string;
  createdAt: number;
}

export interface Subchat {
  id: ID;
  taskId: ID;
  kind: 'pair' | 'group';
  participantAgentIds: ID[];   // ≥2 agents; NO humans in subchats
  status: 'open' | 'closed';
  outcome: 'done' | 'stuck' | null;
  summary: string | null;
  closedAt: number | null;
  createdAt: number;
}

// ── Memory & permissioning ────────────────────────────────
export type Classification = 'public' | 'network' | 'private';

export interface MemoryItem {
  id: ID;
  userId: ID;               // whose memory
  content: string;          // natural language fact
  classification: Classification;
  fieldTags: string[];      // atomic facts; explicit allowlist matching
  source: 'chat' | 'seed';
  createdAt: number;
}

export interface Goal {
  id: ID;
  userId: ID;
  taskId: ID | null;
  description: string;
  status: 'open' | 'met' | 'abandoned';
  createdAt: number;
}

// What a requesting agent is allowed to ask for.
export interface InfoScope {
  taskId: ID;
  purpose: string;          // "find summer sublet for Alice"
  fields: string[];         // e.g. ["location_area","price","dates"]
  subchatId?: ID;           // runtime-supplied context for exact notice routing
}

export interface Disclosure {
  id: ID;
  ownerUserId: ID;          // whose data was (or wasn't) released
  requesterAgentId: ID;
  scope: InfoScope;
  released: string[];       // memoryItem ids actually released
  withheldCount: number;
  decision: 'released' | 'partial' | 'denied';
  createdAt: number;
}

export interface DisclosureNotice {
  id: ID;
  taskId: ID;
  subchatId: ID | null;
  ownerAgentId: ID;
  releasedCount: number;
  withheldCount: number;
  decision: 'released' | 'partial' | 'denied';
}
```

---

## 2. Permission rules (memory engine contract)

Given `queryMemory(ownerUserId, requesterUserId, scope)`:

| Owner classification | Requester is owner | Requester in owner's trust edges | Anyone else |
|---|---|---|---|
| `public`   | ✅ | ✅ | ✅ |
| `network`  | ✅ | ✅ | ❌ |
| `private`  | ✅ | ❌ | ❌ |

Additional rules (all enforced server-side, never by the LLM):
1. **Scope filter:** each atomic fact must match an explicitly allowed field
   tag from the canonical task scope. Purpose text cannot bypass this filter.
   Canonical task scope is persisted after human clarification.
2. **Every query writes a `Disclosure` row** — released ids, withheld count,
   decision. Withheld count is total owner facts considered minus returned
   facts, including both classification and scope denials.
3. The requesting agent never sees withheld content — only the count.

### Ingest classification (LLM, on every user chat message + seed)

Prompt the model to emit `{ content, classification, fieldTags[] }`. Defaults
when uncertain → `private` (fail closed).

---

## 3. Socket.IO protocol

**Handshake:** `io(url, { auth: { token } })` — token from `POST /api/login`.
Server middleware verifies token → `socket.data.userId`. On connect, the
browser auto-joins only `user:{userId}`. Agent inboxes are internal runtime
routing, not browser subscriptions to other agents' tasks.

### Room naming

| Room | Members | Purpose |
|---|---|---|
| `user:{userId}` | the human + their agent | main task chat |
| `agent:{agentId}` | that agent | direct agent inbox (1:many) |
| `subchat:{subchatId}` | participating agents (+ UI observers) | A2A threads |

### Events (client → server)

| Event | Payload | Handler |
|---|---|---|
| `task:create` | `{ title }` | creates Task, returns `task:created` |
| `chat:send` | `{ taskId, body }` | human message → agent runtime |

`agent:info_request` is an internal runtime operation, not an accepted client
event. Sender identity is always derived server-side, never from tool args.

### Events (server → client)

| Event | Payload | When |
|---|---|---|
| `task:created` | `Task` | after create |
| `task:updated` | `{ taskId, status }` | agent reports done/stuck |
| `chat:message` | `Message` | any message in a room the client is in |
| `subchat:started` | `Subchat` | agent opened an A2A thread |
| `subchat:message` | `Message` (subchatId set) | agent→agent traffic |
| `subchat:closed` | `{ subchatId, outcome: 'done'|'stuck', summary }` | thread resolved |
| `agent:status` | `{ agentId, status: AgentStatus }` | agent state change (idle→clarifying→negotiating→done/stuck) |
| `network:updated` | `{ agents: Agent[], trusted: ID[], discovered: ID[] }` | per-user graph change |
| `disclosure:logged` | `DisclosureNotice` | scoped notice to authorized task/data owners only |

**Contract for D4:** main-thread messages have `subchatId: null`; senderType
may be human, agent, or system. Agent-to-agent messages have a subchatId.
Never globally broadcast disclosures or join every browser to subchat rooms.

---

## 4. REST API (minimal — chat traffic is socket-only)

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/login` | `{username,password}` → `{token, user}` (auto-register if new user) |
| GET  | `/api/tasks` | → `Task[]` for session user |
| GET  | `/api/tasks/:id/messages` | → `{ task: Task, messages: Message[], subchats: Subchat[], disclosures: DisclosureNotice[] }`, task owner only |
| GET  | `/api/network` | → `{agents: Agent[], trusted: ID[], discovered: ID[]}` |
| GET  | `/api/memory` | → `MemoryItem[]` for session user (debug page optional) |

Auth header: `Authorization: Bearer <token>`.

---

## 5. SQLite schema (`apps/server/src/schema.sql`)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL, pass_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE agents (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle');
CREATE TABLE trust_edges (
  owner_user_id TEXT NOT NULL, trusted_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_user_id, trusted_user_id));
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL);
CREATE TABLE task_scopes (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id),
  purpose TEXT NOT NULL, fields_json TEXT NOT NULL);
CREATE TABLE subchats (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
  outcome TEXT, summary TEXT, closed_at INTEGER);
CREATE TABLE subchat_participants (
  subchat_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  PRIMARY KEY (subchat_id, agent_id));
CREATE TABLE messages (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, task_id TEXT,
  subchat_id TEXT, sender_type TEXT NOT NULL, sender_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE memory_items (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
  classification TEXT NOT NULL, field_tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE goals (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, task_id TEXT,
  description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL);
CREATE TABLE disclosures (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL,
  requester_agent_id TEXT NOT NULL, scope_json TEXT NOT NULL,
  released_json TEXT NOT NULL, withheld_count INTEGER NOT NULL,
  decision TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
```

---

## 6. Internal module boundaries (D1 ↔ D2 ↔ D3)

D1's `index.ts` wires these; D2/D3 implement them and **never edit index.ts**.

```ts
// implemented by D2 — apps/server/src/agents/index.ts
export function registerAgents(io: Server, db: Database, memory: MemoryEngine): void;

// implemented by D3 — apps/server/src/memory/index.ts
export interface MemoryEngine {
  ingest(userId: ID, text: string, source: 'chat'|'seed'): Promise<MemoryItem[]>;
  queryMemory(ownerUserId: ID, requesterUserId: ID, scope: InfoScope):
    Promise<{ items: MemoryItem[]; withheldCount: number; disclosure: Disclosure }>;
  extractGoals(userId: ID, taskId: ID, text: string): Promise<Goal[]>;
}
// OpenAI SDK client; tests may supply a compatible mock at the SDK boundary.
// No dependency on D2's internal LLMClient.
export function createMemoryEngine(db: Database, openai: OpenAI, io?: Server): MemoryEngine;
export function registerMemory(app: Express, db: Database): void; // debug REST

// OpenAI tools available to the runtime (D2 calls, backed by D3's engine):
//   query_memory(ownerUserId, scope)  — permissioned fetch
//   open_subchat(agentIds, taskId)    — pair or group
//   send_subchat_message(subchatId, body)
//   report_to_human(taskId, status, summary)
```

### Phase-0 stub (D1 ships this so D2 can build before D3 lands)

`packages/shared/src/stubMemory.ts` exports a `stubMemoryEngine` returning
fixed sample items — D2 codes against `MemoryEngine`, never the stub directly.

---

## 7. Seed scenario (owned by D3, content fixed here)

Users (password `demo` for all): **alice**, **bob**, **carol**, **dave**, **erin**

Trust edges: alice→bob, alice→carol, bob→alice, carol→alice, bob→dave.

Memory (pre-classified):
- alice: private — "Works at Stripe, salary $185k", "SSN on file"
- alice: network — "Looking for summer sublet near Georgia Tech, May–Aug, <$1200/mo"
- bob: network — separate atomic facts: room 0.4mi from GT campus
  (`location_area`), $950/mo (`price`), May 15–Aug 10 (`dates`),
  furnished (`furnished`)
- bob: private — "Exact address: 726 Spring St NW Apt 4", "Phone 404-555-0182"
- carol: network — "Knows a trusted mechanic (Mike's Auto) for pre-purchase inspection"
- carol: public — "Sells handmade ceramics"
- dave: network — "Selling 2019 Honda Civic, 62k miles, $14,500 OBO, clean title"
- erin: public — "Public housing tip: GT summer sublet listings are available
  through the campus housing board" (`location_area`)

Seed is additive/idempotent. Use stable fixture IDs and a fresh disposable
database for resets; never wipe an existing demo database.
Alice discovers Erin without gaining network/private access. Alice has two
directly trusted peers, Bob and Carol.

Demo path: alice creates the sublet task → her agent subchats bob's agent →
bob's agent releases the network-classified room facts, withholds address/phone
(Disclosure row: `partial`; exactly three facts released and three withheld
when Bob has only the six defined facts and scope is area/price/dates) →
alice's agent reports back with the warm intro. Stretch: dave's Civic task
pulls carol's mechanic knowledge into a **group** subchat.

---

## Changelog

- 2026-10-24: Detailed requirement contracts added without changing their IDs.
  Subchat closure fields persist outcome/summary/closedAt. Task history returns
  scoped disclosure notices for replay. These are additive schema/type changes;
  D1 must migrate existing disposable development DBs without deleting records.

- 2026-10-24: `createMemoryEngine` signature is `(db, llm, io?)` — takes the
  injectable LLM client (mocked in tests) and optional Socket.IO server so the
  engine can emit `disclosure:logged` (PERM-05). Agreed in spec phase.
- 2026-10-24: Added `agent:status` server→client event (§3) — referenced by
  D2/D4 plans (A2A-07, UI-07). Agreed in spec phase.
- 2026-10-24: Spec package migrated to GSD `.planning/` layout — requirements
  now have IDs (PLAT/AUTH/MEM/PERM/A2A/UI/SEED/OPS) tracked in
  `.planning/REQUIREMENTS.md`.

## 8. Execution Precision And Error Behavior

These details settle previously open implementation choices.
They apply to all four role plans and the expanded requirements.

### Commands And Acknowledgements

Socket commands accept an optional Socket.IO acknowledgement callback.
The browser supplies it for task creation and human sends.
Success: `{ ok: true, data: Task }` or `{ ok: true, data: Message }`.
Failure: `{ ok: false, error: { code, message } }`.
Codes: BAD_INPUT, UNAUTHORIZED, NOT_FOUND, CONFLICT, INTERNAL_ERROR.
Do not echo raw exceptions, model prompts, or submitted secrets in errors.
Commit before successful ack/event delivery.
The browser uses a five-second ack timeout as delivery-uncertain, not a retry.
Refetch history before the human deliberately resends uncertain text.
No automatic command retries are required for this demo.

task:create takes `{title}` with 1-200 trimmed characters.
It creates/selects an active task but does not start a model request.
The human then sends the actual request using chat:send.
chat:send takes `{taskId,body}` with 1-4000 non-whitespace characters.
Server-supplied identity and conversation context always override model input.
Unknown browser privileged events have no effect.

HTTP error body is `{error:{code,message}}`.
Use 400 for invalid input, 401 for missing/invalid sessions, 404 for unknown
or unowned tasks, and 500 for handled internal failures.
The public GET /health returns `{ok:true,service:"asymmetry-api"}`.
Do not return memory, tokens, usernames, or model configuration from health.
Persist dates/times as epoch milliseconds and order histories by createdAt/id.

### Peer Memory Context

The trusted runtime supplies owner and requester IDs.
It strips those IDs from arbitrary model arguments.
For a peer read, scope.subchatId is required.
Verify the subchat belongs to scope.taskId.
Verify both the owner agent and requester agent are participants.
Verify the task owner's agent is also a participant.
Verify the task's canonical scope exists and allows every requested field.
No keyword match can enlarge scope.
For owner-self reads without a subchat, the task must belong to that owner.

In a group, every other participant may observe the response.
Therefore authorize each candidate fact for every other participant's user.
A network fact requires its owner to trust each recipient, not only the sender.
If any observer lacks access, omit that fact from the group response.
Private remains unavailable to every peer even in an otherwise trusted group.
Tests cover Alice trusted by Bob while Carol is not: Bob's network fact is
withheld from the group rather than leaked to Carol.
This all-observers check also applies to the human owners observing the group.

### Closure And History Replay

Persist subchat status, outcome, summary, and closed_at together.
Emit subchat:closed only after that transaction commits.
Read history using explicit task ownership before selecting child records.
Return messages, subchat metadata, and browser-safe disclosure notices.
Reconstruct notices from stored audits filtered to that task/subchat context.
Never include raw released-ID lists or withheld content in browser history.
An unknown historical notice must not be attached to the first active pane.
D1 adds closure columns idempotently for existing schema files.
Do not drop or truncate tables to make the updated schema match.

### Exact Base Housing Fixture

Alice's demo request specifies flexible or exact dates explicitly.
For an exact-match rehearsal use May 15-August 10 and budget below $1200.
Bob offers 0.4mi from campus, $950/month, and May 15-August 10.
Bob's six facts are area, price, dates, furnished, exact address, phone.
With fields location_area/price/dates, return three facts and withhold three.
If furnished is explicitly added to canonical scope, return four/withhold two.
Never count only private denials while ignoring other out-of-scope facts.
If Alice needs dates beyond Bob's availability, report a partial match honestly
and ask whether the shorter interval works; do not mark it a full match.
