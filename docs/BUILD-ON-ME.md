# Build on Scout Tester

Guide for developers extending or integrating with Scout Tester.

---

## Architecture Overview

```
index.js               Single entry point with grouped exports
server.js              Thin Express layer — routes + SSE only
index.html             Single-page dashboard (vanilla JS, SSE client)
core/
  constants.js         All config: port, API URLs, batch sizes, file paths
  probe.js             rawProbe(), fetchWithTimeout(), detection functions
  runner.js            autoRun(), retryRun(), testOneSite(), stopRun()
  runs.js              Run persistence (directory-based, pause/resume)
  results.js           Results state, verdict, Scout key management
  countries.js         Country mode state (default/all) with getters/setters
data/
  sites.json           Array of {url, category} objects
  results.json         Live results keyed by URL
  paused-run.json      Saved state when a run is paused mid-flight
  runs/
    index.json         Array of run metadata objects
    test-001/          Per-run directory
      results.json     {meta, siteResults} for that run
docs/
  API-REFERENCE.md     Full REST + SSE endpoint documentation
  BUILD-ON-ME.md       This file
```

All logic lives in `core/` modules. `server.js` is a thin Express layer that imports from core and wires up routes + SSE. All data is JSON on disk -- no database.

---

## Adding New Sites

### Via API

```javascript
const res = await fetch('http://localhost:3004/api/add-site', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    category: 'Reference'
  })
});
const data = await res.json();
// { ok: true, total: 76 }
```

### Via File

Edit `data/sites.json` directly. Each entry is an object with `url` and `category`:

```json
[
  {"url": "https://www.google.com", "category": "Search Engine"},
  {"url": "https://example.com", "category": "Custom"}
]
```

Categories are freeform strings. Existing categories: Search Engine, Social Media, News, E-Commerce, Tech, Streaming, Finance, Reference, Jobs, Real Estate, Government, Travel, Reviews, Cloud, AI.

The URL must include the protocol (`https://`). If you POST without it, the server auto-prepends `https://`.

---

## Adding New Countries

Countries are defined in `core/constants.js`:

```javascript
export const COUNTRIES_DEFAULT = ['FR', 'DE', 'GB'];
export const COUNTRIES_ALL = [
  'US', 'GB', 'DE', 'FR', 'CA', 'AU', 'NL', 'SE', /* ... 61 total */
];
```

- **Default mode** tests only `COUNTRIES_DEFAULT` (3 countries with working proxy pools).
- **All mode** tests every country in `COUNTRIES_ALL`.
- Switch modes at runtime via `POST /api/countries` with `{ "mode": "all" }` or `{ "mode": "default" }`.

To add a country, append its ISO 3166-1 alpha-2 code to the `COUNTRIES_ALL` array. Only add to `COUNTRIES_DEFAULT` if the Scout API has a working proxy pool in that country.

**Important:** As of March 2026, only FR, DE, and GB have reliable proxy pools. Other country codes may return immediate failures.

---

## How Block Detection Works

When a probe returns `state: "complete"` but the content might be a block page rather than real content, `detectBlockSignals(html)` scans the HTML for known patterns:

| Signal | Triggers |
|--------|----------|
| `CAPTCHA` | `captcha`, `recaptcha`, `hcaptcha` in content |
| `CLOUDFLARE` | `cloudflare` + `challenge` or `ray id` |
| `ACCESS_DENIED` | `access denied`, `403 forbidden` |
| `BOT_DETECT` | `robot`/`bot` + `detect`/`aren't`/`not a` |
| `CHALLENGE` | `challenge` + `browser`/`security`/`verification` |
| `JS_REQUIRED` | `enable javascript`, `javascript is disabled/required` |
| `RATE_LIMIT` | `rate` + `limit` |
| `UNUSUAL_TRAFFIC` | `unusual traffic`, `sorry` + `unusual` |
| `HUMAN_VERIFY` | `verify` + `human`/`you are`/`not a robot` |
| `IP_BLOCKED` | `blocked` + `request`/`ip`/`access` |

Block signals are stored per-result in the `blockSignals` array. A probe is considered a "real block" (not just a proxy pool miss) when it fails AND takes >= 2000ms (`REAL_BLOCK_MS`).

---

## How Data Type Detection Works

`detectDataType(content)` classifies the response body by inspecting the first 512 bytes:

| Return Value | Detection Method |
|--------------|------------------|
| `Image/PNG` | Starts with `\x89PNG` |
| `Image/JPEG` | Starts with `\xFF\xD8\xFF` |
| `Image/GIF` | Starts with `GIF8` |
| `Image/WebP` | Starts with `RIFF` + contains `WEBP` |
| `PDF` | Starts with `%PDF` |
| `Archive/ZIP` | Starts with `PK` |
| `HTML` | Starts with `<!doctype html`, `<html`, or contains `<head`/`<body`/`<div` |
| `XML` | Starts with `<?xml`, `<rss`, or `<feed` |
| `JSON` | Starts with `{` or `[` (validated with `JSON.parse`) |
| `Text` | Fallback for everything else |

The data type is stored per-result. When a site has both passing and failing probes, the passing probe's data type takes priority.

---

## How Run History Works

### Storage Structure

Each run gets its own directory under `data/runs/`:

```
data/runs/
  index.json              # Array of run metadata
  test-001/results.json   # Full data for run 1
  test-002/results.json   # Full data for run 2
```

