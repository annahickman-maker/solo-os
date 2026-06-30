/**
 * Feature auto-discovery (additive). Globs two roots and mounts whatever it
 * finds, so a new feature is a self-contained folder - no edit to index.ts.
 *
 *   server/src/features/<name>/route.ts   PRODUCT  - ships on release
 *   server/src/lab/<name>/route.ts        LAB      - gitignored, stays local
 *
 * Each route.ts default-exports { basePath, app } where app is a Hono sub-app:
 *
 *   import { Hono } from 'hono';
 *   const app = new Hono();
 *   app.get('/', (c) => c.json({ ok: true }));
 *   export default { basePath: '/api/<name>', app };
 *
 * The 37 central routes in index.ts stay centrally registered - this runs
 * ALONGSIDE them. Discovery is additive; it does not replace the core wiring.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Hono } from 'hono';

const here = dirname(fileURLToPath(import.meta.url));

type FeatureModule = { default?: { basePath?: string; app?: Hono } };

export async function mountFeatures(app: Hono): Promise<void> {
  const mounted: string[] = [];
  // 'lab' is gitignored and may not exist - that's fine, we skip missing roots.
  for (const root of ['features', 'lab']) {
    const dir = join(here, root);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // tsx runs source directly (no build step), so the real file is route.ts.
      const routeFile = join(dir, entry.name, 'route.ts');
      if (!existsSync(routeFile)) continue;
      try {
        const mod = (await import(pathToFileURL(routeFile).href)) as FeatureModule;
        const feature = mod.default;
        if (!feature?.basePath || !feature.app) {
          console.warn(`[features] ${root}/${entry.name}/route.ts has no valid { basePath, app } default export - skipping`);
          continue;
        }
        app.route(feature.basePath, feature.app);
        mounted.push(`${feature.basePath} <- ${root}/${entry.name}`);
      } catch (err) {
        console.error(`[features] failed to load ${root}/${entry.name}:`, (err as Error).message);
      }
    }
  }
  if (mounted.length) {
    console.log(`[features] auto-mounted ${mounted.length}: ${mounted.join(', ')}`);
  }
}
