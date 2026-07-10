import cron from 'node-cron';
import { env } from '../config/env.js';
import { syncCurrentMatches } from './matchService.js';
import { notifyMatchUpdate } from './webhookDispatcher.js';

async function runPollCycle() {
  try {
    const changedMatches = await syncCurrentMatches();
    for (const match of changedMatches) {
      await notifyMatchUpdate(match);
    }
    console.log(
      `[poller] synced current matches, ${changedMatches.length} changed & notified at ${new Date().toISOString()}`
    );
  } catch (err) {
    console.error('[poller] poll cycle failed:', err.message);
  }
}

export function startPollingScheduler() {
  const minutes = Math.max(1, env.pollIntervalMinutes);
  const cronExpression = `*/${minutes} * * * *`;
  cron.schedule(cronExpression, runPollCycle);
  console.log(`[poller] scheduled every ${minutes} minute(s)`);
  // Run once on boot so the DB isn't empty while waiting for the first tick.
  runPollCycle();
}
