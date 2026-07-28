import { Router } from 'express';
import { chatWithTools } from '../services/assistantService.js';
import { chatWithToolsV2 } from '../services/assistantServiceV2.js';
import { streamChat } from '../services/streamingAssistantService.js';
import { createSseWriter } from '../utils/sse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const assistantRouter = Router();

// Body is one of:
//  - { message }                       - fresh conversation
//  - { message, history }              - fresh turn in an existing conversation
//  - { conversationState, approvals }  - resumes a turn that came back with
//    requiresApproval: true (e.g. from broadcast_webhook_test); approvals is
//    { [toolUseId]: true|false }, keyed by the ids in that response's
//    pendingApprovals. Response is either { reply, toolCalls } or
//    { requiresApproval: true, pendingApprovals, conversationState }.
assistantRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, history, conversationState, approvals } = req.body;
    if (!conversationState && (!message || typeof message !== 'string')) {
      return res.status(400).json({ error: 'Body must include a "message" string.' });
    }
    const result = await chatWithTools({ message, history, conversationState, approvals });
    res.json(result);
  })
);

// v2: same tool-use loop as /chat, but tools are plain local functions
// instead of MCP calls - see assistantServiceV2.js for the minimal version.
assistantRouter.post(
  '/v2/chat',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Body must include a "message" string.' });
    }
    const { reply, toolCalls } = await chatWithToolsV2(message);
    res.json({ reply, toolCalls });
  })
);

// Streaming (SSE) chat: same MCP + web_search tool-use loop as /chat, but
// pushes thinking deltas, tool calls, tool results, and answer text to the
// client live as events instead of waiting for one final JSON reply.
// Event types: thinking, text, tool_call, tool_result, done, error.
assistantRouter.post(
  '/stream',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Body must include a "message" string.' });
    }

    const sse = createSseWriter(res);
    const controller = new AbortController();
    // res.on('close'), not req.on('close') - the request's 'close' event fires
    // as soon as its body has been fully read (i.e. almost immediately), not
    // when the client actually disconnects. The response only closes early
    // when the underlying connection really does drop.
    res.on('close', () => controller.abort());

    await streamChat(message, sse, { signal: controller.signal });
    sse.close();
  })
);
