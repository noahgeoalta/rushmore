import { NextResponse } from "next/server";

const NOTES_KEY = "rushmore:notes:v1";

function getRedisConfig() {
  // Try all possible env var names Upstash/Vercel might use
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

export async function GET() {
  try {
    const { url, token } = getRedisConfig();
    if (!url || !token) return NextResponse.json({ data: null, error: "Redis not configured" });
    const res = await fetch(`${url}/get/${encodeURIComponent(NOTES_KEY)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json({ data: data.result || null });
  } catch (e) {
    return NextResponse.json({ data: null, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { url, token } = getRedisConfig();
    if (!url || !token) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
    const body = await request.json();
    await fetch(`${url}/set/${encodeURIComponent(NOTES_KEY)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(JSON.stringify(body)),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
