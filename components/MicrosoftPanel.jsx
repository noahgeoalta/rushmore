"use client";

import { useEffect, useState } from "react";

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MicrosoftPanel() {
  const [authed, setAuthed]     = useState(null); // null=loading, false=not authed, true=authed
  const [mail, setMail]         = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [profile, setProfile]   = useState(null);
  const [tab, setTab]           = useState("mail");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then(r => r.json())
      .then(d => setAuthed(d.authed))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (!authed) return;
    // Load profile
    fetch("/api/graph?type=profile").then(r => r.json()).then(d => { if (d.displayName) setProfile(d); });
    // Load initial tab
    loadTab("mail");
  }, [authed]);

  const loadTab = (t) => {
    setTab(t); setLoading(true);
    fetch(`/api/graph?type=${t}`)
      .then(r => r.json())
      .then(d => {
        if (t === "mail")     setMail(d?.value || []);
        if (t === "calendar") setCalendar(d?.value || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  if (authed === null) return (
    <div className="ms-panel ms-loading">Connecting to Microsoft…</div>
  );

  if (!authed) return (
    <div className="ms-panel ms-signin">
      <div className="ms-signin-text">
        <span className="ms-signin-icon">&#9993;</span>
        <span>Connect Outlook, Teams &amp; Calendar</span>
      </div>
      <a href="/api/auth/login" className="ms-signin-btn">Sign in with Microsoft</a>
    </div>
  );

  return (
    <div className="ms-panel">
      <div className="ms-panel-header">
        <div className="ms-panel-tabs">
          <button className={`ms-tab${tab === "mail"     ? " active" : ""}`} onClick={() => loadTab("mail")}>Mail</button>
          <button className={`ms-tab${tab === "calendar" ? " active" : ""}`} onClick={() => loadTab("calendar")}>Calendar</button>
          <button className={`ms-tab${tab === "teams"    ? " active" : ""}`} onClick={() => loadTab("teams")}>Teams</button>
        </div>
        <div className="ms-panel-user">
          {profile && <span className="ms-user-name">{profile.displayName}</span>}
          <a href="/api/auth/logout" className="ms-signout">Sign out</a>
        </div>
      </div>

      <div className="ms-panel-body">
        {loading && <div className="ms-loading">Loading…</div>}

        {!loading && tab === "mail" && (
          <div className="ms-list">
            {(!mail || mail.length === 0) && <div className="ms-empty">No recent mail</div>}
            {mail?.map(m => (
              <div key={m.id} className={`ms-item${m.isRead ? "" : " unread"}`}>
                <div className="ms-item-from">{m.from?.emailAddress?.name || m.from?.emailAddress?.address}</div>
                <div className="ms-item-subject">{m.subject}</div>
                <div className="ms-item-time">{timeAgo(m.receivedDateTime)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "calendar" && (
          <div className="ms-list">
            {(!calendar || calendar.length === 0) && <div className="ms-empty">No upcoming events</div>}
            {calendar?.map(e => (
              <div key={e.id} className="ms-item">
                <div className="ms-item-from">{e.subject}</div>
                <div className="ms-item-time">{fmtTime(e.start.dateTime)}</div>
                {e.location?.displayName && <div className="ms-item-subject">{e.location.displayName}</div>}
              </div>
            ))}
          </div>
        )}

        {!loading && tab === "teams" && (
          <div className="ms-list">
            <div className="ms-empty">Teams chat coming soon — <a href="https://teams.microsoft.com" target="_blank" rel="noreferrer" style={{color:"var(--orange)"}}>Open Teams</a></div>
          </div>
        )}
      </div>
    </div>
  );
}
