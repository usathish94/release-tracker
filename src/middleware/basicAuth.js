import { timingSafeEqual, createHash } from 'node:crypto';
import { env } from '../config/env.js';

// Hashing both sides to a fixed-length digest before comparing means timingSafeEqual
// never throws on a length mismatch (which itself would leak information via a
// different code path/timing) and the comparison itself doesn't leak length either.
function safeEqual(a, b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).send('Authentication required');
}

/** Protects /admin/queues (the Bull Board dashboard) with HTTP Basic Auth. */
export function requireAdminBasicAuth(req, res, next) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !encoded) {
    return unauthorized(res);
  }

  const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return unauthorized(res);
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (safeEqual(username, env.admin.username) && safeEqual(password, env.admin.password)) {
    return next();
  }

  unauthorized(res);
}
