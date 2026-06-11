export default function LaunchpadTile({ context }) {
  const groups = {};
  (context.launchpad || []).forEach((link) => {
    const g = link.group || "Links";
    (groups[g] = groups[g] || []).push(link);
  });
  const boards = context.github?.boards || [];
  const repos = context.github?.repos || [];
  const sites = context.sharepoint || [];
  if (boards.length || repos.length) groups["GitHub"] = [...boards, ...repos];
  if (sites.length) groups["SharePoint"] = sites;
  if (context.onedrive) groups["Files"] = [context.onedrive];

  return (
    <section className="tile" style={{ "--ctx": context.accent }}>
      <div className="tile-head">
        <span className="tile-name">Launchpad</span>
        <span className="tile-badge">{context.name}</span>
      </div>
      {Object.entries(groups).map(([label, links]) => (
        <div className="pad-group" key={label}>
          <div className="pad-group-label">{label}</div>
          <div className="pad-links">
            {links.map((link) =>
              link.url && link.url !== "REPLACE_ME" ? (
                <a
                  key={link.label}
                  className="pad-link"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="pad-dot" />
                  {link.label}
                </a>
              ) : (
                <span
                  key={link.label}
                  className="pad-link todo"
                  title="Add the real URL in data/contexts.json"
                >
                  <span className="pad-dot" />
                  {link.label}
                </span>
              )
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
