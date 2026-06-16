/**
 * YouTube transcript vault - one .md file per video at:
 *   05_Assets/Transcripts/YouTube-Videos/<slug>.md
 *
 * Each file is the single source of truth for that video's transcript. The
 * dashboard's per-video flow links the active transcript via the video
 * frontmatter `transcript_path` (vault-relative). The description generator
 * reads from this linked file when no inline transcript is dropped.
 *
 * Matching rules used by `findForVideo`:
 *   1. video has `transcript_path` AND that file exists → 'linked'
 *   2. video has `youtube_id` AND a vault transcript carries the same
 *      youtube_id (in frontmatter OR in the body `**URL:**` line) → 'detected'
 *   3. video's title slug matches a vault transcript filename → 'detected'
 *
 * Existing historical files (without frontmatter) are still pickable - they
 * read fine because the body always starts with `# <title>` and the URL line
 * gives us the youtube_id when present.
 */

import fs from 'node:fs';
import path from 'node:path';
import { abs, loadFile, saveFile, slugify, VAULT_ROOT } from '../vault.js';

export const TRANSCRIPT_DIR_REL = path.join('05_Assets', 'Transcripts', 'YouTube-Videos');

export type TranscriptFile = {
  // Path relative to VAULT_ROOT (e.g. 05_Assets/Transcripts/YouTube-Videos/foo.md)
  relPath: string;
  filename: string;
  slug: string;
  title: string;
  youtube_id: string | null;
  youtube_url: string | null;
  // Wallclock of the file's last mtime, for sorting newest-first.
  mtime: number;
};

export type TranscriptWithBody = TranscriptFile & {
  // The transcript text - the part under `## Transcript`, or the body after
  // the H1 if there's no Transcript heading.
  text: string;
};

function ensureDir(): void {
  const dir = abs(TRANSCRIPT_DIR_REL);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function extractYoutubeIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // matches v=<id>, /shorts/<id>, /embed/<id>, youtu.be/<id>
  const m = url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{8,15})/);
  return m?.[1] ?? null;
}

