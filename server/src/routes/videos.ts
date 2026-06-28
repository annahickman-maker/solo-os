/**
 * Videos - 04_Channel/04_Projects/project_*.md (existing file-per-row).
 *
 * Default export wires the factory CRUD + a custom POST /:id/generate-titles
 * that calls the local Claude bridge instead of the legacy Wrangler backend.
 */

import { Hono } from 'hono';
import { createFileRoute, slugify, todayISO } from './_factory.js';
import { loadCollection, loadFile, saveFile, abs } from '../vault.js';
import { generateTitles, type Suggestions } from '../lib/titleGen.js';
import { generateVideoDescription } from '../lib/videoDescription.js';
import { suggestIntroFromScript } from '../lib/introFromScript.js';
import {
  findForVideo as findTranscriptForVideo,
  listAll as listAllTranscripts,
  readByRelPath as readTranscriptByRelPath,
  relIsTranscript,
  saveTranscript,
} from '../lib/transcriptVault.js';
import {
  draftOneSection,
  draftScriptFromAnchors,
  findBankItems,
  loadAllBanks,
  normalizeSectionKind,
  suggestAnchorsBySection,
  suggestAnchorsForVideo,
  type BankKind,
  type SectionKind,
  type StructureMode,
} from '../lib/youtubeScriptBuilder.js';

type VideoStatus = 'idea' | 'scripted' | 'filmed' | 'editing' | 'published';

type VideoFrontmatter = {
  id?: string;
  type: 'video';
  title?: string;
  status?: VideoStatus;
  cta?: string;
  // Short, one-line description of what this video is for. Shown as a
  // subhead on each video card so the creator can scan the queue and know what
  // each video's job is at a glance.
  goal?: string;
  queue_order?: number;
  publish_date?: string | number;
  youtube_url?: string;
  youtube_id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  duration_sec?: number;
  ctr_pct?: number;
  sub_rate_pct?: number;
  conversion_pct?: number;
  avg_view_duration_sec?: number;
  suggestions_json?: string;
  suggestions_at?: number;
  description?: string;
  description_generated_at?: number;
  archived?: boolean;
  queued?: number;
  tied_to_transformation?: number;
  created?: string;
  updated?: string;
};

type VideoResponse = {
  id: string;
  title: string;
  status: VideoStatus;
  script_content: string;
  cta: string | null;
  goal: string | null;
  queue_order: number | null;
  publish_date: number | null;
  youtube_url: string | null;
  youtube_id: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  duration_sec: number | null;
  ctr_pct: number | null;
  sub_rate_pct: number | null;
  conversion_pct: number | null;
  avg_view_duration_sec: number | null;
  suggestions_json: string | null;
  suggestions_at: number | null;
  description: string | null;
  description_generated_at: number | null;
  script_sections: any;
  archived: boolean;
  queued: number;
  tied_to_transformation: number;
  source_file: string;
  updated_at: number;
};

