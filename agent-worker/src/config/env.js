import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT || 4100),
  agentWorkerSecret: required('AGENT_WORKER_SECRET'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  githubToken: required('GITHUB_DISPATCH_TOKEN'),
  githubRepo: required('GITHUB_REPO'),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || null,
};
