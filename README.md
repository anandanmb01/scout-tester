# Scout Tester

Automated block-detection testing for the [Sentinel Scout API](https://api.scout.sentinel.co). Tests 75+ high-demand websites across multiple countries through Sentinel's decentralized proxy network, detecting blocks, CAPTCHAs, and anti-bot measures with a real-time browser dashboard.

![Screenshot placeholder](docs/screenshot.png)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Add your Scout API key
echo "SCOUT_KEY=scout-c1_YOUR_KEY_HERE" > .env

# 3. Start the server
npm start

# 4. Open the dashboard
# http://localhost:3004
```

You can also connect your API key from the dashboard UI after starting the server.

---

## Features

- **75 curated sites** across 13 categories (search, social, news, e-commerce, streaming, finance, tech, reference, jobs, real estate, government, travel, reviews, cloud, AI)
- **3 country modes** -- Default (FR/DE/GB), All (61 countries), or Custom
- **Batch parallel testing** -- 5 sites tested simultaneously per batch
- **Real-time SSE dashboard** -- live progress, probe results, and credit tracking streamed to the browser
- **Run history** -- every test run saved with full metadata (duration, credits spent, pass/fail counts, bandwidth)
- **Pause and resume** -- stop a run mid-flight and pick up where you left off
- **Block signal detection** -- identifies CAPTCHA, Cloudflare challenges, bot detection, JS-required walls, rate limiting, IP blocks
- **Data type detection** -- classifies responses as HTML, JSON, XML, PDF, images, or plain text
- **Credit tracking** -- monitors Scout API credit balance before, during, and after runs
- **Site management** -- add/remove sites via API or edit `data/sites.json`
- **Export and load** -- save snapshots of results, load previous runs for comparison
- **Retry failed** -- re-test only the sites that failed, continuing the same run number

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/results` | All current results + run state |
| GET | `/api/sites` | Site list from `data/sites.json` |
| GET | `/api/credits` | Current Scout API credit balance |
| GET | `/api/account` | Account connection status + stats |
| GET | `/api/countries` | Active country mode and list |
| GET | `/api/runs` | Run history index |
| GET | `/api/runs/:num` | Full data for a specific run |
| GET | `/api/events` | SSE event stream |
| POST | `/api/run` | Start a full test run |
| POST | `/api/retry-failed` | Retry only failed sites |
| POST | `/api/test-one` | Test a single site |
| POST | `/api/stop` | Stop/pause the active run |
| POST | `/api/countries` | Set country mode (`default` or `all`) |
| POST | `/api/account/connect` | Connect Scout API key |
| POST | `/api/account/disconnect` | Disconnect Scout API key |
| POST | `/api/runs/save` | Save current results as a run snapshot |
| POST | `/api/runs/load/:num` | Load a previous run into active results |
| POST | `/api/add-site` | Add a site to the test list |
| POST | `/api/remove-site` | Remove a site from the test list |
| POST | `/api/clear` | Clear all current results |

See [docs/API-REFERENCE.md](docs/API-REFERENCE.md) for full request/response details.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ES Modules) |
| Server | Express 4 |
| Real-time | Server-Sent Events (SSE) |
| Proxy API | Sentinel Scout API |
| Frontend | Single-file HTML + vanilla JS |
| Data | JSON files on disk (`data/`) |

---

## Project Structure

```
scout-tester/
  server.js           # Express server + all route handlers
  index.html          # Single-page dashboard UI
  package.json
  start.bat           # Windows launcher
  .env                # SCOUT_KEY (not committed)
  core/
    constants.js      # Ports, URLs, country lists, batch settings
    countries.js      # Country mode state management
  data/
    sites.json        # 75 test sites with categories
    results.json      # Current test results
    runs/             # Run history (one directory per run)
      index.json      # Run metadata index
      test-001/       # Individual run data
      test-002/
```

---

## License

MIT
