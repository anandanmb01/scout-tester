// ─── Scout Tester — Express Server ───
// Thin route layer. All logic lives in core/.

import express from 'express';
import { join } from 'path';
import { loadEnv, PORT, SCOUT_USER_URL, ROOT_DIR } from './core/constants.js';
import {
  getResults, setResults, deleteResult, loadSites, saveSites, saveResults,
  initResults, getScoutKey, persistScoutKey, removeScoutKey,
} from './core/results.js';
import {
  loadRunsIndex, getNextRunNumber, loadRunData, saveRunData, saveRunsIndex,
  migrateOldRuns,
} from './core/runs.js';
import {
  getActiveCountries, setCountryMode, getCountryMode,
  COUNTRIES_DEFAULT, COUNTRIES_ALL,
} from './core/countries.js';
import {
  getState, isTesting, setBroadcast, autoRun, retryRun, testOneSite, stopRun,
} from './core/runner.js';

// ─── Bootstrap ───

loadEnv();
initResults();
migrateOldRuns();

// ─── Express App ───

const app = express();
app.use(express.json());

// ─── SSE ───

let sseClients = [];

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter((c) => !c.writableEnded);
  sseClients.forEach((c) => c.write(msg));
}

// Wire broadcast into runner
setBroadcast(broadcast);

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter((c) => c !== res); });
});

const heartbeatInterval = setInterval(() => {
  const { testing, phase, currentUrl, sitesProcessed, sitesTotal, activeRun } = getState();
  broadcast('heartbeat', {
    t: Date.now(), testing, phase, currentUrl,
    sitesProcessed, sitesTotal,
    activeRun: activeRun ? {
      id: activeRun.number,
      type: activeRun.type,
      startedAt: activeRun.startedAt,
      totalProbes: activeRun.totalProbes,
      passProbes: activeRun.passProbes,
      failProbes: activeRun.failProbes,
      totalBandwidth: activeRun.totalBandwidth,
      sitesProcessed: activeRun.sitesProcessed,
      sitesTotal: activeRun.sitesTotal,
      creditsStart: activeRun.creditsStart,
      creditsSpent: activeRun.creditsSpent,
      elapsedBeforePause: activeRun.elapsedBeforePause || 0,
      resumedAt: activeRun.resumedAt || activeRun.startedAt,
    } : null,
  });
}, 5000);

// ─── Routes: Static ───

