/**
 * Membership-key routes for the Solo OS dashboard.
 *
 * GET  /api/membership/status    - current cached state
 * POST /api/membership/verify    - submit a key, persist token if valid
 * POST /api/membership/recheck   - silent recheck using the cached key
 * POST /api/membership/clear     - drop the local token (debug / sign-out)
 */

import { Hono } from 'hono';
import {
  getCurrentState,
  verifyKey,
  silentRecheck,
  clearToken,
} from '../lib/membership.js';

const app = new Hono();

app.get('/status', (c) => c.json(getCurrentState()));

app.post('/verify', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ state: 'rejected', reason: 'body must be JSON' }, 400);
  }
  const result = await verifyKey(typeof body?.key === 'string' ? body.key : '');
  const ok = result.state === 'valid';
  return c.json(result, ok ? 200 : 401);
});

app.post('/recheck', async (c) => {
  const result = await silentRecheck();
  return c.json(result);
});

app.post('/clear', (c) => {
  clearToken();
  return c.json({ state: 'unverified', reason: 'local token cleared' });
});

export default app;
