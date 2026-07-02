/**
 * the creator's dashboard server. Hono on :8790. Every route reads/writes vault
 * files under VAULT_ROOT directly - there is no database.
 */

// Load server/.env into process.env if it exists. Does NOT override vars
// already set by the launcher (start-local.sh exports PORT, DASHBOARD_PASSWORD,
// etc.) - so the env block in the supervisor still wins where it sets a key.
// Anything ONLY in .env (e.g. GOOGLE_CLIENT_ID/SECRET, FRONTEND_URL) flows in.
try {
  (process as any).loadEnvFile?.('./.env');
} catch {
  // No .env file - that's fine; vars may be set by the launcher.
}

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth.js';
import clients from './routes/clients.js';
import tasks from './routes/tasks.js';
import projects from './routes/projects.js';
import goals from './routes/goals.js';
import products from './routes/products.js';
import povs from './routes/povs.js';
import videos from './routes/videos.js';
import inbox from './routes/inbox.js';
import youtube from './routes/youtube.js';
import today from './routes/today.js';
import focus from './routes/focus.js';
import pipeline from './routes/pipeline.js';
import ssModules from './routes/ssModules.js';
import settings from './routes/settings.js';
import metrics from './routes/metrics.js';
import skills from './routes/skills.js';
import profile from './routes/profile.js';
import deepWork from './routes/deepWork.js';
import reputation from './routes/reputation.js';
import thisWeek from './routes/thisWeek.js';
import archive from './routes/archive.js';
import brainstorm from './routes/brainstorm.js';
import stripe from './routes/stripe.js';
import offers from './routes/offers.js';
import seed from './routes/seed.js';
import extracts from './routes/extracts.js';
import audienceQuotes from './routes/audienceQuotes.js';
import instagram, { serveCarouselFile, serveCarouselAsset } from './routes/instagram.js';
import journey from './routes/journey.js';
import decks, { serveDeckFile, serveDeckAsset } from './routes/decks.js';
import google, { callbackApp as googleCallback } from './routes/google.js';
import calendar from './routes/calendar.js';
import onboarding from './routes/onboarding.js';
import updateSoloOs from './routes/updateSoloOs.js';
import membership from './routes/membership.js';
import zoom from './routes/zoom.js';
import chat from './routes/chat.js';
import nanoBanana from './routes/nanoBanana.js';
import { mountFeatures } from './featureLoader.js';

const PORT = Number(process.env.PORT ?? 8790);

const app = new Hono();

app.use('*', cors({ origin: '*' }));

app.get('/', (c) => c.json({ ok: true, service: 'solo-os-dashboard-server (Phase 2)' }));
app.get('/health', (c) => c.json({ ok: true }));

