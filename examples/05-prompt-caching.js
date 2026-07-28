// Run: node examples/05-prompt-caching.js
//
// Prompt caching: a large, stable system prompt gets written to cache once
// and read (at ~10% of the price) on every later request with the same
// prefix. Note the minimum cacheable prefix is model-dependent — Haiku 4.5
// needs ~4096 tokens; a prompt shorter than that silently never caches (no
// error, cache_creation_input_tokens just stays 0). The style guide below is
// padded past that threshold so the effect is actually visible.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../src/config/env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

// Haiku 4.5's minimum cacheable prefix is ~4096 tokens (see
// shared/prompt-caching.md's per-model table) — a shorter prompt like the
// bare skill instructions in examples/03 silently never caches. 100 rules of
// this length comfortably clears that bar with margin.
const STYLE_RULES = Array.from(
  { length: 100 },
  (_, i) =>
    `Rule ${i + 1}: when describing a match situation of type ${i}, favor active verbs ` +
    `("races to", "collapses to", "cruises past") over passive ones, keep the run rate or ` +
    `required rate visible whenever overs are known, never speculate about outcomes the ` +
    `numbers don't support, avoid inventing player names or venues that were not supplied in ` +
    `the input JSON, and prefer short punchy clauses over long compound sentences so the ` +
    `summary reads like something said out loud rather than something written down.`,
).join("\n");

const SYSTEM_PROMPT =
  `You are the release-tracker cricket commentary assistant. Follow this house style guide ` +
  `precisely.\n\n${STYLE_RULES}`;

async function callWithCache(matchJson) {
  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 200,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: matchJson }],
  });
  return response.usage;
}

const usage1 = await callWithCache(JSON.stringify({ teams: "India vs Australia", score: "287/4", status: "live" }));
console.log("Call 1 (cold):", usage1);

const usage2 = await callWithCache(JSON.stringify({ teams: "England vs Pakistan", score: "150/9", status: "live" }));
console.log("Call 2 (should hit cache):", usage2);

if (usage2.cache_read_input_tokens > 0) {
  console.log(`\nCache hit: read ${usage2.cache_read_input_tokens} tokens at ~10% of the normal input price.`);
} else {
  console.log("\nNo cache hit — check the prompt is above the model's minimum cacheable prefix, " +
    "and that the two calls ran within the cache TTL (default 5 minutes).");
}
