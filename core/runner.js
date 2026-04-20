// ─── Test Runner & Batch Pipeline ───

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { BATCH_SIZE, BATCH_GAP, SCOUT_USER_URL, COUNTRIES_ALL, DATA_DIR } from './constants.js';
import { join } from 'path';
import { rawProbe } from './probe.js';
import { getActiveCountries } from './countries.js';
import { getResults, loadSites, saveTestResult, getScoutKey } from './results.js';

const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
import {
  loadRunsIndex, saveRunsIndex, getNextRunNumber,
  saveRunData, loadPausedRun, clearPausedRun, savePausedRun,
} from './runs.js';

// ─── Helpers ───

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── State ───

let testing = false;
let currentUrl = null;
let phase = 'idle';
let sitesProcessed = 0;
let sitesTotal = 0;
let activeRun = null;
let broadcast = () => {};

// ─── Settings ───

let autoRetestEnabled = false;
let autoRetestMax = 3;
let fireAllMode = false;
let batchSize = BATCH_SIZE;
let batchGap = BATCH_GAP;
let retryAllCountries = false;
let expandCountriesAfter = 2;

// Load saved settings from disk
try {
  if (existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    if (saved.autoRetestEnabled !== undefined) autoRetestEnabled = saved.autoRetestEnabled;
    if (saved.autoRetestMax !== undefined) autoRetestMax = saved.autoRetestMax;
    if (saved.fireAllMode !== undefined) fireAllMode = saved.fireAllMode;
    if (saved.batchSize !== undefined) batchSize = saved.batchSize;
    if (saved.batchGap !== undefined) batchGap = saved.batchGap;
    if (saved.retryAllCountries !== undefined) retryAllCountries = saved.retryAllCountries;
    if (saved.expandCountriesAfter !== undefined) expandCountriesAfter = saved.expandCountriesAfter;
  }
} catch {}

export function getSettings() {
  return { autoRetestEnabled, autoRetestMax, fireAllMode, batchSize, batchGap, retryAllCountries, expandCountriesAfter };
}

export function updateSettings(opts) {
  if (opts.autoRetest !== undefined) autoRetestEnabled = !!opts.autoRetest;
  if (opts.autoRetestMax !== undefined) autoRetestMax = Math.min(100, Math.max(1, parseInt(opts.autoRetestMax) || 3));
  if (opts.fireAll !== undefined) fireAllMode = !!opts.fireAll;
  if (opts.batchSize !== undefined) batchSize = Math.min(100, Math.max(1, parseInt(opts.batchSize) || 5));
  if (opts.batchGap !== undefined) batchGap = Math.max(0, parseInt(opts.batchGap ?? 500));
  if (opts.retryAllCountries !== undefined) retryAllCountries = !!opts.retryAllCountries;
  if (opts.expandCountriesAfter !== undefined) expandCountriesAfter = Math.max(1, parseInt(opts.expandCountriesAfter) || 2);
  // Persist to disk
  try { writeFileSync(SETTINGS_FILE, JSON.stringify(getSettings(), null, 2)); } catch {}
  return getSettings();
}

// ─── State Accessors ───

export function getState() {
  return { testing, currentUrl, phase, sitesProcessed, sitesTotal, activeRun };
}

export function isTesting() {
  return testing;
}

export function setBroadcast(fn) {
  broadcast = fn;
}

// ─── Active Run Tracking ───

// Cache run index in memory to avoid repeated disk reads
let cachedIndex = null;

function getCachedIndex() {
  if (!cachedIndex) cachedIndex = loadRunsIndex();
  return cachedIndex;
}

function startRun(type) {
  const index = getCachedIndex();
  const runNumber = index.runs.length > 0 ? Math.max(...index.runs.map((r) => r.number)) + 1 : 1;

  activeRun = {
    number: runNumber, type,
    label: `Test #${runNumber}`,
    startedAt: new Date().toISOString(),
    endedAt: null, durationMs: 0,
    creditsStart: null, creditsEnd: null, creditsSpent: null,
    totalProbes: 0, passProbes: 0, failProbes: 0, realBlocks: 0,
    totalBandwidth: 0, sitesTotal: 0, sitesProcessed: 0, siteResults: {},
  };

  // Save index in background
  index.activeRun = runNumber;
  setTimeout(() => { try { saveRunsIndex(index); } catch {} }, 0);

  broadcast('run-start', { id: runNumber, type, startedAt: activeRun.startedAt });
  return activeRun;
}

