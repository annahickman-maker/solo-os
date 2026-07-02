/**
 * Bundle the two services for the desktop app.
 *
 * The web install runs server + bridge from TypeScript source via tsx. The
 * desktop app can't ship tsx + node_modules, so this esbuild step compiles
 * each service into ONE self-contained ESM file that Electron's utilityProcess
 * runs directly on the bundled Node. Output: desktop/dist/{server,bridge}.mjs.
 *
 * Run from the repo root: node desktop/build.mjs
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Some CJS dependencies (gray-matter and friends) call require() dynamically.
// In an ESM bundle there is no require, so provide one.
const banner = `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);`;

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: { js: banner },
  logLevel: 'info',
  // Vite is only referenced by dev tooling paths that never run in the app.
  external: [],
};

await build({
  ...shared,
  entryPoints: [path.join(repo, 'server', 'src', 'index.ts')],
  outfile: path.join(repo, 'desktop', 'dist', 'server.mjs'),
});

await build({
  ...shared,
  entryPoints: [path.join(repo, 'claude-bridge', 'server.ts')],
  outfile: path.join(repo, 'desktop', 'dist', 'bridge.mjs'),
});

console.log('desktop bundles built: desktop/dist/server.mjs + bridge.mjs');
