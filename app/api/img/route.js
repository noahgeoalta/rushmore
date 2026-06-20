export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const token  = process.env.GITHUB_TOKEN;
  const owner  = "noahgeoalta";
  const repo   = "rushmore";

  // Use raw content URL with proper encoding for spaces/special chars
  const encodedPath = path.split("/").map(segment => encodeURIComponent(segment)).join("/");
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${encodedPath}`;

  const headers = { "User-Agent": "rushmore-app" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(rawUrl, { headers });
  if (!res.ok) {
    return new Response(`Image not found: ${path} (${res.status})`, { status: res.status });
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
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}