function continueRun(type) {
  const index = getCachedIndex();
  const lastRun = index.runs.length > 0 ? index.runs[index.runs.length - 1] : null;
  const runNumber = lastRun ? lastRun.number : 1;

  // Carry forward creditsStart from previous run so total spend accumulates
  const prevCreditsStart = lastRun?.creditsStart ?? null;

  activeRun = {
    number: runNumber, type,
    label: `Test #${runNumber}`,
    startedAt: new Date().toISOString(),
    endedAt: null, durationMs: 0,
    creditsStart: prevCreditsStart, creditsEnd: null, creditsSpent: lastRun?.creditsSpent ?? null,
    totalProbes: 0, passProbes: 0, failProbes: 0, realBlocks: 0,
    totalBandwidth: 0, sitesTotal: 0, sitesProcessed: 0, siteResults: {},
  };

  index.activeRun = runNumber;
  setTimeout(() => { try { saveRunsIndex(index); } catch {} }, 0);

  broadcast('run-start', { id: runNumber, type, startedAt: activeRun.startedAt });
  return activeRun;
}

function recordProbe(url, nr) {
  if (!activeRun) return;
  activeRun.totalProbes++;
  if (nr.passed) activeRun.passProbes++;
  else activeRun.failProbes++;
  if (!nr.passed && nr.responseTime >= 2000) activeRun.realBlocks++;
  activeRun.totalBandwidth += nr.contentLength || 0;
}

function recordSiteResult(url, verdict) {
  if (!activeRun) return;
  activeRun.siteResults[url] = verdict;
  activeRun.sitesProcessed = Object.keys(activeRun.siteResults).length;
}

async function finalizeRun() {
  if (!activeRun) return;
  activeRun.endedAt = new Date().toISOString();
  const thisSegment = Date.now() - new Date(activeRun.resumedAt || activeRun.startedAt).getTime();
  activeRun.durationMs = (activeRun.elapsedBeforePause || 0) + thisSegment;
  clearPausedRun();

  // Capture ending credits — final calculation (retry once on failure)
  const SCOUT_KEY = getScoutKey();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await r.json();
      activeRun.creditsEnd = data.credit_coin ?? null;
      if (activeRun.creditsEnd !== null) {
        if (activeRun.creditsStart === null) activeRun.creditsStart = activeRun.creditsEnd;
        activeRun.creditsSpent = +(activeRun.creditsStart - activeRun.creditsEnd).toFixed(2);
      }
      break;
    } catch (err) {
      console.warn(`Failed to fetch end credits (attempt ${attempt + 1}): ${err.message}`);
      if (attempt === 0) await sleep(2000);
    }
  }
  // Preserve batch-polled creditsSpent if end fetch failed; only default to 0 if nothing was tracked
  if (activeRun.creditsSpent === null) activeRun.creditsSpent = 0;

  const pass = Object.values(activeRun.siteResults).filter((v) => v === 'PASS').length;
  const fail = Object.values(activeRun.siteResults).filter((v) => v === 'FAIL').length;
  activeRun.summary = { pass, fail, tested: pass + fail };

  // Build metadata (everything except siteResults)
  const meta = {
    number: activeRun.number,
    type: activeRun.type,
    label: activeRun.label,
    startedAt: activeRun.startedAt,
    endedAt: activeRun.endedAt,
    durationMs: activeRun.durationMs,
    creditsStart: activeRun.creditsStart,
    creditsEnd: activeRun.creditsEnd,
    creditsSpent: activeRun.creditsSpent,
    totalProbes: activeRun.totalProbes,
    passProbes: activeRun.passProbes,
    failProbes: activeRun.failProbes,
    realBlocks: activeRun.realBlocks,
    totalBandwidth: activeRun.totalBandwidth,
    sitesTotal: activeRun.sitesTotal,
    sitesProcessed: activeRun.sitesProcessed,
    summary: activeRun.summary,
  };

  // Save full run data to its own directory
  saveRunData(activeRun.number, { meta, siteResults: activeRun.siteResults });

  // Update runs index
  const index = loadRunsIndex();
  const existingIdx = index.runs.findIndex((r) => r.number === activeRun.number);
  if (existingIdx >= 0) {
    index.runs[existingIdx] = meta;
  } else {
    index.runs.push(meta);
  }
  index.activeRun = null;
  saveRunsIndex(index);
  cachedIndex = index;

  broadcast('run-end', { ...meta, siteResults: activeRun.siteResults });
  const finishedRun = activeRun;
  activeRun = null;
  return finishedRun;
}

