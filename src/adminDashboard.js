import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getLighthouseQueue } from './services/lighthouseQueue.js';

/**
 * Bull Board: a real dashboard for browsing Lighthouse jobs and retrying failed ones
 * (individually or in bulk) — the actual point of the BullMQ migration. Returns null
 * if Redis isn't configured, so /admin/queues just isn't mounted rather than crashing.
 */
export function createAdminDashboardRouter() {
  const queue = getLighthouseQueue();
  if (!queue) return null;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter
  });

  return serverAdapter.getRouter();
}
