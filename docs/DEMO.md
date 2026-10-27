# Asymmetry: shareable demo

`/demo` is a minimal, full-screen slideshow (about 80 seconds, autoplays like a
launch film) showing what Asymmetry does and where it is going. It runs entirely
in the browser: no backend, no database, no OpenAI key.

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

- It autoplays from the start. `/demo?step=7` opens a slide (1–14), paused.
- ← / → move between slides, space pauses, click advances. `links` (top right) opens links and credits.

## Recording and screenshots

- Recording (1:14, mp4): [`demo-assets/asymmetry-demo.mp4`](demo-assets/asymmetry-demo.mp4)
- Screenshots of slides 1–14 and the links overlay: [`demo-assets/`](demo-assets/)

![Slide 7: two hops away, a match](demo-assets/step-7.png)

## What it shows

The housing story is the seeded one in `apps/server/src/seed.ts` (Alice wants a
summer sublet near Georgia Tech, May–Aug, under $1200/mo; Bob has a furnished room
0.4mi from campus, $950/mo, May 15–Aug 10), retold with **Jack** as the requester:

1. **Asymmetry.** Let the agents talk.
2. **Jack needs a room for the summer.** Near Georgia Tech, May–Aug, under $1200/mo.
3. **He asks his agent.**
4. **His agent asks theirs:** 6 trusted friends, each in its own subchat.
5. **Only what's needed leaves:** `location_area`, `price`, `dates`. Jack's 2 private facts are withheld (count only).
6. **Then their friends ask theirs:** 12 friends of friends. 4 more agents are discovered but **never asked**.
7. **Two hops away, a match:** Bob (Carol's friend) releases only his 3 in-scope facts; 3 are withheld and shown as a count.
8. **Carol makes the intro**, the trusted connection, with consent.
9. **Jack never knew Bob.**
10–13. **The future:** today your agent works for you; tomorrow it works with theirs. The sublet, the job, the cofounder. Consent at every hop, scoped sharing, private facts never leave your agent.
14. **Asymmetry.** Replay, links, GitHub.

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
