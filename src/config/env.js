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
  // Falls back rather than being left undefined: the Anthropic SDK's `model` field is
  // required, and an unset env var here previously surfaced as an opaque 500 from
  // /api/assistant/chat and /v2/chat ("model: Field required") instead of a clear error.
  claudeModel: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
  kafka: {
    // Empty brokers list means Kafka is disabled: publishing becomes a no-op
    // (logged) instead of a hard failure, so local/dev environments don't need one.
    brokers: (process.env.KAFKA_BROKERS || '')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
    clientId: process.env.KAFKA_CLIENT_ID || 'release-tracker',
    lighthouseTopic: process.env.KAFKA_LIGHTHOUSE_TOPIC || 'lighthouse.audit.events',
    // Plain unauthenticated broker (e.g. a local Docker Kafka for dev) needs none of these.
    // A hosted broker (Aiven, Confluent, etc.) sets KAFKA_SSL=true and, if it uses a private CA
    // rather than a publicly trusted one, either KAFKA_SSL_CA (inline PEM contents — handiest on
    // platforms like Render where pasting a multi-line env var is easier than shipping a file) or
    // KAFKA_SSL_CA_PATH (a file on disk — handiest for local dev). KAFKA_SSL_CA wins if both are set.
    ssl: (process.env.KAFKA_SSL || 'false').toLowerCase() === 'true',
    sslCa: process.env.KAFKA_SSL_CA || null,
    sslCaPath: process.env.KAFKA_SSL_CA_PATH || null,
    // Only set when the broker requires SASL auth (username/password) — omitted for a
    // plaintext local broker.
    sasl: process.env.KAFKA_SASL_USERNAME
      ? {
          mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
          username: process.env.KAFKA_SASL_USERNAME,
          password: process.env.KAFKA_SASL_PASSWORD || ''
        }
      : null
  }
};
