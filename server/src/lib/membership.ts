/**
 * SS membership-key gate for Solo OS updates.
 *
 * The dashboard talks to the membership-key worker on annahickman.com to
 * validate a key the member pastes in. Once validated, we cache a tiny
 * token at ~/.solo-os/membership.json so we don't hit the network on
 * every launch. The token re-checks on every Update click and once per
 * 30 days otherwise.
 *
 * If the user's key has been rotated out (left SS, didn't refresh in time),
 * the dashboard keeps running but the Update button refuses to pull.
 *
 * The endpoint is fixed because this template ships from Anna's SS
 * membership worker - members aren't running their own verify server.
 * It can still be overridden for local testing via the MEMBERSHIP_VERIFY_URL
 * env var, but the default is the real production endpoint.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const VERIFY_URL = process.env.MEMBERSHIP_VERIFY_URL || 'https://annahickman.com/verify-key';
const TOKEN_FILE = path.join(os.homedir(), '.solo-os', 'membership.json');
const RECHECK_AFTER_SECONDS = 30 * 24 * 60 * 60; // 30 days. Token TTL from the worker is 32 days so a same-key re-check refreshes before expiry.
// Hard ceiling on the verify-key network call. Without it a hung connection
// (captive wifi, DNS black hole, server stall) would leave the UI stuck on
// "checking key" forever. On timeout the fetch aborts and the caller's
// existing catch handles it: verifyKey reports a clear error, silentRecheck
// falls back to the cached state so an offline user is never locked out.
const VERIFY_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface MembershipToken {
  key: string;
  valid_until: number; // unix seconds; from the worker
  last_checked: number; // unix seconds; client clock
  last_response_was_previous: boolean; // if true, the user's key was matched against `previous`, signaling impending rotation
}

export type MembershipState =
  | { state: 'unverified'; reason: string }
  | { state: 'valid'; token: MembershipToken; needs_recheck: boolean; rotation_warning: boolean }
  | { state: 'expired'; token: MembershipToken; reason: string }
  | { state: 'rejected'; reason: string };

function readToken(): MembershipToken | null {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.key === 'string' &&
      typeof parsed?.valid_until === 'number' &&
      typeof parsed?.last_checked === 'number'
    ) {
      return {
        key: parsed.key,
        valid_until: parsed.valid_until,
        last_checked: parsed.last_checked,
        last_response_was_previous: !!parsed.last_response_was_previous,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeToken(token: MembershipToken): void {
  fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2) + '\n', 'utf8');
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function getCurrentState(): MembershipState {
  const token = readToken();
  if (!token) {
    return { state: 'unverified', reason: 'no SS key entered yet' };
  }
  const now = nowSec();
  if (now > token.valid_until) {
    return {
      state: 'expired',
      token,
      reason: 'cached SS token has expired; re-enter your current key to refresh',
    };
  }
  const needs_recheck = now - token.last_checked > RECHECK_AFTER_SECONDS;
  return {
    state: 'valid',
    token,
    needs_recheck,
    rotation_warning: token.last_response_was_previous,
  };
}

/**
 * POST the given key to the worker. On a valid response, persist the
 * token. Returns the new state regardless of outcome.
 */
export async function verifyKey(rawKey: string): Promise<MembershipState> {
  const key = rawKey.trim();
  if (!key) return { state: 'rejected', reason: 'enter your SS key first' };

  let payload: any;
  try {
    const res = await fetchWithTimeout(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    payload = await res.json();
  } catch (err) {
    return {
      state: 'rejected',
      reason: `could not reach the verification server: ${(err as Error).message}. check your internet connection.`,
    };
  }

  if (!payload?.valid) {
    return {
      state: 'rejected',
      reason: typeof payload?.reason === 'string' ? payload.reason : 'key not recognized',
    };
  }

  const token: MembershipToken = {
    key,
    valid_until: Number(payload.valid_until) || nowSec() + RECHECK_AFTER_SECONDS,
    last_checked: nowSec(),
    last_response_was_previous: payload.matched === 'previous',
  };
  writeToken(token);
  return {
    state: 'valid',
    token,
    needs_recheck: false,
    rotation_warning: token.last_response_was_previous,
  };
}

/**
 * Best-effort silent re-check. Hits the worker with the cached key. If
 * the network is down or the worker rejects, returns the previous state
 * unchanged so an offline user isn't suddenly locked out of the cached
 * token. Only a HARD rejection (key no longer valid) overwrites.
 */
export async function silentRecheck(): Promise<MembershipState> {
  const token = readToken();
  if (!token) return getCurrentState();
  try {
    const res = await fetchWithTimeout(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: token.key }),
    });
    const payload: any = await res.json();
    if (payload?.valid) {
      const updated: MembershipToken = {
        key: token.key,
        valid_until: Number(payload.valid_until) || token.valid_until,
        last_checked: nowSec(),
        last_response_was_previous: payload.matched === 'previous',
      };
      writeToken(updated);
      return {
        state: 'valid',
        token: updated,
        needs_recheck: false,
        rotation_warning: updated.last_response_was_previous,
      };
    }
    // Hard rejection - the cached key is no longer valid at all.
    return {
      state: 'expired',
      token,
      reason: typeof payload?.reason === 'string' ? payload.reason : 'SS key is no longer valid',
    };
  } catch {
    // Network failure - keep the cached token, return whatever the current
    // local state says. Don't lock the user out for being offline.
    return getCurrentState();
  }
}

export function clearToken(): void {
  try {
    fs.unlinkSync(TOKEN_FILE);
  } catch {
    // already gone
  }
}
