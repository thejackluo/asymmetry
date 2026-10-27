# Asymmetry: shareable demo

A self-contained, 7-step walkthrough of Asymmetry at `/demo`. It runs entirely in
the browser: no backend, no database, no OpenAI key.

## Run it (one command)

From a fresh clone, on Node `^22.12 || ^24 || >=26` and npm `>=10`:

```bash
npm install && npm run demo
```

Then open **http://localhost:3000/demo**.

`npm run demo` builds `@asymmetry/shared` and starts the existing Next.js app in
`apps/web` with `NEXT_PUBLIC_SOCKET_MODE=mock` on port 3000. The rest of the app
(`/login`, `/tasks`, `/network`) also runs in mock mode, replaying the seeded
Alice ↔ Bob negotiation from `lib/mock.ts`.

- `/demo?step=4` opens a specific step (1–7). `/demo?autoplay=1` plays it (about 1:26).
- ← / → keys move between steps.

## What it shows

The housing story is the seeded one in `apps/server/src/seed.ts` (Alice wants a
summer sublet near Georgia Tech, May–Aug, under $1200/mo; Bob has a furnished room
0.4mi from campus, $950/mo, May 15–Aug 10), retold with **Jack** as the requester:

1. **Jack asks his agent** for a summer sublet near Georgia Tech, May–Aug, under $1200/mo.
2. **His agent scopes the request** to `location_area`, `price`, `dates`. Jack's 2 private facts are withheld (count only).
3. **Hop 1:** subchats with 6 trusted friends. No one has a room.
4. **Hop 2:** with consent, friends' agents pass the same scoped request to 12 friends of friends. 4 agents are discovered along the way and are **never asked**.
5. **Match two hops out:** Bob (Carol's friend) releases only his 3 in-scope facts; 3 facts are withheld and shown to Jack only as a count.
6. **Intro through Carol**, the trusted connection, after Carol approves and Bob opts in.
7. **Why this matters:** agents working with other people's agents to find opportunities we would otherwise miss, with consent and scoped sharing.

### The graph (demo-only)

23 nodes: `Jack — start`, 6 trusted hop-1 friends, 12 hop-2 friends of friends,
and 4 discovered agents. Trusted edges are solid blue, discovered edges are dashed
grey, and the match path Jack → Carol → Bob is highlighted. Discovered nodes
appear as the search spreads.

The network lives in `apps/web/lib/demo-network.ts` and is illustrative only. It
is not seed data and is never written to the database. `seed.ts` and
`CONTRACTS.md` are unchanged.

### Privacy invariants

- Private facts never go to a peer. Peers see withheld **counts**, never content.
- Bob's private facts (his exact address and phone) are never displayed, logged
  or stored in the demo. `lib/demo-network.test.ts` reads `seed.ts` at test time
  and fails if any of Bob's private fact text appears in the demo code or docs.

## Verify

```bash
npm run lint -w @asymmetry/web
npm run typecheck -w @asymmetry/web   # run after `npm run demo` or `npm run build -w @asymmetry/web` (generates Next route types)
npm test -w @asymmetry/web
```

## Links

- Asymmetry repo: https://github.com/thejackluo/asymmetry
- Asymmetry demo video: https://www.youtube.com/watch?v=7YhwRBV33PU
- HackerHouse project page (2nd place): https://www.gthackerhouse.com/events/devin-hackathon/projects/481d499f-9e34-4b73-8805-a96aa4eea89d
- Devin session (as listed on HackerHouse): https://app.devin.ai/sessions/3f6ed8da12944a3294f4ed4deb971c95
- LinkedIn shared post: https://www.linkedin.com/feed/update/urn:li:activity:7520388543140143104/
- LinkedIn original post by Bayzhan: https://www.linkedin.com/posts/bayzhan8_yesterday-we-got-2nd-place-at-the-cognition-ugcPost-7520259507004997632-pvH1/
- Jack on LinkedIn: https://www.linkedin.com/in/thejackluo/
- Jad (activity): https://www.linkedin.com/in/jad-matthew-bardawil/recent-activity/all/
- Akash (activity): https://www.linkedin.com/in/akash-si/recent-activity/all/
- HackerHouse Devin Hackathon projects: https://www.gthackerhouse.com/events/devin-hackathon/projects
- Event page (Luma): https://luma.com/7my0pg5g
- HackerHouse @ Georgia Tech: https://gthackerhouse.com/
- HackerHouse on LinkedIn: https://www.linkedin.com/company/gt-hackerhouse/
- HackerHouse on X: https://x.com/gthackerhouse
- HackerHouse Campus: https://hackerhousecampus.com

## Credits

Built at the Devin Hackathon at HackerHouse @ Georgia Tech (2nd place) by
Jack Luo ([@thejackluo](https://github.com/thejackluo)), Bayzhan
([@bayzhan8](https://github.com/bayzhan8)), Jad ([@jmb245](https://github.com/jmb245))
and Akash ([@AkashSingirikonda](https://github.com/AkashSingirikonda)), with four
Devins working in parallel.
