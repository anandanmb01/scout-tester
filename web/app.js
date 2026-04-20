let sites = [], results = {}, currentUrl = null, isTesting = false;
let activeFilter = 'all', sortBy = 'verdict';
let runStartTime = null, timerInterval = null, elapsedOffset = 0;
let pastRuns = [];
let viewingRun = null;
let activeRunData = null;
let currentRunId = null;
let countryMode = 'default';
let activeCountries = ['FR', 'DE', 'GB'];
let prevPassed = {};

// ─── Country Code → Flag Emoji ───

function countryFlag(code) {
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

// ─── Init ───

async function init() {
  const [s, r, runsData, cData, settingsData, ppData] = await Promise.all([
    fetch('/api/sites').then(r => r.json()),
    fetch('/api/results').then(r => r.json()),
    fetch('/api/runs').then(r => r.json()),
    fetch('/api/countries').then(r => r.json()),
    fetch('/api/settings').then(r => r.json()),
    fetch('/api/prev-passed').then(r => r.json()),
  ]);
  prevPassed = ppData || {};
  // Init retry-all toggle from settings
  document.getElementById('chk-retry-all').checked = settingsData.retryAllCountries || false;
  countryMode = cData.mode;
  activeCountries = cData.active;
  updateCountryBtn();
  updateQueueBtn();
  updateTableHeaders();
  sites = s;
  results = r.results || {};
  currentUrl = r.currentUrl;
  isTesting = r.testing;
  pastRuns = (runsData.runs || runsData || []).map(r => ({ ...r, id: r.id || r.number }));

  if (r.activeRun) {
    runStartTime = new Date(r.activeRun.startedAt).getTime();
    currentRunId = r.activeRun.id;
    activeRunData = r.activeRun;
    startTimer();
    updateRunStats(r.activeRun);
    updateProgressFromHeartbeat(r.activeRun, r.sitesProcessed, r.sitesTotal);
  }

  // If not testing but we have past runs, show the latest test in run stats
  if (!r.activeRun && pastRuns.length > 0) {
    const latest = pastRuns[pastRuns.length - 1];
    currentRunId = latest.id;
    updateRunStats(latest);
  }

  populateRunSelect();
  updateAll();
  fetchCredits();
  connectSSE();

  // Prompt for API key on first visit if none set
  const acct = await fetch('/api/account').then(r => r.json());
  if (!acct.connected) showAccount();
}

// ─── Credits ───

async function fetchCredits() {
  const acct = await fetch('/api/account').then(r => r.json());
  const box = document.getElementById('credits-box');
  if (!acct.connected) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const d = await fetch('/api/credits').then(r => r.json());
  document.getElementById('credits').textContent =
    typeof d.credits === 'number' ? d.credits.toFixed(1) : d.credits;
}

// ─── Timer ───

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!runStartTime) return;
    const elapsed = elapsedOffset + (Date.now() - runStartTime);
    document.getElementById('rs-duration').textContent = formatDuration(elapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '00')}`;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function calcEta(processed, total, elapsed) {
  if (!processed || !total || processed === 0) return null;
  const remaining = total - processed;
  const msPerItem = elapsed / processed;
  return remaining * msPerItem;
}

// ─── Run Stats (the dedicated stats row) ───

function updateRunStats(run) {
  if (!run) {
    document.getElementById('rs-test-num').textContent = '--';
    document.getElementById('rs-credits').textContent = '0.00';
    document.getElementById('rs-datasize').textContent = '0 B';
    document.getElementById('rs-probes').textContent = '0';
    document.getElementById('rs-probes-detail').textContent = '0 pass / 0 fail';
    document.getElementById('rs-duration').textContent = '--:--';
    return;
  }

  document.getElementById('rs-test-num').textContent = '#' + (run.id || currentRunId || '--');
  document.getElementById('rs-credits').textContent =
    typeof run.creditsSpent === 'number' ? run.creditsSpent.toFixed(2) : '0.00';
  document.getElementById('rs-datasize').textContent = formatBytes(run.totalBandwidth || 0);
  document.getElementById('rs-probes').textContent = run.totalProbes || 0;

  const pass = run.passProbes || run.summary?.pass || 0;
  const fail = run.failProbes || run.summary?.fail || 0;
  document.getElementById('rs-probes-detail').textContent = `${pass} pass / ${fail} fail`;

  // Set duration for past runs (live runs use the timer interval instead)
  if (run.durationMs) {
    document.getElementById('rs-duration').textContent = formatDuration(run.durationMs);
  }
}

// ─── Progress ───

function setStatus(dot, msg) {
  document.getElementById('status-dot').className = 'dot ' + dot;
  document.getElementById('progress-action').textContent = msg || '';
}

let maxProcessed = 0;
let runStartProcessed = 0; // how many were already done when run started

function updateProgressFromHeartbeat(run, sitesProcessed, sitesTotal) {
  const fill = document.getElementById('progress');
  const siteCount = document.getElementById('progress-site-count');
  const pctLabel = document.getElementById('progress-pct-label');
  const pctLarge = document.getElementById('progress-pct-large');
  const etaBlock = document.getElementById('eta-block');
  const etaVal = document.getElementById('eta-value');

  const processed = Math.max(sitesProcessed || 0, run?.sitesProcessed || 0);
  const total = sitesTotal || run?.sitesTotal || 0;

  // Never go backwards
  if (processed > maxProcessed) maxProcessed = processed;
  const display = maxProcessed;

  if (total > 0 && display > 0) {
    const pct = Math.min(100, Math.round((display / total) * 100));
    const remaining = Math.max(0, total - display);

    fill.classList.remove('indeterminate');
    fill.style.width = pct + '%';
    if (pct >= 100) fill.classList.add('done');
    else fill.classList.remove('done');

    siteCount.textContent = `${display} / ${total} sites` + (remaining > 0 ? ` \u2014 ${remaining} remaining` : ' \u2014 complete');
    pctLabel.textContent = `${pct}% Complete`;
    pctLarge.textContent = pct + '%';
    pctLarge.style.display = '';

    // ETA: only count sites tested THIS run (exclude already-passed)
    const testedThisRun = display - runStartProcessed;
    if (runStartTime && testedThisRun > 0 && pct < 100) {
      const elapsed = Date.now() - runStartTime;
      const msPerSite = elapsed / testedThisRun;
      const eta = remaining * msPerSite;
      etaBlock.style.display = '';
      etaVal.textContent = formatDuration(eta);
    } else if (pct >= 100) {
      etaBlock.style.display = '';
      etaVal.textContent = '00:00';
    }
  } else if (isTesting) {
    fill.style.width = '';
    fill.classList.add('indeterminate');
    fill.classList.remove('done');
    siteCount.textContent = 'Starting...';
    pctLabel.textContent = '';
    pctLarge.style.display = 'none';
    etaBlock.style.display = 'none';
  }
}

function resetProgress() {
  maxProcessed = 0;
  runStartProcessed = 0;
  elapsedOffset = 0;
  const fill = document.getElementById('progress');
  fill.style.width = '0%';
  fill.classList.remove('indeterminate', 'done');
  document.getElementById('progress-site-count').textContent = '';
  document.getElementById('progress-pct-label').textContent = '';
  document.getElementById('progress-pct-large').style.display = 'none';
  document.getElementById('eta-block').style.display = 'none';
  document.getElementById('progress-action').textContent = 'Idle';
  document.getElementById('status-dot').className = 'dot idle';
}

// ─── Run Selector ───

function populateRunSelect() {
  const sel = document.getElementById('run-select');
  const prevVal = sel.value;

  // Build all test entries (newest first)
  const allRuns = [...pastRuns].sort((a, b) => b.id - a.id);

  // If testing and we have a currentRunId not yet in pastRuns, add a live entry
  const liveId = isTesting && currentRunId ? currentRunId : null;
  const hasLiveInPast = liveId && allRuns.some(r => r.id === liveId);

  sel.innerHTML = '';

  if (liveId && !hasLiveInPast) {
    sel.innerHTML += `<option value="${liveId}">Test #${liveId} \u2014 RUNNING</option>`;
  }

  for (const r of allRuns) {
    const date = new Date(r.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = new Date(r.startedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const credits = r.creditsSpent !== null && r.creditsSpent !== undefined
      ? ` | ${Number(r.creditsSpent).toFixed(1)} cr`
      : '';
    const pass = r.summary?.pass || 0;
    const fail = r.summary?.fail || 0;
    const suffix = liveId === r.id ? ' \u2014 RUNNING' : '';
    const label = `Test #${r.id} \u2014 ${date} ${time} | ${pass}P/${fail}F${credits}${suffix}`;
    sel.innerHTML += `<option value="${r.id}">${label}</option>`;
  }

  if (sel.options.length === 0) {
    sel.innerHTML = '<option value="">No tests yet</option>';
  }

  // Restore selection or select latest
  if (prevVal && [...sel.options].some(o => o.value === prevVal)) {
    sel.value = prevVal;
  } else if (liveId) {
    sel.value = String(liveId);
  } else if (allRuns.length > 0) {
    sel.value = String(allRuns[0].id);
  }
}

function showRunDetail(runId) {
  const panel = document.getElementById('run-history');
  const numId = parseInt(runId);

  if (!runId || isNaN(numId)) {
    viewingRun = null;
    panel.classList.remove('show');
    updateRunStats(null);
    return;
  }

  // If this is the currently running test, show live stats
  if (isTesting && numId === currentRunId) {
    viewingRun = null;
    panel.classList.remove('show');
    if (activeRunData) updateRunStats(activeRunData);
    return;
  }

  const run = pastRuns.find(r => r.id === numId);
  if (!run) {
    viewingRun = null;
    panel.classList.remove('show');
    return;
  }
  viewingRun = run;
  panel.classList.add('show');

  // Update run stats row to show this past run
  updateRunStats(run);

  const title = document.getElementById('run-history-title');
  title.textContent = `Test #${run.id} \u2014 ${run.type || 'full'} run`;

  const detail = document.getElementById('run-detail');
  const dur = run.durationMs ? formatDuration(run.durationMs) : '--';
  const bw = formatBytes(run.totalBandwidth || 0);
  const creditsStr = run.creditsSpent !== null && run.creditsSpent !== undefined
    ? Number(run.creditsSpent).toFixed(2)
    : '?';
  const passCount = run.summary?.pass || 0;
  const failCount = run.summary?.fail || 0;
  const testedCount = run.summary?.tested || (passCount + failCount);
  const probeRate = (passCount + failCount) > 0
    ? ((passCount / (passCount + failCount)) * 100).toFixed(0)
    : '-';

  detail.innerHTML = `
    <div class="run-metric">
      <span class="label">Started</span>
      <span class="val">${new Date(run.startedAt).toLocaleString()}</span>
    </div>
    <div class="run-metric">
      <span class="label">Duration</span>
      <span class="val">${dur}</span>
    </div>
    <div class="run-metric">
      <span class="label">Type</span>
      <span class="val">${run.type || 'full'}</span>
    </div>
    <div class="run-metric">
      <span class="label">Sites Tested</span>
      <span class="val">${testedCount}</span>
    </div>
    <div class="run-metric">
      <span class="label">Pass</span>
      <span class="val good">${passCount}</span>
    </div>
    <div class="run-metric">
      <span class="label">Fail</span>
      <span class="val bad">${failCount}</span>
    </div>
    <div class="run-metric">
      <span class="label">Success Rate</span>
      <span class="val ${probeRate !== '-' && parseInt(probeRate) >= 50 ? 'good' : 'bad'}">${probeRate}%</span>
    </div>
    <div class="run-metric">
      <span class="label">Total Probes</span>
      <span class="val">${run.totalProbes || 0}</span>
    </div>
    <div class="run-metric">
      <span class="label">Data Size</span>
      <span class="val blue">${bw}</span>
    </div>
    <div class="run-metric">
      <span class="label">Credits Spent</span>
      <span class="val warn">${creditsStr}</span>
    </div>
  `;
}

// ─── SSE ───

let es = null;
function connectSSE() {
  if (es) { es.close(); es = null; }
  es = new EventSource('/api/events');

  es.addEventListener('phase', e => {
    const d = JSON.parse(e.data);
    if (d.phase === 'idle') {
      isTesting = false;
      setStatus('idle', d.message || 'Idle');
      stopTimer();
      resetProgress();
      updateRunStats(null);
      activeRunData = null;
      currentRunId = null;
      populateRunSelect();
    } else {
      isTesting = true;
      setStatus('live', d.message);
    }
    // Show/hide retest bar
    const retestBar = document.getElementById('retest-bar');
    if (d.phase === 'auto-retest' || d.phase === 'retrying') {
      retestBar.style.display = '';
      const label = d.phase === 'retrying' ? 'Retry Failed' : 'Auto-Retest';
      document.getElementById('retest-label').textContent = label;
      document.getElementById('retest-round').textContent = d.round ? `Round ${d.round}/${d.maxRounds}` : '';
      document.getElementById('retest-count').textContent = d.count ? d.count + ' failed' : '';
      // Render country flags
      const countriesEl = document.getElementById('retest-countries');
      if (d.countries && d.countries.length) {
        const flags = d.countries.map(c =>
          `<span style="font-size:14px;cursor:default" title="${c}">${countryFlag(c)}</span>`
        );
        countriesEl.innerHTML = `<span style="font-size:11px;color:var(--muted);margin-right:2px">${d.countries.length} countries:</span> ${flags.join(' ')}`;
      } else {
        countriesEl.innerHTML = '';
      }
    } else if (d.phase === 'idle') {
      retestBar.style.display = 'none';
    }
    updateBtns();
  });

  es.addEventListener('activity', e => {
    const d = JSON.parse(e.data);
    setStatus('live', d.message);
    appendLog(d.message);
  });

  es.addEventListener('pool-status', _e => { /* legacy — ignored */
    const d = JSON.parse(e.data);
    setPool(d.status);
  });

  es.addEventListener('run-start', e => {
    const d = JSON.parse(e.data);
    elapsedOffset = d.elapsedBeforePause || 0;
    runStartTime = d.resumedAt ? new Date(d.resumedAt).getTime() : new Date(d.startedAt).getTime();
    currentRunId = d.id;
    runStartProcessed = maxProcessed;
    activeRunData = {
      id: d.id, startedAt: d.startedAt,
      totalProbes: d.totalProbes || 0, passProbes: d.passProbes || 0,
      failProbes: d.failProbes || 0, totalBandwidth: d.totalBandwidth || 0,
      creditsSpent: d.creditsSpent || 0,
    };
    startTimer();
    const label = d.resumed ? `Test #${d.id} resuming...` : `Test #${d.id} starting...`;
    setStatus('live', label);
    updateRunStats(activeRunData);
    populateRunSelect();

    if (currentRunId) document.getElementById('run-select').value = String(currentRunId);
    showRunDetail('live');
  });

  es.addEventListener('run-end', e => {
    const d = JSON.parse(e.data);
    d.id = d.id || d.number;
    pastRuns.push(d);
    populateRunSelect();
    fetchCredits();
    stopTimer();

    // Update run stats with final data
    updateRunStats(d);
    activeRunData = null;
  });

  es.addEventListener('credits-update', e => {
    const d = JSON.parse(e.data);
    document.getElementById('credits').textContent = typeof d.credits === 'number' ? d.credits.toFixed(1) : d.credits;
    document.getElementById('rs-credits').textContent = typeof d.spent === 'number' ? d.spent.toFixed(2) : '0.00';
    if (activeRunData) activeRunData.creditsSpent = d.spent;
  });

  es.addEventListener('run-update', e => {
    const d = JSON.parse(e.data);
    if (activeRunData) {
      if (d.totalProbes !== undefined) activeRunData.totalProbes = d.totalProbes;
      if (d.passProbes !== undefined) activeRunData.passProbes = d.passProbes;
      if (d.failProbes !== undefined) activeRunData.failProbes = d.failProbes;
      if (d.totalBandwidth !== undefined) activeRunData.totalBandwidth = d.totalBandwidth;
      if (d.creditsSpent !== undefined) activeRunData.creditsSpent = d.creditsSpent;
      if (!viewingRun) updateRunStats(activeRunData);
    }
  });

  es.addEventListener('result', e => {
    const d = JSON.parse(e.data);
    results[d.url] = d;
    currentUrl = null;
    const short = d.url.replace(/https?:\/\/(www\.)?/, '');
    appendLog(`${d.verdict === 'PASS' ? '\u2705' : '\u274c'} ${short} — ${d.dataType || 'Text'}`);
    updateAll();
  });

  es.addEventListener('probe-done', e => {
    // Individual probe completed, heartbeat will carry aggregated data
  });

  es.addEventListener('done', async e => {
    const d = JSON.parse(e.data);
    isTesting = false;
    setStatus('idle', `Done \u2014 ${d.pass} pass, ${d.fail} fail, ${d.untested || 0} untested`);
    const fill = document.getElementById('progress');
    fill.classList.remove('indeterminate');
    fill.classList.add('done');
    fill.style.width = '100%';
    document.getElementById('progress-pct-label').textContent = '100% Complete';
    document.getElementById('progress-pct-large').textContent = '100%';
    document.getElementById('progress-pct-large').style.display = '';
    document.getElementById('eta-block').style.display = '';
    document.getElementById('eta-value').textContent = '00:00';
    // Re-fetch full state to ensure counts are accurate
    const fresh = await fetch('/api/results').then(r => r.json());
    results = fresh.results || {};
    updateAll();
    fetchCredits();
    currentRunId = null;
    populateRunSelect();
  });

  es.addEventListener('cleared', () => { results = {}; updateAll(); });

  es.addEventListener('heartbeat', e => {
    const d = JSON.parse(e.data);
    isTesting = d.testing;

    if (d.activeRun) {
      // Merge heartbeat data but preserve locally-tracked creditsSpent from credits-update
      const prevSpent = activeRunData?.creditsSpent;
      activeRunData = d.activeRun;
      if (prevSpent !== undefined && prevSpent !== null && (activeRunData.creditsSpent === null || activeRunData.creditsSpent === undefined)) {
        activeRunData.creditsSpent = prevSpent;
      }
      if (!currentRunId && d.activeRun.id) currentRunId = d.activeRun.id;
      if (d.activeRun.elapsedBeforePause !== undefined) elapsedOffset = d.activeRun.elapsedBeforePause;
      if (d.activeRun.resumedAt && !runStartTime) runStartTime = new Date(d.activeRun.resumedAt).getTime();

      // Only update run stats if viewing live — use merged activeRunData, not raw heartbeat
      if (!viewingRun) {
        updateRunStats(activeRunData);
      }

      updateProgressFromHeartbeat(d.activeRun, d.sitesProcessed, d.sitesTotal);
    }

    // Always update stats from heartbeat
    updateAll();

    if (d.currentUrl && d.currentUrl !== currentUrl) {
      currentUrl = d.currentUrl;
    }
    updateBtns();
  });

  es.onerror = () => {
    es.close(); es = null;
    setTimeout(async () => {
      try {
        const r = await fetch('/api/results').then(r => r.json());
        results = r.results || {};
        isTesting = r.testing;
        currentUrl = r.currentUrl;
        updateAll();
      } catch (e) { console.warn('SSE reconnect failed:', e.message); }
      connectSSE();
    }, 3000);
  };
}

// ─── Rendering ───

function updateAll() { updateStats(); updateCats(); updateTable(); updateBtns(); updateRetryCount(); }

function v(url) { return results[url]?.verdict || null; }

function updateStats() {
  // Count from results directly — most accurate
  const allResults = Object.values(results);
  const pass = allResults.filter(r => r.verdict === 'PASS').length;
  const fail = allResults.filter(r => r.verdict === 'FAIL').length;
  const tested = pass + fail;
  const total = Math.max(sites.length, tested);
  const untested = total - tested;
  const rate = tested > 0 ? Math.round((pass / tested) * 100) + '%' : '-';
  document.getElementById('s-total').textContent = total;
  document.getElementById('s-pass').textContent = pass;
  document.getElementById('s-fail').textContent = fail;
  document.getElementById('s-untested').textContent = untested;
  document.getElementById('s-rate').textContent = rate;
  document.getElementById('s-rate').style.color =
    rate === '-' ? ''
    : pass / tested >= .5 ? 'var(--pass)'
    : pass / tested >= .25 ? 'var(--warn)'
    : 'var(--fail)';
}

function updateCats() {
  const cats = {};
  sites.forEach(s => {
    if (!cats[s.category]) cats[s.category] = { pass: 0, fail: 0, untested: 0 };
    const r = results[s.url];
    if (!r) cats[s.category].untested++;
    else if (r.verdict === 'PASS') cats[s.category].pass++;
    else cats[s.category].fail++;
  });
  document.getElementById('categories').innerHTML = Object.entries(cats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, c]) => {
      const t = c.pass + c.fail + c.untested;
      const pw = (c.pass / t) * 100;
      const fw = (c.fail / t) * 100;
      return `<div class="cat-row"><span class="cat-name">${name}</span>
        <div class="cat-bar-bg"><div class="cat-bar-pass" style="width:${pw}%"></div><div class="cat-bar-fail" style="width:${fw}%"></div></div>
        <span class="cat-count">${c.pass}/${t}</span></div>`;
    }).join('');
}

