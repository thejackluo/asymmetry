# ASYMMETRY — Contracts (frozen interfaces)

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
  createdAt: number;
}

// ── Memory & permissioning ────────────────────────────────
export type Classification = 'public' | 'network' | 'private';

export interface MemoryItem {
  id: ID;
  userId: ID;               // whose memory
  content: string;          // natural language fact
  classification: Classification;
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
1. **Scope filter:** only items semantically matching `scope.fields`/`purpose`
   are candidates. The classifier tags each MemoryItem with field tags at
   ingest; query matches on tags + purpose embedding-lite (keyword match is
   fine for the hackathon).
2. **Every query writes a `Disclosure` row** — released ids, withheld count,
   decision. The UI can show "3 items withheld" as a trust signal.
3. The requesting agent never sees withheld content — only the count.

### Ingest classification (LLM, on every user chat message + seed)

Prompt the model to emit `{ content, classification, fieldTags[] }`. Defaults
when uncertain → `private` (fail closed).

---

## 3. Socket.IO protocol

**Handshake:** `io(url, { auth: { token } })` — token from `POST /api/login`.
Server middleware verifies token → `socket.data.userId`. On connect, server
auto-joins `user:{userId}` and `agent:{agentId}`.

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
| `agent:info_request` | `{ toAgentId, scope: InfoScope, subchatId? }` | server-side only (D2 emits internally) |

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
| `network:updated` | `{ nodes: Agent[], trusted: ID[], discovered: ID[] }` | push on any graph change |
| `disclosure:logged` | `Disclosure` | so UI can show "withheld N items" |

**Contract for D4:** human↔agent messages have `subchatId: null` and
`senderType 'human'`; agent↔agent messages always carry a `subchatId`.

---

## 4. REST API (minimal — chat traffic is socket-only)

| Method | Path | Body → Response |
|---|---|---|
| POST | `/api/login` | `{username,password}` → `{token, user}` (auto-register if new user) |
| GET  | `/api/tasks` | → `Task[]` for session user |
| GET  | `/api/tasks/:id/messages` | → `Message[]` incl. subchat messages |
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
CREATE TABLE subchats (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
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
export function createMemoryEngine(db: Database, openai: OpenAI): MemoryEngine;
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

Users (password `demo` for all): **alice**, **bob**, **carol**, **dave**

Trust edges: alice→bob, alice→carol, bob→alice, carol→alice, bob→dave.

Memory (pre-classified):
- alice: private — "Works at Stripe, salary $185k", "SSN on file"
- alice: network — "Looking for summer sublet near Georgia Tech, May–Aug, <$1200/mo"
- bob: network — "Has a room for sublet, 0.4mi from GT campus, $950/mo, May 15–Aug 10, furnished"
- bob: private — "Exact address: 726 Spring St NW Apt 4", "Phone 404-555-0182"
- carol: network — "Knows a trusted mechanic (Mike's Auto) for pre-purchase inspection"
- carol: public — "Sells handmade ceramics"
- dave: network — "Selling 2019 Honda Civic, 62k miles, $14,500 OBO, clean title"

Demo path: alice creates the sublet task → her agent subchats bob's agent →
bob's agent releases the network-classified room facts, withholds address/phone
(Disclosure row: `partial`, withheldCount 2 — this is the money shot) →
alice's agent reports back with the warm intro. Stretch: dave's Civic task
pulls carol's mechanic knowledge into a **group** subchat.

---

## Changelog

_(empty — any contract change gets a dated line here + sign-off from all devs)_
