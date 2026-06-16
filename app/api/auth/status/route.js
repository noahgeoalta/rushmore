import { NextResponse } from "next/server";
import { cookies } from "next/headers";

async function refreshToken(refreshTok) {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      refresh_token: refreshTok,
      grant_type:    "refresh_token",
    }),
  });
  return res.json();
}

export async function GET() {
  const cookieStore = await cookies();
  let accessToken  = cookieStore.get("ms_access_token")?.value;
  const refreshTok = cookieStore.get("ms_refresh_token")?.value;

  if (!accessToken && !refreshTok) {
    return NextResponse.json({ authed: false });
  }

  // Try to refresh if access token missing
  if (!accessToken && refreshTok) {
    const tokens = await refreshToken(refreshTok);
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      const response = NextResponse.json({ authed: true });
      response.cookies.set("ms_access_token", accessToken, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: tokens.expires_in || 3600 });
      return response;
    }
    return NextResponse.json({ authed: false });
  }

  return NextResponse.json({ authed: true });
}
