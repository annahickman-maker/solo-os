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

// ─── source 2: Q&A transcripts ────────────────────────────────────────────
function parseQaTranscripts(): InboxItem[] {
  const dir = abs('05_Assets', 'Transcripts', 'QA-Calls');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const items: InboxItem[] = [];
  for (const filename of entries) {
    if (!filename.endsWith('.md')) continue;
    if (filename.startsWith('_') || filename.startsWith('.')) continue;
    const full = path.join(dir, filename);
    let raw: string;
    try {
      raw = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    // Date from filename: skool-qa_YYYY-MM-DD.md or skool-qa-post_YYYY-MM-DD.md
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1]! : null;
    // The "post" body lives between '## Community Post' / '## Post' heading and the next ##
    let body = raw;
    const postMatch = raw.match(/##\s+(Community Post|Post)\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (postMatch) body = postMatch[2]!.trim();
    const titleSuffix = dateStr
      ? new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : filename.replace(/\.md$/, '');
    const id = `inbox-qa-${slugify(filename.replace(/\.md$/, ''))}`;
    items.push({
      id,
      source: 'zoom_transcript',
      title: `Skool Q&A - ${titleSuffix}`,
      body: body.slice(0, 4000),
      status: 'pending',
      link: null,
      source_file: path.join('05_Assets', 'Transcripts', 'QA-Calls', filename),
      created_at: dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : 0,
    });
  }
  return items;
}

function listInbox(): InboxItem[] {
  const dismissed = dismissedIds();
  const all = [...parseSkoolReplyDrafts(), ...parseQaTranscripts()];
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