function updateTable() {
  let rows = sites.map(s => ({ ...s, r: results[s.url] || null }));
  if (activeFilter === 'pass') rows = rows.filter(r => r.r?.verdict === 'PASS');
  else if (activeFilter === 'fail') rows = rows.filter(r => r.r?.verdict === 'FAIL');
  else if (activeFilter === 'untested') rows = rows.filter(r => !r.r);

  const vOrd = { FAIL: 0, PASS: 2 };
  rows.sort((a, b) => {
    if (sortBy === 'verdict') return (vOrd[a.r?.verdict] ?? 2) - (vOrd[b.r?.verdict] ?? 2);
    if (sortBy === 'category') return a.category.localeCompare(b.category);
    if (sortBy === 'url') return a.url.localeCompare(b.url);
    if (sortBy === 'evidence') return (b.r?.realBlocks || 0) - (a.r?.realBlocks || 0);
    if (sortBy === 'lastTested') return (b.r?.lastTested || '').localeCompare(a.r?.lastTested || '');
    return 0;
  });

  document.getElementById('tbody').innerHTML = rows.map(row => {
    const r = row.r;
    const isCurr = currentUrl && currentUrl === row.url;
    const verdict = isCurr ? 'TESTING' : (r?.verdict || 'UNTESTED');
    const nr = r?.nodeResults || {};
    const nd = c => {
      if (!nr[c]) return `<div class="node-dot none">${c}</div>`;
      return `<div class="node-dot ${nr[c].passed ? 'pass' : 'fail'}" title="${nr[c].errorCode || 'OK'} ${Math.round((nr[c].responseTime || 0) / 1000)}s">${c}</div>`;
    };

    let ev = '-';
    if (r) {
      const rb = r.realBlocks || 0;
      const sigs = r.blockSignals || [];
      const nrKeys = Object.keys(nr);
      const nrPass = nrKeys.filter(c => nr[c]?.passed).length;
      const parts = [];
      if (rb > 0) parts.push(`<span class="real">${rb} block${rb > 1 ? 's' : ''}</span>`);
      if (sigs.length > 0) parts.push(`<span class="sig">${sigs.slice(0, 2).join(', ')}</span>`);
      if (nrKeys.length > 3) parts.push(`<span style="color:var(--muted)">${nrPass}/${nrKeys.length} countries</span>`);
      if (parts.length === 0 && r.verdict === 'PASS') {
        const best = (r.history || []).find(h => h.status === 'pass');
        if (best) parts.push(`${countryFlag(best.country)} ${(best.responseTime / 1000).toFixed(1)}s`);
      }
      const hasDetails = r.verdict === 'FAIL' || sigs.length > 0 || rb > 0;
      const evText = parts.join(' &middot; ') || (r.verdict === 'PASS' ? 'OK' : 'No data');
      if (hasDetails) {
        ev = `<div class="evidence clickable" onclick="showBlockDetail('${row.url.replace(/'/g, "\\'")}')">${evText}</div>`;
      } else {
        ev = `<div class="evidence">${evText}</div>`;
      }
    }

    const tested = r?.lastTested ? timeAgo(r.lastTested) : '-';
    return `<tr class="${isCurr ? 'active' : ''}">
      <td class="url-cell" title="${row.url}">${strip(row.url)}</td>
      <td style="color:var(--muted)">${row.category}</td>
      <td><span class="verdict ${verdict}">${verdict}</span></td>
      <td style="text-align:center">${prevPassed[row.url] ? `<span style="color:var(--pass)">${prevPassed[row.url]}/${pastRuns.length}</span>` : '<span style="color:var(--muted)">-</span>'}</td>
      ${activeCountries.map(c => `<td>${nd(c)}</td>`).join('')}
      <td style="color:var(--muted)">${r?.dataType || 'Pending'}</td>
      <td>${ev}</td>
      <td><span class="time-ago">${tested}</span></td>
      <td><div style="display:flex;gap:3px">
        <button class="actions-cell" onclick="testOne('${row.url}')" ${isTesting ? 'disabled' : ''}>Test</button>
        <button class="actions-cell" onclick="removeSite('${row.url}')" style="color:var(--muted)">X</button>
      </div></td>
    </tr>`;
  }).join('');
}

