import { NextResponse } from "next/server";

export const runtime = "experimental-edge";

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Always allow these through
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/login" ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const auth = request.cookies.get("rushmore_auth")?.value;
  const correct = process.env.RUSHMORE_PASSWORD;

  if (correct && auth === correct) {
    return NextResponse.next();
  }

  // Not authed — redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.ico|.*\\.jpg|.*\\.svg).*)",
  ],
};
