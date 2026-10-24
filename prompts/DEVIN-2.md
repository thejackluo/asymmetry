# DEVIN 2 — Agent Runtime & Messaging (the A2A brain)

You are Devin 2 of 4 on team **Asymmetry** (hackathon, 5h). You build the
thing that makes the demo magical: agents that autonomously open subchats with
other agents, negotiate, and report back.

**Read first:** `GST.md` (esp. "The core loop") and `CONTRACTS.md` — §2
(permission flow), §3 (socket protocol), §6 (your tools + module boundary).

## Operating rules (same for all Devins)
- Branch: `devin-2`. Commit + push every **≤30 min** — WIP commits are fine, the branch is yours alone.
- Open a **draft PR** in your first session; body must include: summary, CONTRACTS.md sections touched, and pasted verification output. Keep it updated.
- A **different model** reviews your PR. Every comment is a work item — fix and push. Push back only via comment if it conflicts with CONTRACTS.md.
- Contract change needed? PR description + dated Changelog line in CONTRACTS.md. Never silent-change an interface.
- Test your own layer — nobody else will. Paste test output in the PR.
- `main` must always boot; merge only after approval + your checks pass.

## Communication (GitHub is the team chat — no other channel exists)
- **GitHub Issues = message board**: bugs, blockers, cross-layer requests, questions. Title format `[Dn] short description` routes to the owning layer (`[D2]` you, `[D1]` platform, `[D3]` memory, `[D4]` web).
- **GitHub Projects = task board**: keep your own cards' status current as you work.
- **Poll every ~5 min while working**: `gh issue list` + your project column. Respond wherever you're tagged.
- **Addressing**: tag the GitHub *username* of the human whose Devin(s) should respond — every Devin they run sees it; the `[Dn]` prefix says who acts.
- **Blocked on another layer?** File an issue, tag the owner, keep working on a stub/mock fallback — never sit idle. (The `MemoryEngine` stub is your built-in fallback for D3.)
- Contract changes start as an issue, get agreed there, then land via PR + Changelog entry.

## You own (nobody else touches this path)
- `apps/server/src/agents/**`

## Build — inside `registerAgents(io, db, memory)`
1. **Inbox:** on `chat:send` from a human, persist the Message (subchatId null,
   senderType 'human'), broadcast to `user:{userId}`, and kick that user's
   agent loop.
2. **Agent loop** (per task): load task + goals + conversation → call OpenAI
   (`OPENAI_MODEL`, function-calling) with tools:
   - `query_memory(ownerUserId, scope)` → calls `memory.queryMemory` (D3's
     engine; until it lands, D1's `stubMemoryEngine` is injected — code only
     against the `MemoryEngine` interface)
   - `open_subchat(agentIds[], taskId)` → creates Subchat row ('pair' if 2
     agents else 'group'), participants join `subchat:{id}`, emit
     `subchat:started`
   - `send_subchat_message(subchatId, body)` → persist + emit `subchat:message`,
     then **trigger the recipient agents' loops** so they reply (this is the
     A2A ping-pong — guard with a max-turn counter, ~12, so it can't loop forever)
   - `report_to_human(taskId, status:'done'|'stuck', summary)` → persist,
     `task:updated`, agent status back to `idle`
3. **Discovery:** when a remote agent must decide how to respond, give it its
   owner's `query_memory` tool — it should naturally call it when asked for
   info. Do NOT stuff memory into prompts; the tool call IS the permissioning.
4. **Status:** keep `agents.status` updated (`clarifying`/`negotiating`/…),
   emit `agent:status` changes so the UI can show "negotiating with Bob's agent".
5. Agent personas: each agent's system prompt = "You are {name}, personal agent
   of {user}. Your goals: {goals}. You may open subchats with other agents to
   fulfill tasks. Ask only for what the task requires. Report to your human
   when done or stuck."

## Testing (vitest is preinstalled by D1 — add `*.test.ts` inside `agents/` only)
- Structure the OpenAI client behind an injectable interface so tests mock it
  (recorded tool-call sequences, no live API).
- Cover: `chat:send` → message persisted + broadcast; `open_subchat` → Subchat
  row + participants joined; the **max-turn guard** actually halts a runaway
  A2A loop; `report_to_human` flips task status.

## Done when
- [ ] `npx vitest run src/agents` green, output pasted in PR
- [ ] Human sends "find me a summer sublet near GT under $1200" → agent asks
      a clarifying question OR opens a subchat within one loop
- [ ] A→B subchat produces ≥3 visible `subchat:message` events and a
      `subchat:closed` with a summary
- [ ] `report_to_human` fires and the task status flips in the DB
- [ ] Group subchat (3 agents) works — even if only triggered via a test call
- [ ] No imports outside `apps/server/src/agents/**` + `@asymmetry/shared`

If D3's engine isn't ready, the stub is fine — your code must not change when
the real engine swaps in.
