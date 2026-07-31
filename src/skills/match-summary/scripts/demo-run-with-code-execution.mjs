// Run: node src/skills/match-summary/scripts/demo-run-with-code-execution.mjs
//
// Learning demo: how script execution actually happens in a Claude Skill.
//
// The normal way this app loads match-summary (src/services/skillService.js
// -> summaryService.js) just reads SKILL.md as a string and drops it into
// `system:` on a plain messages.create() call. There is no sandbox, no
// filesystem, nothing to execute - "the skill" is just prompt text.
//
// Real Agent Skills are different: you upload a skill's files (SKILL.md plus
// any scripts/resources) to Anthropic via the Skills API, then reference it
// in a request that also enables the `code_execution` tool. Claude gets that
// skill's files inside an isolated sandboxed container (bash + Python 3.11 +
// common libs, pip install available) and can actually run the scripts you
// shipped - that's the mechanism this script demonstrates end to end:
//
//   1. Upload SKILL.md + scripts/run_rate.py as one custom Skill
//      (client.beta.skills.create - files must share one top-level dir and
//      include SKILL.md at its root).
//   2. Send a message referencing that skill via `container.skills`, with
//      the `code_execution` tool enabled.
//   3. Claude reads SKILL.md, decides to run scripts/run_rate.py per its
//      instructions, and the container executes it for real - pip install,
//      stdout, exit code and all. We print those raw execution blocks below
//      so you can see it happen, not just the final answer.
//   4. Delete the uploaded skill - this script re-uploads a fresh copy every
//      run, which is fine for learning but is NOT the pattern for real
//      usage: upload once, store the skill_id, reference it by id/version
//      afterward (same "create once, reference by id" rule as Managed
//      Agents - re-uploading per request just accumulates skill objects).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { env } from '../../../config/env.js';

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url)) + '/..';

async function uploadSkill() {
  const skillMd = readFileSync(path.join(SKILL_DIR, 'SKILL.md'));
  const script = readFileSync(path.join(SKILL_DIR, 'scripts/run_rate.py'));

  // "All files must be in the same top-level directory and must include a
  // SKILL.md file at the root of that directory" - the shared top-level
  // folder name is part of each file's path, not implicit from the request.
  const skill = await anthropic.beta.skills.create({
    display_title: 'match-summary (learning demo)',
    files: [
      await toFile(skillMd, 'match-summary/SKILL.md'),
      await toFile(script, 'match-summary/scripts/run_rate.py'),
    ],
  });
  console.log(`Uploaded skill ${skill.id} (source: ${skill.source}, version: ${skill.latest_version})`);
  return { id: skill.id, version: skill.latest_version };
}

async function runWithCodeExecution(skillId, matchJson) {
  const response = await anthropic.beta.messages.create({
    model: env.claudeModel,
    max_tokens: 4096,
    betas: ['skills-2025-10-02'],
    container: { skills: [{ type: 'custom', skill_id: skillId, version: 'latest' }] },
    tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
    messages: [{ role: 'user', content: matchJson }],
  });
  return response;
}

function printExecutionTrace(content) {
  for (const block of content) {
    if (block.type === 'text') {
      console.log('\n[text]', block.text);
    } else if (block.type === 'server_tool_use' && block.name === 'bash_code_execution') {
      console.log('\n[bash_code_execution request] command:', block.input.command);
    } else if (block.type === 'bash_code_execution_tool_result') {
      const result = block.content;
      if (result.type === 'bash_code_execution_tool_result_error') {
        console.log('[bash_code_execution result] error:', result.error_code);
        continue;
      }
      console.log('[bash_code_execution result] exit code:', result.return_code);
      if (result.stdout) console.log('  stdout:\n' + result.stdout.split('\n').map((l) => '    ' + l).join('\n'));
      if (result.stderr) console.log('  stderr:\n' + result.stderr.split('\n').map((l) => '    ' + l).join('\n'));
    }
  }
}

const skill = await uploadSkill();
try {
  const matchJson = JSON.stringify({
    teams: 'India vs Australia',
    score: '287/4',
    overs: '45.2',
    status: 'live',
    target: 350,
    total_overs: 50,
  });
  console.log('\nInput:', matchJson);

  const response = await runWithCodeExecution(skill.id, matchJson);
  printExecutionTrace(response.content);
} finally {
  // A skill can't be deleted while it still has versions - delete the
  // version(s) first, then the skill itself.
  await anthropic.beta.skills.versions.delete(skill.version, { skill_id: skill.id });
  await anthropic.beta.skills.delete(skill.id);
  console.log(`\nDeleted skill ${skill.id} (this demo re-uploads fresh each run - see the file header).`);
}
