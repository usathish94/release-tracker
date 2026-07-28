// Run: node examples/01-human-in-the-loop.js
//
// Human-in-the-loop: Claude can call tools freely, but any tool with a side
// effect (sending real messages, changing subscriber state) pauses for a
// human "y/n" before it actually runs. Read-only tools execute immediately.
import Anthropic from "@anthropic-ai/sdk";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { env } from "../src/config/env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

// Plain `readline/promises` .question() closes as soon as piped stdin hits
// EOF, even if a question hasn't been asked yet — which breaks approval
// prompts that only fire once the model actually requests a sensitive tool.
// Buffering lines via the 'line' event sidesteps that, and works the same
// whether stdin is a real TTY or piped input (as in automated testing).
const rl = readline.createInterface({ input: stdin, output: stdout });
const bufferedLines = [];
const waitingResolvers = [];
rl.on("line", (line) => {
  if (waitingResolvers.length) waitingResolvers.shift()(line);
  else bufferedLines.push(line);
});
function nextLine() {
  if (bufferedLines.length) return Promise.resolve(bufferedLines.shift());
  return new Promise((resolve) => waitingResolvers.push(resolve));
}

const tools = [
  {
    name: "list_matches",
    description: "List currently tracked cricket matches.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "broadcast_webhook_test",
    description:
      "Send a test webhook payload to every subscriber for a match. This delivers a real HTTP request to third-party URLs.",
    input_schema: {
      type: "object",
      properties: { matchId: { type: "string" } },
      required: ["matchId"],
    },
  },
];

// Tools with real-world side effects. Anything not in this set is safe to
// auto-execute; anything in it stops the loop for human sign-off.
const REQUIRES_APPROVAL = new Set(["broadcast_webhook_test"]);

async function askHuman(toolUse) {
  stdout.write(
    `\nClaude wants to call "${toolUse.name}" with ${JSON.stringify(toolUse.input)}. Approve? [y/N] `,
  );
  const answer = await nextLine();
  return answer.trim().toLowerCase() === "y";
}

// Stand-ins for the real handlers (matchService.listMatches, the webhook
// dispatcher) — swapped out here so the example runs with no DB/network.
async function executeTool(toolUse) {
  if (toolUse.name === "list_matches") {
    return { matches: [{ id: "m1", teams: "India vs Australia", status: "live" }] };
  }
  if (toolUse.name === "broadcast_webhook_test") {
    return { delivered: 3, matchId: toolUse.input.matchId };
  }
  throw new Error(`Unknown tool: ${toolUse.name}`);
}

async function chat(userMessage) {
  const messages = [{ role: "user", content: userMessage }];

  let response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 1024,
    tools,
    messages,
  });

  while (response.stop_reason === "tool_use") {
    messages.push({ role: "assistant", content: response.content });
    const toolResults = [];

    for (const toolUse of response.content.filter((b) => b.type === "tool_use")) {
      if (REQUIRES_APPROVAL.has(toolUse.name) && !(await askHuman(toolUse))) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: "Denied by human operator. Do not retry this action; ask the user what they'd like instead.",
          is_error: true,
        });
        continue;
      }

      const result = await executeTool(toolUse);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults });
    response = await anthropic.messages.create({
      model: env.claudeModel,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  return response.content.find((b) => b.type === "text")?.text ?? "";
}

const reply = await chat(
  "Check what matches are live, then send a test webhook broadcast for the first one.",
);
console.log("\nFinal reply:", reply);
rl.close();
