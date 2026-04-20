/**
 * Scout Tester Server — Settings Routes
 *
 * Exposes the runner's persisted settings (batch size, auto-retest, etc.)
 * via GET and accepts partial updates via POST.
 */

import { Router } from 'express';
import { getSettings, updateSettings } from '../../src/runner/index.js';

export function settingsRouter() {
  const r = Router();

  r.get('/settings', (req, res) => {
    res.json(getSettings());
  });

  r.post('/settings', (req, res) => {
    const updated = updateSettings(req.body);
    res.json({ ok: true, ...updated });
  });

  return r;
}
