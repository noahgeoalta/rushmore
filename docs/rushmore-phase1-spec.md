# RUSHMORE — Phase 1 Spec: The Cockpit

**Version:** 0.2 (decisions locked — see section 8)
**Owner:** Noah
**Goal:** One screen that replaces the daily ritual of opening email, Teams, SharePoint, GitHub, Riipen, OneDrive, and Claude projects in separate windows. Read-only feeds + one-click deep links. No AI, no voice, no write actions — those are Phases 2–4.

---

## 1. What Phase 1 is (and is not)

**Is:**
- A responsive web app (works on desktop and phone from the same URL)
- Live, read-only feeds: mail, Teams messages, calendar, GitHub boards/issues
- A launchpad of deep links into every workspace, organized by context
- Single-user, private, password-protected

**Is not (yet):**
- Sending email or Teams messages (Phase 2)
- Moving/creating files (Phase 2)
- Claude API chat, research, QuestLog automation (Phase 3)
- Voice control / "Initiate Rushmore" (Phase 4)

Designing tiles now with Phase 2+ in mind is fine; building those features now is scope creep.

---

## 2. Core layout

```
┌──────────────────────────────────────────────────────┐
│  RUSHMORE          [search]        [date/time] [⚙]   │  ← top bar
├──────────┬───────────────────────────────────────────┤
│ CONTEXTS │              TILE GRID                    │
│          │  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ GeoAlta  │  │  Mail   │ │  Teams  │ │ Calendar│     │
│ GeoComf. │  └─────────┘ └─────────┘ └─────────┘     │
│ NMGCO    │  ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ ChronoSl.│  │ Boards  │ │  Files  │ │Launchpad│     │
│ Personal │  └─────────┘ └─────────┘ └─────────┘     │
│ ──────── │                                           │
│ ALL      │                                           │
└──────────┴───────────────────────────────────────────┘
```

- **Left rail = context switcher.** One click flips every tile to that context's sources. This is the heart of the design: the same six tile types, re-pointed per context.
- **ALL view:** aggregated unread counts and today's calendar across every context — the "morning glance" screen and the default on load.
- **Mobile:** rail collapses to a bottom tab bar; tiles stack vertically.

---

## 3. Tile types

| Tile | Shows | Source | Click behavior |
|---|---|---|---|
| Mail | Unread count + 5 most recent (sender, subject, preview) | Microsoft Graph | Opens message in Outlook web (deep link) |
| Teams | Recent chats/channel messages with unread badges | Microsoft Graph | Opens chat in Teams (deep link) |
| Calendar | Today + next 3 days agenda | Microsoft Graph | Opens event |
| Boards | Open issues per GitHub Project board, grouped by status column | GitHub API (GraphQL for Projects v2) | Opens issue/board |
| Files | Recent files in the context's SharePoint site / OneDrive folder | Microsoft Graph | Opens file |
| Launchpad | Static grid of deep links (Claude projects, Riipen, sites, repos) | Config file | Opens in new tab |

