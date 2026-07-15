import express from 'express';
import { env } from './config/env.js';
import { runAgentJob } from './services/agentRunner.js';

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/run', (req, res) => {
  if (req.get('X-Worker-Secret') !== env.agentWorkerSecret) {
    return res.sendStatus(401);
  }

  const { message } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  runAgentJob(message).catch((err) => console.error('Unhandled agent job error:', err));

  res.status(202).json({ status: 'queued' });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(env.port, () => {
  console.log(`agent-worker listening on port ${env.port}`);
});
