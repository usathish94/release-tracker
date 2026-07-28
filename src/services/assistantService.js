import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { env } from "../config/env.js";
import { withTelemetry } from "../lib/telemetry.js";
import { buildBoundedMessages } from "../lib/context.js";

let anthropic;
function anthropicClient() {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set; cannot run the assistant.");
  }
  anthropic ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return anthropic;
}

// Stable across every request, so this is what the prompt-cache breakpoint
// below actually caches - only the trailing user turn varies per call.
const SYSTEM_PROMPT = [
  "You are the release-tracker assistant. You can answer any question the user asks.",
  "For questions about cricket matches, scores, or tournaments, use the list_matches / get_match tools.",
  "For cricket rules questions (LBW, DLS, follow-on, powerplay, super over, no-ball), use the",
  "explain_cricket_rule tool rather than answering from general knowledge.",
  "For anything else, use web_search.",
  "broadcast_webhook_test sends real webhook deliveries to third-party URLs - only call it when",
  "the user has explicitly asked for a test broadcast.",
].join(" ");

// Tools whose handler has a real-world side effect. This app never
// auto-executes them - see the requiresApproval branch in chatWithTools()
// below, which hands the pending call back to the caller instead of running
// it, and only executes on the follow-up request once `approvals` says yes.
const TOOLS_REQUIRING_APPROVAL = new Set(["broadcast_webhook_test"]);

/** Converts an MCP tool's schema into the shape the Anthropic Messages API expects. */
function toAnthropicTool(mcpTool) {
  return {
    name: mcpTool.name,
    description: mcpTool.description,
    input_schema: mcpTool.inputSchema,
  };
}

async function runMcpTool(mcp, toolUse) {
  try {
    const result = await mcp.callTool({ name: toolUse.name, arguments: toolUse.input });
    return { content: result.content, isError: result.isError ?? false };
  } catch (err) {
    return { content: [{ type: "text", text: err.message }], isError: true };
  }
}

/**
 * Answers one user turn, letting Claude call tools executed by this app's
 * own MCP server (mounted at env.mcpServerUrl).
 *
 * Three request shapes:
 *  - `{ message }` - fresh conversation.
 *  - `{ message, history }` - fresh turn in an existing conversation; `history`
 *    is the prior [{role, content}, ...] turns, trimmed to a token budget.
 *  - `{ conversationState, approvals }` - resumes a turn that stopped on
 *    `requiresApproval`; `approvals` is `{ [toolUseId]: boolean }`.
 *
 * Returns either `{ reply, toolCalls }` or, if Claude wants to call a
 * sensitive tool, `{ requiresApproval: true, pendingApprovals, conversationState }`
 * - the caller must round-trip `conversationState` back with `approvals` to
 * continue. This app is otherwise fully stateless (see src/mcp/matchMcpServer.js's
 * "one server+transport per request" comment), so approval state is carried
 * by the client rather than a server-side session store.
 */
export async function chatWithTools({ message, history, conversationState, approvals } = {}) {
  const transport = new StreamableHTTPClientTransport(
    new URL(env.mcpServerUrl),
  );
  const mcp = new Client({
    name: "release-tracker-assistant",
    version: "1.0.0",
  });
  await mcp.connect(transport);

  try {
    const { tools: mcpTools } = await mcp.listTools();
    const tools = [...mcpTools.map(toAnthropicTool), { type: "web_search_20250305", name: "web_search" }];
    const client = withTelemetry(anthropicClient());
    const toolCalls = [];

    let messages = conversationState
      ? [...conversationState]
      : await buildBoundedMessages(anthropicClient(), {
          model: env.claudeModel,
          system: SYSTEM_PROMPT,
          history,
          newMessage: message,
        });

    // Resuming after a human decision: the last assistant message (echoed
    // back to us as part of conversationState) still holds the tool_use
    // blocks that were pending approval.
    if (approvals) {
      const pendingToolUses = messages[messages.length - 1].content.filter(
        (block) => block.type === "tool_use",
      );
      const toolResults = [];
      for (const toolUse of pendingToolUses) {
        if (approvals[toolUse.id] !== true) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              "Denied by human operator. Do not retry this action; ask the user what they'd like instead.",
            is_error: true,
          });
          continue;
        }
        const { content, isError } = await runMcpTool(mcp, toolUse);
        toolCalls.push({ name: toolUse.name, input: toolUse.input });
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content, is_error: isError });
      }
      messages = [...messages, { role: "user", content: toolResults }];
    }

    const systemParam = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

    let response = await client.create(
      { model: env.claudeModel, max_tokens: 1024, system: systemParam, tools, messages },
      { route: "assistant-chat" },
    );

    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");
      const pending = toolUseBlocks.filter((block) => TOOLS_REQUIRING_APPROVAL.has(block.name));

      if (pending.length > 0) {
        return {
          requiresApproval: true,
          pendingApprovals: pending.map((block) => ({ id: block.id, name: block.name, input: block.input })),
          conversationState: [...messages, { role: "assistant", content: response.content }],
        };
      }

      messages.push({ role: "assistant", content: response.content });
      const toolResults = [];
      for (const toolUse of toolUseBlocks) {
        const { content, isError } = await runMcpTool(mcp, toolUse);
        toolCalls.push({ name: toolUse.name, input: toolUse.input });
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content, is_error: isError });
      }
      messages.push({ role: "user", content: toolResults });

      response = await client.create(
        { model: env.claudeModel, max_tokens: 1024, system: systemParam, tools, messages },
        { route: "assistant-chat" },
      );
    }

    const reply =
      response.content.find((block) => block.type === "text")?.text ?? "";
    return { reply, toolCalls };
  } finally {
    await mcp.close();
  }
}
