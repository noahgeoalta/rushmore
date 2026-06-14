"use client";

import { useState } from "react";
import Canvas from "@/components/Canvas";
import contextsData from "@/data/contexts.json";
import CommandBar from "@/components/CommandBar";

const contexts = contextsData.contexts;

const RAW = "https://raw.githubusercontent.com/noahgeoalta/rushmore/main/images";

const IMG = {
  // AI
  claude:      `${RAW}/AI/Claude.png`,
  chatgpt:     `${RAW}/AI/ChatGPT.png`,
  copilot:     `${RAW}/AI/Copilot.png`,
  // Rushmore
  rushmorePanel: `${RAW}/Rushmore/Rushmore%20Panel.png`,
  rushmorelogo:  `${RAW}/Rushmore/Rushmore%20Logo.png`,
  // GeoAlta
  geoaltaLogo:   `${RAW}/GeoAlta/GeoAlta%20Logo.png`,
  geoaltaSP:     `${RAW}/GeoAlta/GeoAlta%20Icon.png`,
  // GeoComforter
  geocomforterLogo: `${RAW}/GeoComforter/GeoComforter%20Logo.png`,
  geocomforterDevSP: `${RAW}/GeoComforter/Development%20SP%20Icon.png`,
  geocomforterBizSP: `${RAW}/GeoComforter/Business%20SP%20Icon.png`,
  // ChronoSlate
  chronoslateLogo: `${RAW}/ChronoSlate/ChronoSlate%20Logo.png`,
  chronoslateSP:   `${RAW}/ChronoSlate/ChronoSlate%20Icon.png`,
  // NMGCO
  nmgcoLogo: `${RAW}/NMGCO/NMGCO%20logo.png`,
  nmgcoSP:   `${RAW}/NMGCO/NMGCO%20SP%20Icon.png`,
  // Personal
  orderIcon:  `${RAW}/Personal/The%20Order%20Icon.png`,
  orderIcon2: `${RAW}/Personal/The%20Order%20Icon2.png`,
  // Riipen
  riipen: `${RAW}/Riipen/Riipen.png`,
  rrc:    `${RAW}/Riipen/RRC.png`,
};

// Which img to use for each personal chip
const PERSONAL_ICON = {
  "The Order Repo":       IMG.orderIcon,
  "The Order Board":      IMG.orderIcon,
  "Claude: Doctrine and Order": IMG.orderIcon,
  "Claude: Helforge":     IMG.orderIcon,
  "TheGame Repo":         IMG.orderIcon2,
  "TheGame Board":        IMG.orderIcon2,
  "Claude: TheGame Development": IMG.orderIcon2,
  "Claude: Gaming":       IMG.orderIcon2,
  "Claude: Life":         IMG.orderIcon2,
};

// Logo to show in each context card header
const CTX_LOGO = {
  geoalta:      IMG.geoaltaLogo,
  geocomforter: IMG.geocomforterLogo,
  nmgco:        IMG.nmgcoLogo,
  chronoslate:  IMG.chronoslateLogo,
};

// SP icon per context + SP label keyword
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

function ImgIcon({ src, size = 14 }) {
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }} />;
}

function Tag({ type }) {
  return <span className={`cmd-tag cmd-tag-${type}`}>{type}</span>;
}

function Chip({ label, url, img, symbol }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="cmd-chip">
      {img   && <ImgIcon src={img} size={14} />}
      {symbol && <span className="cmd-chip-icon">{symbol}</span>}
      {label}
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
          ? <img src={logo} alt={ctx.name} className="cmd-card-logo" />
          : <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>
        }
      </div>

      {/* Claude projects */}
      {claude.map(l => (
        <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} img={IMG.claude} />
      ))}

      {/* GitHub repos */}
      {ghRepos.map(r => (
        <Chip key={r.url} label={r.label} url={r.url} symbol="⌥" />
      ))}

      {/* GitHub boards */}
      {ghBoards.map(b => (
        <div key={b.url} className="cmd-chip-row">
          <span className="cmd-sub-arrow">↳</span>
          {b.tag && <Tag type={b.tag} />}
          <a href={b.url} target="_blank" rel="noreferrer" className="cmd-chip-inline">{b.label}</a>
        </div>
      ))}

      {/* SharePoint */}
      {sp.map(s => (
        <Chip key={s.url} label={s.label} url={s.url} img={spIcon(ctx.id, s.label)} />
      ))}
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
  const teamKeys = Object.keys(groups).filter(k => k.startsWith("Riipen \u00b7 "));

  return (
    <section className="cmd-section">
      <div className="cmd-section-header"><span>RIIPEN</span></div>
      <div className="cmd-riipen">
        <div className="cmd-riipen-top">
          {topLevel.map(l => (
            <Chip key={l.url} label={l.label} url={l.url} img={IMG.riipen} />
          ))}
        </div>
        {teamKeys.map(key => {
          const teamName = key.replace("Riipen \u00b7 ", "");
          const links = groups[key];
          return (
            <div key={key} className="cmd-riipen-row">
              <ImgIcon src={IMG.rrc} size={13} />
              <span className="cmd-riipen-team">{teamName}</span>
              {links.map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
            </div>
          );
        })}
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

  const personalClaude = (personal?.launchpad || []).filter(l => l.group === "Claude");
  const personalWeb    = (personal?.launchpad || []).filter(l => l.group === "Web");
  const personalBoards = personal?.github?.boards || [];
  const personalRepos  = personal?.github?.repos  || [];

  return (
    <div className="app-shell">
      <header className="app-bar">
        <span className="wordmark">RUSH<span>MORE</span></span>
        <nav className="app-nav">
          <button className={"app-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>Command</button>
          <button className={"app-nav-btn" + (view === "notes"   ? " active" : "")} onClick={() => setView("notes")}>Notes</button>
        </nav>
        <span className="app-date">{today}</span>
      </header>

      <CommandBar />

      {view === "command" && (
        <main className="cmd-main">

          {/* PERSONAL */}
          <section className="cmd-section">
            <div className="cmd-section-header"><span>PERSONAL</span></div>
            <div className="cmd-row">
              {/* Web links — no icon */}
              {personalWeb.map(l => <Chip key={l.url} label={l.label} url={l.url} />)}
              {/* AI tools */}
              <Chip label="ChatGPT" url="https://chatgpt.com" img={IMG.chatgpt} />
              <Chip label="Copilot" url="https://copilot.microsoft.com" img={IMG.copilot} />
              {/* Claude projects */}
              {personalClaude.map(l => (
                <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} img={PERSONAL_ICON[l.label] ?? IMG.orderIcon} />
              ))}
              {/* Boards */}
              {personalBoards.map(b => (
                <Chip key={b.url} label={b.label} url={b.url} img={PERSONAL_ICON[b.label] ?? undefined} symbol={!PERSONAL_ICON[b.label] ? "⊞" : undefined} />
              ))}
              {/* Repos */}
              {personalRepos.map(r => (
                <Chip key={r.url} label={r.label} url={r.url} img={PERSONAL_ICON[r.label] ?? undefined} symbol={!PERSONAL_ICON[r.label] ? "⌥" : undefined} />
              ))}
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

      {view === "notes" && (
        <main className="notes-main">
          <Canvas />
        </main>
      )}
    </div>
  );
}
