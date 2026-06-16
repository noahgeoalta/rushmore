import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.AZURE_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}/api/auth/callback`;

  const scopes = [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
    "Mail.Read",
    "Calendars.Read",
    "Files.Read",
  ].join(" ");

  // Use 'common' endpoint — works for both personal and work accounts
  // without requiring org admin consent
  const url = new URL(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("prompt", "consent");

  return NextResponse.redirect(url.toString());
}
