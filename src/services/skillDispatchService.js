import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { loadSkill } from './skillService.js';
import { pickSkill } from './skillRouter.js';

let anthropic;
function client() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot run skills.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

/** Picks the best-fitting skill for the input, then runs it against that same input. */
export async function runSkillForInput(input) {
  const skillName = await pickSkill(input);
  const skill = loadSkill(skillName);

  const response = await client().messages.create({
    model: env.claudeModel,
    max_tokens: 300,
    system: skill.instructions,
    messages: [{ role: 'user', content: input }],
  });

  return {
    skill: skillName,
    reply: response.content.find((block) => block.type === 'text')?.text ?? null,
  };
}
