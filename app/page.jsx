"use client";

import { useState } from "react";
import Canvas from "@/components/Canvas";
import RushmorePanel from "@/components/RushmorePanel";
import contextsData from "@/data/contexts.json";

const contexts = contextsData.contexts;

const RAW = "https://raw.githubusercontent.com/noahgeoalta/rushmore/main";
const img = (p) => `${RAW}/${p.split("/").map(encodeURIComponent).join("/")}`;

const IMG = {
  claude:          img("images/AI/Claude.png"),
  chatgpt:         img("images/AI/ChatGPT.png"),
  copilot:         img("images/AI/Copilot.png"),
  rushmorelogo:    img("images/Rushmore/Rushmore Logo.png"),
  geoaltaLogo:     img("images/GeoAlta/GeoAlta Logo.png"),
  geoaltaSP:       img("images/GeoAlta/GeoAlta Icon.png"),
  geocomforterLogo:  img("images/GeoComforter/GeoComforter Logo.png"),
  geocomforterDevSP: img("images/GeoComforter/Development SP Icon.png"),
  geocomforterBizSP: img("images/GeoComforter/Business SP Icon.png"),
  chronoslateLogo: img("images/ChronoSlate/ChronoSlate Logo.png"),
  chronoslateSP:   img("images/ChronoSlate/ChronoSlate Icon.png"),
  nmgcoLogo:       img("images/NMGCO/NMGCO logo.png"),
  nmgcoSP:         img("images/NMGCO/NMGCO SP Icon.png"),
  orderIcon:       img("images/Personal/The Order Icon.png"),
  orderIcon2:      img("images/Personal/The Order Icon2.png"),
  noahtube:        img("images/Personal/orc.ico"),
  riipen:          img("images/Riipen/Riipen.png"),
  rrc:             img("images/Riipen/RRC.png"),
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
    if (label.toLowerCase().includes("business")) return "Business";
    return "Development";
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

function Chip({ label, url, img: imgSrc, desktop }) {
  const href = resolveUrl(url, desktop);
  const isDesktop = desktop && href?.startsWith("claude://");
  return (
    <a href={href} target={isDesktop ? undefined : "_blank"} rel={isDesktop ? undefined : "noreferrer"} className="cmd-chip" title={isDesktop ? "Opens in Claude desktop app" : undefined}>
      {imgSrc && <ImgIcon src={imgSrc} size={15} />}
      {label}
      {isDesktop && <span style={{ fontSize: "0.55rem", color: "var(--faint)", marginLeft: 2 }}>↗app</span>}
    </a>
  );
}

function RepoChip({ url }) {
  return <a href={url} target="_blank" rel="noreferrer" className="cmd-repo-chip"><span className="cmd-repo-icon">⊞</span>Repo</a>;
}

function BoardChip({ url, tag }) {
  const cls  = tag === "dev" ? "cmd-board-chip dev" : tag === "biz" ? "cmd-board-chip biz" : "cmd-board-chip board";
  const text = tag === "dev" ? "Dev Board" : tag === "biz" ? "Biz Board" : "Board";
  return <a href={url} target="_blank" rel="noreferrer" className={cls}>{text}</a>;
}

function CardSubHeader({ label, open, onToggle }) {
  return (
    <div className="cmd-card-subheader" onClick={onToggle}>
      <span>{label}</span>
      <span className={"cmd-card-chevron" + (open ? " open" : "")}>▸</span>
    </div>
  );
}

function RiipenTeam({ teamKey, items }) {
  const [open, setOpen] = useState(false);
  const name = teamKey.replace("Riipen \u00b7 ", "");
  return (
    <div className="cmd-riipen-team-block">
      <div className="cmd-riipen-team-header" onClick={() => setOpen(v => !v)}>
        <ImgIcon src={IMG.rrc} size={13} />
        <span className="cmd-riipen-team">{name}</span>
        <span className={"cmd-card-chevron" + (open ? " open" : "")}>▸</span>
      </div>
      {open && (
        <div className="cmd-riipen-chips">
          {items.map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
        </div>
      )}
    </div>
  );
}

// Personal group — stack layout (Order, TheGame)
function PersonalGroup({ icon, label, open, onToggle, stretch, children }) {
  return (
    <div className={"cmd-card" + (stretch ? " cmd-card--stretch" : "")}>
      <div className="cmd-card-header cmd-card-header--clickable" onClick={onToggle}>
        <ImgIcon src={icon} size={28} />
        <span className="cmd-personal-group-label">{label}</span>
      </div>
      {open && <div className="cmd-chip-group">{children}</div>}
    </div>
  );
}

// Misc group — wrapping row layout
function MiscGroup({ icon, label, open, onToggle, children }) {
  return (
    <div className="cmd-card cmd-card--stretch">
      <div className="cmd-card-header cmd-card-header--clickable" onClick={onToggle}>
        <ImgIcon src={icon} size={28} />
        <span className="cmd-personal-group-label">{label}</span>
      </div>
      {open && <div className="cmd-chip-row">{children}</div>}
    </div>
  );
}

const WORK_ORDER = ["geoalta", "geocomforter", "chronoslate", "nmgco"];

function shortenClaude(label) {
  let s = label.replace("Claude: ", "");
  s = s.replace(/^(GeoAlta|GeoComforter|ChronoSlate|NMGCO)\s+/, "");
  return s;
}

function ContextCard({ ctx }) {
  const [open, setOpen] = useState(true);
  const [riipenOpen, setRiipenOpen] = useState(false);

  const sp       = ctx.sharepoint || [];
  const ghBoards = ctx.github?.boards || [];
  const ghRepos  = ctx.github?.repos  || [];
  const logo     = CTX_LOGO[ctx.id];

  const allClaude   = (ctx.launchpad || []).filter(l => l.group === "Claude" && !l.label.includes("Riipen Overlord"));
  const questLog    = allClaude.filter(l => l.label.includes("QuestLog"));
  const otherClaude = allClaude.filter(l => !l.label.includes("QuestLog"));
  const overlord    = (ctx.launchpad || []).find(l => l.label.includes("Riipen Overlord"));

  const riipenTop = (ctx.launchpad || []).filter(l => l.group === "Riipen");
  const teamKeys  = [...new Set((ctx.launchpad || []).filter(l => l.group?.startsWith("Riipen \u00b7")).map(l => l.group))];
  const hasRiipen = riipenTop.length > 0 || teamKeys.length > 0;

  return (
    <div className="cmd-card" style={{ "--ctx-accent": ctx.accent, "--ctx-bg": ctx.panelBg, "--ctx-edge": ctx.panelEdge }}>
      <div className="cmd-card-header cmd-card-header--clickable" onClick={() => setOpen(v => !v)}>
        {logo
          ? <img src={logo} alt={ctx.name} className={`cmd-card-logo${ctx.id === "chronoslate" ? " logo-chronoslate" : ""}`} style={{ opacity: open ? 1 : 0.5 }} />
          : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>}
      </div>

      {open && (
        <div className="cmd-chip-group">
          {questLog.map(l => <Chip key={l.url} label={shortenClaude(l.label)} url={l.url} img={IMG.claude} desktop={l.desktop} />)}
          {(ghBoards.length > 0 || ghRepos.length > 0) && (
            <div className="cmd-board-row">
              {ghBoards.map(b => <BoardChip key={b.url} url={b.url} tag={b.tag} />)}
              {ghRepos.map(r => <RepoChip key={r.url} url={r.url} />)}
            </div>
          )}
          {otherClaude.map(l => <Chip key={l.url} label={shortenClaude(l.label)} url={l.url} img={IMG.claude} desktop={l.desktop} />)}
          {sp.map(s => <Chip key={s.url} label={spLabel(ctx.id, s.label)} url={s.url} img={spIcon(ctx.id, s.label)} />)}

          {hasRiipen && (
            <div className="cmd-riipen-embed">
              <CardSubHeader label="RIIPEN" open={riipenOpen} onToggle={() => setRiipenOpen(v => !v)} />
              {riipenOpen && (
                <div className="cmd-riipen-embed-body">
                  <div className="cmd-riipen-top">
                    {riipenTop.map(l => <Chip key={l.url} label={l.label} url={l.url} img={IMG.riipen} />)}
                    {overlord && <Chip label="Overlord" url={overlord.url} img={IMG.claude} desktop={overlord.desktop} />}
                  </div>
                  {teamKeys.map(key => {
                    const items = (ctx.launchpad || []).filter(l => l.group === key);
                    return <RiipenTeam key={key} teamKey={key} items={items} />;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState("command");
  const [openOrder, setOpenOrder] = useState(true);
  const [openGame,  setOpenGame]  = useState(true);
  const [openMisc,  setOpenMisc]  = useState(true);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const personal    = contexts.find(c => c.id === "personal");
  const workOrdered = WORK_ORDER.map(id => contexts.find(c => c.id === id)).filter(Boolean);

  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  const doctrineAndOrder = personalClaude.find(l => l.label === "Claude: Doctrine and Order");
  const helforge          = personalClaude.find(l => l.label === "Claude: Helforge");
  const theGameDev        = personalClaude.find(l => l.label === "Claude: TheGame Development");
  const gaming            = personalClaude.find(l => l.label === "Claude: Gaming");

  const orderBoard          = personalBoards.find(b => b.label === "The Order Board");
  const gameBoard           = personalBoards.find(b => b.label === "TheGame Board");
  const orderRepo           = personalRepos.find(r => r.label === "The Order Repo");
  const gameRepo            = personalRepos.find(r => r.label === "TheGame Repo");
  const rushmoreRepo        = personalRepos.find(r => r.label === "Rushmore Repo");
  const rushmoreChatDesktop = personalRepos.find(r => r.label === "Rushmore Chat");

  const noahtube = (personal?.launchpad || []).find(l => l.label === "NoahTube");
  const rbc      = (personal?.launchpad || []).find(l => l.label === "RBC");

  return (
    <div className="app-shell">
      <header className="app-bar">
        <span className="wordmark">OPERATIONS</span>
        <nav className="app-nav">
          <button className={"app-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>Command</button>
          <button className={"app-nav-btn" + (view === "notes"   ? " active" : "")} onClick={() => setView("notes")}>Notes</button>
        </nav>
        <span className="app-date" style={{ marginLeft: "auto" }}>{today}</span>
      </header>

      {view === "command" && (
        <main className="cmd-main">

          {/* PERSONAL */}
          <div className="cmd-cards-row cmd-block">
            <PersonalGroup icon={IMG.orderIcon} label="The Order" open={openOrder} onToggle={() => setOpenOrder(v => !v)}>
              {doctrineAndOrder && <Chip label="Doctrine and Order" url={doctrineAndOrder.url} img={IMG.claude} desktop={doctrineAndOrder.desktop} />}
              {orderBoard && <BoardChip url={orderBoard.url} tag="board" />}
              {orderRepo  && <RepoChip url={orderRepo.url} />}
              {helforge   && <Chip label="Helforge" url={helforge.url} img={IMG.claude} desktop={helforge.desktop} />}
            </PersonalGroup>

            <PersonalGroup icon={IMG.orderIcon2} label="TheGame" open={openGame} onToggle={() => setOpenGame(v => !v)}>
              {theGameDev && <Chip label="TheGame Dev" url={theGameDev.url} img={IMG.claude} desktop={theGameDev.desktop} />}
              {gaming     && <Chip label="Gaming" url={gaming.url} img={IMG.claude} desktop={gaming.desktop} />}
              {gameBoard  && <BoardChip url={gameBoard.url} tag="board" />}
              {gameRepo   && <RepoChip url={gameRepo.url} />}
            </PersonalGroup>

            {/* Misc — wrapping row, fills remaining width */}
            <MiscGroup icon={IMG.rushmorelogo} label="Misc" open={openMisc} onToggle={() => setOpenMisc(v => !v)}>
              {noahtube && <Chip label="NoahTube" url={noahtube.url} img={IMG.noahtube} />}
              {rbc      && <Chip label="RBC" url={rbc.url} />}
              {rushmoreRepo && <RepoChip url={rushmoreRepo.url} />}
              <Chip label="Rushmore (browser)" url="https://claude.ai/share/38116d04-9be3-40be-a8f8-23f88e44d4a4" img={IMG.claude} />
              {rushmoreChatDesktop && <Chip label="Rushmore Chat" url={rushmoreChatDesktop.url} img={IMG.claude} desktop={rushmoreChatDesktop.desktop} />}
              <Chip label="ChatGPT" url="https://chatgpt.com" img={IMG.chatgpt} />
              <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} />
            </MiscGroup>
          </div>

          {/* WORK */}
          <div className="cmd-cards-row cmd-block">
            {workOrdered.map(ctx => <ContextCard key={ctx.id} ctx={ctx} />)}
          </div>

          {/* RUSHMORE — natural width */}
          <div className="cmd-block cmd-rushmore-wrap">
            <RushmorePanel />
          </div>

        </main>
      )}

      {view === "notes" && (
        <main className="notes-main"><Canvas /></main>
      )}

      <nav className="mobile-nav">
        <button className={"mobile-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>
          <span className="mobile-nav-icon">📋</span>Command
        </button>
        <button className={"mobile-nav-btn" + (view === "notes" ? " active" : "")} onClick={() => setView("notes")}>
          <span className="mobile-nav-icon">📝</span>Notes
        </button>
      </nav>
    </div>
  );
}
