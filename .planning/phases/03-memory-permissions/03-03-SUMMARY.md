# 03-03: fixtures-demo-verification: summary

Owner: Jad / @jmb245 (Devin 3). PR: #6 (draft). Branch: `devin-3`.

- Requirements covered: SEED-01, SEED-02, PERM-03 (OPS-01…06 via PR/runbook workflow).
- Evidence: seed.ts (stable seed-* IDs, INSERT OR IGNORE, refuses non-fixture username collisions); seed.test.ts (idempotent/additive, bcrypt demo, trust graph w/o dave→alice, Bob 6 atomic facts, money shot 3 released / 3 withheld partial, Erin public, Dave denied). Seed CLI twice on disposable DB: created 5/5/18 then 0/0/0.
- Tested SHA: `7022228`. Files were overlaid on `origin/devin-1` @ `03f4685` because foundation is not merged yet. Results: `npx vitest run src/memory` 66/66, server typecheck clean, full server suite 89/90. The one failure is D1's seed-placeholder smoke assertion, which this phase supersedes and which is flagged to D1.
- Mocked deterministic tests only. No live-OpenAI, integrated-runtime or browser evidence is claimed.
- Deviations: none from CONTRACTS §2/§5/§6/§7/§8. The canonical tags were confirmed in #4.
- Review: Devin Review was run (findings triaged in PR #6). Model identities aren't exposed, so the **distinct-model review is blocked** and not claimed.
- Status: implementation complete, pending the foundation merge and a rerun on main. PLAN COMPLETE is not declared until that rerun.
