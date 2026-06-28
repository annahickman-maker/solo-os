/**
 * YouTube sync v2 - writes to vault video files instead of D1.
 *
 * The rule that fixes the creator's pain:
 *   YouTube sync only writes YouTube-derived fields. the creator's edits to title,
 *   archived, queue_order, status, notes, and the body of a video file are
 *   PRESERVED across syncs because we never touch those fields once the
 *   file exists.
 *
 * Matching: each YouTube video is identified by its `youtube_id` in the
 * frontmatter. On sync we look for any file with that id; if found, we patch
 * only the YT-derived fields. Otherwise we create a new file.
 *
 * Files:
 *   - 04_Channel/04_Projects/yt-<videoid>.md (new imports)
 *   - any project_*.md file that has been linked to a YouTube video by
 *     setting `youtube_id: <videoid>` in its frontmatter
 *
 * State:
 *   - 00_System/state.md - aggregate channel stats (subscriber count, etc.)
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { YoutubeTranscript } from 'youtube-transcript';
import { abs, loadFile, saveFile, VAULT_ROOT } from '../vault.js';
import { fetchAllUploads, fetchStatistics, resolveChannel, type Upload } from '../lib/youtube.js';
import { saveTranscript } from '../lib/transcriptVault.js';

const VIDEOS_DIR_REL = path.join('04_Channel', '04_Projects');
const STATE_FILE_REL = path.join('00_System', 'state.md');

const app = new Hono();

// Find a video file by its YouTube ID. Checks both the canonical filename
// and any project_*.md file that has `youtube_id: <id>` in frontmatter.
function findVideoFileByYoutubeId(youtubeId: string): string | null {
  const canonical = abs(VIDEOS_DIR_REL, `yt-${youtubeId}.md`);
  if (fs.existsSync(canonical)) return canonical;

  // Scan project_*.md files
  let entries: string[];
  try {
    entries = fs.readdirSync(abs(VIDEOS_DIR_REL));
  } catch {
    return null;
  }
  for (const filename of entries) {
    if (!filename.endsWith('.md') || filename.startsWith('_') || filename.startsWith('.')) continue;
    const filePath = abs(VIDEOS_DIR_REL, filename);
    const entry = loadFile(filePath);
    if (!entry) continue;
    const fm = entry.frontmatter as Record<string, unknown>;
    if (fm?.youtube_id === youtubeId) return filePath;
    // Also match by youtube_url
    if (typeof fm?.youtube_url === 'string' && fm.youtube_url.includes(youtubeId)) return filePath;
  }
  return null;
}

// Fetch YouTube captions for a video. Returns null if captions are disabled
// or unavailable (some videos have no auto-captions). Uses the
// youtube-transcript package which scrapes public captions (no auth needed).
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    const text = items.map((x) => x.text).join(' ');
    const decoded = text
      .replace(/&amp;#39;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&amp;amp;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return decoded || null;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (/Transcript is disabled|No transcript|unavailable/i.test(msg)) return null;
    return null;
  }
}

// Check if an existing video file already has substantive content (transcript,
// notes, anything past the title heading). Used to skip re-fetching unless
// force=true.
function hasContentBody(filePath: string): boolean {
  const entry = loadFile(filePath);
  if (!entry) return false;
  const body = entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();
  return body.length > 200;
}

async function updateExistingVideoFile(
  filePath: string,
  upload: Upload,
  stats: { views: number; likes: number; comments: number; duration_sec: number } | undefined,
  options: { fetchTranscript: boolean; force: boolean }
): Promise<{ transcriptFetched: boolean }> {
  const entry = loadFile(filePath);
  if (!entry) return { transcriptFetched: false };
  // PRESERVE the creator's manual fields: title, archived, queue_order, status,
  // body, cta, anything else she set. Only update YT-derived stats.
  const next = {
    ...entry.frontmatter,
    youtube_id: upload.videoId,
    youtube_url: `https://www.youtube.com/watch?v=${upload.videoId}`,
    publish_date: new Date(upload.publishedAt * 1000).toISOString().slice(0, 10),
    view_count: stats?.views ?? 0,
    like_count: stats?.likes ?? 0,
    comment_count: stats?.comments ?? 0,
    duration_sec: stats?.duration_sec ?? 0,
    last_yt_sync: new Date().toISOString(),
  };
  // Body: only replace if asked AND (force OR no substantive body yet).
  let body = entry.body;
  let transcriptFetched = false;
  if (options.fetchTranscript && (options.force || !hasContentBody(filePath))) {
    const transcript = await fetchTranscript(upload.videoId);
    if (transcript) {
      const heading = entry.body.match(/^#\s+[^\n]*\n/)?.[0] ?? `# ${upload.title}\n`;
      body = `${heading}\n## Transcript\n\n${transcript}\n${upload.description ? `\n## Description\n\n${upload.description}\n` : ''}`;
      (next as any).has_transcript = true;
      (next as any).transcript_fetched_at = new Date().toISOString();
      transcriptFetched = true;
      // Also mirror to the vault transcript folder and wire the link from
      // the video frontmatter. Don't overwrite an existing manual link
      // unless force=true (the creator may have hand-picked a different file).
      const existingPath = typeof (next as any).transcript_path === 'string'
        ? String((next as any).transcript_path)
        : null;
      if (!existingPath || options.force) {
        try {
          const saved = saveTranscript({
            videoTitle: upload.title,
            youtubeId: upload.videoId,
            youtubeUrl: `https://www.youtube.com/watch?v=${upload.videoId}`,
            text: transcript,
            originalFilename: null,
          });
          (next as any).transcript_path = saved.relPath;
        } catch (err: any) {
          console.error('vault transcript write failed for', upload.videoId, err?.message);
        }
      }
    }
  }
  saveFile(filePath, next as Record<string, unknown>, body);
  return { transcriptFetched };
}

async function createNewVideoFile(
  upload: Upload,
  stats: { views: number; likes: number; comments: number; duration_sec: number } | undefined,
  options: { fetchTranscript: boolean }
): Promise<{ path: string; transcriptFetched: boolean }> {
  const filePath = abs(VIDEOS_DIR_REL, `yt-${upload.videoId}.md`);
  const today = new Date().toISOString().slice(0, 10);
  let transcript: string | null = null;
  if (options.fetchTranscript) {
    transcript = await fetchTranscript(upload.videoId);
  }
  // When we got a transcript, also persist it to the vault and link from
  // the video frontmatter so the description generator and the creator's pickers
  // both see it without any extra step.
  let transcriptPath: string | null = null;
  if (transcript) {
    try {
      const saved = saveTranscript({
        videoTitle: upload.title,
        youtubeId: upload.videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${upload.videoId}`,
        text: transcript,
        originalFilename: null,
      });
      transcriptPath = saved.relPath;
    } catch (err: any) {
      console.error('vault transcript write failed for', upload.videoId, err?.message);
    }
  }
  const frontmatter: Record<string, unknown> = {
    id: `yt-${upload.videoId}`,
    type: 'video',
    title: upload.title,
    status: 'published',
    youtube_id: upload.videoId,
    youtube_url: `https://www.youtube.com/watch?v=${upload.videoId}`,
    publish_date: new Date(upload.publishedAt * 1000).toISOString().slice(0, 10),
    view_count: stats?.views ?? 0,
    like_count: stats?.likes ?? 0,
    comment_count: stats?.comments ?? 0,
    duration_sec: stats?.duration_sec ?? 0,
    has_transcript: !!transcript,
    transcript_path: transcriptPath ?? undefined,
    last_yt_sync: new Date().toISOString(),
    transcript_fetched_at: transcript ? new Date().toISOString() : undefined,
    created: today,
    updated: today,
  };
  const body = `# ${upload.title}\n\n${transcript ? `## Transcript\n\n${transcript}\n\n` : ''}${
    upload.description ? `## Description\n\n${upload.description}\n` : ''
  }`;
  saveFile(filePath, frontmatter, body);
  return { path: filePath, transcriptFetched: !!transcript };
}

function writeStateFile(updates: Record<string, unknown>): void {
  const filePath = abs(STATE_FILE_REL);
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}), ...updates, updated: new Date().toISOString() };
  const body =
    existing?.body ??
    `# Dashboard State\n\nAggregate metrics for the dashboard. Auto-updated by syncs; safe to edit by hand.\n`;
  saveFile(filePath, fm as Record<string, unknown>, body);
}

const DEFAULT_HANDLE = 'the channel';

app.post('/sync', async (c) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: 'YOUTUBE_API_KEY not configured. Set it in dashboard/server/.env or pass via env var.' },
      400
    );
  }
  const handle = process.env.YOUTUBE_CHANNEL_HANDLE ?? DEFAULT_HANDLE;
  // Query params:
  //   transcripts=0   -> skip the transcript fetch step (metadata-only sync)
  //   force=1         -> re-fetch transcripts even on videos that already have one
  const fetchTranscripts = c.req.query('transcripts') !== '0';
  const force = c.req.query('force') === '1';
  try {
    const channel = await resolveChannel(apiKey, handle);
    const uploads = await fetchAllUploads(apiKey, channel.uploadsPlaylistId);
    const stats = await fetchStatistics(apiKey, uploads.map((u) => u.videoId));

    let inserted = 0;
    let updated = 0;
    let preserved = 0;
    let transcriptsFetched = 0;
    const samples: Array<{ videoId: string; action: 'inserted' | 'updated'; file: string; transcript: boolean }> = [];

    for (const u of uploads) {
      const existingPath = findVideoFileByYoutubeId(u.videoId);
      if (existingPath) {
        const r = await updateExistingVideoFile(existingPath, u, stats.get(u.videoId), {
          fetchTranscript: fetchTranscripts,
          force,
        });
        updated++;
        if (r.transcriptFetched) transcriptsFetched++;
        const entry = loadFile(existingPath);
        if (entry && (entry.frontmatter as any)?.title !== u.title) preserved++;
        if (samples.length < 5) {
          samples.push({
            videoId: u.videoId,
            action: 'updated',
            file: existingPath.replace(VAULT_ROOT + '/', ''),
            transcript: r.transcriptFetched,
          });
        }
      } else {
        const r = await createNewVideoFile(u, stats.get(u.videoId), { fetchTranscript: fetchTranscripts });
        inserted++;
        if (r.transcriptFetched) transcriptsFetched++;
        if (samples.length < 5) {
          samples.push({
            videoId: u.videoId,
            action: 'inserted',
            file: r.path.replace(VAULT_ROOT + '/', ''),
            transcript: r.transcriptFetched,
          });
        }
      }
    }

    writeStateFile({
      yt_subs: channel.subscriberCount,
      yt_total_views: channel.totalViews,
      yt_last_sync: new Date().toISOString(),
      yt_channel_handle: handle,
    });

    return c.json({
      ok: true,
      total: uploads.length,
      inserted,
      updated,
      titles_preserved: preserved,
      transcripts_fetched: transcriptsFetched,
      handle,
      sample: samples,
    });
  } catch (err: any) {
    console.error('youtube sync failed:', err);
    return c.json({ error: err?.message ?? 'youtube sync failed' }, 500);
  }
});

// Extract a YouTube video ID from any common URL form. Handles:
//   https://www.youtube.com/watch?v=ABC123          (standard)
//   https://youtu.be/ABC123                          (short link)
//   https://www.youtube.com/shorts/ABC123            (shorts)
//   https://www.youtube.com/live/ABC123              (live)
//   https://www.youtube.com/embed/ABC123             (embed)
// Returns null when nothing matches.
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  // Match the 11-char video ID in the most common URL shapes.
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/, // watch?v=
    /youtu\.be\/([A-Za-z0-9_-]{11})/, // youtu.be/
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/, // shorts/
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/, // live/
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/, // embed/
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1]!;
  }
  // Bare 11-char ID also accepted (in case the user just pastes the ID).
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

// GET /api/youtube/video-stats?url=<url>
//
// Looks up a single YouTube video by URL (or bare 11-char ID) and
// returns lifetime stats from YouTube Data API v3. Used by the offer
// page's Conversions panel to auto-fill VSL and per-video view counts.
// Lifetime, not rolling - matches what the creator asked for.
app.get('/video-stats', async (c) => {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'YOUTUBE_API_KEY not configured in dashboard/server/.env' }, 400);
  }
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url query param required' }, 400);
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return c.json({ error: `could not extract a YouTube video ID from "${url}". expected a watch?v=, youtu.be/, /shorts/, or /live/ URL.` }, 400);
  }
  try {
    const stats = await fetchStatistics(apiKey, [videoId]);
    const s = stats.get(videoId);
    if (!s) {
      return c.json({ error: 'video not found (private, deleted, or wrong region?)' }, 404);
    }
    return c.json({
      ok: true,
      video_id: videoId,
      views: s.views,
      likes: s.likes,
      comments: s.comments,
      duration_sec: s.duration_sec,
    });
  } catch (err: any) {
    return c.json({ error: err?.message ?? 'youtube api error' }, 502);
  }
});

// ─── Studio analytics CSV import ────────────────────────────────────────
//
// CTR and impressions are exclusive to YouTube Studio - no YouTube API exposes
// them. So the creator exports Studio -> Analytics -> Content -> "Table data.csv"
// (columns: Content[=video id], Video title, ..., Views, Subscribers,
// Impressions, Impressions click-through rate (%)) and drops it here. We match
// each row to a video file by its youtube_id and fill the per-video method
// metrics the analytics skill reads:
//   - view_count   = Views
//   - ctr_pct      = Impressions click-through rate (%)   (Studio-only metric)
//   - sub_rate_pct = Subscribers / Views * 100
//   - impressions / subscribers_gained kept as supporting context
// Conversion is NOT here - it comes from the dashboard's own /go/ link tracking.
// Everything else in each file (title, status, body, etc.) is preserved.

// Minimal RFC-4180-ish CSV parser: handles quoted fields with embedded commas,
// quotes, and newlines (video titles contain commas).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

app.post('/import-analytics-csv', async (c) => {
  let body: { csv?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'JSON body with a "csv" field is required' }, 400);
  }
  const csv = (body.csv ?? '').trim();
  if (!csv) return c.json({ error: 'csv field is empty' }, 400);

  const rows = parseCsv(csv);
  if (rows.length < 2) return c.json({ error: 'no data rows found in the CSV' }, 400);

  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf('content');
  const titleIdx = header.indexOf('video title');
  const viewsIdx = header.indexOf('views');
  const subsIdx = header.indexOf('subscribers');
  const imprIdx = header.indexOf('impressions');
  const ctrIdx = header.findIndex((h) => h.startsWith('impressions click-through rate'));
  if (idIdx < 0 || ctrIdx < 0) {
    return c.json(
      { error: 'this does not look like a YouTube Studio "Table data" export - expected "Content" and "Impressions click-through rate (%)" columns' },
      400,
    );
  }

  const num = (s: string | undefined): number | null => {
    const n = parseFloat((s ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  let dataRows = 0;
  let matched = 0;
  let updated = 0;
  const unmatched: Array<{ id: string; title: string }> = [];
  const sample: Array<{ id: string; views: number | null; ctr_pct: number | null; sub_rate_pct: number | null }> = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const id = (cells[idIdx] ?? '').trim();
    // Skip the "Total" summary row and anything that isn't an 11-char video id.
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    dataRows++;

    const views = num(cells[viewsIdx]);
    const subs = subsIdx >= 0 ? num(cells[subsIdx]) : null;
    const impressions = imprIdx >= 0 ? num(cells[imprIdx]) : null;
    const ctr = num(cells[ctrIdx]);

    const filePath = findVideoFileByYoutubeId(id);
    if (!filePath) {
      unmatched.push({ id, title: ((cells[titleIdx] ?? '') as string).slice(0, 70) });
      continue;
    }
    matched++;
    const entry = loadFile(filePath);
    if (!entry) continue;

    const next: Record<string, unknown> = { ...entry.frontmatter };
    if (views != null) next.view_count = Math.round(views);
    if (ctr != null) next.ctr_pct = ctr;
    if (subs != null) next.subscribers_gained = Math.round(subs);
    if (impressions != null) next.impressions = Math.round(impressions);
    if (views != null && views > 0 && subs != null) {
      next.sub_rate_pct = Math.round((subs / views) * 10000) / 100;
    }
    next.analytics_imported_at = new Date().toISOString();
    saveFile(filePath, next, entry.body);
    updated++;
    if (sample.length < 5) {
      sample.push({ id, views: (next.view_count as number) ?? null, ctr_pct: (next.ctr_pct as number) ?? null, sub_rate_pct: (next.sub_rate_pct as number) ?? null });
    }
  }

  return c.json({
    ok: true,
    data_rows: dataRows,
    matched,
    updated,
    unmatched_count: unmatched.length,
    unmatched: unmatched.slice(0, 25),
    sample,
  });
});

// GET /api/youtube/status - return latest sync state from state.md
// Also reports whether the API key is configured (env var present) so the
// Settings "Connect your apps" card can show "live" vs "needs setup".
app.get('/status', (c) => {
  const configured = !!(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_API_KEY.trim());
  const entry = loadFile(abs(STATE_FILE_REL));
  if (!entry) {
    return c.json({ ok: true, configured, last_sync: null, yt_subs: null });
  }
  const fm = entry.frontmatter as Record<string, unknown>;
  return c.json({
    ok: true,
    configured,
    last_sync: (fm.yt_last_sync as string) ?? null,
    yt_subs: (fm.yt_subs as number) ?? null,
    yt_total_views: (fm.yt_total_views as number) ?? null,
    yt_channel_handle: (fm.yt_channel_handle as string) ?? null,
  });
});

export default app;
