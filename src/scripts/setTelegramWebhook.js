import 'dotenv/config';
import axios from 'axios';

const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.env.RENDER_EXTERNAL_URL || process.argv[2];
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN');
}
if (!baseUrl) {
  throw new Error(
    'No public base URL found. Pass it as an argument: npm run telegram:set-webhook -- https://your-service.onrender.com'
  );
}

const { data } = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
  url: `${baseUrl}/api/telegram/webhook`,
  secret_token: secret || undefined,
  allowed_updates: ['channel_post', 'message'],
});

console.log(data);
