// Run: node examples/03-observability.js
//
// Observability: wrap every Claude call in one place so latency, token
// usage, cache performance, and errors are logged as structured JSON lines —
// the shape a log aggregator (Datadog, CloudWatch, etc.) can query on. This
// is the difference between "the assistant felt slow yesterday" and being
// able to answer "p95 latency was 4.2s, driven by cache misses after 2pm."
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { env } from "../src/config/env.js";
import { loadSkill } from "../src/services/skillService.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

function logEvent(event) {
  // One JSON object per line (NDJSON) — greppable now, structured-parseable later.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}

/** Drop-in wrapper for anthropic.messages.create() that emits a structured log per call. */
async function instrumentedCreate(params, { route } = {}) {
  const requestId = randomUUID();
  const startedAt = performance.now();

  try {
    const response = await anthropic.messages.create(params);
    logEvent({
      event: "claude_request",
      request_id: requestId,
      route,
      model: response.model,
      status: "ok",
      duration_ms: Math.round(performance.now() - startedAt),
      stop_reason: response.stop_reason,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
    });
    return response;
  } catch (error) {
    logEvent({
      event: "claude_request",
      request_id: requestId,
      route,
      status: "error",
      duration_ms: Math.round(performance.now() - startedAt),
      error_type: error.constructor.name,
      error_message: error.message,
    });
    throw error;
  }
}

const skill = loadSkill("match-summary");
const match = { teams: "India vs Australia", score: "287/4", overs: "45.2", status: "live" };

// Two calls under the same route/model so cache behavior (2nd call should
// show cache_read_input_tokens > 0) is visible in the logs below.
for (let i = 0; i < 2; i++) {
  await instrumentedCreate(
    {
      model: env.claudeModel,
      max_tokens: 300,
      system: [{ type: "text", text: skill.instructions, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(match) }],
    },
    { route: "match-summary" },
  );
}

// The logged cache_*_input_tokens will likely both be 0 here: this skill's
// instructions are well under Haiku 4.5's ~4096-token minimum cacheable
// prefix, so nothing gets cached — and that's exactly the kind of thing this
// logging is meant to surface. See examples/05-prompt-caching.js for a
// system prompt padded past the threshold, where the second call shows a
// real cache_read_input_tokens hit.
console.log("\n(cache_*_input_tokens above are expected to be 0 — see the note in this file)");
