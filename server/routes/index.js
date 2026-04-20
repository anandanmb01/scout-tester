/**
 * Scout Tester Server — Routes (Barrel)
 *
 * Collects every router and mounts them under /api. The broadcast function
 * is injected by the top-level server so routes can push SSE events.
 */

import { resultsRouter } from './results.js';
import { countriesRouter } from './countries.js';
import { settingsRouter } from './settings.js';
import { accountRouter } from './account.js';
import { runsRouter } from './runs.js';
import { controlRouter } from './control.js';

export function mountApiRoutes(app, broadcast) {
  app.use('/api', resultsRouter(broadcast));
  app.use('/api', countriesRouter());
  app.use('/api', settingsRouter());
  app.use('/api', accountRouter());
  app.use('/api', runsRouter(broadcast));
  app.use('/api', controlRouter(broadcast));
}
