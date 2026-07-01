# RUSHMORE — Session Reference

**Live:** https://rushmore-phi.vercel.app  
**Repo:** noahgeoalta/rushmore (public)  
**Stack:** Next.js 14, Vercel free tier, Anthropic API

---

## How to update Rushmore

At the start of every session, read this file. Then use the GitHub MCP tool to read whichever files are relevant before making changes. Always get the current SHA before pushing — stale SHAs cause push failures.

The two files you'll touch most:
- `app/page.jsx` — all UI, layout, buttons, sections
- `app/globals.css` — all styles, fonts, colours, spacing

Other files:
- `app/layout.jsx` — favicon, metadata, global CSS imports
- `app/api/chat/route.js` — Claude API with web search + GitHub tool (agentic loop)
- `app/api/github-tool/route.js` — GitHub REST API (issues, file, search)
- `app/api/github-context/route.js` — fetches single file from repo
- `components/RushmorePanel.jsx` — inline RUSHMORE chat panel
- `data/contexts.json` — project/link data for work cards

---

## Architecture

### Images
Served directly from raw GitHub: `https://raw.githubusercontent.com/noahgeoalta/rushmore/main/images/...`  
No proxy. Public repo so no token needed.

### Environment variables (Vercel)
- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN` — fine-grained PAT, GeoAltaSolutions org, Contents + Metadata read-only

---

## Page structure (`app/page.jsx`)

The page is a single command view — no routing, no tabs. It renders top to bottom:

1. **Header** — wordmark + date
2. **Doctrine and Order** — personal section, own row
3. **TheGame** — personal section, own row
4. **Fieldriven** — personal section, own row
5. **Misc** — personal section, own row
6. **Work** — GeoAlta, GeoComforter (with Riipen embed), ChronoSlate, NMGCO
7. **Rushmore** — inline AI chat panel

### Card types
- **Personal cards** — collapsible via header click, each on its own `cmd-cards-row`
- **Work cards** — collapsible via logo click, colored via `--ctx-bg/--ctx-edge/--ctx-accent` CSS vars from `contexts.json`
- **Rushmore panel** — `<RushmorePanel />`, natural width (`width: fit-content`)

### Chip types
- `<Chip>` — standard button with optional icon. Pass `desktop={true}` to make it open via `claude://` in the desktop app (shows ↗app indicator)
- `<RepoChip>` — grey repo-style button, accepts optional `label` prop (default "Repo")
- `<BoardChip>` — coloured board button: `tag="dev"` (blue), `tag="biz"` (orange), `tag="board"` (green)
- `<OrgChip>` — grey org-style button with ⊙ icon

### Board rows
`cmd-board-row` uses `flex-wrap: nowrap` — all buttons stay on one line, card expands to fit.

---

## Styling (`app/globals.css`)

Base font size: `html { font-size: 16px }` — everything uses `rem` so changing this one value scales the whole UI.

### CSS variables
```
--bg, --surface, --edge, --edge2     background layers
--text, --dim, --faint               text hierarchy
--orange, --orange-bg, --orange-edge accent colour
--blue, --blue-bg, --blue-edge       secondary accent
```

### Section title fonts
- **Doctrine and Order** → Cinzel (Roman serif)
- **TheGame** → Orbitron (sci-fi geometric)
- **Fieldriven** → Rajdhani (military-tech), capital F is larger + orange
- **Misc** → Exo 2 (modern, uppercased)

All loaded via Google Fonts in the `@import` at the top of `globals.css`.

### Key classes
```
.cmd-card           base card — auto-width, flex column
.cmd-chip-group     vertical stack of chips inside a card
.cmd-inline-row     horizontal row, no wrap
.cmd-board-row      horizontal row, no wrap (board/repo buttons)
.cmd-block          section spacing (1.5rem bottom margin)
.cmd-block--tight   tighter spacing (0.5rem) between adjacent rows
.cmd-rushmore-wrap  constrains Rushmore to fit-content width
```

---

## Work card data (`data/contexts.json`)

Each work context has:
- `id`, `name`, `accent`, `panelBg`, `panelEdge` — identity + colours
- `launchpad[]` — buttons: `{ label, url, group, desktop }`
  - `group: "Claude"` → rendered as Claude chips
  - `group: "Riipen"` → top-level Riipen links
  - `group: "Riipen · TeamName"` → collapsible team row
- `github.boards[]` — `{ url, tag }` board chips
- `github.repos[]` — repo chips
- `sharepoint[]` — SP chips

---

## Riipen (GeoComforter)
Riipen lives inside the GeoComforter card as a collapsible sub-section. Teams (Team 2–5) are individually collapsible rows. Expanding a team shows Chat, GH Folder, SP Folder buttons.

---

## Rushmore panel
- General agent only — no project modes
- Voice OFF by default
- Video: `44% center` object-position (`app/rp-video-pos.css`)
- Left column: 160px wide, square video, status dot, token usage
- History: rename (✎) and delete (×) per chat, localStorage
- Web search wired in
- GitHub tool wired as native `tool_use` with agentic loop (up to 5 rounds)