function readMeta(absPath: string, rel: string, filename: string): TranscriptFile | null {
  let entry;
  try {
    entry = loadFile(absPath);
  } catch {
    return null;
  }
  if (!entry) return null;
  const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
  const body = entry.body ?? '';
  // Title: frontmatter title > first H1 in body > filename slug
  const h1Match = body.match(/^#\s+(.+?)\s*$/m);
  const title = (typeof fm.title === 'string' && fm.title.trim())
    || (typeof fm.aliases === 'object' && Array.isArray(fm.aliases) && typeof fm.aliases[0] === 'string' && fm.aliases[0].trim())
    || (h1Match?.[1] ?? filename.replace(/\.md$/, '').replace(/-/g, ' '));
  // youtube_id: frontmatter > URL in body
  const fmId = typeof fm.youtube_id === 'string' ? fm.youtube_id : null;
  const fmUrl = typeof fm.youtube_url === 'string' ? fm.youtube_url : null;
  const urlMatch = body.match(/\*\*URL:\*\*\s*(https?:\S+)/i);
  const bodyUrl = urlMatch?.[1] ?? null;
  const youtube_url = fmUrl ?? bodyUrl;
  const youtube_id = fmId ?? extractYoutubeIdFromUrl(youtube_url);
  const slug = typeof fm.slug === 'string' ? fm.slug : filename.replace(/\.md$/, '');
  let mtime = 0;
  try { mtime = Math.floor(fs.statSync(absPath).mtimeMs); } catch { /* noop */ }
  return {
    relPath: rel,
    filename,
    slug,
    title: String(title).trim(),
    youtube_id,
    youtube_url,
    mtime,
  };
}

function extractTranscriptText(body: string): string {
  // Prefer the explicit ## Transcript section.
  const m = body.match(/##\s+Transcript\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  if (m && m[1]) return m[1].trim();
  // Fall back to everything after the H1 (and any `**URL:**` / `**Published:**` lines).
  let rest = body.replace(/^#\s+[^\n]*\n?/, '');
  rest = rest.replace(/^\s*\*\*[A-Za-z]+:\*\*[^\n]*\n?/gm, '');
  rest = rest.replace(/^\s*-{3,}\s*$/gm, '');
  return rest.trim();
}

export function listAll(): TranscriptFile[] {
  ensureDir();
  const dir = abs(TRANSCRIPT_DIR_REL);
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: TranscriptFile[] = [];
  for (const filename of entries) {
    if (!filename.endsWith('.md') || filename.startsWith('_') || filename.startsWith('.')) continue;
    const absPath = path.join(dir, filename);
    const rel = path.join(TRANSCRIPT_DIR_REL, filename);
    const meta = readMeta(absPath, rel, filename);
    if (meta) out.push(meta);
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export function readByRelPath(relPath: string): TranscriptWithBody | null {
  // Guard against any path that would escape the transcripts folder.
  const norm = path.normalize(relPath);
  if (!norm.startsWith(TRANSCRIPT_DIR_REL)) return null;
  const absPath = abs(norm);
  if (!fs.existsSync(absPath)) return null;
  const filename = path.basename(absPath);
  const meta = readMeta(absPath, norm, filename);
  if (!meta) return null;
  const entry = loadFile(absPath);
  const text = extractTranscriptText(entry?.body ?? '');
  return { ...meta, text };
}

/**
 * Find the best-matching transcript for a video. Source flag tells the UI
 * whether the link is explicit (the creator already wired it) or auto-detected
 * (we're guessing - the picker should confirm).
 */
export function findForVideo(args: {
  videoTranscriptPath: string | null;
  videoYoutubeId: string | null;
  videoTitle: string | null;
}): { match: TranscriptFile | null; source: 'linked' | 'detected' | null } {
  // 1. Explicit link wins.
  if (args.videoTranscriptPath) {
    const norm = path.normalize(args.videoTranscriptPath);
    if (norm.startsWith(TRANSCRIPT_DIR_REL)) {
      const absPath = abs(norm);
      if (fs.existsSync(absPath)) {
        const filename = path.basename(absPath);
        const meta = readMeta(absPath, norm, filename);
        if (meta) return { match: meta, source: 'linked' };
      }
    }
  }
  const all = listAll();
  // 2. Match by youtube_id.
  if (args.videoYoutubeId) {
    const m = all.find((f) => f.youtube_id === args.videoYoutubeId);
    if (m) return { match: m, source: 'detected' };
  }
  // 3. Match by slug.
  if (args.videoTitle) {
    const wantSlug = slugify(args.videoTitle);
    if (wantSlug) {
      const m = all.find((f) => f.slug === wantSlug);
      if (m) return { match: m, source: 'detected' };
    }
  }
  return { match: null, source: null };
}

/**
 * Save an uploaded transcript to the vault, returning the relative path.
 * If a file with the same slug already exists for a DIFFERENT youtube_id,
 * we suffix the slug to avoid clobbering. Same youtube_id → overwrite (we
 * treat the latest upload as canonical).
 */
export function saveTranscript(args: {
  videoTitle: string;
  youtubeId: string | null;
  youtubeUrl: string | null;
  text: string;
  // Original filename of the upload, used only for the `imported_from` hint.
  originalFilename: string | null;
}): { relPath: string; created: boolean } {
  ensureDir();
  const dir = abs(TRANSCRIPT_DIR_REL);
  const baseSlug = slugify(args.videoTitle || 'youtube-transcript') || 'youtube-transcript';
  let slug = baseSlug;
  let filename = `${slug}.md`;
  let absPath = path.join(dir, filename);
  // If the file exists and was clearly written for a different video,
  // disambiguate. We treat "different video" as "frontmatter youtube_id is
  // set AND differs from ours". Same id → overwrite. No id on the existing
  // file → also overwrite (the user is probably attaching the right transcript
  // to that historic file).
  if (fs.existsSync(absPath) && args.youtubeId) {
    const existing = readMeta(absPath, path.join(TRANSCRIPT_DIR_REL, filename), filename);
    if (existing?.youtube_id && existing.youtube_id !== args.youtubeId) {
      const suffix = args.youtubeId.slice(0, 6).toLowerCase();
      slug = `${baseSlug}-${suffix}`;
      filename = `${slug}.md`;
      absPath = path.join(dir, filename);
    }
  }
  const created = !fs.existsSync(absPath);
  const fm: Record<string, unknown> = {
    type: 'asset',
    slug,
    status: 'active',
    tags: ['type/asset', 'domain/youtube', 'source/transcript'],
    aliases: [args.videoTitle],
    title: args.videoTitle,
    source: 'youtube',
    imported_at: new Date().toISOString(),
  };
  if (args.youtubeId) fm.youtube_id = args.youtubeId;
  if (args.youtubeUrl) fm.youtube_url = args.youtubeUrl;
  if (args.originalFilename) fm.imported_from = args.originalFilename;
  const urlLine = args.youtubeUrl ? `**URL:** ${args.youtubeUrl}\n\n` : '';
  const body = [
    `# ${args.videoTitle}`,
    '',
    urlLine.trim(),
    urlLine ? '---' : '',
    urlLine ? '' : '',
    '## Transcript',
    '',
    args.text.trim(),
    '',
  ].filter((s, i, a) => !(s === '' && a[i - 1] === '')).join('\n');
  saveFile(absPath, fm, body);
  return { relPath: path.join(TRANSCRIPT_DIR_REL, filename), created };
}

export function relIsTranscript(relPath: string): boolean {
  const n = path.normalize(relPath);
  return n.startsWith(TRANSCRIPT_DIR_REL) && n.endsWith('.md');
}

// Re-exported so call sites don't need to import VAULT_ROOT just for type help.
export const VAULT_ROOT_EXPORT = VAULT_ROOT;
