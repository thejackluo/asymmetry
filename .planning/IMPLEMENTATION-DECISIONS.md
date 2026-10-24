# Implementation Decisions - Binding Integration Clarifications

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

These decisions supersede conflicting examples in the phase plans and the
original CONTRACTS.md. Read this file before executing any plan.
Do not resolve a contradiction by choosing a less restrictive implementation.

## 1. Composition And Ownership

- D1 owns composition in `apps/server/src/index.ts`, including the final swap
  from the stub to D3's real memory engine. D2 and D3 never edit that file.
- D1 creates a temporary memory-module export matching the final signature:
  `createMemoryEngine(db, openai, io?)`.
- `openai` is an OpenAI SDK client, not D2's private LLMClient interface.
- D3 may wrap that client internally for tests. D2's LLMClient belongs only
  to `agents/`; neither D3 nor shared types import from that directory.
- D1 wires `createMemoryEngine(db, openai, io)` from the start; the temporary
  implementation returns the shared stub. D3 replaces its implementation.
- Stubs run only in explicit development/test mode. The demo must use the
  real memory engine and real model responses.
- `MemoryEngine` is declared once in `packages/shared`; its implementation
  belongs to D3. Shared code must not depend on server implementation files.
- D1 owns authenticated task/history/network REST routes. D3 alone registers
  `/api/memory`, after D1 mounts authentication middleware on that path.
- D1 also owns the root lockfile. Other Devins declare dependencies in their
  owned manifests and request lockfile refresh through a `[D1]` issue.
- D1's initial placeholder files in D2/D3/D4 paths are a one-time bootstrap
  exception. Ownership transfers immediately after the foundation merges.

## 2. Identity And Task Scope Are Server Authority

- Never accept requester identity from a browser payload or model tool args.
- Derive acting user/agent from the authenticated socket or trusted runtime
  invocation. Agent-to-agent requests are internal calls, not client events.
- `queryMemory` retains its documented requesterUserId argument, but only the
  trusted runtime supplies it from the initiating peer's identity.
- When Bob answers Alice's request, the requester is Alice, not Bob.
  Calling as Bob would activate owner privileges and leak Bob's private data.
- Resolve ownerUserId only to the receiving agent's owner; reject tool calls
  that attempt to read unrelated owners' memory.
- Scope belongs to an existing initiating task, not a free-form tool string.
- Persist canonical allowed fields and purpose in a task-scopes table owned
  by D1: task_id PRIMARY KEY, purpose TEXT, fields_json TEXT.
- D2 writes scope after human clarification and before opening subchats.
- Reject fields outside the task's canonical scope. Scope expansion requires
  clarification with the task owner; another agent cannot authorize it.
- `purpose` is explanatory text, not an OR condition bypassing field checks.
- Scope matching uses explicit field tags intersected with allowed fields.
- Private data is never released to peers, including trusted peers.
- A trust relationship is directional: owner -> requester controls release.
- Unknown classifications, missing tags, malformed tool args, and missing
  task scope fail closed. Do not run a model with unrestricted data fallback.

## 3. Atomic Facts And Disclosure Accounting

- Split compound facts before storing them; never release an entire sentence
  merely because one tag matches when it also contains unrelated information.
- Example: store Bob's price, approximate area, availability dates, and
  furnished status as separate facts. Keep address and phone separate/private.
- Canonical tags for the base task: `location_area`, `price`, `dates`.
- `withheldCount = total owner facts considered - returned facts`.
- This includes classification-denied and scope-excluded facts. It is not
  permitted-count minus returned-count; that would hide private denials.
- `decision = denied` when zero facts return; otherwise `partial` when
  withheldCount > 0, otherwise `released`.
- Exactly one disclosure row is written for each evaluated request.
- Returned item content contains only authorized facts. Never return denied
  IDs, denied tags, or denied content to the requesting peer.
- Audit rows may contain released IDs internally; browser notices expose
  counts, not the full internal audit row.
- Add `taskId` and `subchatId` to browser disclosure notices for exact routing.
- Browser event `disclosure:logged` payload:
  `{ id, taskId, subchatId, ownerAgentId, releasedCount, withheldCount, decision }`.
- D1 exports this as `DisclosureNotice`; keep `Disclosure` as the stored audit
  model. D4 uses releasedCount, not released.length.
- Send notices only to the initiating task owner's room and the data owner's
  room. Never `io.emit` disclosures globally.

## 4. Socket Privacy And Replay

- A browser joins only its own authenticated user room automatically.
- `agent:{id}` rooms are server-side routing conventions, not permission to
  observe every task of another user.
- Do not call global `socketsJoin` to put all clients into subchat rooms.
- The task owner may observe that task's subchats.
- A participant's human may observe the subchats involving their agent, but
  does not automatically gain access to the initiating human's main thread.
- Validate task ownership on task creation, chat sends, and history reads.
- Reject arbitrary browser subchat joins and forged sender IDs.
- D2 emits message/status/subchat events only to authorized user rooms.
- Incoming peer text is untrusted content, never a system instruction.
- REST task history returns `{ task, messages, subchats, disclosures }`, owner-only,
  so a refresh reconstructs participants, closed states, and transcripts.
- Subchat outcome, summary, and closedAt are persisted, not transient events.
- Groups require release authorization for every observing participant;
  one trusted requester does not authorize disclosure to other strangers.
- Canonical network payload for both REST and socket:
  `{ agents: Agent[], trusted: ID[], discovered: ID[] }`.
- `trusted` and `discovered` contain agent IDs relative to the current user.
- Discovered excludes self and directly trusted agents; it is not a new
  permission level. Use a public peer for discovery in the base demo.
