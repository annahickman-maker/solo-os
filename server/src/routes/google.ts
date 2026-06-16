// Google OAuth routes. Three live under /api/google (auth-protected):
//   GET  /connect-url   -> returns the consent URL for the frontend to redirect to
//   GET  /status        -> { connected, email }
//   POST /disconnect    -> drop saved tokens
//
// The /callback handler is the redirect URI Google calls AFTER consent. It
// mounts at a separate path that bypasses the dashboard password middleware
// (Google can't send custom headers). The state param is signed with
// DASHBOARD_PASSWORD so only flows initiated from this dashboard succeed.

import { Hono } from 'hono';
import {
  buildAuthorizeUrl,
  disconnect,
  exchangeCodeForTokens,
  fetchUserEmail,
  isGoogleConfigured,
  loadTokens,
  readGoogleEnv,
  saveTokens,
  signState,
  verifyState,
} from '../lib/google.js';

const app = new Hono();

app.get('/connect-url', (c) => {
  const env = readGoogleEnv();
  if (!env) {
    return c.json(
      { error: 'google oauth not configured - check GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI in server/.env' },
      500
    );
  }
  const state = signState(env.dashboardPassword);
  return c.json({ url: buildAuthorizeUrl(env, state) });
});

// configured = OAuth client ID + secret exist somewhere (BYO config file or
// env). connected = the user has gone through the OAuth grant and we have
// refresh tokens. UI uses configured to decide between the "run this prompt
// in Claude" panel vs the native connect button.
app.get('/status', (c) => {
  const t = loadTokens();
  return c.json({
    configured: isGoogleConfigured(),
    connected: !!t,
    email: t?.email ?? null,
  });
});

app.post('/disconnect', (c) => {
  disconnect();
  return c.json({ ok: true });
});

export default app;

// Separate Hono app for the OAuth redirect. Mounted directly at
// /api/google/callback BEFORE the auth middleware in index.ts.
export const callbackApp = new Hono();

callbackApp.get('/', async (c) => {
  const env = readGoogleEnv();
  if (!env) return c.text('google oauth not configured on this server', 500);

  const code = c.req.query('code');
  const state = c.req.query('state');
  const errParam = c.req.query('error');
  const frontend = env.frontendUrl;

  if (errParam) return c.redirect(`${frontend}/?google=denied`);
  if (!code || !state) return c.redirect(`${frontend}/?google=error`);
  if (!verifyState(env.dashboardPassword, state)) return c.redirect(`${frontend}/?google=bad_state`);

  try {
    const tokens = await exchangeCodeForTokens(env, code);
    const email = await fetchUserEmail(tokens.access_token);
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope,
      email,
    });
    return c.redirect(`${frontend}/?google=connected`);
  } catch (err) {
    console.error('google callback error:', err);
    return c.redirect(`${frontend}/?google=failed`);
  }
});
