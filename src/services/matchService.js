import { pool } from '../db/pool.js';
import { fetchCurrentMatches, fetchMatchInfo } from './cricketApiClient.js';
import { env } from '../config/env.js';

function deriveStatus(raw) {
  if (raw.matchEnded) return 'completed';
  if (raw.matchStarted) return 'live';
  return 'upcoming';
}

function formatScoreForTeam(teamName, scoreEntries) {
  if (!teamName || !Array.isArray(scoreEntries)) return null;
  const innings = scoreEntries.filter((entry) =>
    typeof entry.inning === 'string' && entry.inning.toLowerCase().startsWith(teamName.toLowerCase())
  );
  if (innings.length === 0) return null;
  return innings
    .map((entry) => `${entry.r ?? 0}/${entry.w ?? 0} (${entry.o ?? 0} ov)`)
    .join(' & ');
}

/** Normalizes a CricAPI match payload (currentMatches or match_info) into our row shape. */
export function normalizeMatch(raw) {
  const [team1, team2] = raw.teams || [];
  return {
    id: raw.id,
    name: raw.name,
    matchType: raw.matchType || null,
    status: deriveStatus(raw),
    venue: raw.venue || null,
    startDate: raw.dateTimeGMT || raw.date || null,
    tournament: raw.series_id || null,
    team1: team1 || null,
    team2: team2 || null,
    team1Score: formatScoreForTeam(team1, raw.score),
    team2Score: formatScoreForTeam(team2, raw.score),
    rawSummary: raw,
  };
}

/** Upserts a normalized match; returns { changed } indicating whether score/status changed vs prior row. */
export async function upsertMatch(match) {
  const previous = await pool.query('SELECT team1_score, team2_score, status FROM matches WHERE id = $1', [
    match.id,
  ]);

  await pool.query(
    `INSERT INTO matches (id, name, match_type, status, venue, start_date, tournament, team1, team2, team1_score, team2_score, raw_summary, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       match_type = EXCLUDED.match_type,
       status = EXCLUDED.status,
       venue = EXCLUDED.venue,
       start_date = EXCLUDED.start_date,
       tournament = EXCLUDED.tournament,
       team1 = EXCLUDED.team1,
       team2 = EXCLUDED.team2,
       team1_score = EXCLUDED.team1_score,
       team2_score = EXCLUDED.team2_score,
       raw_summary = EXCLUDED.raw_summary,
       last_synced_at = now()`,
    [
      match.id,
      match.name,
      match.matchType,
      match.status,
      match.venue,
      match.startDate,
      match.tournament,
      match.team1,
      match.team2,
      match.team1Score,
      match.team2Score,
      match.rawSummary,
    ]
  );

  const prevRow = previous.rows[0];
  const changed =
    !prevRow ||
    prevRow.team1_score !== match.team1Score ||
    prevRow.team2_score !== match.team2Score ||
    prevRow.status !== match.status;

  return { changed, isNew: !prevRow };
}

/** Pulls the current-matches list from upstream and upserts all of them. Returns matches that changed. */
export async function syncCurrentMatches() {
  const rawMatches = await fetchCurrentMatches();
  const changedMatches = [];
  for (const raw of rawMatches) {
    const normalized = normalizeMatch(raw);
    const { changed } = await upsertMatch(normalized);
    if (changed) changedMatches.push(normalized);
  }
  return changedMatches;
}

/** Fetches full detail for one match from upstream, upserts it, returns the normalized row + whether it changed. */
export async function refreshMatchDetail(matchId) {
  const raw = await fetchMatchInfo(matchId);
  const normalized = normalizeMatch(raw);
  const { changed } = await upsertMatch(normalized);
  return { normalized, changed };
}

export async function listMatches(status) {
  const result = status
    ? await pool.query('SELECT * FROM matches WHERE status = $1 ORDER BY start_date DESC NULLS LAST', [status])
    : await pool.query('SELECT * FROM matches ORDER BY start_date DESC NULLS LAST');
  return result.rows;
}

export async function getMatch(matchId) {
  const result = await pool.query('SELECT * FROM matches WHERE id = $1', [matchId]);
  const row = result.rows[0];
  if (!row) return null;

  const staleMs = env.matchDetailTtlMinutes * 60 * 1000;
  const isStale = Date.now() - new Date(row.last_synced_at).getTime() > staleMs;
  if (isStale && row.status === 'live') {
    try {
      const { normalized } = await refreshMatchDetail(matchId);
      return { ...row, ...toRow(normalized) };
    } catch (err) {
      console.error(`Failed to refresh match ${matchId} from upstream, serving cached row:`, err.message);
      return row;
    }
  }
  return row;
}

function toRow(normalized) {
  return {
    id: normalized.id,
    name: normalized.name,
    match_type: normalized.matchType,
    status: normalized.status,
    venue: normalized.venue,
    start_date: normalized.startDate,
    tournament: normalized.tournament,
    team1: normalized.team1,
    team2: normalized.team2,
    team1_score: normalized.team1Score,
    team2_score: normalized.team2Score,
    raw_summary: normalized.rawSummary,
  };
}
