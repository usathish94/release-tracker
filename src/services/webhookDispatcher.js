import crypto from 'node:crypto';
import axios from 'axios';
import { pool } from '../db/pool.js';

function sign(secret, payloadString) {
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

async function deliver(subscriber, payload) {
  const payloadString = JSON.stringify(payload);
  const signature = sign(subscriber.secret, payloadString);
  try {
    await axios.post(subscriber.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': `sha256=${signature}`,
      },
      timeout: 8000,
    });
  } catch (err) {
    console.error(`Webhook delivery to ${subscriber.url} failed:`, err.message);
  }
}

/** Notifies every active subscriber for this match (or global subscribers with match_id NULL). */
export async function notifyMatchUpdate(match) {
  const payload = {
    event: 'match.score_updated',
    matchId: match.id,
    name: match.name,
    status: match.status,
    team1: match.team1,
    team2: match.team2,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    timestamp: new Date().toISOString(),
  };

  await pool.query('INSERT INTO score_events (match_id, payload) VALUES ($1, $2)', [match.id, payload]);

  const { rows: subscribers } = await pool.query(
    'SELECT * FROM webhook_subscribers WHERE active = true AND (match_id = $1 OR match_id IS NULL)',
    [match.id]
  );

  await Promise.all(subscribers.map((subscriber) => deliver(subscriber, payload)));
  return { notifiedCount: subscribers.length, payload };
}

/** Sends a synthetic payload to a single subscriber, used by the /webhooks/test endpoint. */
export async function sendTestPayload(subscriber) {
  const payload = {
    event: 'webhook.test',
    message: 'This is a test delivery from release-tracker',
    timestamp: new Date().toISOString(),
  };
  await deliver(subscriber, payload);
  return payload;
}
