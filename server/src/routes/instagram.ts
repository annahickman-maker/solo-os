/**
 * Instagram queue - reels-to-film/publish queue stored at
 * 00_System/instagram-queue.json.
 *
 * Each entry comes from the transcripts page (extracted quotes + stories that
 * the creator clicked "queue to instagram" on). Entries can be marked queued / filmed
 * / posted / dismissed.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs, loadFile, saveFile } from '../vault.js';
import { normalizeQuoteTag } from '../lib/extractQuotes.js';
import { loadPosts, syncInstagram } from '../lib/instagramSync.js';
import { loadCreatorContext } from '../lib/creatorContext.js';

const IG_QUEUE = abs('00_System', 'instagram-queue.json');
const STATE_FILE_REL = ['00_System', 'state.md'] as const;
const VOICE_FILE_REL = ['01_Core', 'core_voice-style.md'] as const;
import { BRIDGE_URL } from '../lib/bridge.js';

// Defaults match server/src/routes/settings.ts DEFAULTS.*_cta_*. Kept here so
// this route can run independently of the settings route if state.md is
// unreadable. The real CTA lives in the vault (state.md) / Settings; these are
// neutral placeholders so nothing personal is hardcoded.
const FOCUS_CTA_TEXT_DEFAULT = 'link in bio.';
const FOCUS_CTA_URL_DEFAULT = '';

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
  status: 'idea' | 'queued' | 'editing' | 'ready_to_schedule' | 'scheduled' | 'filmed' | 'posted' | 'dismissed' | 'failed';
  queued_at: number;
  editing_at?: number;
  ready_at?: number;
  scheduled_at?: number;
  filmed_at?: number;
  posted_at?: number;
  dismissed_at?: number;
  // The stage a reel was in when it was archived (status set to 'dismissed'),
  // so "restore" can put it back exactly where it was.
  archived_from?: IgItem['status'];
  failed_at?: number;
  failed_reason?: string;
  posted_url?: string;
  // Manual metrics typed in after posting (or pulled from API in the future).
  view_count?: number;
  share_count?: number;
  comment_count?: number;
  // the creator can drag-reorder; lower order = higher in the queue
  queue_order?: number;
  // Generated Instagram caption (hook + arc + CTA), and 5 hashtags.
  caption?: string;
  caption_hashtags?: string[];
  caption_generated_at?: number;
  // Reel-clipper producer fields:
  //   seed idea  (ready to film) -> original_quote + script (editable)
  //   clip-as-is (ready to edit) -> edit_plan
  original_quote?: string;
  script?: string;
  edit_plan?: string;
  topics?: string[];
  reel_origin?: 'clip' | 'film';
  // Format of the piece: a single reel/video (default) or a multi-slide
  // carousel. Carousels carry carousel_path (the rendered slides.html) instead
  // of video_path.
  format?: 'reel' | 'carousel';
  carousel_path?: string;     // vault-rel path to the carousel's slides.html
  // Auto-post pipeline fields.
  video_path?: string;        // absolute path on disk to the .mp4 dropped by the creator
  thumbnail_path?: string;    // absolute path to a .jpg frame for dashboard preview
  hook_variants?: string[];   // 3 short on-screen text hooks (3-7 words each)
  chosen_hook?: string;       // the one the creator picked - burned into video at post time
  hook_pos_x?: number;        // % of frame width, center coord (default 50)
  hook_pos_y?: number;        // % of frame height, center coord (default 50)
  titled_video_path?: string; // absolute path to the rendered-with-title .mp4
  titled_at?: number;         // unix seconds - when titled video was last rendered
  scheduled_for?: number;     // unix seconds - when the poster cron will publish
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
        try { writeQueue(arr); } catch {}
      }
      return arr as IgItem[];
    }
  } catch {}
  return [];
}

// Atomic write: serialize to a temp file then rename. A crash (or another
// process reading) mid-write can never see a half-written / corrupt queue -
// the rename is atomic on the same filesystem. The pid in the temp name keeps
// concurrent writers (server + archive-posted-reels.py) from sharing a tmp.
function writeQueue(items: IgItem[]): void {
  const tmp = `${IG_QUEUE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
  fs.renameSync(tmp, IG_QUEUE);
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
    status?: IgItem['status'];
    original_quote?: string;
    script?: string;
    edit_plan?: string;
    topics?: string[];
    reel_origin?: 'clip' | 'film';
  } | null;
  const title = body?.title?.trim();
  const text = body?.text?.trim();
  if (!title && !text) return c.json({ error: 'title or text required' }, 400);

  const items = readQueue();
  const now = Math.floor(Date.now() / 1000);
  const id = `ig-idea-${now}-${Math.random().toString(36).slice(2, 8)}`;
  // status drives the lane: 'idea' = raw idea (unscripted), 'queued' = ready to
  // film, 'filmed' = ready to edit.
  const allowedStatus = ['idea', 'queued', 'filmed'] as const;
  const status = body?.status && (allowedStatus as readonly string[]).includes(body.status) ? body.status : 'queued';
  const item: IgItem = {
    id,
    text: text ?? title ?? '',
    title: title ?? undefined,
    tag: body?.tag ? normalizeQuoteTag(String(body.tag), text ?? title ?? '') : 'pov',
    kind: body?.kind ?? 'quote',
    status,
    queued_at: now,
  };
  if (status === 'filmed') item.filmed_at = now;
  if (body?.context) item.context = body.context;
  if (body?.timestamp) item.timestamp = body.timestamp;
  if (body?.source_transcript_id) item.source_transcript_id = body.source_transcript_id;
  if (body?.source_transcript_filename) item.source_transcript_filename = body.source_transcript_filename;
  if (Array.isArray(body?.source_moments)) item.source_moments = body.source_moments;
  if (body?.quote_id) item.quote_id = body.quote_id;
  if (body?.original_quote) item.original_quote = body.original_quote;
  if (body?.script) item.script = body.script;
  if (body?.edit_plan) item.edit_plan = body.edit_plan;
  if (Array.isArray(body?.topics)) item.topics = body.topics;
  if (body?.reel_origin === 'clip' || body?.reel_origin === 'film') item.reel_origin = body.reel_origin;
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
    if (body.status === 'editing' && !it.editing_at) it.editing_at = now;
    if (body.status === 'ready_to_schedule' && !it.ready_at) it.ready_at = now;
    if (body.status === 'scheduled' && !it.scheduled_at) it.scheduled_at = now;
    if (body.status === 'filmed' && !it.filmed_at) it.filmed_at = now;
    // Marking a reel filmed from the queue means it was filmed from a script -
    // tag its origin so ready-to-edit groups it by filmed date, not by the
    // transcript its seed idea originally came from. Also refresh filmed_at so
    // the group is keyed by when it was actually filmed.
    if (body.status === 'filmed' && prev !== 'filmed') {
      it.reel_origin = 'film';
      it.filmed_at = now;
    }
    if (body.status === 'posted' && !it.posted_at) it.posted_at = now;
    if (body.status === 'dismissed' && prev !== 'dismissed') {
      // Archive: remember the stage we came from so restore is exact.
      it.archived_from = prev;
      if (!it.dismissed_at) it.dismissed_at = now;
    }
    if (prev === 'dismissed' && body.status !== 'dismissed') {
      // Restore out of the archive - clear the archive bookkeeping.
      delete it.archived_from;
      delete it.dismissed_at;
    }
    if (body.status === 'failed' && !it.failed_at) it.failed_at = now;
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
  // Target publish date from the "schedule" button on the ready-to-schedule
  // lane (defaults to the next free slot, editable).
  if (typeof body.scheduled_for === 'number' && Number.isFinite(body.scheduled_for)) {
    it.scheduled_for = body.scheduled_for;
  }
  if (typeof body.text === 'string') it.text = body.text;
  if (typeof body.title === 'string') it.title = body.title;
  // Reel-clipper producer fields - editable from the reel panel.
  if (typeof body.script === 'string') it.script = body.script;
  if (typeof body.original_quote === 'string') it.original_quote = body.original_quote;
  if (typeof body.edit_plan === 'string') it.edit_plan = body.edit_plan;
  if (Array.isArray(body.topics)) it.topics = body.topics;
  if (typeof body.posted_url === 'string') it.posted_url = body.posted_url;
  if (typeof body.queue_order === 'number') it.queue_order = body.queue_order;
  if (typeof body.view_count === 'number') it.view_count = Math.max(0, Math.floor(body.view_count));
  if (typeof body.share_count === 'number') it.share_count = Math.max(0, Math.floor(body.share_count));
  if (typeof body.comment_count === 'number') it.comment_count = Math.max(0, Math.floor(body.comment_count));
  if (typeof body.tag === 'string') {
    it.tag = normalizeQuoteTag(body.tag, it.text);
  }
  if (body.format === 'reel' || body.format === 'carousel') it.format = body.format;
  if (typeof body.carousel_path === 'string') it.carousel_path = body.carousel_path;
  if (typeof body.caption === 'string') it.caption = body.caption;
  if (Array.isArray(body.caption_hashtags)) {
    it.caption_hashtags = body.caption_hashtags
      .filter((h: any) => typeof h === 'string')
      .slice(0, 5);
  }
  if (typeof body.chosen_hook === 'string') {
    it.chosen_hook = stripEmDashes(body.chosen_hook).trim();
  }
  if (typeof body.hook_pos_x === 'number' && Number.isFinite(body.hook_pos_x)) {
    it.hook_pos_x = Math.max(5, Math.min(95, body.hook_pos_x));
  }
  if (typeof body.hook_pos_y === 'number' && Number.isFinite(body.hook_pos_y)) {
    it.hook_pos_y = Math.max(5, Math.min(95, body.hook_pos_y));
  }
  writeQueue(items);
  return c.json({ ok: true, item: it });
});

/** DELETE /api/instagram/queue/:id - hard remove (after the creator decides she really doesn't want it) */
app.delete('/queue/:id', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) return c.json({ error: 'not found' }, 404);
  writeQueue(next);
  return c.json({ ok: true });
});

