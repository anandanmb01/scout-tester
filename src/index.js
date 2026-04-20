/**
 * Scout Tester — Public API
 *
 * Top-level barrel file. Re-exports every module a consumer app or custom
 * server might need. Import from `scout-tester` rather than reaching into
 * subpaths so internal layout can change without breaking consumers.
 */

// ─── Config ───
export {
  ROOT_DIR, PORT, SCOUT_API, SCOUT_USER_URL, SCOUT_TIMEOUT_MS,
  COUNTRIES_DEFAULT, COUNTRIES_ALL,
  BATCH_SIZE, BATCH_GAP, REAL_BLOCK_MS,
  DATA_DIR, PAUSED_RUN_FILE, RESULTS_FILE, SITES_FILE, SETTINGS_FILE,
  RUNS_DIR, RUNS_INDEX,
  loadEnv,
} from './config/index.js';

// ─── Errors ───
export {
  ScoutError, ValidationError, ApiError, ProbeError, PersistenceError,
  ErrorCodes,
} from './errors/index.js';

// ─── Logger ───
export { logger, setLogLevel, setLogPrefix } from './logger/index.js';

// ─── Countries ───
export {
  getActiveCountries, setCountryMode, getCountryMode,
} from './countries/index.js';

// ─── Probe ───
export {
  fetchWithTimeout, detectDataType, detectBlockSignals, rawProbe,
} from './probe/index.js';

// ─── Results ───
export {
  getScoutKey, setScoutKey, persistScoutKey, removeScoutKey,
  getResults, setResults, deleteResult,
  loadResults, saveResults, saveResultsNow,
  loadSites, saveSites,
  migrateResultsFormat, computeVerdict, saveTestResult, initResults,
} from './results/index.js';

// ─── Runs ───
export {
  loadRunsIndex, saveRunsIndex,
  getNextRunNumber, padRunNumber, getRunDir,
  loadRunData, saveRunData,
  migrateOldRuns,
  savePausedRun, loadPausedRun, clearPausedRun,
} from './runs/index.js';

// ─── State ───
export {
  getState, isTesting, setBroadcast, broadcast,
  setTesting, setPhase, setCurrentUrl, setSitesProcessed, setSitesTotal,
  getActiveRun, setActiveRun,
} from './state/index.js';

// ─── Runner ───
export {
  getSettings, updateSettings,
  autoRun, retryRun, testOneSite, stopRun,
} from './runner/index.js';
