export default function PlaceholderTile({ name, milestone, detail }) {
  return (
    <section className="tile">
      <div className="tile-head">
        <span className="tile-name">{name}</span>
        <span className="tile-badge">{milestone}</span>
      </div>
      <p className="tile-empty">
        <strong>Wired in {milestone}.</strong>
        <br />
        {detail}
      </p>
    </section>
  );
}
