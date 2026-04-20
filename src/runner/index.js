/**
 * Scout Tester — Runner (Barrel)
 *
 * Public runner API. Re-exports settings accessors and pipeline entry
 * points. State primitives live in `src/state` and are re-exported here
 * for routes that need to check `isTesting()` etc.
 */

export { getSettings, updateSettings } from './settings.js';
export { autoRun, retryRun, testOneSite, stopRun } from './pipeline.js';
export { getState, isTesting, setBroadcast } from '../state/index.js';