const factoryApp = createFileRoute<VideoFrontmatter, VideoResponse>({
  folder: '04_Channel/04_Projects',
  type: 'video',
  toResponse: (entry) => {
    const fm = entry.frontmatter;
    if (fm?.type !== 'video') return null;
    const titleMatch = entry.body.match(/^#\s+(.+?)\s*$/m);
    // Strip the leading title heading so the script body shows just the script.
    // Match the whole first line (including its newline) rather than just `\n?`
    // - the non-greedy `.+?` was eating only the first character.
    const script = entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();
    // Publish date: tolerate ISO string or number, normalize to unix seconds.
    let publishDate: number | null = null;
    if (typeof fm.publish_date === 'number') publishDate = fm.publish_date;
    else if (typeof fm.publish_date === 'string' && fm.publish_date) {
      const t = Date.parse(fm.publish_date);
      if (!Number.isNaN(t)) publishDate = Math.floor(t / 1000);
    }
    return {
      id: fm.id ?? entry.id,
      title: fm.title ?? (titleMatch ? titleMatch[1]! : entry.id),
      status: fm.status ?? 'idea',
      script_content: script,
      cta: fm.cta ?? null,
      goal: fm.goal ?? null,
      queue_order: fm.queue_order ?? null,
      publish_date: publishDate,
      youtube_url: fm.youtube_url ?? null,
      youtube_id: fm.youtube_id ?? null,
      view_count: fm.view_count ?? null,
      like_count: fm.like_count ?? null,
      comment_count: fm.comment_count ?? null,
      duration_sec: fm.duration_sec ?? null,
      ctr_pct: fm.ctr_pct ?? null,
      sub_rate_pct: fm.sub_rate_pct ?? null,
      conversion_pct: fm.conversion_pct ?? null,
      avg_view_duration_sec: fm.avg_view_duration_sec ?? null,
      suggestions_json: fm.suggestions_json ?? null,
      suggestions_at: fm.suggestions_at ?? null,
      description: fm.description ?? null,
      description_generated_at: fm.description_generated_at ?? null,
      script_sections: (fm as any).script_sections ?? null,
      archived: !!fm.archived,
      queued: fm.queued ?? 0,
      tied_to_transformation: fm.tied_to_transformation ?? 0,
      source_file: entry.relPath,
      updated_at: entry.mtimeSec,
    };
  },
  fromCreate: (body) => {
    if (!body?.title) return null;
    const id = `video-${slugify(body.title)}`;
    const today = todayISO();
    const status = body.status ?? 'idea';
    // Anything that's an idea OR explicitly created in the queue lands queued.
    // Scripted/filmed/etc. created via POST go straight to the working bucket.
    const queued = body.queued !== undefined ? body.queued : status === 'idea' ? 1 : 0;
    const fm: Record<string, unknown> = {
      id,
      type: 'video',
      title: body.title,
      status,
      queued,
      created: today,
      updated: today,
    };
    // Skip undefined values - js-yaml can't dump them and the file save errors out.
    if (body.cta !== undefined) fm.cta = body.cta;
    return {
      id,
      frontmatter: fm,
      body: `# ${body.title}\n${body.notes ? `\n${body.notes}\n` : ''}`,
    };
  },
  applyPatch: (entry, body) => {
    const fm = { ...entry.frontmatter };
    const wasIdea = entry.frontmatter.status === 'idea';
    for (const k of [
      'title', 'status', 'cta', 'goal', 'queue_order', 'publish_date', 'youtube_url', 'archived',
      'queued', 'tied_to_transformation', 'ctr_pct', 'sub_rate_pct', 'conversion_pct',
      'avg_view_duration_sec', 'suggestions_json', 'suggestions_at'
    ] as const) {
      if (body[k] !== undefined) (fm as any)[k] = body[k];
    }
    // When a video graduates out of 'idea' (e.g. -> scripted) without the
    // caller explicitly touching `queued`, keep it in the queue. Otherwise
    // marking it scripted would silently promote it to "this week", which
    // isn't always what the user wants - scripted videos can sit in the
    // queue until she's actually planning to film them.
    if (wasIdea && body.status && body.status !== 'idea' && body.queued === undefined) {
      (fm as any).queued = 1;
    }
    fm.updated = todayISO();
    let newBody = entry.body;
    // Update body: prefer script_content if sent (it's the full script the
    // user typed in the detail modal), else fall back to notes, else just
    // patch the title heading.
    if (body.script_content !== undefined) {
      const heading = entry.body.match(/^#\s+.+?\n/)?.[0] ?? `# ${body.title ?? fm.title}\n`;
      newBody = `${heading}\n${body.script_content}\n`;
    } else if (body.notes !== undefined) {
      const heading = newBody.match(/^#\s+.+?\n/)?.[0] ?? `# ${fm.title}\n`;
      newBody = `${heading}\n${body.notes}\n`;
    }
    if (body.title !== undefined) {
      newBody = `# ${body.title}\n${newBody.replace(/^#\s+.+?\n/, '')}`;
    }
    return { frontmatter: fm, body: newBody };
  },
  applyFilters: (items, q) => {
    if (q.status) items = items.filter((x) => x.status === q.status);
    if (q.archived === 'true') items = items.filter((x) => x.archived);
    else if (q.archived === 'false' || q.archived === undefined) items = items.filter((x) => !x.archived);
    return items;
  },
  sort: (a, b) => (a.queue_order ?? 999) - (b.queue_order ?? 999) || b.updated_at - a.updated_at,
});

// ─── Title + thumbnail-phrase generator ────────────────────────────────────

function findVideoEntry(id: string) {
  const all = loadCollection('04_Channel/04_Projects', { type: 'video' });
  return all.find((e) => (e.frontmatter as any)?.id === id || e.id === id) ?? null;
}

const app = new Hono();

// POST /:id/generate-titles - generates 5 explicit + 5 implied titles + 5
// thumbnail phrases via the local Claude bridge. Respects `liked` items
// from the previous run when ?preserve=1 is set.
app.post('/:id/generate-titles', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);

  const fm = entry.frontmatter as any;
  const preserve = c.req.query('preserve') === '1';
  let existing: Suggestions | null = null;
  if (preserve && typeof fm.suggestions_json === 'string') {
    try { existing = JSON.parse(fm.suggestions_json); } catch { existing = null; }
  }

  // Pull script body. Mirror videos route: prefer the body after the H1
  // heading, fall back to a `## Transcript` section.
  let scriptContent = entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();
  const transcriptMatch = entry.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  if (transcriptMatch && transcriptMatch[1]) scriptContent = transcriptMatch[1].trim();

  try {
    const suggestions = await generateTitles({
      videoTitle: fm.title ?? entry.id,
      scriptContent,
      cta: fm.cta ?? null,
      goal: fm.goal ?? null,
      existing,
    });
    // Persist back onto the video file's frontmatter.
    const filePath = abs(entry.relPath);
    const fileEntry = loadFile(filePath);
    const nextFm = {
      ...(fileEntry?.frontmatter ?? {}),
      suggestions_json: JSON.stringify(suggestions),
      suggestions_at: suggestions.generated_at,
      updated: new Date().toISOString().slice(0, 10),
    };
    saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
    return c.json(suggestions);
  } catch (err: any) {
    console.error('generate-titles failed:', err);
    return c.json({ error: err?.message ?? 'generation failed' }, 500);
  }
});

// PATCH /:id/suggestions - persist the {liked: true/false} state of titles +
// thumbnail phrases. The frontend toggles `liked` and calls this on every
// click so the next /generate-titles run with ?preserve=1 keeps them.
app.patch('/:id/suggestions', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { suggestions?: Suggestions } | null;
  if (!body?.suggestions) return c.json({ error: 'suggestions required' }, 400);

  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const nextFm = {
    ...(fileEntry?.frontmatter ?? {}),
    suggestions_json: JSON.stringify(body.suggestions),
    suggestions_at: body.suggestions.generated_at ?? Math.floor(Date.now() / 1000),
    updated: new Date().toISOString().slice(0, 10),
  };
  saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
  return c.json({ ok: true });
});