Notes:
- **Claude projects have no public listing API** — Launchpad links are bookmarked URLs to each project (claude.ai/project/...). Grab each URL once and store in config. Still one click instead of open-app-and-scroll.
- **Two Claude accounts:** keep using work account in the desktop app, personal in browser. Launchpad links open in the browser — use two browser profiles (work/personal) so each set of links opens already signed in. Phase 3 makes this problem vanish entirely (API doesn't care about logins).
- **Riipen and RBC have no public APIs.** Launchpad deep links only. Do not automate banking — RBC stays a link forever.

---

## 4. Contexts and their sources

### GeoAlta
- Mail: noah@geoalta.com inbox
- Teams: GeoAlta team chats
- Files: GeoAlta Team Site (SharePoint)
- Boards: GeoAlta Board (+ GeoAlta Repo link)
- Launchpad: Claude → GeoAlta Priv, GeoAlta Website, Meeting Organizer, QuestLog Project Creator

### GeoComforter
- Mail: noah@geoalta.com (filtered/folder if applicable)
- Files: GeoComforter Business Growth Site, Business Development Site
- Boards: GeoComforter Development Board, GeoComforter Business Board (+ repo link)
- Launchpad: Claude → Riipen Overlord, GeoComforter QuestLog; Riipen platform link

### NMGCO
- Mail: none — noah@nmgco.com scrapped (separate tenant, barely used)
- Files: NMGCO Site (SharePoint)
- Boards: NMGCO Board (+ repo link)
- Launchpad: Claude → NMGCO QuestLog

### ChronoSlate
- Files: ChronoSlate folder (inside GeoAlta Team Site)
- Boards: ChronoSlate Development Board, ChronoSlate Business Board (+ repo link)
- Launchpad: Claude → ChronoSlate QuestLog

### Personal
- Mail: noahjgarciak@gmail.com — see open question #1
- Files: Personal OneDrive
- Boards: The Order Repo and Board, TheGame Development Repo and Board (personal GitHub account)
- Launchpad: Claude → TheGame Development, Doctrine and Order, Life, Helforge; NoahTube; RBC

---

## 5. Data sources, auth, and plumbing

This is the unglamorous part that every later phase depends on. Do it once, properly.

### Microsoft Graph (covers Mail, Teams, Calendar, SharePoint, OneDrive)
1. Register an app in **Microsoft Entra admin center** (work tenant)
2. Delegated permissions (read-only for Phase 1):
   - `Mail.Read`, `Calendars.Read`, `Chat.Read`, `ChannelMessage.Read.All`
   - `Sites.Read.All`, `Files.Read.All`, `User.Read`, `offline_access`
3. Auth flow: OAuth 2.0 authorization code + refresh token, handled server-side
4. One tenant, one token: all work mail (GeoAlta + GeoComforter) flows through noah@geoalta.com

### GitHub (two accounts)
- Easiest: one **fine-grained personal access token per account**, read-only scopes (Contents: read, Issues: read, Projects: read)
- Projects v2 boards require the **GraphQL API** — budget a little extra time here, the REST API doesn't cover new Projects
- Store both tokens server-side; tag each context with which token it uses

### Google (Personal context)
- **Decision: deep links to Gmail and NoahTube in Phase 1.** Note: adding Gmail to Outlook does NOT expose it to Graph — Graph only reads mailboxes in the Microsoft tenant. Gmail API (read-only) is a Phase 2 option.

### Secrets handling
- All tokens live server-side (env vars or encrypted store). The browser never sees them.
- The app itself sits behind a login (single user — even basic auth or a passkey is fine).

---

## 6. Recommended stack

- **Next.js** (React) — one codebase, API routes act as the small backend that holds tokens and proxies Graph/GitHub calls, responsive UI for phone, easy deploy
- **Code & hosting:** private GitHub repo (code) + Vercel free tier (running app), connected so every push to main auto-deploys. GitHub alone can't host this — Pages is static-only and the app needs a server side to hold OAuth tokens. Phone access from day one via the Vercel URL, behind your own login.
- **Config-driven contexts:** a single `contexts.json` defines every context, its mailbox, site IDs, board IDs, and launchpad links — adding a future project = editing config, not code. This is what makes RUSHMORE "replicable" for new ventures.
- **Polling, not webhooks**, for Phase 1 (refresh feeds every 60–120s). Webhooks/subscriptions are a Phase 2 upgrade.

---

## 7. Build order (suggested milestones)

1. **M0 — Skeleton:** Next.js app, left rail, empty tile grid, `contexts.json` with all five contexts and every launchpad link. *(Already useful: it's a unified bookmark cockpit.)*
2. **M1 — Microsoft auth:** Entra app registration, OAuth flow, token refresh working
3. **M2 — Mail + Calendar tiles** (Graph)
4. **M3 — Teams tile** (Graph)
5. **M4 — GitHub Boards tile** (GraphQL, both accounts)
6. **M5 — Files tile** (SharePoint sites + OneDrive recents)
7. **M6 — ALL view** (aggregation) + mobile layout pass
8. **M7 — Deploy + lock down** (auth wall, HTTPS, tokens audited)

Each milestone leaves the app in a usable state. M0 alone beats the current tab chaos.

---

## 8. Decisions (questions resolved)

1. **Gmail:** deep link in Phase 1 (Graph can't read it regardless); Gmail API is a Phase 2 candidate
2. **NMGCO mail:** scrapped — context keeps its SharePoint site, board, repo, and QuestLog link only
3. **Entra admin:** Noah has admin rights on the GeoAlta tenant — app registration is unblocked
4. **GeoComforter mail:** flows through noah@geoalta.com; the GeoComforter Mail tile shows that inbox (optionally filtered by folder/category later)
5. **Hosting:** private GitHub repo + Vercel free tier, auto-deploy on push

---

## 9. Phase 2+ hooks to keep in mind while building

- Tile components get an `actions` slot (empty in Phase 1) → reply/send buttons later
- The server already proxies Graph/GitHub → write scopes are a permission change, not an architecture change
- `contexts.json` will later also hold per-context Claude system prompts (QuestLog instructions, project context) for the Phase 3 brain
