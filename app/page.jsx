"use client";

import { useState } from "react";
import Canvas from "@/components/Canvas";
import contextsData from "@/data/contexts.json";

const contexts = contextsData.contexts;

const ICONS = {
  claude: "✦",
  github: "⌥",
  sharepoint: "⬡",
  riipen: "⬟",
  web: "↗",
  board: "⊞",
};

function Tag({ type }) {
  return <span className={`cmd-tag cmd-tag-${type}`}>{type}</span>;
}

function Chip({ label, url, icon, sub }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className={"cmd-chip" + (sub ? " cmd-chip-sub" : "")}>
      {sub && <span className="cmd-sub-arrow">↳</span>}
      {icon && <span className="cmd-chip-icon">{icon}</span>}
      {label}
    </a>
  );
}

function ContextCard({ ctx }) {
  const ghBoards = ctx.github?.boards || [];
  const ghRepos = ctx.github?.repos || [];
  const sp = ctx.sharepoint || [];
  const claude = ctx.launchpad?.filter(l => l.group === "Claude") || [];

  return (
    <div className="cmd-card" style={{ "--ctx-accent": ctx.accent, "--ctx-bg": ctx.panelBg, "--ctx-edge": ctx.panelEdge }}>
      <div className="cmd-card-header">
        <span className="cmd-card-name">{ctx.name.toUpperCase()}</span>
      </div>

      {claude.map(l => (
        <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} icon={ICONS.claude} />
      ))}

      {ghRepos.map(r => (
        <Chip key={r.url} label={r.label} url={r.url} icon={ICONS.github} />
      ))}

      {ghBoards.map(b => (
        <div key={b.url} className="cmd-chip-row">
          <span className="cmd-sub-arrow">↳</span>
          {b.tag && <Tag type={b.tag} />}
          <a href={b.url} target="_blank" rel="noreferrer" className="cmd-chip-inline">
            {b.label}
          </a>
        </div>
      ))}

      {sp.map(s => (
        <Chip key={s.url} label={s.label} url={s.url} icon={ICONS.sharepoint} />
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
  const teamKeys = Object.keys(groups).filter(k => k.startsWith("Riipen · "));

  return (
    <section className="cmd-section">
      <div className="cmd-section-header"><span>RIIPEN</span></div>
      <div className="cmd-riipen">
        <div className="cmd-riipen-top">
          {topLevel.map(l => (
            <Chip key={l.url} label={l.label} url={l.url} />
          ))}
        </div>
        {teamKeys.map(key => {
          const teamName = key.replace("Riipen · ", "");
          const links = groups[key];
          return (
            <div key={key} className="cmd-riipen-row">
              <span className="cmd-sub-arrow">↳</span>
              <span className="cmd-riipen-team">{teamName}</span>
              {links.map(l => (
                <Chip key={l.url} label={l.label} url={l.url} />
              ))}
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

  const personal = contexts.find(c => c.id === "personal");
  const geocomforter = contexts.find(c => c.id === "geocomforter");
  const otherWork = contexts.filter(c => c.id !== "personal");

  return (
    <div className="app-shell">
      <header className="app-bar">
        <span className="wordmark">RUSH<span>MORE</span></span>
        <nav className="app-nav">
          <button className={"app-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>
            Command
          </button>
          <button className={"app-nav-btn" + (view === "notes" ? " active" : "")} onClick={() => setView("notes")}>
            Notes
          </button>
        </nav>
        <span className="app-date">{today}</span>
      </header>

      {view === "command" && (
        <main className="cmd-main">

          <section className="cmd-section">
            <div className="cmd-section-header"><span>PERSONAL</span></div>
            <div className="cmd-row">
              {(personal?.launchpad || []).filter(l => l.group !== "Claude").map(l => (
                <Chip key={l.url} label={l.label} url={l.url} />
              ))}
              {(personal?.launchpad || []).filter(l => l.group === "Claude").map(l => (
                <Chip key={l.url} label={l.label.replace("Claude: ", "")} url={l.url} icon={ICONS.claude} />
              ))}
              {(personal?.github?.boards || []).map(b => (
                <Chip key={b.url} label={b.label} url={b.url} icon={ICONS.board} />
              ))}
              {(personal?.github?.repos || []).map(r => (
                <Chip key={r.url} label={r.label} url={r.url} icon={ICONS.github} />
              ))}
            </div>
          </section>

          <section className="cmd-section">
            <div className="cmd-section-header"><span>WORK — GITHUB</span></div>
            <div className="cmd-cards-row">
              {otherWork.map(ctx => (
                <ContextCard key={ctx.id} ctx={ctx} />
              ))}
            </div>
          </section>

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
