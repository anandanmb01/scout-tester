# API Reference

All endpoints are served from `http://localhost:3004`. Request and response bodies are JSON unless otherwise noted.

---

## Health

### GET /health

Server health check.

**Response:**

```json
{
  "status": "ok",
  "uptime": 3600.5
}
```

---

## Results

### GET /api/results

Returns all current test results and run state.

**Response:**

```json
{
  "results": {
    "https://www.google.com": {
      "url": "https://www.google.com",
      "category": "Search Engine",
      "dataType": "HTML",
      "status": "pass",
      "verdict": "PASS",
      "nodeResults": {
        "FR": {
          "passed": true,
          "country": "FR",
          "responseTime": 3200,
          "contentLength": 45231,
          "dataType": "HTML",
          "errorCode": null,
          "state": "complete",
          "blockSignals": [],
          "time": "2026-03-30T12:00:00.000Z"
        }
      },
      "history": [],
      "blockSignals": [],
      "realBlocks": 0,
      "totalProbes": 3,
      "passedProbes": 2,
      "lastTested": "2026-03-30T12:00:00.000Z",
      "attempts": 1
    }
  },
  "testing": false,
  "currentUrl": null,
  "phase": "idle",
  "sitesProcessed": 0,
  "sitesTotal": 0,
  "activeRun": null,
  "activeRunNumber": null,
  "totalRuns": 5
}
```

When a run is active, `activeRun` contains:

```json
{
  "id": 6,
  "type": "full",
  "startedAt": "2026-03-30T12:00:00.000Z",
  "totalProbes": 150,
  "passProbes": 45,
  "failProbes": 105,
  "totalBandwidth": 3200000,
  "sitesProcessed": 50,
  "sitesTotal": 75,
  "creditsStart": 91.65
}
```

---

## Sites

### GET /api/sites

Returns the full site list from `data/sites.json`.

**Response:**

```json
[
  { "url": "https://www.google.com", "category": "Search Engine" },
  { "url": "https://www.facebook.com", "category": "Social Media" }
]
```

### POST /api/add-site

Add a site to the test list.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL to add. Auto-prepends `https://` if missing. |
| `category` | string | No | Category label. Defaults to `"Custom"`. |

```json
{ "url": "https://example.com", "category": "Reference" }
```

**Response:**

```json
{ "ok": true, "total": 76 }
```

**Errors:**

```json
{ "error": "URL required" }
{ "error": "Already exists" }
```

### POST /api/remove-site

Remove a site from the test list and delete its results.

**Request body:**

```json
{ "url": "https://example.com" }
```

**Response:**

```json
{ "ok": true }
```

---

## Credits

### GET /api/credits

Fetch current Scout API credit balance.

**Response:**

```json
{ "credits": 91.65 }
```

Returns `{ "credits": "?" }` if the API call fails or no key is configured.

---

## Account

### GET /api/account

Get account connection status and stats.

**Response (connected):**

```json
{
  "connected": true,
  "key": "scout-c1_abc123...",
  "masked": "scout-c1_abc...3xyz",
  "credits": 91.65,
  "userId": "416",
  "totalJobs": 1249
}
```

**Response (not connected):**

```json
{
  "connected": false,
  "key": null,
  "masked": null
}
```

### POST /api/account/connect

Connect a Scout API key. Persists to `.env`.

**Request body:**

```json
{ "key": "scout-c1_YOUR_KEY_HERE" }
```

**Response:**

```json
{ "ok": true, "masked": "scout-c1_YOU...HERE" }
```

**Errors:**

```json
{ "error": "API key required" }
```

### POST /api/account/disconnect

Disconnect the API key. Removes from `.env`.

**Response:**

```json
{ "ok": true }
```

---

## Countries

### GET /api/countries

Get current country mode and lists.

**Response:**

```json
{
  "mode": "default",
  "active": ["FR", "DE", "GB"],
  "available": ["US", "GB", "DE", "FR", "CA", "AU", "..."],
  "defaults": ["FR", "DE", "GB"]
}
```

### POST /api/countries

Set the country testing mode.

**Request body:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `mode` | string | `"default"` or `"all"` | `default` = 3 countries, `all` = 61 countries |

```json
{ "mode": "all" }
```

**Response:**

```json
{
  "ok": true,
  "mode": "all",
  "active": ["US", "GB", "DE", "FR", "CA", "..."],
  "count": 61
}
```

---

## Test Actions

### POST /api/run

Start a full test run. Tests all untested and previously failed sites. Skips sites that already passed.

**Request body:** None.

**Response:**

