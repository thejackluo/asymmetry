# D2 agent runtime

The owner agent scopes a human request, coordinates trusted or discovered peers, and reports proposals in the owner's main thread. Peer agents work in isolated subchats and query only facts authorized by the canonical task fields. Server-controlled relay text, scoped memory access, fixed closure summaries, and per-task budgets constrain cross-agent information flow and model usage.

Run the agent tests:

```sh
npx vitest run src/agents
```

Run the live OpenAI smoke test with an API key:

```sh
OPENAI_API_KEY=... npx vitest run src/agents/live.smoke.test.ts
```

The live smoke test is skipped during normal test runs unless `OPENAI_API_KEY` is set.
