CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  match_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('live', 'completed', 'upcoming')),
  venue TEXT,
  start_date TIMESTAMPTZ,
  tournament TEXT,
  team1 TEXT,
  team2 TEXT,
  team1_score TEXT,
  team2_score TEXT,
  raw_summary JSONB,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS score_events (
  id SERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lighthouse_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  url TEXT NOT NULL,
  device TEXT NOT NULL DEFAULT 'mobile',
  categories JSONB,
  auth_context JSONB,
  result JSONB,
  error TEXT,
  kafka_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_webhook_subscribers_match_id ON webhook_subscribers(match_id);
CREATE INDEX IF NOT EXISTS idx_score_events_match_id ON score_events(match_id);
-- Used by the worker to find the oldest queued job (FOR UPDATE SKIP LOCKED).
CREATE INDEX IF NOT EXISTS idx_lighthouse_jobs_status_created ON lighthouse_jobs(status, created_at);
-- Used by the Kafka publish-retry sweep to find jobs that finished but never got an event out.
CREATE INDEX IF NOT EXISTS idx_lighthouse_jobs_unpublished ON lighthouse_jobs(completed_at)
  WHERE kafka_published_at IS NULL AND status IN ('completed', 'failed');