// ─── Full Site Test (all countries in parallel) ───

async function testSite(site, useAllCountries = false) {
  const SCOUT_KEY = getScoutKey();
  const countries = useAllCountries ? COUNTRIES_ALL : getActiveCountries();
  const probeResults = await Promise.all(
    countries.map((country) => rawProbe(site.url, country, SCOUT_KEY)),
  );

  // Record each probe in the active run
  for (const nr of probeResults) {
    recordProbe(site.url, nr);
  }

  const passed = probeResults.some((nr) => nr.passed);
  const shortUrl = site.url.replace(/^https?:\/\/(www\.)?/, '');
  broadcast('activity', {
    type: 'probe-done',
    message: `${passed ? 'PASS' : 'FAIL'} ${shortUrl}`,
    url: site.url,
  });

  const result = saveTestResult(site.url, site.category, probeResults, {
    recordSiteResult,
    broadcast,
  });
  return result;
}

// ─── Batch Runner (parallel) ───

async function runBatch(siteList, label, startOffset = 0, useAllCountries = false) {
  const SCOUT_KEY = getScoutKey();
  const bs = batchSize;
  console.log(`  [runner] batch=${bs} gap=${batchGap}ms allCountries=${useAllCountries} sites=${siteList.length}`);
  let completed = 0;
  for (let i = 0; i < siteList.length; i += bs) {
    if (!testing) break;
    const batch = siteList.slice(i, i + bs);
    const batchNum = Math.floor(i / bs) + 1;
    const totalBatches = Math.ceil(siteList.length / bs);
    broadcast('activity', {
      type: 'batch',
      message: `Batch ${batchNum}/${totalBatches} — ${batch.length} sites (${startOffset + completed}/${sitesTotal} done)`,
    });

    await Promise.all(batch.map(async (site) => {
      await testSite(site, useAllCountries);
      completed++;
      sitesProcessed = startOffset + completed;
    }));

    // Broadcast run stats immediately (non-blocking)
    if (activeRun) {
      broadcast('run-update', {
        id: activeRun.number,
        totalProbes: activeRun.totalProbes,
        passProbes: activeRun.passProbes,
        failProbes: activeRun.failProbes,
        totalBandwidth: activeRun.totalBandwidth,
        creditsSpent: activeRun.creditsSpent,
      });
      // Credit poll in background — don't block next batch
      fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } })
        .then((r) => r.json())
        .then((data) => {
          if (data.credit_coin != null && activeRun) {
            if (activeRun.creditsStart === null) activeRun.creditsStart = data.credit_coin;
            activeRun.creditsSpent = +(activeRun.creditsStart - data.credit_coin).toFixed(2);
            broadcast('run-update', { id: activeRun.number, creditsSpent: activeRun.creditsSpent });
          }
        })
        .catch(() => {});
    }

    if (i + bs < siteList.length && testing && batchGap > 0) await sleep(batchGap);
  }
}

// ─── Fire All Runner (no batching) ───

async function runFireAll(siteList, label, startOffset = 0, useAllCountries = false) {
  const SCOUT_KEY = getScoutKey();
  broadcast('activity', {
    type: 'fire-all',
    message: `${label} — firing ALL ${siteList.length} sites simultaneously`,
  });

  let completed = 0;
  await Promise.all(siteList.map(async (site) => {
    await testSite(site, useAllCountries);
    completed++;
    sitesProcessed = startOffset + completed;
  }));

  // Credits poll once at the end
  if (activeRun) {
    try {
      const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await r.json();
      const currentCredits = data.credit_coin ?? null;
      if (activeRun.creditsStart !== null && currentCredits !== null) {
        activeRun.creditsSpent = +(activeRun.creditsStart - currentCredits).toFixed(2);
        broadcast('credits-update', { credits: currentCredits, spent: activeRun.creditsSpent });
      }
    } catch {}
  }
}

// ─── Run Sites (picks batch or fire-all) ───

