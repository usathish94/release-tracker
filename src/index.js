import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { healthRouter } from './routes/health.routes.js';
import { matchesRouter } from './routes/matches.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { startPollingScheduler } from './services/pollingScheduler.js';

const app = express();

app.use(cors({ origin: env.corsOrigins }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/webhooks', webhooksRouter);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Listen server
app.listen(env.port, () => {
  console.log(`release-tracker API listening on port ${env.port}`);
  startPollingScheduler();
});
