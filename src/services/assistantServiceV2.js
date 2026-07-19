import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

let anthropic;
function client() {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set; cannot run the assistant.');
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

// A tool is just two things: a schema Claude reads to decide whether/how to
// call it, and a local function that actually runs when it does. No MCP, no
// network hop - this is the simplest possible shape of "tool use".
const tools = [
  {
    name: 'get_current_time',
    description: 'Returns the current server date and time in ISO 8601 format.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_numbers',
    description: 'Adds two numbers together and returns the sum.',
    input_schema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      required: ['a', 'b'],
    },
  },
  // Server-side tool: Anthropic runs the search and injects the results
  // directly into the response content, so there's no handler below.
  { type: 'web_search_20250305', name: 'web_search' },
];

// The real implementation behind each tool name above. Claude never sees this
// code - it only sees the schema, and gets back whatever string each handler
// returns.
const toolHandlers = {
  get_current_time: () => new Date().toISOString(),
  add_numbers: ({ a, b }) => String(a + b),
};

export async function chatWithToolsV2(message) {
  const messages = [{ role: 'user', content: message }];
  const toolCalls = [];

  let response = await client().messages.create({
    model: env.claudeModel,
    max_tokens: 1024,
    tools,
    messages,
  });

  // Keep resolving tool calls until Claude is ready to answer in plain text.
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });

    const toolResults = toolUseBlocks.map((toolUse) => {
      const result = toolHandlers[toolUse.name](toolUse.input);
      toolCalls.push({ name: toolUse.name, input: toolUse.input, result });
      return { type: 'tool_result', tool_use_id: toolUse.id, content: result };
    });
    messages.push({ role: 'user', content: toolResults });

    response = await client().messages.create({
      model: env.claudeModel,
      max_tokens: 1024,
      tools,
      messages,
    });
  }

  const reply = response.content.find((block) => block.type === 'text')?.text ?? '';
  return { reply, toolCalls };
}
