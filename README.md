# Asymmetry

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

All sessions start with `AGENTS.md` and `.planning/AUTONOMOUS-RUNBOOK.md`; independent reviewers read `.planning/REVIEW-INSTRUCTIONS.md`.

Start with [implementation decisions](.planning/IMPLEMENTATION-DECISIONS.md).
They resolve historical examples in the plans and define the binding behavior.

Personal AI agents ("digital twins") that negotiate across a trusted network to
surface mutually beneficial opportunities — jobs, housing, buyers/sellers,
introductions — that no human would have found alone.

**The insight:** supply and demand already exist inside your extended network.
What's missing is coordination + *scoped trust*. Agents share only what a task
strictly requires — everything else is invisible to the requester, not just
filtered after the fact.

> Built as a 5-hour hackathon project with 4 parallel Devins. Operating mode:
> fully autonomous — each Devin pushes on a cadence, opens its own PRs, and a
> different model reviews every PR.

## Try the demo (no backend, no API key)

```bash
npm install && npm run demo
```

Open http://localhost:3000/demo for a 7-step walkthrough: Jack's agent finds a
summer sublet two hops out (Jack → Carol → Bob) across a 23-agent demo network,
sharing only scoped facts. Details, links and credits: [docs/DEMO.md](docs/DEMO.md).

## How it works

1. A human chats with **their** agent in a task thread. The agent clarifies
   requirements and writes a goal.
2. When it needs outside info, the agent opens a **subchat** with another
   user's agent (or a group subchat).
3. The remote agent receives `info_request {taskId, scope, fields[]}`. Its
   runtime calls the **memory engine**, which returns *only* items whose
   classification (`public` / `network` / `private`) permits disclosure to
   that requester *and* that match the scope.
4. Agents negotiate, then the originating agent reports `done` (with result)
   or `stuck` (with reason) to its human.
5. Authorized observers see agent-to-agent (A2A) messages in subchat panes.
   Previously unknown participating agents appear as discovered; discovery
   does not grant trusted access.

## Stack

Planned (greenfield — see [GST.md](GST.md) for the full spec):

- **Monorepo:** npm workspaces
- **`apps/web`** — Next.js + TypeScript + Tailwind (login, tasks/chat, network graph)
- **`apps/server`** — Node + Express + Socket.IO + TypeScript
- **`packages/shared`** — `@asymmetry/shared`, all contract types & event constants
- **Persistence:** SQLite via `better-sqlite3` (`asymmetry.db`)
- **Agent runtime:** chat completions + OpenAI function calling
  (`query_memory` / `open_subchat` / `send_subchat_message` / `report_to_human`), `gpt-4o-mini`
  via `OPENAI_MODEL`

## Repo layout

```
asymmetry/
├── GST.md            # Goal / Spec / Tasks — the hackathon plan (read first)
├── CONTRACTS.md      # Frozen interfaces between Devins — single source of truth
├── prompts/          # Kickoff prompts for each parallel Devin (DEVIN-1 … DEVIN-4)
├── .claude/          # Committed local GSD installation — see portability note
└── .planning/        # Committed project specifications, plans, and state
```

Once the build lands:

```
apps/web/            # Next.js frontend        (Devin 4)
apps/server/         # API + agent runtime     (Devins 1–3)
packages/shared/     # contract types          (Devin 1)
```

## Team workflow

The project is built by 4 parallel Devins with **zero file overlap**:

| Devin | Owns | Kickoff prompt |
|---|---|---|
| D1 | repo root, `packages/shared`, server boot/auth/db/schema | [prompts/DEVIN-1-thejackluo.md](prompts/DEVIN-1-thejackluo.md) |
| D2 | `apps/server/src/agents/**` — A2A protocol, subchat orchestration | [prompts/DEVIN-2-bayzhan8.md](prompts/DEVIN-2-bayzhan8.md) |
| D3 | `apps/server/src/memory/**` + seed data — scoped disclosure engine | [prompts/DEVIN-3-jmb245.md](prompts/DEVIN-3-jmb245.md) |
| D4 | `apps/web/**` — the entire frontend | [prompts/DEVIN-4-AkashSingirikonda.md](prompts/DEVIN-4-AkashSingirikonda.md) |

Operating rules (full details in `.planning/OPERATING-RULES.md` and the binding decisions):

- Each Devin works on its own `devin-N` branch, committing and pushing meaningful
  checkpoints every 2-3 minutes while actively editing; no empty commits
- **Draft PR in the first work session**; a *different* model reviews every PR
- **CONTRACTS.md is law** — interface changes require agreement + a dated
  Changelog entry. If code disagrees with CONTRACTS.md, the code is wrong.
