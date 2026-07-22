import { Router } from 'express';
import { env } from '../config/env.js';
import { enqueueLighthouseJob, getLighthouseJob } from '../services/lighthouseJobService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const lighthouseRouter = Router();

const VALID_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared by /audit and /authenticated-audit. Returns an { error } object on failure, or
// null on success — callers respond with 400 + the error, or proceed with the parsed body.
function validateAuditRequest({ url, device, categories }) {
  if (!url || typeof url !== 'string') {
    return { error: 'url is required' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: 'url must be a valid absolute URL' };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { error: 'url must use http or https' };
  }

  if (device && !['mobile', 'desktop'].includes(device)) {
    return { error: 'device must be one of mobile, desktop' };
  }

  if (categories && (!Array.isArray(categories) || categories.some((c) => !VALID_CATEGORIES.includes(c)))) {
    return { error: `categories must be a subset of ${VALID_CATEGORIES.join(', ')}` };
  }

  return null;
}

lighthouseRouter.post(
  '/audit',
  asyncHandler(async (req, res) => {
    const { url, device, categories, cookies, extraHeaders } = req.body || {};

    const validationError = validateAuditRequest({ url, device, categories });
    if (validationError) {
      return res.status(400).json(validationError);
    }

    // Injects a pre-obtained session cookie/header rather than logging in — see
    // /authenticated-audit for pages that only accept an interactive login form.
    const authContext = cookies || extraHeaders ? { cookies, extraHeaders } : undefined;

    const job = await enqueueLighthouseJob({ url, device, categories, authContext });

    res.status(202).json(job);
  })
);

lighthouseRouter.post(
  '/authenticated-audit',
  asyncHandler(async (req, res) => {
    const { url, device, categories } = req.body || {};

    const validationError = validateAuditRequest({ url, device, categories });
    if (validationError) {
      return res.status(400).json(validationError);
    }

    const { loginUrl, username, password } = env.lighthouseAuth;
    if (!loginUrl || !username || !password) {
      return res.status(500).json({
        error:
          'Authenticated audits are not configured on this server (LIGHTHOUSE_AUTH_LOGIN_URL/LIGHTHOUSE_AUTH_USERNAME/LIGHTHOUSE_AUTH_PASSWORD)'
      });
    }

    const job = await enqueueLighthouseJob({ url, device, categories, auth: true });

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
