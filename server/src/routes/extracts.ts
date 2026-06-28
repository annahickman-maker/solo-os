/**
 * Extracts - per-transcript verbatim quote extraction + tagging + routing.
 *
 * Storage:
 *   00_System/extracted-quotes.json    - scratchpad (all quotes, status flagged)
 *   00_System/instagram-queue.json     - reels-to-film queue (approved + queued)
 *   00_System/teaching-frameworks.json - approved teaching-framework quotes
 *   00_System/proof-points.json        - approved proof quotes
 *   00_System/micro-stories.json       - approved connection quotes (appended to existing)
 *   05_Assets/POVs/asset_pov-<slug>.md - approved pov quotes (one file per quote)
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from '../vault.js';
import { combineQuotesIntoStory, extractQuotesFromTranscript, readBank, writeBank, type QuoteTag, type ExtractedQuote } from '../lib/extractQuotes.js';

const QUOTES_BANK = abs('00_System', 'extracted-quotes.json');
const IG_QUEUE = abs('00_System', 'instagram-queue.json');
const FRAMEWORKS_BANK = abs('00_System', 'teaching-frameworks.json');
const PROOF_BANK = abs('00_System', 'proof-points.json');
const MICRO_STORIES = abs('00_System', 'micro-stories.json');
const POVS_DIR = abs('05_Assets', 'POVs');

const VALID_TAGS: ReadonlySet<QuoteTag> = new Set([
  'pov',
  'value',
  'authority',
  'connection',
]);

const app = new Hono();

// ─── helpers ──────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function loadTranscriptContent(transcriptId: string): {
  filename: string;
  content: string;
} | null {
  // Replicate archive.ts logic - look across the 4 dirs + raw subfolders.
  const dirs = [
    path.join('05_Assets', 'Transcripts', 'QA-Calls'),
    path.join('05_Assets', 'Transcripts', 'Live-Workshops'),
    path.join('05_Assets', 'Transcripts', 'YouTube-Videos'),
    path.join('05_Assets', 'Transcripts', 'Client-Calls'),
  ];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(abs(dir));
    } catch {
      continue;
    }
    for (const filename of entries) {
      const idCandidate = `transcript-${filename.replace(/\.(md|txt)$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (idCandidate === transcriptId) {
        // Prefer raw transcript if available
        const rawDir = abs(dir, 'raw');
        if (fs.existsSync(rawDir)) {
          const stem = filename.replace(/\.(md|txt)$/, '');
          const candidates = [
            `${stem}_raw.md`,
            `${stem.replace(/^qa_/, 'qa-raw_')}.md`,
            `${stem}-raw.md`,
          ];
          for (const c of candidates) {
            const full = path.join(rawDir, c);
            if (fs.existsSync(full)) {
              return { filename: c, content: fs.readFileSync(full, 'utf8') };
            }
          }
          // last-resort: any raw file with same date string
          const dateMatch = stem.match(/\d{4}-\d{2}-\d{2}/);
          if (dateMatch) {
            try {
              const rawEntries = fs.readdirSync(rawDir);
              const match = rawEntries.find((e) => e.includes(dateMatch[0]));
              if (match) return { filename: match, content: fs.readFileSync(path.join(rawDir, match), 'utf8') };
            } catch {}
          }
        }
        // fall back to summary file
        return { filename, content: fs.readFileSync(abs(dir, filename), 'utf8') };
      }
    }
  }
  // Also check 04_Channel video files (yt-* style ids)
  if (transcriptId.startsWith('yt-')) {
    try {
      const videoFiles = fs.readdirSync(abs('04_Channel', '04_Projects'));
      for (const filename of videoFiles) {
        if (!filename.endsWith('.md')) continue;
        const idCandidate = `yt-${filename.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
        if (idCandidate === transcriptId) {
          const raw = fs.readFileSync(abs('04_Channel', '04_Projects', filename), 'utf8');
          const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
          const transcriptMatch = body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
          const content = transcriptMatch ? transcriptMatch[1]!.trim() : body.trim();
          return { filename, content };
        }
      }
    } catch {}
  }
  return null;
}

// ─── routes ───────────────────────────────────────────────────────────────

/** GET /api/extracts/:transcriptId - list extracted quotes for one transcript */
app.get('/:transcriptId', (c) => {
  const transcriptId = c.req.param('transcriptId');
  const bank = readBank(QUOTES_BANK);
  const quotes = bank.quotes.filter((q) => q.source_transcript_id === transcriptId);
  return c.json({ quotes });
});

