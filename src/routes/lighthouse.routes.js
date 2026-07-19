import { Router } from 'express';
import { enqueueLighthouseJob, getLighthouseJob } from '../services/lighthouseJobService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const lighthouseRouter = Router();

const VALID_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

lighthouseRouter.post(
  '/audit',
  asyncHandler(async (req, res) => {
    const { url, device, categories, cookies, extraHeaders } = req.body || {};

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'url must be a valid absolute URL' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'url must use http or https' });
    }

    if (device && !['mobile', 'desktop'].includes(device)) {
      return res.status(400).json({ error: 'device must be one of mobile, desktop' });
    }

    if (categories && (!Array.isArray(categories) || categories.some((c) => !VALID_CATEGORIES.includes(c)))) {
      return res.status(400).json({ error: `categories must be a subset of ${VALID_CATEGORIES.join(', ')}` });
    }

    // Not used in phase 1 (unauthenticated pages only), but wired through so
    // authenticated audits can be enabled later without an API shape change.
    const authContext = cookies || extraHeaders ? { cookies, extraHeaders } : undefined;

    const job = await enqueueLighthouseJob({ url, device, categories, authContext });

    res.status(202).json(job);
  })
);

lighthouseRouter.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = await getLighthouseJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  })
);
