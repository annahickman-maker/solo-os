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
import { abs, loadFile, saveFile } from '../vault.js';
import { normalizeQuoteTag } from '../lib/extractQuotes.js';
import { loadPosts, syncInstagram } from '../lib/instagramSync.js';

const IG_QUEUE = abs('00_System', 'instagram-queue.json');
const STATE_FILE_REL = ['00_System', 'state.md'] as const;
const VOICE_FILE_REL = ['01_Core', 'core_voice-style.md'] as const;
import { BRIDGE_URL } from '../lib/bridge.js';

// Defaults match server/src/routes/settings.ts DEFAULTS.focus_cta_*. Both
// point at the creator's SS Skool. Kept here so this route can run independently of
// the settings route if state.md is unreadable.
const FOCUS_CTA_TEXT_DEFAULT =
  'want my system for building a one-person business that fits your brain? link in bio.';
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
  status: 'queued' | 'editing' | 'ready_to_schedule' | 'scheduled' | 'filmed' | 'posted' | 'dismissed' | 'failed';
  queued_at: number;
  editing_at?: number;
  ready_at?: number;
  scheduled_at?: number;
  filmed_at?: number;
  posted_at?: number;
  dismissed_at?: number;
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
  // Auto-post pipeline fields.
  video_path?: string;        // absolute path on disk to the .mp4 dropped by the creator
  thumbnail_path?: string;    // absolute path to a .jpg frame for dashboard preview
  hook_variants?: string[];   // 3 short on-screen text hooks (3-7 words each)
  chosen_hook?: string;       // the one the creator picked - burned into video at post time
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
    if (body.status === 'editing' && !it.editing_at) it.editing_at = now;
    if (body.status === 'ready_to_schedule' && !it.ready_at) it.ready_at = now;
    if (body.status === 'scheduled' && !it.scheduled_at) it.scheduled_at = now;
    if (body.status === 'filmed' && !it.filmed_at) it.filmed_at = now;
    if (body.status === 'posted' && !it.posted_at) it.posted_at = now;
    if (body.status === 'dismissed' && !it.dismissed_at) it.dismissed_at = now;
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
  if (typeof body.chosen_hook === 'string') {
    it.chosen_hook = stripEmDashes(body.chosen_hook).trim();
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
 * GET /api/instagram/output - daily post counts for the last 4 calendar months,
 * grouped by month. Used to render the MonthGrid at the top of the IG page.
 *
 * Source of truth = the IG queue entries with status === 'posted' and a
 * posted_at timestamp. That field is set when the creator marks a reel posted via
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
  // Read target_per_week from state.md. Prefer instagram_target_per_week,
  // fall back to short_form_per_week (set by the Focus Target Editor) so the
  // two fields stay in lock-step from either direction. Default 3/wk.
  let target = 3;
  try {
    const stateFile = loadFile(abs(STATE_FILE_REL[0], STATE_FILE_REL[1]));
    if (stateFile?.frontmatter) {
      const fm = stateFile.frontmatter as any;
      const igVal = fm.instagram_target_per_week;
      const sfVal = fm.short_form_per_week;
      if (typeof igVal === 'number' && igVal > 0) target = igVal;
      else if (typeof sfVal === 'number' && sfVal > 0) target = sfVal;
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

const CAPTION_SYSTEM = `You write ultra-minimal Instagram reel captions in the creator's voice for the channel. Think Tom Noske: one sharp sentence that lands, then the CTA. That's it.

NON-NEGOTIABLES:
- NEVER use the em dash character. Use a hyphen with spaces ( - ) instead. Zero exceptions.
- All lowercase prose. No title case sentences.
- No emojis anywhere.
- No guru language. No hype. No "let me tell you a secret." No "here's the truth nobody talks about."
- Sound like the creator, not like an AI caption generator. Plain, direct, a little dry.
- Do NOT echo the reel's spoken script verbatim. The caption is the small written kicker next to the reel, not a transcript.

CAPTION STRUCTURE (exactly two lines, no labels, no extra prose):
1) ONE sentence. Max ~20 words. Either a contrarian belief flip, a sharp observation, a small honest admission, or the single insight the reel turns on. Concrete. Plain. Not a question unless the question is genuinely surprising.
2) Blank line, then the CTA on its own line. Use the provided CTA text verbatim, exactly as given. Do not paraphrase.

That's the whole caption body. Two lines of prose separated by a blank line. No story arc, no breakdown, no bullets.

Then 5 hashtags, lowercase, no spaces inside each tag, separated by single spaces. Target the creator's audience: creative freelancers, solopreneurs, web designers, online business owners, content creators. Use specific tags like #solopreneur #onepersonbusiness #creativefreelancer #onlinebusiness #contentstrategy. Pick the 5 that fit this specific reel best.

OUTPUT FORMAT - return a JSON object only, no commentary, no markdown fences:
{
  "caption": "one sentence.\\n\\nthe cta sentence.",
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
    voice ? `\n# the creator's voice (calibrate to this)\n${voice}` : '',
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

// ─── Hook generation (3 on-screen text variants) ──────────────────────────

const HOOK_SYSTEM = `You write on-screen text hooks for Instagram reels in the creator's voice for the channel.

A hook is the text that gets burned into the top of the reel - the first thing a scroller sees in 0.5 seconds. It has to stop the scroll.

NON-NEGOTIABLES:
- 3 to 7 words. No more. No fewer.
- All lowercase. No title case. No exclamation points.
- NEVER use the em dash character. Use a hyphen with spaces ( - ) instead.
- No emojis. No hashtags. No quotes around the hook.
- Sound like the creator - direct, contrarian, plain. Not guru. Not clickbait. Not "the truth about X".
- Each variant must be a DIFFERENT angle on the same reel. Not three rewordings of the same line.

3 ANGLES TO HIT (one per variant):
1) Contrarian belief flip - "what most people get wrong about X"
2) Surprising result or number - the outcome that makes them want to know how
3) Quiet admission or small confession - something honest the audience nods at

OUTPUT FORMAT - return a JSON object only, no commentary, no markdown fences:
{
  "hooks": ["hook one", "hook two", "hook three"]
}`;

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

/** POST /api/instagram/queue/:id/hooks - generate 3 on-screen hook variants */
app.post('/queue/:id/hooks', async (c) => {
  const id = c.req.param('id');
  const items = readQueue();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const it = items[idx]!;

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
    `\n# What's said in the reel\n${it.text}`,
    voice ? `\n# the creator's voice (calibrate to this)\n${voice}` : '',
  ].filter(Boolean).join('\n');

  try {
    const raw = await callBridge(HOOK_SYSTEM, userPrompt, 500);
    const hooks = parseHookJson(raw);
    if (hooks.length === 0) return c.json({ error: 'no hooks returned' }, 502);
    it.hook_variants = hooks;
    writeQueue(items);
    return c.json({ ok: true, hooks });
  } catch (err: any) {
    console.error('hook generation failed:', err);
    return c.json({ error: err?.message ?? 'hook generation failed' }, 500);
  }
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

export default app;
