export const runtime = "edge";

// GitHub REST API helper — handles issues, file contents, project boards
export async function GET(request) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return new Response("GITHUB_TOKEN not set", { status: 503 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");   // "issues" | "file" | "search_issues"
  const owner  = searchParams.get("owner");
  const repo   = searchParams.get("repo");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Rushmore",
  };

  try {
    if (action === "issues") {
      const state  = searchParams.get("state")  || "open";
      const labels = searchParams.get("labels") || "";
      const limit  = searchParams.get("limit")  || "30";
      let url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}&sort=updated`;
      if (labels) url += `&labels=${encodeURIComponent(labels)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return new Response(await res.text(), { status: res.status });
      const issues = await res.json();
      // Return clean summary
      const summary = issues.map(i => ({
        number: i.number,
        title: i.title,
        state: i.state,
        labels: i.labels.map(l => l.name),
        milestone: i.milestone?.title || null,
        assignees: i.assignees.map(a => a.login),
        updated_at: i.updated_at,
        url: i.html_url,
        body_preview: i.body?.slice(0, 200) || "",
      }));
      return new Response(JSON.stringify({ action, owner, repo, count: summary.length, issues: summary }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "file") {
      const path = searchParams.get("path") || "README.md";
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers: { ...headers, Accept: "application/vnd.github.raw+json" } }
      );
      if (!res.ok) return new Response(await res.text(), { status: res.status });
      const text = await res.text();
      return new Response(JSON.stringify({ action, owner, repo, path, content: text.slice(0, 8000) }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "search_issues") {
      const q = searchParams.get("q") || "";
      const query = `${q} repo:${owner}/${repo}`;
      const res = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=20&sort=updated`,
        { headers }
      );
      if (!res.ok) return new Response(await res.text(), { status: res.status });
      const data = await res.json();
      const items = (data.items || []).map(i => ({
        number: i.number, title: i.title, state: i.state,
        labels: i.labels.map(l => l.name),
        updated_at: i.updated_at, url: i.html_url,
        body_preview: i.body?.slice(0, 200) || "",
      }));
      return new Response(JSON.stringify({ action, query, count: items.length, issues: items }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Unknown action", { status: 400 });
  } catch (err) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
