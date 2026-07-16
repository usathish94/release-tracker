import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { env } from '../config/env.js';

let anthropic;
function anthropicClient() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot run the assistant.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

/** Converts an MCP tool's schema into the shape the Anthropic Messages API expects. */
function toAnthropicTool(mcpTool) {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    input_schema: mcpTool.inputSchema,
  };
}

/**
 * Answers one user message, letting Claude call tools that are actually
 * executed by this app's own MCP server (mounted at env.mcpServerUrl) rather
 * than by a local function — the client/server split is real, just both
 * halves happen to live in this repo.
 */
export async function chatWithTools(message) {
  const transport = new StreamableHTTPClientTransport(new URL(env.mcpServerUrl));
  const mcp = new Client({ name: 'release-tracker-assistant', version: '1.0.0' });
  await mcp.connect(transport);

  try {
    const { tools: mcpTools } = await mcp.listTools();
    const tools = mcpTools.map(toAnthropicTool);
    const messages = [{ role: 'user', content: message }];
    const toolCalls = [];

    let response = await anthropicClient().messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      tools,
      messages,
    });

    // Keep resolving tool calls until Claude is ready to answer in plain text.
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const result = await mcp.callTool({ name: toolUse.name, arguments: toolUse.input });
        toolCalls.push({ name: toolUse.name, input: toolUse.input });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.content,
          is_error: result.isError ?? false,
        });
      }
      messages.push({ role: 'user', content: toolResults });

      response = await anthropicClient().messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        tools,
        messages,
      });
    }

    const reply = response.content.find((block) => block.type === 'text')?.text ?? '';
    return { reply, toolCalls };
  } finally {
    await mcp.close();
  }
}
