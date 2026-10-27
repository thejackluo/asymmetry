# Asymmetry: shareable demo

`/demo` is a continuous, full-screen network animation (about 22 seconds) that
shows what Asymmetry does: Jack's agent asks his trusted friends' agents for an
apartment and a car, the request ripples out, and both are found two hops away
and introduced through a friend.
It runs entirely in the browser: no backend, no database, no OpenAI key.

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

- It autoplays once. Click or press space to pause, click at the end (or press `r`) to replay.
- `/demo?t=6` freezes the animation at 6 seconds (handy for screenshots).
- `links` (top right) opens links and credits.
- With `prefers-reduced-motion`, it shows a single still frame.

## Recording and screenshots

- Recording (0:24, 1280×720 mp4): [`demo-assets/asymmetry-demo.mp4`](demo-assets/asymmetry-demo.mp4)
  ([direct download](https://github.com/thejackluo/asymmetry/raw/demo/linkedin-shareable-demo/docs/demo-assets/asymmetry-demo.mp4))
- Frames and the links overlay: [`demo-assets/`](demo-assets/)

![Two hops away, a match](demo-assets/frame-4-match.png)

## What it shows

The story is illustrative (not the seed data): Jack wants an apartment near
Georgia Tech under $1.5k/mo and a reliable used car under $15k. There are no
slides; a few small cards are the only text besides names.

1. **Ask.** Jack's node glows and a card (top-left, tied to Jack) shows what he
   is looking for. Two grey dots and a lock with a `2` (his private facts) stay put.
2. **Search the network first.** Curved edges draw out to his 6 trusted friends,
   then their 12 friends, across two clusters: Jack's dense home cluster and a
   looser cloud joined by only a few bridges (Carol is one). Each agent that
   checks and isn't a fit flickers grey. 4 more agents are seen along dashed
   grey edges but are **never asked**.
3. **Apartment.** Only after the search, Jack → Carol → Bob turns orange. Bob's
   card shows what he shares (`1BR · 0.4 mi from GT · $1,350/mo`; 3 facts stay
   behind a lock) and a card at Carol spells out `Jack → Carol → Bob`. The facts
   travel back through Carol; Jack's card checks off his criteria, Jack smiles,
   and Carol makes the intro.
4. **Car.** Jack → Akash → Justus turns green. Justus's card has a **shared**
   section (`2019 Civic · 41k mi · $13,900`) and a **private** section of
   redacted lines that stay with Justus's agent.
5. **Everyone.** Coloured searches start from other people's agents across the
   same network, then `asymmetry.` / *let the agents talk*.

### The graph (demo-only)

23 nodes: `Jack — start`, 6 trusted hop-1 friends, 12 hop-2 friends of friends,
and 4 discovered agents. Trusted edges are solid blue, discovered edges are dashed
grey, and the match paths are highlighted (Jack → Carol → Bob in orange, Jack → Akash → Justus in green). Discovered
nodes appear as the search spreads. Names are first names only and illustrative.

The network and timeline live in `apps/web/lib/demo-network.ts` and are drawn on a canvas by
`apps/web/components/DemoCanvas.tsx`. It is illustrative only. It
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
