      <nav className="mobile-nav">
        <button className={"mobile-nav-btn" + (view === "command" ? " active" : "")} onClick={() => setView("command")}>
          <span className="mobile-nav-icon">⚡</span>Command
        </button>
        <button className={"mobile-nav-btn" + (view === "notes" ? " active" : "")} onClick={() => setView("notes")}>
          <span className="mobile-nav-icon">📝</span>Notes
        </button>
      </nav>