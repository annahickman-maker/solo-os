/**
 * Instagram Graph API sync.
 *
 * Pulls the creator's published media from the Graph API and stores them in
 * 00_System/instagram-posts.json. This becomes the source of truth for the
 * MonthGrid and for matching queued reels to their published versions.
 *
 * Requires three env vars to be set:
 *   INSTAGRAM_ACCESS_TOKEN       - long-lived token (60-day expiry)
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID - the creator's IG Business Account ID (a numeric id)
 *   INSTAGRAM_HANDLE             - display only (e.g. the channel)
 *
 * Without these, the sync is a no-op and the dashboard falls back to the
 * existing posted_at field on queue items.
 */

import fs from 'node:fs';
import { personalize } from './creatorContext.js';
import { abs } from '../vault.js';

const POSTS_FILE = abs('00_System', 'instagram-posts.json');
const GRAPH_VERSION = 'v18.0';

export type InstagramPost = {
  id: string; // IG media id
  caption: string;
  permalink: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL' | string;
  media_product_type?: 'FEED' | 'REELS' | 'STORY';
  thumbnail_url?: string;
  timestamp: string; // ISO from Graph API
  posted_at: number; // unix seconds (derived from timestamp)
};

export type InstagramSyncResult = {
  ok: boolean;
  synced: number;
  new: number;
  error?: string;
  last_synced_at: number;
};

function readPosts(): InstagramPost[] {
  try {
    const raw = fs.readFileSync(POSTS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr as InstagramPost[];
  } catch {}
  return [];
}

function writePosts(posts: InstagramPost[]): void {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

/**
 * Pull recent media via Graph API. Pagination iterates until we have at least
 * `lookbackDays` worth of posts (or no more pages).
 */
async function fetchMediaFromGraph(args: {
  accessToken: string;
  businessAccountId: string;
  lookbackDays: number;
}): Promise<InstagramPost[]> {
  const cutoffMs = Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000;
  const fields = 'id,caption,permalink,media_type,media_product_type,thumbnail_url,timestamp';
  let url: string | null =
    `https://graph.facebook.com/${GRAPH_VERSION}/${args.businessAccountId}/media` +
    `?fields=${fields}&limit=50&access_token=${args.accessToken}`;
  const out: InstagramPost[] = [];

  while (url) {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Graph API ${res.status}: ${txt.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        caption?: string;
        permalink?: string;
        media_type?: string;
        media_product_type?: string;
        thumbnail_url?: string;
        timestamp?: string;
      }>;
      paging?: { next?: string };
    };
    for (const m of data.data ?? []) {
      if (!m.id || !m.timestamp) continue;
      const tsMs = Date.parse(m.timestamp);
      if (Number.isNaN(tsMs)) continue;
      if (tsMs < cutoffMs) {
        // Reached past the lookback window - stop pagination.
        return out;
      }
      out.push({
        id: m.id,
        caption: m.caption ?? '',
        permalink: m.permalink ?? '',
        media_type: (m.media_type ?? 'IMAGE') as InstagramPost['media_type'],
        media_product_type: m.media_product_type as InstagramPost['media_product_type'],
        thumbnail_url: m.thumbnail_url,
        timestamp: m.timestamp,
        posted_at: Math.floor(tsMs / 1000),
      });
    }
    url = data.paging?.next ?? null;
  }

  return out;
}

export async function syncInstagram(options?: { lookbackDays?: number }): Promise<InstagramSyncResult> {
  const lookback = options?.lookbackDays ?? 130; // ~4 months
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const bizId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const last_synced_at = Math.floor(Date.now() / 1000);

  if (!token || !bizId) {
    return {
      ok: false,
      synced: 0,
      new: 0,
      error: 'INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID env vars not set. See server/.env',
      last_synced_at,
    };
  }

  try {
    const fetched = await fetchMediaFromGraph({
      accessToken: token,
      businessAccountId: bizId,
      lookbackDays: lookback,
    });
    const existing = readPosts();
    const byId = new Map(existing.map((p) => [p.id, p]));
    let added = 0;
    for (const post of fetched) {
      if (!byId.has(post.id)) added += 1;
      byId.set(post.id, post); // overwrite to pick up edited captions / new fields
    }
    // Sort newest first.
    const merged = [...byId.values()].sort((a, b) => b.posted_at - a.posted_at);
    writePosts(merged);
    return { ok: true, synced: fetched.length, new: added, last_synced_at };
  } catch (err: any) {
    return {
      ok: false,
      synced: 0,
      new: 0,
      error: err?.message ?? 'sync failed',
      last_synced_at,
    };
  }
}

/**
 * Reads all posts (from the synced cache), optionally filtered to a window.
 */
export function loadPosts(): InstagramPost[] {
  return readPosts();
}