// ─── Description generator ─────────────────────────────────────────────────

// Defaults match server/src/routes/settings.ts DEFAULTS.focus_cta_*. Kept
// here so this route can run independently if state.md is unreadable.
const FOCUS_CTA_TEXT_DEFAULT =
  'want my system for building a one-person business that fits your brain? link in bio.';
const FOCUS_CTA_URL_DEFAULT = '';

function getFocusCta(): { text: string; url: string } {
  // YouTube description generator uses the YT-specific CTA. Falls back
  // through the legacy shared keys for old vaults.
  try {
    const entry = loadFile(abs('00_System', 'state.md'));
    const fm = (entry?.frontmatter as Record<string, unknown>) ?? {};
    return {
      text:
        (fm.youtube_cta_text as string | undefined) ??
        (fm.focus_cta_text as string | undefined) ??
        (fm.ig_cta_text as string | undefined) ??
        FOCUS_CTA_TEXT_DEFAULT,
      url:
        (fm.youtube_cta_url as string | undefined) ??
        (fm.focus_cta_url as string | undefined) ??
        (fm.ig_cta_url as string | undefined) ??
        FOCUS_CTA_URL_DEFAULT,
    };
  } catch {
    return { text: FOCUS_CTA_TEXT_DEFAULT, url: FOCUS_CTA_URL_DEFAULT };
  }
}

