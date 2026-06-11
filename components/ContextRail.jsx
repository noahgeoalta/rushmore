"use client";

export default function ContextRail({ contexts, activeId, onSelect }) {
  return (
    <nav className="rail" aria-label="Contexts">
      <div className="rail-label">Contexts</div>
      <button
        className={`face ${activeId === "all" ? "active" : ""}`}
        onClick={() => onSelect("all")}
      >
        <span className="initials" style={{ "--ctx": "#e8e8e8" }}>A</span>
        All
      </button>
      <button
        className={`face ${activeId === "notes" ? "active" : ""}`}
        style={{ "--ctx": "#ff8c3a", "--ctxBg": "#2a1200", "--ctxEdge": "#6b3000" }}
        onClick={() => onSelect("notes")}
      >
        <span className="initials" style={{ "--ctx": "#ff8c3a" }}>N</span>
        Notes
      </button>
      <hr className="rail-divider" />
      {contexts.map((c) => (
        <button
          key={c.id}
          className={`face ${activeId === c.id ? "active" : ""}`}
          style={{ "--ctx": c.accent, "--ctxBg": c.panelBg, "--ctxEdge": c.panelEdge }}
          onClick={() => onSelect(c.id)}
        >
          <span className="initials" style={{ "--ctx": c.accent }}>{c.initials}</span>
          {c.name}
        </button>
      ))}
    </nav>
  );
}