/**
 * GET /api/instagram/output - daily post counts across a 4-month forward
 * window (current month + next 3), grouped by month. Used to render the
 * MonthGrid at the top of the IG page. Forward-looking because the creator pre-marks
 * scheduled reels as posted with future dates, so the calendar needs to show
 * upcoming months to track the queue against the cadence target.
 *
 * Source of truth = the IG queue entries with status === 'posted' and a
 * posted_at timestamp. That field is set when the creator marks a reel posted via
 * the panel (or when the Graph API sync pulls real posts).
 */
app.get('/output', (c) => {
  // Prefer Graph-API-synced posts when available; fall back to queue's posted_at.
  const syncedPosts = loadPosts();
  const useSynced = syncedPosts.length > 0;
  const items = readQueue();
  const now = new Date();
  // Build current month + next 3 months, oldest first. The frontend grid
  // expects newest first and reverses again to display - so we reverse below.
  const months: Array<{ year: number; month: number; label: string; days_in_month: number; days: Array<{ day: number; count: number }> }> = [];
  for (let offset = 0; offset <= 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
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
  // Read target_per_week from state.md. Prefer instagram_target_per_week,
  // fall back to short_form_per_week (set by the Focus Target Editor) so the
  // two fields stay in lock-step from either direction. Default 3/wk.
  let target = 3;
  let targetSet = false; // true only when the creator explicitly stored a target
  try {
    const stateFile = loadFile(abs(STATE_FILE_REL[0], STATE_FILE_REL[1]));
    if (stateFile?.frontmatter) {
      const fm = stateFile.frontmatter as any;
      const igVal = fm.instagram_target_per_week;
      const sfVal = fm.short_form_per_week;
      if (typeof igVal === 'number' && igVal > 0) { target = igVal; targetSet = true; }
      else if (typeof sfVal === 'number' && sfVal > 0) { target = sfVal; targetSet = true; }
    }
  } catch {}

  // Newest first - matches MonthGrid's `months` prop expectation
  return c.json({
    months: months.reverse(),
    target_per_week: target,
    target_set: targetSet,
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
  // Write both fields so the Focus Target Editor (which reads
  // short_form_per_week) and the IG MonthGrid (which reads
  // instagram_target_per_week) always agree.
  const fm = {
    ...((stateFile?.frontmatter as any) ?? {}),
    instagram_target_per_week: n,
    short_form_per_week: n,
    updated: new Date().toISOString(),
  };
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
  return s.replace(/\u2014/g, ' - ').replace(/\u2013/g, '-');
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

function buildCaptionSystem(): string {
  const ctx = loadCreatorContext();
  const selfRef = ctx.name || 'the creator';
  const poss = ctx.possessive;
  const forChannel = ctx.channelHandle ? ` for ${ctx.channelHandle}` : '';
  const audience = ctx.whoTheyHelp ? ` (${ctx.whoTheyHelp})` : '';
  return `You write ultra-minimal Instagram reel captions in ${poss} voice${forChannel}. Think Tom Noske: one sharp sentence that lands, then the CTA. That's it.

NON-NEGOTIABLES:
- NEVER use the em dash character. Use a hyphen with spaces ( - ) instead. Zero exceptions.
- All lowercase prose. No title case sentences.
- No emojis anywhere.
- No guru language. No hype. No "let me tell you a secret." No "here's the truth nobody talks about."
- Sound like ${selfRef}, not like an AI caption generator. Plain, direct, a little dry.
- Do NOT echo the reel's spoken script verbatim. The caption is the small written kicker next to the reel, not a transcript.

CAPTION STRUCTURE (exactly two lines, no labels, no extra prose):
1) ONE sentence. Max ~20 words. Either a contrarian belief flip, a sharp observation, a small honest admission, or the single insight the reel turns on. Concrete. Plain. Not a question unless the question is genuinely surprising.
2) Blank line, then the CTA on its own line. Use the provided CTA text verbatim, exactly as given. Do not paraphrase.

That's the whole caption body. Two lines of prose separated by a blank line. No story arc, no breakdown, no bullets.

Then 5 hashtags, lowercase, no spaces inside each tag, separated by single spaces. Target ${poss} audience${audience}. Pick the 5 lowercase hashtags that fit this specific reel and that audience best.

OUTPUT FORMAT - return a JSON object only, no commentary, no markdown fences:
{
  "caption": "one sentence.\\n\\nthe cta sentence.",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;
}

async function callBridge(system: string, user: string, maxTokens = 1500): Promise<string> {
  // The bridge is a single supervised process; a crash restarts it in ~2s. To
  // ride out that window (and transient network blips) retry on connection
  // failures and 5xx, with backoff. 4xx are caller errors - fail fast.
  const body = JSON.stringify({ type: 'instagramCaption', system, user, maxTokens, expectJson: true });
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.status >= 500) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
      if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`); // 4xx: not retried (rethrown below)
      const data = (await res.json()) as { text?: string; error?: string };
      if (data.error) throw new Error(`claude-bridge: ${data.error}`);
      if (!data.text) throw new Error('claude-bridge: no text in response');
      return data.text;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      const retryable = /ECONNREFUSED|fetch failed|network|claude-bridge 5\d\d/.test(msg);
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, attempt * 1500)); // 1.5s, 3s
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('claude-bridge: failed');
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

/**
 * Generate caption + 5 hashtags for one queue item and persist them. Shared by
 * the POST /caption route and the finish-edit route. Re-reads the queue after
 * the bridge call so a concurrent edit isn't clobbered. Throws on bridge error.
 */
async function genCaptionForId(
  id: string,
): Promise<{ ok: boolean; status: 200 | 404 | 502; error?: string; item?: IgItem }> {
  const items = readQueue();
  const it = items.find((i) => i.id === id);
  if (!it) return { ok: false, status: 404, error: 'not found' };

  const cta = getCtaFromState();
  const voice = getVoiceSummary();
  const tagLabel =
    it.tag === 'pov' ? 'POV'
    : it.tag === 'value' ? 'Value (teaching framework)'
    : it.tag === 'authority' ? 'Proof / authority'
    : 'Connection (personal story)';

  // Prefer the spoken transcript (it.text). Fall back to the written script for
  // the no-folder "edited" path, where no video has been filmed yet so there is
  // no transcript - the caption is generated off the script instead.
  const reelContent = it.text && it.text.trim() ? it.text : it.script ?? it.text ?? '';

  const userPrompt = [
    `# Reel context`,
    `Tag: ${tagLabel}`,
    it.title ? `Working title: ${it.title}` : '',
    it.context ? `\n# Why this moment\n${it.context}` : '',
    `\n# What's said in the reel (do NOT echo this verbatim in the caption)\n${reelContent}`,
    it.source_moments && it.source_moments.length > 0
      ? `\n# Source moments (background; do not quote)\n${it.source_moments
          .map((m) => `- [${m.timestamp}] ${m.text}`)
          .join('\n')}`
      : '',
    `\n# CTA to include verbatim (do not paraphrase)\n${cta.text}`,
    voice ? `\n# Voice (calibrate to this)\n${voice}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await callBridge(buildCaptionSystem(), userPrompt);
  const parsed = parseCaptionJson(raw);
  if (!parsed.caption) return { ok: false, status: 502, error: 'empty caption from model' };
  // Re-read after the await: another writer may have changed the queue while
  // the bridge ran. Merge onto the fresh copy so we don't clobber their edit.
  const fresh = readQueue();
  const fIt = fresh.find((i) => i.id === id);
  if (!fIt) return { ok: false, status: 404, error: 'not found' };
  fIt.caption = parsed.caption;
  fIt.caption_hashtags = parsed.hashtags;
  fIt.caption_generated_at = Math.floor(Date.now() / 1000);
  writeQueue(fresh);
  return { ok: true, status: 200, item: fIt };
}

/** POST /api/instagram/queue/:id/caption - generate caption + 5 hashtags via Claude bridge */
app.post('/queue/:id/caption', async (c) => {
  try {
    const r = await genCaptionForId(c.req.param('id'));
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json({ ok: true, item: r.item });
  } catch (err: any) {
    console.error('caption generation failed:', err);
    return c.json({ error: err?.message ?? 'caption generation failed' }, 500);
  }
});

/**
 * POST /api/instagram/queue/from-video
 * Body: { video_path, thumbnail_path?, transcript?, title? }
 *
 * Called by the watcher when a new .mp4 lands with a filename that does NOT
 * match an existing queue id. Creates a free-form queue item seeded with the
 * (optional) whisper transcript so the caption + hooks generator has source
 * material. Returns the new item's id.
 */
app.post('/queue/from-video', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    video_path?: string;
    thumbnail_path?: string;
    transcript?: string;
    title?: string;
    tag?: string;
  } | null;
  if (!body?.video_path) return c.json({ error: 'video_path required' }, 400);

  const items = readQueue();
  const now = Math.floor(Date.now() / 1000);
  const filename = body.video_path.split('/').pop() ?? 'reel.mp4';
  const cleanTitle = body.title?.trim() || filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  const id = `ig-drop-${now}-${Math.random().toString(36).slice(2, 8)}`;

  const text = (body.transcript ?? '').trim() || cleanTitle;

  const item: IgItem = {
    id,
    text,
    title: cleanTitle,
    tag: normalizeQuoteTag(body.tag ?? 'connection', text),
    kind: 'story',
    status: 'ready_to_schedule',
    queued_at: now,
    ready_at: now,
    video_path: body.video_path,
  };
  if (body.thumbnail_path) item.thumbnail_path = body.thumbnail_path;

  items.push(item);
  writeQueue(items);
  return c.json({ ok: true, item });
});

// ─── Auto-post pipeline ────────────────────────────────────────────────────

/**
 * POST /api/instagram/queue/:id/mark-editing
 *
 * the creator clicks "I'm editing this in Descript". Sets status=editing and returns
 * the filename she should export the finished mp4 as. The watcher picks up
 * any file matching `<id>.mp4` in the dropbox folder.
 */
app.post('/queue/:id/mark-editing', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  it.status = 'editing';
  it.editing_at = Math.floor(Date.now() / 1000);
  writeQueue(items);
  return c.json({
    ok: true,
    expected_filename: `${id}.mp4`,
    dropbox_path: '00_System/instagram-queue/dropbox',
    item: it,
  });
});

/**
 * POST /api/instagram/queue/:id/attach-video
 * Body: { video_path, thumbnail_path }
 *
 * Called by the watcher script after a new .mp4 is detected and a thumbnail
 * has been extracted. Sets status=ready_to_schedule.
 */
app.post('/queue/:id/attach-video', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { video_path?: string; thumbnail_path?: string } | null;
  if (!body?.video_path) return c.json({ error: 'video_path required' }, 400);
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  it.video_path = body.video_path;
  if (body.thumbnail_path) it.thumbnail_path = body.thumbnail_path;
  it.status = 'ready_to_schedule';
  it.ready_at = Math.floor(Date.now() / 1000);
  writeQueue(items);
  return c.json({ ok: true, item: it });
});

// Stream a thumbnail or video file by queue id. Files live outside the
// frontend public folder, so the dashboard needs a route to serve them.
app.get('/queue/:id/thumbnail', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const it = items.find((i) => i.id === id);
  if (!it?.thumbnail_path || !fs.existsSync(it.thumbnail_path)) {
    return c.json({ error: 'no thumbnail' }, 404);
  }
  const buf = fs.readFileSync(it.thumbnail_path);
  return new Response(buf, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } });
});

app.get('/queue/:id/video', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const it = items.find((i) => i.id === id);
  if (!it?.video_path || !fs.existsSync(it.video_path)) {
    return c.json({ error: 'no video' }, 404);
  }
  const buf = fs.readFileSync(it.video_path);
  return new Response(buf, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=60' } });
});

// Stream the title-baked version. Distinct from /video so the dashboard can
// toggle between raw and titled previews. Returns 404 until /render-title has
// been called for this item.
app.get('/queue/:id/titled-video', (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const it = items.find((i) => i.id === id);
  if (!it?.titled_video_path || !fs.existsSync(it.titled_video_path)) {
    return c.json({ error: 'no titled video' }, 404);
  }
  const buf = fs.readFileSync(it.titled_video_path);
  return new Response(buf, {
    headers: {
      'Content-Type': 'video/mp4',
      // No cache - rendered file gets overwritten on each render-title call.
      'Cache-Control': 'no-store',
    },
  });
});

/**
 * POST /api/instagram/queue/:id/render-title
 * Bake item.chosen_hook onto item.video_path at item.hook_pos_x/_y via ffmpeg.
 * Writes to 00_System/instagram-queue/titled/<filename>.mp4 and sets
 * item.titled_video_path so the dashboard can stream it back.
 */
app.post('/queue/:id/render-title', async (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  if (!it.video_path) return c.json({ error: 'no video attached' }, 400);
  const hook = (it.chosen_hook ?? '').trim();
  if (!hook) return c.json({ error: 'no hook text - pick or write a hook first' }, 400);
  const { renderReelWithHook } = await import('../lib/reelRender.js');
  try {
    const { titled_video_path } = await renderReelWithHook({
      inputVideoPath: it.video_path,
      hookText: hook,
      posXPct: typeof it.hook_pos_x === 'number' ? it.hook_pos_x : 50,
      posYPct: typeof it.hook_pos_y === 'number' ? it.hook_pos_y : 50,
    });
    it.titled_video_path = titled_video_path;
    it.titled_at = Math.floor(Date.now() / 1000);
    writeQueue(items);
    return c.json({ ok: true, item: it });
  } catch (err: any) {
    console.error('render-title failed:', err);
    return c.json({ error: err?.message ?? 'render failed' }, 500);
  }
});

// ─── Hook generation (3 on-screen text variants) ──────────────────────────

function buildHookSystem(): string {
  const ctx = loadCreatorContext();
  const selfRef = ctx.name || 'the creator';
  const poss = ctx.possessive;
  const forChannel = ctx.channelHandle ? ` for ${ctx.channelHandle}` : '';
  return `You write on-screen text hooks for Instagram reels in ${poss} voice${forChannel}.

A hook is the text that gets burned into the top of the reel - the first thing a scroller sees in 0.5 seconds. It has to stop the scroll.

NON-NEGOTIABLES:
- 3 to 7 words. No more. No fewer.
- All lowercase. No title case. No exclamation points.
- NEVER use the em dash character. Use a hyphen with spaces ( - ) instead.
- No emojis. No hashtags. No quotes around the hook.
- Sound like ${selfRef} - direct, contrarian, plain. Not guru. Not clickbait. Not "the truth about X".
- Each variant must be a DIFFERENT angle on the same reel. Not three rewordings of the same line.

3 ANGLES TO HIT (one per variant):
1) Contrarian belief flip - "what most people get wrong about X"
2) Surprising result or number - the outcome that makes them want to know how
3) Quiet admission or small confession - something honest the audience nods at

OUTPUT FORMAT - return a JSON object only, no commentary, no markdown fences:
{
  "hooks": ["hook one", "hook two", "hook three"]
}`;
}

function parseHookJson(raw: string): string[] {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse json from hook response');
    parsed = JSON.parse(match[0]);
  }
  const hooks = Array.isArray(parsed.hooks)
    ? parsed.hooks.filter((h: any) => typeof h === 'string' && h.trim()).map((h: string) => stripEmDashes(h.trim().toLowerCase()))
    : [];
  return hooks.slice(0, 3);
}

/**
 * Generate 3 on-screen hook variants for one item and persist them. Shared by
 * the POST /hooks route and the finish-edit route. Throws on bridge error.
 */
async function genHooksForId(
  id: string,
): Promise<{ ok: boolean; status: 200 | 404 | 502; error?: string; hooks?: string[] }> {
  const items = readQueue();
  const it = items.find((i) => i.id === id);
  if (!it) return { ok: false, status: 404, error: 'not found' };

  const voice = getVoiceSummary();
  const tagLabel =
    it.tag === 'pov' ? 'POV'
    : it.tag === 'value' ? 'Value (teaching framework)'
    : it.tag === 'authority' ? 'Proof / authority'
    : 'Connection (personal story)';

  // Same transcript-vs-script fallback as the caption generator.
  const reelContent = it.text && it.text.trim() ? it.text : it.script ?? it.text ?? '';

  const userPrompt = [
    `# Reel context`,
    `Tag: ${tagLabel}`,
    it.title ? `Working title: ${it.title}` : '',
    it.context ? `\n# Why this moment\n${it.context}` : '',
    `\n# What's said in the reel\n${reelContent}`,
    voice ? `\n# Voice (calibrate to this)\n${voice}` : '',
  ].filter(Boolean).join('\n');

  const raw = await callBridge(buildHookSystem(), userPrompt, 500);
  const hooks = parseHookJson(raw);
  if (hooks.length === 0) return { ok: false, status: 502, error: 'no hooks returned' };
  // Re-read after the await so a concurrent edit during the bridge call isn't lost.
  const fresh = readQueue();
  const fIt = fresh.find((i) => i.id === id);
  if (!fIt) return { ok: false, status: 404, error: 'not found' };
  fIt.hook_variants = hooks;
  writeQueue(fresh);
  return { ok: true, status: 200, hooks };
}

