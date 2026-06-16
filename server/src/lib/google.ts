// Google OAuth helpers - local stack edition.
//
// Tokens persist to a single JSON file (00_System/.google-tokens.json,
// gitignored). One Google account per dashboard. The vault is single-user,
// so we don't bother with a multi-account table.
//
// The OAuth /callback can't carry the dashboard password header (Google's
// redirect has no way to set it), so it mounts as a public route. We bind
// the flow to this dashboard by signing the `state` param with
// DASHBOARD_PASSWORD; only someone who knew the password could have started
// the flow, and the signature expires after 10 minutes.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { VAULT_ROOT } from '../vault.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid',
  'email',
];

const TOKENS_PATH = path.join(VAULT_ROOT, '00_System', '.google-tokens.json');
const CONFIG_PATH = path.join(VAULT_ROOT, '00_System', '.google-config.json');

export type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  email: string | null;
  updated_at: number;
};

export type GoogleEnv = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  dashboardPassword: string;
  frontendUrl: string;
};

// Resolves OAuth credentials in this order:
//   1. 00_System/.google-config.json   (BYO - the path SS members use; written
//                                       by the connect-google-calendar skill)
//   2. process.env.GOOGLE_*            (the creator's master vault dev path)
// Returning null means "calendar isn't configured yet" - the UI uses that to
// show the "run this prompt in Claude to connect" panel instead of the
// native connect button.
export function readGoogleEnv(): GoogleEnv | null {
  const fromFile = readConfigFile();
  const clientId = fromFile?.client_id ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = fromFile?.client_secret ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = fromFile?.redirect_uri ?? process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return {
    clientId,
    clientSecret,
    redirectUri,
    dashboardPassword: process.env.DASHBOARD_PASSWORD ?? 'dev',
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  };
}

type GoogleConfigFile = {
  client_id?: string;
  client_secret?: string;
  redirect_uri?: string;
};

function readConfigFile(): GoogleConfigFile | null {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as GoogleConfigFile;
    if (!parsed.client_id || !parsed.client_secret) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Used by the connect-google-calendar skill (and any other automation) to
// write OAuth credentials to the BYO config file. Mode 0600.
export function writeGoogleConfig(cfg: {
  client_id: string;
  client_secret: string;
  redirect_uri?: string;
}): void {
  const out: GoogleConfigFile = {
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    redirect_uri: cfg.redirect_uri ?? 'http://localhost:8790/api/google/callback',
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(out, null, 2), { mode: 0o600 });
}

// "Configured" = credentials exist somewhere (file or env). Distinct from
// "connected" (which means tokens exist after the OAuth grant).
export function isGoogleConfigured(): boolean {
  return readGoogleEnv() !== null;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function hmac(secret: string, payload: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

// State = "<ts>.<sig>" where sig = HMAC-SHA256(password, ts). Valid 10 min.
export function signState(secret: string): string {
  const ts = Date.now().toString();
  return `${ts}.${hmac(secret, ts)}`;
}

export function verifyState(secret: string, state: string): boolean {
  const [ts, sig] = state.split('.');
  if (!ts || !sig) return false;
  if (hmac(secret, ts) !== sig) return false;
  const age = Date.now() - Number(ts);
  return Number.isFinite(age) && age >= 0 && age < 10 * 60 * 1000;
}

export function buildAuthorizeUrl(env: GoogleEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  env: GoogleEnv,
  code: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }>;
}

async function refreshAccessToken(
  env: GoogleEnv,
  refresh_token: string
): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`google token refresh failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function fetchUserEmail(access_token: string): Promise<string | null> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!res.ok) return null;
  const body = (await res.json()) as { email?: string };
  return body.email ?? null;
}

export function loadTokens(): StoredTokens | null {
  try {
    const raw = fs.readFileSync(TOKENS_PATH, 'utf8');
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function writeTokens(t: StoredTokens): void {
  fs.mkdirSync(path.dirname(TOKENS_PATH), { recursive: true });
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2), { mode: 0o600 });
}

export function saveTokens(t: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  email: string | null;
}): void {
  const now = Math.floor(Date.now() / 1000);
  writeTokens({
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    expires_at: now + Math.max(0, t.expires_in - 60), // 1 min safety margin
    scope: t.scope,
    email: t.email,
    updated_at: now,
  });
}

// Returns a valid access token, refreshing on the fly if expired. Returns
// null if not connected, or if the refresh failed (e.g. user revoked access).
export async function getValidAccessToken(env: GoogleEnv): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at > now + 30) return tokens.access_token;

  try {
    const refreshed = await refreshAccessToken(env, tokens.refresh_token);
    writeTokens({
      ...tokens,
      access_token: refreshed.access_token,
      expires_at: now + Math.max(0, refreshed.expires_in - 60),
      updated_at: now,
    });
    return refreshed.access_token;
  } catch (err) {
    console.error('google token refresh failed - clearing tokens so user reconnects:', err);
    disconnect();
    return null;
  }
}

export function disconnect(): void {
  try {
    fs.unlinkSync(TOKENS_PATH);
  } catch {}
}