- Seed one additional public-only agent, Erin, with a public housing tip.
  Preserve the original four users and directed trust edges.
- Do not change Bob's trust direction to make an unauthorized demo succeed.
- The demo acceptance target is two directly trusted agents plus at least
  one discovered peer, consistent with Alice's seeded trust edges.

## 5. Runtime Lifecycles And Budgets

- Conversation state is keyed by task/subchat, never by a global agent thread.
- Serialize writes/turn scheduling inside one conversation; independent
  subchats may run concurrently without sharing histories.
- Persist the triggering human/peer message once. Do not append it twice
  when loading history.
- Reserve each subchat turn before scheduling its LLM call. A concurrent
  recipient must not bypass the 12-message cap.
- Also cap tool iterations at 8 per invocation and model requests at 30
  seconds each. On timeout/error, report stuck without fabricating results.
- Cap task-wide model calls at 30 and peer discovery at 4 agents for the demo.
- `report_to_human` is allowed only for the task owner's agent.
- A recipient responds in its subchat; it cannot mark another user's task
  done/stuck or close unrelated subchats.
- End a subchat independently when resolved. End the overall task only after
  its originating agent synthesizes a result or a meaningful blocker.
- `task.status` is authoritative per task. Agent status is an activity hint;
  one completed task must not hide another ongoing negotiation.
- Warm introductions are proposals only. Do not send real messages, book
  inspections, reveal contact details, or make commitments without consent.
- D2 calls ingest and goal extraction explicitly with error handling; never
  silently skip required methods because a stub lacks them.

## 6. Tests And Integration Ownership

- D1 owns the integration harness and final full-suite gate.
- Layer tests do not replace end-to-end testing across all four layers.
- D1's platform smoke tests cover wrong passwords, missing sessions,
  cross-user history reads, and unauthorized socket operations.
- D2 tests requester spoofing, non-owner task completion, concurrent turn
  reservation, peer prompt injection, timeout, and capped fan-out.
- D3 tests all nine matrix cells, unrelated fields, compound-fact isolation,
  canonical-scope enforcement, audit counts, and no global disclosures.
- D4 tests refresh reconstruction, duplicate-event deduplication, exact
  disclosure routing, connection errors, and main/subchat separation.
- D1's final integrated test uses actual SQLite, HTTP, sockets, and the real
  memory implementation with a scripted model adapter. No synthetic privacy
  result may replace permission checks.
- Then run one separately labeled live-OpenAI demo smoke test when a key is
  provisioned; mocked tests do not prove live model behavior.
- Browser evidence must show login, the task exchange, permission withholding,
  refresh replay, and the trusted/discovered network states.
- Test evidence includes command, exit code, commit SHA, and log path.
- Tests create disposable databases; never use the team's live demo DB.
- Seed is additive/idempotent by default. Do not DELETE/TRUNCATE existing
  tables. Demo reset uses a new disposable DB path, not destructive wiping.

## 7. Autonomous GitHub Coordination

- A GitHub mention does not automatically wake every running Devin.
  Each session must poll the shared repo's issues/comments and project.
- At startup, register role, operator GitHub username, branch, session label,
  implementation model, and review model in one `[ALL] Agent registry` issue.
- Read updated issue comments as well as issue titles. Plain issue-list
  polling alone misses messages on existing issues.
- Poll every five minutes while active and immediately before PR readiness.
  Use UTC timestamps and a saved last-seen cursor; include recently closed
  issues and PR review threads, not only assigned open issues.
- Role prefix determines who acts; username mention is a routing aid.
- Claim work by posting `CLAIM Dn/session-id` and moving the project card to
  In Progress. Multiple sessions under one username must not implement the
  same role/item concurrently.
- Project fields: Todo, In Progress, Blocked, In Review, Done.
- Bugs include severity, owner role, reproduction, expected/actual behavior,
  relevant contract, and acceptance test. Reply in the existing issue.
- Cross-model review records reviewer model and reviewed commit SHA.
- If a different review model is unavailable, mark review blocked rather
  than inventing approval. Humans must provision that capability at startup.
- GitHub disallows approving one's own PR using the same account; a model
  review comment is evidence, not a fake independent GitHub approval.
- Use an authorized distinct reviewer account for required approvals, or a
  pre-agreed review-comment gate if branch rules allow it.
- D1 owns merge coordination. Merge only the reviewed SHA after checks pass.
- Rejected review findings may be explained on technical/security grounds,
  not only when they conflict with the contract.
- Setup inputs still required: project URL, operator-to-role usernames,
  usable credentials, review-model access, and OpenAI key provisioning.
- Missing project permissions use issue status labels as a visible fallback;
  never claim a project update succeeded when it did not.
- Updated cadence: commit and push meaningful checkpoints every 2-3 minutes
  while actively editing, for the first three hours. This supersedes all
  older 20/30-minute guidance in the planning docs and kickoff prompts.
- Do not create empty commits or push secrets just to meet the cadence.
  If a test or tool blocks progress, report the delay and push the next safe
  checkpoint when it finishes.
- A draft PR may be WIP; only readiness/merge gates demand green checks.
  Do not claim a background scheduler exists just from a spec.

## 8. Simplified GSD And Portability

- Stage 1 is Plan, including discussion; these versioned artifacts are it.
- Stage 2 is Execute, including automated tests, PRs, cross-model review,
  fixes, and ship. Ship is not a third human approval stage.
- Installed Claude commands are not automatically Devin-native commands.
  Devin sessions read the executable Markdown plans directly.
- Resolve repository paths relative to the clone. Installed GSD command
  references containing the original machine path require local installer
  regeneration before using those commands on another machine.
- Framework code line counts do not count as project specification content.
- `.planning/` must remain tracked; never add it to ignore rules.