// POST /:id/description - generates a ready-to-paste YouTube description
// using the youtube-description skill's structure (CTA + 2-sentence hook +
// 4-6 timestamped chapters). Persists onto the video file's frontmatter.
app.post('/:id/description', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);

  const fm = entry.frontmatter as any;
  const title: string = fm.title ?? entry.id;

  // the creator can EITHER drop a transcript file on the description section
  // (sent in the body as `transcript`), OR rely on whatever is already
  // stored in the video file as the script content. Dropped transcripts
  // are one-shot - we don't persist them as the video's script_content
  // because the transcript is the raw spoken word, not the drafted script.
  const body = (await c.req.json().catch(() => null)) as { transcript?: string } | null;
  let scriptContent = '';
  let transcriptSource: 'inline' | 'linked' | 'detected' | 'video-body' | 'none' = 'none';
  if (typeof body?.transcript === 'string' && body.transcript.trim()) {
    scriptContent = body.transcript.trim();
    transcriptSource = 'inline';
  } else {
    // Prefer a vault transcript (linked first, then detected). Falls back to
    // the video file's own body (## Transcript section or post-H1 prose) for
    // historic videos that haven't been wired to the vault yet.
    const found = findTranscriptForVideo({
      videoTranscriptPath: typeof fm.transcript_path === 'string' ? fm.transcript_path : null,
      videoYoutubeId: typeof fm.youtube_id === 'string' ? fm.youtube_id : null,
      videoTitle: typeof fm.title === 'string' ? fm.title : null,
    });
    if (found.match) {
      const ts = readTranscriptByRelPath(found.match.relPath);
      if (ts && ts.text.trim()) {
        scriptContent = ts.text.trim();
        transcriptSource = found.source === 'linked' ? 'linked' : 'detected';
      }
    }
    if (!scriptContent) {
      scriptContent = entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();
      const transcriptMatch = entry.body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
      if (transcriptMatch && transcriptMatch[1]) scriptContent = transcriptMatch[1].trim();
      if (scriptContent.trim()) transcriptSource = 'video-body';
    }
  }
  if (!scriptContent.trim()) {
    return c.json({ error: 'no transcript provided. drop a transcript file or add the script first.' }, 400);
  }

  const cta = getFocusCta();
  try {
    const result = await generateVideoDescription({
      videoTitle: title,
      scriptContent,
      ctaText: cta.text,
      ctaUrl: cta.url,
    });

    // Persist back onto the video file's frontmatter.
    const filePath = abs(entry.relPath);
    const fileEntry = loadFile(filePath);
    const nextFm = {
      ...(fileEntry?.frontmatter ?? {}),
      description: result.description,
      description_generated_at: result.generated_at,
      updated: new Date().toISOString().slice(0, 10),
    };
    saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
    return c.json({
      ok: true,
      description: result.description,
      generated_at: result.generated_at,
      transcript_source: transcriptSource,
    });
  } catch (err: any) {
    console.error('generate-description failed:', err);
    return c.json({ error: err?.message ?? 'generation failed' }, 500);
  }
});

// ─── Transcript vault ──────────────────────────────────────────────────────

// GET /:id/transcript - returns the transcript currently associated with
// this video, plus the source ('linked' or 'detected'). When source is
// 'detected' the UI should ask the creator to confirm before treating it as
// authoritative.
app.get('/:id/transcript', (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  const result = findTranscriptForVideo({
    videoTranscriptPath: typeof fm.transcript_path === 'string' ? fm.transcript_path : null,
    videoYoutubeId: typeof fm.youtube_id === 'string' ? fm.youtube_id : null,
    videoTitle: typeof fm.title === 'string' ? fm.title : null,
  });
  if (!result.match) return c.json({ match: null, source: null });
  return c.json({
    match: {
      rel_path: result.match.relPath,
      filename: result.match.filename,
      title: result.match.title,
      youtube_id: result.match.youtube_id,
      youtube_url: result.match.youtube_url,
    },
    source: result.source,
  });
});

// POST /:id/transcript/upload - body { filename, text }. Persists the
// transcript file in the vault AND wires `transcript_path` onto the video's
// frontmatter so subsequent loads see it as 'linked'.
app.post('/:id/transcript/upload', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { filename?: string; text?: string } | null;
  const text = (body?.text ?? '').trim();
  if (!text) return c.json({ error: 'transcript text required' }, 400);
  const fm = entry.frontmatter as any;
  const youtubeId = typeof fm.youtube_id === 'string' ? fm.youtube_id : null;
  const youtubeUrl = typeof fm.youtube_url === 'string' ? fm.youtube_url : null;
  const title = typeof fm.title === 'string' ? fm.title : entry.id;
  const saved = saveTranscript({
    videoTitle: title,
    youtubeId,
    youtubeUrl,
    text,
    originalFilename: body?.filename ?? null,
  });
  // Link it back from the video.
  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const nextFm = {
    ...(fileEntry?.frontmatter ?? {}),
    transcript_path: saved.relPath,
    updated: new Date().toISOString().slice(0, 10),
  };
  saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
  return c.json({ ok: true, rel_path: saved.relPath, created: saved.created });
});

