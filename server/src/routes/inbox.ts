/**
 * Inbox - hybrid pattern (because inbox items aren't full entities, they're
 * notifications derived from other vault content).
 *
 * Sources:
 *   - 03_Projects/skool-replies/skool-reply-drafts.md (legacy, blocks per reply)
 *   - 05_Assets/Transcripts/QA-Calls/qa_*.md (per Q&A call, post-section in body)
 *
 * State:
 *   - 00_System/inbox/_archive/<id>.md = marker file. Empty content. Just
 *     existing means "the creator dismissed this." Marker file persists across
 *     re-scans, so dismissed items never resurface.
 *
 * UX:
 *   - GET /api/inbox       lists pending (sources minus dismissed)
 *   - PATCH /:id           noop today (kept for shape; status is binary)
 *   - DELETE /:id          create the archive marker (permanently dismissed)
 *   - POST /:id/restore    delete the marker (item comes back)
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs, slugify, VAULT_ROOT } from '../vault.js';

const ARCHIVE_DIR_REL = path.join('00_System', 'inbox', '_archive');

// Matches the frontend's InboxItem type exactly so the existing UI renders
// without a transform layer.
type InboxItem = {
  id: string;
  source: 'skool_reply' | 'zoom_transcript' | 'flagged_review' | 'manual';
  title: string;
  body: string;
  status: 'pending' | 'done' | 'dismissed';
  link: string | null;
  source_file: string;
  created_at: number; // unix seconds
};

function archivePath(id: string): string {
  return abs(ARCHIVE_DIR_REL, `${id}.md`);
}
function isDismissed(id: string): boolean {
  return fs.existsSync(archivePath(id));
}
function dismissedIds(): Set<string> {
  try {
    return new Set(
      fs
        .readdirSync(abs(ARCHIVE_DIR_REL))
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
    );
  } catch {
    return new Set();
  }
}

// ─── source 1: skool-reply-drafts.md (legacy) ─────────────────────────────
function parseSkoolReplyDrafts(): InboxItem[] {
  const file = abs('03_Projects', 'skool-replies', 'skool-reply-drafts.md');
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const items: InboxItem[] = [];
  const blocks = raw.split(/\n---\n/);
  for (const block of blocks) {
    const headingMatch = block.match(/^##\s+(.+?)\s*$/m);
    if (!headingMatch) continue;
    const heading = headingMatch[1]!.trim();
    const statusMatch = block.match(/\*\*Status:\*\*\s*(\w+)/i);
    const status = statusMatch ? statusMatch[1]!.toUpperCase() : 'PENDING';
    if (status !== 'PENDING') continue;
    const threadMatch = block.match(/\*\*Thread:\*\*\s*(\S+)/i);
    const link = threadMatch ? threadMatch[1]!.trim() : null;
    const commentMatch = block.match(/\*\*Their comments?:\*\*\s*([\s\S]+?)\n\*\*Status:/i);
    const comment = commentMatch ? commentMatch[1]!.trim() : '';
    const draftMatch = block.match(/\*\*Draft:\*\*\s*([\s\S]+?)$/);
    const draft = draftMatch ? draftMatch[1]!.trim() : '';
    const id = `inbox-skool-reply-${slugify(heading)}`;
    // Try to extract a date from the heading (e.g., "2026-04-09 - Robert ...")
    const headingDate = heading.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    items.push({
      id,
      source: 'skool_reply',
      title: heading,
      body: `**Their comment:** ${comment}\n\n**Your draft:**\n\n${draft}`,
      status: 'pending',
      link,
      source_file: '03_Projects/skool-replies/skool-reply-drafts.md',
      created_at: headingDate ? Math.floor(new Date(headingDate).getTime() / 1000) : 0,
    });
  }
  return items;
}

// Parse a YYYY-MM-DD string as midnight in LOCAL time, not UTC. The default
// `new Date('2026-06-18')` parses as 2026-06-18T00:00:00Z, which for a
// Pacific-time user is 2026-06-17 17:00:00, so .toLocaleDateString renders
// the wrong day. Splitting and using the (year, monthIdx, day) constructor
// pins it to local midnight.
function parseYmdLocal(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// ─── source 2: Zoom transcripts ───────────────────────────────────────────
// Surfaces every transcript dropped by the dashboard's Zoom sync. One inbox
// item per transcript file across all four category folders. Dismissing an
// item writes the standard archive marker - the transcript file itself stays
// in the vault and shows up on the Vault page; only the inbox notification
// is suppressed.
const ZOOM_TRANSCRIPT_DIRS: Array<{ rel: string[]; category_label: string }> = [
  { rel: ['05_Assets', 'Transcripts', 'Untagged'], category_label: 'Zoom call' },
  { rel: ['05_Assets', 'Transcripts', 'QA-Calls'], category_label: 'Q&A call' },
  { rel: ['05_Assets', 'Transcripts', 'Live-Workshops'], category_label: 'Live workshop' },
  { rel: ['05_Assets', 'Transcripts', 'Client-Calls'], category_label: 'Client call' },
];

function parseZoomTranscripts(): InboxItem[] {
  const items: InboxItem[] = [];
  for (const folder of ZOOM_TRANSCRIPT_DIRS) {
    const dir = abs(...folder.rel);
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const filename of entries) {
      // Inbox only surfaces SUMMARY files, never raw transcripts. Raw transcripts
      // sit in the same folder for the Vault page to surface; the inbox is for
      // the digest of the call, not the verbatim text.
      if (!filename.endsWith('_summary.md')) continue;
      if (filename.startsWith('_') || filename.startsWith('.')) continue;
      const full = path.join(dir, filename);
      let raw: string;
      try {
        raw = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      // Strip the YAML frontmatter from the body preview - the user sees the
      // overview + key points, not the metadata block.
      let body = raw;
      const fmEnd = raw.indexOf('\n---\n', 4);
      if (raw.startsWith('---\n') && fmEnd > 0) body = raw.slice(fmEnd + 5);
      // Pull topic out of frontmatter for a richer title than the filename.
      const topicMatch = raw.match(/^topic:\s*"?([^"\n]+)"?\s*$/m);
      const topic = topicMatch?.[1]?.trim() ?? null;
      // Date: prefer the source-transcript's filename (which has the recording
      // date), fall back to any YYYY-MM-DD slug embedded in the summary file.
      const filenameDateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = filenameDateMatch?.[1] ?? null;
      const dateAsLocal = dateStr ? parseYmdLocal(dateStr) : null;
      const titleSuffix = dateAsLocal
        ? dateAsLocal.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : filename.replace(/_summary\.md$/, '');
      const labelTopic = topic ?? folder.category_label;
      const id = `inbox-zoom-${slugify(filename.replace(/_summary\.md$/, ''))}`;
      items.push({
        id,
        source: 'zoom_transcript',
        title: `${folder.category_label} - ${labelTopic}${topic ? ` (${titleSuffix})` : ` - ${titleSuffix}`}`,
        body: body.trim().slice(0, 4000),
        status: 'pending',
        link: null,
        source_file: path.join(...folder.rel, filename),
        created_at: dateAsLocal ? Math.floor(dateAsLocal.getTime() / 1000) : 0,
      });
    }
  }
  return items;
}

function listInbox(): InboxItem[] {
  const dismissed = dismissedIds();
  const all = [...parseSkoolReplyDrafts(), ...parseZoomTranscripts()];
  return all
    .filter((it) => !dismissed.has(it.id))
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

const app = new Hono();

app.get('/', (c) => {
  const items = listInbox();
  return c.json({ items, count: items.length });
});

app.get('/:id', (c) => {
  const id = c.req.param('id');
  if (isDismissed(id)) return c.json({ error: 'dismissed', archived: true }, 404);
  const item = listInbox().find((x) => x.id === id);
  if (!item) return c.json({ error: 'not found' }, 404);
  return c.json(item);
});

// DELETE = dismiss (creates the marker)
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const markerPath = archivePath(id);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const now = new Date().toISOString();
  fs.writeFileSync(
    markerPath,
    `---\ndismissed_at: '${now}'\noriginal_id: ${id}\n---\n# Dismissed\n\nDelete this file to bring the inbox item back.\n`
  );
  return c.json({
    ok: true,
    archived: true,
    archived_to: markerPath.replace(VAULT_ROOT + '/', ''),
  });
});

// PATCH - kept for shape (set status), but really it's binary: pending or dismissed.
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
  if (body?.status === 'done' || body?.status === 'dismissed') {
    // Same as DELETE - just dismiss it.
    const markerPath = archivePath(id);
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      markerPath,
      `---\ndismissed_at: '${now}'\noriginal_id: ${id}\nstatus: ${body.status}\n---\n# ${body.status}\n`
    );
    return c.json({ ok: true, archived: true });
  }
  if (body?.status === 'pending') {
    // Restore - remove the marker if present.
    try {
      fs.unlinkSync(archivePath(id));
    } catch {}
    return c.json({ ok: true, restored: true });
  }
  return c.json({ error: 'unknown status' }, 400);
});

// Explicit restore endpoint
app.post('/:id/restore', (c) => {
  const id = c.req.param('id');
  try {
    fs.unlinkSync(archivePath(id));
    return c.json({ ok: true, restored: true });
  } catch {
    return c.json({ error: 'no marker to restore' }, 404);
  }
});

export default app;
