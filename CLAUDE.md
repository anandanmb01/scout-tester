# Scout Tester

## STANDARD S1 — Follow `memory/standard-S1-token-efficiency.md`

## Session Startup
1. Read `C:\Users\Connect\.claude\projects\C--Users-Connect\memory\handoff-scout-tester.md` for context
   - ONLY update THIS file, never touch other project handoffs
2. Print the status dashboard, then **ask the user what to do**
3. NEVER auto-execute anything from handoff — it's context only

## Handoff (MANDATORY MICRO-SAVE — NON-NEGOTIABLE)
**Auto-save every 10 tool calls.** Also save before multi-step tasks, after user decisions, and at session end. NEVER wait for the user to ask. Write facts only. See root CLAUDE.md "Memory & Persistence" for full rules.

## Quick Ref
- **Port:** 3004, start with `start.bat`
- **Stack:** Express, Scout API, SSE dashboard
- **Scout API:** 30s gap, FR/DE/GB only, never parallel

## Layout (v2.2.0 — Blue JS SDK pattern)
```
src/
  config/    errors/    logger/    countries/    probe/
  results/   runs/      state/     runner/{settings,pipeline,index}
  index.js (barrel)
server/
  sse.js
  routes/{results,countries,settings,account,runs,control,index}.js
server.js          # thin boot
index.html         # thin shell
web/{styles.css,app.js}
data/{sites.json (75 sites), results.json, runs/}
test/smoke.js      # 24 assertions
```

- Every module has a barrel `index.js`.
- Errors: `ScoutError` + subclasses with `ErrorCodes` string enum (`src/errors/`).
- Logger: `[scout]` prefixed, level-gated via `SCOUT_LOG_LEVEL` (`src/logger/`).
- Runner state extracted to `src/state/`; broadcast injected via `setBroadcast`.
- Per-site `run-update` SSE emitted inside pipeline batch callbacks (row 2 lag fix).
- `package.json` exposes `exports` map + `sideEffects` array for tree-shaking.
