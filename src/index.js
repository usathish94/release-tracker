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
import { startLighthouseWorker } from './services/lighthouseJobService.js';
import { disconnectKafkaProducer } from './services/kafkaProducer.js';

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

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.port, () => {
  console.log(`release-tracker API listening on port ${env.port}`);
  startPollingScheduler();
  startLighthouseWorker();
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await disconnectKafkaProducer();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
