import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const telegramRouter = Router();

telegramRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (env.telegramWebhookSecret) {
      const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
      if (receivedSecret !== env.telegramWebhookSecret) {
        return res.sendStatus(401);
      }
    }

    const post = req.body?.channel_post || req.body?.message;

    console.log(JSON.stringify(post))

    if (post && (!env.telegramChannelId || String(post.chat?.id) === String(env.telegramChannelId))) {
      console.log(`[telegram] ${post.chat?.title || post.chat?.id}: ${post.text || '(non-text message)'}`);
    }

    res.sendStatus(200);
  })
);
