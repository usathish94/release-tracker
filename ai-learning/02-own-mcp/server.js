// CONCEPT: same "get_live_score" capability as 01-custom-tool, but exposed
// through the Model Context Protocol (MCP) over stdio. Any MCP client —
// Claude Desktop, Claude Code, a custom agent — can now discover and call
// this tool without knowing it's backed by JS. You're the "server" author.
//
// Run standalone:   node server.js         (it just sits there talking stdio)
// Register it in Claude Code:  see README.md in this folder.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "cricket-score-mcp",
  version: "1.0.0",
});

const MOCK_MATCHES = {
  42: { teams: "India vs Australia", score: "287/4", overs: "45.2", status: "live" },
  7: { teams: "England vs South Africa", score: "150 all out", overs: "38.0", status: "completed" },
};

server.registerTool(
  "get_live_score",
  {
    title: "Get live cricket score",
    description: "Get the live score for a cricket match by its match id.",
    inputSchema: { matchId: z.number().describe("The match id, e.g. 42") },
  },
  async ({ matchId }) => {
    const match = MOCK_MATCHES[matchId];
    if (!match) {
      return {
        content: [{ type: "text", text: `No match found with id ${matchId}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(match) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
