// Run: node examples/04-context-engineering.js
//
// Context engineering: deciding what actually goes into the context window,
// not just stuffing in everything available. Here: a growing chat history
// is kept under a token budget by dropping the oldest turns first and
// replacing them with a one-line marker, instead of silently truncating mid
// conversation or blowing the budget and erroring.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../src/config/env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const SYSTEM_PROMPT =
  "You are the release-tracker assistant. Answer questions about tracked cricket matches concisely.";

/**
 * Trims `history` so system + history + newMessage fits under maxTokens,
 * dropping the oldest turns first. Returns the messages array to send.
 */
async function buildContext(history, newUserMessage, { maxTokens = 1000 } = {}) {
  let trimmed = [...history];
  let droppedCount = 0;

  while (true) {
    const candidateMessages = [
      ...(droppedCount > 0
        ? [{ role: "user", content: `[${droppedCount} earlier turn(s) omitted for length]` }]
        : []),
      ...trimmed,
      { role: "user", content: newUserMessage },
    ];

    const { input_tokens } = await anthropic.messages.countTokens({
      model: env.claudeModel,
      system: SYSTEM_PROMPT,
      messages: candidateMessages,
    });

    if (input_tokens <= maxTokens || trimmed.length === 0) {
      console.log(`Context: ${input_tokens} tokens, ${droppedCount} turn(s) dropped`);
      return candidateMessages;
    }

    trimmed = trimmed.slice(2); // drop oldest user+assistant pair
    droppedCount++;
  }
}

// Synthetic long history — in a real app this comes from a DB or session store.
const longHistory = Array.from({ length: 30 }, (_, i) => [
  { role: "user", content: `Question ${i}: what's the status of match ${i}?` },
  { role: "assistant", content: `Match ${i} is currently live at ${i * 10}/2.` },
]).flat();

const messages = await buildContext(longHistory, "Summarize everything we discussed.", {
  maxTokens: 800,
});

const response = await anthropic.messages.create({
  model: env.claudeModel,
  max_tokens: 300,
  system: SYSTEM_PROMPT,
  messages,
});
console.log(response.content.find((b) => b.type === "text")?.text);
