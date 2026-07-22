import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { matchesRouter } from './routes/matches.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { telegramRouter } from './routes/telegram.routes.js';
import { mcpRouter } from './routes/mcp.routes.js';
import { assistantRouter } from './routes/assistant.routes.js';
import { cloudSkillsRouter } from './routes/cloudSkills.routes.js';
import { lighthouseRouter } from './routes/lighthouse.routes.js';
import { startPollingScheduler } from './services/pollingScheduler.js';
import { startLighthouseWorker } from './services/lighthouseWorker.js';
import { getLighthouseQueue } from './services/lighthouseQueue.js';
import { LighthouseQueueUnavailableError } from './services/lighthouseJobService.js';
import { disconnectRedis } from './services/redisConnection.js';
import { requireAdminBasicAuth } from './middleware/basicAuth.js';
import { createAdminDashboardRouter } from './adminDashboard.js';
import { disconnectKafkaProducer } from './services/kafkaProducer.js';
import { startLighthouseEventConsumer, disconnectKafkaConsumer } from './services/kafkaConsumer.js';

const app = express();

app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/telegram', telegramRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/cloud-skills', cloudSkillsRouter);
app.use('/api/lighthouse', lighthouseRouter);
app.use('/mcp', mcpRouter);

if (env.admin.username && env.admin.password) {
  const adminDashboardRouter = createAdminDashboardRouter();
  if (adminDashboardRouter) {
    app.use('/admin/queues', requireAdminBasicAuth, adminDashboardRouter);
  } else {
    console.warn('[admin] REDIS_URL not configured, /admin/queues disabled');
  }
} else {
  console.warn('[admin] ADMIN_USERNAME/ADMIN_PASSWORD not set, /admin/queues disabled');
}

app.use((err, req, res, _next) => {
  if (err instanceof LighthouseQueueUnavailableError) {
    return res.status(503).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

let lighthouseWorker;
const server = app.listen(env.port, () => {
  console.log(`release-tracker API listening on port ${env.port}`);
  startPollingScheduler();
  lighthouseWorker = startLighthouseWorker();
  startLighthouseEventConsumer().catch((err) => console.error('[kafka-consumer] failed to start:', err.message));
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await disconnectKafkaProducer();
  await disconnectKafkaConsumer();
  if (lighthouseWorker) await lighthouseWorker.close();
  const queue = getLighthouseQueue();
  if (queue) await queue.close();
  await disconnectRedis();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
