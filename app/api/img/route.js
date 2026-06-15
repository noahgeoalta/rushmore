export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // path arrives already decoded by Next.js routing
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const token = process.env.GITHUB_TOKEN;
  const owner = "noahgeoalta";
  const repo = "rushmore";
  const branch = "main";

  // Use the raw content API — path segments must be individually encoded
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;

  const headers = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "rushmore-app",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(apiUrl, { headers });
  if (!res.ok) {
    return new Response(`GitHub error: ${res.status} for path: ${path}`, { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const ext = path.split(".").pop()?.toLowerCase();
  const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
  const contentType = types[ext] || "application/octet-stream";

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
