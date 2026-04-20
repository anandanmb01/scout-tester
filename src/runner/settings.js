/**
 * Scout Tester — Runner Settings
 *
 * Persistable runtime settings: auto-retest, batch size/gap, fire-all mode,
 * retry-all-countries, and the retry-round threshold that triggers country
 * expansion. Saved to data/settings.json and loaded at module import.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { BATCH_SIZE, BATCH_GAP, SETTINGS_FILE } from '../config/index.js';

// ─── Defaults ───

const settings = {
  autoRetestEnabled: false,
  autoRetestMax: 3,
  fireAllMode: false,
  batchSize: BATCH_SIZE,
  batchGap: BATCH_GAP,
  retryAllCountries: false,
  expandCountriesAfter: 2,
};

// ─── Load From Disk ───

try {
  if (existsSync(SETTINGS_FILE)) {
    const saved = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    for (const key of Object.keys(settings)) {
      if (saved[key] !== undefined) settings[key] = saved[key];
    }
  }
} catch {}

// ─── Accessors ───

export function getSettings() {
  return { ...settings };
}

export function updateSettings(opts) {
  if (opts.autoRetest !== undefined) settings.autoRetestEnabled = !!opts.autoRetest;
  if (opts.autoRetestMax !== undefined) {
    settings.autoRetestMax = Math.min(100, Math.max(1, parseInt(opts.autoRetestMax) || 3));
  }
  if (opts.fireAll !== undefined) settings.fireAllMode = !!opts.fireAll;
  if (opts.batchSize !== undefined) {
    settings.batchSize = Math.min(100, Math.max(1, parseInt(opts.batchSize) || 5));
  }
  if (opts.batchGap !== undefined) settings.batchGap = Math.max(0, parseInt(opts.batchGap ?? 500));
  if (opts.retryAllCountries !== undefined) settings.retryAllCountries = !!opts.retryAllCountries;
  if (opts.expandCountriesAfter !== undefined) {
    settings.expandCountriesAfter = Math.max(1, parseInt(opts.expandCountriesAfter) || 2);
  }
  try { writeFileSync(SETTINGS_FILE, JSON.stringify(getSettings(), null, 2)); } catch {}
  return getSettings();
}
