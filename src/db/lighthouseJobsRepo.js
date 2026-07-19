import { pool } from './pool.js';

// Postgres channel used to wake the worker immediately when a job is inserted,
// instead of waiting for its next poll tick.
export const JOB_NOTIFY_CHANNEL = 'lighthouse_jobs_channel';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    url: row.url,
    device: row.device,
    categories: row.categories,
    authContext: row.auth_context,
    result: row.result,
    error: row.error,
    kafkaPublishedAt: row.kafka_published_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    // Only meaningful while status = 'queued'; present whenever the query computed it.
    queuePosition: row.queue_position != null ? Number(row.queue_position) : null
  };
}

// 1-based position among still-queued jobs, ordered the same way the worker claims them.
const QUEUE_POSITION_SUBQUERY = `(
  SELECT count(*)::int FROM lighthouse_jobs q
  WHERE q.status = 'queued' AND q.created_at <= t.created_at
)`;

export async function insertJob({ url, device, categories, authContext }) {
  // Count queued jobs ahead of this one *before* inserting, then add 1 for itself.
  // (A single INSERT ... RETURNING combined with a subquery over the base table can't
  // do this in one round trip: Postgres's WITH/CTE snapshot rules mean a data-modifying
  // CTE's own row isn't visible to a sibling subquery scanning the same table, so the
  // row would fail to count itself.) This is a point-in-time estimate for display only,
  // not used for claiming order, so a rare race with a concurrent insert is harmless.
  const { rows: aheadRows } = await pool.query(`SELECT count(*)::int AS ahead FROM lighthouse_jobs WHERE status = 'queued'`);

  const { rows } = await pool.query(
    `INSERT INTO lighthouse_jobs (url, device, categories, auth_context)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [url, device, categories ? JSON.stringify(categories) : null, authContext ? JSON.stringify(authContext) : null]
  );

  const job = mapRow(rows[0]);
  job.queuePosition = aheadRows[0].ahead + 1;
  return job;
}

// Kept separate from insertJob so callers can read the job's queue position
// before waking the worker (NOTIFY can lead to it being claimed immediately).
export async function notifyNewJob(id) {
  await pool.query('SELECT pg_notify($1, $2)', [JOB_NOTIFY_CHANNEL, id]);
}

export async function getJobById(id) {
  const { rows } = await pool.query(
    `SELECT t.*, ${QUEUE_POSITION_SUBQUERY} AS queue_position FROM lighthouse_jobs t WHERE t.id = $1`,
    [id]
  );
  return mapRow(rows[0]);
}

// Atomically claims the oldest queued job. SKIP LOCKED means multiple worker
// instances can call this concurrently without ever claiming the same row twice.
export async function claimNextQueuedJob() {
  const { rows } = await pool.query(
    `UPDATE lighthouse_jobs
     SET status = 'running', started_at = now()
     WHERE id = (
       SELECT id FROM lighthouse_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`
  );
  return mapRow(rows[0]);
}

export async function markJobCompleted(id, result) {
  const { rows } = await pool.query(
    `UPDATE lighthouse_jobs
     SET status = 'completed', result = $2, completed_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(result)]
  );
  return mapRow(rows[0]);
}

export async function markJobFailed(id, errorMessage) {
  const { rows } = await pool.query(
    `UPDATE lighthouse_jobs
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, errorMessage]
  );
  return mapRow(rows[0]);
}

export async function markJobPublished(id) {
  await pool.query('UPDATE lighthouse_jobs SET kafka_published_at = now() WHERE id = $1', [id]);
}

export async function getUnpublishedTerminalJobs(limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM lighthouse_jobs
     WHERE status IN ('completed', 'failed') AND kafka_published_at IS NULL
     ORDER BY completed_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows.map(mapRow);
}
