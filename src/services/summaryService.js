import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { getMatch } from './matchService.js';
import { loadSkill } from './skillService.js';
import { withTelemetry } from '../lib/telemetry.js';

let anthropic;
function client() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot generate summaries.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

/** Applies the match-summary skill to one tracked match's current data. */
export async function summarizeMatch(matchId) {
  const match = await getMatch(matchId);
  if (!match) return null;

  const skill = loadSkill('match-summary');
  const matchJson = JSON.stringify({
    teams: `${match.team1} vs ${match.team2}`,
    score: match.team1_score || match.team2_score || null,
    status: match.status,
  });

  // cache_control on the skill instructions pays off once this skill (or the
  // model) grows past the per-model minimum cacheable prefix (~1-4K tokens
  // depending on model - see shared/prompt-caching.md); harmless no-op below it.
  const response = await withTelemetry(client()).create(
    {
      model: env.claudeModel,
      max_tokens: 300,
      system: [{ type: 'text', text: skill.instructions, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: matchJson }],
    },
    { route: 'match-summary' }
  );

  return response.content.find((block) => block.type === 'text')?.text ?? null;
}
