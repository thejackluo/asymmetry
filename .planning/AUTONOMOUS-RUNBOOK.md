# Autonomous Execution Runbook

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

This is the operational checklist every person's Devin executes.
Technical decisions remain in IMPLEMENTATION-DECISIONS.md and CONTRACTS.md.
The workflow has two stages: Plan, then Execute including review and ship.
This document does not itself start sessions, polling jobs, or reviewers.

## 1. Role And Routing

| Role | Owner | Mention | Branch | Work |
|------|-------|---------|--------|------|
| D1 | Jack | @thejackluo | devin-1 | Foundation, composition, integration, coordination |
| D2 | Bayzhan | @bayzhan8 | devin-2 | Runtime and agent messaging |
| D3 | Jad | @jmb245 | devin-3 | Memory and permissioning |
| D4 | Akash | @AkashSingirikonda | devin-4 | Frontend |

The role is stable even if one operator launches multiple sessions.
Use a separate clone or worktree per editing session; do not switch branches
under another agent in a shared working directory.
Repository: `thejackluo/asymmetry`.

## 2. Startup Checklist

- Read AGENTS.md, TEAM.md, binding decisions, contracts, your SPEC and PLAN.
- Confirm the current branch and worktree state before editing.
- Preserve unfamiliar uncommitted changes; never reset or clean them away.
- Confirm repository push access and the actual authenticated GitHub account.
- Confirm access to Issues, PRs, and the shared GitHub Project.
- Read the `[ALL] Agent registry` issue and register your session.
- Registry entry: role, owner, session ID, branch, implementer model ID,
  proposed reviewer model ID, current task, last-seen UTC timestamp.
- Record actual resolved model identities, not only ambiguous aliases.
- D2-D4 wait for foundation merge before building against its code.
  They may inspect specs and raise issues while waiting.
- No OpenAI key is required for deterministic unit tests.
- Provision keys privately for the live smoke test; do not put them in issues.
- If external permissions need human action, post one precise blocker and
  continue independent work. Do not repeatedly request the same secret.

## 3. Task Claim And Collaboration

1. Find the existing issue/card before creating a duplicate.
2. Use title `[D2 Bayzhan] short request` or the corresponding named role.
3. Mention the exact operator handle from the table.
4. Comment `CLAIM Dn/session-id` before editing; mark card In Progress.
5. If another active session claimed it, do not implement it simultaneously.
6. Record dependencies and the contract sections affected.
7. A cross-layer request remains owned by the recipient's layer.
8. The requester keeps working against its agreed stub/mock boundary.
9. Contract changes require an issue decision, revised contract, and
   acknowledgements from affected owners before dependent code is merged.
10. Jack resolves scope/ownership disputes; never silently change the API.

Issue updates contain: status, owner, evidence, exact next action, and blocker.
Bugs additionally contain reproduction, expected/actual behavior, severity,
affected requirement, and the proposed regression check.
Use severity P0 for data exposure/data loss or a completely unusable demo;
P1 for core-path failure; P2 for nonblocking polish.

## 4. Five-Minute Inbox Loop

- Store the last processed UTC timestamp in session state, not in secrets.
- At startup, before readiness, and every five minutes while working, read
  repository issues updated since that timestamp, including closed issues.
- Read comments on updated issues; a title-only list is insufficient.
- Read review comments and requested changes on your open PR.
- Inspect Projects for newly assigned or moved work.
- Answer direct role requests and notify Jack of blockers.
- Advance the cursor only after processing; allow overlap and deduplicate by
  comment/event ID so equal timestamps do not lose messages.
- Keep the polling task alive when a long build is running if tooling allows.
- If a synchronous tool prevents polling, resume immediately afterward and
  report the delay. Do not claim exact scheduling that did not happen.
- If Projects permissions fail, use issue comments/status labels and tell
  Jack. Never silently treat the task board as updated.
- Before a session stops, post its last SHA, task status, and next action.

### 4a. Mandatory GitHub Watcher (Background Subagent)

Coding work must not block communication, so the inbox loop runs on its own.
- At startup, every session starts a background watcher alongside its main
  work. The watcher can be a subagent, a child session, a background shell
  loop, or a scheduled job, whatever the tool supports. It runs §4 every
  five minutes on its own, even during long edits, builds, or tests.
