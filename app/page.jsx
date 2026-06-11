"use client";

import { useState } from "react";
import contextsData from "@/data/contexts.json";
import ContextRail from "@/components/ContextRail";
import TileGrid from "@/components/TileGrid";
import Notes from "@/components/Notes";
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
        {activeId === "all" && (
          <>
            <h1 className="deck-title">Operations</h1>
            <p className="deck-sub">All contexts</p>
            <div className="grid">
              {contexts.map((c) => (
                <LaunchpadTile key={c.id} context={c} />
              ))}
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
            </div>
          </>
        )}
        {activeId === "notes" && (
          <>
            <h1 className="deck-title">Notes</h1>
            <p className="deck-sub">Saved on this device</p>
            <Notes />
          </>
        )}
        {active && (
          <>
            <h1 className="deck-title" style={{ color: active.accent }}>
              {active.name}
            </h1>
            <p className="deck-sub">
              {active.mail ? `Mail via ${active.mail.mailbox}` : "No mailbox"}
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
