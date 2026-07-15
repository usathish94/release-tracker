import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { env } from '../config/env.js';
import { notifyTelegram } from './telegramNotifier.js';
import { runCommand } from '../utils/runCommand.js';

function summarizeAssistantContent(content) {
  if (!Array.isArray(content)) return [];
  const lines = [];
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      lines.push(block.text.slice(0, 400));
    } else if (block.type === 'tool_use') {
      lines.push(`Using tool: ${block.name}`);
    }
  }
  return lines;
}

export async function runAgentJob(message) {
  const workDir = await mkdtemp(path.join(tmpdir(), 'agent-'));

  try {
    await notifyTelegram(`Agent request received: "${message}"`);

    const cloneUrl = `https://x-access-token:${env.githubToken}@github.com/${env.githubRepo}.git`;
    await runCommand('git', ['clone', '--depth', '1', cloneUrl, workDir]);
    await runCommand('npm', ['install'], { cwd: workDir });

    await notifyTelegram('Repository ready. Starting analysis...');

    const conversation = query({
      prompt: `A user submitted this request for the ${env.githubRepo} repository: "${message}"

Analyze the codebase, implement the change (bug fix, feature, or anything else requested).
Run lint/build checks locally to verify your change compiles cleanly. Then use the GitHub MCP
tools (not raw git commands) to create a new branch, commit your changes, and open a pull
request against main describing what you did and why.`,
      options: {
        cwd: workDir,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: 30,
        disallowedTools: ['Bash(git *)'],
        mcpServers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: `Bearer ${env.githubToken}` },
          },
        },
      },
    });

    let finalResult = null;
    for await (const msg of conversation) {
      if (msg.type === 'assistant') {
        for (const line of summarizeAssistantContent(msg.message?.content)) {
          await notifyTelegram(line);
        }
      } else if (msg.type === 'result') {
        finalResult = msg;
      }
    }

    if (finalResult?.subtype === 'success') {
      await notifyTelegram(
        `Agent run finished successfully (turns: ${finalResult.num_turns}, cost: $${finalResult.total_cost_usd.toFixed(4)}). Check GitHub for the new PR: https://github.com/${env.githubRepo}/pulls`
      );
    } else if (finalResult) {
      await notifyTelegram(`Agent run ended without success (${finalResult.subtype}).`);
    } else {
      await notifyTelegram('Agent run ended without a final result message.');
    }
  } catch (err) {
    console.error('Agent job failed:', err);
    await notifyTelegram(`Agent run failed: ${err.message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