### Run Lifecycle

1. **Start** -- `startRun(type)` creates a new run number, registers it in `index.json` as active, and broadcasts `run-start` via SSE.
2. **Probes** -- each probe result is recorded via `recordProbe()` (counts, bandwidth) and `recordSiteResult()` (per-site verdict).
3. **Credits** -- starting balance captured before the run, ending balance after. Credits polled after each batch for live spend tracking.
4. **Pause** -- `POST /api/stop` saves the run state to `paused-run.json`. The elapsed time before pause is preserved.
5. **Resume** -- the next `POST /api/run` detects the paused run file and resumes from where it left off, accumulating elapsed time.
6. **Finalize** -- `finalizeRun()` captures ending credits, computes the summary, saves full data to the run directory, and updates `index.json`.

### Run Metadata Fields

```javascript
{
  number: 1,              // Sequential run number
  type: 'full',           // 'full', 'retry', 'single', 'manual-save'
  label: 'Test #1',
  startedAt: '2026-03-30T...',
  endedAt: '2026-03-30T...',
  durationMs: 145000,
  creditsStart: 91.65,
  creditsEnd: 88.20,
  creditsSpent: 3.45,
  totalProbes: 225,       // Total probe attempts (sites x countries)
  passProbes: 68,
  failProbes: 157,
  realBlocks: 42,         // Failures with response >= 2000ms
  totalBandwidth: 4521000,// Bytes across all probes
  sitesTotal: 75,
  sitesProcessed: 75,
  summary: { pass: 19, fail: 56, tested: 75 }
}
```

### Loading Previous Runs

`POST /api/runs/load/:num` replaces the live `results` object with the saved run's `siteResults` map, allowing you to view historical data in the dashboard.

---

## SSE Events Reference

Connect to `GET /api/events` for real-time updates. All payloads are JSON.

| Event | Payload | When |
|-------|---------|------|
| `heartbeat` | `{ t, testing, phase, currentUrl, sitesProcessed, sitesTotal, activeRun }` | Every 5 seconds |
| `phase` | `{ phase, count?, message }` | Run phase changes (scanning, retrying, idle) |
| `activity` | `{ type, message, url? }` | Batch start, probe completion |
| `result` | Full result object (see below) | After each site is tested |
| `credits-update` | `{ credits, spent }` | After each batch completes |
| `run-start` | `{ id, type, startedAt, resumed?, elapsedBeforePause?, ... }` | Run begins or resumes |
| `run-end` | Run metadata + `siteResults` | Run completes |
| `done` | `{ pass, fail, untested, run }` | Full test cycle complete |
| `cleared` | `{}` | Results cleared |
| `state-update` | `{ loadedRun, results }` | Previous run loaded |

### Result Object Shape

```javascript
{
  url: 'https://www.google.com',
  category: 'Search Engine',
  dataType: 'HTML',
  status: 'pass',           // 'pass' or 'fail'
  verdict: 'PASS',           // 'PASS', 'FAIL', or 'UNTESTED'
  nodeResults: {
    FR: { passed: true, country: 'FR', responseTime: 3200, contentLength: 45231, dataType: 'HTML', ... },
    DE: { passed: false, country: 'DE', responseTime: 1100, contentLength: 0, ... },
    GB: { passed: true, country: 'GB', responseTime: 2800, contentLength: 41002, ... }
  },
  history: [
    { status: 'pass', time: '...', country: 'FR', responseTime: 3200, contentLength: 45231, ... }
  ],
  blockSignals: [],
  realBlocks: 0,
  totalProbes: 3,
  passedProbes: 2,
  lastTested: '2026-03-30T12:00:00.000Z',
  attempts: 1
}
```

### Listening to SSE in JavaScript

```javascript
const es = new EventSource('/api/events');

es.addEventListener('result', (e) => {
  const result = JSON.parse(e.data);
  console.log(`${result.verdict} ${result.url}`);
});

es.addEventListener('phase', (e) => {
  const { phase, message } = JSON.parse(e.data);
  console.log(`Phase: ${phase} -- ${message}`);
});

es.addEventListener('done', (e) => {
  const { pass, fail, untested } = JSON.parse(e.data);
  console.log(`Complete: ${pass} pass, ${fail} fail, ${untested} untested`);
});
```

---

## Extending the Server

### Importing as a Library

Use individual modules or the grouped entry point:

```javascript
// Individual imports
import { rawProbe, detectBlockSignals } from './core/probe.js';
import { loadSites, getResults } from './core/results.js';
import { autoRun, stopRun } from './core/runner.js';

// Grouped entry point
import { rawProbe, loadSites, autoRun } from './index.js';
```

### Adding a New Route

All routes are in `server.js`. Follow the existing pattern:

```javascript
app.post('/api/my-endpoint', async (req, res) => {
  const { param } = req.body;
  // ... logic ...
  res.json({ ok: true, data: result });
});
```

### Broadcasting Custom Events

```javascript
broadcast('my-event', { key: 'value' });
```

The `broadcast()` function sends to all connected SSE clients.

### Modifying Batch Behavior

Key constants in `core/constants.js`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `BATCH_SIZE` | 5 | Sites tested in parallel per batch |
| `BATCH_GAP` | 2000 | Milliseconds between batches |
| `REAL_BLOCK_MS` | 2000 | Minimum response time to count as a "real block" vs proxy miss |
