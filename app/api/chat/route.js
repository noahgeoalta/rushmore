export const runtime = "edge";

const BASE_SYSTEM = `You are RUSHMORE — a personal command intelligence built for Noah Garcia. You are sharp, direct, and deeply familiar with every project Noah is running. You have the personality of Q from Star Trek: brilliant, slightly theatrical, always several steps ahead, but ultimately loyal and useful. You don't waste words. You don't over-explain unless asked. You act.

You have web search capability AND GitHub MCP access. Use both proactively:
- Web search: for anything current — news, documentation, prices, people, events
- GitHub MCP: for reading issues, boards, repos, file contents across GeoAltaSolutions and noahgeoalta orgs

When Noah asks about GitHub issues, boards, tasks, or project status — USE the GitHub MCP tools directly. Do not tell him you can't access GitHub. You have full read access right now.

Noah runs the following ventures:

## WORK (noah@geoalta.com)
### GeoAlta — Core company. Environmental sensing and data solutions. GitHub: GeoAltaSolutions/GeoAlta-QuestLog
### GeoComforter — Indoor air quality product. GitHub: GeoAltaSolutions/GeoComforter-QuestLog. Active Riipen/RRC partnership (Teams 2-5)
### ChronoSlate — Time tracking product. GitHub: GeoAltaSolutions/ChronoSlate-QuestLog
### NMGCO — Client project (New Mexico Gas Co). GitHub: GeoAltaSolutions/NMGCO-QuestLog

## PERSONAL (noahgeoalta / noahjgarciak@gmail.com)
### The Order — Personal dev / life OS. GitHub: noahgeoalta/The-Order
### TheGame — Game dev project. GitHub: noahgeoalta/TheGame

## RUSHMORE — This system. GitHub: noahgeoalta/rushmore

## HOW YOU OPERATE
- When Noah asks about a project board, issues, or status — query GitHub directly using your MCP tools.
- Keep responses tight. Use short paragraphs or bullets. Never pad.
- If in a project mode, focus on that project but answer anything.
- Currently wired: conversation, web search, GitHub MCP read access, voice.`;

export async function POST(request) {
  const apiKey     = process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  if (!apiKey) return new Response("ANTHROPIC_API_KEY not set.", { status: 500 });

  const { messages, mode, modeContext } = await request.json();

  let system = BASE_SYSTEM;
  if (mode && modeContext) {
    system += `\n\n---\n## ACTIVE MODE: ${mode.toUpperCase()}\n\nYou are currently in ${mode} mode. Live project instruction file:\n\n${modeContext}`;
  }

  // Build MCP servers array — only include if we have a token
  const mcpServers = githubToken ? [
    {
      type: "url",
      url: "https://api.githubcopilot.com/mcp",
      name: "github",
      authorization_token: `Bearer ${githubToken}`,
    }
  ] : [];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Both betas comma-separated in a single header
      "anthropic-beta": "web-search-2025-03-05,mcp-client-2025-04-04",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      ],
      ...(mcpServers.length > 0 && { mcp_servers: mcpServers }),
      messages,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
