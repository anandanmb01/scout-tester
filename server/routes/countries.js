/**
 * Scout Tester Server — Country Mode Routes
 *
 * GET /api/countries reports the active mode and country list; POST
 * /api/countries switches between `default` (FR/DE/GB) and `all`.
 */

import { Router } from 'express';
import {
  getActiveCountries, setCountryMode, getCountryMode,
  COUNTRIES_DEFAULT, COUNTRIES_ALL,
} from '../../src/countries/index.js';

export function countriesRouter() {
  const r = Router();

  r.get('/countries', (req, res) => {
    res.json({
      mode: getCountryMode(),
      active: getActiveCountries(),
      available: COUNTRIES_ALL,
      defaults: COUNTRIES_DEFAULT,
    });
  });

  r.post('/countries', (req, res) => {
    const { mode } = req.body;
    const active = setCountryMode(mode);
    res.json({ ok: true, mode, active, count: active.length });
  });

  return r;
}
