/**
 * SS Modules - alias route. The frontend hits /api/ss-modules/:id for both
 * project AND client edits (and /api/ss-modules POST for either). This
 * route just delegates to /api/clients or /api/projects based on the id
 * prefix or the kind in the body.
 *
 * Once the frontend is updated to call clients/projects directly, this
 * shim can be deleted.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { abs, archiveFile, loadCollection, loadFile, saveFile, slugify, VAULT_ROOT } from '../vault.js';

const CLIENTS_DIR_REL = path.join('08_Service', 'clients');
const PROJECTS_DIR_REL = path.join('00_System', 'projects');

const app = new Hono();

function clientFilePath(folderName: string): string {
  return abs(CLIENTS_DIR_REL, folderName, '_client.md');
}
function projectFilePath(id: string): string {
  return abs(PROJECTS_DIR_REL, `${id}.md`);
}

function isClientId(id: string): boolean {
  return id.startsWith('client-');
}

// Resolve a client id back to its folder name (the folder is named after the
// client's display name, not their id slug).
function clientFolderForId(id: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs(CLIENTS_DIR_REL), { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const entry = loadFile(clientFilePath(e.name));
    if (!entry) continue;
    if ((entry.frontmatter as any)?.id === id) return e.name;
  }
  return null;
}

// Find all tasks with frontmatter.project matching this id.
function linkedTasksFor(moduleId: string): any[] {
  return loadCollection('00_System/tasks', { type: 'task' })
    .filter((e) => (e.frontmatter as any)?.project === moduleId)
    .map((e) => {
      const fm = e.frontmatter as any;
      const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
      return {
        id: fm.id ?? e.id,
        title: titleMatch ? titleMatch[1] : e.id,
        status: fm.status ?? 'pending',
        category: fm.category ?? 'other',
        project_id: fm.project ?? null,
        // backlog flag drives the priority / backlog split in
        // ModuleDetail. Without this field the client filters every
        // task as priority and the backlog section stays empty.
        backlog: fm.backlog === true,
        // scheduled_day surfaces on the project panel too so the user
        // can see which scheduled day a priority task is on without
        // bouncing back to Focus.
        scheduled_day: fm.scheduled_day ?? null,
      };
    })
    .sort((a, b) => {
      const order = { in_progress: 0, pending: 1, completed: 2 } as Record<string, number>;
      return (order[a.status] ?? 99) - (order[b.status] ?? 99);
    });
}

// GET /api/ss-modules - list all (projects + clients combined).
// The Projects page reads from /api/pipeline; this is here so callers that
// hit ss-modules directly don't 404 after we kill the old backend.
app.get('/', (c) => {
  const items: any[] = [];
  // Projects (file-based)
  const projDir = abs('00_System', 'projects');
  try {
    for (const f of fs.readdirSync(projDir)) {
      if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('.')) continue;
      const entry = loadFile(path.join(projDir, f));
      if (!entry) continue;
      const fm = entry.frontmatter as any;
      items.push({
        id: fm.id ?? f.replace(/\.md$/, ''),
        name: fm.name ?? f.replace(/\.md$/, ''),
        kind: 'project',
        status: fm.status ?? 'planned',
        progress_pct: fm.progress_pct ?? 0,
        description: fm.description ?? '',
      });
    }
  } catch {}
  // Clients (via the clients folder)
  try {
    const clientsDir = abs(CLIENTS_DIR_REL);
    for (const folder of fs.readdirSync(clientsDir)) {
      const stat = fs.statSync(path.join(clientsDir, folder));
      if (!stat.isDirectory() || folder.startsWith('.') || folder.startsWith('_')) continue;
      const entry = loadFile(clientFilePath(folder));
      if (!entry) continue;
      const fm = entry.frontmatter as any;
      items.push({
        id: fm.id,
        name: fm.name,
        kind: 'client',
        status: fm.status,
        progress_pct: fm.progress_pct ?? 0,
        description: fm.description ?? '',
      });
    }
  } catch {}
  return c.json({ items });
});

// GET /api/ss-modules/:id
app.get('/:id', (c) => {
  const id = c.req.param('id');
  if (isClientId(id)) {
    const folder = clientFolderForId(id);
    if (!folder) return c.json({ error: 'not found' }, 404);
    const entry = loadFile(clientFilePath(folder));
    if (!entry) return c.json({ error: 'not found' }, 404);
    const fm = entry.frontmatter as any;
    return c.json({
      id: fm.id,
      name: fm.name,
      kind: 'client',
      status: fm.status,
      progress_pct: fm.progress_pct,
      description: fm.description ?? '',
      created_at: fm.created ?? null,
      updated_at: entry.mtimeSec,
      linked_tasks: linkedTasksFor(fm.id),
      linked_transcripts: [], // TODO: scan 08_Service/clients/<name>/04_transcripts/
    });
  }
  const entry = loadFile(projectFilePath(id));
  if (!entry) return c.json({ error: 'not found' }, 404);
  const fm = entry.frontmatter as any;
  return c.json({
    id: fm.id ?? id,
    name: fm.name ?? id,
    kind: 'project',
    status: fm.status ?? 'planned',
    progress_pct: fm.progress_pct ?? 0,
    description: fm.description ?? '',
    created_at: fm.created ?? null,
    updated_at: entry.mtimeSec,
    linked_tasks: linkedTasksFor(fm.id ?? id),
    linked_transcripts: [],
  });
});

// POST /api/ss-modules { name, kind, description?, status? }
app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { name: string; kind: 'project' | 'client'; description?: string; status?: string }
    | null;
  if (!body?.name || !body?.kind) return c.json({ error: 'name and kind required' }, 400);
  const today = new Date().toISOString().slice(0, 10);

  if (body.kind === 'client') {
    const folderName = body.name.trim();
    const filePath = clientFilePath(folderName);
    if (loadFile(filePath)) return c.json({ error: 'client already exists' }, 409);
    const id = `client-${slugify(folderName)}`;
    const fm = {
      id,
      type: 'client' as const,
      name: folderName,
      status: (body.status as any) ?? 'in_progress',
      progress_pct: 0,
      description: body.description ?? '',
      signed: today,
      created: today,
      updated: today,
    };
    saveFile(filePath, fm, `# ${folderName}\n${body.description ? `\n${body.description}\n` : ''}`);
    return c.json({ id, name: folderName, kind: 'client', status: fm.status, progress_pct: 0, description: fm.description }, 201);
  }

  const id = `proj-${slugify(body.name)}`;
  const fm = {
    id,
    type: 'project' as const,
    name: body.name,
    status: (body.status as any) ?? 'planned',
    progress_pct: 0,
    description: body.description ?? '',
    created: today,
    updated: today,
  };
  saveFile(projectFilePath(id), fm, `# ${body.name}\n${body.description ? `\n${body.description}\n` : ''}`);
  return c.json({ id, name: body.name, kind: 'project', status: fm.status, progress_pct: 0, description: fm.description }, 201);
});

// PATCH /api/ss-modules/:id
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return c.json({ error: 'body required' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const patchable = ['name', 'description', 'status', 'progress_pct'];
  const patch: Record<string, any> = { updated: today };
  for (const k of patchable) if (body[k] !== undefined) patch[k] = body[k];

  let filePath: string;
  if (isClientId(id)) {
    const folder = clientFolderForId(id);
    if (!folder) return c.json({ error: 'not found' }, 404);
    filePath = clientFilePath(folder);
  } else {
    filePath = projectFilePath(id);
  }
  const existing = loadFile(filePath);
  if (!existing) return c.json({ error: 'not found' }, 404);
  const fm = { ...(existing.frontmatter as Record<string, any>), ...patch };
  let bodyText = existing.body;
  if (body.name !== undefined) bodyText = `# ${body.name}\n${existing.body.replace(/^#\s+.+?\n/, '')}`;
  saveFile(filePath, fm, bodyText);
  const updated = loadFile(filePath);
  if (!updated) return c.json({ error: 'unreadable after save' }, 500);
  const ufm = updated.frontmatter as any;
  return c.json({
    id: ufm.id ?? id,
    name: ufm.name ?? id,
    kind: isClientId(id) ? 'client' : 'project',
    status: ufm.status,
    progress_pct: ufm.progress_pct ?? 0,
    description: ufm.description ?? '',
    updated_at: updated.mtimeSec,
  });
});

// DELETE /api/ss-modules/:id - archive
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  let filePath: string;
  if (isClientId(id)) {
    const folder = clientFolderForId(id);
    if (!folder) return c.json({ error: 'not found' }, 404);
    filePath = clientFilePath(folder);
  } else {
    filePath = projectFilePath(id);
  }
  if (!loadFile(filePath)) return c.json({ error: 'not found' }, 404);
  const archived = archiveFile(filePath);
  if (!archived) return c.json({ error: 'failed to archive' }, 500);
  return c.json({
    ok: true,
    archived: true,
    archived_to: archived.replace(VAULT_ROOT + '/', ''),
  });
});

export default app;
