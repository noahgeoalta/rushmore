"use client";

import { useState } from "react";
import Canvas from "@/components/Canvas";
import RushmoreAI from "@/components/RushmoreAI";
import contextsData from "@/data/contexts.json";
import CommandBar from "@/components/CommandBar";

const contexts = contextsData.contexts;
const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;

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
  if (ctxId === "geocomforter") {
    if (label.toLowerCase().includes("business")) return IMG.geocomforterBizSP;
    return IMG.geocomforterDevSP;
  }
  return null;
}

function ImgIcon({ src, size = 15 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }} />;
}

function Chip({ label, url, img: imgSrc, symbol }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="cmd-chip">
      {imgSrc  && <ImgIcon src={imgSrc} size={15} />}
      {symbol  && <span className="cmd-chip-icon">{symbol}</span>}
      {label}
    </a>
  );
}

// Board chip — merged tag+link into one clickable coloured chip
function BoardChip({ label, url, tag }) {
  const cls = tag === "dev" ? "cmd-board-chip dev"
            : tag === "biz" ? "cmd-board-chip biz"
            : "cmd-board-chip board";
  const text = tag === "dev" ? `Dev Board`
             : tag === "biz" ? `Biz Board`
             : label; // e.g. "GeoAlta Board"
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cls}>
      {text}
    </a>
  );
}

function ContextCard({ ctx }) {
  const ghBoards = ctx.github?.boards || [];
  const ghRepos  = ctx.github?.repos  || [];
  const sp       = ctx.sharepoint     || [];
  const claude   = (ctx.launchpad || []).filter(l => l.group === "Claude");
  const logo     = CTX_LOGO[ctx.id];
  return (
    <div className="cmd-card" style={{ "--ctx-accent": ctx.accent, "--ctx-bg": ctx.panelBg, "--ctx-edge": ctx.panelEdge }}>
      <div className="cmd-card-header">
        {logo
          ? <img src={logo} alt={ctx.name} className={`cmd-card-logo${ctx.id === "chronoslate" ? " logo-chronoslate" : ""}`} />
          : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>}
      </div>
      {claude.map(l => <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} img={IMG.claude} />)}
      {ghRepos.map(r => <Chip key={r.url} label={r.label} url={r.url} symbol="⊞" />)}
      {/* Merged board chips */}
      <div className="cmd-board-row">
        {ghBoards.map(b => <BoardChip key={b.url} label={b.label} url={b.url} tag={b.tag} />)}
      </div>
      {sp.map(s => <Chip key={s.url} label={s.label} url={s.url} img={spIcon(ctx.id, s.label)} />)}
    </div>
  );
}

