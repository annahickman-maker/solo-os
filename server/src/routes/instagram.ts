/**
 * Instagram queue - reels-to-film/publish queue stored at
 * 00_System/instagram-queue.json.
 *
 * Each entry comes from the transcripts page (extracted quotes + stories that
 * Anna clicked "queue to instagram" on). Entries can be marked queued / filmed
 * / posted / dismissed.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import { abs, loadFile, saveFile } from '../vault.js';
import { normalizeQuoteTag } from '../lib/extractQuotes.js';
import { loadPosts, syncInstagram } from '../lib/instagramSync.js';

const IG_QUEUE = abs('00_System', 'instagram-queue.json');
const STATE_FILE_REL = ['00_System', 'state.md'] as const;
const VOICE_FILE_REL = ['01_Core', 'core_voice-style.md'] as const;
const BRIDGE_URL = 'http://localhost:8789/run';

// Defaults match server/src/routes/settings.ts DEFAULTS.focus_cta_*. Both
// point at Anna's SS Skool. Kept here so this route can run independently of
// the settings route if state.md is unreadable.
const FOCUS_CTA_TEXT_DEFAULT =
  'want my system for building a one-person business that fits your brain? link in bio.';
const FOCUS_CTA_URL_DEFAULT = 'https://www.skool.com/mastermind-5724/about';

type IgItem = {
  id: string;
  quote_id?: string;
  text: string;
  tag: string;
  context?: string;
  timestamp?: string;
  source_transcript_id?: string;
  source_transcript_filename?: string;
  source_moments?: Array<{ text: string; timestamp: string }>;
  kind?: 'story' | 'quote';
  title?: string;
  status: 'queued' | 'filmed' | 'posted' | 'dismissed';
  queued_at: number;
  filmed_at?: number;
  posted_at?: number;
  dismissed_at?: number;
  posted_url?: string;
  // Manual metrics typed in after posting (or pulled from API in the future).
  view_count?: number;
  share_count?: number;
  comment_count?: number;
  // Anna can drag-reorder; lower order = higher in the queue
  queue_order?: number;
  // Generated Instagram caption (hook + arc + CTA), and 5 hashtags.
  caption?: string;
  caption_hashtags?: string[];
  caption_generated_at?: number;
};

function readQueue(): IgItem[] {
  try {
    const raw = fs.readFileSync(IG_QUEUE, 'utf8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      let mutated = false;
      for (const it of arr as IgItem[]) {
        const normalized = normalizeQuoteTag(String(it.tag ?? ''), it.text);
        if (it.tag !== normalized) {
          it.tag = normalized;
          mutated = true;
        }
      }
      if (mutated) {
        try { fs.writeFileSync(IG_QUEUE, JSON.stringify(arr, null, 2)); } catch {}
      }
      return arr as IgItem[];
    }
  } catch {}
  return [];
}

function writeQueue(items: IgItem[]): void {
  fs.writeFileSync(IG_QUEUE, JSON.stringify(items, null, 2));
}

const app = new Hono();

/** POST /api/instagram/queue - create a new reel idea (from scratch or copied from a bank item) */
app.post('/queue', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    title?: string;
    text?: string;
    tag?: string;
    context?: string;
    timestamp?: string;
    source_transcript_id?: string;
    source_transcript_filename?: string;
    source_moments?: Array<{ text: string; timestamp: string }>;
    kind?: 'story' | 'quote';
    quote_id?: string;
  } | null;
  const title = body?.title?.trim();
  const text = body?.text?.trim();
  if (!title && !text) return c.json({ error: 'title or text required' }, 400);

  const items = readQueue();
  const now = Math.floor(Date.now() / 1000);
  const id = `ig-idea-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const item: IgItem = {
    id,
    text: text ?? title ?? '',
    title: title ?? undefined,
    tag: body?.tag ? normalizeQuoteTag(String(body.tag), text ?? title ?? '') : 'pov',
    kind: body?.kind ?? 'quote',
    status: 'queued',
    queued_at: now,
  };
  if (body?.context) item.context = body.context;
  if (body?.timestamp) item.timestamp = body.timestamp;
  if (body?.source_transcript_id) item.source_transcript_id = body.source_transcript_id;
  if (body?.source_transcript_filename) item.source_transcript_filename = body.source_transcript_filename;
  if (Array.isArray(body?.source_moments)) item.source_moments = body.source_moments;
  if (body?.quote_id) item.quote_id = body.quote_id;
  items.push(item);
  writeQueue(items);
  return c.json({ ok: true, item });
});

/** GET /api/instagram/queue - list all reels in the queue */
app.get('/queue', (c) => {
  const items = readQueue();
  // Newest queued first by default; "posted" and "dismissed" stay where they are
  // but UI groups them separately. queue_order overrides if set.
  items.sort((a, b) => {
    if (a.queue_order != null && b.queue_order != null) return a.queue_order - b.queue_order;
    if (a.queue_order != null) return -1;
    if (b.queue_order != null) return 1;
    return (b.queued_at ?? 0) - (a.queued_at ?? 0);
  });
  const counts = {
    queued: items.filter((i) => i.status === 'queued').length,
    filmed: items.filter((i) => i.status === 'filmed').length,
    posted: items.filter((i) => i.status === 'posted').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
  };
  return c.json({ items, counts });
});

/** PATCH /api/instagram/queue/:id - update status / order / posted url / text */
app.patch('/queue/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Partial<IgItem> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  const now = Math.floor(Date.now() / 1000);
  if (typeof body.status === 'string') {
    const prev = it.status;
    it.status = body.status;
    if (body.status === 'filmed' && !it.filmed_at) it.filmed_at = now;
    if (body.status === 'posted' && !it.posted_at) it.posted_at = now;
    if (body.status === 'dismissed' && !it.dismissed_at) it.dismissed_at = now;
    // Reverting away from posted: clear posted_at so the content output grid
    // doesn't double-count and so the next "mark posted" uses a fresh date.
    if (prev === 'posted' && body.status !== 'posted') {
      delete it.posted_at;
    }
    if (prev === 'filmed' && body.status === 'queued') {
      delete it.filmed_at;
    }
  }
  // Explicit posted_at override (used by the backdate date picker on the UI).
  if (typeof body.posted_at === 'number' && Number.isFinite(body.posted_at)) {
    it.posted_at = body.posted_at;
  }
  if (typeof body.text === 'string') it.text = body.text;
  if (typeof body.title === 'string') it.title = body.title;
  if (typeof body.posted_url === 'string') it.posted_url = body.posted_url;
  if (typeof body.queue_order === 'number') it.queue_order = body.queue_order;
  if (typeof body.view_count === 'number') it.view_count = Math.max(0, Math.floor(body.view_count));
  if (typeof body.share_count === 'number') it.share_count = Math.max(0, Math.floor(body.share_count));
  if (typeof body.comment_count === 'number') it.comment_count = Math.max(0, Math.floor(body.comment_count));
  if (typeof body.tag === 'string') {
    it.tag = normalizeQuoteTag(body.tag, it.text);
  }
  if (typeof body.caption === 'string') it.caption = body.caption;
  if (Array.isArray(body.caption_hashtags)) {
    it.caption_hashtags = body.caption_hashtags
      .filter((h: any) => typeof h === 'string')
      .slice(0, 5);
  }
  writeQueue(items);
  return c.json({ ok: true, item: it });
});

/** DELETE /api/instagram/queue/:id - hard remove (after Anna decides she really doesn't want it) */
app.delete('/queue/:id', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return c.json({ error: 'not found' }, 404);
  writeQueue(next);
  return c.json({ ok: true });
});

/**
 * GET /api/instagram/output - daily post counts for the last 4 calendar months,
 * grouped by month. Used to render the MonthGrid at the top of the IG page.
 *
 * Source of truth = the IG queue entries with status === 'posted' and a
 * posted_at timestamp. That field is set when Anna marks a reel posted via
 * the panel.
 */
app.get('/output', (c) => {
  // Prefer Graph-API-synced posts when available; fall back to queue's posted_at.
  const syncedPosts = loadPosts();
  const useSynced = syncedPosts.length > 0;
  const items = readQueue();
  const now = new Date();
  // Build last 4 months including current, oldest first then we'll reverse in UI.
  const months: Array<{ year: number; month: number; label: string; days_in_month: number; days: Array<{ day: number; count: number }> }> = [];
  for (let offset = 3; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-12
    const daysInMonth = new Date(year, month, 0).getDate();
    const label = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
    const dayCounts = new Map<number, number>();

    if (useSynced) {
      for (const post of syncedPosts) {
        const ts = new Date(post.posted_at * 1000);
        if (ts.getFullYear() !== year || ts.getMonth() + 1 !== month) continue;
        const day = ts.getDate();
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    } else {
      for (const it of items) {
        if (it.status !== 'posted' || !it.posted_at) continue;
        const ts = new Date(it.posted_at * 1000);
        if (ts.getFullYear() !== year || ts.getMonth() + 1 !== month) continue;
        const day = ts.getDate();
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
    }
    months.push({
      year,
      month,
      label,
      days_in_month: daysInMonth,
      days: [...dayCounts.entries()].sort((a, b) => a[0] - b[0]).map(([day, count]) => ({ day, count })),
    });
  }
  // Read target_per_week from state.md (default 3/wk for IG)
  let target = 3;
  try {
    const stateFile = loadFile(abs(STATE_FILE_REL[0], STATE_FILE_REL[1]));
    if (stateFile?.frontmatter) {
      const v = (stateFile.frontmatter as any).instagram_target_per_week;
      if (typeof v === 'number' && v > 0) target = v;
    }
  } catch {}

  // Newest first - matches MonthGrid's `months` prop expectation
  return c.json({
    months: months.reverse(),
    target_per_week: target,
    source: useSynced ? 'instagram_graph_api' : 'manual_posted_status',
    synced_post_count: syncedPosts.length,
  });
});

/** POST /api/instagram/sync - pull recent media from Graph API */
app.post('/sync', async (c) => {
  const result = await syncInstagram();
  return c.json(result, result.ok ? 200 : 400);
});

/** GET /api/instagram/sync/status - last sync info + whether the integration is configured */
app.get('/sync/status', (c) => {
  const configured = !!(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const posts = loadPosts();
  const latest = posts.length > 0 ? Math.max(...posts.map((p) => p.posted_at)) : null;
  return c.json({
    configured,
    post_count: posts.length,
    latest_post_at: latest,
    handle: process.env.INSTAGRAM_HANDLE ?? null,
  });
});

/**
 * PATCH /api/instagram/output/target - body: { target_per_week: number }
 * Writes target_per_week into 00_System/state.md frontmatter.
 */
app.patch('/output/target', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { target_per_week?: number } | null;
  const n = body?.target_per_week;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
    return c.json({ error: 'target_per_week must be a positive number' }, 400);
  }
  const filePath = abs(STATE_FILE_REL[0], STATE_FILE_REL[1]);
  const stateFile = loadFile(filePath);
  const fm = { ...((stateFile?.frontmatter as any) ?? {}), instagram_target_per_week: n, updated: new Date().toISOString() };
  saveFile(filePath, fm as Record<string, unknown>, stateFile?.body ?? '# Dashboard State\n');
  return c.json({ ok: true });
});

/** GET /api/instagram/account - return the linked Instagram handle */
app.get('/account', (c) => {
  const handle = process.env.INSTAGRAM_HANDLE ?? null;
  return c.json({
    handle,
    profile_url: handle ? `https://www.instagram.com/${handle.replace(/^@/, '')}` : null,
  });
});

