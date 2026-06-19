export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo  = searchParams.get("repo");
  const path  = searchParams.get("path") || "README.md";

  if (!owner || !repo) return new Response("Missing owner/repo", { status: 400 });

  const token = process.env.GITHUB_TOKEN;
  const headers = { Accept: "application/vnd.github.raw+json", "User-Agent": "Rushmore" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers }
  );

  if (!res.ok) {
    return new Response(`GitHub error: ${res.status}`, { status: res.status });
  }

  // GitHub returns base64-encoded content when not using raw accept header
  // With vnd.github.raw+json it returns plain text directly
  const text = await res.text();
  return new Response(JSON.stringify({ content: text, path, repo: `${owner}/${repo}` }), {
    headers: { "Content-Type": "application/json" },
  });
}
