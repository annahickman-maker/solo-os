/**
 * Onboarding - conversational interview that captures verbatim + tags +
 * Layer 1 section update in ONE Claude call per turn. Block A foundation.
 *
 * The frontend interview UI calls POST /api/onboarding/turn per user answer.
 * The endpoint:
 *   1. Sends the question + answer + running L1 draft to Claude
 *   2. Gets back layer0_verbatim, layer2_chunks, layer1_section_md
 *   3. Writes the verbatim to 05_Assets/Transcripts/onboarding/<session>.md
 *   4. Returns the structured payload to the frontend for review + accept
 *
 * Layer 2 chunk routing (POV files / journey entries / etc.) and Layer 1
 * heading-anchored writeback are not in this endpoint yet - the frontend
 * receives the proposed writes and the user clicks "accept" which calls
 * the existing per-artifact endpoints. That keeps the interview transparent
 * and reviewable, rather than silently mutating the vault.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { YoutubeTranscript } from 'youtube-transcript';
import { abs } from '../vault.js';
import { saveTranscript } from '../lib/transcriptVault.js';
import { extractYouTubeVideoId } from './youtube.js';
import { processOnboardingTurn, writeOnboardingTurnVerbatim, type CorePhase } from '../lib/onboardingTurn.js';

const app = new Hono();

const VALID_PHASES: CorePhase[] = ['positioning', 'audience', 'my-story', 'ip', 'offer-suite', 'voice-style'];

app.post('/turn', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    session_id?: string;
    phase?: string;
    question?: string;
    answer?: string;
    current_layer1_section?: string;
  } | null;

  if (!body?.session_id || typeof body.session_id !== 'string') {
    return c.json({ error: 'session_id required' }, 400);
  }
  if (!body.phase || !VALID_PHASES.includes(body.phase as CorePhase)) {
    return c.json({ error: `phase must be one of ${VALID_PHASES.join(', ')}` }, 400);
  }
  if (!body.question || !body.answer) {
    return c.json({ error: 'question + answer required' }, 400);
  }
  if (body.answer.trim().length < 3) {
    return c.json({ error: 'answer too short' }, 400);
  }

  try {
    const out = await processOnboardingTurn({
      phase: body.phase as CorePhase,
      question: body.question,
      answer: body.answer,
      current_layer1_section: body.current_layer1_section,
    });

    // Layer 0 write: append verbatim to onboarding transcript file
    const verbatimWrite = writeOnboardingTurnVerbatim(
      body.session_id,
      body.phase as CorePhase,
      body.question,
      out.layer0_verbatim,
    );

    return c.json({
      ok: true,
      session_id: body.session_id,
      phase: body.phase,
      verbatim_written_to: verbatimWrite.path,
      layer0_verbatim: out.layer0_verbatim,
      layer2_chunks: out.layer2_chunks,
      layer1_section_md: out.layer1_section_md,
      turn_summary: out.turn_summary,
    });
  } catch (err: any) {
    console.error('onboarding/turn failed:', err);
    return c.json({ error: err?.message ?? 'turn processing failed' }, 500);
  }
});

// ─── Ingest: gather context for Personal Brand Strategy ─────────────────────
// The "bring your context" step in front of onboarding. Pulls material with NO
// auth and NO YouTube API:
//   - video links  -> public caption scrape (youtube-transcript) + oEmbed title
//   - channel link -> public RSS feed -> recent video ids -> caption scrape
//   - website link -> fetch + strip to readable text
// Everything lands in 05_Assets/Transcripts/ as context the onboarding reads.
// Dropped documents use the existing transcript upload, not this endpoint.

const CHANNEL_VIDEO_LIMIT = 5;

type IngestItem = { path: string | null; title: string; kind: 'youtube' | 'website'; ok: boolean; note?: string };

async function scrapeTranscript(videoId: string): Promise<string | null> {
  try {
    const items = await YoutubeTranscript.fetchTranscript(videoId);
    const text = items
      .map((x) => x.text)
      .join(' ')
      .replace(/&amp;#39;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&quot;/g, '"')
      .replace(/&amp;amp;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (res.ok) {
      const j = (await res.json()) as { title?: string };
      if (j.title) return j.title;
    }
  } catch {
    /* fall through */
  }
  return `YouTube video ${videoId}`;
}