// Run content-quote extraction for a transcript and merge into the bank.
// Exported so it can fire automatically on upload, not just from the button.
export async function runContentExtraction(transcriptId: string): Promise<ExtractedQuote[]> {
  const loaded = loadTranscriptContent(transcriptId);
  if (!loaded) throw new Error('transcript not found');
  const fresh = await extractQuotesFromTranscript({
    transcriptId,
    transcriptFilename: loaded.filename,
    transcriptText: loaded.content,
  });
  // Merge with bank: keep existing approved/queued/dismissed quotes, replace pending.
  const bank = readBank(QUOTES_BANK);
  const others = bank.quotes.filter(
    (q) => !(q.source_transcript_id === transcriptId && q.status === 'pending')
  );
  bank.quotes = [...others, ...fresh];
  writeBank(QUOTES_BANK, bank);
  return fresh;
}

/** POST /api/extracts/:transcriptId/run - kick off extraction */
app.post('/:transcriptId/run', async (c) => {
  const transcriptId = c.req.param('transcriptId');
  try {
    const fresh = await runContentExtraction(transcriptId);
    return c.json({ quotes: fresh, total: fresh.length });
  } catch (err: any) {
    if (err?.message === 'transcript not found') return c.json({ error: 'transcript not found' }, 404);
    console.error('extract failed:', err);
    return c.json({ error: err?.message ?? 'extract failed' }, 500);
  }
});

/** POST /api/extracts/:transcriptId/combine - combine selected quote ids into a new story */
app.post('/:transcriptId/combine', async (c) => {
  const transcriptId = c.req.param('transcriptId');
  const body = (await c.req.json().catch(() => null)) as { quote_ids?: string[] } | null;
  const ids = body?.quote_ids ?? [];
  if (ids.length < 2) return c.json({ error: 'pick at least 2 quotes to combine' }, 400);

  const bank = readBank(QUOTES_BANK);
  const selected = ids
    .map((id) => bank.quotes.find((q) => q.id === id && q.source_transcript_id === transcriptId))
    .filter((q): q is ExtractedQuote => !!q);

  if (selected.length < 2) return c.json({ error: 'fewer than 2 valid quotes found' }, 400);

  const filename = selected[0]!.source_transcript_filename;
  try {
    const combined = await combineQuotesIntoStory({
      transcriptId,
      transcriptFilename: filename,
      quotes: selected,
    });
    bank.quotes.push(combined);
    writeBank(QUOTES_BANK, bank);
    return c.json({ story: combined });
  } catch (err: any) {
    console.error('combine failed:', err);
    return c.json({ error: err?.message ?? 'combine failed' }, 500);
  }
});

/** PATCH /api/extracts/:transcriptId/:quoteId - edit text or tag */
app.patch('/:transcriptId/:quoteId', async (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const body = (await c.req.json().catch(() => null)) as Partial<Pick<ExtractedQuote, 'text' | 'tag' | 'context' | 'title' | 'topics'>> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  if (body.tag !== undefined && !VALID_TAGS.has(body.tag as QuoteTag)) {
    return c.json({ error: 'invalid tag' }, 400);
  }
  const bank = readBank(QUOTES_BANK);
  const idx = bank.quotes.findIndex(
    (q) => q.id === quoteId && q.source_transcript_id === transcriptId
  );
  if (idx === -1) return c.json({ error: 'quote not found' }, 404);
  const q = bank.quotes[idx]!;
  if (body.text !== undefined) q.text = body.text;
  if (body.tag !== undefined) q.tag = body.tag as QuoteTag;
  if (body.context !== undefined) q.context = body.context;
  if (body.title !== undefined) q.title = body.title;
  if (body.topics !== undefined) {
    // Trim + dedupe
    q.topics = Array.from(new Set(body.topics.map((t) => t.trim()).filter(Boolean)));
  }
  q.updated_at = Math.floor(Date.now() / 1000);
  writeBank(QUOTES_BANK, bank);
  return c.json({ quote: q });
});

/** DELETE /api/extracts/:transcriptId/:quoteId - dismiss */
app.delete('/:transcriptId/:quoteId', (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const bank = readBank(QUOTES_BANK);
  const idx = bank.quotes.findIndex(
    (q) => q.id === quoteId && q.source_transcript_id === transcriptId
  );
  if (idx === -1) return c.json({ error: 'quote not found' }, 404);
  bank.quotes[idx]!.status = 'dismissed';
  bank.quotes[idx]!.updated_at = Math.floor(Date.now() / 1000);
  writeBank(QUOTES_BANK, bank);
  return c.json({ ok: true });
});

