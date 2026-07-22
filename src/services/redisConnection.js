import IORedis from 'ioredis';
import { env } from '../config/env.js';

let connection = null;

/**
 * Shared Redis connection for BullMQ's Queue and Worker. BullMQ requires this to be
 * one shared instance (not a fresh connection per Queue/Worker) and mandates
 * `maxRetriesPerRequest: null` so its blocking commands aren't interrupted by ioredis's
 * own retry logic. Returns null when REDIS_URL isn't configured — see env.js's comment
 * on why Redis degrades gracefully instead of crashing the app.
 */
export function getRedisConnection() {
  if (!env.redisUrl) return null;
  if (!connection) {
    connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}

export async function disconnectRedis() {
  if (!connection) return;
  const client = connection;
  connection = null;
  await client.quit();
}
