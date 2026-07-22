import { pool } from './pool.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    url: row.url,
    device: row.device,
    categories: row.categories,
    authContext: row.auth_context,
    auth: row.auth,
    result: row.result,
    error: row.error,
    kafkaPublishedAt: row.kafka_published_at,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

export async function getJobById(id) {
  const { rows } = await pool.query('SELECT * FROM lighthouse_jobs WHERE id = $1', [id]);
  return mapRow(rows[0]);
}

/**
 * Writes the permanent historical record for a job's *final* terminal outcome
 * (BullMQ/Redis owns the live queue state — see lighthouseWorker.js). Uses BullMQ's
 * own job id as the row id, via upsert rather than plain insert: a job that failed
 * once (and already got a row + a "failed" Kafka event) can later succeed via a
 * manual retry from Bull Board, and needs the *same* row to flip to 'completed' —
 * a plain INSERT would collide on the primary key. Resetting kafka_published_at to
 * NULL on conflict is the key correctness detail: without it, getUnpublishedTerminalJobs()
 * would never notice the outcome changed and a fresh event would never go out.
 */
export async function upsertTerminalJob({
  id,
  url,
  device,
  categories,
  authContext,
  auth,
  status,
  result,
  error,
  startedAt,
  completedAt
}) {
  const { rows } = await pool.query(
    `INSERT INTO lighthouse_jobs (id, url, device, categories, auth_context, auth, status, result, error, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       result = EXCLUDED.result,
       error = EXCLUDED.error,
       started_at = EXCLUDED.started_at,
       completed_at = EXCLUDED.completed_at,
       kafka_published_at = NULL
     RETURNING *`,
    [
      id,
      url,
      device,
      categories ? JSON.stringify(categories) : null,
      authContext ? JSON.stringify(authContext) : null,
      auth,
      status,
      result ? JSON.stringify(result) : null,
      error ?? null,
      startedAt,
      completedAt
    ]
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
