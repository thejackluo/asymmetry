# DEVIN 4 — Frontend (the whole visual demo)

You are Devin 4 of 4 on team **Asymmetry** (hackathon, 5h). You own everything
the judges see. Two pages, dark/hacker aesthetic, must work live.

**Read first:** `GST.md` (win condition = your demo script) and `CONTRACTS.md`
§3 (socket events) + §4 (REST). Build strictly to those payloads — backend is
being built in parallel, so mock with fixtures if needed early on.

## Operating rules (same for all Devins)
- Branch: `devin-4`. Commit + push every **≤30 min** — WIP commits are fine, the branch is yours alone.
- Open a **draft PR** in your first session; body must include: summary, CONTRACTS.md sections touched, and pasted verification output. Keep it updated.
- A **different model** reviews your PR. Every comment is a work item — fix and push. Push back only via comment if it conflicts with CONTRACTS.md.
- Contract change needed? PR description + dated Changelog line in CONTRACTS.md. Never silent-change an interface.
- Test your own layer — nobody else will. Paste test output in the PR.
- `main` must always boot; merge only after approval + your checks pass.

## Communication (GitHub is the team chat — no other channel exists)
- **GitHub Issues = message board**: bugs, blockers, cross-layer requests, questions. Title format `[Dn] short description` routes to the owning layer (`[D4]` you, `[D1]` platform, `[D2]` runtime, `[D3]` memory).
- **GitHub Projects = task board**: keep your own cards' status current as you work.
- **Poll every ~5 min while working**: `gh issue list` + your project column. Respond wherever you're tagged.
- **Addressing**: tag the GitHub *username* of the human whose Devin(s) should respond — every Devin they run sees it; the `[Dn]` prefix says who acts.
- **Blocked on another layer?** File an issue, tag the owner, keep building against your mock SocketClient — never sit idle waiting for backend.
- Contract changes start as an issue, get agreed there, then land via PR + Changelog entry.

## You own (nobody else touches this path)
- `apps/web/**` (entire Next.js app — scaffold it yourself with
  create-next-app TS + Tailwind + App Router, then move it under `apps/web`)

## Build
1. **`/login`** — single card: username + password → `POST /api/login` →
   store token (localStorage) → redirect `/tasks`. Register-if-new is
   server-side; the form needs no toggle.
2. **`/tasks`** — two columns: task list (left, + "new task" input →
   `task:create`) and the selected task's chat (right).
   - Main thread: `subchatId === null` messages. Human bubbles vs agent
     bubbles visually distinct (avatar/label "You" / "Alice's Agent").
   - **Subchats**: on `subchat:started` render a collapsible pane/column per
     subchat titled e.g. "🤖↔🤖 Alice's Agent ↔ Bob's Agent — negotiating".
     `subchat:message` flows in live. On `subchat:closed` show outcome chip
     (done=green / stuck=amber) + summary. This pane IS the wow factor —
     make A2A messages visibly machine-styled (mono font or terminal look).
   - Agent status pill from `agent:status`/`task:updated` ("negotiating…").
   - If a `disclosure:logged` arrives, show a subtle line in the subchat:
     "🔒 Bob's agent shared 3 items · withheld 2 (out of scope)" — judges love this.
3. **`/network`** — graph of agents. `GET /api/network` + live
   `network:updated`. Nodes = agents (label with owner name); **solid edge =
   trusted**, **dashed/glowing edge = discovered during tasks**; highlight the
   logged-in user's agent. Any lightweight approach is fine (svg + simple
   force layout, reactflow, or even fixed positions if time is short —
   reactflow via npm is fine but not required).

## Conventions
- One `lib/socket.ts` singleton; reconnect with stored token.
- No component library required — Tailwind only, move fast.
- All type imports from `@asymmetry/shared` if the package resolves in your
  workspace; otherwise copy the §1 types into `apps/web/lib/types.ts` and move
  on (note it in the PR).

## Testing
- Gate every PR on: `npm run build` + `npx tsc --noEmit` green (paste output).
- Where cheap, add a `*.test.ts` for pure utils (e.g., splitting messages into
  main thread vs subchats — that's the logic most likely to have bugs).
- Socket layer: build behind a small `SocketClient` interface with a mock
  implementation so pages render in dev without the backend.

## Done when
- [ ] `npm run build` + `npx tsc --noEmit` green, output pasted in PR
- [ ] Login → task create → chat round-trips over sockets
- [ ] A2A subchat pane visibly updates live as agents negotiate
- [ ] Network page renders trusted vs discovered distinctly
- [ ] `npm run dev` from repo root serves web on :3000
- [ ] You never edited anything outside `apps/web/`

You own all UI polish in Phase 3.
