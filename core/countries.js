// ─── Country Management ───

import { COUNTRIES_DEFAULT, COUNTRIES_ALL } from './constants.js';

let activeCountries = [...COUNTRIES_DEFAULT];

// ─── Getters / Setters ───

export function getActiveCountries() {
  return activeCountries;
}

export function setCountryMode(mode) {
  if (mode === 'all') {
    activeCountries = [...COUNTRIES_ALL];
  } else {
    activeCountries = [...COUNTRIES_DEFAULT];
  }
  return activeCountries;
}

export function getCountryMode() {
  return activeCountries.length > COUNTRIES_DEFAULT.length ? 'all' : 'default';
}

export { COUNTRIES_DEFAULT, COUNTRIES_ALL };
