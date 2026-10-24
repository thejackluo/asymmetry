# 04-02 SUMMARY: task chat + subchat/disclosure UI

Owner: Akash / @AkashSingirikonda (Devin 4). Branch: `devin-4`.
Tested SHA: `a99e668`.

## Scope

Task list + create, chat thread partitioned main-vs-A2A, collapsible
subchat panes with participants/status/outcome, disclosure:logged trust
lines routed to their explicit conversation.

## Task commits

- Initial TaskChat/SubchatPane/TaskList — earlier `devin-4` commits.
- `a99e668` — `routeDisclosures()` (taskId+subchatId routing, id dedupe,
  foreign-task drop); null-subchatId notice → owner system line in main
  thread; wording "private · outside task scope"; closure read from
  entity (`subchat.outcome/summary` per revised shared contract);
  send-delivery uncertainty via contract acks (no silent replay).

## Evidence

- Browser (mock): send → echo → clarifying → negotiating → subchat pane
  streams A2A transcript → 🔒 disclosure line (shared 3 · withheld 2,
  private · outside task scope — partial) → DONE chip + summary →
  `agent done…` pill → task badge flips done.
- `vitest`: partitionMessages 2/2, mergeMessages 1/1, routeDisclosures
  3/3 (explicit-pane routing incl. out-of-order, null→main, dedupe +
  foreign-task drop).

## Requirement coverage

- UI-02 task list/create ✓; UI-03 main thread human/agent/system ✓;
- UI-04 subchat panes, participants + status reconstructed from history
  then live events ✓; UI-05 outcome chip + summary ✓; UI-06 disclosure
  routing/dedupe/wording/denied-neutral ✓; UI-07 distinct
  loading/empty/error/reconnecting texts ✓.
- Deviation: disclosure notices carry no `createdAt`; pane feed appends
  them in arrival order after messages (documented in SubchatPane).
