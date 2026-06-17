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
          .cmd-card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
          .issue-badge { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; background: #2a1200; color: #ff8c3a; border: 1px solid #5a2800; white-space: nowrap; flex-shrink: 0; }
          .issue-badge.zero { background: #0f2010; color: #5aaa5a; border-color: #1e401e; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