/** POST /api/instagram/queue/:id/hooks - generate 3 on-screen hook variants */
app.post('/queue/:id/hooks', async (c) => {
  try {
    const r = await genHooksForId(c.req.param('id'));
    if (!r.ok) return c.json({ error: r.error }, r.status);
    return c.json({ ok: true, hooks: r.hooks });
  } catch (err: any) {
    console.error('hook generation failed:', err);
    return c.json({ error: err?.message ?? 'hook generation failed' }, 500);
  }
});

/**
 * POST /api/instagram/queue/:id/finish-edit
 *
 * The "edited" action for users WITHOUT a Descript->dropbox link. Advances the
 * card straight to ready_to_schedule and generates caption + hooks from the
 * script/text the card already holds - no video required. Folder-linked users
 * never hit this: their watcher attaches the exported file and generates these
 * automatically.
 *
 * Best-effort generation: if the bridge fails, the card still lands in
 * ready_to_schedule and the panel's manual generate buttons remain as backup.
 */
app.post('/queue/:id/finish-edit', async (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  it.status = 'ready_to_schedule';
  if (!it.ready_at) it.ready_at = Math.floor(Date.now() / 1000);
  writeQueue(items);

  let caption_ok = false;
  let hook_count = 0;
  try {
    const r = await genCaptionForId(id);
    caption_ok = r.ok;
  } catch (err) {
    console.error('finish-edit caption failed:', err);
  }
  try {
    const r = await genHooksForId(id);
    hook_count = r.hooks?.length ?? 0;
  } catch (err) {
    console.error('finish-edit hooks failed:', err);
  }

  const fresh = readQueue();
  return c.json({ ok: true, item: fresh.find((i) => i.id === id), caption_ok, hook_count });
});