function updateBtns() {
  document.getElementById('btn-new-test').disabled = isTesting;
  document.getElementById('btn-resume').disabled = isTesting;
  document.getElementById('btn-stop').disabled = !isTesting;
  document.getElementById('btn-retry').disabled = isTesting;
  document.getElementById('btn-restart').disabled = isTesting;
}

function updateRetryCount() {
  const failCount = sites.filter(s => results[s.url]?.verdict === 'FAIL').length;
  const btn = document.getElementById('btn-retry');
  btn.textContent = failCount > 0 ? `Retry Failed (${failCount})` : 'Retry Failed';
}

function strip(u) { return u.replace(/^https?:\/\/(www\.)?/, ''); }

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h';
}

// ─── Actions ───

async function newTest() {
  if (isTesting) return;
  isTesting = true;
  results = {};
  resetProgress();
  updateBtns();
  fetch('/api/new-test', { method: 'POST' });
}

async function resume() {
  if (isTesting) return;
  const r = await fetch('/api/run', { method: 'POST' }).then(r => r.json());
  if (r.error) return alert(r.error);
  isTesting = true;
  updateBtns();
}

async function stop() {
  await fetch('/api/stop', { method: 'POST' });
  isTesting = false;
  updateBtns();
}

async function testOne(url) {
  if (isTesting) return;
  await fetch('/api/test-one', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  isTesting = true;
  updateBtns();
}

async function removeSite(url) {
  if (!confirm('Remove ' + strip(url) + '?')) return;
  await fetch('/api/remove-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  sites = sites.filter(s => s.url !== url);
  delete results[url];
  updateAll();
}

async function retryFailed() {
  if (isTesting) return;
  const r = await fetch('/api/retry-failed', { method: 'POST' }).then(r => r.json());
  if (r.error) return alert(r.error);
  isTesting = true;
  updateBtns();
}

function exportResults() {
  const data = {
    exported: new Date().toISOString(),
    sites: sites.length,
    results,
    runs: pastRuns,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `scout-results-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function restart() {
  if (isTesting) return;
  if (!confirm('Restart test? This clears current results without saving.')) return;
  await fetch('/api/clear', { method: 'POST' });
  results = {};
  updateAll();
  resetProgress();
  updateRunStats(null);
  // Start fresh
  const r = await fetch('/api/run', { method: 'POST' }).then(r => r.json());
  if (r.error) return alert(r.error);
  isTesting = true;
  updateBtns();
}

// ─── Block Detail Popup ───

const BLOCK_DESCRIPTIONS = {
  CAPTCHA: 'Site requires CAPTCHA verification (reCAPTCHA, hCaptcha)',
  CLOUDFLARE: 'Cloudflare protection detected — challenge page or Ray ID',
  ACCESS_DENIED: 'HTTP 403 Forbidden — access explicitly denied',
  BOT_DETECT: 'Bot detection system triggered — request flagged as automated',
  CHALLENGE: 'Browser security challenge required before access',
  JS_REQUIRED: 'Site requires JavaScript execution to render content',
  RATE_LIMIT: 'Rate limiting active — too many requests detected',
  UNUSUAL_TRAFFIC: 'Site flagged unusual traffic patterns from this IP',
  HUMAN_VERIFY: 'Human verification required (e.g. "Verify you are human")',
  IP_BLOCKED: 'IP address blocked — request denied at network level',
};

function showBlockDetail(url) {
  const r = results[url];
  if (!r) return;

  document.getElementById('popup-title').textContent = strip(url);
  const body = document.getElementById('popup-body');

  const sigs = r.blockSignals || [];
  const nr = r.nodeResults || {};
  const hist = r.history || [];

  let html = '';

  // Verdict
  html += `<div class="popup-section">
    <div class="popup-section-title">Verdict</div>
    <div class="popup-row">
      <span class="label">Status</span>
      <span class="val ${r.verdict === 'PASS' ? 'pass' : 'fail'}">${r.verdict}</span>
    </div>
    <div class="popup-row">
      <span class="label">Total Probes</span>
      <span class="val">${r.totalProbes || 0}</span>
    </div>
    <div class="popup-row">
      <span class="label">Real Blocks</span>
      <span class="val fail">${r.realBlocks || 0}</span>
    </div>
    <div class="popup-row">
      <span class="label">Data Type</span>
      <span class="val">${r.dataType || 'Text'}</span>
    </div>
  </div>`;

  // Block Signals
  if (sigs.length > 0) {
    html += `<div class="popup-section">
      <div class="popup-section-title">Block Reasons Detected</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
        ${sigs.map(s => `<span class="block-tag">${s}</span>`).join('')}
      </div>`;
    for (const sig of sigs) {
      html += `<div class="popup-row">
        <span class="label">${sig}</span>
        <span class="val" style="font-size:12px;font-weight:400;color:var(--text-dim);max-width:260px;text-align:right">${BLOCK_DESCRIPTIONS[sig] || 'Unknown block type'}</span>
      </div>`;
    }
    html += '</div>';
  } else if (r.verdict === 'FAIL') {
    html += `<div class="popup-section">
      <div class="popup-section-title">Block Reasons</div>
      <div class="popup-row">
        <span class="label">No specific signals detected</span>
        <span class="val warn">Unknown block</span>
      </div>
    </div>`;
  }

  // Per-Country Results — show ALL tested countries
  const testedCountries = Object.keys(nr);
  const passCountries = testedCountries.filter(c => nr[c]?.passed);
  const failCountries = testedCountries.filter(c => !nr[c]?.passed);

  html += `<div class="popup-section">
    <div class="popup-section-title">Country Results (${testedCountries.length} tested — ${passCountries.length} pass, ${failCountries.length} fail)</div>`;

  // Country analysis — detect patterns
  if (testedCountries.length > 3 && failCountries.length > 0 && passCountries.length > 0) {
    html += `<div style="background:rgba(255,177,55,.08);border:1px solid rgba(255,177,55,.2);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:var(--warn)">
      Geo-selective blocking — passes in ${passCountries.map(c => countryFlag(c)).join(' ')} but fails in ${failCountries.length} other countries
    </div>`;
  } else if (testedCountries.length > 3 && passCountries.length === 0) {
    html += `<div style="background:rgba(220,53,69,.08);border:1px solid rgba(220,53,69,.2);border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:var(--fail)">
      Global block — failed in all ${testedCountries.length} countries tested
    </div>`;
  }

  // Pass countries first, then fail
  for (const country of [...passCountries, ...failCountries]) {
    const cn = nr[country];
    html += `<div class="popup-row">
      <span class="label">${countryFlag(country)} ${country}</span>
      <span class="val ${cn.passed ? 'pass' : 'fail'}">${cn.passed ? 'PASS' : 'FAIL'} &middot; ${(cn.responseTime / 1000).toFixed(1)}s &middot; ${formatBytes(cn.contentLength || 0)}${cn.errorCode && !cn.passed ? ' &middot; ' + cn.errorCode : ''}</span>
    </div>`;
  }
  html += '</div>';

  // Probe History
  if (hist.length > 0) {
    const shown = hist.slice(-20).reverse();
    html += `<div class="popup-section">
      <div class="popup-section-title">Probe History (${shown.length} of ${hist.length})</div>`;
    for (const h of shown) {
      const time = new Date(h.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      html += `<div class="popup-row">
        <span class="label">${countryFlag(h.country)} ${h.country} &middot; ${time}</span>
        <span class="val ${h.status === 'pass' ? 'pass' : 'fail'}">${h.status.toUpperCase()} &middot; ${(h.responseTime / 1000).toFixed(1)}s${h.errorCode && h.status === 'fail' ? ' &middot; ' + h.errorCode : ''}</span>
      </div>`;
    }
    html += '</div>';
  }

  body.innerHTML = html;
  document.getElementById('block-popup').classList.add('show');
}

// ─── Live Log ───

let logCount = 0;
function appendLog(msg) {
  const log = document.getElementById('live-log');
  if (!log) return;
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = document.createElement('div');
  line.textContent = `[${time}] ${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  logCount++;
  document.getElementById('log-count').textContent = `(${logCount})`;
  // Keep max 500 lines
  while (log.children.length > 500) log.removeChild(log.firstChild);
}

// ─── Queue Toggle ───

async function toggleQueue() {
  if (isTesting) return alert('Cannot change while testing');
  const current = await fetch('/api/settings').then(r => r.json());

  let nextFireAll = false;
  let nextBatch = 5;

  if (current.fireAllMode) {
    // Fire All → Batch 5
    nextFireAll = false; nextBatch = 5;
  } else if (current.batchSize >= 30) {
    // Batch 30 → Fire All
    nextFireAll = true; nextBatch = 30;
  } else if (current.batchSize >= 15) {
    // Batch 15 → Batch 30
    nextBatch = 30;
  } else {
    // Batch 5 → Batch 15
    nextBatch = 15;
  }

  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fireAll: nextFireAll, batchSize: nextBatch }),
  });
  updateQueueBtn();
}

