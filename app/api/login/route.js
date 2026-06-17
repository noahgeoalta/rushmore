import { NextResponse } from "next/server";

// Simple in-memory rate limiter (resets on cold start, good enough for personal use)
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();

  // Clean old entries
  for (const [key, data] of attempts.entries()) {
    if (now - data.first > WINDOW_MS) attempts.delete(key);
  }

  // Check rate limit
  const record = attempts.get(ip) || { count: 0, first: now };
  if (record.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  }

  const { password } = await request.json();
  const correct = process.env.RUSHMORE_PASSWORD;

  if (!correct) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  if (password !== correct) {
    attempts.set(ip, { count: record.count + 1, first: record.first });
    return NextResponse.json({ error: "Access denied." }, { status: 401 });
  }

  // Success — clear attempts
  attempts.delete(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("rushmore_auth", correct, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