app.get('/', (req, res) => res.sendFile(join(ROOT_DIR, 'index.html')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Routes: Results & Sites ───

app.get('/api/results', (req, res) => {
  const results = getResults();
  const { testing, currentUrl, phase, sitesProcessed, sitesTotal, activeRun } = getState();
  const index = loadRunsIndex();
  res.json({
    results, testing, currentUrl, phase,
    sitesProcessed, sitesTotal,
    activeRun: activeRun ? {
      id: activeRun.number, type: activeRun.type,
      startedAt: activeRun.startedAt,
      totalProbes: activeRun.totalProbes,
      passProbes: activeRun.passProbes,
      failProbes: activeRun.failProbes,
      totalBandwidth: activeRun.totalBandwidth,
      sitesProcessed: activeRun.sitesProcessed,
      sitesTotal: activeRun.sitesTotal,
      creditsStart: activeRun.creditsStart,
    } : null,
    activeRunNumber: activeRun ? activeRun.number : null,
    totalRuns: index.runs.length,
  });
});

app.get('/api/sites', (req, res) => res.json(loadSites()));

app.get('/api/credits', async (req, res) => {
  const SCOUT_KEY = getScoutKey();
  try {
    const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const data = await r.json();
    res.json({ credits: data.credit_coin ?? '?' });
  } catch (err) {
    console.warn(`Failed to fetch credits: ${err.message}`);
    res.json({ credits: '?' });
  }
});

// ─── Routes: Country Mode ───

app.get('/api/countries', (req, res) => {
  res.json({
    mode: getCountryMode(),
    active: getActiveCountries(),
    available: COUNTRIES_ALL,
    defaults: COUNTRIES_DEFAULT,
  });
});

app.post('/api/countries', (req, res) => {
  const { mode } = req.body;
  const active = setCountryMode(mode);
  res.json({ ok: true, mode, active, count: active.length });
});

// ─── Routes: Account / API Key ───

app.get('/api/account', async (req, res) => {
  const SCOUT_KEY = getScoutKey();
  if (!SCOUT_KEY) return res.json({ connected: false, key: null, masked: null });

  const masked = SCOUT_KEY.slice(0, 12) + '...' + SCOUT_KEY.slice(-4);
  let credits = null;
  let userId = null;
  let totalJobs = null;

  try {
    const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const data = await r.json();
    credits = data.credit_coin ?? null;
    userId = data.user_id ?? data.id ?? null;
    totalJobs = data.total_jobs ?? null;
  } catch {}

  res.json({ connected: true, key: SCOUT_KEY, masked, credits, userId, totalJobs });
});

app.post('/api/account/connect', (req, res) => {
  const { key } = req.body;
  if (!key || !key.trim()) return res.json({ error: 'API key required' });
  const trimmed = key.trim();
  persistScoutKey(trimmed);
  res.json({ ok: true, masked: trimmed.slice(0, 12) + '...' + trimmed.slice(-4) });
});

app.post('/api/account/disconnect', (req, res) => {
  removeScoutKey();
  res.json({ ok: true });
});

// ─── Routes: Run History ───

app.get('/api/runs', (req, res) => {
  const index = loadRunsIndex();
  res.json({
    runs: index.runs,
    activeRun: index.activeRun,
  });
});

app.get('/api/runs/:num', (req, res) => {
  const num = parseInt(req.params.num);
  if (isNaN(num)) return res.status(400).json({ error: 'Invalid run number' });

  const data = loadRunData(num);
  if (!data) return res.status(404).json({ error: 'Run not found' });
  res.json(data);
});

app.post('/api/runs/load/:num', (req, res) => {
  const num = parseInt(req.params.num);
  if (isNaN(num)) return res.status(400).json({ error: 'Invalid run number' });
  if (isTesting()) return res.json({ error: 'Cannot load while testing is active' });

  const data = loadRunData(num);
  if (!data) return res.status(404).json({ error: 'Run not found' });

  // Replace live results with the run's site results
  const newResults = {};
  for (const [url, verdict] of Object.entries(data.siteResults || {})) {
    newResults[url] = {
      url,
      category: 'Loaded',
      status: verdict === 'PASS' ? 'pass' : 'fail',
      verdict,
      nodeResults: {},
      history: [],
      blockSignals: [],
      realBlocks: 0,
      totalProbes: 0,
      passedProbes: 0,
      lastTested: data.meta?.endedAt || null,
      attempts: 0,
    };
  }
  setResults(newResults);
  saveResults();

  broadcast('cleared', {});
  broadcast('state-update', { loadedRun: num, results: newResults });

  res.json({ ok: true, loaded: num, sitesLoaded: Object.keys(data.siteResults || {}).length });
});

app.post('/api/runs/save', (req, res) => {
  if (isTesting()) return res.json({ error: 'Cannot save while testing is active' });
  const results = getResults();
  if (Object.keys(results).length === 0) return res.json({ error: 'No results to save' });

  const num = getNextRunNumber();
  const now = new Date().toISOString();

  const pass = Object.values(results).filter((r) => r.verdict === 'PASS').length;
  const fail = Object.values(results).filter((r) => r.verdict === 'FAIL').length;
  const totalProbes = Object.values(results).reduce((sum, r) => sum + (r.totalProbes || 0), 0);
  const totalBandwidth = Object.values(results).reduce((sum, r) => {
    const hist = r.history || [];
    return sum + hist.reduce((s, h) => s + (h.contentLength || 0), 0);
  }, 0);

  const siteResults = {};
  for (const [url, r] of Object.entries(results)) {
    siteResults[url] = r.verdict;
  }

  const meta = {
    number: num,
    type: 'manual-save',
    label: `Manual Save #${num}`,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    creditsStart: null,
    creditsEnd: null,
    creditsSpent: null,
    totalProbes,
    passProbes: Object.values(results).reduce((sum, r) => sum + (r.passedProbes || 0), 0),
    failProbes: totalProbes - Object.values(results).reduce((sum, r) => sum + (r.passedProbes || 0), 0),
    realBlocks: Object.values(results).reduce((sum, r) => sum + (r.realBlocks || 0), 0),
    totalBandwidth,
    sitesTotal: Object.keys(results).length,
    sitesProcessed: Object.keys(results).length,
    summary: { pass, fail, tested: pass + fail },
  };

  saveRunData(num, { meta, siteResults });

  const index = loadRunsIndex();
  index.runs.push(meta);
  saveRunsIndex(index);

  res.json({ ok: true, runNumber: num, summary: meta.summary });
});

// ─── Routes: Actions ───

app.post('/api/run', (req, res) => {
  if (isTesting()) return res.json({ error: 'Already running' });
  const sites = loadSites();
  const results = getResults();
  const untested = sites.filter((s) => !results[s.url]).length;
  const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL').length;
  const nextNum = getNextRunNumber();
  res.json({ ok: true, runId: nextNum, plan: { untested, failed } });
  autoRun('full');
});

app.post('/api/retry-failed', (req, res) => {
  if (isTesting()) return res.json({ error: 'Already running' });
  const sites = loadSites();
  const results = getResults();
  const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL');
  if (failed.length === 0) return res.json({ error: 'No failed sites to retry' });
  const index = loadRunsIndex();
  const lastNum = index.runs.length > 0 ? index.runs[index.runs.length - 1].number : 1;
  res.json({ ok: true, runId: lastNum, count: failed.length });
  retryRun(sites, failed);
});

app.post('/api/test-one', (req, res) => {
  if (isTesting()) return res.json({ error: 'Already running' });
  const { url } = req.body;
  const sites = loadSites();
  const site = sites.find((s) => s.url === url);
  if (!site) return res.json({ error: 'Site not found' });

  const run = testOneSite(site);
  res.json({ ok: true, runId: run.number });
});

app.post('/api/stop', (req, res) => {
  stopRun();
  res.json({ ok: true });
});

app.post('/api/add-site', (req, res) => {
  let { url, category } = req.body;
  if (!url) return res.json({ error: 'URL required' });
  if (!url.startsWith('http')) url = 'https://' + url;
  const sites = loadSites();
  if (sites.find((s) => s.url === url)) return res.json({ error: 'Already exists' });
  sites.push({ url, category: category || 'Custom' });
  saveSites(sites);
  res.json({ ok: true, total: sites.length });
});

app.post('/api/remove-site', (req, res) => {
  const { url } = req.body;
  let sites = loadSites();
  sites = sites.filter((s) => s.url !== url);
  saveSites(sites);
  deleteResult(url);
  saveResults();
  res.json({ ok: true });
});

app.post('/api/clear', (req, res) => {
  setResults({});
  saveResults();
  broadcast('cleared', {});
  res.json({ ok: true });
});

// ─── Start Server ───

const server = app.listen(PORT, () => {
  const sites = loadSites();
  const results = getResults();
  const prev = Object.keys(results).length;
  const passes = Object.values(results).filter((r) => r.verdict === 'PASS').length;
  const index = loadRunsIndex();
  console.log(`\n  Scout Block Check`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  ${sites.length} sites | ${prev} tested | ${passes} passing`);
  console.log(`  ${index.runs.length} previous test runs\n`);
});

// ─── Graceful Shutdown ───

function shutdown(signal) {
  console.log(`\n  ${signal} received — shutting down...`);
  clearInterval(heartbeatInterval);
  sseClients.forEach((c) => {
    try { c.end(); } catch (err) { console.warn(`SSE cleanup: ${err.message}`); }
  });
  server.close(() => {
    console.log('  Server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
