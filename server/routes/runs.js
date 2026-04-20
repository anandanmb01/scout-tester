/**
 * Scout Tester Server — Run History Routes
 *
 * Read, load, and manually save test runs. `load/:num` replaces the live
 * results map with a historical run's verdicts so the UI can explore
 * past test state. Blocked while a test is actively running.
 */

import { Router } from 'express';
import {
  loadRunsIndex, saveRunsIndex, getNextRunNumber, loadRunData, saveRunData,
} from '../../src/runs/index.js';
import {
  getResults, setResults, saveResultsNow,
} from '../../src/results/index.js';
import { isTesting } from '../../src/state/index.js';

export function runsRouter(broadcast) {
  const r = Router();

  r.get('/runs', (req, res) => {
    const index = loadRunsIndex();
    res.json({ runs: index.runs, activeRun: index.activeRun });
  });

  r.get('/prev-passed', (req, res) => {
    const index = loadRunsIndex();
    const prevPassed = {};
    for (const run of (index.runs || [])) {
      const data = loadRunData(run.number);
      if (!data?.siteResults) continue;
      for (const [url, verdict] of Object.entries(data.siteResults)) {
        if (verdict === 'PASS') prevPassed[url] = (prevPassed[url] || 0) + 1;
      }
    }
    res.json(prevPassed);
  });

  r.get('/runs/:num', (req, res) => {
    const num = parseInt(req.params.num);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid run number' });

    const data = loadRunData(num);
    if (!data) return res.status(404).json({ error: 'Run not found' });
    res.json(data);
  });

  r.post('/runs/load/:num', (req, res) => {
    const num = parseInt(req.params.num);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid run number' });
    if (isTesting()) return res.json({ error: 'Cannot load while testing is active' });

    const data = loadRunData(num);
    if (!data) return res.status(404).json({ error: 'Run not found' });

    const newResults = {};
    for (const [url, verdict] of Object.entries(data.siteResults || {})) {
      newResults[url] = {
        url, category: 'Loaded',
        status: verdict === 'PASS' ? 'pass' : 'fail',
        verdict, nodeResults: {}, history: [],
        blockSignals: [], realBlocks: 0,
        totalProbes: 0, passedProbes: 0,
        lastTested: data.meta?.endedAt || null,
        attempts: 0,
      };
    }
    setResults(newResults);
    saveResultsNow();

    broadcast('cleared', {});
    broadcast('state-update', { loadedRun: num, results: newResults });

    res.json({ ok: true, loaded: num, sitesLoaded: Object.keys(data.siteResults || {}).length });
  });

  r.post('/runs/save', (req, res) => {
    if (isTesting()) return res.json({ error: 'Cannot save while testing is active' });
    const results = getResults();
    if (Object.keys(results).length === 0) return res.json({ error: 'No results to save' });

    const num = getNextRunNumber();
    const now = new Date().toISOString();

    const pass = Object.values(results).filter((r) => r.verdict === 'PASS').length;
    const fail = Object.values(results).filter((r) => r.verdict === 'FAIL').length;
    const totalProbes = Object.values(results).reduce((sum, r) => sum + (r.totalProbes || 0), 0);
    const totalBandwidth = Object.values(results).reduce((sum, r) => {
      const hist = r.history || [];
      return sum + hist.reduce((s, h) => s + (h.contentLength || 0), 0);
    }, 0);

    const siteResults = {};
    for (const [url, r] of Object.entries(results)) siteResults[url] = r.verdict;

    const meta = {
      number: num, type: 'manual-save', label: `Manual Save #${num}`,
      startedAt: now, endedAt: now, durationMs: 0,
      creditsStart: null, creditsEnd: null, creditsSpent: null,
      totalProbes,
      passProbes: Object.values(results).reduce((sum, r) => sum + (r.passedProbes || 0), 0),
      failProbes: totalProbes - Object.values(results).reduce((sum, r) => sum + (r.passedProbes || 0), 0),
      realBlocks: Object.values(results).reduce((sum, r) => sum + (r.realBlocks || 0), 0),
      totalBandwidth,
      sitesTotal: Object.keys(results).length,
      sitesProcessed: Object.keys(results).length,
      summary: { pass, fail, tested: pass + fail },
    };

    saveRunData(num, { meta, siteResults });

    const index = loadRunsIndex();
    index.runs.push(meta);
    saveRunsIndex(index);

    res.json({ ok: true, runNumber: num, summary: meta.summary });
  });

  return r;
}
