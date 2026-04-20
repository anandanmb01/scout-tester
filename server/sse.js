/**
 * Scout Tester Server — SSE Transport
 *
 * Owns the Server-Sent Events client list and broadcast helper. The
 * heartbeat interval is started once on boot and cleared on shutdown.
 * Broadcast is wired into the runner via `setBroadcast` so pipeline
 * events reach connected clients.
 */

import { getState, setBroadcast } from '../src/state/index.js';

// ─── Client List ───

let sseClients = [];

// ─── Broadcast ───

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter((c) => !c.writableEnded);
  sseClients.forEach((c) => c.write(msg));
}

// ─── Wire Runner ───

setBroadcast(broadcast);

// ─── Stream Handler ───

export function streamHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.push(res);
  req.on('close', () => { sseClients = sseClients.filter((c) => c !== res); });
}

// ─── Heartbeat ───

export function startHeartbeat(intervalMs = 5000) {
  return setInterval(() => {
    const { testing, phase, currentUrl, sitesProcessed, sitesTotal, activeRun } = getState();
    broadcast('heartbeat', {
      t: Date.now(), testing, phase, currentUrl,
      sitesProcessed, sitesTotal,
      activeRun: activeRun ? {
        id: activeRun.number,
        type: activeRun.type,
        startedAt: activeRun.startedAt,
        totalProbes: activeRun.totalProbes,
        passProbes: activeRun.passProbes,
        failProbes: activeRun.failProbes,
        totalBandwidth: activeRun.totalBandwidth,
        sitesProcessed: activeRun.sitesProcessed,
        sitesTotal: activeRun.sitesTotal,
        creditsStart: activeRun.creditsStart,
        creditsSpent: activeRun.creditsSpent,
        elapsedBeforePause: activeRun.elapsedBeforePause || 0,
        resumedAt: activeRun.resumedAt || activeRun.startedAt,
      } : null,
    });
  }, intervalMs);
}

// ─── Shutdown ───

export function closeSseClients() {
  sseClients.forEach((c) => {
    try { c.end(); } catch {}
  });
  sseClients = [];
}