- The watcher reads issues, comments, PR reviews/requested changes, and
  Projects. It reports new items addressed to this role (or `[ALL]`) back to
  the main session, which acts on them at its next step.
- The watcher may post read-receipts and status replies (`ACK Dn/session-id`,
  "working on it, ETA …") and must never edit code, close others' issues,
  merge, or change claims.
- A direct question or a blocker that names this role gets at least an ACK
  within ~5 minutes; answer it fully or route it to Jack within ~15.
- Refresh the registry `last-seen` timestamp at least every 15 minutes. If a
  session's `last-seen` is more than 15 minutes old, Jack may treat its claim
  as stale and re-assign it after an issue comment.
- If the tooling can't run a watcher, say so in the registry entry and poll
  manually between steps (never more than five minutes apart).

### 4b. Clean Separation

- One role = one branch (`devin-N`) = one owned path set (TEAM.md). Never
  edit another role's paths, even to unblock yourself. Instead, file
  `[Dn Name]` with the exact request and keep working against your stub.
- One claim per session. Each issue has one owner, and each PR covers one
  coherent increment, linked to its issue and requirement IDs.
- Every cross-role message goes in an issue or PR comment, not only in a
  commit message, PR description, or code comment.
- Jack (D1, head agent) has the final say on scope, ownership, and conflicts.


Repository-owner author identity: use `Jack Luo <30420522+thejackluo@users.noreply.github.com>` for authorized project commits as requested by Jack. This session pushes through `@thejackluo`. Do not use Bayzhan/Jad/Akash as commit authors solely because they own a task. Never copy or share Jack's credentials; another operator without authorized account access must report the publishing blocker rather than impersonate an account. Git author metadata and authenticated push identity are separate checks.

- Start the cadence when active edits begin; no empty heartbeat commits.
- Review the diff and stage explicit owned paths, not blind `git add -A`.
- Check for secrets, fixture PII, unrelated files, and generated junk.
- Commit a coherent checkpoint even if it is WIP; label incomplete work.
- Push your role branch and keep its draft PR current. Update the PR body
  (status, tested SHA, blockers) at least every ~30 minutes; open the draft
  PR within the first ~15 minutes of editing, not at the end.
- Record the actual push result and SHA. A local commit is not a push.
- If nothing meaningful changed, keep working; do not manufacture a commit.
- If push is rejected, fetch and inspect. Do not force-push or rewrite shared
  history to meet the clock; coordinate with Jack.
- Use merge-from-main updates on published role branches rather than rebasing
  commits others may have fetched. Re-review the resulting head.
- A long test may exceed the interval: report it and push the next safe
  checkpoint afterward. Do not terminate tests just for the timer.

## 6. Draft PR And Verification

Open one draft PR per coherent phase/role increment during the first session.
Keep it draft until acceptance criteria pass; do not wait hours to publish it.
PR body includes:

- Named owner, role, task issue, dependency PRs, and requirement IDs.
- Summary of behavior, owned paths, and any contract changes.
- Verification command, exit code, tested SHA, and evidence/log path.
- Mocked vs live API evidence clearly separated.
- Known blockers, remaining work, and reviewer identity/model/SHA.

Run your PLAN's layer tests and type/build checks; fix failures you introduce.
If a check cannot run, state why and mark it unverified, never passed.
D1 owns the final integrated HTTP/socket/SQLite/privacy test gate.
D4 adds browser screenshots and tests refresh/reconnect behavior.
Do not reclassify a failing security test as cosmetic to make a PR green.

## 7. Autonomous Different-Model Review

Each implementer initiates the review, but a different model produces it.
Use a fresh session with the pushed diff, contracts, requirements, and test
evidence. Do not give it the implementer's reasoning as a substitute for code.
The reviewing model must not be the implementation model; changing a session
name or using the same model in a second tab does not meet this requirement.

Model selection:

- If implementation used an Anthropic model, request a provisioned OpenAI
  reviewer model; otherwise request a provisioned Anthropic reviewer model.
- For Fusion, record both constituent models and choose a reviewer distinct
  from both. Resolve available models before starting.