/** POST /api/instagram/queue/reorder - body: { order: string[] } - bulk reorder */
app.post('/queue/reorder', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { order?: string[] } | null;
  const order = body?.order ?? [];
  if (!Array.isArray(order)) return c.json({ error: 'order required' }, 400);
  const items = readQueue();
  const orderMap = new Map(order.map((id, i) => [id, i]));
  for (const it of items) {
    const i = orderMap.get(it.id);
    it.queue_order = i != null ? i : undefined;
  }
  writeQueue(items);
  return c.json({ ok: true });
});

// ─── Caption generation ────────────────────────────────────────────────────

function stripEmDashes(s: string): string {
  return s.replace(/—/g, ' - ').replace(/–/g, '-');
}

function getCtaFromState(): { text: string; url: string } {
  // Instagram caption generator uses the IG-specific CTA. Falls back through
  // the legacy shared keys for old vaults.
  try {
    const entry = loadFile(abs(...STATE_FILE_REL));
    const fm = (entry?.frontmatter as Record<string, unknown>) ?? {};
    return {
      text:
        (fm.instagram_cta_text as string | undefined) ??
        (fm.focus_cta_text as string | undefined) ??
        (fm.ig_cta_text as string | undefined) ??
        FOCUS_CTA_TEXT_DEFAULT,
      url:
        (fm.instagram_cta_url as string | undefined) ??
        (fm.focus_cta_url as string | undefined) ??
        (fm.ig_cta_url as string | undefined) ??
        FOCUS_CTA_URL_DEFAULT,
    };
  } catch {
    return { text: FOCUS_CTA_TEXT_DEFAULT, url: FOCUS_CTA_URL_DEFAULT };
  }
}

