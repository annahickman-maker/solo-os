/**
 * Archive views - read-only listings for POVs, transcripts, and videos.
 * These mirror the old `/api/archive/*` shape so the Vault page renders.
 *
 * All sources are vault files; no D1.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs, loadCollection, loadFile } from '../vault.js';

const app = new Hono();

// ─── POVs ─────────────────────────────────────────────────────────────────

function categorizePOV(title: string): string {
  const t = title.toLowerCase();
  if (/personal brand|reputation|audience/.test(t)) return 'Brand';
  if (/offer|proof|product|price|launch/.test(t)) return 'Offer';
  if (/content|video|youtube|hook|insight|information/.test(t)) return 'Content';
  if (/story|origin|connection|vulnerab/.test(t)) return 'Connection';
  return 'Other';
}

app.get('/povs', (c) => {
  const items = loadCollection('05_Assets/POVs', { type: 'pov' }).map((e) => {
    const fm = e.frontmatter as any;
    const title = fm.title ?? e.id;
    // Extract the POV section if present, else first paragraph.
    const povSection = e.body.match(/##\s+POV\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    const opinion = povSection ? povSection[1]!.trim() : e.body.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '';
    return {
      id: fm.id ?? e.id,
      title,
      original_title: e.id,
      format: fm.format ?? 'short',
      category: categorizePOV(title),
      opinion: opinion.slice(0, 240),
    };
  });
  items.sort((a, b) => a.title.localeCompare(b.title));
  return c.json({ items });
});

app.get('/povs/:id', (c) => {
  const id = c.req.param('id');
  const e = loadCollection('05_Assets/POVs', { type: 'pov' }).find(
    (x) => (x.frontmatter as any).id === id || x.id === id
  );
  if (!e) return c.json({ error: 'not found' }, 404);
  const fm = e.frontmatter as any;
  return c.json({
    id: fm.id ?? e.id,
    title: fm.title ?? e.id,
    format: fm.format ?? 'short',
    content: e.body,
  });
});

// ─── Transcripts ──────────────────────────────────────────────────────────

type TranscriptInfo = {
  id: string;
  filename: string;
  title?: string;
  type: string;
  date: number | null;
  processed: number;
  pov_count: number;
  created_at: number;
  updated_at: number;
  summary: string;
  excerpt: string;
  client: string | null;
  source_rel?: string; // for files outside TRANSCRIPT_DIRS (e.g. 04_Channel video files)
  youtube_url?: string | null;
  has_raw?: boolean; // true when a sibling raw/ file exists with full word-for-word transcript
};

const TRANSCRIPT_DIRS: Array<{ rel: string; type: string }> = [
  { rel: path.join('05_Assets', 'Transcripts', 'QA-Calls'), type: 'qa' },
  { rel: path.join('05_Assets', 'Transcripts', 'Live-Workshops'), type: 'workshop' },
  { rel: path.join('05_Assets', 'Transcripts', 'YouTube-Videos'), type: 'video' },
  { rel: path.join('05_Assets', 'Transcripts', 'Client-Calls'), type: 'client' },
  // Holding bin for zoom recordings whose topic didn't match any auto-classifier.
  // The user picks the right category from the Vault page, which moves the file
  // into the matching folder above.
  { rel: path.join('05_Assets', 'Transcripts', 'Untagged'), type: 'untagged' },
];

function detectClient(filename: string): string | null {
  const f = filename.toLowerCase();
  const match = f.match(/\b(fab|client-a|client-b|client-[a-z0-9-]+)\b/);
  return match ? match[1]! : null;
}

function dateFromFilename(filename: string): number | null {
  const m = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  // Pin to local midnight so the frontend's toLocaleDateString renders the
  // same calendar day the filename names, not the previous day in negative-UTC
  // timezones. Using (year, monthIdx, day) builds a local-time Date.
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

function scanTranscripts(): TranscriptInfo[] {
  const out: TranscriptInfo[] = [];
  for (const { rel, type } of TRANSCRIPT_DIRS) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs(rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!e.name.endsWith('.md') && !e.name.endsWith('.txt')) continue;
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      // Skip Claude-generated summaries - they live next to their source
      // transcript in the same folder, but the Vault page should show only
      // the transcript, not both. Summaries are accessible from the inbox.
      if (e.name.endsWith('_summary.md')) continue;
      const full = path.join(abs(rel), e.name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      // Quick excerpt: first ~200 chars of body (strip frontmatter if present).
      let raw = '';
      try {
        raw = fs.readFileSync(full, 'utf8');
      } catch {}
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
      const excerpt = body.replace(/\s+/g, ' ').slice(0, 200);
      // Summary: pull a `summary:` frontmatter line if present.
      const summaryMatch = raw.match(/^summary:\s*"?(.+?)"?\s*$/m);
      const summary = summaryMatch ? summaryMatch[1]!.slice(0, 200) : '';
      const hasRaw = findRawTranscript(rel, e.name) != null;
      out.push({
        id: `transcript-${e.name.replace(/\.(md|txt)$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        filename: e.name,
        type,
        date: dateFromFilename(e.name),
        processed: 1,
        pov_count: 0,
        created_at: Math.floor(stat.mtimeMs / 1000),
        updated_at: Math.floor(stat.mtimeMs / 1000),
        summary,
        excerpt,
        client: detectClient(e.name),
        has_raw: hasRaw,
      });
    }
  }
  return out;
}

// Pull YouTube transcripts that the API/youtube-transcript package stored as the
// `## Transcript` section inside 04_Channel/04_Projects/<video>.md files.
function scanVideoFileTranscripts(): TranscriptInfo[] {
  const out: TranscriptInfo[] = [];
  const videos = loadCollection('04_Channel/04_Projects', { type: 'video' });
  for (const e of videos) {
    const fm = e.frontmatter as any;
    if (fm?.status !== 'published') continue;
    const transcriptMatch = e.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
    if (!transcriptMatch) continue;
    const transcript = transcriptMatch[1]!.trim();
    if (!transcript || transcript.length < 50) continue; // skip stubs
    let publishDate: number | null = null;
    if (typeof fm.publish_date === 'number') publishDate = fm.publish_date;
    else if (typeof fm.publish_date === 'string' && fm.publish_date) {
      const t = Date.parse(fm.publish_date);
      if (!Number.isNaN(t)) publishDate = Math.floor(t / 1000);
    }
    const title = fm.title ?? e.id;
    const filename = path.basename(e.relPath);
    out.push({
      id: `yt-${(fm.id ?? e.id).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`,
      filename,
      title,
      type: 'video',
      date: publishDate,
      processed: 1,
      pov_count: 0,
      created_at: e.mtimeSec,
      updated_at: e.mtimeSec,
      summary: '',
      excerpt: transcript.replace(/\s+/g, ' ').slice(0, 200),
      client: null,
      source_rel: e.relPath,
      youtube_url: fm.youtube_url ?? null,
    });
  }
  return out;
}

function allTranscripts(): TranscriptInfo[] {
  const all = [...scanTranscripts(), ...scanVideoFileTranscripts()];
  all.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  return all;
}

app.get('/transcripts', (c) => {
  return c.json({ items: allTranscripts() });
});

/**
 * POST /api/archive/transcripts/upload
 *
 * Accepts a multipart/form-data upload with:
 *   - file:  the transcript file (.md / .txt / .vtt / .srt)
 *   - type:  optional category id ('qa' | 'workshop' | 'video' | 'client').
 *            If omitted, type is auto-detected from the filename.
 *
 * Saves the file into the appropriate 05_Assets/Transcripts/<folder>/
 * directory, returns the new transcript's id so the frontend can kick
 * off extraction immediately. The filename is preserved (with a counter
 * suffix on collisions) so the existing date-from-filename logic + the
 * /transcripts/:id read endpoint keep working unchanged.
 */
