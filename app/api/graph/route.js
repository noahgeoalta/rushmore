import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ms_access_token")?.value;
  if (!token) return null;
  return token;
}

async function graphGet(token, path) {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 }, // cache 60s
  });
  if (!res.ok) return null;
  return res.json();
}

export async function GET(request) {
  const token = await getToken();
  if (!token) return NextResponse.json({ authed: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    if (type === "mail") {
      const data = await graphGet(token, "/me/messages?$top=10&$select=subject,from,receivedDateTime,isRead&$orderby=receivedDateTime desc");
      return NextResponse.json(data);
    }
    if (type === "calendar") {
      const now = new Date().toISOString();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const data = await graphGet(token, `/me/calendarView?startDateTime=${now}&endDateTime=${end}&$top=10&$select=subject,start,end,location&$orderby=start/dateTime`);
      return NextResponse.json(data);
    }
    if (type === "teams") {
      const data = await graphGet(token, "/me/joinedTeams?$select=displayName,id");
      return NextResponse.json(data);
    }
    if (type === "profile") {
      const data = await graphGet(token, "/me?$select=displayName,mail,userPrincipalName");
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
