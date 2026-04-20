/**
 * Scout Tester — Error Classes
 *
 * Typed errors with stable `.code` strings. Error code strings are part of
 * the public API — consumers may pattern-match on them. Never rename a code
 * without bumping the major version.
 */

// ─── Error Codes ───

export const ErrorCodes = {
  INVALID_OPTIONS: 'INVALID_OPTIONS',
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_URL: 'INVALID_URL',
  SITE_NOT_FOUND: 'SITE_NOT_FOUND',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  ALREADY_RUNNING: 'ALREADY_RUNNING',
  NOT_RUNNING: 'NOT_RUNNING',
  PROBE_TIMEOUT: 'PROBE_TIMEOUT',
  PROBE_NETWORK: 'PROBE_NETWORK',
  SCOUT_API_ERROR: 'SCOUT_API_ERROR',
  PERSIST_FAILED: 'PERSIST_FAILED',
  LOAD_FAILED: 'LOAD_FAILED',
};

// ─── Base Error ───

export class ScoutError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ScoutError';
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ─── Specialised Errors ───

export class ValidationError extends ScoutError {
  constructor(message, details = {}) {
    super(ErrorCodes.INVALID_OPTIONS, message, details);
    this.name = 'ValidationError';
  }
}

export class ApiError extends ScoutError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'ApiError';
  }
}

export class ProbeError extends ScoutError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'ProbeError';
  }
}

export class PersistenceError extends ScoutError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'PersistenceError';
  }
}
