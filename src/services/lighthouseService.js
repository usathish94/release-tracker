import { launch } from 'chrome-launcher';
import puppeteer from 'puppeteer-core';
import { env } from '../config/env.js';

const DEFAULT_CATEGORIES = ['performance'];

// Loaded via dynamic import rather than a static default import: esbuild's CJS interop
// shim (used to bundle this for production, see package.json's build script) always
// rebinds a default import of an external package to the whole module object rather
// than its `.default`, which broke calling it as a function. A dynamic import is left
// untouched by that shim and resolves lighthouse's real default export either way.
let lighthousePromise;
function loadLighthouse() {
  if (!lighthousePromise) lighthousePromise = import('lighthouse').then((m) => m.default);
  return lighthousePromise;
}

const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'];

// Audit id -> friendly key, for the Core Web Vitals + supporting metrics we care about.
const METRIC_AUDITS = {
  firstContentfulPaint: 'first-contentful-paint',
  largestContentfulPaint: 'largest-contentful-paint',
  totalBlockingTime: 'total-blocking-time',
  cumulativeLayoutShift: 'cumulative-layout-shift',
  speedIndex: 'speed-index',
  timeToInteractive: 'interactive'
};

function buildConfig({ device, categories }) {
  const isDesktop = device === 'desktop';
  return {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: categories?.length ? categories : DEFAULT_CATEGORIES,
      formFactor: isDesktop ? 'desktop' : 'mobile',
      screenEmulation: isDesktop
        ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
        : { mobile: true, width: 412, height: 823, deviceScaleFactor: 2.625, disabled: false }
    }
  };
}

function extractScores(lhr) {
  return Object.fromEntries(
    Object.entries(lhr.categories).map(([key, category]) => [
      key,
      category.score === null ? null : Math.round(category.score * 100)
    ])
  );
}

function extractMetrics(lhr) {
  const metrics = {};
  for (const [key, auditId] of Object.entries(METRIC_AUDITS)) {
    const audit = lhr.audits[auditId];
    if (audit) {
      metrics[key] = {
        value: audit.numericValue ?? null,
        unit: audit.numericUnit ?? null,
        displayValue: audit.displayValue ?? null
      };
    }
  }
  return metrics;
}

function logReport({ url, device, scores, metrics }) {
  console.log(`\n[lighthouse] ${url} (${device})`);
  console.log('[lighthouse] scores:', scores);
  console.table(
    Object.fromEntries(
      Object.entries(metrics).map(([key, m]) => [key, { value: m.displayValue ?? m.value, unit: m.unit }])
    )
  );
}

/**
 * Logs into the app using the env-configured credentials (LIGHTHOUSE_AUTH_*), driving
 * the same Chrome instance chrome-launcher just opened via its remote-debugging port —
 * so the resulting session cookies are already in that browser when Lighthouse audits it.
 * Success is judged by URL change: login forms typically redirect off the login page
 * once authenticated (e.g. instagram.com/accounts/login -> instagram.com), so if the
 * pathname is unchanged after submitting, something went wrong (bad creds, validation
 * error, unexpected page) and this throws rather than silently auditing the login page.
 */
async function performLoginFlow(port) {
  const { loginUrl, username, password, usernameSelector, passwordSelector } = env.lighthouseAuth;
  if (!loginUrl || !username || !password) {
    throw new Error(
      'Authenticated audit requested but LIGHTHOUSE_AUTH_LOGIN_URL/LIGHTHOUSE_AUTH_USERNAME/LIGHTHOUSE_AUTH_PASSWORD are not all configured'
    );
  }

  // Connect (not launch): chrome-launcher already started this Chrome, and we want the
  // login session to land in the same profile Lighthouse will audit next.
  const browser = await puppeteer.connect({ browserURL: `http://localhost:${port}` });

  try {
    const page = await browser.newPage();
    await page.goto(loginUrl, { waitUntil: 'networkidle2' });

    await page.waitForSelector(usernameSelector, { visible: true, timeout: 15000 });
    await page.type(usernameSelector, username);

    await page.waitForSelector(passwordSelector, { visible: true, timeout: 15000 });
    await page.type(passwordSelector, password);

    const loginPathname = new URL(loginUrl).pathname;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.keyboard.press('Enter')
    ]);

    if (new URL(page.url()).pathname === loginPathname) {
      throw new Error(`Login did not navigate away from ${loginPathname} — check credentials/selectors`);
    }

    await page.close();
  } finally {
    // disconnect, not close: leaves chrome-launcher's Chrome process (and the session
    // cookies just established) running for Lighthouse to audit against next.
    browser.disconnect();
  }
}

/**
 * Runs a Lighthouse performance audit against `url` using a locally-launched
 * headless Chrome instance and logs the resulting metrics to the console.
 *
 * `authContext` injects a session cookie or auth header into every request Lighthouse
 * makes (`{ cookies, extraHeaders }`) — for APIs/pages that accept a pre-obtained token.
 *
 * `authenticate: true` instead drives a real login form first (see performLoginFlow),
 * using the shared LIGHTHOUSE_AUTH_* credentials — for pages that only accept an
 * interactive login. Both reuse this same Chrome instance and metric-extraction code;
 * they differ only in how the session gets established before Lighthouse runs.
 */
export async function runLighthouseAudit(url, { device = 'desktop', categories, authContext, authenticate } = {}) {
  const chrome = await launch({ chromeFlags: CHROME_FLAGS });

  try {
    if (authenticate) {
      await performLoginFlow(chrome.port);
    }

    const config = buildConfig({ device, categories });

    if (authContext?.cookies || authContext?.extraHeaders) {
      config.settings.extraHeaders = {
        ...(authContext.extraHeaders || {}),
        ...(authContext.cookies ? { Cookie: authContext.cookies } : {})
      };
    }

    const lighthouseFlags = { port: chrome.port };
    if (authenticate) {
      // Lighthouse normally clears cookies/storage before auditing for a clean baseline;
      // that would also wipe the session we just logged in with, so keep it for this run.
      lighthouseFlags.disableStorageReset = true;
    }

    const lighthouse = await loadLighthouse();
    const result = await lighthouse(url, lighthouseFlags, config);
    const lhr = result.lhr;

    const report = {
      url: lhr.finalDisplayedUrl || lhr.finalUrl || url,
      device: device === 'desktop' ? 'desktop' : 'mobile',
      fetchTime: lhr.fetchTime,
      scores: extractScores(lhr),
      metrics: extractMetrics(lhr)
    };

    logReport(report);

    return report;
  } finally {
    await chrome.kill();
  }
}
