import { NextResponse } from "next/server";

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
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers, next: { revalidate: 120 } } // cache 2 min
      );
      if (!res.ok) return { id, open: null };
      const data = await res.json();
      return { id, open: data.open_issues_count ?? null };
    })
  );

  const counts = {};
  for (const r of results) {
    if (r.status === "fulfilled") counts[r.value.id] = r.value.open;
  }

  return NextResponse.json(counts, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}
