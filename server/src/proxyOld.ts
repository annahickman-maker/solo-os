/**
 * Catch-all proxy to the old Wrangler backend on :8787 for routes that
 * haven't been migrated to the new file-based server yet.
 *
 * Why: lets the frontend point its API base at the new server now, even
 * before every route is rebuilt. Each native route we add takes over the
 * matching path automatically (Hono routes match before the catch-all).
 *
 * Once all routes are native, delete this file + the old backend + D1 +
 * the sync folder.
 */

import type { Context } from 'hono';

const OLD_BACKEND_URL = process.env.OLD_BACKEND_URL ?? 'http://localhost:8787';
// Headers that aren't safe to forward verbatim (host, content-length, etc).
const SKIP_REQUEST_HEADERS = new Set(['host', 'content-length', 'connection', 'origin']);
const SKIP_RESPONSE_HEADERS = new Set(['transfer-encoding', 'content-encoding', 'content-length']);

export async function proxyToOldBackend(c: Context): Promise<Response> {
  const url = new URL(c.req.url);
  const upstream = new URL(OLD_BACKEND_URL);
  upstream.pathname = url.pathname;
  upstream.search = url.search;

  const headers = new Headers();
  c.req.raw.headers.forEach((v, k) => {
    if (!SKIP_REQUEST_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  });
  // Old backend may use the dev password from .dev.vars.
  if (!headers.has('x-dashboard-password')) {
    headers.set('x-dashboard-password', 'dev');
  }

  const init: RequestInit = {
    method: c.req.method,
    headers,
  };
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    init.body = await c.req.raw.arrayBuffer();
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream.toString(), init);
  } catch (err: any) {
    console.error(`[proxy] ${c.req.method} ${url.pathname} -> upstream unreachable: ${err?.message}`);
    return c.json(
      {
        error: `Old backend at ${OLD_BACKEND_URL} unreachable. Is wrangler dev running? This route hasn't been migrated to the new server yet.`,
        path: url.pathname,
      },
      502
    );
  }

  const responseHeaders = new Headers();
  upstreamRes.headers.forEach((v, k) => {
    if (!SKIP_RESPONSE_HEADERS.has(k.toLowerCase())) responseHeaders.set(k, v);
  });
  const body = await upstreamRes.arrayBuffer();
  return new Response(body, { status: upstreamRes.status, headers: responseHeaders });
}