async function updateQueueBtn() {
  const s = await fetch('/api/settings').then(r => r.json());
  const btn = document.getElementById('btn-queue');
  if (s.fireAllMode) {
    btn.textContent = 'Fire All';
    btn.style.color = 'var(--fail)';
  } else {
    btn.textContent = 'Batch: ' + (s.batchSize || 5);
    btn.style.color = '';
  }
}

// ─── Settings ───

async function showSettings() {
  const popup = document.getElementById('settings-popup');
  const body = document.getElementById('settings-body');
  popup.classList.add('show');

  const [settings, countries] = await Promise.all([
    fetch('/api/settings').then(r => r.json()),
    fetch('/api/countries').then(r => r.json()),
  ]);

  const I = 'width:70px;padding:4px 8px;border:1px solid var(--glass-border);border-radius:var(--radius-xs);background:var(--bg);font-size:13px;color:var(--text);text-align:center';
  const chk = (id, val) => `<input type="checkbox" id="${id}" ${val ? 'checked' : ''}>`;
  const num = (id, val, min, max, step) => `<input type="number" id="${id}" value="${val}" min="${min}" max="${max}" ${step ? 'step="'+step+'"' : ''} style="${I}">`;

  body.innerHTML = `
    <div class="popup-section">
      <div class="popup-section-title">Request Mode</div>
      <div class="popup-row">
        <span class="label">Fire All at Once</span>
        <label style="cursor:pointer">${chk('s-fireAll', settings.fireAllMode)}</label>
      </div>
      <div class="popup-row">
        <span class="label">Batch Size</span>
        ${num('s-batchSize', settings.batchSize, 1, 100)}
      </div>
      <div class="popup-row">
        <span class="label">Gap Between Batches (ms)</span>
        ${num('s-batchGap', settings.batchGap, 0, 10000, 50)}
      </div>
    </div>

    <div class="popup-section">
      <div class="popup-section-title">Auto-Retest Failed</div>
      <div class="popup-row">
        <span class="label">Enabled</span>
        <label style="cursor:pointer">${chk('s-autoRetest', settings.autoRetestEnabled)}</label>
      </div>
      <div class="popup-row">
        <span class="label">Max Retries</span>
        ${num('s-autoRetestMax', settings.autoRetestMax, 1, 100)}
      </div>
    </div>

    <div class="popup-section">
      <div class="popup-section-title">Expand Countries on Retry</div>
      <div class="popup-row">
        <span class="label">Try All Countries After Retry #</span>
        ${num('s-expandAfter', settings.expandCountriesAfter || 2, 1, 99)}
      </div>
      <div style="font-size:11px;color:var(--muted-60);padding:4px 12px">
        After this many retries still fail, switch to all 61 countries for remaining retries. Must be less than Max Retries.
      </div>
    </div>

    <div class="popup-section">
      <div class="popup-section-title">Countries (${countries.active.length} active)</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
        <button onclick="setCountryPreset('default')" style="font-size:11px;padding:6px 14px" class="${countries.mode === 'default' ? 'primary' : ''}">Top 3</button>
        <button onclick="setCountryPreset('all')" style="font-size:11px;padding:6px 14px" class="${countries.mode === 'all' ? 'primary' : ''}">All ${countries.available.length}</button>
      </div>
      <div style="font-size:11px;color:var(--muted-60);padding:4px 0;line-height:1.6">
        ${countries.active.join(', ')}
      </div>
    </div>

    <button class="primary" onclick="saveAllSettings()" style="width:100%;margin-top:8px;padding:12px">Save Settings</button>
  `;
}

