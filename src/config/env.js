import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const useLocalDb = (process.env.USE_LOCAL_DB || 'false').toLowerCase() === 'true';

export const env = {
  port: Number(process.env.PORT || 4000),
  cricketApiKey: required('CRICKET_API_KEY'),
  useLocalDb,
  databaseUrl: useLocalDb ? required('LOCAL_DATABASE_URL') : required('DATABASE_URL'),
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES || 20),
  matchDetailTtlMinutes: Number(process.env.MATCH_DETAIL_TTL_MINUTES || 3),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || null,
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  // Where the assistant endpoint connects to reach this app's own MCP server.
  // Defaults to itself, since the MCP endpoint lives in this same process.
  mcpServerUrl: process.env.MCP_SERVER_URL || `http://localhost:${process.env.PORT || 4000}/mcp`,
};
