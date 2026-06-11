# RUSHMORE

Personal command center. One screen for mail, Teams, calendar, GitHub boards, files, and every workspace link — instead of fifteen tabs.

**Current state: M0 — the skeleton.** Context rail, tile grid, and live launchpads driven by `data/contexts.json`. Feed tiles are labeled placeholders until their milestone lands.

Full plan: [`docs/rushmore-phase1-spec.md`](docs/rushmore-phase1-spec.md)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000

## First job: fill in your links

Open `data/contexts.json` and replace every `REPLACE_ME` with the real URL:

1. **Claude projects** — open each project at claude.ai, copy the URL from the address bar
2. **SharePoint sites** — open each site, copy the URL
3. **GitHub boards/repos** — copy from github.com

Greyed-out chips in the launchpad = links still waiting for a URL. Tip: open work-account Claude links in one browser profile and personal in another so each opens already signed in.

## Deploy (phone access)

1. Push this repo to GitHub (private)
2. Import it at vercel.com — framework auto-detected, no config needed
3. Every push to `main` auto-deploys

Don't add real secrets until M1; when you do, they go in Vercel env vars and `.env.local`, never in the repo. `.env.example` shows what will eventually be needed.

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Skeleton: rail, grid, launchpads | ✅ this commit |
| M1 | Microsoft Entra app + OAuth | ⬜ |
| M2 | Mail + Calendar tiles | ⬜ |
| M3 | Teams tile | ⬜ |
| M4 | GitHub Boards tiles (GraphQL, both accounts) | ⬜ |
| M5 | Files tiles (SharePoint + OneDrive) | ⬜ |
| M6 | ALL view aggregation + mobile pass | ⬜ |
| M7 | Deploy hardening: auth wall, token audit | ⬜ |
