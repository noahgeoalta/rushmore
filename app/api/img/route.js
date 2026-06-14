// Image proxy for private GitHub repo assets
// Requires GITHUB_TOKEN env var set in Vercel with repo read access
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const token = process.env.GITHUB_TOKEN;
  const owner = "noahgeoalta";
  const repo = "rushmore";
  const branch = "main";

  // Try GitHub Contents API first (returns base64 for files < 1MB)
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;

  const headers = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "rushmore-app",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(apiUrl, { headers, cache: "force-cache" });
  if (!res.ok) {
    return new Response(`GitHub error: ${res.status}`, { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const contentType = getContentType(path);

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

function getContentType(path) {
  const ext = path.split(".").pop()?.toLowerCase();
  const map = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
  return map[ext] || "application/octet-stream";
}
