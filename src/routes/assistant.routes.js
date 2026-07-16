import { Router } from 'express';
import { chatWithTools } from '../services/assistantService.js';
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