- **GitHub is the team chat** — Issues are the message board (`[Dn]` title
  prefix routes to the owning layer), Projects is the task board, and each
  Devin polls issues, updated comments, review threads, and Projects every
  ~5 minutes while working; mentions alone do not wake running sessions
- `main` must always boot; never force-push `main`

## Getting started

These are target commands, not runnable application instructions yet.
Once the code lands (foundation followed by parallel phases per the roadmap):

```bash
npm install
cp .env.example .env              # set OPENAI_API_KEY locally; never commit it
npm run dev                         # boots server (and web)
npm run seed                        # additive/idempotent demo seed data
npm test                            # all workspaces' tests
```

Env vars: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`), `PORT`
(default `3001`).

## Working with GSD (Get Shit Done)

This repo has [GSD](https://github.com/gsd-build/get-shit-done) **v1.42.3**
installed under `.claude/` (full profile). GSD is a Claude Code framework that
drives hierarchical, phase-based project planning and execution — it provides
`/gsd:*` slash commands, a library of specialized subagents
(`.claude/agents/gsd-*.md`), workflow hooks, and a `.planning/` workspace for
all generated artifacts.

Both `.claude/` and `.planning/` are committed. Some installed Claude command
references contain the original checkout's absolute path. Regenerate the local
installation before using those commands in another checkout. Devin sessions
can read the Markdown execution plans directly; Claude commands are not
automatically native Devin commands.

### Install / update

From the repo root:

```bash
npx get-shit-done-cc@1.42.3 --claude --local
```

The installed npm package emitted a deprecation warning; it is pinned here
to document what was installed, not as a recommendation for a maintained
upstream release. Reinstallation is optional for Markdown-only execution.
The installer writes the commands, agents, hooks, and the
`get-shit-done/` runtime under `.claude/`. Version and integrity state are
tracked in `.claude/get-shit-done/VERSION` and
`.claude/gsd-file-manifest.json`.

### Core workflow

```
1. PLAN: discussion and planning together, captured in .planning/
2. EXECUTE: implementation, tests, PR, different-model review, fixes, ship
```

Run inside Claude Code:

| Command | What it does |
|---|---|
| `/gsd:new-project` | Initialize a project: questioning → research → requirements → roadmap. Creates `.planning/` artifacts (`PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`) |
| `/gsd:map-codebase` | Map an existing codebase into `.planning/codebase/` (brownfield projects) |
| `/gsd:discuss-phase N` | Capture your vision for a phase before planning → `CONTEXT.md` |
| `/gsd:plan-phase N` | Generate a detailed execution plan (`.planning/phases/NN-name/NN-01-PLAN.md`) |
| `/gsd:execute-phase N` | Execute the phase plan |
| `/gsd:verify-work [phase]` | Verify completed work against the plan |
| `/gsd:progress` / `/gsd:resume-work` | Check status / pick up where you left off |
| `/gsd:pause-work` / `/gsd:capture` | Checkpoint a session / capture a todo or idea |
| `/gsd:debug <issue>` | Structured debugging session |
| `/gsd:review --phase N` | Review a phase (optionally with other models) |
| `/gsd:ship [phase]` | Ship/PR a phase |
| `/gsd:help` | Full command reference |
| `/gsd:update` | Check for and apply GSD updates |

For this repo, `.planning/ROADMAP.md` defines phases 1-5.
Each of the four build phases has a SPEC and executable PLAN.
Phase 5 is integration owned by D1 with layer fixes owned by D2-D4.
Do not rerun project initialization or add separate human discussion gates.
The command reference is available for optional Claude Code use, not a
requirement to run the Devin handoff.

### Where GSD writes

- `.planning/` — project artifacts: phases, plans, research, state
- `.claude/agents/gsd-*.md` — ~30 specialized subagents (planner, executor,
  verifier, debugger, researchers, reviewers, …)
- `.claude/commands/gsd/` — the slash-command definitions
- `.claude/get-shit-done/` — runtime, workflows, references, templates
- `.claude/hooks/gsd-*.js|sh` — session/context/guard hooks wired in
  `.claude/settings.json`

## Key docs

- [docs/PRODUCT-PLAN.md](docs/PRODUCT-PLAN.md), [docs/EXECUTION-BRIEF.md](docs/EXECUTION-BRIEF.md), [docs/STATUS.md](docs/STATUS.md) — post-hackathon product roadmap, working rules, progress
- [GST.md](GST.md) — goal, spec, phases, operating rules, definition of done
- [CONTRACTS.md](CONTRACTS.md) — domain model, socket events, REST API, DB
  schema, memory-engine interface
- [prompts/](prompts/) — per-Devin kickoff prompts with ownership boundaries