- Do not silently fall back to the implementation model.
- If a different model is unavailable, post a review blocker to Jack.

Devin CLI supports `--model`, `--print`, and `--prompt-file` in the installed
CLI documentation. One supported invocation shape, in a separate trusted
review checkout at the pushed SHA, is:

```bash
devin --model "$REVIEW_MODEL" --print \
  --prompt-file ".planning/REVIEW-INSTRUCTIONS.md"
```

Set REVIEW_MODEL to a verified available model distinct from the implementer.
Use your provisioned read-only reviewer configuration and a checkout without
`.env`/production credentials. Do not disable trust or permission safeguards
merely to make non-interactive review start.
Record actual resolved reviewer model, base SHA, head SHA, and output artifact.
No new human review gate is introduced when the capability is provisioned.

## 8. Findings, Fixes, And Re-Review

- Reviewer returns concrete findings with severity, file/line, failure case,
  and missing test; it states explicitly if no findings were found.
- Implementer posts findings to the PR and linked bug issues.
- Address each finding, or explain a grounded technical disagreement.
- Fix all security/core-path blockers before readiness.
- Run the affected tests and push fixes.
- Review the new head again, including changed dependencies/merge conflicts.
- Review approval/evidence for an older SHA never approves a newer head.
- After two unresolved review/fix cycles, ask Jack to resolve the specific
  issue while continuing independent work; do not loop indefinitely.

## 9. Merge Authority

- Jack coordinates merge order: foundation first, then ready layer PRs.
- Required checks must be green on the actual candidate head.
- Same-account model review comments are evidence, not GitHub self-approval.
- Respect branch protection; do not weaken protection or forge approvals.
- If GitHub requires another account's approval, route to an authorized
  teammate after the model review. Report the dependency if unavailable.
- No force-push, destructive DB reset, history rewrite, or irreversible
  external action is authorized by this runbook.
- After merge, mark issue/card Done, link merge SHA, and notify dependents.

## 10. Three-Hour Execution Exit

At the end of the active build window, each owner posts:

- Last pushed SHA and PR link.
- Requirements completed, not just files created.
- Test commands and results, including unverified live checks.
- Current review model/SHA and unresolved findings.
- Remaining bugs, exact repro, next owner/action.

Jack runs integrated verification and the live demo rehearsal.

## 10a. Submission Deadline And Test-Driven Rule

Hard deadline: **5:00 PM ET, 2026-10-24**, on the GT Hacker House dashboard
(https://www.gthackerhouse.com/events/devin-hackathon/dashboard).

| Time (ET) | Gate |
|-----------|------|
| 15:30 | All four layers merged to `main` (D1 first, then D3/D2/D4) |
| 16:15 | Integrated base demo passes on `main` (automated, Jack's rehearsal) |
| 16:30 | Freeze: bug fixes only; capture screenshots/recording |
| 16:45 | Human operator submits |

Prioritize the base housing demo over stretch goals. If a gate slips, cut
scope; never move the deadline.

Test-driven (operator request): failing test first, then code. Every
requirement and bug fix has an automated regression test. Bug reports carry a
failing test or exact repro. Evidence = command + exit code + SHA. Manual
checks are not evidence. Mocked LLM and disposable DB in tests; live-OpenAI
smoke runs are labelled separately.

## 11. Keep Working Until The Project Is Done

Operator request: all Devins keep working until the whole project is done.
- A session does not stop when its own PR is ready or merged. The watcher
  (§4a) keeps running, and the session takes the next item from this list,
  in order:
  1. its own review findings and bugs;
  2. `[Dn]` issues routed to its role;
  3. integration bugs Jack routes after merges;
  4. more regression tests, and demo polish, in its own paths;
  5. independent review of another role's PR, when it's a different model
     from that PR's implementer.
- Claim every item with `CLAIM Dn/session-id`. Never edit another role's
  paths just to stay busy.
- Done means: Jack posts `[ALL] DONE` after the demo script passes
  end-to-end (PROJECT.md Definition of Done). Only then may sessions stop,
  each after posting its last SHA/status (§10).
- If a session must stop earlier (credits, crash, operator), it posts its
  last SHA, status and next action in its claim issue so another session
  can resume.
No agent claims the application is complete based only on these documents.
