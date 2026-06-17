// Solo OS tracking worker
//
// Handles two routes:
//   GET /go/<slug>     302-redirects to the destination from the manifest,
//                      logs the click to the LINK_CLICKS KV namespace
//   GET /link-stats?slug=<slug>&days=<N>
//                      returns the click count for that slug over the last N days
//                      (default 30). The dashboard calls this to fill in
//                      per-offer conversion data.
//
// The manifest is bundled at deploy time from scripts/link_manifest.json
// via the `npm run sync-links` step (see package.json).

import { LINKS, LinkEntry } from './link-manifest';

export interface Env {
  LINK_CLICKS: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ─── /go/<slug> ───────────────────────────────────────────────────────
    if (url.pathname.startsWith('/go/')) {
      const slug = url.pathname.slice('/go/'.length);
      const entry: LinkEntry | undefined = LINKS[slug];

      if (!entry) {
        return new Response(`Unknown tracking slug: ${slug}`, { status: 404 });
      }

      // Fire-and-forget click logging so the redirect is fast.
      ctx.waitUntil(logClick(env.LINK_CLICKS, slug));

      return Response.redirect(entry.destination, 302);
    }

    // ─── /link-stats ──────────────────────────────────────────────────────
    if (url.pathname === '/link-stats') {
      const slug = url.searchParams.get('slug');
      const days = parseInt(url.searchParams.get('days') || '30', 10);

      if (!slug) {
        return jsonResponse({ error: 'slug query param required' }, 400);
      }
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return jsonResponse({ error: 'days must be 1-365' }, 400);
      }

      const count = await countClicks(env.LINK_CLICKS, slug, days);
      return jsonResponse({ slug, days, clicks: count });
    }

    return new Response('Solo OS tracking worker', { status: 200 });
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────

async function logClick(kv: KVNamespace, slug: string): Promise<void> {
  // Key shape: clicks:<slug>:<YYYY-MM-DD>:<random>
  // Random suffix prevents two clicks in the same millisecond from clobbering.
  const day = new Date().toISOString().slice(0, 10);
  const rand = Math.random().toString(36).slice(2, 10);
  const key = `clicks:${slug}:${day}:${rand}`;
  // 90-day TTL keeps storage bounded. /link-stats only queries the last 365
  // days by spec but 90 days is plenty for the dashboard's 30-day window.
  await kv.put(key, '1', { expirationTtl: 60 * 60 * 24 * 90 });
}

async function countClicks(kv: KVNamespace, slug: string, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
  let count = 0;
  let cursor: string | undefined;
  do {
    const list = await kv.list({ prefix: `clicks:${slug}:`, cursor });
    for (const key of list.keys) {
      // Key format: clicks:<slug>:<YYYY-MM-DD>:<random>
      const dateStr = key.name.split(':')[2];
      if (dateStr && dateStr >= cutoff) count++;
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return count;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}
