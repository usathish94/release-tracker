import { launch } from 'chrome-launcher';

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
 * Runs a Lighthouse performance audit against `url` using a locally-launched
 * headless Chrome instance and logs the resulting metrics to the console.
 *
 * `authContext` is a forward-looking extension point for phase 2 (authenticated
 * pages): pass `{ cookies, extraHeaders }` to inject a session cookie or auth
 * header into every request Lighthouse makes while auditing, without needing
 * to change this function's contract. A future phase can extend this further
 * (e.g. a Puppeteer login step against the same Chrome instance before the
 * audit runs) by adding an optional hook here.
 */
export async function runLighthouseAudit(url, { device = 'mobile', categories, authContext } = {}) {
  const chrome = await launch({ chromeFlags: CHROME_FLAGS });

  try {
    const config = buildConfig({ device, categories });

    if (authContext?.cookies || authContext?.extraHeaders) {
      config.settings.extraHeaders = {
        ...(authContext.extraHeaders || {}),
        ...(authContext.cookies ? { Cookie: authContext.cookies } : {})
      };
    }

    const lighthouse = await loadLighthouse();
    const result = await lighthouse(url, { port: chrome.port }, config);
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
