# 04-01 SUMMARY: frontend-session-transport

Owner: Akash / @AkashSingirikonda (Devin 4). Branch: `devin-4`.
Tested SHA: `a99e668`.

## Scope

Login + session persistence, one SocketClient lifecycle, honest
connection states, mock ↔ real transports behind one interface.

## Task commits

- Scaffold `apps/web` (Next.js 16 + TS + Tailwind 4, `@asymmetry/web`)
  and lib layer — earlier `devin-4` commits (`ee40149`…`1661caf` range
  history; foundation predates the revised plans).
- `1975515` — hydration-safe session store (`useSyncExternalStore`).
- `a99e668` — reconnecting state, distinct error text, socket `connect`
  from mock, refetch-on-connect, commit/push checkpoint.

## Evidence

- `npx tsc --noEmit` — clean. `npm run lint` — clean.
- `npx vitest run` — 6/6. `npm run build` — all routes static, green.
- Browser (mock mode): login persists across reload; unauthenticated
  /tasks redirects to /login; logout clears identity + socket.
- Login failure surfaces "wrong password" (401) vs "could not reach
  server" distinctly; disconnected socket shows red header dot +
  `reconnecting…` pill instead of stale agent status.

## Requirement coverage

- UI-01 login/session ✓; UI-09 transport boundary + recovery hooks ✓
  (see 04-03 for reconnect refetch); OPS-01…06 ✓ (commit cadence, draft
  PR #9 open early, no secrets in repo, polls of issue #1).
- Deviation: no secrets/credentials committed — PATs flow through chat
  + env vars only, never the repo.
