// CONCEPT: a "custom tool" is just a function you describe to the model in
// JSON Schema, plus the JS function that actually runs it. There's no
// protocol, no server — you own both sides of the wire.
//
// Run:  npm install && ANTHROPIC_API_KEY=sk-... node index.js
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// ---- 1. The actual function. In a real app this would call your DB / API ----
const MOCK_MATCHES = {
  42: { teams: "India vs Australia", score: "287/4", overs: "45.2", status: "live" },
};

function getLiveScore({ matchId }) {
  const match = MOCK_MATCHES[matchId];
  if (!match) return { error: `No match found with id ${matchId}` };
  return match;
}

// ---- 2. Describe that function to the model as a "tool" ----
const tools = [
  {
    name: "get_live_score",
    description: "Get the live score for a cricket match by its match id.",
    input_schema: {
      type: "object",
      properties: {
        matchId: { type: "number", description: "The match id, e.g. 42" },
      },
      required: ["matchId"],
    },
  },
];

async function main() {
  const messages = [{ role: "user", content: "What's the score of match 42?" }];

  // First call: the model decides whether it needs the tool.
  let response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools,
    messages,
  });

  // The model replies with a tool_use block instead of (or alongside) text.
  const toolUse = response.content.find((block) => block.type === "tool_use");

  if (toolUse) {
    console.log(`Model wants to call: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

    const result = getLiveScore(toolUse.input); // we execute it locally

    // Send the tool's result back so the model can turn it into an answer.
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        },
      ],
    });

    response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  const finalText = response.content.find((b) => b.type === "text")?.text;
  console.log("\nFinal answer:\n" + finalText);
}

main();