// ─── Daily scheduling (one post per day) ──────────────────────────────────

const DEFAULT_POST_HOUR_LOCAL = 10; // 10am the creator's local time (America/Toronto)
const DEFAULT_POST_TZ = 'America/Toronto';

/**
 * Returns the next free post slot as a unix-second timestamp.
 * Rule: one post per day at 10am local. If today's slot is in the future and
 * unoccupied, that's the next slot. Otherwise walk forward day by day until a
 * date has no scheduled / posted item on it.
 */
function nextFreeSlot(items: IgItem[]): number {
  const occupied = new Set<string>();
  for (const it of items) {
    const ts = it.scheduled_for ?? it.posted_at;
    if (!ts) continue;
    if (!['scheduled', 'posted'].includes(it.status)) continue;
    const d = new Date(ts * 1000);
    occupied.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  const now = new Date();
  for (let i = 0; i < 60; i++) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, DEFAULT_POST_HOUR_LOCAL, 0, 0, 0);
    const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}`;
    if (occupied.has(key)) continue;
    if (candidate.getTime() < now.getTime() + 10 * 60 * 1000) continue; // need at least 10 min buffer
    return Math.floor(candidate.getTime() / 1000);
  }
  // Fallback: 60 days out
  const fallback = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60, DEFAULT_POST_HOUR_LOCAL, 0, 0, 0);
  return Math.floor(fallback.getTime() / 1000);
}

/** GET /api/instagram/next-free-slot - returns next free 10am slot as unix seconds */
app.get('/next-free-slot', (c) => {
  const items = readQueue();
  const ts = nextFreeSlot(items);
  return c.json({ scheduled_for: ts, post_time_local: `${DEFAULT_POST_HOUR_LOCAL}:00`, tz: DEFAULT_POST_TZ });
});

/**
 * POST /api/instagram/queue/:id/schedule
 * Body: { chosen_hook, caption?, scheduled_for? }
 *
 * the creator's "Approve & schedule" button. Locks in the chosen hook and assigns
 * scheduled_for (auto-picks next free slot if not provided). Sets status=scheduled.
 */
app.post('/queue/:id/schedule', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { chosen_hook?: string; caption?: string; scheduled_for?: number } | null;
  if (!body?.chosen_hook?.trim()) return c.json({ error: 'chosen_hook required' }, 400);
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;
  if (!it.video_path) return c.json({ error: 'no video attached yet' }, 400);
  if (!it.caption && !body.caption) return c.json({ error: 'no caption' }, 400);

  it.chosen_hook = stripEmDashes(body.chosen_hook.trim().toLowerCase());
  if (typeof body.caption === 'string') it.caption = stripEmDashes(body.caption);
  it.scheduled_for = typeof body.scheduled_for === 'number' ? body.scheduled_for : nextFreeSlot(items);
  it.status = 'scheduled';
  it.scheduled_at = Math.floor(Date.now() / 1000);
  writeQueue(items);
  return c.json({ ok: true, item: it });
});

/**
 * GET /api/instagram/due-now
 *
 * Called by the poster cron at 9:55am daily. Returns any 'scheduled' item
 * whose scheduled_for is within the next 60 minutes. The poster then
 * publishes it and PATCHes status=posted with posted_url.
 */
app.get('/due-now', (c) => {
  const items = readQueue();
  const now = Math.floor(Date.now() / 1000);
  const due = items.filter((it) => {
    if (it.status !== 'scheduled') return false;
    if (!it.scheduled_for) return false;
    return it.scheduled_for >= now - 5 * 60 && it.scheduled_for <= now + 60 * 60;
  });
  return c.json({ items: due });
});

// ─── Carousels (rendered slides.html from the carousel skill) ───────────────
// The carousel skill writes slides.html into
// `Channel - Instagram/carousels/<date>-<slug>/`. These endpoints let the
// dashboard list them and render them in an in-app iframe instead of spawning a
// separate browser window.
const CAROUSELS_REL = 'Channel - Instagram/carousels';
const CAROUSELS_DIR = abs('Channel - Instagram', 'carousels');

// APPROVE (authed) - the user approved a rendered carousel in the chat preview.
// Create a `ready_to_schedule` queue item flagged as a carousel, pointing at
// the slides.html. Reads the sibling source-script.md (if any) as caption
// material so the existing caption generator has something to work from.
app.post('/carousels/approve', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { path?: string; title?: string } | null;
  const relPath = (body?.path ?? '').trim();
  if (
    !relPath ||
    relPath.includes('..') ||
    relPath.startsWith('/') ||
    !relPath.startsWith(CAROUSELS_REL + '/') ||
    !relPath.endsWith('slides.html')
  ) {
    return c.json({ error: 'invalid carousel path' }, 400);
  }
  const slidesAbs = abs(...relPath.split('/'));
  if (!fs.existsSync(slidesAbs)) return c.json({ error: 'carousel not found' }, 404);

  // Idempotent: if this carousel is already in the queue, return the existing one.
  const items = readQueue();
  const existing = items.find((i) => i.carousel_path === relPath);
  if (existing) return c.json({ ok: true, item: existing, already: true });

  const slug = relPath.split('/').slice(-2, -1)[0] ?? '';
  const m = slug.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const titleSlug = m ? m[2] : slug;
  const title =
    (body?.title?.trim()) || titleSlug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

  // Caption material: the source script saved next to slides.html.
  let scriptText = '';
  try {
    const srcAbs = path.join(path.dirname(slidesAbs), 'source-script.md');
    if (fs.existsSync(srcAbs)) scriptText = fs.readFileSync(srcAbs, 'utf8');
  } catch {
    /* no source script - caption gen falls back to the title */
  }

  const now = Math.floor(Date.now() / 1000);
  const id = `ig-carousel-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const item: IgItem = {
    id,
    text: scriptText.trim() || title,
    title,
    tag: 'pov',
    kind: 'story',
    status: 'ready_to_schedule',
    format: 'carousel',
    carousel_path: relPath,
    script: scriptText.trim() || undefined,
    queued_at: now,
    ready_at: now,
  };
  items.push(item);
  writeQueue(items);
  return c.json({ ok: true, item });
});