async function runSites(siteList, label, startOffset = 0, useAllCountries = false) {
  if (fireAllMode) {
    await runFireAll(siteList, label, startOffset, useAllCountries);
  } else {
    await runBatch(siteList, label, startOffset, useAllCountries);
  }
}

// ─── Finish ───

async function finish() {
  testing = false;
  currentUrl = null;
  phase = 'idle';
  sitesProcessed = 0;
  sitesTotal = 0;

  const finishedRun = await finalizeRun();

  const sites = loadSites();
  const results = getResults();
  const pass = sites.filter((s) => results[s.url]?.verdict === 'PASS').length;
  const fail = sites.filter((s) => results[s.url]?.verdict === 'FAIL').length;
  const untested = sites.filter((s) => !results[s.url]).length;

  broadcast('done', { pass, fail, untested, run: finishedRun });
  broadcast('phase', {
    phase: 'idle',
    message: `Done — ${pass} pass, ${fail} fail, ${untested} untested`,
  });
}

// ─── Auto Run Pipeline ───

export async function autoRun(type = 'full') {
  testing = true;
  sitesProcessed = 0;
  const sites = loadSites();
  const results = getResults();
  const SCOUT_KEY = getScoutKey();

  // Start run immediately — no blocking I/O
  const run = startRun(type);
  run.elapsedBeforePause = 0;
  run.resumedAt = run.startedAt;

  // Quick carry-forward
  for (const r of Object.values(results)) {
    run.totalProbes += r.totalProbes || 0;
    run.passProbes += r.passedProbes || 0;
    run.failProbes += (r.totalProbes || 0) - (r.passedProbes || 0);
    // Sum bandwidth from nodeResults (fast, no history scan)
    for (const nr of Object.values(r.nodeResults || {})) {
      run.totalBandwidth += nr.contentLength || 0;
    }
    run.siteResults[r.url] = r.verdict;
  }

  // Capture starting credits BEFORE probes begin
  try {
    const cr = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const cData = await cr.json();
    run.creditsStart = cData.credit_coin ?? null;
  } catch (err) {
    console.warn(`Failed to fetch start credits: ${err.message}`);
  }

  const mode = fireAllMode ? 'fire-all' : `batch ${batchSize}`;

  if (type === 'retry') {
    const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL');
    run.sitesTotal = sites.length;
    sitesTotal = sites.length;
    sitesProcessed = sites.length - failed.length;
    phase = 'retrying';
    broadcast('phase', {
      phase: 'retrying', count: failed.length,
      message: `Test #${run.number} — Retrying ${failed.length} failed sites (${mode})...`,
    });
    await runSites(failed, `Test #${run.number} retry`, sites.length - failed.length);
  } else {
    const untested = sites.filter((s) => !results[s.url]);
    const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL');
    const alreadyPassed = sites.filter((s) => results[s.url]?.verdict === 'PASS').length;
    const allTargets = [...untested, ...failed];
    run.sitesTotal = sites.length;
    sitesTotal = sites.length;
    sitesProcessed = alreadyPassed;

    phase = 'scanning';
    broadcast('phase', {
      phase: 'scanning', count: allTargets.length,
      message: `Test #${run.number} — Testing ${allTargets.length} remaining of ${sites.length} sites (${mode})...`,
    });
    await runSites(allTargets, `Test #${run.number}`, alreadyPassed);
  }

  // Auto-retest failed sites
  console.log(`  [runner] auto-retest check: testing=${testing} enabled=${autoRetestEnabled} max=${autoRetestMax}`);
  if (testing && autoRetestEnabled) {
    for (let retryRound = 1; retryRound <= autoRetestMax; retryRound++) {
      if (!testing) break;
      const freshResults = getResults();
      const stillFailed = sites.filter((s) => freshResults[s.url]?.verdict === 'FAIL');
      if (stillFailed.length === 0) break;

      // Expand to all countries after the configured retry threshold
      const useAll = retryRound >= expandCountriesAfter;
      const countryLabel = useAll ? 'all 61 countries' : `${getActiveCountries().length} countries`;

      phase = 'auto-retest';
      const retestCountries = useAll ? COUNTRIES_ALL : getActiveCountries();
      broadcast('phase', {
        phase: 'auto-retest', count: stillFailed.length, round: retryRound, maxRounds: autoRetestMax,
        countries: retestCountries,
        message: `Test #${run.number} — Retest ${retryRound}/${autoRetestMax}: ${stillFailed.length} sites (${countryLabel})...`,
      });
      await runSites(stillFailed, `Retest ${retryRound}/${autoRetestMax}`, sites.length - stillFailed.length, useAll);
    }
  }

  finish();
}