/** POST /api/extracts/:transcriptId/:quoteId/approve - save to the right bank */
app.post('/:transcriptId/:quoteId/approve', (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const bank = readBank(QUOTES_BANK);
  const q = bank.quotes.find(
    (x) => x.id === quoteId && x.source_transcript_id === transcriptId
  );
  if (!q) return c.json({ error: 'quote not found' }, 404);
  if (q.approved_at) return c.json({ error: 'already approved' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const route = routeApprovedQuote(q);
  q.approved_to = q.tag;
  q.approved_at = now;
  q.approved_path = route.path;
  q.approved_bank_id = route.bankId;
  q.updated_at = now;
  writeBank(QUOTES_BANK, bank);
  return c.json({ ok: true, quote: q, destination: route.path });
});

/** POST /api/extracts/:transcriptId/:quoteId/unapprove - remove from bank */
app.post('/:transcriptId/:quoteId/unapprove', (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const bank = readBank(QUOTES_BANK);
  const q = bank.quotes.find(
    (x) => x.id === quoteId && x.source_transcript_id === transcriptId
  );
  if (!q) return c.json({ error: 'quote not found' }, 404);
  if (!q.approved_at) return c.json({ error: 'not approved' }, 400);

  if (q.approved_path) {
    if (q.approved_path.endsWith('.md') && fs.existsSync(q.approved_path)) {
      try { fs.unlinkSync(q.approved_path); } catch {}
    } else if (q.approved_path.endsWith('.json') && q.approved_bank_id) {
      try {
        const arr = JSON.parse(fs.readFileSync(q.approved_path, 'utf8'));
        if (Array.isArray(arr)) {
          const next = arr.filter((e) => e?.id !== q.approved_bank_id);
          fs.writeFileSync(q.approved_path, JSON.stringify(next, null, 2));
        }
      } catch {}
    }
  }

  delete q.approved_to;
  delete q.approved_at;
  delete q.approved_path;
  delete q.approved_bank_id;
  q.updated_at = Math.floor(Date.now() / 1000);
  writeBank(QUOTES_BANK, bank);
  return c.json({ ok: true, quote: q });
});

/** POST /api/extracts/:transcriptId/:quoteId/queue-ig - add to IG queue */
app.post('/:transcriptId/:quoteId/queue-ig', (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const bank = readBank(QUOTES_BANK);
  const q = bank.quotes.find(
    (x) => x.id === quoteId && x.source_transcript_id === transcriptId
  );
  if (!q) return c.json({ error: 'quote not found' }, 404);
  if (q.in_ig_queue) return c.json({ error: 'already in queue' }, 400);

  let queue: Array<Record<string, unknown>> = [];
  try {
    queue = JSON.parse(fs.readFileSync(IG_QUEUE, 'utf8'));
    if (!Array.isArray(queue)) queue = [];
  } catch {}
  const igId = `ig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  queue.push({
    id: igId,
    quote_id: q.id,
    text: q.text,
    tag: q.tag,
    context: q.context,
    timestamp: q.timestamp,
    source_transcript_id: q.source_transcript_id,
    source_transcript_filename: q.source_transcript_filename,
    source_moments: q.source_moments ?? [],
    kind: q.kind ?? 'quote',
    topics: q.topics ?? [],
    title: q.title,
    status: 'queued',
    queued_at: Math.floor(Date.now() / 1000),
  });
  fs.writeFileSync(IG_QUEUE, JSON.stringify(queue, null, 2));

  q.in_ig_queue = true;
  q.ig_queue_id = igId;
  q.queued_at = Math.floor(Date.now() / 1000);
  q.updated_at = q.queued_at;
  writeBank(QUOTES_BANK, bank);
  return c.json({ ok: true, queue_id: igId });
});

/** POST /api/extracts/:transcriptId/:quoteId/unqueue-ig - remove from IG queue */
app.post('/:transcriptId/:quoteId/unqueue-ig', (c) => {
  const { transcriptId, quoteId } = c.req.param();
  const bank = readBank(QUOTES_BANK);
  const q = bank.quotes.find(
    (x) => x.id === quoteId && x.source_transcript_id === transcriptId
  );
  if (!q) return c.json({ error: 'quote not found' }, 404);
  if (!q.in_ig_queue) return c.json({ error: 'not in queue' }, 400);

  if (q.ig_queue_id) {
    try {
      const arr = JSON.parse(fs.readFileSync(IG_QUEUE, 'utf8'));
      if (Array.isArray(arr)) {
        const next = arr.filter((e) => e?.id !== q.ig_queue_id);
        fs.writeFileSync(IG_QUEUE, JSON.stringify(next, null, 2));
      }
    } catch {}
  }

  delete q.in_ig_queue;
  delete q.ig_queue_id;
  delete q.queued_at;
  q.updated_at = Math.floor(Date.now() / 1000);
  writeBank(QUOTES_BANK, bank);
  return c.json({ ok: true, quote: q });
});

// ─── approval routing ─────────────────────────────────────────────────────

type RouteResult = { path: string; bankId?: string };

function routeApprovedQuote(q: ExtractedQuote): RouteResult {
  const now = Math.floor(Date.now() / 1000);
  switch (q.tag) {
    case 'pov': {
      // Write a new POV file at 05_Assets/POVs/asset_pov-<slug>.md
      fs.mkdirSync(POVS_DIR, { recursive: true });
      const slugSource = q.title || q.text.split(/[.!?]/)[0] || q.text;
      const slug = `pov-${slugify(slugSource)}`.slice(0, 70);
      const filename = `asset_${slug}.md`;
      const filePath = path.join(POVS_DIR, filename);
      const today = new Date().toISOString().slice(0, 10);
      const titleText = (q.title ?? q.text).slice(0, 60).replace(/"/g, '\\"');
      const md =
        '---\n' +
        'type: pov\n' +
        `slug: ${slug}\n` +
        'status: draft\n' +
        'tags:\n' +
        '  - type/asset\n' +
        '  - domain/povs\n' +
        '  - source/transcript\n' +
        'aliases:\n' +
        `  - "${titleText}"\n` +
        `id: ${slug}\n` +
        `title: "${titleText}"\n` +
        `created: '${today}'\n` +
        `updated: '${today}'\n` +
        `source_transcript: ${q.source_transcript_filename}\n` +
        `source_timestamp: ${q.timestamp}\n` +
        '---\n\n' +
        '## POV\n\n' +
        `${q.text}\n\n` +
        '## Context\n\n' +
        `${q.context}\n`;
      fs.writeFileSync(filePath, md);
      return { path: filePath };
    }
    case 'value': {
      const id = `tf-${now}-${Math.random().toString(36).slice(2, 6)}`;
      appendJsonBank(FRAMEWORKS_BANK, {
        id,
        text: q.text,
        title: q.title,
        context: q.context,
        source_transcript: q.source_transcript_filename,
        source_timestamp: q.timestamp,
        source_moments: q.source_moments ?? [],
        tags: q.topics ?? [],
        status: 'confirmed',
        created_at: now,
        updated_at: now,
      });
      return { path: FRAMEWORKS_BANK, bankId: id };
    }
    case 'connection': {
      const id = `ms-${now}-${Math.random().toString(36).slice(2, 6)}`;
      appendJsonBank(MICRO_STORIES, {
        id,
        text: q.text,
        title: q.title,
        source_transcript: q.source_transcript_filename,
        source_timestamp: q.timestamp,
        source_moments: q.source_moments ?? [],
        tags: q.topics ?? [],
        status: 'confirmed',
        created_at: now,
        updated_at: now,
      });
      return { path: MICRO_STORIES, bankId: id };
    }
    case 'authority': {
      const id = `pc-${now}-${Math.random().toString(36).slice(2, 6)}`;
      appendJsonBank(PROOF_BANK, {
        id,
        text: q.text,
        title: q.title,
        context: q.context,
        source_transcript: q.source_transcript_filename,
        source_timestamp: q.timestamp,
        source_moments: q.source_moments ?? [],
        tags: q.topics ?? [],
        status: 'confirmed',
        created_at: now,
        updated_at: now,
      });
      return { path: PROOF_BANK, bankId: id };
    }
  }
}

function appendJsonBank(filePath: string, entry: Record<string, unknown>): void {
  let arr: any[] = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    arr = JSON.parse(raw);
    if (!Array.isArray(arr)) arr = [];
  } catch {}
  arr.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2));
}

export default app;
