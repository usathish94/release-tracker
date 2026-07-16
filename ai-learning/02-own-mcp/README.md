# 2. Your Own MCP Server

Takes the exact same idea as the custom tool, but instead of wiring the
function into one script, you expose it over the **Model Context Protocol**
— a standard way for any client to ask "what tools do you have?" and "run
this one for me". This is what turns a private function into something
Claude Desktop, Claude Code, or someone else's agent can plug into.

The server here talks over **stdio** (the simplest MCP transport): the client
spawns `node server.js` as a subprocess and exchanges JSON-RPC messages over
its stdin/stdout. No ports, no auth needed for this local example.

## Try it with the MCP Inspector (quickest way to see it work)

Dependencies (`@modelcontextprotocol/sdk`, `zod`) live in the repo root
`package.json` — install once from the repo root:

```bash
npm install                                            # from repo root
npx @modelcontextprotocol/inspector node ai-learning/02-own-mcp/server.js
```

> This is the toy, mock-data version, kept as-is for learning. The real
> version wired to actual match data is mounted in the running app at
> `/mcp` — see [src/mcp](../../src/mcp).

This opens a web UI where you can click "List Tools", see `get_live_score`
show up with its schema, and call it with `{"matchId": 42}` to see the JSON
result — all without writing any client code.

## Register it in Claude Code

Add to this project's `.mcp.json` (create it at the repo root if it doesn't
exist). Root `npm install` must be run first so `node_modules` exists for
this script to resolve `@modelcontextprotocol/sdk` from:

```json
{
  "mcpServers": {
    "cricket-score": {
      "command": "node",
      "args": ["ai-learning/02-own-mcp/server.js"]
    }
  }
}
```

Restart Claude Code and ask "what's the score of match 42?" — it will now
call your local server instead of you having to write any client-side
tool-calling loop like in folder 1.