async function saveAllSettings() {
  const body = {
    fireAll: document.getElementById('s-fireAll')?.checked || false,
    batchSize: document.getElementById('s-batchSize')?.value || 5,
    batchGap: document.getElementById('s-batchGap')?.value || 500,
    autoRetest: document.getElementById('s-autoRetest')?.checked || false,
    autoRetestMax: document.getElementById('s-autoRetestMax')?.value || 3,
    expandCountriesAfter: document.getElementById('s-expandAfter')?.value || 2,
  };
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  updateQueueBtn();
  document.getElementById('settings-popup').classList.remove('show');
}

async function saveSetting(key, value) {
  const body = {};
  body[key] = value;
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  showSettings();
}

async function setCountryPreset(mode) {
  await fetch('/api/countries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  }).then(r => r.json());
  const cData = await fetch('/api/countries').then(r => r.json());
  countryMode = cData.mode;
  activeCountries = cData.active;
  updateCountryBtn();
  updateTableHeaders();
  updateTable();
  showSettings();
}

// ─── Country Mode ───

function updateCountryBtn() {
  const btn = document.getElementById('btn-countries');
  btn.textContent = countryMode === 'all' ? `${activeCountries.length} Countries` : '3 Countries';
}

function updateTableHeaders() {
  const thead = document.getElementById('thead');
  const countryCols = activeCountries.map(c => `<th>${c}</th>`).join('');
  thead.innerHTML = `<tr>
    <th>URL</th><th>Category</th><th>Verdict</th><th>Prev</th>
    ${countryCols}
    <th>Data Type</th><th>Evidence</th><th>Tested</th><th></th>
  </tr>`;
}

async function toggleCountries() {
  if (isTesting) return alert('Cannot change countries while testing');
  const newMode = countryMode === 'all' ? 'default' : 'all';
  const r = await fetch('/api/countries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: newMode }),
  }).then(r => r.json());
  countryMode = r.mode;
  activeCountries = r.active;
  updateCountryBtn();
  updateTableHeaders();
  updateTable();
}