function getVoiceSummary(): string {
  // Pull a compact slice of the voice guide. Full file is long; we send the
  // first ~3000 chars (intro + opening patterns + sentence rhythm) so the
  // model has enough calibration without bloating the prompt.
  try {
    const entry = loadFile(abs(...VOICE_FILE_REL));
    const body = entry?.body ?? '';
    return body.slice(0, 3000);
  } catch {
    return '';
  }
}

const CAPTION_SYSTEM = `You write Instagram reel captions in Anna Hickman's voice for @theannahickman.

NON-NEGOTIABLES:
- NEVER use the em dash character (—). Use a hyphen with spaces ( - ) instead. Zero exceptions.
- All lowercase prose. No title case sentences.
- No emojis anywhere.
- No guru language. No hype. No "let me tell you a secret." No "here's the truth nobody talks about."
- Sound like Anna, not like an AI caption generator. Short to medium sentences. Fragments are fine when they land.
- The caption MUST be 100% generated, never echo the reel's spoken script verbatim. Instagram captions are written copy, not transcript dumps.

CAPTION STRUCTURE (in this order, no labels in the output):
1) HOOK (1-2 short sentences). Concrete and specific. Either a number/result, a contrarian belief flip, or a small admission of struggle. Makes the reader want to expand "more".
2) STORY ARC + VALUE (3-6 short sentences). The arc: what she used to believe / try / experience, what shifted, what she does now. Bake in one piece of usable value the reader can actually apply.
3) CTA (1 sentence). Use the provided CTA text verbatim, exactly as given. Do not paraphrase.
4) Blank line, then a single line with exactly 5 hashtags, lowercase, no spaces inside each tag, separated by single spaces. Target Anna's audience: creative freelancers, solopreneurs, web designers, online business owners, content creators. Use specific tags like #solopreneur #onepersonbusiness #creativefreelancer #onlinebusiness #contentstrategy. Pick the 5 that fit this specific reel best.

OUTPUT FORMAT — return a JSON object only, no commentary, no markdown fences:
{
  "caption": "the full caption body, including hook + story arc + CTA, joined with blank lines between sections",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

async function callBridge(system: string, user: string, maxTokens = 1500): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'instagramCaption',
      system,
      user,
      maxTokens,
      expectJson: true,
    }),
  });
  if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(`claude-bridge: ${data.error}`);
  if (!data.text) throw new Error('claude-bridge: no text in response');
  return data.text;
}

function parseCaptionJson(raw: string): { caption: string; hashtags: string[] } {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from response');
    parsed = JSON.parse(match[0]);
  }
  const caption = stripEmDashes(String(parsed.caption ?? '').trim());
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags
        .filter((h: any) => typeof h === 'string' && h.trim())
        .map((h: string) => {
          const t = h.trim().toLowerCase().replace(/\s+/g, '');
          return t.startsWith('#') ? t : `#${t}`;
        })
        .slice(0, 5)
    : [];
  return { caption, hashtags };
}

