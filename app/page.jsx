"use client";

import { useState, useMemo, useRef } from "react";
import contextsData from "@/data/contexts.json";

const contexts = contextsData.contexts;

const RAW = "https://raw.githubusercontent.com/noahgeoalta/rushmore/main";
const img = (p) => `${RAW}/${p.split("/").map(encodeURIComponent).join("/")}`;

const IMG = {
  claude:            img("images/AI/Claude.png"),
  chatgpt:           img("images/AI/ChatGPT.png"),
  copilot:           img("images/AI/Copilot.png"),
  rushmorelogo:      img("images/Rushmore/Rushmore Logo.png"),
  geoaltaLogo:       img("images/GeoAlta/GeoAlta Logo.png"),
  geoaltaSP:         img("images/GeoAlta/GeoAlta Icon.png"),
  geocomforterLogo:  img("images/GeoComforter/GeoComforter Logo.png"),
  geocomforterDevSP: img("images/GeoComforter/Development SP Icon.png"),
  geocomforterBizSP: img("images/GeoComforter/Business SP Icon.png"),
  chronoslateLogo:   img("images/ChronoSlate/ChronoSlate Logo.png"),
  chronoslateSP:     img("images/ChronoSlate/ChronoSlate Icon.png"),
  nmgcoLogo:         img("images/NMGCO/NMGCO logo.png"),
  nmgcoSP:           img("images/NMGCO/NMGCO SP Icon.png"),
  orderIcon:         img("images/Personal/The Order Icon.png"),
  orderIcon2:        img("images/Personal/The Order Icon2.png"),
  noahtube:          img("images/Personal/orc.ico"),
  riipen:            img("images/Riipen/Riipen.png"),
  rrc:               img("images/Riipen/RRC.png"),
};

const CTX_LOGO = {
  geoalta:      IMG.geoaltaLogo,
  geocomforter: IMG.geocomforterLogo,
  nmgco:        IMG.nmgcoLogo,
  chronoslate:  IMG.chronoslateLogo,
};

function spIcon(ctxId, label) {
  if (ctxId === "geoalta")      return IMG.geoaltaSP;
  if (ctxId === "nmgco")        return IMG.nmgcoSP;
  if (ctxId === "chronoslate")  return IMG.chronoslateSP;
  if (ctxId === "geocomforter") return label.toLowerCase().includes("business") ? IMG.geocomforterBizSP : IMG.geocomforterDevSP;
  return null;
}

function spLabel(ctxId, label) {
  if (ctxId === "geocomforter") {
    return label.toLowerCase().includes("business") ? "Business SP" : "Dev SP";
  }
  return "SP";
}

function resolveUrl(url, desktop) {
  if (desktop && url?.startsWith("https://claude.ai/")) return url.replace("https://", "claude://");
  return url;
}

function ImgIcon({ src, size = 15 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }} />;
}

function matches(text, q) {
  return !q || text.toLowerCase().includes(q.toLowerCase());
}

