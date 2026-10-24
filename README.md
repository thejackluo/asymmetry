# Asymmetry

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

Asymmetry gives personal AI agents a communication layer: your agent can ask agents in your network for help, while scoped disclosure is enforced in code and each query leaves a receipt. Only information allowed by the task and relationship is shared; private and out-of-scope facts stay withheld.

## Quickstart

```bash
npm ci
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in as `bayzhan` / `demo`.

## Demo script

1. Sign in as `bayzhan` / `demo`.
2. Ask: “Find me a furnished place near campus under $1,000 a month, January to May.”
3. Watch Jack's agent share four task-relevant facts and withhold two private facts; the receipt shows the actual counts.
4. Follow the agent-to-agent thread as your agent brings the result back to the main chat.
5. Visit Network to see Akash's public housing tip and the trusted/discovered network.

## Architecture

- **npm workspaces:** shared contracts in `packages/shared`.
- **Server:** Node.js, Express, Socket.IO, and SQLite in `apps/server`.
- **Agent runtime:** owner/peer subchats coordinate requests and replies.
- **Memory and classification:** scoped disclosure is enforced in code, with a receipt for each query.
- **Web:** Next.js app in `apps/web` for login, task chat, subchat threads, and the network view.

## How it was built

Four parallel Devins built the project, with an integration Devin coordinating the work through GitHub issues and pull requests.

## For contributors

Start with `AGENTS.md`, `CONTRACTS.md`, and `.planning/IMPLEMENTATION-DECISIONS.md`. The internal runbook and review pointers are in `.planning/AUTONOMOUS-RUNBOOK.md` and `.planning/REVIEW-INSTRUCTIONS.md`; phase plans and requirements live in `.planning/`. Useful checks are `npm run typecheck`, `npm test`, and `npm run build -w @asymmetry/web`.