/** POST /api/instagram/queue/:id/caption - generate caption + 5 hashtags via Claude bridge */
app.post('/queue/:id/caption', async (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;

  const cta = getCtaFromState();
  const voice = getVoiceSummary();
  const tagLabel =
    it.tag === 'pov' ? 'POV'
    : it.tag === 'value' ? 'Value (teaching framework)'
    : it.tag === 'authority' ? 'Proof / authority'
    : 'Connection (personal story)';

  const userPrompt = [
    `# Reel context`,
    `Tag: ${tagLabel}`,
    it.title ? `Working title: ${it.title}` : '',
    it.context ? `\n# Why this moment\n${it.context}` : '',
    `\n# What's said in the reel (do NOT echo this verbatim in the caption)\n${it.text}`,
    it.source_moments && it.source_moments.length > 0
      ? `\n# Source moments (background; do not quote)\n${it.source_moments
          .map((m) => `- [${m.timestamp}] ${m.text}`)
          .join('\n')}`
      : '',
    `\n# CTA to include verbatim (do not paraphrase)\n${cta.text}`,
    voice ? `\n# Anna's voice (calibrate to this)\n${voice}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await callBridge(CAPTION_SYSTEM, userPrompt);
    const parsed = parseCaptionJson(raw);
    if (!parsed.caption) return c.json({ error: 'empty caption from model' }, 502);
    it.caption = parsed.caption;
    it.caption_hashtags = parsed.hashtags;
    it.caption_generated_at = Math.floor(Date.now() / 1000);
    writeQueue(items);
    return c.json({ ok: true, item: it });
  } catch (err: any) {
    console.error('caption generation failed:', err);
    return c.json({ error: err?.message ?? 'caption generation failed' }, 500);
  }
});

export default app;
