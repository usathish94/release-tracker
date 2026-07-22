import cron from 'node-cron';
import { Worker } from 'bullmq';
import { QUEUE_NAME } from './lighthouseQueue.js';
import { getRedisConnection } from './redisConnection.js';
import { runLighthouseAudit } from './lighthouseService.js';
import { publishLighthouseEvent } from './kafkaProducer.js';
import { upsertTerminalJob, markJobPublished, getUnpublishedTerminalJobs } from '../db/lighthouseJobsRepo.js';

const PUBLISH_RETRY_CRON = '*/2 * * * *';

async function processor(job) {
  const { url, device, categories, authContext, auth } = job.data;
  return runLighthouseAudit(url, { device, categories, authContext, authenticate: auth });
}

function buildEvent(row) {
  const base = {
    eventType: row.status === 'completed' ? 'lighthouse.audit.completed' : 'lighthouse.audit.failed',
    jobId: row.id,
    url: row.url,
    device: row.device,
    auth: row.auth,
    completedAt: row.completedAt
  };

  return row.status === 'completed'
    ? { ...base, scores: row.result.scores, metrics: row.result.metrics, fetchTime: row.result.fetchTime }
    : { ...base, error: row.error };
}

async function publishAndMark(row) {
  try {
    const published = await publishLighthouseEvent(row.id, buildEvent(row));
    if (published) await markJobPublished(row.id);
  } catch (err) {
    // Left with kafka_published_at = null; retryUnpublishedEvents() will pick it back up.
    console.error(`[lighthouse-worker] failed to publish event for job ${row.id}:`, err.message);
  }
}

async function archiveTerminalJob(job, status, errorMessage) {
  const { url, device, categories, authContext, auth } = job.data;
  const row = await upsertTerminalJob({
    id: job.id,
    url,
    device,
    categories,
    authContext,
    auth,
    status,
    result: status === 'completed' ? job.returnvalue : null,
    error: errorMessage ?? null,
    startedAt: job.processedOn ? new Date(job.processedOn) : null,
    completedAt: new Date()
  });

  // Not awaited: publishing is independent of audit throughput, same reasoning as the
  // old custom queue — a slow/unreachable broker must never delay the worker picking up
  // its next job. retryUnpublishedEvents() below guarantees eventual delivery either way.
  publishAndMark(row);
}

async function retryUnpublishedEvents() {
  const rows = await getUnpublishedTerminalJobs();
  for (const row of rows) {
    await publishAndMark(row);
  }
}

/**
 * Starts the BullMQ worker for Lighthouse audits. Concurrency is intentionally 1 —
 * Chrome/Lighthouse is heavy per-instance, same rationale as the old custom queue.
 * Returns null (and logs a warning) if Redis isn't configured, so a missing REDIS_URL
 * disables just the Lighthouse feature rather than crashing the whole app.
 */
export function startLighthouseWorker() {
  const connection = getRedisConnection();
  if (!connection) {
    console.warn('[lighthouse-worker] REDIS_URL not configured, worker not started');
    return null;
  }

  const worker = new Worker(QUEUE_NAME, processor, { connection, concurrency: 1 });

  worker.on('completed', (job) => {
    console.log(`[lighthouse-worker] job ${job.id} completed`);
    archiveTerminalJob(job, 'completed').catch((err) =>
      console.error(`[lighthouse-worker] failed to archive completed job ${job.id}:`, err.message)
    );
  });

  worker.on('failed', (job, err) => {
    if (!job) return;
    // BullMQ fires 'failed' on every attempt, including ones it will still auto-retry —
    // only archive/publish once there are no attempts left, i.e. the *final* failure.
    if (job.attemptsMade < (job.opts.attempts || 1)) {
      console.warn(`[lighthouse-worker] job ${job.id} attempt ${job.attemptsMade} failed, will retry:`, err.message);
      return;
    }
    console.error(`[lighthouse-worker] job ${job.id} failed permanently:`, err.message);
    archiveTerminalJob(job, 'failed', err.message).catch((archiveErr) =>
      console.error(`[lighthouse-worker] failed to archive failed job ${job.id}:`, archiveErr.message)
    );
  });

  cron.schedule(PUBLISH_RETRY_CRON, retryUnpublishedEvents);
  retryUnpublishedEvents();

  console.log('[lighthouse-worker] started (concurrency 1)');
  return worker;
}
