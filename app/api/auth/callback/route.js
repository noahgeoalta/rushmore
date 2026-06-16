import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}?auth_error=${error || "no_code"}`);
  }

  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const redirectUri  = `${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}/api/auth/callback`;

  // Use 'common' endpoint for token exchange too
  const tokenRes = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      grant_type:    "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}?auth_error=token_exchange_failed`);
  }

  const cookieStore = await cookies();
  const opts = { httpOnly: true, secure: true, sameSite: "lax", path: "/" };
  cookieStore.set("ms_access_token",  tokens.access_token,  { ...opts, maxAge: tokens.expires_in || 3600 });
  cookieStore.set("ms_refresh_token", tokens.refresh_token, { ...opts, maxAge: 60 * 60 * 24 * 90 });

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}?ms_authed=1`);
}
