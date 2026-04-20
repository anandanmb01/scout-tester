/**
 * Scout Tester — Country Mode
 *
 * In-memory selection of which country codes Scout probes target. Mode
 * `default` uses FR/DE/GB; mode `all` expands to the full 61-country list.
 */

import { COUNTRIES_DEFAULT, COUNTRIES_ALL } from '../config/index.js';

let activeCountries = [...COUNTRIES_DEFAULT];

// ─── Getters / Setters ───

export function getActiveCountries() {
  return activeCountries;
}

export function setCountryMode(mode) {
  activeCountries = mode === 'all' ? [...COUNTRIES_ALL] : [...COUNTRIES_DEFAULT];
  return activeCountries;
}

export function getCountryMode() {
  return activeCountries.length > COUNTRIES_DEFAULT.length ? 'all' : 'default';
}

export { COUNTRIES_DEFAULT, COUNTRIES_ALL };