app.post('/transcripts/upload', async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: 'multipart/form-data required' }, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file field missing' }, 400);

  const explicitType = (form.get('type') as string | null) || null;
  const validTypes = TRANSCRIPT_DIRS.map((d) => d.type);
  // Auto-detect type from filename when not explicitly set. Patterns
  // align with how the creator's existing automation names files:
  //   yt-*       → video
  //   workshop*  → workshop
  //   client*    → client
  //   anything else → qa (most common case)
  function detectType(name: string): string {
    const lc = name.toLowerCase();
    if (/^yt-|youtube/.test(lc)) return 'video';
    if (/workshop|live/.test(lc)) return 'workshop';
    if (/client|coaching|1on1|fab|client-a|client-b/.test(lc)) return 'client';
    // (When new clients get added, the regex above plus detectClient's regex are the two places to extend.)
    return 'qa';
  }
  const type = explicitType && validTypes.includes(explicitType)
    ? explicitType
    : detectType(file.name);

  const dirEntry = TRANSCRIPT_DIRS.find((d) => d.type === type);
  if (!dirEntry) return c.json({ error: `invalid type: ${type}` }, 400);

  // Sanitise filename (no path separators, preserve extension).
  const rawName = file.name || `transcript-${Date.now()}.md`;
  const safeName = rawName.replace(/[/\\]/g, '_').trim() || `transcript-${Date.now()}.md`;
  const targetDir = abs(dirEntry.rel);
  fs.mkdirSync(targetDir, { recursive: true });

  // Avoid overwriting on duplicate names. If the target exists, append
  // a -2, -3 suffix until we find a free slot.
  let finalName = safeName;
  let counter = 2;
  while (fs.existsSync(path.join(targetDir, finalName))) {
    const dot = safeName.lastIndexOf('.');
    const base = dot > 0 ? safeName.slice(0, dot) : safeName;
    const ext = dot > 0 ? safeName.slice(dot) : '';
    finalName = `${base}-${counter}${ext}`;
    counter++;
    if (counter > 99) return c.json({ error: 'could not find unique filename' }, 500);
  }

  const fullPath = path.join(targetDir, finalName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);

  // Find the new entry in the scanned list to return its id (matches
  // the id the rest of the dashboard uses).
  const all = allTranscripts();
  const created = all.find((t) => t.filename === finalName && t.type === type);
  return c.json({
    ok: true,
    id: created?.id ?? null,
    type,
    filename: finalName,
    rel_path: `${dirEntry.rel}/${finalName}`,
    auto_detected_type: !explicitType,
  });
});

