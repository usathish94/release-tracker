import axios from 'axios';
import { env } from '../config/env.js';

export async function notifyTelegram(text) {
  if (!env.telegramBotToken || !env.telegramChannelId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
      chat_id: env.telegramChannelId,
      text,
    });
  } catch (err) {
    console.error('Failed to notify Telegram:', err.message);
  }
}
