// CONCEPT: you don't have to author every MCP server yourself. Here we act
// purely as a CLIENT and connect to GitHub's official MCP server (someone
// else's code, someone else's maintenance burden) to list and call ITS
// tools — e.g. "search issues in this repo". Compare to 02-own-mcp, where
// WE were the server.
//
// Prereqs:
//   - Docker installed (GitHub ships their MCP server as a container image)
//   - A GitHub Personal Access Token with repo read scope
//
// Run:
//   GITHUB_TOKEN=ghp_xxx node client.js usathish94/release-tracker
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repo = process.argv[2];
if (!repo) {
  console.error("Usage: GITHUB_TOKEN=... node client.js <owner/repo>");
  process.exit(1);
}
if (!process.env.GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var (needs repo read scope).");
  process.exit(1);
}

// This spawns GitHub's official MCP server in a container. It speaks MCP
// over stdio just like our own server in 02-own-mcp did — same protocol,
// different author.
const transport = new StdioClientTransport({
  command: "docker",
  args: [
    "run", "-i", "--rm",
    "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
    "ghcr.io/github/github-mcp-server",
  ],
  env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN },
});

const client = new Client({ name: "release-tracker-learning-client", version: "1.0.0" });
await client.connect(transport);

// 1. Discover what tools this external server offers — we didn't write any
//    of these, we're just asking it to describe itself (the same thing the
//    MCP Inspector did for our own server in folder 2).
const { tools } = await client.listTools();
console.log(`GitHub MCP server exposes ${tools.length} tools, e.g.:`);
console.log(tools.slice(0, 5).map((t) => `  - ${t.name}: ${t.description}`).join("\n"));

// 2. Call one of them: search open issues in the given repo.
const [owner, name] = repo.split("/");
const result = await client.callTool({
  name: "search_issues",
  arguments: { query: `repo:${owner}/${name} is:issue is:open` },
});

console.log("\nOpen issues:");
console.log(result.content.map((c) => c.text ?? "").join("\n"));

await client.close();
