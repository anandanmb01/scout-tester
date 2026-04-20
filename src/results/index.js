/**
 * Scout Tester — Results & Scout Key Persistence
 *
 * Owns the in-memory `results` map (keyed by URL) and the Scout API key.
 * Handles disk I/O (debounced save to results.json, synchronous save on
 * shutdown) and verdict derivation from probe history. `saveTestResult`
 * is the single mutation entry point used by the runner.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { RESULTS_FILE, SITES_FILE, REAL_BLOCK_MS, ROOT_DIR } from '../config/index.js';
import { logger } from '../logger/index.js';

// ─── Scout Key State ───

let SCOUT_KEY = '';

export function getScoutKey() {
  if (!SCOUT_KEY) SCOUT_KEY = process.env.SCOUT_KEY || '';
  return SCOUT_KEY;
}

export function setScoutKey(key) {
  SCOUT_KEY = key;
}

export function persistScoutKey(key) {
  SCOUT_KEY = key;
  const envPath = join(ROOT_DIR, '.env');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf8');
    if (envContent.match(/^SCOUT_KEY=.*/m)) {
      envContent = envContent.replace(/^SCOUT_KEY=.*/m, `SCOUT_KEY=${SCOUT_KEY}`);
    } else {
      envContent += `\nSCOUT_KEY=${SCOUT_KEY}`;
    }
  } else {
    envContent = `SCOUT_KEY=${SCOUT_KEY}`;
  }
  writeFileSync(envPath, envContent.trim() + '\n');
}

export function removeScoutKey() {
  SCOUT_KEY = '';
  const envPath = join(ROOT_DIR, '.env');
  if (existsSync(envPath)) {
    let envContent = readFileSync(envPath, 'utf8');
    envContent = envContent.replace(/^SCOUT_KEY=.*\n?/m, '');
    writeFileSync(envPath, envContent.trim() + '\n');
  }
}

// ─── Results State ───

let results = {};

export function getResults() {
  return results;
}

export function setResults(newResults) {
  results = newResults;
}

export function deleteResult(url) {
  delete results[url];
}

// ─── File I/O ───

export function loadResults() {
  if (!existsSync(RESULTS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to parse results: ${err.message}`);
    return {};
  }
}

let saveTimer = null;
export function saveResults() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2)); } catch {}
  }, 2000);
}

export function saveResultsNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2)); } catch {}
}

export function loadSites() {
  if (!existsSync(SITES_FILE)) return [];
  return JSON.parse(readFileSync(SITES_FILE, 'utf8'));
}

export function saveSites(sites) {
  writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2));
}

// ─── Migrate Old Format ───

export function migrateResultsFormat() {
  for (const [, r] of Object.entries(results)) {
    if (!r.verdict) {
      r.verdict = r.status === 'pass' ? 'PASS' : 'FAIL';
      r.nodeResults = r.nodeResults || {};
      r.history = r.history || [];
      r.attempts = r.attempts || 1;
    }
    if (r.verdict !== 'PASS') r.verdict = 'FAIL';
  }
  saveResults();
}

// ─── Verdict Computation ───

export function computeVerdict(history) {
  if (history.some((h) => h.status === 'pass')) return 'PASS';
  if (history.some((h) => h.status === 'fail')) return 'FAIL';
  return 'UNTESTED';
}

// ─── Save Test Result ───

export function saveTestResult(url, category, probeResults, { recordSiteResult, broadcast } = {}) {
  const prev = results[url];
  const history = (prev?.history || []).slice(-17);

  for (const nr of probeResults) {
    history.push({
      status: nr.passed ? 'pass' : 'fail',
      time: nr.time, country: nr.country,
      responseTime: nr.responseTime, contentLength: nr.contentLength,
      errorCode: nr.errorCode, state: nr.state,
    });
  }

  const allFails = history.filter((h) => h.status === 'fail');
  const realBlocks = allFails.filter((h) => (h.responseTime || 0) >= REAL_BLOCK_MS).length;
  const verdict = computeVerdict(history);
  const allSignals = [...new Set(probeResults.flatMap((r) => r.blockSignals || []))];

  const nodeResults = {};
  for (const nr of probeResults) {
    if (!nodeResults[nr.country] || nr.passed) nodeResults[nr.country] = nr;
  }

  const passedProbe = probeResults.find((nr) => nr.passed);
  const dataType = passedProbe?.dataType || probeResults[0]?.dataType || 'Unknown';

  const result = {
    url, category, dataType,
    status: verdict === 'PASS' ? 'pass' : 'fail',
    verdict, nodeResults, history,
    blockSignals: allSignals,
    realBlocks,
    totalProbes: history.length,
    passedProbes: history.filter((h) => h.status === 'pass').length,
    lastTested: new Date().toISOString(),
    attempts: (prev?.attempts || 0) + 1,
  };

  results[url] = result;
  saveResults();
  if (recordSiteResult) recordSiteResult(url, verdict);
  if (broadcast) broadcast('result', result);
  return result;
}

// ─── Initialize ───

export function initResults() {
  results = loadResults();
  migrateResultsFormat();
  return results;
}
