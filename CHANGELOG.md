# Changelog

All notable changes to scout-tester are documented in this file.

## [2.2.0] — 2026-04-19

### Changed
- **Restructured codebase to match the Blue JS SDK layout.** `core/` is
  gone; logic now lives in per-feature modules under `src/` (`config/`,
  `errors/`, `logger/`, `countries/`, `probe/`, `results/`, `runs/`,
  `state/`, `runner/`), each with a barrel `index.js`.
- **Split `server.js`.** The 415-line monolith is now a thin boot script;
  routes live in `server/routes/{results,countries,settings,account,runs,control}.js`,
  and SSE transport lives in `server/sse.js`.
- **Runner split** into `src/runner/settings.js` (persisted options) and
  `src/runner/pipeline.js` (batch/fire-all/retry orchestration), with
  shared mutable state extracted to `src/state/`.
- **`package.json` 2.2.0:** new `exports` map covering every submodule,
  `main` now `src/index.js`, `files` updated for the new layout,
  `sideEffects` array declared so bundlers can tree-shake.

### Added
- **`src/errors/`** — typed `ScoutError`, `ValidationError`, `ApiError`,
  `ProbeError`, `PersistenceError` classes with stable `ErrorCodes`
  constants (`INVALID_OPTIONS`, `PROBE_TIMEOUT`, etc.).
- **`src/logger/`** — prefixed logger (`[scout]`) with `setLogLevel` /
  `setLogPrefix`. Replaces direct `console.warn` calls throughout the
  library layer.
- **`src/index.js`** — top-level barrel re-exporting the public API.

### Fixed
- **Row 2 dashboard lag.** `run-update` SSE events are now emitted after
  every site completes (not only at batch boundaries), so credits, probe
  counts, and bandwidth in the top stats row update in lockstep with
  the progress bar.

### Web
- `index.html` slimmed from 1827 to 205 lines. Styles moved to
  `web/styles.css` (349 lines); app JS moved to `web/app.js`
  (1271 lines). Assets served from `/web/*`.
