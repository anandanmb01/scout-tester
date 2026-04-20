/**
 * Scout Tester — Logger
 *
 * Thin console wrapper with a consistent `[scout]` prefix and level gate.
 * Library code should import `logger` and call `logger.warn(...)` instead
 * of `console.warn(...)` so consumers can later swap or silence output.
 */

// ─── Level Map ───

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

let currentLevel = LEVELS[(process.env.SCOUT_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
let prefix = '[scout]';

// ─── Public API ───

export function setLogLevel(level) {
  if (LEVELS[level] !== undefined) currentLevel = LEVELS[level];
}

export function setLogPrefix(p) {
  prefix = p;
}

function emit(level, method, args) {
  if (LEVELS[level] < currentLevel) return;
  // eslint-disable-next-line no-console
  console[method](prefix, ...args);
}

export const logger = {
  debug: (...args) => emit('debug', 'log', args),
  info: (...args) => emit('info', 'log', args),
  warn: (...args) => emit('warn', 'warn', args),
  error: (...args) => emit('error', 'error', args),
};
