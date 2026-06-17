import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();
  const correct = process.env.RUSHMORE_PASSWORD;

  if (!correct) return NextResponse.json({ error: "Not configured" }, { status: 500 });
  if (password !== correct) return NextResponse.json({ error: "Wrong password" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("rushmore_auth", correct, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90, // 90 days
  });
  return res;
}