// ─── Account ───

function getSavedKeys() {
  try { return JSON.parse(localStorage.getItem('scout_keys') || '[]'); } catch { return []; }
}

function saveKeyToLocal(key) {
  const keys = getSavedKeys();
  if (!keys.includes(key)) { keys.push(key); localStorage.setItem('scout_keys', JSON.stringify(keys)); }
}

function removeKeyFromLocal(key) {
  const keys = getSavedKeys().filter(k => k !== key);
  localStorage.setItem('scout_keys', JSON.stringify(keys));
}

async function showAccount() {
  const popup = document.getElementById('account-popup');
  const body = document.getElementById('account-body');
  popup.classList.add('show');
  body.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">Loading...</div>';

  const data = await fetch('/api/account').then(r => r.json());
  const savedKeys = getSavedKeys();

  let html = '';

  if (data.connected) {
    // Save this key locally
    saveKeyToLocal(data.key);

    html += `
      <div class="popup-section">
        <div class="popup-section-title">Active Account</div>
        <div class="popup-row" style="cursor:pointer" onclick="copyKey(this)" title="Click to copy">
          <span class="label">API Key</span>
          <span class="val" style="font-size:11px;font-family:monospace;word-break:break-all">${data.key}</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;text-align:center" id="copy-hint">Click to copy</div>
      </div>`;

    if (data.credits !== null) {
      html += `
      <div class="popup-section">
        <div class="popup-section-title">Account Info</div>
        <div class="popup-row"><span class="label">Credits</span><span class="val" style="color:var(--warn)">${typeof data.credits === 'number' ? data.credits.toFixed(2) : data.credits}</span></div>
        ${data.totalJobs ? `<div class="popup-row"><span class="label">Total Jobs</span><span class="val">${data.totalJobs}</span></div>` : ''}
      </div>`;
    }
  }

  // Saved keys section
  const otherKeys = savedKeys.filter(k => k !== data.key);
  if (otherKeys.length > 0) {
    html += `<div class="popup-section">
      <div class="popup-section-title">Saved Keys</div>`;
    otherKeys.forEach(k => {
      const masked = k.slice(0, 12) + '...' + k.slice(-4);
      html += `<div class="popup-row">
        <span class="label" style="font-family:monospace;font-size:11px">${masked}</span>
        <span>
          <button onclick="switchKey('${k}')" style="font-size:11px;padding:3px 8px;margin-right:4px">Use</button>
          <button onclick="forgetKey('${k}')" style="font-size:11px;padding:3px 8px;color:var(--fail)">Forget</button>
        </span>
      </div>`;
    });
    html += '</div>';
  }

  // Add new key
  html += `
    <div class="popup-section">
      <div class="popup-section-title">${data.connected ? 'Add Another Key' : 'Connect Your Scout API Key'}</div>
      <div style="margin-bottom:8px">
        <input type="text" id="api-key-input" placeholder="scout-c1_your_key_here"
          style="width:100%;padding:10px 12px;border:none;border-radius:var(--radius-xs);
          background:var(--bg);font-family:monospace;font-size:13px;color:var(--text);
          box-shadow:inset 0 1px 3px rgba(0,0,0,.06)">
      </div>
      <button class="primary" onclick="connectAccount()" style="width:100%">Connect</button>
    </div>`;

  body.innerHTML = html;
  if (!data.connected) setTimeout(() => document.getElementById('api-key-input')?.focus(), 100);
}