function Chip({ label, url, img: imgSrc, desktop, claudeWeb, highlight }) {
  const href = resolveUrl(url, desktop);
  const isDesktop = desktop && href?.startsWith("claude://");
  const cls = ["cmd-chip", claudeWeb ? "cmd-chip--claude-web" : "", highlight ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ");
  return (
    <a href={href} target={isDesktop ? undefined : "_blank"} rel={isDesktop ? undefined : "noreferrer"} className={cls} title={isDesktop ? "Opens in Claude desktop app" : undefined}>
      {imgSrc && <ImgIcon src={imgSrc} size={15} />}
      {label}
      {isDesktop && <span style={{ fontSize: "0.55rem", color: "var(--faint)", marginLeft: 2 }}>↗app</span>}
    </a>
  );
}

function LocalChip({ label, highlight }) {
  return (
    <span className={["cmd-chip cmd-chip--local", highlight ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ")} title="Only works when running locally">
      {label}
      <span style={{ fontSize: "0.55rem", color: "var(--faint)", marginLeft: 2 }}>local</span>
    </span>
  );
}

function RepoChip({ url, label, highlight }) {
  const cls = ["cmd-repo-chip", highlight ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ");
  return <a href={url} target="_blank" rel="noreferrer" className={cls}><span className="cmd-repo-icon">⊞</span>{label || "Repo"}</a>;
}

function BoardChip({ url, tag, highlight }) {
  const cls = [tag === "dev" ? "cmd-board-chip dev" : tag === "biz" ? "cmd-board-chip biz" : "cmd-board-chip board", highlight ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ");
  const text = tag === "dev" ? "Dev Board" : tag === "biz" ? "Biz Board" : "Board";
  return <a href={url} target="_blank" rel="noreferrer" className={cls}>{text}</a>;
}

function OrgChip({ label, url, highlight }) {
  const cls = ["cmd-repo-chip", highlight ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ");
  return <a href={url} target="_blank" rel="noreferrer" className={cls}><span className="cmd-repo-icon">⊙</span>{label}</a>;
}

// Sub-section inside a card — collapsible group
function CardGroup({ label, defaultOpen = false, children, hasMatch }) {
  const [open, setOpen] = useState(defaultOpen);
  // Auto-open when search matches something inside
  const isOpen = hasMatch ? true : open;
  return (
    <div className="cmd-group">
      <div className="cmd-group-header" onClick={() => setOpen(v => !v)}>
        <span className="cmd-group-label">{label}</span>
        <span className={"cmd-card-chevron" + (isOpen ? " open" : "")}>▸</span>
      </div>
      {isOpen && <div className="cmd-group-body">{children}</div>}
    </div>
  );
}

function RiipenTeam({ teamKey, items, q }) {
  const [open, setOpen] = useState(false);
  const name = teamKey.replace("Riipen · ", "").replace("Riipen \u00b7 ", "");
  const hasMatch = q && items.some(l => matches(l.label, q));
  const isOpen = hasMatch || open;
  return (
    <div className="cmd-riipen-team-block">
      <div className="cmd-riipen-team-header" onClick={() => setOpen(v => !v)}>
        <ImgIcon src={IMG.rrc} size={13} />
        <span className="cmd-riipen-team">{name}</span>
        <span className={"cmd-card-chevron" + (isOpen ? " open" : "")}>▸</span>
      </div>
      {isOpen && (
        <div className="cmd-riipen-chips">
          {items.map(l => <Chip key={l.url} label={l.label} url={l.url} highlight={matches(l.label, q) && !!q} />)}
        </div>
      )}
    </div>
  );
}

const WORK_ORDER = ["geoalta", "geocomforter", "chronoslate", "nmgco"];

function shortenClaude(label) {
  let s = label.replace("Claude: ", "");
  s = s.replace(/^(GeoAlta|GeoComforter|ChronoSlate|NMGCO)\s+/, "");
  return s;
}

// Collect all searchable terms from a work context
function ctxTerms(ctx) {
  const terms = [ctx.name];
  (ctx.launchpad || []).forEach(l => terms.push(l.label));
  (ctx.github?.boards || []).forEach(b => terms.push(b.label || "Board"));
  (ctx.github?.repos  || []).forEach(r => terms.push(r.label || "Repo"));
  (ctx.sharepoint || []).forEach(s => terms.push(s.label));
  return terms;
}

function ContextCard({ ctx, q }) {
  const [open, setOpen] = useState(false);

  const sp         = ctx.sharepoint || [];
  const ghBoards   = ctx.github?.boards || [];
  const ghRepos    = ctx.github?.repos  || [];
  const logo       = CTX_LOGO[ctx.id];
  const webLinks   = (ctx.launchpad || []).filter(l => l.group === "Web");
  const infraLinks = (ctx.launchpad || []).filter(l => l.group === "Infra");
  const allClaude  = (ctx.launchpad || []).filter(l => l.group === "Claude" && !l.label.includes("Riipen Overlord"));
  const overlord   = (ctx.launchpad || []).find(l => l.label.includes("Riipen Overlord"));
  const riipenTop  = (ctx.launchpad || []).filter(l => l.group === "Riipen");
  const teamKeys   = [...new Set((ctx.launchpad || []).filter(l => l.group?.startsWith("Riipen \u00b7")).map(l => l.group))];
  const hasRiipen  = riipenTop.length > 0 || teamKeys.length > 0;

  // Does anything in this card match the query?
  const cardMatches = q && ctxTerms(ctx).some(t => matches(t, q));
  const isOpen = cardMatches ? true : open;

  // Per-group match checks
  const claudeMatch = q && allClaude.some(l => matches(shortenClaude(l.label), q));
  const ghMatch     = q && [...ghBoards.map(b => b.label || "Board"), ...ghRepos.map(r => r.label || "Repo"), ctx.id === "geoalta" ? "GeoAlta" : ""].some(t => matches(t, q));
  const spMatch     = q && sp.some(s => matches(spLabel(ctx.id, s.label), q));
  const webMatch    = q && webLinks.some(l => matches(l.label, q));
  const infraMatch  = q && infraLinks.some(l => matches(l.label, q));

  if (q && !cardMatches) return null;

  return (
    <div className="cmd-card cmd-card--full" style={{ "--ctx-accent": ctx.accent, "--ctx-bg": ctx.panelBg, "--ctx-edge": ctx.panelEdge }}>
      <div className="cmd-card-header cmd-card-header--clickable" onClick={() => setOpen(v => !v)}>
        {logo
          ? <img src={logo} alt={ctx.name} className={`cmd-card-logo${ctx.id === "chronoslate" ? " logo-chronoslate" : ""}`} />
          : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>}
        <span className={"cmd-card-chevron cmd-card-chevron--right" + (isOpen ? " open" : "")}>▸</span>
      </div>

      {isOpen && (
        <div className="cmd-card-body">
          {allClaude.length > 0 && (
            <CardGroup label="Claude" defaultOpen={true} hasMatch={claudeMatch}>
              <div className="cmd-chip-wrap">
                {allClaude.map(l => (
                  <Chip key={l.url} label={shortenClaude(l.label)} url={l.url} img={IMG.claude} desktop={l.desktop} claudeWeb={!l.desktop} highlight={matches(shortenClaude(l.label), q) && !!q} />
                ))}
              </div>
            </CardGroup>
          )}

          {(ghBoards.length > 0 || ghRepos.length > 0) && (
            <CardGroup label="GitHub" defaultOpen={true} hasMatch={ghMatch}>
              <div className="cmd-chip-wrap">
                {ghBoards.map(b => <BoardChip key={b.url} url={b.url} tag={b.tag} highlight={matches(b.label || "Board", q) && !!q} />)}
                {ghRepos.map(r => <RepoChip key={r.url} url={r.url} label={r.label} highlight={matches(r.label || "Repo", q) && !!q} />)}
                {ctx.id === "geoalta" && <OrgChip label="GeoAlta" url="https://github.com/GeoAltaSolutions" highlight={matches("GeoAlta", q) && !!q} />}
              </div>
            </CardGroup>
          )}

          {sp.length > 0 && (
            <CardGroup label="SharePoint" defaultOpen={true} hasMatch={spMatch}>
              <div className="cmd-chip-wrap">
                {sp.map(s => <Chip key={s.url} label={spLabel(ctx.id, s.label)} url={s.url} img={spIcon(ctx.id, s.label)} highlight={matches(spLabel(ctx.id, s.label), q) && !!q} />)}
              </div>
            </CardGroup>
          )}

          {infraLinks.length > 0 && (
            <CardGroup label="Infra" defaultOpen={true} hasMatch={infraMatch}>
              <div className="cmd-chip-wrap">
                {infraLinks.map(l => <Chip key={l.url} label={l.label} url={l.url} highlight={matches(l.label, q) && !!q} />)}
              </div>
            </CardGroup>
          )}

          {webLinks.length > 0 && (
            <CardGroup label="Web" defaultOpen={true} hasMatch={webMatch}>
              <div className="cmd-chip-wrap">
                {webLinks.map(l => <Chip key={l.url} label={l.label} url={l.url} highlight={matches(l.label, q) && !!q} />)}
              </div>
            </CardGroup>
          )}

          {hasRiipen && (
            <CardGroup label="Riipen" defaultOpen={false} hasMatch={q && (riipenTop.some(l => matches(l.label, q)) || teamKeys.some(k => (ctx.launchpad || []).filter(l => l.group === k).some(l => matches(l.label, q))))}>
              <div className="cmd-chip-wrap" style={{ marginBottom: "0.4rem" }}>
                {riipenTop.map(l => <Chip key={l.url} label={l.label} url={l.url} img={IMG.riipen} highlight={matches(l.label, q) && !!q} />)}
                {overlord && <Chip label="Overlord" url={overlord.url} img={IMG.claude} desktop={overlord.desktop} claudeWeb={!overlord.desktop} highlight={matches("Overlord", q) && !!q} />}
              </div>
              {teamKeys.map(key => {
                const items = (ctx.launchpad || []).filter(l => l.group === key);
                return <RiipenTeam key={key} teamKey={key} items={items} q={q} />;
              })}
            </CardGroup>
          )}
        </div>
      )}
    </div>
  );
}

// Personal card — same collapsible-group pattern but hardcoded
function PersonalCard({ id, title, titleEl, cardStyle, defaultOpen = false, q, terms, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasMatch = q && terms.some(t => matches(t, q));
  const isOpen = hasMatch ? true : open;
  if (q && !hasMatch) return null;
  return (
    <div className="cmd-card cmd-card--full" style={cardStyle}>
      <div className="cmd-card-header cmd-card-header--clickable" onClick={() => setOpen(v => !v)}>
        {titleEl || <span className="cmd-card-name">{title}</span>}
        <span className={"cmd-card-chevron cmd-card-chevron--right" + (isOpen ? " open" : "")}>▸</span>
      </div>
      {isOpen && <div className="cmd-card-body">{children}</div>}
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const searchRef = useRef(null);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const personal    = contexts.find(c => c.id === "personal");
  const workOrdered = WORK_ORDER.map(id => contexts.find(c => c.id === id)).filter(Boolean);

  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  const doctrineAndOrder  = personalClaude.find(l => l.label === "Claude: Doctrine and Order");
  const helforge           = personalClaude.find(l => l.label === "Claude: Helforge");
  const theGameDev         = personalClaude.find(l => l.label === "Claude: TheGame Development");
  const gaming             = personalClaude.find(l => l.label === "Claude: Gaming");
  const gameBoard          = personalBoards.find(b => b.label === "TheGame Board");
  const gameRepo           = personalRepos.find(r => r.label === "TheGame Repo");
  const rushmoreRepo       = personalRepos.find(r => r.label === "Rushmore Repo");
  const rushmoreChatDesktop = personalRepos.find(r => r.label === "Rushmore Chat");
  const noahtube           = (personal?.launchpad || []).find(l => l.label === "NoahTube");
  const rbc                = (personal?.launchpad || []).find(l => l.label === "RBC");

  // Keyboard shortcut: / to focus search
  const handleKeyDown = (e) => {
    if (e.key === "/" && document.activeElement !== searchRef.current) {
      e.preventDefault();
      searchRef.current?.focus();
    }
    if (e.key === "Escape") {
      setQ("");
      searchRef.current?.blur();
    }
  };

  return (
    <div className="app-shell" onKeyDown={handleKeyDown} tabIndex={-1}>
      <header className="app-bar">
        <span className="wordmark">OPERATIONS</span>
        <span className="app-date">{today}</span>
      </header>

      {/* Search bar */}
      <div className="cmd-search-bar">
        <div className="cmd-search-wrap">
          <span className="cmd-search-icon">⌕</span>
          <input
            ref={searchRef}
            className="cmd-search-input"
            type="text"
            placeholder="Search buttons… (press / to focus)"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === "Escape" && (setQ(""), e.target.blur())}
          />
          {q && <button className="cmd-search-clear" onClick={() => setQ("")}>×</button>}
        </div>
      </div>

      <main className="cmd-main">

        {/* Work cards — one per row */}
        {workOrdered.map(ctx => (
          <ContextCard key={ctx.id} ctx={ctx} q={q} />
        ))}

        {/* Dark Citadel */}
        <PersonalCard
          id="darkcitadel"
          cardStyle={{ "--ctx-bg": "#070709", "--ctx-edge": "#1c1c24" }}
          titleEl={<span className="dark-citadel-label">Dark Citadel</span>}
          q={q}
          terms={["Dark Citadel", "QuestLog", "App Creator", "TheDarkCitadel", "Board", "Repo", "local"]}
        >
          <CardGroup label="Claude" defaultOpen={true} hasMatch={q && ["QuestLog", "App Creator"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <Chip label="QuestLog" url="https://claude.ai/project/019f9f52-27d7-744e-b9f4-e01c3e791f52" img={IMG.claude} claudeWeb={true} highlight={matches("QuestLog", q) && !!q} />
              <Chip label="QuestLog" url="https://claude.ai/project/019f9fc7-f382-70ca-84da-8bad025a9eac" img={IMG.claude} desktop={true} highlight={matches("QuestLog", q) && !!q} />
              <Chip label="App Creator" url="https://claude.ai/project/019f9fe9-fae6-7447-855b-7703be93bbf8" img={IMG.claude} claudeWeb={true} highlight={matches("App Creator", q) && !!q} />
              <Chip label="App Creator" url="https://claude.ai/project/019f9fea-522f-755b-90de-e9cca36562ff" img={IMG.claude} desktop={true} highlight={matches("App Creator", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="GitHub" defaultOpen={true} hasMatch={q && ["QuestLog Repo", "TheDarkCitadel", "Board", "QuestLog App"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <BoardChip url="https://github.com/orgs/TheDarkCitadel/projects/10" tag="board" highlight={matches("Board", q) && !!q} />
              <RepoChip url="https://github.com/TheDarkCitadel/TheDarkCitadel-QuestLog" label="QuestLog Repo" highlight={matches("QuestLog Repo", q) && !!q} />
              <RepoChip url="https://github.com/TheDarkCitadel/QuestLog-App" label="QuestLog App" highlight={matches("QuestLog App", q) && !!q} />
              <OrgChip label="TheDarkCitadel" url="https://github.com/TheDarkCitadel" highlight={matches("TheDarkCitadel", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="Apps" defaultOpen={true} hasMatch={q && matches("QuestLog App", q)}>
            <div className="cmd-chip-wrap">
              <LocalChip label="QuestLog App" highlight={matches("QuestLog App", q) && !!q} />
            </div>
          </CardGroup>
        </PersonalCard>

        {/* Doctrine and Order */}
        <PersonalCard
          id="order"
          cardStyle={{ "--ctx-bg": "#0e0800", "--ctx-edge": "#2e1a00" }}
          titleEl={<><ImgIcon src={IMG.orderIcon} size={20} /><span className="doctrine-label" style={{ marginLeft: "0.5rem" }}>Doctrine and Order</span></>}
          q={q}
          terms={["Doctrine and Order", "Helforge", "Doctrine", "Order", "Repo"]}
        >
          <CardGroup label="Claude" defaultOpen={true} hasMatch={q && ["Doctrine and Order", "Helforge"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              {doctrineAndOrder && <Chip label="Doctrine and Order" url={doctrineAndOrder.url} img={IMG.claude} desktop={doctrineAndOrder.desktop} claudeWeb={!doctrineAndOrder.desktop} highlight={matches("Doctrine and Order", q) && !!q} />}
              <Chip label="Doctrine and Order" url="https://claude.ai/project/019f062c-8126-7251-8b32-beb5f8b56d62" img={IMG.claude} desktop={true} highlight={matches("Doctrine and Order", q) && !!q} />
              {helforge && <Chip label="Helforge" url={helforge.url} img={IMG.claude} desktop={helforge.desktop} claudeWeb={!helforge.desktop} highlight={matches("Helforge", q) && !!q} />}
            </div>
          </CardGroup>
          <CardGroup label="GitHub" defaultOpen={true} hasMatch={q && ["Doctrine", "Order", "Repo"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <a href="https://github.com/orgs/TheDarkCitadel/projects/8/views/1" target="_blank" rel="noreferrer" className={["cmd-board-chip biz", matches("Doctrine", q) && q ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ")}>Doctrine</a>
              <a href="https://github.com/orgs/TheDarkCitadel/projects/9/views/1" target="_blank" rel="noreferrer" className={["cmd-board-chip", matches("Order", q) && q ? "cmd-chip--highlight" : ""].filter(Boolean).join(" ")} style={{ background: "#1a0000", color: "#e05555", border: "1px solid #4a0000" }}>Order</a>
              <RepoChip url="https://github.com/TheDarkCitadel/Doctrine-and-Order" highlight={matches("Repo", q) && !!q} />
            </div>
          </CardGroup>
        </PersonalCard>

        {/* TheGame */}
        <PersonalCard
          id="thegame"
          cardStyle={{}}
          titleEl={<><ImgIcon src={IMG.orderIcon2} size={20} /><span className="thegame-label" style={{ marginLeft: "0.5rem" }}>TheGame</span></>}
          q={q}
          terms={["TheGame", "Gaming", "Board", "Repo"]}
        >
          <CardGroup label="Claude" defaultOpen={true} hasMatch={q && ["TheGame", "Gaming"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              {theGameDev && <Chip label="TheGame Dev" url={theGameDev.url} img={IMG.claude} desktop={theGameDev.desktop} claudeWeb={!theGameDev.desktop} highlight={matches("TheGame", q) && !!q} />}
              {gaming     && <Chip label="Gaming" url={gaming.url} img={IMG.claude} desktop={gaming.desktop} claudeWeb={!gaming.desktop} highlight={matches("Gaming", q) && !!q} />}
            </div>
          </CardGroup>
          <CardGroup label="GitHub" defaultOpen={true} hasMatch={q && ["Board", "Repo"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              {gameBoard && <BoardChip url={gameBoard.url} tag="board" highlight={matches("Board", q) && !!q} />}
              {gameRepo  && <RepoChip url={gameRepo.url} highlight={matches("Repo", q) && !!q} />}
            </div>
          </CardGroup>
        </PersonalCard>

        {/* Fieldriven */}
        <PersonalCard
          id="fieldriven"
          cardStyle={{ "--ctx-bg": "#060606", "--ctx-edge": "#141414" }}
          titleEl={<span className="fieldriven-label">Fieldriven<span className="fd-dot">.</span></span>}
          q={q}
          terms={["Fieldriven", "QuestLog", "Board", "Repo", "Vercel", "Cloudflare", "Website", "Family Cart", "Firebase", "FamilyCart", "Raccoonnoisseur"]}
        >
          <CardGroup label="Claude" defaultOpen={true} hasMatch={q && matches("QuestLog", q)}>
            <div className="cmd-chip-wrap">
              <Chip label="QuestLog" url="https://claude.ai/project/019fb4a7-59ee-76ac-b804-5498b0edd775" img={IMG.claude} claudeWeb={true} highlight={matches("QuestLog", q) && !!q} />
              <Chip label="QuestLog" url="https://claude.ai/project/019f0125-b8a9-71ac-9aa9-61045830c6d0" img={IMG.claude} desktop={true} highlight={matches("QuestLog", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="GitHub" defaultOpen={true} hasMatch={q && ["Board", "Repo", "Fieldriven"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <BoardChip url="https://github.com/orgs/TheDarkCitadel/projects/5" tag="dev" highlight={matches("Board", q) && !!q} />
              <BoardChip url="https://github.com/orgs/TheDarkCitadel/projects/6" tag="biz" highlight={matches("Board", q) && !!q} />
              <RepoChip url="https://github.com/TheDarkCitadel/Fieldriven" highlight={matches("Fieldriven", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="Infra" defaultOpen={true} hasMatch={q && ["Vercel", "Cloudflare"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <Chip label="Vercel" url="https://vercel.com/rushmore-hq" highlight={matches("Vercel", q) && !!q} />
              <Chip label="Cloudflare" url="https://dash.cloudflare.com/1ce2b7d62f05f5edd96e6f741ea277ea" highlight={matches("Cloudflare", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="Web" defaultOpen={true} hasMatch={q && matches("Website", q)}>
            <div className="cmd-chip-wrap">
              <Chip label="Website" url="https://fieldriven.com" highlight={matches("Website", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="Family Cart" defaultOpen={false} hasMatch={q && ["Family Cart", "Firebase", "FamilyCart"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <Chip label="Family Cart" url="https://familycart-a8c35.web.app" highlight={matches("Family Cart", q) && !!q} />
              <RepoChip url="https://github.com/noahgeoalta/familycart" label="FamilyCart" highlight={matches("FamilyCart", q) && !!q} />
              <Chip label="Firebase" url="https://console.firebase.google.com" highlight={matches("Firebase", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="Raccoonnoisseur" defaultOpen={false} hasMatch={q && matches("Raccoonnoisseur", q)}>
            <div className="cmd-chip-wrap">
              <Chip label="Raccoonnoisseur" url="https://noahgeoalta.github.io/racoonnoisseur/" highlight={matches("Raccoonnoisseur", q) && !!q} />
              <RepoChip url="https://github.com/noahgeoalta/racoonnoisseur" label="Raccoonnoisseur" highlight={matches("Raccoonnoisseur", q) && !!q} />
            </div>
          </CardGroup>
        </PersonalCard>

        {/* Misc / Rushmore */}
        <PersonalCard
          id="misc"
          cardStyle={{ "--ctx-bg": "#0e0005", "--ctx-edge": "#2e000e" }}
          titleEl={<img src={IMG.rushmorelogo} alt="Rushmore" className="cmd-card-logo" />}
          q={q}
          terms={["NoahTube", "RBC", "Rushmore", "Repo", "Vercel", "Cloudflare", "ChatGPT", "Copilot"]}
        >
          <CardGroup label="Personal" defaultOpen={true} hasMatch={q && ["NoahTube", "RBC"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              {noahtube && <Chip label="NoahTube" url={noahtube.url} img={IMG.noahtube} highlight={matches("NoahTube", q) && !!q} />}
              {rbc      && <Chip label="RBC" url={rbc.url} highlight={matches("RBC", q) && !!q} />}
            </div>
          </CardGroup>
          <CardGroup label="Rushmore" defaultOpen={true} hasMatch={q && ["Rushmore", "Repo"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              {rushmoreRepo       && <RepoChip url={rushmoreRepo.url} highlight={matches("Repo", q) && !!q} />}
              <Chip label="Rushmore (browser)" url="https://claude.ai/project/019ebd14-4757-74d7-81a1-245b698da20d" img={IMG.claude} claudeWeb={true} highlight={matches("Rushmore", q) && !!q} />
              {rushmoreChatDesktop && <Chip label="Rushmore Chat" url={rushmoreChatDesktop.url} img={IMG.claude} desktop={rushmoreChatDesktop.desktop} highlight={matches("Rushmore", q) && !!q} />}
            </div>
          </CardGroup>
          <CardGroup label="Infra" defaultOpen={true} hasMatch={q && ["Vercel", "Cloudflare"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <Chip label="Vercel" url="https://vercel.com/rushmore-hq" highlight={matches("Vercel", q) && !!q} />
              <Chip label="Cloudflare" url="https://dash.cloudflare.com/1ce2b7d62f05f5edd96e6f741ea277ea" highlight={matches("Cloudflare", q) && !!q} />
            </div>
          </CardGroup>
          <CardGroup label="AI" defaultOpen={true} hasMatch={q && ["ChatGPT", "Copilot"].some(t => matches(t, q))}>
            <div className="cmd-chip-wrap">
              <Chip label="ChatGPT" url="https://chatgpt.com" img={IMG.chatgpt} highlight={matches("ChatGPT", q) && !!q} />
              <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} highlight={matches("Copilot", q) && !!q} />
            </div>
          </CardGroup>
        </PersonalCard>

      </main>
    </div>
  );
}
