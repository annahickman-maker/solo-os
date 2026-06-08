/**
 * Phase 2 dashboard server. Reads/writes vault files directly.
 *
 * Listens on :8790 during the transition. Old Wrangler backend keeps running
 * on :8787 for routes that haven't been migrated yet. When all routes are
 * here, frontend flips to :8790 and the old backend (plus D1, plus the sync
 * folder, plus PRESERVE_ON_UPSERT, plus tombstones) gets deleted.
 */

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
import instagram from './routes/instagram.js';
import { proxyToOldBackend } from './proxyOld.js';

const PORT = Number(process.env.PORT ?? 8790);

const app = new Hono();

app.use('*', cors({ origin: '*' }));

app.get('/', (c) => c.json({ ok: true, service: 'anna-dashboard-server (Phase 2)' }));
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

// Catch-all - anything not natively handled falls through to the old Wrangler
// backend on :8787. As routes get migrated they take precedence here.
app.all('/api/*', proxyToOldBackend);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`anna-dashboard-server listening on http://localhost:${info.port}`);
  console.log(`  reads/writes vault files directly`);
  console.log(`  no D1, no sync, no pullback`);
});
