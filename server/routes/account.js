/**
 * Scout Tester Server — Account Routes
 *
 * Scout API key lifecycle. GET returns a masked summary plus live credit
 * balance from the Scout user endpoint. POST /connect persists a new key,
 * POST /disconnect clears it.
 */

import { Router } from 'express';
import { SCOUT_USER_URL } from '../../src/config/index.js';
import { getScoutKey, persistScoutKey, removeScoutKey } from '../../src/results/index.js';

export function accountRouter() {
  const r = Router();

  r.get('/account', async (req, res) => {
    const SCOUT_KEY = getScoutKey();
    if (!SCOUT_KEY) return res.json({ connected: false, key: null, masked: null });

    const masked = SCOUT_KEY.slice(0, 12) + '...' + SCOUT_KEY.slice(-4);
    let credits = null;
    let userId = null;
    let totalJobs = null;

    try {
      const resp = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await resp.json();
      credits = data.credit_coin ?? null;
      userId = data.user_id ?? data.id ?? null;
      totalJobs = data.total_jobs ?? null;
    } catch {}

    res.json({ connected: true, key: SCOUT_KEY, masked, credits, userId, totalJobs });
  });

  r.post('/account/connect', (req, res) => {
    const { key } = req.body;
    if (!key || !key.trim()) return res.json({ error: 'API key required' });
    const trimmed = key.trim();
    persistScoutKey(trimmed);
    res.json({ ok: true, masked: trimmed.slice(0, 12) + '...' + trimmed.slice(-4) });
  });

  r.post('/account/disconnect', (req, res) => {
    removeScoutKey();
    res.json({ ok: true });
  });

  return r;
}
