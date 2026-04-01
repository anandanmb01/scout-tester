// ─── Test Runner & Batch Pipeline ───

import { BATCH_SIZE, BATCH_GAP, SCOUT_USER_URL } from './constants.js';
import { rawProbe } from './probe.js';
import { getActiveCountries } from './countries.js';
import { getResults, loadSites, saveTestResult, getScoutKey } from './results.js';
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

function startRun(type) {
  const runNumber = getNextRunNumber();
  activeRun = {
    number: runNumber,
    type,
    label: `Test #${runNumber}`,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: 0,
    creditsStart: null,
    creditsEnd: null,
    creditsSpent: null,
    totalProbes: 0,
    passProbes: 0,
    failProbes: 0,
    realBlocks: 0,
    totalBandwidth: 0,
    sitesTotal: 0,
    sitesProcessed: 0,
    siteResults: {},
  };

  // Register in index as active
  const index = loadRunsIndex();
  index.activeRun = runNumber;
  saveRunsIndex(index);

  broadcast('run-start', { id: runNumber, type, startedAt: activeRun.startedAt });
  return activeRun;
}

function continueRun(type) {
  // Reuse the last run number instead of creating a new one
  const index = loadRunsIndex();
  const lastRun = index.runs.length > 0 ? index.runs[index.runs.length - 1] : null;
  const runNumber = lastRun ? lastRun.number : getNextRunNumber();

  activeRun = {
    number: runNumber,
    type,
    label: `Test #${runNumber}`,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: 0,
    creditsStart: null,
    creditsEnd: null,
    creditsSpent: null,
    totalProbes: 0,
    passProbes: 0,
    failProbes: 0,
    realBlocks: 0,
    totalBandwidth: 0,
    sitesTotal: 0,
    sitesProcessed: 0,
    siteResults: {},
  };

  index.activeRun = runNumber;
  saveRunsIndex(index);

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
  activeRun.sitesProcessed++;
}

async function finalizeRun() {
  if (!activeRun) return;
  activeRun.endedAt = new Date().toISOString();
  const thisSegment = Date.now() - new Date(activeRun.resumedAt || activeRun.startedAt).getTime();
  activeRun.durationMs = (activeRun.elapsedBeforePause || 0) + thisSegment;
  clearPausedRun();

  // Capture ending credits
  const SCOUT_KEY = getScoutKey();
  try {
    const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const data = await r.json();
    activeRun.creditsEnd = data.credit_coin ?? null;
    if (activeRun.creditsStart !== null && activeRun.creditsEnd !== null) {
      activeRun.creditsSpent = +(activeRun.creditsStart - activeRun.creditsEnd).toFixed(2);
    }
  } catch (err) {
    console.warn(`Failed to fetch end credits: ${err.message}`);
  }

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

  broadcast('run-end', { ...meta, siteResults: activeRun.siteResults });
  const finishedRun = activeRun;
  activeRun = null;
  return finishedRun;
}

// ─── Full Site Test (all countries in parallel) ───

async function testSite(site) {
  const SCOUT_KEY = getScoutKey();
  const countries = getActiveCountries();
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

async function runBatch(siteList, label, startOffset = 0) {
  const SCOUT_KEY = getScoutKey();
  let completed = 0;
  for (let i = 0; i < siteList.length; i += BATCH_SIZE) {
    if (!testing) break;
    const batch = siteList.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(siteList.length / BATCH_SIZE);
    broadcast('activity', {
      type: 'batch',
      message: `Batch ${batchNum}/${totalBatches} — ${batch.length} sites (${startOffset + completed}/${sitesTotal} done)`,
    });

    await Promise.all(batch.map(async (site) => {
      await testSite(site);
      completed++;
      sitesProcessed = startOffset + completed;
    }));

    // Poll credits after each batch for live spend tracking
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

    if (i + BATCH_SIZE < siteList.length && testing) await sleep(BATCH_GAP);
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

  // Check for paused run to restore
  const paused = loadPausedRun();
  let run;

  if (paused && paused.number && type === 'full') {
    // Resume paused run — restore all state
    run = paused;
    run.resumedAt = new Date().toISOString();
    activeRun = run;

    const index = loadRunsIndex();
    index.activeRun = run.number;
    saveRunsIndex(index);

    broadcast('run-start', {
      id: run.number, type: run.type, startedAt: run.startedAt,
      resumed: true, elapsedBeforePause: run.elapsedBeforePause || 0,
      creditsSpent: run.creditsSpent, totalProbes: run.totalProbes,
      totalBandwidth: run.totalBandwidth,
    });
    clearPausedRun();
  } else {
    // Fresh run
    run = startRun(type);
    run.elapsedBeforePause = 0;
    run.resumedAt = run.startedAt;

    // Carry forward existing data from previous probes in current results
    for (const r of Object.values(results)) {
      const hist = r.history || [];
      for (const h of hist) {
        run.totalProbes++;
        if (h.status === 'pass') run.passProbes++;
        else run.failProbes++;
        run.totalBandwidth += h.contentLength || 0;
      }
      run.siteResults[r.url] = r.verdict;
    }

    // Capture starting credits
    try {
      const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await r.json();
      run.creditsStart = data.credit_coin ?? null;
    } catch (err) {
      console.warn(`Failed to fetch start credits: ${err.message}`);
    }
    clearPausedRun();
  }

  if (type === 'retry') {
    const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL');
    run.sitesTotal = sites.length;
    sitesTotal = sites.length;
    sitesProcessed = sites.length - failed.length;
    phase = 'retrying';
    broadcast('phase', {
      phase: 'retrying', count: failed.length,
      message: `Test #${run.number} — Retrying ${failed.length} failed sites (${BATCH_SIZE} parallel)...`,
    });
    await runBatch(failed, `Test #${run.number} retry`, sites.length - failed.length);
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
      message: `Test #${run.number} — Testing ${allTargets.length} remaining of ${sites.length} sites (${BATCH_SIZE} parallel)...`,
    });
    await runBatch(allTargets, `Test #${run.number}`, alreadyPassed);
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

  // Carry forward existing data
  for (const r of Object.values(results)) {
    const hist = r.history || [];
    for (const h of hist) {
      run.totalProbes++;
      if (h.status === 'pass') run.passProbes++;
      else run.failProbes++;
      run.totalBandwidth += h.contentLength || 0;
    }
    run.siteResults[r.url] = r.verdict;
  }

  try {
    const r = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
    const data = await r.json();
    run.creditsStart = data.credit_coin ?? null;
  } catch {}

  run.sitesTotal = sites.length;
  sitesTotal = sites.length;
  sitesProcessed = sites.length - failed.length;
  phase = 'retrying';
  broadcast('phase', {
    phase: 'retrying', count: failed.length,
    message: `Test #${run.number} — Retrying ${failed.length} failed sites (${BATCH_SIZE} parallel)...`,
  });
  await runBatch(failed, `Test #${run.number} retry`, sites.length - failed.length);
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
