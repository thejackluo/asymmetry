# ASYMMETRY — GST Plan

> Get Shit Done plan. 5-hour hackathon, 4 Devins in parallel, greenfield repo.
> Stack confirmed: npm-workspaces monorepo (Next.js + Node/Socket.IO + SQLite).
> Operating mode: **fully autonomous** — each Devin pushes every ≤30 min,
> opens its own PRs, and a *different* model reviews every PR.

---

## G — GOAL

**One-liner:** Every human has a personal AI agent ("digital twin"). Agents talk
to each other across a trusted network to discover mutually beneficial
opportunities — jobs, housing, buyers/sellers, introductions — that no human
would have found alone.

**The insight we're demoing:** supply and demand already exist inside your
extended network. The missing piece is coordination + *scoped trust*. Agents
share only what a task strictly requires.

### Win condition (what the judges see)

1. Log in as **Alice** → create task: *"Find a summer sublet near Georgia Tech,
   May–Aug, under $1200/mo."*
2. Alice's agent asks 1–2 clarifying questions in the main chat.
3. Agent spawns **subchats** with other users' agents, live on screen. Bob's
   agent answers *only* the scoped fields (area, price, dates) — Bob's private
   info (phone, exact address, income) is visibly withheld via the permission
   check.
4. Agent reports back: *"Bob has a room 0.4mi from GT, $950/mo, May 15–Aug 10.
   Want a warm intro?"*
5. **Network page** lights up: trusted agents vs. agents discovered while
   working the task.
6. Bonus (if time): a second task shows a **group subchat** where 3 agents
   coordinate (car sale → seller agent + mechanic-agent + buyer agent).

---

