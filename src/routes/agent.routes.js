import { Router } from 'express';
import axios from 'axios';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const agentRouter = Router();

agentRouter.post(
  '/request',
  asyncHandler(async (req, res) => {
    if (!env.agentTriggerSecret || req.get('X-Agent-Secret') !== env.agentTriggerSecret) {
      return res.sendStatus(401);
    }

    const { message } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    if (!env.agentWorkerUrl || !env.agentWorkerSecret) {
      return res.status(500).json({ error: 'Agent worker is not configured on this server' });
    }

    await axios.post(
      `${env.agentWorkerUrl}/run`,
      { message },
      { headers: { 'X-Worker-Secret': env.agentWorkerSecret } }
    );

    res.status(202).json({ status: 'queued' });
  })
);