function RiipenSection({ ctx }) {
  const groups = {};
  for (const l of ctx.launchpad || []) {
    if (!groups[l.group]) groups[l.group] = [];
    groups[l.group].push(l);
  }
  const topLevel = groups["Riipen"] || [];
  const riipenOverlord = (groups["Claude"] || []).find(l => l.label.includes("Riipen Overlord"));
  const teamKeys = Object.keys(groups).filter(k => k.startsWith("Riipen · "));
  return (
    <section className="cmd-section">
      <div className="cmd-section-header"><span>RIIPEN</span></div>
      <div className="cmd-riipen">
        {/* Top row: Riipen Home, Project RRC, + Riipen Overlord */}
        <div className="cmd-riipen-top">
          {topLevel.map(l => <Chip key={l.url} label={l.label} url={l.url} img={IMG.riipen} />)}
          {riipenOverlord && <Chip label="Riipen Overlord" url={riipenOverlord.url} img={IMG.claude} />}
        </div>
        {teamKeys.map(key => (
          <div key={key} className="cmd-riipen-row">
            <ImgIcon src={IMG.rrc} size={14} />
            <span className="cmd-riipen-team">{key.replace("Riipen · ", "")}</span>
            {groups[key].map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState("command");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const personal     = contexts.find(c => c.id === "personal");
  const geocomforter = contexts.find(c => c.id === "geocomforter");
  const otherWork    = contexts.filter(c => c.id !== "personal");

  // Personal — split into 3 rows
  const personalWeb    = (personal?.launchpad || []).filter(l => l.group === "Web");
  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  // Row 1: The Order stuff (icon1) — Doctrine and Order, Helforge, The Order Board, The Order Repo
  const ORDER1_LABELS = ["Claude: Doctrine and Order", "Claude: Helforge"];
  const ORDER2_LABELS = ["Claude: TheGame Development", "Claude: Gaming"];
  const ORDER1_BOARD  = personalBoards.find(b => b.label === "The Order Board");
  const ORDER2_BOARD  = personalBoards.find(b => b.label === "TheGame Board");
  const ORDER1_REPO   = personalRepos.find(r => r.label === "The Order Repo");
  const ORDER2_REPO   = personalRepos.find(r => r.label === "TheGame Repo");
  const RUSHMORE_REPO = personalRepos.find(r => r.label === "Rushmore Repo");

  const row1Claude = personalClaude.filter(l => ORDER1_LABELS.includes(l.label));
  const row2Claude = personalClaude.filter(l => ORDER2_LABELS.includes(l.label));

  return (
    <div className="app-shell">
      <header className="app-bar">
        <span className="wordmark">OPERATIONS</span>
        <nav className="app-nav">
          <button className={"app-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>Command</button>
          <button className={"app-nav-btn" + (view === "ai"      ? " active" : "")} onClick={() => setView("ai")}>RUSHMORE</button>
          <button className={"app-nav-btn" + (view === "notes"   ? " active" : "")} onClick={() => setView("notes")}>Notes</button>
        </nav>
        <span className="app-date">{today}</span>
      </header>

      {view !== "ai" && <CommandBar />}

      {view === "command" && (
        <main className="cmd-main">
          {/* PERSONAL */}
          <section className="cmd-section">
            <div className="cmd-section-header"><span>PERSONAL</span></div>
            <div className="cmd-personal">
              {/* Row 1: The Order (icon1) */}
              <div className="cmd-row">
                {row1Claude.map(l => <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} img={IMG.orderIcon} />)}
                {ORDER1_BOARD && <BoardChip label={ORDER1_BOARD.label} url={ORDER1_BOARD.url} tag="board" />}
                {ORDER1_REPO  && <Chip label={ORDER1_REPO.label}  url={ORDER1_REPO.url}  img={IMG.orderIcon} />}
              </div>
              {/* Row 2: TheGame (icon2) */}
              <div className="cmd-row">
                {row2Claude.map(l => <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} img={IMG.orderIcon2} />)}
                {ORDER2_BOARD && <BoardChip label={ORDER2_BOARD.label} url={ORDER2_BOARD.url} tag="board" />}
                {ORDER2_REPO  && <Chip label={ORDER2_REPO.label}  url={ORDER2_REPO.url}  img={IMG.orderIcon2} />}
              </div>
              {/* Row 3: Web + AI tools + Rushmore Repo */}
              <div className="cmd-row">
                {personalWeb.map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
                <Chip label="ChatGPT" url="https://chatgpt.com"            img={IMG.chatgpt} />
                <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} />
                {RUSHMORE_REPO && <Chip label="Rushmore Repo" url={RUSHMORE_REPO.url} img={IMG.rushmorelogo} />}
              </div>
            </div>
          </section>

          {/* WORK — GITHUB */}
          <section className="cmd-section">
            <div className="cmd-section-header"><span>WORK — GITHUB</span></div>
            <div className="cmd-cards-row">
              {otherWork.map(ctx => <ContextCard key={ctx.id} ctx={ctx} />)}
            </div>
          </section>

          {/* RIIPEN */}
          {geocomforter && <RiipenSection ctx={geocomforter} />}
        </main>
      )}

      {view === "ai" && <RushmoreAI />}

      {view === "notes" && (
        <main className="notes-main"><Canvas /></main>
      )}
    </div>
  );
}
