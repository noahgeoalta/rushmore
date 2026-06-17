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
        `https://api.github.com/repos/${owner}/${repo}/issues?assignee=${GITHUB_USER}&state=open&per_page=5`,
        { headers, next: { revalidate: 120 } }
      );
      if (!res.ok) return { id, issues: [] };
      const data = await res.json();
      // Filter out pull requests (GitHub issues API includes PRs)
      const issues = data
        .filter(i => !i.pull_request)
        .map(i => ({ number: i.number, title: i.title, url: i.html_url, labels: i.labels?.map(l => l.name) || [] }));
      return { id, issues };
    })
  );

  const out = {};
  for (const r of results) {
    if (r.status === "fulfilled") out[r.value.id] = r.value.issues;
  }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}