async function connectAccount() {
  const input = document.getElementById('api-key-input');
  const key = input?.value.trim();
  if (!key) return;
  const r = await fetch('/api/account/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).then(r => r.json());
  if (r.error) return alert(r.error);
  saveKeyToLocal(key);
  fetchCredits();
  showAccount();
}

async function switchKey(key) {
  await fetch('/api/account/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  fetchCredits();
  showAccount();
}

function forgetKey(key) {
  removeKeyFromLocal(key);
  showAccount();
}

function copyKey(el) {
  const val = el.querySelector('.val').textContent;
  navigator.clipboard.writeText(val).then(() => {
    const hint = document.getElementById('copy-hint');
    if (hint) { hint.textContent = 'Copied!'; setTimeout(() => hint.textContent = 'Click to copy', 2000); }
  });
}

// ─── Wire Up ───

document.getElementById('btn-new-test').onclick = newTest;
document.getElementById('btn-resume').onclick = resume;
document.getElementById('btn-stop').onclick = stop;
document.getElementById('btn-retry').onclick = retryFailed;
document.getElementById('btn-restart').onclick = restart;
document.getElementById('btn-queue').onclick = toggleQueue;
document.getElementById('btn-countries').onclick = toggleCountries;
document.getElementById('btn-settings').onclick = showSettings;
document.getElementById('btn-export').onclick = exportResults;
document.getElementById('btn-account').onclick = showAccount;
document.getElementById('chk-retry-all').onchange = async (e) => {
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retryAllCountries: e.target.checked }),
  });
};
document.getElementById('sort-select').onchange = e => { sortBy = e.target.value; updateTable(); };
document.getElementById('run-select').onchange = e => showRunDetail(e.target.value);
document.getElementById('run-history-close').onclick = () => {
  if (currentRunId) document.getElementById('run-select').value = String(currentRunId);
  showRunDetail('live');
};
document.querySelectorAll('.filters .tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.filters .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    activeFilter = t.dataset.filter;
    updateTable();
  };
});

setInterval(updateTable, 30000);
init();