// POST /:id/transcript/link - body { rel_path }. the creator picked an existing
// vault transcript from the list. We write transcript_path to the video.
app.post('/:id/transcript/link', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { rel_path?: string } | null;
  const rel = body?.rel_path;
  if (!rel || !relIsTranscript(rel)) return c.json({ error: 'invalid transcript path' }, 400);
  const ts = readTranscriptByRelPath(rel);
  if (!ts) return c.json({ error: 'transcript not found' }, 404);
  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const nextFm = {
    ...(fileEntry?.frontmatter ?? {}),
    transcript_path: ts.relPath,
    updated: new Date().toISOString().slice(0, 10),
  };
  saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
  return c.json({ ok: true, rel_path: ts.relPath });
});

// DELETE /:id/transcript - clear the link from the video (does NOT delete
// the transcript file itself - it stays in the vault).
app.delete('/:id/transcript', (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const fmIn = (fileEntry?.frontmatter ?? {}) as Record<string, unknown>;
  const { transcript_path: _drop, ...rest } = fmIn;
  saveFile(filePath, { ...rest, updated: new Date().toISOString().slice(0, 10) }, fileEntry?.body ?? entry.body);
  return c.json({ ok: true });
});

// GET /transcripts/youtube - flat list for the picker UI. Newest first.
app.get('/transcripts/youtube', (c) => {
  const items = listAllTranscripts().map((f) => ({
    rel_path: f.relPath,
    filename: f.filename,
    slug: f.slug,
    title: f.title,
    youtube_id: f.youtube_id,
    youtube_url: f.youtube_url,
    mtime: f.mtime,
  }));
  return c.json({ items });
});

// POST /:id/intro/from-script - derive the 5 intro brief parts (clarity,
// belief, contrarian, proof, outcome) from EVERYTHING the video has so far:
// the drafted full script body (in entry.body, not frontmatter), the section
// briefs the creator typed for each part (intro / context / value / cta / outro),
// and the actual story text of every bank item she's already linked to a
// section. The generator can run with any of those - even with an empty
// script body, the briefs + linked stories are enough to draft an intro.
// Returned object is patched straight into the intro section's brief by the
// frontend; we don't persist server-side because the creator will usually massage
// the parts before they become the saved brief.
app.post('/:id/intro/from-script', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  // The full script lives in the file body (everything after the H1 title),
  // not in frontmatter. This matches how the GET /:id detail view computes
  // script_content (see the videos factory above).
  const scriptContent = entry.body.replace(/^#\s+[^\n]*\n?/, '').trim();

  // Assemble per-section context. We use whatever the creator has saved in
  // script_sections (the script builder's persisted state) and inline the
  // text of every linked bank item so the model sees what each section is
  // actually going to be made of.
  const bank = loadAllBanks();
  const byId = new Map(bank.map((b) => [b.id, b]));
  const sections: Array<{ label: string; kind: string; brief: string; anchorTexts: string[] }> = [];
  const rawSections = Array.isArray((fm as any).script_sections) ? (fm as any).script_sections : [];
  for (const s of rawSections) {
    if (!s || typeof s !== 'object') continue;
    const anchorIds: string[] = Array.isArray(s.anchor_ids) ? s.anchor_ids : [];
    const anchorTexts = anchorIds
      .map((id: string) => byId.get(id)?.text ?? '')
      .filter((t: string) => t.trim().length > 0);
    sections.push({
      label: typeof s.label === 'string' ? s.label : String(s.kind ?? 'section'),
      kind: typeof s.kind === 'string' ? s.kind : 'value',
      brief: typeof s.brief === 'string' ? s.brief : '',
      anchorTexts,
    });
  }

  try {
    const parts = await suggestIntroFromScript({
      videoTitle: fm.title ?? entry.id,
      videoGoal: typeof fm.goal === 'string' ? fm.goal : null,
      scriptContent,
      sections,
    });
    return c.json({ ok: true, parts });
  } catch (err: any) {
    console.error('intro-from-script failed:', err);
    return c.json({ error: err?.message ?? 'intro generation failed' }, 500);
  }
});

// PATCH /:id/description - persist user edits to the description without
// regenerating. Frontend calls this when the creator tweaks the textarea and blurs.
app.patch('/:id/description', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as { description?: string } | null;
  if (typeof body?.description !== 'string') return c.json({ error: 'description required' }, 400);
  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const nextFm = {
    ...(fileEntry?.frontmatter ?? {}),
    description: body.description,
    updated: new Date().toISOString().slice(0, 10),
  };
  saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
  return c.json({ ok: true });
});

