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

function IconBoardChip({ label, url, icon }) {
  return <a href={url} target="_blank" rel="noreferrer" className="cmd-chip"><ImgIcon src={icon} size={15} />{label}</a>;
}

function SectionHeader({ label, open, onToggle }) {
  return (
    <div className="cmd-section-header cmd-section-header--clickable" onClick={onToggle}>
      <span>{label}</span>
      <span className={"cmd-section-chevron" + (open ? " open" : "")}>▸</span>
    </div>
  );
}

const WORK_ORDER = ["geoalta", "geocomforter", "chronoslate", "nmgco"];

function ContextCard({ ctx }) {
  const sp       = ctx.sharepoint || [];
  const ghBoards = ctx.github?.boards || [];
  const ghRepos  = ctx.github?.repos  || [];
  const logo     = CTX_LOGO[ctx.id];
  const allClaude   = (ctx.launchpad || []).filter(l => l.group === "Claude" && !l.label.includes("Riipen Overlord"));
  const questLog    = allClaude.filter(l => l.label.includes("QuestLog"));
  const otherClaude = allClaude.filter(l => !l.label.includes("QuestLog"));

  function shortenClaude(label) {
    let s = label.replace("Claude: ", "");
    s = s.replace(/^(GeoAlta|GeoComforter|ChronoSlate|NMGCO)\s+/, "");
    return s;
  }

  return (
    <div className="cmd-card">
      <div className="cmd-card-header">
        {logo ? <img src={logo} alt={ctx.name} className={`cmd-card-logo${ctx.id === "chronoslate" ? " logo-chronoslate" : ""}`} /> : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>}
      </div>
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
      </div>
    </div>
  );
}

function RiipenSection({ ctx, open, onToggle }) {
  const groups = {};
  for (const l of ctx.launchpad || []) {
    if (!groups[l.group]) groups[l.group] = [];
    groups[l.group].push(l);
  }
  const topLevel = groups["Riipen"] || [];
  const overlord = (groups["Claude"] || []).find(l => l.label.includes("Riipen Overlord"));
  const teamKeys = Object.keys(groups).filter(k => k.startsWith("Riipen \u00b7 "));
  return (
    <section className="cmd-section">
      <SectionHeader label="RIIPEN" open={open} onToggle={onToggle} />
      {open && (
        <div className="cmd-riipen">
          <div className="cmd-riipen-top">
            {topLevel.map(l => <Chip key={l.url} label={l.label} url={l.url} img={IMG.riipen} />)}
            {overlord && <Chip label="Overlord" url={overlord.url} img={IMG.claude} desktop={overlord.desktop} />}
          </div>
          {teamKeys.map(key => (
            <div key={key} className="cmd-riipen-row">
              <ImgIcon src={IMG.rrc} size={14} />
              <span className="cmd-riipen-team">{key.replace("Riipen \u00b7 ", "")}</span>
              {groups[key].map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState("command");
  const [openWork,     setOpenWork]     = useState(true);
  const [openPersonal, setOpenPersonal] = useState(true);
  const [openRiipen,   setOpenRiipen]   = useState(true);
  const [openRushmore, setOpenRushmore] = useState(true);

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const personal     = contexts.find(c => c.id === "personal");
  const geocomforter = contexts.find(c => c.id === "geocomforter");
  const workOrdered  = WORK_ORDER.map(id => contexts.find(c => c.id === id)).filter(Boolean);

  const personalWeb    = (personal?.launchpad || []).filter(l => l.group === "Web");
  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  const ORDER1_LABELS = ["Claude: Doctrine and Order", "Claude: Helforge"];
  const ORDER2_LABELS = ["Claude: TheGame Development", "Claude: Gaming"];
  const ORDER1_BOARD  = personalBoards.find(b => b.label === "The Order Board");
  const ORDER2_BOARD  = personalBoards.find(b => b.label === "TheGame Board");
  const ORDER1_REPO   = personalRepos.find(r => r.label === "The Order Repo");
  const ORDER2_REPO   = personalRepos.find(r => r.label === "TheGame Repo");
  const RUSHMORE_REPO = personalRepos.find(r => r.label === "Rushmore Repo");
  const RUSHMORE_CHAT = personalRepos.find(r => r.label === "Rushmore Chat");
  const row1Claude = personalClaude.filter(l => ORDER1_LABELS.includes(l.label));
  const row2Claude = personalClaude.filter(l => ORDER2_LABELS.includes(l.label));
  const webIconMap = { "NoahTube": IMG.noahtube };

  function shortenPersonalClaude(label) {
    return label.replace("Claude: ", "");
  }

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

          <section className="cmd-section">
            <SectionHeader label="PERSONAL" open={openPersonal} onToggle={() => setOpenPersonal(v => !v)} />
            {openPersonal && (
              <div className="cmd-personal">
                <div className="cmd-row">
                  {row1Claude.map(l => <Chip key={l.url} label={shortenPersonalClaude(l.label)} url={l.url} img={IMG.orderIcon} desktop={l.desktop} />)}
                  {ORDER1_BOARD && <IconBoardChip label="Board" url={ORDER1_BOARD.url} icon={IMG.orderIcon} />}
                  {ORDER1_REPO  && <Chip label="Repo" url={ORDER1_REPO.url} img={IMG.orderIcon} />}
                </div>
                <div className="cmd-row">
                  {row2Claude.map(l => <Chip key={l.url} label={shortenPersonalClaude(l.label)} url={l.url} img={IMG.orderIcon2} desktop={l.desktop} />)}
                  {ORDER2_BOARD && <IconBoardChip label="Board" url={ORDER2_BOARD.url} icon={IMG.orderIcon2} />}
                  {ORDER2_REPO  && <Chip label="Repo" url={ORDER2_REPO.url} img={IMG.orderIcon2} />}
                  <Chip label="Rushmore Chat" url="https://claude.ai/project/019ebd14-4757-74d7-81a1-245b698da20d" img={IMG.orderIcon2} />
                </div>
                <div className="cmd-row">
                  {personalWeb.map(l => <Chip key={l.url} label={l.label} url={l.url} img={webIconMap[l.label]} />)}
                  <Chip label="ChatGPT" url="https://chatgpt.com" img={IMG.chatgpt} />
                  <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} />
                  {RUSHMORE_REPO && <Chip label="Repo" url={RUSHMORE_REPO.url} img={IMG.rushmorelogo} />}
                  {RUSHMORE_CHAT && <Chip label="Chat" url={RUSHMORE_CHAT.url} img={IMG.claude} desktop={RUSHMORE_CHAT.desktop} />}
                </div>
              </div>
            )}
          </section>

          <section className="cmd-section">
            <SectionHeader label="WORK" open={openWork} onToggle={() => setOpenWork(v => !v)} />
            {openWork && (
              <div className="cmd-cards-row">
                {workOrdered.map(ctx => <ContextCard key={ctx.id} ctx={ctx} />)}
              </div>
            )}
          </section>

          {geocomforter && (
            <RiipenSection ctx={geocomforter} open={openRiipen} onToggle={() => setOpenRiipen(v => !v)} />
          )}

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
