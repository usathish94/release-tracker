# AI Engineering Concepts — Learning Samples

Four bite-sized examples, all built around the same made-up task so you can see
how the concepts relate instead of learning them in isolation:

> **Task:** "What's the live score of match #42?"

Each folder answers that question a different way, in increasing order of
how much infrastructure is involved.

| # | Folder | Concept | In one sentence |
|---|--------|---------|------------------|
| 1 | [01-custom-tool](01-custom-tool) | Custom tool | Give the model one JS function it can call, in-process, no protocol involved. |
| 2 | [02-own-mcp](02-own-mcp) | Your own MCP server | Wrap that same function in the Model Context Protocol so *any* MCP client (Claude Desktop, Claude Code, other agents) can use it, not just your own code. |
| 3 | [03-skill](03-skill/match-summary) | Skill | Teach Claude a *procedure* (markdown instructions), not a function — no code executes, Claude just follows the recipe. |
| 4 | [04-external-mcp](04-external-mcp) | Calling someone else's MCP | Instead of building #2 yourself, connect to an MCP server someone else already built and hosts (GitHub's). |

## Mental model / how they differ

- **Tool** = a function you wired up yourself, only usable inside your own app.
- **MCP server** = the same idea, but standardized so it's reusable across any
  MCP-speaking client — you're the one hosting/building it.
- **Skill** = no function at all. It's instructions (a `SKILL.md`) that tell
  Claude *how* to do a task using tools it already has. Think "runbook", not
  "API".
- **External MCP** = you consume someone else's server instead of writing #2.
  Same protocol as #2, but you're the client, not the author.

## Suggested order

Read them 1 → 4. Each README explains what to install and how to run it.
Nothing here talks to a real cricket API — it's all mocked so you can focus
on the concept, not on API keys.