async function resolveChannelId(url: string): Promise<string | null> {
  const direct = url.match(/youtube\.com\/channel\/(UC[\w-]{20,})/);
  if (direct) return direct[1]!;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[\w-]{20,})"/) || html.match(/youtube\.com\/channel\/(UC[\w-]{20,})/);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

async function channelRecentVideos(channelId: string): Promise<{ id: string; title: string }[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]!);
    const out: { id: string; title: string }[] = [];
    for (const e of entries) {
      const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1];
      const title = /<title>([^<]*)<\/title>/.exec(e)?.[1];
      if (id) out.push({ id, title: (title || `YouTube video ${id}`).trim() });
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchWebsiteText(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const html = await res.text();
    const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] || url).trim();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 14000);
    return text ? { title, text } : null;
  } catch {
    return null;
  }
}

function saveWebsiteDoc(url: string, title: string, text: string): string {
  const dir = abs('05_Assets', 'Transcripts');
  fs.mkdirSync(dir, { recursive: true });
  const slug =
    (title || 'website')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'website';
  const filename = `web_${slug}.md`;
  const body = `---\ntype: onboarding-context\nsource: website\nsource_url: ${url}\n---\n\n# ${title}\n\nSource: ${url}\n\n${text}\n`;
  fs.writeFileSync(path.join(dir, filename), body);
  return `05_Assets/Transcripts/${filename}`;
}

/**
 * POST /api/onboarding/ingest
 * body: { youtube?: string[]; websites?: string[] }
 * Pulls each source into a context file and returns what landed.
 */
app.post('/ingest', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { youtube?: string[]; websites?: string[] } | null;
  const youtube = (body?.youtube ?? []).map((s) => String(s).trim()).filter(Boolean);
  const websites = (body?.websites ?? []).map((s) => String(s).trim()).filter(Boolean);
  const items: IngestItem[] = [];

  for (const url of youtube) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      const [title, text] = await Promise.all([fetchVideoTitle(videoId), scrapeTranscript(videoId)]);
      if (!text) {
        items.push({ path: null, title, kind: 'youtube', ok: false, note: 'no public captions on this video' });
        continue;
      }
      const { relPath } = saveTranscript({
        videoTitle: title,
        youtubeId: videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        text,
        originalFilename: null,
      });
      items.push({ path: relPath, title, kind: 'youtube', ok: true });
      continue;
    }
    const channelId = await resolveChannelId(url);
    if (!channelId) {
      items.push({ path: null, title: url, kind: 'youtube', ok: false, note: 'could not read this channel - paste specific video links instead' });
      continue;
    }
    const vids = (await channelRecentVideos(channelId)).slice(0, CHANNEL_VIDEO_LIMIT);
    if (vids.length === 0) {
      items.push({ path: null, title: url, kind: 'youtube', ok: false, note: 'no recent videos found on this channel' });
      continue;
    }
    for (const v of vids) {
      const text = await scrapeTranscript(v.id);
      if (!text) {
        items.push({ path: null, title: v.title, kind: 'youtube', ok: false, note: 'no public captions' });
        continue;
      }
      const { relPath } = saveTranscript({
        videoTitle: v.title,
        youtubeId: v.id,
        youtubeUrl: `https://www.youtube.com/watch?v=${v.id}`,
        text,
        originalFilename: null,
      });
      items.push({ path: relPath, title: v.title, kind: 'youtube', ok: true });
    }
  }

  for (const url of websites) {
    const got = await fetchWebsiteText(url);
    if (!got) {
      items.push({ path: null, title: url, kind: 'website', ok: false, note: 'could not read this page' });
      continue;
    }
    const relPath = saveWebsiteDoc(url, got.title, got.text);
    items.push({ path: relPath, title: got.title, kind: 'website', ok: true });
  }

  const saved = items.filter((i) => i.ok && i.path);
  return c.json({ ok: true, items, paths: saved.map((i) => i.path) });
});

export default app;
