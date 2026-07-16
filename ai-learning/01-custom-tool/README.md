# 1. Custom Tool

The simplest building block. You describe a function to the model (name,
description, JSON-schema input) via the `tools` param on a Messages API call.
When the model wants to use it, it doesn't run any code itself — it just
replies with a `tool_use` block saying "call `get_live_score({matchId: 42})`".
**Your** code executes the real function and sends the result back in a
second API call.

Key point: this only works inside *this* process. If you wanted Claude
Desktop, or a teammate's agent, to reuse `get_live_score`, they'd have to
reimplement it — that's the problem MCP (next folder) solves.

## Run it

Dependencies (`@anthropic-ai/sdk`) live in the repo root `package.json`, not
in this folder — install once from the repo root:

```bash
npm install                                   # from repo root
ANTHROPIC_API_KEY=sk-ant-... node ai-learning/01-custom-tool/index.js
```

Expected flow in the console:

1. `Model wants to call: get_live_score({"matchId":42})`
2. `Final answer: India vs Australia are 287/4 after 45.2 overs...`
