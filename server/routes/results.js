/**
 * Scout Tester Server — Results & Sites Routes
 *
 * Read endpoints for the live results map, the site list, and current
 * credit balance. Write endpoints for add/remove site and clearing
 * results.
 */

import { Router } from 'express';
import { SCOUT_USER_URL } from '../../src/config/index.js';
import {
  getResults, setResults, deleteResult, saveResultsNow,
  loadSites, saveSites, getScoutKey,
} from '../../src/results/index.js';
import { loadRunsIndex } from '../../src/runs/index.js';
import { getState } from '../../src/state/index.js';
import { logger } from '../../src/logger/index.js';

export function resultsRouter(broadcast) {
  const r = Router();

  r.get('/results', (req, res) => {
    const results = getResults();
    const { testing, currentUrl, phase, sitesProcessed, sitesTotal, activeRun } = getState();
    const index = loadRunsIndex();
    res.json({
      results, testing, currentUrl, phase,
      sitesProcessed, sitesTotal,
      activeRun: activeRun ? {
        id: activeRun.number, type: activeRun.type,
        startedAt: activeRun.startedAt,
        totalProbes: activeRun.totalProbes,
        passProbes: activeRun.passProbes,
        failProbes: activeRun.failProbes,
        totalBandwidth: activeRun.totalBandwidth,
        sitesProcessed: activeRun.sitesProcessed,
        sitesTotal: activeRun.sitesTotal,
        creditsStart: activeRun.creditsStart,
      } : null,
      activeRunNumber: activeRun ? activeRun.number : null,
      totalRuns: index.runs.length,
    });
  });

  r.get('/sites', (req, res) => res.json(loadSites()));

  r.get('/credits', async (req, res) => {
    const SCOUT_KEY = getScoutKey();
    try {
      const resp = await fetch(SCOUT_USER_URL, { headers: { 'Authorization': SCOUT_KEY } });
      const data = await resp.json();
      res.json({ credits: data.credit_coin ?? '?' });
    } catch (err) {
      logger.warn(`Failed to fetch credits: ${err.message}`);
      res.json({ credits: '?' });
    }
  });

  r.post('/add-site', (req, res) => {
    let { url, category } = req.body;
    if (!url) return res.json({ error: 'URL required' });
    if (!url.startsWith('http')) url = 'https://' + url;
    const sites = loadSites();
    if (sites.find((s) => s.url === url)) return res.json({ error: 'Already exists' });
    sites.push({ url, category: category || 'Custom' });
    saveSites(sites);
    res.json({ ok: true, total: sites.length });
  });

  r.post('/remove-site', (req, res) => {
    const { url } = req.body;
    let sites = loadSites();
    sites = sites.filter((s) => s.url !== url);
    saveSites(sites);
    deleteResult(url);
    saveResultsNow();
    res.json({ ok: true });
  });

  r.post('/clear', (req, res) => {
    setResults({});
    saveResultsNow();
    broadcast('cleared', {});
    res.json({ ok: true });
  });

  return r;
}
