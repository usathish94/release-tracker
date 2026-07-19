import { Router } from 'express';
import { chatWithTools } from '../services/assistantService.js';
import { chatWithToolsV2 } from '../services/assistantServiceV2.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const assistantRouter = Router();

assistantRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Body must include a "message" string.' });
    }
    const { reply, toolCalls } = await chatWithTools(message);
    res.json({ reply, toolCalls });
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
