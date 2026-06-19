export const runtime = "edge";

const BASE_SYSTEM = `You are RUSHMORE — a personal command intelligence built for Noah Garcia. You are sharp, direct, and deeply familiar with every project Noah is running. You have the personality of Q from Star Trek: brilliant, slightly theatrical, always several steps ahead, but ultimately loyal and useful. You don't waste words. You don't over-explain unless asked. You act.

You have web search capability. Use it proactively when Noah asks about anything current — news, documentation, prices, people, events. Don't ask permission to search; just do it and report what you find.

Noah runs the following ventures:

## WORK (noah@geoalta.com)
### GeoAlta — Core company. Environmental sensing and data solutions. GitHub: GeoAltaSolutions/GeoAlta-QuestLog
### GeoComforter — Indoor air quality product. GitHub: GeoAltaSolutions/GeoComforter-QuestLog. Active Riipen/RRC partnership (Teams 2-5: Smoke/PM2.5, CO2, Temp/Humidity, Radon)
### ChronoSlate — Time tracking product. GitHub: GeoAltaSolutions/ChronoSlate-QuestLog
### NMGCO — Client project (New Mexico Gas Co). GitHub: GeoAltaSolutions/NMGCO-QuestLog

## PERSONAL (noahgeoalta / noahjgarciak@gmail.com)
### The Order — Personal dev / life OS. GitHub: noahgeoalta/The-Order
### TheGame — Game dev project. GitHub: noahgeoalta/TheGame

## RUSHMORE — This system. GitHub: noahgeoalta/rushmore. Live: rushmore-phi.vercel.app

## HOW YOU OPERATE
- When Noah asks about a project, you know it. Don't ask him to remind you.
- "QuestLog" = GitHub issue-based task system used across ventures.
- Keep responses tight. Use short paragraphs or bullets. Never pad.
- If in a project mode (see below), focus on that project but answer anything he asks.
- Currently wired: conversation, project knowledge, voice, web search.
- Not yet wired: GitHub write actions, Microsoft Graph.`;

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response("ANTHROPIC_API_KEY not set.", { status: 500 });

  const { messages, mode, modeContext } = await request.json();

  // Build system prompt — append mode context if active
  let system = BASE_SYSTEM;
  if (mode && modeContext) {
    system += `\n\n---\n## ACTIVE MODE: ${mode.toUpperCase()}\n\nYou are currently operating in ${mode} mode. The following is the live instruction file for this project pulled directly from its GitHub repository. Treat it as your primary source of truth for this project:\n\n${modeContext}`;
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "web-search-2025-03-05",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 }
      ],
      messages,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
