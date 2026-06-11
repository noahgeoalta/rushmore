"use client";

import { useState } from "react";
import contextsData from "@/data/contexts.json";
import ContextRail from "@/components/ContextRail";
import TileGrid from "@/components/TileGrid";
import LaunchpadTile from "@/components/tiles/LaunchpadTile";
import PlaceholderTile from "@/components/tiles/PlaceholderTile";

const contexts = contextsData.contexts;

export default function Home() {
  const [activeId, setActiveId] = useState("all");
  const active = contexts.find((c) => c.id === activeId);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="shell">
      <header className="topbar">
        <span className="wordmark">
          RUSH<span>MORE</span>
        </span>
        <span className="date">{today}</span>
      </header>

      <ContextRail contexts={contexts} activeId={activeId} onSelect={setActiveId} />

      <main className="deck">
        {activeId === "all" ? (
          <>
            <h1 className="deck-title">All contexts</h1>
            <p className="deck-sub">
              The morning glance. Aggregated counts arrive in M6 — launchpads for every context are live now.
            </p>
            <div className="grid">
              <PlaceholderTile
                name="Unread everywhere"
                milestone="M6"
                detail="Mail, Teams, and board counts across every context."
              />
              <PlaceholderTile
                name="Today"
                milestone="M6"
                detail="One combined agenda across all calendars."
              />
              {contexts.map((c) => (
                <LaunchpadTile key={c.id} context={c} />
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="deck-title" style={{ color: active.accent }}>
              {active.name}
            </h1>
            <p className="deck-sub">
              {active.mail
                ? `Mail via ${active.mail.mailbox}`
                : "No mailbox wired to this context"}
              {" · "}
              {active.github ? `GitHub (${active.github.account})` : "no GitHub"}
            </p>
            <TileGrid context={active} />
          </>
        )}
      </main>
    </div>
  );
}
