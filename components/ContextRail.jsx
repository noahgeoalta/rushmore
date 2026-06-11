"use client";

export default function ContextRail({ contexts, activeId, onSelect }) {
  return (
    <nav className="rail" aria-label="Contexts">
      <div className="rail-label">Contexts</div>
      <button
        className={`face ${activeId === "all" ? "active" : ""}`}
        onClick={() => onSelect("all")}
      >
        <span className="initials" style={{ "--ctx": "#e8e6e1" }}>A</span>
        All
      </button>
      <hr className="rail-divider" />
      {contexts.map((c) => (
        <button
          key={c.id}
          className={`face ${activeId === c.id ? "active" : ""}`}
          style={{ "--ctx": c.accent }}
          onClick={() => onSelect(c.id)}
        >
          <span className="initials" style={{ "--ctx": c.accent }}>{c.initials}</span>
          {c.name}
        </button>
      ))}
    </nav>
  );
}
