# OPERATING-RULES.md — Autonomous multi-Devin workflow

These rules bind all four Devins for the whole session. They are also embedded
in each `prompts/DEVIN-*.md`, but this file is canonical.

## Workflow (simplified GSD)

```
PLAN ──(done — everything in .planning/)──► EXECUTE ──► SHIP
                                          │              │
                                    your phase plan   push · PR ·
                                    + verify tasks    cross-review
```

- **PLAN**: finished. `.planning/` + `CONTRACTS.md` are your complete spec.
  Do not re-derive requirements — execute them.
- **EXECUTE**: work your `phases/NN-*/NN-01-PLAN.md` tasks in order; run each
  task's `<verify>`; check every `<acceptance_criteria>`.
- **SHIP**: continuous — cadence pushes, draft PR, cross-model review. There
  is no human gate until demo rehearsal.

## Cadence & branches

- Branch: `devin-N` (your number). Yours alone; never push to another Devin's.
- Commit + push every **≤30 minutes**, WIP is fine. Small commits.
- Never force-push `main`. `main` must always boot.

## Pull requests

- Open a **draft PR** in your first work session; mark ready when your plan's
  acceptance criteria pass.
- PR body must contain: summary, CONTRACTS.md sections touched, requirement
  IDs addressed (e.g. `A2A-03`), and **pasted verification output** (test
  runs, curl results, screenshots where relevant).
- Keep the PR body current on every push — reviewers read it first.

## Review (cross-model, mandatory)

- A **different model** reviews your PR — never self-review.
- Every review comment is a work item: fix and push, or reply only if it
  conflicts with CONTRACTS.md (cite the section).
- When reviewing another Devin's PR: check contract conformance, owned-path
  containment, and whether pasted verification is real.
- Merge only after approval + your checks green. Merge order: D1 Phase-0 PR
  first; then D2/D3/D4 rebase onto it and merge.

## Communication — GitHub is the only channel

- **GitHub Issues = message board.** Bugs, blockers, cross-layer requests,
  questions. Title format: `[Dn] short description` → routes to owning layer
  (`[D1]` platform, `[D2]` runtime, `[D3]` memory, `[D4]` web, `[ALL]` broadcast).
- **GitHub Projects = task board.** Keep your own cards' status current.
- **Poll every ~5 minutes** while working: `gh issue list` + your project
  column. Respond wherever you're tagged.
- **Addressing**: tag the GitHub *username* of the human whose Devin(s) should
  respond — every Devin that human runs sees it; the `[Dn]` prefix says who acts.
- **Blocked on another layer?** File an issue, tag the owner, keep building on
  your fallback (D2 → `stubMemoryEngine`; D4 → mock `SocketClient`; D3 → mock
  io emit). Never sit idle.
- **Contract change needed?** Issue first → agreement → then PR containing a
  dated line in CONTRACTS.md `## Changelog`. Never silent-change an interface.

## Testing

- You write and run tests for **your** layer only; paste output in the PR.
- vitest is preinstalled by D1 — add `*.test.ts` inside your owned dirs only.
- Do not modify `apps/server/package.json` (D1 owns it). Missing dep? File
  a `[D1]` issue — or use what's already there (D1 preinstalls the shared set).