// Vault asset serving has to live ABOVE the auth middleware because
// <img> tags can't send custom auth headers. The path-prefix whitelist
// inside the handler is the only safety net - keep it tight.
app.get('/api/vault-asset/*', async (c) => {
  const url = new URL(c.req.url);
  const relPath = decodeURIComponent(url.pathname.replace(/^\/api\/vault-asset\//, ''));
  if (relPath.includes('..') || relPath.startsWith('/')) {
    return c.json({ error: 'invalid path' }, 400);
  }
  // Tight allow-list. Anything else returns 403 even though no auth is
  // required - the prefix list is the security boundary here.
  const allowedPrefixes = ['05_Assets/Avatars/images/'];
  if (!allowedPrefixes.some((p) => relPath.startsWith(p))) {
    return c.json({ error: 'asset path not allowed' }, 403);
  }
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { abs } = await import('./vault.js');
  const fullPath = abs(relPath);
  let buf: Buffer;
  try {
    buf = fs.readFileSync(fullPath);
  } catch {
    return c.json({ error: 'not found' }, 404);
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : 'application/octet-stream';
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// Journey image serving - public (above auth) since <img> tags can't send
// the X-Dashboard-Password header. Strict name validation is the security
// boundary - only basename-safe characters allowed.
app.get('/api/journey/images/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return c.json({ error: 'bad name' }, 400);
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { abs } = await import('./vault.js');
  const full = abs('00_System', 'journey-images', name);
  if (!fs.existsSync(full)) return c.json({ error: 'not found' }, 404);
  const ext = path.extname(full).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : ext === '.svg' ? 'image/svg+xml'
    : 'application/octet-stream';
  const buf = fs.readFileSync(full);
  return new Response(buf, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' },
  });
});

// Client deck HTML - public route (above auth) because a new tab can't send
// the X-Dashboard-Password header. Has its own ?pw= check inside.
app.get('/api/decks/file', (c) => serveDeckFile(c.req.url));
// Sibling assets (images etc) referenced by relative paths inside a deck.
// Public so <img> tags resolve. Path-locked to deck folders.
app.get('/api/decks/asset/*', (c) => serveDeckAsset(c.req.url));

// Carousel HTML + sibling assets - public (above auth) so the in-app iframe
// can load them. The /file route does its own ?pw= check; both are path-locked
// to the carousels dir. Mirrors the deck routes above.
app.get('/api/instagram/carousel-file', (c) => serveCarouselFile(c.req.url));
app.get('/api/instagram/carousel-asset/*', (c) => serveCarouselAsset(c.req.url));

// Google OAuth callback - PUBLIC because Google's redirect can't send the
// dashboard password header. Bound to this dashboard via a signed state
// param (HMAC over DASHBOARD_PASSWORD, 10-min expiry).
app.route('/api/google/callback', googleCallback);

// Auth middleware on /api/* (same X-Dashboard-Password header as before).
app.use('/api/*', auth);

// Routes - one per entity as we migrate them off D1.
app.route('/api/clients', clients);
app.route('/api/tasks', tasks);
app.route('/api/projects', projects);
app.route('/api/goals', goals);
app.route('/api/products', products);
app.route('/api/povs', povs);
app.route('/api/videos', videos);
app.route('/api/inbox', inbox);
app.route('/api/youtube', youtube);
app.route('/api/today', today);
app.route('/api/focus', focus);
app.route('/api/pipeline', pipeline);
app.route('/api/ss-modules', ssModules);
app.route('/api/settings', settings);
app.route('/api/metrics', metrics);
app.route('/api/skills', skills);
app.route('/api/profile', profile);
app.route('/api/deep-work', deepWork);
// Reputation: only the content-analysis sub-routes go native (they need
// vault file access for the 40 transcripts). The page state still proxies.
app.route('/api/reputation', reputation);
app.route('/api/today/this-week', thisWeek);
app.route('/api/archive', archive);
app.route('/api/brainstorm', brainstorm);
app.route('/api/stripe', stripe);
app.route('/api/offers', offers);
app.route('/api/seed', seed);
app.route('/api/extracts', extracts);
app.route('/api/audience-quotes', audienceQuotes);
app.route('/api/instagram', instagram);
app.route('/api/journey', journey);
app.route('/api/decks', decks);
app.route('/api/google', google);
app.route('/api/calendar', calendar);
app.route('/api/onboarding', onboarding);
app.route('/api/update-solo-os', updateSoloOs);
app.route('/api/membership', membership);
app.route('/api/zoom', zoom);
app.route('/api/chat', chat);
app.route('/api/nano-banana', nanoBanana);

// Auto-discovered features (features/* ships, lab/* stays local). Additive -
// mounted AFTER the central routes and after the /api/* auth middleware, so
// discovered features inherit auth. See featureLoader.ts.
await mountFeatures(app);

// ─── Desktop app: serve the built frontend from this same origin ───────────
// When FRONTEND_DIST is set (the Solo OS desktop app points it at the bundled
// frontend build), this server IS the web server: same origin, no proxy, no
// second port. Hand-rolled instead of serveStatic so behaviour is identical
// across platforms and cwd values. Mounted after every /api route; anything
// that isn't a real file falls back to index.html (SPA routing). Web installs
// never set FRONTEND_DIST, so nothing changes for them.
const FRONTEND_DIST = process.env.FRONTEND_DIST;
if (FRONTEND_DIST) {
  const fsStatic = await import('node:fs');
  const pathStatic = await import('node:path');
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
    '.txt': 'text/plain; charset=utf-8',
  };
  const distRoot = pathStatic.resolve(FRONTEND_DIST);
  app.get('*', (c) => {
    const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
    if (urlPath.startsWith('/api/')) return c.json({ error: 'not found' }, 404);
    // Resolve inside the dist root only - reject anything that escapes it.
    const candidate = pathStatic.resolve(pathStatic.join(distRoot, urlPath));
    const inRoot = candidate === distRoot || candidate.startsWith(distRoot + pathStatic.sep);
    let filePath = inRoot ? candidate : null;
    if (!filePath || !fsStatic.existsSync(filePath) || fsStatic.statSync(filePath).isDirectory()) {
      // SPA fallback: /skills, /focus etc. all serve the app shell.
      filePath = pathStatic.join(distRoot, 'index.html');
    }
    if (!fsStatic.existsSync(filePath)) return c.text('frontend build missing', 500);
    const ext = pathStatic.extname(filePath).toLowerCase();
    const isHashedAsset = urlPath.startsWith('/assets/');
    return c.body(fsStatic.readFileSync(filePath), 200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      // Vite fingerprints /assets/* filenames, so they can cache forever.
      // index.html must never cache or an app update would serve a stale shell.
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  });
}

// HOST controls the bind address. The desktop app binds 127.0.0.1 so the
// dashboard is reachable only from this machine. Unset (web installs) keeps
// the historical default.
const HOST = process.env.HOST;

serve({ fetch: app.fetch, port: PORT, ...(HOST ? { hostname: HOST } : {}) }, (info) => {
  console.log(`solo-os-dashboard-server listening on http://localhost:${info.port}`);
  console.log(`  reads/writes vault files directly from VAULT_ROOT`);
  startZoomBackgroundSync();
  // Sweep any leftover .partial-*.mp4 from prior interrupted reel renders.
  void import('./lib/reelRender.js').then(({ cleanupStalePartials }) => cleanupStalePartials());
});

// ─── Zoom background sync ─────────────────────────────────────────────────
// Polls Zoom every 15 minutes while the dashboard server is running. Idempotent
// (skips when no credentials are present) and debounced (won't fire while a
// previous run is still in flight). Logged to the server's stdout.
import { loadConfig as loadZoomConfig, runZoomSync } from './lib/zoom.js';
const ZOOM_SYNC_INTERVAL_MS = 15 * 60 * 1000;
let zoomSyncRunning = false;
async function maybeRunZoomSync(): Promise<void> {
  if (zoomSyncRunning) return;
  if (!loadZoomConfig()) return;
  zoomSyncRunning = true;
  try {
    const result = await runZoomSync();
    if (result.saved.length > 0) {
      console.log(`[zoom-sync] saved ${result.saved.length} new transcript(s)`);
    } else if (result.error) {
      console.error(`[zoom-sync] ${result.error}`);
    }
  } catch (err) {
    console.error('[zoom-sync] crashed:', (err as Error).message);
  } finally {
    zoomSyncRunning = false;
  }
}
function startZoomBackgroundSync(): void {
  // Kick off one sync ~5s after boot so an active connection picks up new
  // recordings without waiting a full 15 minutes.
  setTimeout(maybeRunZoomSync, 5_000);
  setInterval(maybeRunZoomSync, ZOOM_SYNC_INTERVAL_MS);
}
