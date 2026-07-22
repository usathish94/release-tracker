import cron from 'node-cron';
import { pool } from '../db/pool.js';
import {
  JOB_NOTIFY_CHANNEL,
  insertJob,
  notifyNewJob,
  getJobById,
  claimNextQueuedJob,
  markJobCompleted,
  markJobFailed,
  markJobPublished,
  getUnpublishedTerminalJobs
} from '../db/lighthouseJobsRepo.js';
import { runLighthouseAudit } from './lighthouseService.js';
import { publishLighthouseEvent } from './kafkaProducer.js';

// Backstop poll in case a NOTIFY is ever missed (e.g. jobs queued before the
// worker's LISTEN connection was up, or a dropped/reconnecting connection).
const FALLBACK_POLL_INTERVAL_MS = 5000;
const PUBLISH_RETRY_CRON = '*/2 * * * *';

let processing = false;
let runAgain = false;

function toPublicJob(job) {
  const publicJob = {
    id: job.id,
    status: job.status,
    request: { url: job.url, device: job.device, categories: job.categories, auth: job.auth },
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  };

  if (job.status === 'queued') {
    publicJob.queuePosition = job.queuePosition;
  }
  if (job.status === 'completed') {
    publicJob.result = job.result;
  }
  if (job.status === 'failed') {
    publicJob.error = job.error;
  }

  return publicJob;
}

/**
 * Persists a Lighthouse audit request as a queued job row and returns
 * immediately. `enqueueLighthouseJob`/the worker are decoupled: this only
 * writes the row and nudges the worker via NOTIFY — it never runs Lighthouse itself.
 */
export async function enqueueLighthouseJob({ url, device, categories, authContext, auth }) {
  const job = await insertJob({
    url,
    device: device === 'desktop' ? 'desktop' : 'mobile',
    categories,
    authContext,
    auth
  });
  await notifyNewJob(job.id);
  return toPublicJob(job);
}

export async function getLighthouseJob(id) {
  const job = await getJobById(id);
  return job ? toPublicJob(job) : null;
}

function buildEvent(job) {
  const base = {
    eventType: job.status === 'completed' ? 'lighthouse.audit.completed' : 'lighthouse.audit.failed',
    jobId: job.id,
    url: job.url,
    device: job.device,
    auth: job.auth,
    completedAt: job.completedAt
  };

  return job.status === 'completed'
    ? { ...base, scores: job.result.scores, metrics: job.result.metrics, fetchTime: job.result.fetchTime }
    : { ...base, error: job.error };
}

async function publishAndMark(job) {
  try {
    const published = await publishLighthouseEvent(job.id, buildEvent(job));
    if (published) await markJobPublished(job.id);
  } catch (err) {
    // Left with kafka_published_at = null; retryUnpublishedEvents() will pick it back up.
    console.error(`[lighthouse-worker] failed to publish event for job ${job.id}:`, err.message);
  }
}

/**
 * Drains the queue one job at a time. Safe to call repeatedly/concurrently
 * (from NOTIFY, the poll timer, and job submission) — re-entrant calls just
 * set a flag so the loop restarts once instead of overlapping.
 */
async function processNext() {
  if (processing) {
    runAgain = true;
    return;
  }
  processing = true;

  try {
    let job = await claimNextQueuedJob();
    while (job) {
      console.log(`[lighthouse-worker] running job ${job.id} for ${job.url}`);
      let finished;
      try {
        const result = await runLighthouseAudit(job.url, {
          device: job.device,
          categories: job.categories,
          authContext: job.authContext,
          authenticate: job.auth
        });
        finished = await markJobCompleted(job.id, result);
      } catch (err) {
        console.error(`[lighthouse-worker] job ${job.id} failed:`, err.message);
        finished = await markJobFailed(job.id, err.message);
      }
      // Not awaited: publishing is independent of audit throughput. A slow or
      // unreachable broker should never delay picking up the next queued job —
      // retryUnpublishedEvents() guarantees eventual delivery either way.
      publishAndMark(finished);
      job = await claimNextQueuedJob();
    }
  } finally {
    processing = false;
    if (runAgain) {
      runAgain = false;
      processNext();
    }
  }
}

async function retryUnpublishedEvents() {
  const jobs = await getUnpublishedTerminalJobs();
  for (const job of jobs) {
    await publishAndMark(job);
  }
}

async function listenForJobNotifications() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[lighthouse-worker] could not open LISTEN connection, relying on polling only:', err.message);
    return;
  }

  client.on('error', (err) => {
    console.error('[lighthouse-worker] LISTEN connection dropped, reconnecting in 5s:', err.message);
    client.release(true);
    setTimeout(listenForJobNotifications, 5000);
  });

  client.on('notification', (msg) => {
    if (msg.channel === JOB_NOTIFY_CHANNEL) processNext();
  });

  await client.query(`LISTEN ${JOB_NOTIFY_CHANNEL}`);
  console.log(`[lighthouse-worker] listening for new jobs on "${JOB_NOTIFY_CHANNEL}"`);
}

/**
 * Starts the Lighthouse job worker in this process: claims queued jobs one at
 * a time via Postgres `FOR UPDATE SKIP LOCKED` (safe to run from multiple
 * instances without double-processing a job) and publishes a Kafka event once
 * each job reaches a terminal state. Picks up new jobs instantly via
 * LISTEN/NOTIFY, with a periodic poll as a backstop, and periodically retries
 * publishing for any job that finished but never made it to Kafka.
 */
export function startLighthouseWorker() {
  listenForJobNotifications();
  setInterval(processNext, FALLBACK_POLL_INTERVAL_MS);
  cron.schedule(PUBLISH_RETRY_CRON, retryUnpublishedEvents);
  // Catch up on anything left over from before this process started.
  processNext();
  retryUnpublishedEvents();
}
