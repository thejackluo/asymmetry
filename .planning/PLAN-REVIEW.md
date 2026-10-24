# GSD Planning Review And Source Coverage

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

## Method

This planning pass uses the installed GSD planner, phase-prompt template,
plan-checker dimensions, and mandatory source-coverage reference.
They were read as workflow instructions, not invoked through an unavailable
Claude Code slash-command runtime.
Discussion and planning remain one stage as requested.
Execution includes tests, independent-model review, fixes, and ship.

## Defects In The Earlier Planning

1. Requirement checkboxes named features but omitted rejection and failure behavior.
2. Seven/eight-task monolithic plans exceeded GSD's bounded task-batch guidance.
3. Wave 1 metadata conflicted with actual foundation dependencies.
4. Phase 5 had no executable integration plan.
5. Closed subchat summaries existed as events without persisted replay fields.
6. Group disclosure considered one requester rather than every observer.
7. Demo withholding counts ignored the separate furnished fact.

## Changes Made

- Preserve all 51 requirement IDs and add detailed acceptance contracts.
- Each contract identifies owner, trigger/input, behavior, rejection, and evidence.
- Preserve the original implementation tasks while splitting into bounded plans.
- Three sequential batches per role; D2/D3/D4 batches run concurrently.
- Add a three-task integration/privacy/browser/review plan.
- Make artifacts concrete paths and key links explicit between components.
- Add persistent closure fields and disclosure-history replay to contracts.
- Require all group observers to qualify before any fact is released.
- Define exact housing fixture outcomes for three-field and four-field scopes.
- Publish changes from an isolated spec worktree without switching active builders.

## Requirement-To-Plan Coverage

| Source | IDs | Implementing plans | Verification boundary |
|--------|-----|--------------------|-----------------------|
| REQ | PLAT-01,03,04,07,08,09 | 01-01, 01-03 | Workspace/types/config/tests |
| REQ | PLAT-02,05,06 | 01-02, 01-03 | Real DB/auth/composition |
| REQ | AUTH-01 through AUTH-05 | 01-02, 01-03 | Real HTTP and sockets |
| REQ | A2A-02,09 | 02-01, 02-03 | Injected model/context capture |
| REQ | A2A-01,03,04,05,06,07,08 | 02-02, 02-03 | Runtime tools/scheduling/privacy |
| REQ | MEM-01 through MEM-05 | 03-01 | Actual classified storage/prompt boundary |
| REQ | PERM-01 through PERM-05 | 03-01, 03-02, 03-03 | Real authorization/audits/notices |
| REQ | SEED-01 | 03-03 | Idempotent fixture DB |
| REQ | SEED-02 | 03-03, 05-01 | Fixture check plus integrated demo |
| REQ | UI-01,09 | 04-01, 04-03 | Session/transport/reconnect |
| REQ | UI-02 through UI-07 | 04-02 | Tasks, thread separation, notices |
| REQ | UI-08,10 | 04-03, 05-01 | Graph/build/browser evidence |
| REQ | OPS-01 through OPS-06 | Every role batch, 05-01 | Cadence/issues/PR/review evidence |

## Goal And Decision Coverage

| Source | Locked goal/decision | Coverage |
|--------|----------------------|----------|
| GOAL | Foundation unblocks consumers without file collisions | 01-01 through 01-03 |
| GOAL | Visible scoped agent collaboration | 02-01 through 02-03 |
| GOAL | Classified memory and enforceable disclosure | 03-01 through 03-03 |
| GOAL | Real Tasks/Network demo | 04-01 through 04-03 |
| GOAL | Cross-layer verification | 05-01 |
| CONTEXT | D-01,02,04,08,11,12 | Runtime contexts/tools/group protocol |
| CONTEXT | D-06,07 | Atomic memory and permission matrix |
| CONTEXT | D-03,05 | Login/task/peer/graph browser flows |
| CONTEXT | D-09,10 | Foundation composition and shared types |
| CONTEXT | D-13,14 | Exclusive paths and named role registry |
| CONTEXT | D-15 through D-21 | Common autonomous runbook and plan verification |
| CONTEXT | D-22 | Expanded detailed REQUIREMENTS.md |
| CONTEXT | D-23 | Spec commits and GitHub coordinator broadcast |
| RESEARCH | Installed GSD task sizing and source audit | Split plans and this report |
| RESEARCH | Auth/model/live-library implementation details | Fetch current docs during implementation |

## Dependency And Parallelism Review

- 01-01 -> 01-02 -> 01-03 occupies waves 1-3.
- Each owner's next three batches occupy waves 4-6.
- D2/D3/D4 depend only on the foundation and their own prior batch.
- Runtime uses the injected memory interface, never imports D3 internals.
- Integration waits for 02-03, 03-03, and 04-03 at wave 7.
- No circular dependency is intended.
- Same-owner sequential batches may share paths; parallel owners may not.
- The explicit D1 bootstrap exception ends after foundation handoff.

## Execution Caveats

- Planning review is not implementation testing or independent code review.
- No model review approval is claimed by this planning document.
- Application owners must map existing commits to batches instead of restarting.
- Schema changes are additive; existing local records must survive migration.
- Group observers may legitimately receive fewer facts than a trusted pair.
- External review/model/project access may still require provisioning.
- Short kickoff files are entry points; expanded requirements and task batches
  now hold the concrete execution detail rather than omitted assumptions.
- Test evidence and actual reviewed SHAs remain mandatory before readiness.
