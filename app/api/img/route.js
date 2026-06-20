// Redirect to raw.githubusercontent.com — no GitHub API calls, no rate limits, instant.
// The repo is public so raw URLs work without auth.
export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const rawUrl = `https://raw.githubusercontent.com/noahgeoalta/rushmore/main/${path}`;

  // Fetch from raw GitHub and proxy through (preserves CORS and caching)
  const res = await fetch(rawUrl);
  if (!res.ok) {
    return new Response(`Image not found: ${path}`, { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const ext = path.split(".").pop()?.toLowerCase();
  const types = {
    png:  "image/png",
    jpg:  "image/jpeg",
    jpeg: "image/jpeg",
    gif:  "image/gif",
    svg:  "image/svg+xml",
    webp: "image/webp",
    ico:  "image/x-icon",
    mp4:  "video/mp4",
    webm: "video/webm",
    mov:  "video/quicktime",
  };
  const contentType = types[ext] || "application/octet-stream";

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Cache aggressively — images rarely change
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}