// FILE + ASSET are mounted PUBLICLY in index.ts (above auth) because an iframe
// can't send the dashboard-password header. They do their own ?pw= check / are
// path-locked to the carousels dir. Modeled on the deck serving routes.
export function serveCarouselFile(reqUrl: string): Response {
  const url = new URL(reqUrl);
  const pw = url.searchParams.get('pw') ?? '';
  const expected = process.env.DASHBOARD_PASSWORD ?? 'dev';
  if (pw !== expected) return new Response('unauthorized', { status: 401 });
  const relPath = url.searchParams.get('path') ?? '';
  if (
    relPath.includes('..') ||
    relPath.startsWith('/') ||
    !relPath.startsWith(CAROUSELS_REL + '/') ||
    !relPath.endsWith('.html')
  ) {
    return new Response('not allowed', { status: 403 });
  }
  const full = abs(...relPath.split('/'));
  if (!fs.existsSync(full)) return new Response('not found', { status: 404 });
  let html = fs.readFileSync(full, 'utf8');
  // Inject a <base href> so any relative asset (e.g. before/after photos) in the
  // carousel resolves through the carousel-asset route. CDN scripts + Google
  // fonts are absolute URLs and are unaffected.
  const dir = relPath.split('/').slice(0, -1).join('/');
  const baseHref = '/api/instagram/carousel-asset/' + dir.split('/').map(encodeURIComponent).join('/') + '/';
  html = html.replace(/<head[^>]*>/i, (m) => m + `<base href="${baseHref}" data-role="carousel-base">`);
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function serveCarouselAsset(reqUrl: string): Response {
  const url = new URL(reqUrl);
  const m = url.pathname.match(/^\/api\/instagram\/carousel-asset\/(.+)$/);
  if (!m) return new Response('not found', { status: 404 });
  const relPath = decodeURIComponent(m[1]);
  if (relPath.includes('..') || relPath.startsWith('/') || !relPath.startsWith(CAROUSELS_REL + '/')) {
    return new Response('not allowed', { status: 403 });
  }
  const resolved = path.resolve(abs(...relPath.split('/')));
  if (!resolved.startsWith(path.resolve(CAROUSELS_DIR) + path.sep)) {
    return new Response('not allowed', { status: 403 });
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(resolved);
  } catch {
    return new Response('not found', { status: 404 });
  }
  const ext = path.extname(resolved).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : ext === '.svg' ? 'image/svg+xml'
    : ext === '.mp4' ? 'video/mp4'
    : ext === '.mov' ? 'video/quicktime'
    : ext === '.webm' ? 'video/webm'
    : ext === '.woff2' ? 'font/woff2'
    : ext === '.woff' ? 'font/woff'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : ext === '.js' ? 'application/javascript'
    : 'application/octet-stream';
  return new Response(buf, { status: 200, headers: { 'Content-Type': mime, 'Cache-Control': 'no-cache' } });
}

export default app;