// ─── Script builder ────────────────────────────────────────────────────────

// GET /banks - return all approved bank items in a single feed for the picker UI
app.get('/banks', (c) => {
  const items = loadAllBanks();
  // Group by kind for the UI; UI can flatten if it wants
  const grouped: Record<BankKind, typeof items> = {
    pov: [],
    framework: [],
    story: [],
    proof: [],
  };
  for (const i of items) grouped[i.kind].push(i);
  return c.json({ items, grouped });
});

// POST /:id/script/suggest-anchors - Claude proposes 8-15 bank items for this video
app.post('/:id/script/suggest-anchors', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  const body = (await c.req.json().catch(() => null)) as { transformation?: string } | null;
  try {
    const bank = loadAllBanks();
    if (bank.length === 0) {
      return c.json({ error: 'no bank items yet - approve quotes from your transcripts first' }, 400);
    }
    const suggestions = await suggestAnchorsForVideo({
      videoTitle: fm.title ?? entry.id,
      transformation: body?.transformation ?? fm.transformation ?? null,
      bank,
    });
    return c.json({ suggestions });
  } catch (err: any) {
    console.error('suggest-anchors failed:', err);
    return c.json({ error: err?.message ?? 'suggest failed' }, 500);
  }
});

// POST /:id/script/draft - body: { anchor_ids: string[], mode: 'infer'|'fixed'|'hybrid', transformation?: string }
// Synthesizes a full script and writes it back to the video file's body.
app.post('/:id/script/draft', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  const body = (await c.req.json().catch(() => null)) as
    | { anchor_ids?: string[]; mode?: StructureMode; transformation?: string; save?: boolean }
    | null;
  const ids = body?.anchor_ids ?? [];
  if (ids.length < 2) return c.json({ error: 'at least 2 anchor ids required' }, 400);
  const mode: StructureMode = (body?.mode === 'fixed' || body?.mode === 'hybrid') ? body.mode : 'infer';

  const anchors = findBankItems(ids);
  if (anchors.length < 2) {
    return c.json({ error: `only ${anchors.length} of ${ids.length} anchor ids resolved` }, 400);
  }

  try {
    const result = await draftScriptFromAnchors({
      videoTitle: fm.title ?? entry.id,
      transformation: body?.transformation ?? fm.transformation ?? null,
      cta: fm.cta ?? null,
      goal: fm.goal ?? null,
      anchors,
      mode,
    });

    // Optionally save back into the video file body. The script lives below the
    // H1 heading; we replace everything after the heading with the new script.
    if (body?.save !== false) {
      const filePath = abs(entry.relPath);
      const fileEntry = loadFile(filePath);
      const heading = entry.body.match(/^#\s+[^\n]*\n/)?.[0] ?? `# ${fm.title ?? entry.id}\n`;
      const newBody = `${heading}\n${result.script}\n`;
      const nextFm = {
        ...(fileEntry?.frontmatter ?? {}),
        script_anchor_ids: ids,
        script_anchor_mode: mode,
        script_drafted_at: Math.floor(Date.now() / 1000),
        updated: new Date().toISOString().slice(0, 10),
      };
      saveFile(filePath, nextFm, newBody);
    }

    return c.json(result);
  } catch (err: any) {
    console.error('draft script failed:', err);
    return c.json({ error: err?.message ?? 'draft failed' }, 500);
  }
});

// POST /:id/script/suggest-by-section - claude assigns anchors to each section
// body: { transformation?, sections: [{ id, label, kind, brief }] }
app.post('/:id/script/suggest-by-section', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  const body = (await c.req.json().catch(() => null)) as
    | {
        transformation?: string;
        sections?: Array<{
          id: string;
          label: string;
          kind: SectionKind;
          brief?: string;
          // IDs the creator has already picked for this section. Treated as locked
          // in the prompt - Claude only suggests ADDITIONS that complement
          // them, never replaces or duplicates them.
          locked_anchor_ids?: string[];
        }>;
      }
    | null;
  const sections = body?.sections ?? [];
  if (sections.length === 0) return c.json({ error: 'sections required' }, 400);

  try {
    const bank = loadAllBanks();
    if (bank.length === 0) {
      return c.json({ error: 'no bank items yet' }, 400);
    }
    const assignments = await suggestAnchorsBySection({
      videoTitle: fm.title ?? entry.id,
      transformation: body?.transformation ?? fm.transformation ?? null,
      sections: sections.map((s) => ({
        id: s.id,
        label: s.label,
        kind: normalizeSectionKind(s.kind),
        brief: s.brief ?? '',
        locked_anchor_ids: Array.isArray(s.locked_anchor_ids) ? s.locked_anchor_ids : [],
      })),
      bank,
    });
    return c.json({ assignments });
  } catch (err: any) {
    console.error('suggest-by-section failed:', err);
    return c.json({ error: err?.message ?? 'suggest failed' }, 500);
  }
});

