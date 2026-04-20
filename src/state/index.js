/**
 * Scout Tester — Runner State
 *
 * Shared mutable state for the active test run. Separated from runner logic
 * so routes and runner functions can read state without pulling in the full
 * pipeline. The broadcast function is injected by the server on startup.
 */

// ─── Runner State ───

const state = {
  testing: false,
  currentUrl: null,
  phase: 'idle',
  sitesProcessed: 0,
  sitesTotal: 0,
  activeRun: null,
};

let broadcastFn = () => {};

// ─── Accessors ───

export function getState() {
  return { ...state };
}

export function isTesting() {
  return state.testing;
}

export function setTesting(v) {
  state.testing = v;
}

export function setPhase(v) {
  state.phase = v;
}

export function setCurrentUrl(v) {
  state.currentUrl = v;
}

export function setSitesProcessed(v) {
  state.sitesProcessed = v;
}

export function setSitesTotal(v) {
  state.sitesTotal = v;
}

export function getActiveRun() {
  return state.activeRun;
}

export function setActiveRun(v) {
  state.activeRun = v;
}

// ─── Broadcast Wiring ───

export function setBroadcast(fn) {
  broadcastFn = fn;
}

export function broadcast(event, data) {
  broadcastFn(event, data);
}
