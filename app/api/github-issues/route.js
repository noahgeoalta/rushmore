import { NextResponse } from "next/server";

const GITHUB_USER = "noahgeoalta";

const REPOS = [
  { id: "geoalta",      owner: "GeoAltaSolutions", repo: "GeoAlta-QuestLog" },
  { id: "geocomforter", owner: "GeoAltaSolutions", repo: "GeoComforter-QuestLog" },
  { id: "chronoslate",  owner: "GeoAltaSolutions", repo: "ChronoSlate-QuestLog" },
  { id: "nmgco",        owner: "GeoAltaSolutions", repo: "NMGCO-QuestLog" },
  { id: "theorder",     owner: "noahgeoalta",       repo: "The-Order" },
  { id: "thegame",      owner: "noahgeoalta",       repo: "TheGame" },
];

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "rushmore-app",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const results = await Promise.allSettled(
    REPOS.map(async ({ id, owner, repo }) => {
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?assignee=${GITHUB_USER}&state=open&per_page=20`,
        { headers, next: { revalidate: 120 } }
      );
      if (!res.ok) return { id, rocks: [], bugCount: 0 };
      const data = await res.json();
      const issues = data.filter(i => !i.pull_request);
      const bugs  = issues.filter(i => i.labels.some(l => l.name.toLowerCase() === "bug"));
      const rocks = issues
        .filter(i => !i.labels.some(l => l.name.toLowerCase() === "bug"))
        .map(i => ({ number: i.number, title: i.title, url: i.html_url }));
      return { id, rocks, bugCount: bugs.length };
    })
  );

  const out = {};
  for (const r of results) {
    if (r.status === "fulfilled") out[r.value.id] = { rocks: r.value.rocks, bugCount: r.value.bugCount };
  }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}