// POST /:id/script/draft-sectioned - synthesize each section in isolation, concat.
// body: { transformation?, sections: [{ id, label, kind, brief, anchor_ids }] }
app.post('/:id/script/draft-sectioned', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const fm = entry.frontmatter as any;
  const body = (await c.req.json().catch(() => null)) as
    | {
        transformation?: string;
        sections?: Array<{
          id: string;
          label: string;
          kind: SectionKind;
          brief?: string;
          anchor_ids: string[];
        }>;
        save?: boolean;
      }
    | null;
  const sections = body?.sections ?? [];
  if (sections.length === 0) return c.json({ error: 'sections required' }, 400);
  const totalAnchors = sections.reduce((acc, s) => acc + (s.anchor_ids?.length ?? 0), 0);
  if (totalAnchors < 2) return c.json({ error: 'at least 2 anchors across sections required' }, 400);

  try {
    const results: Array<{ section_id: string; label: string; text: string; anchor_ids: string[] }> = [];
    for (const section of sections) {
      const anchors = findBankItems(section.anchor_ids ?? []);
      if (anchors.length === 0) continue; // skip empty sections
      const text = await draftOneSection({
        videoTitle: fm.title ?? entry.id,
        transformation: body?.transformation ?? fm.transformation ?? null,
        cta: fm.cta ?? null,
      goal: fm.goal ?? null,
        section: { id: section.id, label: section.label, kind: normalizeSectionKind(section.kind), brief: section.brief ?? '' },
        anchors,
      });
      results.push({ section_id: section.id, label: section.label, text, anchor_ids: section.anchor_ids });
    }
    // Concat with H2 section headings into one markdown body.
    const fullScript = results
      .map((r) => `## ${r.label}\n\n${r.text.trim()}`)
      .join('\n\n');

    if (body?.save !== false) {
      const filePath = abs(entry.relPath);
      const fileEntry = loadFile(filePath);
      const heading = entry.body.match(/^#\s+[^\n]*\n/)?.[0] ?? `# ${fm.title ?? entry.id}\n`;
      const newBody = `${heading}\n${fullScript}\n`;
      const nextFm = {
        ...(fileEntry?.frontmatter ?? {}),
        script_sections: sections.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          brief: s.brief ?? '',
          anchor_ids: s.anchor_ids ?? [],
        })),
        script_drafted_at: Math.floor(Date.now() / 1000),
        updated: new Date().toISOString().slice(0, 10),
      };
      saveFile(filePath, nextFm, newBody);
    }

    return c.json({ sections: results, script: fullScript });
  } catch (err: any) {
    console.error('draft-sectioned failed:', err);
    return c.json({ error: err?.message ?? 'draft failed' }, 500);
  }
});

// PATCH /:id/script/sections - persist the section structure (briefs + anchors)
// even before drafting, so the creator can come back and edit.
app.patch('/:id/script/sections', async (c) => {
  const id = c.req.param('id');
  const entry = findVideoEntry(id);
  if (!entry) return c.json({ error: 'video not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    | { sections?: Array<{ id: string; label: string; kind: SectionKind; brief?: string; anchor_ids: string[] }> }
    | null;
  if (!body?.sections) return c.json({ error: 'sections required' }, 400);

  const filePath = abs(entry.relPath);
  const fileEntry = loadFile(filePath);
  const nextFm = {
    ...(fileEntry?.frontmatter ?? {}),
    script_sections: body.sections,
    updated: new Date().toISOString().slice(0, 10),
  };
  saveFile(filePath, nextFm, fileEntry?.body ?? entry.body);
  return c.json({ ok: true });
});

// Mount the factory CRUD under the same root so /, /:id, etc. still work.
app.route('/', factoryApp);

export default app;
