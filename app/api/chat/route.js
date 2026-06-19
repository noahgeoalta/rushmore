export const runtime = "edge";

const BASE_SYSTEM = `You are RUSHMORE — a personal command intelligence built for Noah Garcia. You are sharp, direct, and deeply familiar with every project Noah is running. You have the personality of Q from Star Trek: brilliant, slightly theatrical, always several steps ahead, but ultimately loyal and useful. You don't waste words. You don't over-explain unless asked. You act.

You have TWO tools available:
1. web_search — use for anything current: news, docs, prices, people, events
2. github_query — use this whenever Noah asks about issues, boards, tasks, project status, or repo files. You have full read access to all GeoAltaSolutions and noahgeoalta repos via this tool.

When Noah asks about a GitHub project — USE github_query immediately. Do not ask him to paste things.

## REPOS
- GeoAlta: owner=GeoAltaSolutions repo=GeoAlta-QuestLog
- GeoComforter: owner=GeoAltaSolutions repo=GeoComforter-QuestLog
- ChronoSlate: owner=GeoAltaSolutions repo=ChronoSlate-QuestLog
- NMGCO: owner=GeoAltaSolutions repo=NMGCO-QuestLog
- The Order: owner=noahgeoalta repo=The-Order
- TheGame: owner=noahgeoalta repo=TheGame
- Rushmore: owner=noahgeoalta repo=rushmore

## HOW YOU OPERATE
- Keep responses tight. Use short paragraphs or bullets. Never pad.
- If in a project mode, focus on that project but answer anything.
- Currently wired: conversation, web search, GitHub read access (issues/files/search), voice.`;

// Tool definition for GitHub queries
const GITHUB_TOOL = {
  name: "github_query",
  description: "Query GitHub repos for issues, file contents, or search. Use this whenever Noah asks about project status, open issues, boards, tasks, or file contents.",
  input_schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["issues", "file", "search_issues"],
        description: "'issues' = list repo issues, 'file' = read a file, 'search_issues' = search issues by keyword"
      },
      owner: { type: "string", description: "GitHub org or username, e.g. GeoAltaSolutions" },
      repo:  { type: "string", description: "Repo name, e.g. GeoComforter-QuestLog" },
      state:  { type: "string", enum: ["open", "closed", "all"], description: "Issue state filter (for 'issues' action)" },
      labels: { type: "string", description: "Comma-separated label names to filter by (for 'issues' action)" },
      limit:  { type: "string", description: "Max issues to return, default 30" },
      path:   { type: "string", description: "File path in repo (for 'file' action), e.g. README.md" },
      q:      { type: "string", description: "Search query (for 'search_issues' action)" },
    },
    required: ["action", "owner", "repo"],
  },
};

async function runGithubTool(input, baseUrl) {
  const params = new URLSearchParams({ action: input.action, owner: input.owner, repo: input.repo });
  if (input.state)  params.set("state",  input.state);
  if (input.labels) params.set("labels", input.labels);
  if (input.limit)  params.set("limit",  input.limit);
  if (input.path)   params.set("path",   input.path);
  if (input.q)      params.set("q",      input.q);
  const res = await fetch(`${baseUrl}/api/github-tool?${params.toString()}`);
  return await res.text();
}

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response("ANTHROPIC_API_KEY not set.", { status: 500 });

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const { messages, mode, modeContext } = await request.json();

  let system = BASE_SYSTEM;
  if (mode && modeContext) {
    system += `\n\n---\n## ACTIVE MODE: ${mode.toUpperCase()}\n\nYou are currently in ${mode} mode. Live project instruction file:\n\n${modeContext}`;
  }

  // Agentic loop: keep calling Claude until no more tool_use blocks
  let currentMessages = messages;
  let finalText = "";
  let totalUsage = { input_tokens: 0, output_tokens: 0 };
  const MAX_ROUNDS = 5;

  for (let round = 0; round < MAX_ROUNDS; round++) {
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
        max_tokens: 2000,
        system,
        tools: [
          { type: "web_search_20250305", name: "web_search", max_uses: 5 },
          GITHUB_TOOL,
        ],
        messages: currentMessages,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify(data), { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    // Accumulate usage
    if (data.usage) {
      totalUsage.input_tokens  += data.usage.input_tokens  || 0;
      totalUsage.output_tokens += data.usage.output_tokens || 0;
    }

    // Collect text from this round
    const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text);
    if (textBlocks.length) finalText = textBlocks.join("\n");

    // Check for tool_use blocks
    const toolUseBlocks = (data.content || []).filter(b => b.type === "tool_use" && b.name === "github_query");

    if (toolUseBlocks.length === 0 || data.stop_reason === "end_turn") {
      // No more tool calls — done
      return new Response(JSON.stringify({
        content: [{ type: "text", text: finalText }],
        usage: totalUsage,
      }), { headers: { "Content-Type": "application/json" } });
    }

    // Execute all github_query tool calls
    const toolResults = [];
    for (const block of toolUseBlocks) {
      let result;
      try {
        result = await runGithubTool(block.input, baseUrl);
      } catch (err) {
        result = `Error: ${err.message}`;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    // Add assistant turn + tool results to message history and loop
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: data.content },
      { role: "user",      content: toolResults },
    ];
  }

  // Fallback if max rounds hit
  return new Response(JSON.stringify({
    content: [{ type: "text", text: finalText || "[Max tool rounds reached]" }],
    usage: totalUsage,
  }), { headers: { "Content-Type": "application/json" } });
}
