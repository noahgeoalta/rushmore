export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const token = process.env.GITHUB_TOKEN;
  if (!token) return new Response("GITHUB_TOKEN not set", { status: 500 });

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const apiUrl = `https://api.github.com/repos/noahgeoalta/rushmore/contents/${encodedPath}?ref=main`;

  const res = await fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github.v3.raw",
      Authorization: `Bearer ${token}`,
      "User-Agent": "rushmore-app",
    },
  });

  if (!res.ok) {
    return new Response(`GitHub error ${res.status} for: ${path}`, { status: res.status });
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
