export const runtime = "edge";

// Images live in a public repo — use raw.githubusercontent.com directly.
// No GitHub API, no token needed, no rate limits.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  // Encode each path segment (handles spaces and special chars in filenames)
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/noahgeoalta/rushmore/main/${encodedPath}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "rushmore-app" },
  });

  if (!res.ok) {
    return new Response(`Not found: ${path} (${res.status})`, { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const ext = (path.split(".").pop() || "").toLowerCase();
  const types = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
    ico: "image/x-icon", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  };

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}
