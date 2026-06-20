/**
 * Zoom transcript routes.
 *
 *   GET    /api/zoom/status        - connected? last sync? error?
 *   POST   /api/zoom/credentials   - save credentials (and test them)
 *   DELETE /api/zoom/credentials   - disconnect (clears local config + state)
 *   POST   /api/zoom/sync          - run a sync pass now, return saved count
 *   POST   /api/zoom/test          - test credentials without saving
 *
 * Credentials live at ~/.solo-os/zoom-config.json (outside the vault).
 * State (last-processed end_time, last sync result) lives next to it.
 */

import { Hono } from 'hono';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  loadConfig,
  saveConfig,
  clearConfig,
  loadState,
  runZoomSync,
  testCredentials,
  generateTranscriptSummary,
} from '../lib/zoom.js';
import { abs } from '../vault.js';

const app = new Hono();

app.get('/status', (c) => {
  const config = loadConfig();
  const state = loadState();
  return c.json({
    connected: !!config,
    connected_at: config?.connected_at ?? null,
    // We never return secret values - just confirm the field is set.
    account_id_preview: config ? `${config.account_id.slice(0, 4)}…` : null,
    last_sync_at: state.last_sync_at,
    last_sync_count: state.last_sync_count,
    last_sync_error: state.last_sync_error,
    last_processed_end_time: state.last_processed_end_time,
  });
});

app.post('/credentials', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'body must be JSON' }, 400);
  }
  const account_id = typeof body?.account_id === 'string' ? body.account_id.trim() : '';
  const client_id = typeof body?.client_id === 'string' ? body.client_id.trim() : '';
  const client_secret = typeof body?.client_secret === 'string' ? body.client_secret.trim() : '';
  if (!account_id || !client_id || !client_secret) {
    return c.json({ ok: false, error: 'account_id, client_id, client_secret are all required' }, 400);
  }
  // Test before saving so we don't persist garbage credentials.
  const test = await testCredentials({ account_id, client_id, client_secret });
  if (!test.ok) {
    return c.json({ ok: false, error: `Zoom rejected the credentials: ${test.error}` }, 401);
  }
  const saved = saveConfig({ account_id, client_id, client_secret });
  return c.json({ ok: true, connected_at: saved.connected_at });
});

app.delete('/credentials', (c) => {
  clearConfig();
  return c.json({ ok: true });
});

app.post('/sync', async (c) => {
  const result = await runZoomSync();
  return c.json(result, result.ok ? 200 : 500);
});

/**
 * POST /api/zoom/summarize
 * Body: { rel_path: '05_Assets/Transcripts/<category>/<file>.md' }
 *
 * Generate or regenerate a Claude-driven summary of one transcript. Writes
 * the summary as `<file>_summary.md` next to the source. The sync calls this
 * automatically when a new transcript drops; this endpoint lets the user
 * trigger it manually for transcripts that landed before they were connected
 * or for which the sync-time summary call failed.
 */
app.post('/summarize', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'body must be JSON' }, 400);
  }
  const rel = typeof body?.rel_path === 'string' ? body.rel_path : '';
  if (!rel || !rel.endsWith('.md')) {
    return c.json({ ok: false, error: 'rel_path must point at a .md transcript' }, 400);
  }
  // Path safety: must resolve under the vault's 05_Assets/Transcripts/ tree.
  const fullPath = abs(...rel.split('/'));
  const transcriptsRoot = abs('05_Assets', 'Transcripts');
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(transcriptsRoot) + path.sep)) {
    return c.json({ ok: false, error: 'rel_path must be under 05_Assets/Transcripts/' }, 400);
  }
  if (!fs.existsSync(resolved)) {
    return c.json({ ok: false, error: 'transcript file does not exist' }, 404);
  }
  // Allow regeneration by removing any existing summary first.
  const summaryPath = resolved.replace(/\.md$/, '_summary.md');
  if (fs.existsSync(summaryPath)) {
    try {
      fs.unlinkSync(summaryPath);
    } catch {
      // best-effort
    }
  }
  const ok = await generateTranscriptSummary(resolved);
  return c.json({ ok, summary_path: ok ? path.relative(path.resolve(abs('.')), summaryPath) : null });
});

app.post('/test', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'body must be JSON' }, 400);
  }
  const result = await testCredentials({
    account_id: typeof body?.account_id === 'string' ? body.account_id.trim() : '',
    client_id: typeof body?.client_id === 'string' ? body.client_id.trim() : '',
    client_secret: typeof body?.client_secret === 'string' ? body.client_secret.trim() : '',
  });
  return c.json(result, result.ok ? 200 : 401);
});

export default app;
