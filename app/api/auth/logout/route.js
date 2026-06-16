import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  cookieStore.delete("ms_access_token");
  cookieStore.delete("ms_refresh_token");
  return NextResponse.redirect(`${process.env.NEXTAUTH_URL || "https://rushmore-phi.vercel.app"}`);
}
