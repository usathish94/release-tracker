# 4. Calling an External MCP (GitHub)

Folder 2 made you the *author* of an MCP server. Here you're purely a
**client** of one someone else built and maintains — GitHub's official
`github-mcp-server`. This is the most common real-world case: you rarely
build an MCP server for something that already has one (GitHub, Slack,
Google Drive, ...); you just point a client at it.

Two ways to do that, easiest first.

## Option A — the way you'd actually do it day-to-day: Claude Code config

No custom code needed at all. Register the server directly:

```bash
claude mcp add github --command docker \
  --args run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server \
  --env GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_token_here
```

(Or use GitHub's hosted remote endpoint instead of Docker — see
https://github.com/github/github-mcp-server for the current recommended
setup.) Once registered, just ask Claude Code things like "list open issues
in usathish94/release-tracker" — it calls GitHub's tools for you.

## Option B — `client.js` in this folder: see the protocol mechanics yourself

This script does by hand what Claude Code does for you in Option A:
connect → `listTools()` → `callTool()`. Useful once, to demystify what
"connecting to an MCP server" actually means under the hood (it's the exact
same JSON-RPC-over-stdio protocol as our own server in folder 2 — GitHub's
server just implements far more tools).

Dependency (`@modelcontextprotocol/sdk`) lives in the repo root
`package.json` — install once from the repo root:

```bash
npm install                                                       # from repo root
GITHUB_TOKEN=ghp_your_token_here node ai-learning/04-external-mcp/client.js usathish94/release-tracker
```

Requires Docker installed and a GitHub PAT with `repo` read scope.

> Want to see a client connect to *our own* MCP server instead of GitHub's?
> That's [src/services/assistantService.js](../../src/services/assistantService.js)
> — same `listTools()` / `callTool()` pattern, pointed at `/mcp` on this app.

## The throughline

Folders 1 → 4 are the same capability (query something, get structured data
back) delivered by four different mechanisms with increasing reuse:

1. Function only your code can call.
2. Function anyone's MCP client can call — because *you* stood up the server.
3. Instructions Claude follows, no server at all.
4. Function anyone's MCP client can call — because *someone else* stood up
   the server and you just connect to it.
