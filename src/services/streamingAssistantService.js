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

// Models on the 4.6+ tier take adaptive thinking + the dynamic-filtering web
// search tool; anything older (e.g. the haiku-4-5 default) needs a fixed
// thinking budget and the basic web search tool version.
const ADAPTIVE_MODEL_PATTERN = /claude-(opus-4-[678]|sonnet-4-6|sonnet-5|fable-5|mythos-5)/;

function getModelCapabilities(model) {
  if (ADAPTIVE_MODEL_PATTERN.test(model)) {
    return {
      maxTokens: 16000,
      thinking: { type: 'adaptive', display: 'summarized' },
      outputConfig: { effort: 'medium' },
      webSearchTool: { type: 'web_search_20260209', name: 'web_search' },
    };
  }
  return {
    maxTokens: 8192,
    thinking: { type: 'enabled', budget_tokens: 4096 },
    outputConfig: null,
    webSearchTool: { type: 'web_search_20250305', name: 'web_search' },
  };
}

const SYSTEM_PROMPT = [
  'You are the release-tracker assistant. You can answer any question the user asks.',
  'For questions about cricket matches, scores, or tournaments, prefer the list_matches / get_match tools',
  '(this app\'s own tracked match data) over general web search.',
  'For anything else - general knowledge, current events, or topics the cricket tools do not cover - use web_search.',
].join(' ');

/** Converts an MCP tool's schema into the shape the Anthropic Messages API expects. */
function toAnthropicTool(mcpTool) {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    input_schema: mcpTool.inputSchema,
  };
}

/** Reduces a (possibly large) web_search_tool_result block into something small enough to show the user. */
function summarizeWebSearchResult(block) {
  const content = block.content;
  if (!Array.isArray(content)) {
    // Error shape: { type: 'web_search_tool_result_error', error_code: '...' }
    return { error: content?.error_code ?? 'web_search_failed' };
  }
  return content.map((result) => ({ title: result.title, url: result.url }));
}

/**
 * Streams one user turn to Claude over SSE. Every thinking delta, tool call,
 * and tool result is forwarded to `sse` as it happens (via `sse.send(event,
 * data)`) so a client can render the agent's reasoning live, not just the
 * final answer. Cricket-match tool calls are resolved against this app's own
 * MCP server (see src/mcp/matchMcpServer.js); everything else Claude can
 * reach for web_search, which Anthropic executes server-side.
 */
export async function streamChat(message, sse, { signal } = {}) {
  const transport = new StreamableHTTPClientTransport(new URL(env.mcpServerUrl));
  const mcp = new Client({ name: 'release-tracker-assistant', version: '1.0.0' });

  try {
    await mcp.connect(transport);

    const { tools: mcpTools } = await mcp.listTools();
    const mcpToolNames = new Set(mcpTools.map((tool) => tool.name));
    const caps = getModelCapabilities(env.claudeModel);
    const tools = [...mcpTools.map(toAnthropicTool), caps.webSearchTool];

    const messages = [{ role: 'user', content: message }];

    let keepGoing = true;
    while (keepGoing) {
      if (signal?.aborted) return;

      const stream = anthropicClient().messages.stream({
        model: env.claudeModel,
        max_tokens: caps.maxTokens,
        system: SYSTEM_PROMPT,
        thinking: caps.thinking,
        ...(caps.outputConfig ? { output_config: caps.outputConfig } : {}),
        tools,
        messages,
      });

      const onAbort = () => stream.controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });

      stream.on('thinking', (delta) => sse.send('thinking', { delta }));
      stream.on('text', (delta) => sse.send('text', { delta }));
      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          sse.send('tool_call', {
            id: block.id,
            name: block.name,
            input: block.input,
            source: mcpToolNames.has(block.name) ? 'mcp' : 'custom',
          });
        } else if (block.type === 'server_tool_use') {
          sse.send('tool_call', { id: block.id, name: block.name, input: block.input, source: 'web_search' });
        } else if (block.type === 'web_search_tool_result') {
          sse.send('tool_result', {
            id: block.tool_use_id,
            name: 'web_search',
            source: 'web_search',
            result: summarizeWebSearchResult(block),
          });
        }
      });

      let finalMessage;
      try {
        finalMessage = await stream.finalMessage();
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }

      messages.push({ role: 'assistant', content: finalMessage.content });

      if (finalMessage.stop_reason === 'tool_use') {
        const toolUseBlocks = finalMessage.content.filter((block) => block.type === 'tool_use');
        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          let result;
          let isError = false;
          try {
            const mcpResult = await mcp.callTool({ name: toolUse.name, arguments: toolUse.input });
            result = mcpResult.content;
            isError = mcpResult.isError ?? false;
          } catch (err) {
            result = [{ type: 'text', text: err.message }];
            isError = true;
          }
          sse.send('tool_result', { id: toolUse.id, name: toolUse.name, source: 'mcp', result, isError });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result, is_error: isError });
        }
        messages.push({ role: 'user', content: toolResults });
      } else {
        keepGoing = false;
      }
    }

    sse.send('done', {});
  } catch (err) {
    sse.send('error', { message: err.message });
  } finally {
    await mcp.close().catch(() => {});
  }
}