## S — SPEC

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ apps/web  (Next.js + TS + Tailwind)            → DEVIN 4    │
│  /login            username+password                        │
│  /tasks            task list + chat + A2A subchat panes     │
│  /network          trusted vs discovered agent graph        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Socket.IO (session token auth)
┌──────────────────────────▼──────────────────────────────────┐
│ apps/server (Node + Express + Socket.IO + TS)               │
│                                                             │
│  index.ts ── auth, REST, socket boot          → DEVIN 1     │
│  ├── agents/   runtime, A2A protocol, group   → DEVIN 2     │
│  │            chat, OpenAI client, subchat                  │
│  │            orchestration                                 │
│  ├── memory/   classifier, goals, scoped      → DEVIN 3     │
│  │            disclosure, seed data                         │
│  └── db.ts ─── SQLite (better-sqlite3)        → DEVIN 1     │
│                                                             │
│ packages/shared — contract types & constants  → DEVIN 1     │
└─────────────────────────────────────────────────────────────┘
```

### Key decisions

| Decision | Choice | Why |
|---|---|---|
| Stack | Monorepo: Next.js + Node/Socket.IO server (npm workspaces) | clean layer split, minimal overlap |
| Agent runtime | **Hybrid** — chat completions for dialogue, OpenAI function calling for `query_memory` / `request_disclosure` / `send_agent_message` | permissioning is the differentiator; tools make scope enforcement real |
| Model | `gpt-4o-mini` via `OPENAI_MODEL` env var | fast + cheap; key via `OPENAI_API_KEY` |
| Persistence | SQLite via `better-sqlite3`, one file `asymmetry.db` | zero setup, survives restarts |
| Auth | username + bcrypt password → session token → socket handshake | simplest thing that works |
| Trust model | `public` / `network` / `private` classification per memory item + per-request scope check | the core feature |

### The core loop (all Devs must understand this)

1. Human chats with **their** agent in a task thread. Agent clarifies
   requirements, writes a goal.
2. Agent decides it needs outside info → opens a **subchat** to another user's
   agent (or a group subchat).
3. The remote agent receives `info_request {taskId, scope, fields[]}`. Its
   runtime calls the **memory engine**, which returns *only* items whose
   classification permits disclosure to that requester *and* that match the
   scope. Everything else is invisible — not filtered after the fact.
4. Agents negotiate → originating agent reports `done` (with result) or
   `stuck` (with reason) to its human.
5. All A2A messages are stored as subchat messages → rendered in UI, and any
   agent that participated appears as "discovered" on the network page.

### Non-goals (explicitly out of scope for 5h)

- Real OpenAI "digital twin" ingestion — memory is seeded + user chat only
- Multi-device, logout, password reset, email
- E2E encryption, real auth hardening
- Mobile / responsive beyond "looks fine on a laptop"

---

## T — TASKS & PHASES

### Phase 0 — Foundation (Devin 1 only, ~25 min, everyone else waits)

D1 lands scaffold + contracts on `main`. D2/D3/D4 branch off the moment it
merges. While waiting, D2–D4 read `CONTRACTS.md` and stub their modules.

### Phase 1 — Parallel build (~1h40, zero file overlap)

| Devin | Owns (exclusive) | Delivers |
|---|---|---|
| **D1** | repo root, `packages/shared`, `apps/server/package.json`+`tsconfig.json`, `src/index.ts`, `db.ts`, `auth.ts`, `schema.sql` | runnable skeleton: auth'd socket connect, REST stubs, DB migrated, vitest wired in `apps/server`, extension points `registerAgents(io,db)` / `registerMemory(app,db)` already called by index.ts |
| **D2** | `apps/server/src/agents/**` | agent event loop, room/subchat routing, A2A protocol incl. group subchat, OpenAI tool-use loop, status reporting (done/stuck) |
| **D3** | `apps/server/src/memory/**` + `seed.ts` | ingest classifier (public/network/private), goal extraction, `queryMemory(userId, requesterId, scope)` disclosure engine, disclosure audit log, demo seed data |
| **D4** | `apps/web/**` (entire Next.js app) | login page, tasks page w/ chat + subchat panes, network page (trusted vs discovered), socket client |

**The boundary that keeps D2/D3 clean:** `queryMemory` and `registerMemory` are
defined in `packages/shared` (contract). D2 builds against a stub D1 ships in
Phase 0; D3 implements the real thing. They never touch each other's files.

### Phase 2 — Integration (~40 min)

- Merge all branches to `main`, run seed, boot both apps
- Run the win-condition demo end-to-end, file bugs, devs fix in their own layer
- D4 polishes visuals (subchat slide-in, network graph animation)

### Phase 3 — Demo hardening (~35 min)

- Freeze demo path: exact clicks, exact prompts
- Fallback: record a backup video / keep seeded DB ready to reset
- Group-chat bonus only if Phase 2 finished early

### Timeline (~3h of autonomous pushes, rest is buffer)

```
0:00 ─ Phase 0 (D1)          ─ 0:25
0:25 ─ Phase 1 (all 4)       ─ 2:05   ← push cadence in force
2:05 ─ Phase 2 integration   ─ 2:45
2:45 ─ Phase 3 demo harden   ─ 3:20
3:20 ─ buffer + rehearsal    ─ remaining time
```

### Autonomous operating rules (all Devins — also embedded in each prompt)

- **Cadence:** commit + push to your `devin-N` branch at least every **30 min**,
  even WIP. Small commits; the branch is yours alone.
- **PRs:** open a **draft PR** in your first work session. Body must contain:
  summary, CONTRACTS.md sections touched, and pasted verification output.
  Keep it updated; mark ready when your done-when checklist passes.
- **Review:** a *different* model reviews every PR — no self-review. Treat
  every review comment as a work item: fix and push. Push back only via a
  comment, and only when it conflicts with CONTRACTS.md.
- **Contract changes:** never silent — PR description + a dated line in
  CONTRACTS.md `## Changelog`.
- **Merging:** `main` must always boot. Merge order: D1's Phase-0 PR first,
  then D2/D3/D4 rebase and merge when approved + green. Never force-push main.
- **Testing is autonomous too:** each Devin writes and runs tests for their
  own layer and pastes results in the PR. Nobody tests someone else's layer.

### Communication protocol — GitHub is the team chat

- **GitHub Issues = message board.** Bugs, blockers, cross-layer requests,
  questions. Title format `[Dn] short description` routes it to the owning
  layer (`[D2]` runtime, `[D3]` memory, `[D4]` web, `[D1]` platform).
- **GitHub Projects = task board.** One card per work item; each Devin keeps
  its own cards' status current as it works.
- **Polling:** every Devin runs `gh issue list` and checks its project column
  roughly **every 5 minutes** while working, and responds wherever tagged.
- **Addressing:** Devins don't have their own GitHub identities — tag the
  *human's* GitHub username; every Devin that human runs will see it. The
  `[Dn]` title prefix tells those Devins which one should act.
- **Blocked on another layer?** File an issue, tag the owner's username, keep
  working on a stub/mock fallback — never sit idle waiting.
- **Contract changes** start as an issue, get agreed there, then land via a
  PR + Changelog entry.

### Definition of done (whole project)

- [ ] Win-condition demo runs live, end-to-end, on seed data
- [ ] A2A subchats visibly distinct from human↔agent chat in UI
- [ ] Permissioning demonstrable: ask for out-of-scope info → refusal/withhold logged
- [ ] Network page shows ≥3 trusted agents + ≥1 discovered agent
- [ ] `npm run dev` at root boots everything with one command
- [ ] `npm test` green — every layer shipped tests with its PRs
