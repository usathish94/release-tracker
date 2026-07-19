import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { listSkills } from './skillService.js';

let anthropic;
function client() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot route skills.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

/**
 * Asks Claude which registered skill best fits the request. Only sends each
 * skill's name + description (not its full instructions) to keep this cheap
 * regardless of how many skills exist. Forces a tool call so the answer is
 * always one of the actual registered skill names, never free-form text.
 */
export async function pickSkill(userMessage) {
  const skills = listSkills();
  if (skills.length === 0) {
    throw new Error('No skills registered under src/skills');
  }

  const response = await client().messages.create({
    model: env.claudeModel,
    max_tokens: 200,
    system: [
      'Choose the single best-fitting skill for the request below.',
      ...skills.map((skill) => `- ${skill.name}: ${skill.description}`),
    ].join('\n'),
    messages: [{ role: 'user', content: userMessage }],
    tools: [
      {
        name: 'select_skill',
        description: 'Record which skill should be used to handle this request.',
        input_schema: {
          type: 'object',
          properties: {
            skill: { type: 'string', enum: skills.map((skill) => skill.name) },
          },
          required: ['skill'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'select_skill' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  return toolUse?.input?.skill ?? null;
}
