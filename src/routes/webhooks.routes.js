import { Router } from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { sendTestPayload } from '../services/webhookDispatcher.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const webhooksRouter = Router();

webhooksRouter.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { url, matchId } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    if (matchId) {
      const matchExists = await pool.query('SELECT 1 FROM matches WHERE id = $1', [matchId]);
      if (matchExists.rowCount === 0) {
        return res.status(404).json({ error: `Unknown matchId: ${matchId}` });
      }
    }

    const id = randomUUID();
    const secret = randomBytes(24).toString('hex');

    await pool.query('INSERT INTO webhook_subscribers (id, url, match_id, secret) VALUES ($1, $2, $3, $4)', [
      id,
      url,
      matchId || null,
      secret,
    ]);

    res.status(201).json({
      id,
      url,
      matchId: matchId || null,
      secret,
      note: 'Store this secret now - it is used to verify the X-Signature header on deliveries and will not be shown again.',
    });
  })
);

webhooksRouter.delete(
  '/subscribe/:id',
  asyncHandler(async (req, res) => {
    const result = await pool.query('DELETE FROM webhook_subscribers WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    res.status(204).send();
  })
);

webhooksRouter.post(
  '/test',
  asyncHandler(async (req, res) => {
    const { subscriberId } = req.body || {};
    if (!subscriberId) {
      return res.status(400).json({ error: 'subscriberId is required' });
    }
    const result = await pool.query('SELECT * FROM webhook_subscribers WHERE id = $1', [subscriberId]);
    const subscriber = result.rows[0];
    if (!subscriber) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    const payload = await sendTestPayload(subscriber);
    res.json({ delivered: true, payload });
  })
);
