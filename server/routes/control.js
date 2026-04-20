/**
 * Scout Tester Server — Control Routes
 *
 * Start/stop test runs. Covers full runs, retries, single-site runs, and
 * the `new-test` convenience which clears results before starting.
 */

import { Router } from 'express';
import { loadSites, getResults, setResults, saveResultsNow } from '../../src/results/index.js';
import { loadRunsIndex } from '../../src/runs/index.js';
import { autoRun, retryRun, testOneSite, stopRun } from '../../src/runner/index.js';
import { isTesting } from '../../src/state/index.js';

export function controlRouter(broadcast) {
  const r = Router();

  r.post('/new-test', (req, res) => {
    if (isTesting()) return res.json({ error: 'Already running' });
    setResults({});
    saveResultsNow();
    broadcast('cleared', {});
    res.json({ ok: true });
    autoRun('full');
  });

  r.post('/run', (req, res) => {
    if (isTesting()) return res.json({ error: 'Already running' });
    res.json({ ok: true });
    autoRun('full');
  });

  r.post('/retry-failed', (req, res) => {
    if (isTesting()) return res.json({ error: 'Already running' });
    const sites = loadSites();
    const results = getResults();
    const failed = sites.filter((s) => results[s.url]?.verdict === 'FAIL');
    if (failed.length === 0) return res.json({ error: 'No failed sites to retry' });
    const index = loadRunsIndex();
    const lastNum = index.runs.length > 0 ? index.runs[index.runs.length - 1].number : 1;
    res.json({ ok: true, runId: lastNum, count: failed.length });
    retryRun(sites, failed);
  });

  r.post('/test-one', (req, res) => {
    if (isTesting()) return res.json({ error: 'Already running' });
    const { url } = req.body;
    const sites = loadSites();
    const site = sites.find((s) => s.url === url);
    if (!site) return res.json({ error: 'Site not found' });

    const run = testOneSite(site);
    res.json({ ok: true, runId: run.number });
  });

  r.post('/stop', (req, res) => {
    stopRun();
    res.json({ ok: true });
  });

  return r;
}
