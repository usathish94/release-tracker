import { Queue } from 'bullmq';
import { getRedisConnection } from './redisConnection.js';

export const QUEUE_NAME = 'lighthouse-audit';

let queue = null;

/**
 * Lazy singleton for the BullMQ queue backing Lighthouse audits. Returns null when
 * Redis isn't configured (see redisConnection.js) — callers must handle that rather
 * than let a Queue construction attempt fail against a nonexistent connection.
 */
export function getLighthouseQueue() {
  const connection = getRedisConnection();
  if (!connection) return null;

  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        // Redis is a rolling window of recent jobs for the Bull Board dashboard, not
        // permanent storage — src/db/lighthouseJobsRepo.js's lighthouse_jobs table is
        // the unlimited historical archive (see lighthouseWorker.js).
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 }
      }
    });
  }
  return queue;
}
