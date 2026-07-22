import { randomUUID } from 'crypto';
import { Job } from 'bullmq';
import { getLighthouseQueue } from './lighthouseQueue.js';
import { getJobById } from '../db/lighthouseJobsRepo.js';

export class LighthouseQueueUnavailableError extends Error {}

function requireQueue() {
  const queue = getLighthouseQueue();
  if (!queue) {
    throw new LighthouseQueueUnavailableError('Lighthouse job queue is not configured (REDIS_URL not set)');
  }
  return queue;
}

const BULL_STATE_TO_STATUS = {
  completed: 'completed',
  failed: 'failed',
  active: 'running',
  waiting: 'queued',
  delayed: 'queued',
  'waiting-children': 'queued',
  prioritized: 'queued'
};

async function toPublicJobFromBull(job, queue) {
  const status = BULL_STATE_TO_STATUS[await job.getState()] || 'queued';

  const publicJob = {
    id: job.id,
    status,
    request: {
      url: job.data.url,
      device: job.data.device,
      categories: job.data.categories,
      auth: !!job.data.auth
    },
    createdAt: new Date(job.timestamp).toISOString(),
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    completedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null
  };

  // Best-effort, same as the old Postgres-backed version: a point-in-time snapshot,
  // not an exact reservation (another job could be added/claimed between this read
  // and the caller seeing it).
  if (status === 'queued') {
    publicJob.queuePosition = (await queue.getWaitingCount()) + 1;
  }
  if (status === 'completed') {
    publicJob.result = job.returnvalue;
  }
  if (status === 'failed') {
    publicJob.error = job.failedReason;
  }

  return publicJob;
}

// Used when a job has aged out of Redis's rolling retention window (removeOnComplete/
// removeOnFail in lighthouseQueue.js) but is still in the permanent Postgres archive.
function toPublicJobFromPg(row) {
  const publicJob = {
    id: row.id,
    status: row.status,
    request: { url: row.url, device: row.device, categories: row.categories, auth: row.auth },
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt
  };

  if (row.status === 'completed') publicJob.result = row.result;
  if (row.status === 'failed') publicJob.error = row.error;

  return publicJob;
}

/**
 * Queues a Lighthouse audit and returns immediately. Throws LighthouseQueueUnavailableError
 * if Redis isn't configured — callers (routes) turn that into a 503, never a crash.
 */
export async function enqueueLighthouseJob({ url, device, categories, authContext, auth }) {
  const queue = requireQueue();
  const id = randomUUID();

  const job = await queue.add(
    'audit',
    {
      url,
      device: device === 'desktop' ? 'desktop' : 'mobile',
      categories: categories ?? null,
      authContext: authContext ?? null,
      auth: !!auth
    },
    { jobId: id }
  );

  return toPublicJobFromBull(job, queue);
}

export async function getLighthouseJob(id) {
  const queue = requireQueue();

  const job = await Job.fromId(queue, id);
  if (job) return toPublicJobFromBull(job, queue);

  const row = await getJobById(id);
  return row ? toPublicJobFromPg(row) : null;
}

/**
 * Re-queues a job via BullMQ's own retry mechanism — the same operation Bull Board's
 * "Retry" button performs. Works regardless of how the job previously ended (failed
 * after exhausting automatic attempts, or even a completed job) since BullMQ resets
 * its attempt count on manual retry. Returns null if the job was never found (unknown
 * id, or aged out of Redis's retention window — see toPublicJobFromPg above for why
 * that case isn't retryable: there's nothing left in the live queue to re-run).
 */
export async function retryLighthouseJob(id) {
  const queue = requireQueue();

  const job = await Job.fromId(queue, id);
  if (!job) return null;

  await job.retry();
  return toPublicJobFromBull(job, queue);
}
