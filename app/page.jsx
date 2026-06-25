"use client";

import { useState } from "react";
import Canvas from "@/components/Canvas";
import RushmorePanel from "@/components/RushmorePanel";
import contextsData from "@/data/contexts.json";

const contexts = contextsData.contexts;

const RAW = "https://raw.githubusercontent.com/noahgeoalta/rushmore/main";
const img = (p) => `${RAW}/${p.split("/").map(encodeURIComponent).join("/")}`;

const IMG = {
  claude:      img("images/AI/Claude.png"),
  chatgpt:     img("images/AI/ChatGPT.png"),
  copilot:     img("images/AI/Copilot.png"),
  rushmorelogo:  img("images/Rushmore/Rushmore Logo.png"),
  geoaltaLogo:   img("images/GeoAlta/GeoAlta Logo.png"),
  geoaltaSP:     img("images/GeoAlta/GeoAlta Icon.png"),
  geocomforterLogo:  img("images/GeoComforter/GeoComforter Logo.png"),
  geocomforterDevSP: img("images/GeoComforter/Development SP Icon.png"),
  geocomforterBizSP: img("images/GeoComforter/Business SP Icon.png"),
  chronoslateLogo: img("images/ChronoSlate/ChronoSlate Logo.png"),
  chronoslateSP:   img("images/ChronoSlate/ChronoSlate Icon.png"),
  nmgcoLogo: img("images/NMGCO/NMGCO logo.png"),
  nmgcoSP:   img("images/NMGCO/NMGCO SP Icon.png"),
  orderIcon:  img("images/Personal/The Order Icon.png"),
  orderIcon2: img("images/Personal/The Order Icon2.png"),
  noahtube:   img("images/Personal/orc.ico"),
  riipen: img("images/Riipen/Riipen.png"),
  rrc:    img("images/Riipen/RRC.png"),
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

function Chip({ label, url, img: imgSrc, symbol, desktop }) {
  const href = resolveUrl(url, desktop);
  const isDesktop = desktop && href?.startsWith("claude://");
  return (
    <a href={href} target={isDesktop ? undefined : "_blank"} rel={isDesktop ? undefined : "noreferrer"} className="cmd-chip" title={isDesktop ? "Opens in Claude desktop app" : undefined}>
      {imgSrc  && <ImgIcon src={imgSrc} size={15} />}
      {symbol  && <span className="cmd-chip-icon">{symbol}</span>}
      {label}
      {isDesktop && <span style={{ fontSize: 9, color: "var(--faint)", marginLeft: 2 }}>↗app</span>}
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

function SectionHeader({ label, open, onToggle }) {
  return (
    <div className="cmd-section-header cmd-section-header--clickable" onClick={onToggle}>
      <span>{label}</span>
      <span className={"cmd-section-chevron" + (open ? " open" : "")}>▸</span>
    </div>
  );
}

// Small sub-header inside a card
function CardSubHeader({ label, open, onToggle }) {
  return (
    <div className="cmd-card-subheader" onClick={onToggle}>
      <span>{label}</span>
      <span className={"cmd-card-chevron" + (open ? " open" : "")}>▸</span>
    </div>
  );
}

// Personal sub-section with its own collapse
function PersonalGroup({ icon, label, open, onToggle, children }) {
  return (
    <div className="cmd-personal-group">
      <div className="cmd-personal-group-header" onClick={onToggle}>
        <ImgIcon src={icon} size={14} />
        <span>{label}</span>
        <span className={"cmd-card-chevron" + (open ? " open" : "")}>▸</span>
      </div>
      {open && <div className="cmd-personal-group-body">{children}</div>}
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

  // Riipen sub-groups (only for geocomforter)
  const riipenTop  = (ctx.launchpad || []).filter(l => l.group === "Riipen");
  const teamKeys   = [...new Set((ctx.launchpad || []).filter(l => l.group?.startsWith("Riipen \u00b7")).map(l => l.group))];
  const hasRiipen  = riipenTop.length > 0 || teamKeys.length > 0;

  return (
    <div className="cmd-card" style={{ "--ctx-accent": ctx.accent, "--ctx-bg": ctx.panelBg, "--ctx-edge": ctx.panelEdge }}>
      {/* Logo row — always visible, click to collapse */}
      <div className="cmd-card-header cmd-card-header--clickable" onClick={() => setOpen(v => !v)}>
        {logo
          ? <img src={logo} alt={ctx.name} className={`cmd-card-logo${ctx.id === "chronoslate" ? " logo-chronoslate" : ""}`} />
          : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>}
        <span className={"cmd-card-chevron cmd-card-chevron--header" + (open ? " open" : "")}>▸</span>
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

          {/* Riipen sub-section inside GeoComforter */}
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
                    return (
                      <div key={key} className="cmd-riipen-row">
                        <ImgIcon src={IMG.rrc} size={13} />
                        <span className="cmd-riipen-team">{key.replace("Riipen \u00b7 ", "")}</span>
                        {items.map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
                      </div>
                    );
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
  const [openWork,     setOpenWork]     = useState(true);
  const [openPersonal, setOpenPersonal] = useState(true);
  const [openRushmore, setOpenRushmore] = useState(true);

  // Personal sub-sections
  const [openOrder,   setOpenOrder]   = useState(true);
  const [openGame,    setOpenGame]    = useState(true);
  const [openMisc,    setOpenMisc]    = useState(true);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const personal    = contexts.find(c => c.id === "personal");
  const workOrdered = WORK_ORDER.map(id => contexts.find(c => c.id === id)).filter(Boolean);

  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  const doctrineAndOrder = personalClaude.find(l => l.label === "Claude: Doctrine and Order");
  const helforge         = personalClaude.find(l => l.label === "Claude: Helforge");
  const theGameDev       = personalClaude.find(l => l.label === "Claude: TheGame Development");
  const gaming           = personalClaude.find(l => l.label === "Claude: Gaming");

  const orderBoard  = personalBoards.find(b => b.label === "The Order Board");
  const gameBoard   = personalBoards.find(b => b.label === "TheGame Board");
  const orderRepo   = personalRepos.find(r => r.label === "The Order Repo");
  const gameRepo    = personalRepos.find(r => r.label === "TheGame Repo");
  const rushmoreRepo = personalRepos.find(r => r.label === "Rushmore Repo");
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
          <section className="cmd-section">
            <SectionHeader label="PERSONAL" open={openPersonal} onToggle={() => setOpenPersonal(v => !v)} />
            {openPersonal && (
              <div className="cmd-personal">

                <PersonalGroup icon={IMG.orderIcon} label="The Order" open={openOrder} onToggle={() => setOpenOrder(v => !v)}>
                  {doctrineAndOrder && <Chip label="Doctrine and Order" url={doctrineAndOrder.url} img={IMG.orderIcon} desktop={doctrineAndOrder.desktop} />}
                  {orderBoard && <a href={orderBoard.url} target="_blank" rel="noreferrer" className="cmd-board-chip board">Board</a>}
                  {orderRepo  && <Chip label="Repo" url={orderRepo.url} img={IMG.orderIcon} />}
                  {helforge   && <Chip label="Helforge" url={helforge.url} img={IMG.orderIcon} desktop={helforge.desktop} />}
                </PersonalGroup>

                <PersonalGroup icon={IMG.orderIcon2} label="TheGame" open={openGame} onToggle={() => setOpenGame(v => !v)}>
                  {theGameDev && <Chip label="TheGame Dev" url={theGameDev.url} img={IMG.orderIcon2} desktop={theGameDev.desktop} />}
                  {gaming     && <Chip label="Gaming" url={gaming.url} img={IMG.orderIcon2} desktop={gaming.desktop} />}
                  {gameBoard  && <a href={gameBoard.url} target="_blank" rel="noreferrer" className="cmd-board-chip board">Board</a>}
                  {gameRepo   && <Chip label="Repo" url={gameRepo.url} img={IMG.orderIcon2} />}
                </PersonalGroup>

                <PersonalGroup icon={IMG.rushmorelogo} label="Misc" open={openMisc} onToggle={() => setOpenMisc(v => !v)}>
                  {noahtube && <Chip label="NoahTube" url={noahtube.url} img={IMG.noahtube} />}
                  {rbc      && <Chip label="RBC" url={rbc.url} />}
                  {rushmoreRepo && <Chip label="Rushmore Repo" url={rushmoreRepo.url} img={IMG.rushmorelogo} />}
                  <Chip label="Rushmore (browser)" url="https://claude.ai/share/38116d04-9be3-40be-a8f8-23f88e44d4a4" img={IMG.claude} />
                  {rushmoreChatDesktop && <Chip label="Rushmore Chat" url={rushmoreChatDesktop.url} img={IMG.claude} desktop={rushmoreChatDesktop.desktop} />}
                  <Chip label="ChatGPT" url="https://chatgpt.com" img={IMG.chatgpt} />
                  <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} />
                </PersonalGroup>

              </div>
            )}
          </section>

          {/* WORK */}
          <section className="cmd-section">
            <SectionHeader label="WORK" open={openWork} onToggle={() => setOpenWork(v => !v)} />
            {openWork && (
              <div className="cmd-cards-row">
                {workOrdered.map(ctx => <ContextCard key={ctx.id} ctx={ctx} />)}
              </div>
            )}
          </section>

          {/* RUSHMORE */}
          <section className="cmd-section">
            <SectionHeader label="RUSHMORE" open={openRushmore} onToggle={() => setOpenRushmore(v => !v)} />
            {openRushmore && <RushmorePanel />}
          </section>

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