// ─── Retry Run ───

export async function retryRun(sites, failed) {
  testing = true;
  sitesProcessed = 0;
  const results = getResults();
  const SCOUT_KEY = getScoutKey();

  const run = continueRun('retry');

  // Quick carry-forward
  for (const r of Object.values(results)) {
    run.totalProbes += r.totalProbes || 0;
    run.passProbes += r.passedProbes || 0;
    run.failProbes += (r.totalProbes || 0) - (r.passedProbes || 0);
    for (const nr of Object.values(r.nodeResults || {})) run.totalBandwidth += nr.contentLength || 0;
    run.siteResults[r.url] = r.verdict;
  }

  // Capture starting credits BEFORE probes begin
  try {
    const cr = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const cData = await cr.json();
    if (cData.credit_coin != null) run.creditsStart = cData.credit_coin;
  } catch (err) {
    console.warn(`Failed to fetch start credits: ${err.message}`);
  }

  const useAll = retryAllCountries;
  const mode = fireAllMode ? 'fire-all' : `batch ${batchSize}`;
  const countryLabel = useAll ? 'all countries' : `${getActiveCountries().length} countries`;

  run.sitesTotal = sites.length;
  sitesTotal = sites.length;
  sitesProcessed = sites.length - failed.length;
  const retryCountries = useAll ? COUNTRIES_ALL : getActiveCountries();
  phase = 'retrying';
  broadcast('phase', {
    phase: 'retrying', count: failed.length,
    countries: retryCountries,
    message: `Test #${run.number} — Retrying ${failed.length} failed sites (${mode}, ${countryLabel})...`,
  });
  await runSites(failed, `Test #${run.number} retry`, sites.length - failed.length, useAll);

  // Auto-retest if enabled
  if (testing && autoRetestEnabled) {
    for (let retryRound = 1; retryRound <= autoRetestMax; retryRound++) {
      if (!testing) break;
      const freshResults = getResults();
      const stillFailed = sites.filter((s) => freshResults[s.url]?.verdict === 'FAIL');
      if (stillFailed.length === 0) break;

      const useAllR = retryRound >= expandCountriesAfter;
      const cLabel = useAllR ? 'all 61 countries' : `${getActiveCountries().length} countries`;
      const retestCountriesR = useAllR ? COUNTRIES_ALL : getActiveCountries();

      phase = 'auto-retest';
      broadcast('phase', {
        phase: 'auto-retest', count: stillFailed.length, round: retryRound, maxRounds: autoRetestMax,
        countries: retestCountriesR,
        message: `Test #${run.number} — Retest ${retryRound}/${autoRetestMax}: ${stillFailed.length} sites (${cLabel})...`,
      });
      await runSites(stillFailed, `Retest ${retryRound}/${autoRetestMax}`, sites.length - stillFailed.length, useAllR);
    }
  }

  finish();
}

// ─── Test Single Site ───
// Returns the run number synchronously, then runs the test in the background.

export function testOneSite(site) {
  testing = true;
  phase = 'single';
  const SCOUT_KEY = getScoutKey();
  const run = startRun('single');
  run.sitesTotal = 1;

  // Fire-and-forget: fetch credits, run test, finalize
  (async () => {
    try {
      const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await r.json();
      run.creditsStart = data.credit_coin ?? null;
    } catch (err) {
      console.warn(`Failed to fetch start credits: ${err.message}`);
    }

    if (testing) await testSite(site);
    testing = false;
    phase = 'idle';
    await finalizeRun();
    broadcast('phase', { phase: 'idle', message: 'Single test complete' });
  })();

  return run;
}

// ─── Stop ───

export function stopRun() {
  testing = false;
  phase = 'idle';
  // Save run state so Resume can continue from here
  if (activeRun) {
    activeRun.pausedAt = new Date().toISOString();
    activeRun.elapsedBeforePause = (activeRun.elapsedBeforePause || 0) +
      (Date.now() - new Date(activeRun.resumedAt || activeRun.startedAt).getTime());
    savePausedRun(activeRun);
    activeRun = null;
  }
  broadcast('phase', { phase: 'idle', message: 'Stopped — Resume to continue' });
}
