export default function LaunchpadTile({ context }) {
  const groups = {};
  (context.launchpad || []).forEach((link) => {
    const g = link.group || "Links";
    (groups[g] = groups[g] || []).push(link);
  });
  const boards = context.github?.boards || [];
  const repos = context.github?.repos || [];
  const sites = context.sharepoint || [];
  if (boards.length || repos.length) groups["GitHub"] = [...repos, ...boards];
  if (sites.length) groups["SharePoint"] = sites;
  if (context.onedrive) groups["Files"] = [context.onedrive];

  return (
    <section
      className="tile"
      style={{
        "--ctx": context.accent,
        "--panelBg": context.panelBg,
        "--panelEdge": context.panelEdge,
      }}
    >
      <div className="tile-head">
        <span className="tile-name">Launchpad</span>
        <span className="tile-badge">{context.name}</span>
      </div>
      {Object.entries(groups).map(([label, links]) => (
        <div className="pad-group" key={label}>
          <div className="pad-group-label">{label}</div>
          <div className="pad-links">
            {links.map((link) => {
              const isClaude = (link.group || label) === "Claude";
              const cls = `pad-link${isClaude ? " claude" : ""}`;
              const inner = (
                <>
                  {link.tag ? (
                    <span className={`tag tag-${link.tag}`}>{link.tag}</span>
                  ) : (
                    <span className="pad-dot" />
                  )}
                  {link.label}
                </>
              );
              return link.url && link.url !== "REPLACE_ME" ? (
                <a key={link.label} className={cls} href={link.url} target="_blank" rel="noreferrer">
                  {inner}
                </a>
              ) : (
                <span key={link.label} className={`${cls} todo`} title="Add the real URL in data/contexts.json">
                  {inner}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
