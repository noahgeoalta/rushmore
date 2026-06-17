import { NextResponse } from "next/server";

const NOTES_KEY = "rushmore:notes:v1";

function getRedisConfig() {
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
    let result = data.result || null;
    // Unwrap double-stringification if needed
    if (typeof result === "string") {
      try { result = JSON.parse(result); } catch {}
    }
    return NextResponse.json({ data: result });
  } catch (e) {
    return NextResponse.json({ data: null, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { url, token } = getRedisConfig();
    if (!url || !token) return NextResponse.json({ error: "Redis not configured" }, { status: 500 });
    const body = await request.json();
    // Store as single JSON string, not double-stringified
    const value = JSON.stringify(body);
    await fetch(`${url}/set/${encodeURIComponent(NOTES_KEY)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
