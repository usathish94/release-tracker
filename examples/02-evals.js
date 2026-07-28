// Run: node examples/02-evals.js
//
// Evals: run the match-summary skill against a fixed dataset and grade every
// output two ways — cheap deterministic checks (rule-based) for things code
// can verify exactly, and an LLM-as-judge pass for things only a reader can
// judge (does this actually sound "energetic"?). Ship this in CI so a prompt
// edit that regresses quality fails the build instead of shipping silently.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { loadSkill } from "../src/services/skillService.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
const skill = loadSkill("match-summary");

const dataset = readFileSync(
  new URL("../src/skills/match-summary/sample-dataset.jsonl", import.meta.url),
  "utf-8",
)
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

// Deterministic checks — no model call, so they're free and exact.
function ruleBasedChecks(input, output) {
  const failures = [];
  const sentenceCount = (output.match(/[.!?]+(\s|$)/g) || []).length;
  if (sentenceCount !== 2) {
    failures.push(`expected 2 sentences, counted ${sentenceCount}`);
  }
  if (
    input.score == null &&
    !/no score|not available|unavailable|hasn't|haven't|coming soon|waiting|yet\b|any moment|come through|check back/i.test(
      output,
    )
  ) {
    failures.push("score was null but output doesn't acknowledge missing data");
  }
  if (input.status === "upcoming" && /\d+\/\d+/.test(output)) {
    failures.push("status is upcoming but output contains a fabricated score");
  }
  return failures;
}

const JudgeResult = z.object({
  sounds_energetic: z.boolean(),
  grounded_in_input: z.boolean(),
  reasoning: z.string(),
});

// Judgment calls a rule can't make cheaply — delegate to the model, but keep
// the criteria narrow and the output schema-constrained so it's gradeable.
async function llmJudge(input, output) {
  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 300,
    system:
      "You are grading a cricket match summary against two criteria. Be strict: " +
      "'sounds_energetic' is true only if the phrasing has real broadcaster energy " +
      "(not just stating facts flatly). 'grounded_in_input' is false if the summary " +
      "states any number, name, or detail not present in the input JSON.",
    messages: [
      {
        role: "user",
        content: `Input: ${JSON.stringify(input)}\n\nSummary: ${output}`,
      },
    ],
    output_config: { format: zodOutputFormat(JudgeResult) },
  });
  return JSON.parse(response.content.find((b) => b.type === "text").text);
}

let passed = 0;
for (const { input } of dataset) {
  const response = await anthropic.messages.create({
    model: env.claudeModel,
    max_tokens: 300,
    system: skill.instructions,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  const output = response.content.find((b) => b.type === "text")?.text ?? "";

  const ruleFailures = ruleBasedChecks(input, output);
  const judged = await llmJudge(input, output);

  const ok = ruleFailures.length === 0 && judged.sounds_energetic && judged.grounded_in_input;
  passed += ok ? 1 : 0;

  console.log(`\n[${ok ? "PASS" : "FAIL"}] ${JSON.stringify(input)}`);
  console.log(`  output: ${output}`);
  if (ruleFailures.length) console.log(`  rule failures: ${ruleFailures.join("; ")}`);
  if (!judged.sounds_energetic || !judged.grounded_in_input) {
    console.log(`  judge: ${judged.reasoning}`);
  }
}

console.log(`\n${passed}/${dataset.length} passed`);
process.exitCode = passed === dataset.length ? 0 : 1;
