import "./globals.css";
import "./cv-input-override.css";
import "./ai-usage.css";
import "./ms-panel.css";

export const metadata = {
  title: "RUSHMORE",
  icons: {
    icon: "/api/img?path=images%2FRushmore%2Fskull.ico",
    shortcut: "/api/img?path=images%2FRushmore%2Fskull.ico",
    apple: "/api/img?path=images%2FRushmore%2Fskull.ico",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          .gh-section { margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--edge); display: flex; flex-direction: column; gap: 6px; }
          .gh-section-label { display: flex; align-items: center; gap: 6px; }
          .gh-section-label > span { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; color: var(--faint); text-transform: uppercase; }
          .gh-issues { display: flex; flex-direction: column; gap: 3px; }
          .gh-issue { display: flex; align-items: baseline; gap: 6px; padding: 4px 6px; border-radius: 4px; text-decoration: none; transition: background 0.1s; border: 1px solid transparent; }
          .gh-issue:hover { background: rgba(255,255,255,0.04); border-color: var(--edge); }
          .gh-issue-num { font-size: 10px; font-weight: 700; color: var(--faint); flex-shrink: 0; font-family: monospace; }
          .gh-issue-title { font-size: 11px; color: var(--text); line-height: 1.4; }
          .gh-bug-line { display: flex; align-items: center; gap: 6px; padding: 4px 6px; }
          .gh-bug-icon { font-size: 12px; }
          .gh-bug-text { font-size: 11px; color: #ff6666; font-weight: 600; }
          .gh-no-issues { font-size: 10px; color: var(--faint); padding: 2px 0; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
