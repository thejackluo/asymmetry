# Planning Context And Locked Decisions

Team: Jack / @thejackluo (Devin 1, coordinator); Bayzhan / @bayzhan8 (Devin 2); Jad / @jmb245 (Devin 3); Akash / @AkashSingirikonda (Devin 4).

## Planning Method

This is the combined discussion/planning artifact for the simplified GSD loop.
The installed gsd-planner and gsd-plan-checker references were read directly.
Plans follow their task/dependency/goal-backward format.
No claim is made that an unavailable Claude slash command ran.
Execute includes implementation, tests, fresh-model review, fixes, and ship.
Planning completion is not application verification.

## Decisions

- D-01: The product is Asymmetry, a coordination network of personal AI agents.
- D-02: One human owns exactly one agent; an agent serves multiple conversations.
- D-03: The app has Tasks/chat and Network, plus a simple login entry.
- D-04: The Tasks page separates human/owner chat from pair/group agent subchats.
- D-05: The Network distinguishes directly trusted peers from discovered peers.
- D-06: Memory is classified public/network/private with fail-closed ambiguity.
- D-07: Code enforces both directional trust and canonical task-field scope.
- D-08: Peer models never receive withheld memory or unrelated main histories.
- D-09: Node/Socket.IO transports human and peer exchanges; SQLite persists them.
- D-10: Stack is npm workspaces, Next.js/TypeScript/Tailwind, Node, and SQLite.
- D-11: OpenAI powers real agent collaboration; deterministic tests mock the model.
- D-12: Pair and group protocols must work; a polished group demo is secondary
  to the base housing demo, not permission to omit group implementation.
- D-13: Four owners edit disjoint layer paths; Jack coordinates integration.
- D-14: Jack is D1, Bayzhan D2, Jad D3, Akash D4; handles are in TEAM.md.
- D-15: Authorized project commits use Jack's requested identity; no credential sharing.
- D-16: Commit/push meaningful work every 2-3 minutes while actively editing.
- D-17: Poll GitHub Issues/comments/Projects every five minutes.
- D-18: Each role opens a draft PR and initiates a distinct-model review.
- D-19: Merge only reviewed candidate SHAs with truthful test evidence.
- D-20: .planning remains committed, never ignored.
- D-21: Discuss/Plan is one stage; Execute/review/ship is the second.
- D-22: Requirements need explicit behavior, edge cases, ownership, and tests.
- D-23: Publish updated specs automatically and notify every owner on GitHub.

## Implementation Decisions Settled During Planning

- Persist canonical task scope before any cross-agent memory request.
- Treat peer text and model tool arguments as untrusted input.
- Keep room subscriptions and requester identity under server authority.
- Use atomic facts so a price match cannot release an address in the same sentence.
- A group release must be authorized for all other participant observers.
- A group is not permission to share one trusted peer's facts with strangers.
- Cap peer turns, tool iterations, model duration, task calls, and fan-out.
- Persist closed outcomes and summaries so refresh is not a fabricated replay.
- Browser notices contain counts and exact routing, not denied fact details.
- Owner proposal is not a real-world booking, purchase, message, or introduction.
- Seed additively; use fresh disposable databases for repeatable demo resets.
- Separate the active implementation checkout from spec-authoring worktrees.
- Requirements details and the current contract are execution acceptance;
  older task examples do not authorize contradictory behavior.

## Deferred Ideas

- Muse/ChatGPT account connectors, calendars, email, and full digital-twin sync.
- Sending real introductions, scheduling inspections, booking rooms, purchasing.
- Full production auth, E2E encryption, password reset, and reputation systems.
- Embedding-based scope matching; current release uses explicit allowed tags.
- Trust invitation UI; the demo trust relationships are seeded.

## Goal-Backward Observable Truths

1. Alice logs in and can only read her own tasks and main-thread history.
2. Alice creates a task, then sends the detailed housing request in its chat.
3. The owner agent clarifies only missing requirements and finds relevant peers.
4. Bob returns scoped room facts but his private contact details remain absent.
5. The human can watch peer exchanges and see correct disclosure counts.
6. Erin is discovered through public data without gaining trusted access.
7. A task ends done with a proposal or stuck with a concrete reason.
8. Independent peer requests progress without mixing private histories.
9. Group conversations obey the same observer authorization rules.
10. All code and review evidence is attributable to actual commits and models.

## Requirement Ownership

- PLAT/AUTH: D1 foundation plans.
- A2A: D2 runtime plans.
- MEM/PERM/SEED: D3 memory plans; D2 enforces caller context.
- UI: D4 frontend plans.
- OPS: common execution rules included in each owner's plans.
- Integrated base demo: phase 05, Jack coordinating all four layers.