/**
 * POST /api/archive/transcripts/:id/recategorize
 *
 * Body: { type: 'qa' | 'workshop' | 'client' | 'video' | 'untagged' }
 *
 * Moves a transcript file from its current category folder into the new
 * category's folder. Used by the Vault page when the user changes a call's
 * category from the inline picker (especially for zoom transcripts that
 * landed in Untagged because the topic regex didn't catch them).
 */
app.post('/transcripts/:id/recategorize', async (c) => {
  const id = c.req.param('id');
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'body must be JSON' }, 400);
  }
  const newType = typeof body?.type === 'string' ? body.type : '';
  const dest = TRANSCRIPT_DIRS.find((d) => d.type === newType);
  if (!dest) return c.json({ ok: false, error: `invalid type: ${newType}` }, 400);

  const all = allTranscripts();
  const item = all.find((t) => t.id === id);
  if (!item) return c.json({ ok: false, error: 'transcript not found' }, 404);
  if (item.type === newType) return c.json({ ok: true, moved: false });

  const currentDir = TRANSCRIPT_DIRS.find((d) => d.type === item.type);
  if (!currentDir) return c.json({ ok: false, error: 'unmovable transcript (no source folder)' }, 400);

  const fromPath = path.join(abs(currentDir.rel), item.filename);
  const toDirAbs = abs(dest.rel);
  fs.mkdirSync(toDirAbs, { recursive: true });
  // Collision-safe rename: same suffixing rule as upload.
  let finalName = item.filename;
  let counter = 2;
  while (fs.existsSync(path.join(toDirAbs, finalName))) {
    const dot = item.filename.lastIndexOf('.');
    const base = dot > 0 ? item.filename.slice(0, dot) : item.filename;
    const ext = dot > 0 ? item.filename.slice(dot) : '';
    finalName = `${base}-${counter}${ext}`;
    counter++;
    if (counter > 99) return c.json({ ok: false, error: 'could not find unique filename' }, 500);
  }
  const toPath = path.join(toDirAbs, finalName);

  try {
    fs.renameSync(fromPath, toPath);
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 500);
  }
  return c.json({ ok: true, moved: true, from_type: item.type, to_type: newType, new_filename: finalName });
});

app.get('/transcripts/:id', (c) => {
  const id = c.req.param('id');
  const info = allTranscripts().find((t) => t.id === id);
  if (!info) return c.json({ error: 'not found' }, 404);

  // Source 2: 04_Channel video file (transcript section)
  if (info.source_rel) {
    const full = abs(info.source_rel);
    if (fs.existsSync(full)) {
      const raw = fs.readFileSync(full, 'utf8');
      const body = raw.replace(/^---\n[\s\S]*?\n---\n/, '');
      const transcriptMatch = body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
      const content = transcriptMatch ? transcriptMatch[1]!.trim() : body.trim();
      return c.json({
        id: info.id,
        filename: info.filename,
        title: info.title,
        type: info.type,
        date: info.date,
        processed: info.processed,
        summary: info.summary,
        pov_count: info.pov_count,
        youtube_url: info.youtube_url,
        content,
      });
    }
  }

  // Source 1: 05_Assets/Transcripts/* folders
  for (const { rel } of TRANSCRIPT_DIRS) {
    const full = path.join(abs(rel), info.filename);
    if (fs.existsSync(full)) {
      // The "summary" file (with Community Post / strategy recap) lives in the
      // parent folder. The RAW word-for-word transcript with speaker labels
      // lives in the sibling `raw/` folder when present.
      // For the panel UI we want BOTH: summary_content for the summary section,
      // content (raw) for extraction and the full-transcript section.
      const summaryContent = fs.readFileSync(full, 'utf8');
      const rawCandidate = findRawTranscript(rel, info.filename);
      const rawContent = rawCandidate ? fs.readFileSync(rawCandidate, 'utf8') : summaryContent;
      return c.json({
        id: info.id,
        filename: rawCandidate ? path.basename(rawCandidate) : info.filename,
        title: info.title,
        type: info.type,
        date: info.date,
        processed: info.processed,
        summary: info.summary,
        summary_content: summaryContent,
        pov_count: info.pov_count,
        content: rawContent,
        has_raw: rawCandidate != null,
      });
    }
  }
  return c.json({ error: 'file vanished' }, 404);
});

