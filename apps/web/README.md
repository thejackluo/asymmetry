# @asymmetry/web

Asymmetry frontend — personal AI agents negotiating across a trusted network.
Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind 4.

## Run

```bash
# from repo root
npm install
npm run build -w @asymmetry/shared   # once — web imports contract types from shared
NEXT_PUBLIC_SOCKET_MODE=mock npm run dev -w @asymmetry/web -- --port 3000
```

Open http://localhost:3000 — log in with any username (mock auto-registers),
open the seeded task, and send a message to watch the agent↔agent negotiation,
disclosure line, and discovered-edge update replay end to end.

## Shareable demo

`npm run demo` (from the repo root) starts this app in mock mode on port 3000.
Open http://localhost:3000/demo for the self-contained walkthrough. See
[`docs/DEMO.md`](../../docs/DEMO.md).

## Backend wiring

Everything talks through `lib/socket.ts` (`SocketClient` interface) and
`lib/api.ts` (REST). With no backend running, `MockSocketClient` replays the
full demo sequence; point at the real server by clearing mock mode:

- env: `NEXT_PUBLIC_SOCKET_MODE=` `mock` → `real` (unset → real)
- localStorage override: `asym_socket_mode=mock` (takes precedence)
- `NEXT_PUBLIC_API_URL` defaults to `http://localhost:3001`

Events + payloads follow `CONTRACTS.md` §3; REST follows §4. Domain types are
re-exported from `@asymmetry/shared` via `lib/types.ts`.

## Verify

```bash
npm run lint -w @asymmetry/web
npm run typecheck -w @asymmetry/web
npm test -w @asymmetry/web
npm run build -w @asymmetry/web
```
