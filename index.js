// ─── Scout Tester — Public API ───
// Single entry point with grouped exports.

// ─── Constants ───
export {
  PORT,
  SCOUT_API,
  SCOUT_USER_URL,
  COUNTRIES_DEFAULT,
  COUNTRIES_ALL,
  BATCH_SIZE,
  BATCH_GAP,
  REAL_BLOCK_MS,
  DATA_DIR,
  RESULTS_FILE,
  SITES_FILE,
  RUNS_DIR,
  ROOT_DIR,
  loadEnv,
} from './core/constants.js';

// ─── Probe & Detection ───
export {
  rawProbe,
  fetchWithTimeout,
  detectDataType,
  detectBlockSignals,
} from './core/probe.js';

// ─── Results & Data ───
export {
  getResults,
  setResults,
  deleteResult,
  loadResults,
  saveResults,
  loadSites,
  saveSites,
  initResults,
  computeVerdict,
  saveTestResult,
  getScoutKey,
  setScoutKey,
  persistScoutKey,
  removeScoutKey,
} from './core/results.js';

// ─── Runs ───
export {
  loadRunsIndex,
  saveRunsIndex,
  getNextRunNumber,
  loadRunData,
  saveRunData,
  migrateOldRuns,
  savePausedRun,
  loadPausedRun,
  clearPausedRun,
} from './core/runs.js';

// ─── Countries ───
export {
  getActiveCountries,
  setCountryMode,
  getCountryMode,
} from './core/countries.js';

// ─── Runner ───
export {
  getState,
  isTesting,
  setBroadcast,
  autoRun,
  retryRun,
  testOneSite,
  stopRun,
} from './core/runner.js';