/**
 * For a given summary filename (e.g. `qa_2026-06-03.md` in QA-Calls/),
 * look for a matching raw transcript in the sibling `raw/` folder.
 * Conventions:
 *   QA-Calls/qa_2026-06-03.md         -> QA-Calls/raw/qa-raw_2026-06-03.md
 *   Client-Calls/2026-06-04_tharros.md -> Client-Calls/raw/2026-06-04_tharros_raw.md
 */
function findRawTranscript(dirRel: string, summaryFilename: string): string | null {
  const rawDir = path.join(abs(dirRel), 'raw');
  if (!fs.existsSync(rawDir)) return null;
  const stem = summaryFilename.replace(/\.(md|txt)$/, '');
  const candidates = [
    `${stem}_raw.md`,           // 2026-06-04_tharros_raw.md
    `${stem.replace(/^qa_/, 'qa-raw_')}.md`, // qa-raw_2026-06-03.md
    `${stem}-raw.md`,
    `raw_${stem}.md`,
  ];
  for (const c of candidates) {
    const full = path.join(rawDir, c);
    if (fs.existsSync(full)) return full;
  }
  // Last resort: find any raw file containing the date string.
  const dateMatch = stem.match(/\d{4}-\d{2}-\d{2}/);
  if (dateMatch) {
    const date = dateMatch[0];
    try {
      const entries = fs.readdirSync(rawDir);
      const match = entries.find((e) => e.includes(date));
      if (match) return path.join(rawDir, match);
    } catch {}
  }
  return null;
}

// ─── Videos (archived view) ───────────────────────────────────────────────

app.get('/videos', (c) => {
  const items = loadCollection('04_Channel/04_Projects', { type: 'video' })
    .filter((e) => {
      const fm = e.frontmatter as any;
      return fm?.status === 'published';
    })
    .map((e) => {
      const fm = e.frontmatter as any;
      let publishDate: number | null = null;
      if (typeof fm.publish_date === 'number') publishDate = fm.publish_date;
      else if (typeof fm.publish_date === 'string' && fm.publish_date) {
        const t = Date.parse(fm.publish_date);
        if (!Number.isNaN(t)) publishDate = Math.floor(t / 1000);
      }
      return {
        id: fm.id ?? e.id,
        title: fm.title ?? e.id,
        publish_date: publishDate,
        status: fm.status,
        view_count: fm.view_count ?? null,
        ctr_pct: fm.ctr_pct ?? null,
        youtube_url: fm.youtube_url ?? null,
      };
    })
    .sort((a, b) => (b.publish_date ?? 0) - (a.publish_date ?? 0));
  return c.json({ items });
});

app.get('/videos/:id', (c) => {
  const id = c.req.param('id');
  const entry = loadCollection('04_Channel/04_Projects', { type: 'video' }).find(
    (x) => (x.frontmatter as any).id === id || x.id === id
  );
  if (!entry) return c.json({ error: 'not found' }, 404);
  const fm = entry.frontmatter as any;
  // Extract transcript from body.
  const transcriptMatch = entry.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  const script = transcriptMatch ? transcriptMatch[1]!.trim() : entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();
  let publishDate: number | null = null;
  if (typeof fm.publish_date === 'number') publishDate = fm.publish_date;
  else if (typeof fm.publish_date === 'string' && fm.publish_date) {
    const t = Date.parse(fm.publish_date);
    if (!Number.isNaN(t)) publishDate = Math.floor(t / 1000);
  }
  return c.json({
    id: fm.id ?? entry.id,
    title: fm.title ?? entry.id,
    script_content: script,
    youtube_url: fm.youtube_url ?? null,
    publish_date: publishDate,
    view_count: fm.view_count ?? null,
  });
});

// Reference fs/loadFile (intentionally available)
void loadFile;

export default app;
