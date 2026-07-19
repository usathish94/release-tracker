import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

let anthropic;
function client() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot reach the Skills API.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

/**
 * Lists Skills you've uploaded via the Claude Console / Skills API for this
 * workspace. Unlike src/skills/*, these live on Anthropic's servers and run
 * inside their sandboxed code-execution container, not as a local system
 * prompt.
 */
export async function listCloudSkills() {
  const { data } = await client().beta.skills.list();
  return data.map((skill) => ({ id: skill.id, title: skill.display_title, version: skill.latest_version }));
}

/**
 * Runs a message against a specific cloud Skill by its skill_id (from
 * listCloudSkills). Requires the code_execution tool - Skills execute inside
 * that sandboxed container, they can't run without it.
 */
export async function chatWithCloudSkill(skillId, message) {
  const response = await client().beta.messages.create({
    model: env.claudeModel,
    max_tokens: 4096,
    betas: ['skills-2025-10-02'],
    container: {
      skills: [{ type: 'custom', skill_id: skillId, version: 'latest' }],
    },
    tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
    messages: [{ role: 'user', content: message }],
  });

  const reply = response.content.find((block) => block.type === 'text')?.text ?? '';
  return { reply, stopReason: response.stop_reason, raw: response.content };
}
