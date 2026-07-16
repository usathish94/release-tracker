import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { getMatch } from './matchService.js';
import { loadSkill } from './skillService.js';

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

  const response = await client().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: skill.instructions,
    messages: [{ role: 'user', content: matchJson }],
  });

  return response.content.find((block) => block.type === 'text')?.text ?? null;
}
