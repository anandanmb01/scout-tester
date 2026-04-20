/**
 * Scout Tester — Run Persistence
 *
 * Directory-based storage for completed test runs. Each run lives at
 * `data/runs/test-NNN/results.json`; `data/runs/index.json` holds the
 * lightweight list of run metadata. Also handles the legacy flat-file
 * format migration and paused-run snapshots.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { RUNS_DIR, RUNS_INDEX, DATA_DIR, PAUSED_RUN_FILE } from '../config/index.js';
import { logger } from '../logger/index.js';

// ─── Runs Index ───

export function loadRunsIndex() {
  if (!existsSync(RUNS_INDEX)) return { runs: [], activeRun: null };
  try {
    return JSON.parse(readFileSync(RUNS_INDEX, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to parse runs index: ${err.message}`);
    return { runs: [], activeRun: null };
  }
}

export function saveRunsIndex(index) {
  writeFileSync(RUNS_INDEX, JSON.stringify(index, null, 2));
}

// ─── Run Numbers ───

export function getNextRunNumber() {
  const index = loadRunsIndex();
  if (index.runs.length === 0) return 1;
  const maxNum = Math.max(...index.runs.map((r) => r.number));
  return maxNum + 1;
}

export function padRunNumber(num) {
  return String(num).padStart(3, '0');
}

export function getRunDir(num) {
  return join(RUNS_DIR, `test-${padRunNumber(num)}`);
}

// ─── Run Data ───

export function loadRunData(num) {
  const dir = getRunDir(num);
  const file = join(dir, 'results.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to load run ${num}: ${err.message}`);
    return null;
  }
}

export function saveRunData(num, data) {
  const dir = getRunDir(num);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), JSON.stringify(data, null, 2));
}

// ─── Old Format Migration ───

export function migrateOldRuns() {
  const oldRunsFile = join(DATA_DIR, 'runs.json');
  if (!existsSync(oldRunsFile)) return;
  if (loadRunsIndex().runs.length > 0) return;

  try {
    const oldRuns = JSON.parse(readFileSync(oldRunsFile, 'utf8'));
    if (!Array.isArray(oldRuns) || oldRuns.length === 0) return;

    const index = { runs: [], activeRun: null };
    for (const run of oldRuns) {
      const num = run.id || (index.runs.length + 1);
      const meta = {
        number: num,
        type: run.type || 'full',
        label: `Test #${num}`,
        startedAt: run.startedAt || null,
        endedAt: run.endedAt || null,
        durationMs: run.durationMs || 0,
        creditsStart: run.creditsStart ?? null,
        creditsEnd: run.creditsEnd ?? null,
        creditsSpent: run.creditsSpent ?? null,
        totalProbes: run.totalProbes || 0,
        passProbes: run.passProbes || 0,
        failProbes: run.failProbes || 0,
        realBlocks: run.realBlocks || 0,
        totalBandwidth: run.totalBandwidth || 0,
        sitesTotal: run.sitesTotal || 0,
        sitesProcessed: run.sitesProcessed || 0,
        summary: run.summary || { pass: 0, fail: 0, tested: 0 },
      };
      index.runs.push(meta);
      saveRunData(num, { meta, siteResults: run.siteResults || {} });
    }
    saveRunsIndex(index);
    logger.info(`Migrated ${oldRuns.length} old runs to directory format`);
  } catch (err) {
    logger.warn(`Failed to migrate old runs: ${err.message}`);
  }
}

// ─── Paused Run ───

export function savePausedRun(run) {
  writeFileSync(PAUSED_RUN_FILE, JSON.stringify(run, null, 2));
}

export function loadPausedRun() {
  if (!existsSync(PAUSED_RUN_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PAUSED_RUN_FILE, 'utf8'));
  } catch { return null; }
}

export function clearPausedRun() {
  if (existsSync(PAUSED_RUN_FILE)) {
    try { writeFileSync(PAUSED_RUN_FILE, ''); } catch {}
  }
}