```json
{
  "ok": true,
  "runId": 6,
  "plan": { "untested": 30, "failed": 20 }
}
```

**Errors:**

```json
{ "error": "Already running" }
```

If a paused run exists (from a previous `POST /api/stop`), it resumes automatically.

### POST /api/retry-failed

Retry only sites with a `FAIL` verdict. Continues the most recent run number instead of creating a new one.

**Request body:** None.

**Response:**

```json
{ "ok": true, "runId": 5, "count": 42 }
```

**Errors:**

```json
{ "error": "Already running" }
{ "error": "No failed sites to retry" }
```

### POST /api/test-one

Test a single site across all active countries.

**Request body:**

```json
{ "url": "https://www.google.com" }
```

**Response:**

```json
{ "ok": true, "runId": 7 }
```

**Errors:**

```json
{ "error": "Already running" }
{ "error": "Site not found" }
```

The URL must match an entry in `data/sites.json` exactly.

### POST /api/stop

Stop the active test run. Saves the run state so it can be resumed later.

**Request body:** None.

**Response:**

```json
{ "ok": true }
```

### POST /api/clear

Clear all current results from memory and disk.

**Request body:** None.

**Response:**

```json
{ "ok": true }
```

---

## Run History

### GET /api/runs

List all saved test runs.

**Response:**

```json
{
  "runs": [
    {
      "number": 1,
      "type": "full",
      "label": "Test #1",
      "startedAt": "2026-03-30T10:00:00.000Z",
      "endedAt": "2026-03-30T10:15:00.000Z",
      "durationMs": 900000,
      "creditsStart": 95.00,
      "creditsEnd": 91.65,
      "creditsSpent": 3.35,
      "totalProbes": 225,
      "passProbes": 68,
      "failProbes": 157,
      "realBlocks": 42,
      "totalBandwidth": 4521000,
      "sitesTotal": 75,
      "sitesProcessed": 75,
      "summary": { "pass": 19, "fail": 56, "tested": 75 }
    }
  ],
  "activeRun": null
}
```

`activeRun` is the run number of the currently executing run, or `null`.

### GET /api/runs/:num

Get full data for a specific run, including per-site verdicts.

**URL parameter:** `num` -- integer run number.

**Response:**

```json
{
  "meta": {
    "number": 1,
    "type": "full",
    "label": "Test #1",
    "startedAt": "2026-03-30T10:00:00.000Z",
    "endedAt": "2026-03-30T10:15:00.000Z",
    "durationMs": 900000,
    "creditsStart": 95.00,
    "creditsEnd": 91.65,
    "creditsSpent": 3.35,
    "totalProbes": 225,
    "passProbes": 68,
    "failProbes": 157,
    "realBlocks": 42,
    "totalBandwidth": 4521000,
    "sitesTotal": 75,
    "sitesProcessed": 75,
    "summary": { "pass": 19, "fail": 56, "tested": 75 }
  },
  "siteResults": {
    "https://www.google.com": "PASS",
    "https://www.amazon.com": "FAIL"
  }
}
```

**Errors:**

```json
{ "error": "Invalid run number" }
{ "error": "Run not found" }
```

### POST /api/runs/save

Save the current results as a manual snapshot. Cannot be called while a test is running.

**Request body:** None.

**Response:**

```json
{
  "ok": true,
  "runNumber": 8,
  "summary": { "pass": 19, "fail": 56, "tested": 75 }
}
```

**Errors:**

```json
{ "error": "Cannot save while testing is active" }
{ "error": "No results to save" }
```

### POST /api/runs/load/:num

Load a previous run's results into the active dashboard. Replaces all current results. Cannot be called while a test is running.

**URL parameter:** `num` -- integer run number.

**Response:**

```json
{ "ok": true, "loaded": 3, "sitesLoaded": 75 }
```

**Errors:**

```json
{ "error": "Invalid run number" }
{ "error": "Cannot load while testing is active" }
{ "error": "Run not found" }
```

---

## SSE Event Stream

### GET /api/events

Server-Sent Events stream for real-time updates. Connect with `EventSource`:

```javascript
const es = new EventSource('/api/events');

es.addEventListener('result', (e) => {
  const result = JSON.parse(e.data);
  console.log(`${result.verdict} ${result.url}`);
});

es.addEventListener('done', (e) => {
  const { pass, fail, untested } = JSON.parse(e.data);
  console.log(`Complete: ${pass}/${fail}/${untested}`);
});
```

See [BUILD-ON-ME.md](BUILD-ON-ME.md#sse-events-reference) for the full event catalog with payload shapes.
