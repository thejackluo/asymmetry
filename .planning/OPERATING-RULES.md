# OPERATING-RULES.md — Autonomous multi-Devin workflow

Team: Jack (Devin 1, coordinator); Bayzhan (Devin 2); Jad (Devin 3); Akash (Devin 4).

Read `.planning/IMPLEMENTATION-DECISIONS.md` first. Its binding clarifications supersede conflicting examples in this document and the phase plans.

These rules bind all four Devins for the whole session. They are also embedded
in each `prompts/DEVIN-*.md`, but this file is canonical.

## Workflow (simplified GSD)

```
PLAN (discussion + specs)
  -> EXECUTE (implementation + tests + push + PR + cross-model review + ship)
```

- **PLAN**: finished. `.planning/` + `CONTRACTS.md` are your complete spec.
  Do not re-derive requirements — execute them.
- **EXECUTE**: work your `phases/NN-*/NN-01-PLAN.md` tasks in order; run each
  task's `<verify>`; check every `<acceptance_criteria>`.
- **Ship is inside Execute**, not a third planning/approval stage.
  Follow AUTONOMOUS-RUNBOOK.md for commits, collaboration, review, and merge.

## Cadence & branches

- Branch: `devin-N` (your number). Yours alone; never push to another Devin's.
- Commit + push meaningful checkpoints every **2-3 minutes** while actively editing; WIP is fine, but never create empty commits.
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
- Every review comment is a work item: fix and push, or explain a grounded
  technical disagreement with contract and behavioral evidence.
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
- **Addressing**: use verified handles in TEAM.md and the role prefix.
  Sessions must poll updated comments; mentions do not automatically wake them.
- **Blocked on another layer?** File an issue, tag the owner, keep building on
  your fallback (D2 → `stubMemoryEngine`; D4 → mock `SocketClient`; D3 → mock
  io emit). Never sit idle.
- **Contract change needed?** Issue first → agreement → then PR containing a
  dated line in CONTRACTS.md `## Changelog`. Never silent-change an interface.

## Testing

- You write and run tests for your layer; paste output in the PR.
- Jack owns the integrated cross-layer test gate; layer tests alone are
  insufficient to establish demo readiness.
- vitest is preinstalled by D1 — add `*.test.ts` inside your owned dirs only.
- Do not modify `apps/server/package.json` (D1 owns it). Missing dep? File
  a `[D1]` issue — or use what's already there (D1 preinstalls the shared set).
