import axios from 'axios';
import { env } from '../config/env.js';

const BASE_URL = 'https://api.cricapi.com/v1';

const client = axios.create({ baseURL: BASE_URL, timeout: 10_000 });

/**
 * currentMatches gives a lightweight list of live/recent/upcoming matches.
 * Costs 1 request against the free 100/day quota.
 */
export async function fetchCurrentMatches() {
  const { data } = await client.get('/currentMatches', {
    params: { apikey: env.cricketApiKey, offset: 0 },
  });
  if (data.status !== 'success') {
    throw new Error(`CricAPI currentMatches error: ${data.status} ${data.reason || ''}`);
  }
  return data.data || [];
}

/**
 * match_info gives full scorecard detail for one match. Only call this on-demand
 * (cached in DB) since detail calls burn through the free quota fastest.
 */
export async function fetchMatchInfo(matchId) {
  const { data } = await client.get('/match_info', {
    params: { apikey: env.cricketApiKey, id: matchId },
  });
  if (data.status !== 'success') {
    throw new Error(`CricAPI match_info error: ${data.status} ${data.reason || ''}`);
  }
  return data.data;
}
