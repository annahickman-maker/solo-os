/**
 * Clients - file-per-row at 08_Service/clients/<Name>/_client.md
 *
 * Each client lives where her deliverables already live - no separate
 * manifest file, no projects-and-clients.md to keep in sync. The folder
 * existing IS the client; the _client.md inside holds the metadata.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import {
  abs,
  archiveFile,
  loadFile,
  patchFile,
  saveFile,
  slugify,
  VAULT_ROOT,
} from '../vault.js';

const CLIENTS_DIR_REL = path.join('08_Service', 'clients');

type ClientFrontmatter = {
  id?: string;
  type: 'client';
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct: number;
  description?: string;
  created?: string;
  updated?: string;
  signed?: string;
};

type ClientResponse = {
  id: string;
  name: string;
  status: ClientFrontmatter['status'];
  progress_pct: number;
  description: string;
  signed?: string;
  notes: string; // body
  source_file: string;
  updated_at: number;
};

function clientPath(folderName: string): string {
  return abs(CLIENTS_DIR_REL, folderName, '_client.md');
}

function entryToClient(entry: ReturnType<typeof loadFile<ClientFrontmatter>>): ClientResponse | null {
  if (!entry) return null;
  const fm = entry.frontmatter;
  if (fm?.type !== 'client') return null;
  return {
    id: fm.id ?? `client-${slugify(fm.name ?? entry.id)}`,
    name: fm.name ?? entry.id,
    status: (fm.status as any) ?? 'in_progress',
    progress_pct: typeof fm.progress_pct === 'number' ? fm.progress_pct : 0,
    description: fm.description ?? '',
    signed: fm.signed,
    notes: entry.body.trim(),
    source_file: entry.relPath,
    updated_at: entry.mtimeSec,
  };
}

// Has this client folder ever had a _client.md? If yes (even if archived now),
// the absence of a current _client.md means it was intentionally deleted -
// don't resurrect via auto-discover.
function wasEverTracked(folderPath: string): boolean {
  const archiveDir = path.join(folderPath, '_archive');
  let archived: fs.Dirent[];
  try {
    archived = fs.readdirSync(archiveDir, { withFileTypes: true });
  } catch {
    return false;
  }
  return archived.some((f) => f.isFile() && f.name.endsWith('_client.md'));
}

function listClients(): ClientResponse[] {
  const dir = abs(CLIENTS_DIR_REL);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: ClientResponse[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const folderPath = path.join(dir, e.name);
    const clientFile = loadFile<ClientFrontmatter>(clientPath(e.name));
    if (clientFile) {
      const client = entryToClient(clientFile);
      if (client) out.push(client);
      continue;
    }
    // No _client.md. Two possibilities:
    //   1. Brand new folder (the creator created it in Obsidian) -> auto-discover
    //      so it just shows up on the dashboard. This was the Client B fix.
    //   2. Soft-deleted (an archived _client.md exists in _archive/) ->
    //      respect the delete, don't resurrect.
    if (wasEverTracked(folderPath)) continue;
    out.push({
      id: `client-${slugify(e.name)}`,
      name: e.name,
      status: 'in_progress',
      progress_pct: 0,
      description: `Auto-discovered from ${CLIENTS_DIR_REL}/${e.name}/. Add a _client.md to set status + notes, or edit on the dashboard.`,
      notes: '',
      source_file: path.join(CLIENTS_DIR_REL, e.name) + '/',
      updated_at: Math.floor(Date.now() / 1000),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Find any folders that exist but have no _client.md - useful for surfacing
// "you have folders that aren't being tracked, want to import them?" on the
// dashboard. NOT auto-included in the main list.
export function listUntrackedFolders(): string[] {
  const dir = abs(CLIENTS_DIR_REL);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (!loadFile(clientPath(e.name))) out.push(e.name);
  }
  return out;
}

const app = new Hono();

// GET /api/clients - list all clients
app.get('/', (c) => {
  return c.json({ clients: listClients() });
});

// GET /api/clients/:id - single client + deliverables in their folder
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const all = listClients();
  const client = all.find((c) => c.id === id);
  if (!client) return c.json({ error: 'not found' }, 404);

  // Drill into the client folder for deliverables (subfolders + files).
  const folderName = client.source_file
    .replace(/^08_Service\/clients\//, '')
    .replace(/\/$|\/_client\.md$/, '');
  const folder = path.join(VAULT_ROOT, CLIENTS_DIR_REL, folderName);
  const deliverables = scanDeliverables(folder, folderName);

  return c.json({ ...client, folder: folderName, deliverables });
});

// POST /api/clients - create a new client (dashboard "+ add client" button)
app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Partial<ClientFrontmatter> | null;
  if (!body?.name) return c.json({ error: 'name required' }, 400);
  const folderName = body.name.trim();
  const filePath = clientPath(folderName);
  if (loadFile(filePath)) return c.json({ error: 'client already exists' }, 409);
  const now = new Date().toISOString().slice(0, 10);
  const fm: ClientFrontmatter = {
    id: `client-${slugify(folderName)}`,
    type: 'client',
    name: folderName,
    status: body.status ?? 'in_progress',
    progress_pct: body.progress_pct ?? 0,
    description: body.description ?? '',
    signed: now,
    created: now,
    updated: now,
  };
  saveFile(
    filePath,
    fm,
    `# ${folderName}\n\nClient notes go here. Edit this file in Obsidian or via the dashboard.\n`
  );
  const created = entryToClient(loadFile<ClientFrontmatter>(filePath));
  return c.json(created, 201);
});

// PATCH /api/clients/:id - update fields (status, progress_pct, description)
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const all = listClients();
  const target = all.find((x) => x.id === id);
  if (!target) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as Partial<ClientFrontmatter> | null;
  if (!body) return c.json({ error: 'body required' }, 400);

  const folderName = target.source_file
    .replace(/^08_Service\/clients\//, '')
    .replace(/\/$|\/_client\.md$/, '');
  const filePath = clientPath(folderName);

  // Ensure the file exists (auto-discovered clients may not yet have one).
  const existing = loadFile<ClientFrontmatter>(filePath);
  const baseFm: ClientFrontmatter = existing?.frontmatter ?? {
    type: 'client',
    id: target.id,
    name: target.name,
    status: target.status,
    progress_pct: target.progress_pct,
    description: target.description,
  };

  const updated = new Date().toISOString().slice(0, 10);
  const patched = patchFile<ClientFrontmatter>(
    filePath,
    {
      ...baseFm,
      ...(body.status !== undefined && { status: body.status }),
      ...(body.progress_pct !== undefined && { progress_pct: body.progress_pct }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.name !== undefined && { name: body.name }),
      updated,
    },
    `# ${target.name}\n`
  );
  return c.json(entryToClient(patched));
});

// DELETE /api/clients/:id - archive the _client.md (soft delete, recoverable).
// Moves the metadata file to 08_Service/clients/<Name>/_archive/. The folder
// of deliverables (00_context, 01_research, etc) is untouched - your work
// stays put. Restore by dragging the file back out of _archive/.
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const all = listClients();
  const target = all.find((x) => x.id === id);
  if (!target) return c.json({ error: 'not found' }, 404);
  const folderName = target.source_file
    .replace(/^08_Service\/clients\//, '')
    .replace(/\/$|\/_client\.md$/, '');
  const archivedTo = archiveFile(clientPath(folderName));
  if (!archivedTo) return c.json({ error: 'failed to archive' }, 500);
  return c.json({
    ok: true,
    archived: true,
    archived_to: archivedTo.replace(VAULT_ROOT + '/', ''),
  });
});

// Scan a client folder for deliverables (subfolders treated as sections).
function scanDeliverables(folder: string, folderName: string) {
  const out: Array<{
    section: string;
    files: Array<{ name: string; relPath: string; mtimeSec: number }>;
  }> = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return out;
  }
  // Sort subfolders by name (00_context, 01_research, 02_strategy, ...)
  const subs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
  for (const sub of subs) {
    const subFull = path.join(folder, sub.name);
    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(subFull, { withFileTypes: true });
    } catch {
      continue;
    }
    const fileList = files
      .filter((f) => f.isFile() && !f.name.startsWith('.'))
      .map((f) => {
        const full = path.join(subFull, f.name);
        let mtimeSec = 0;
        try {
          mtimeSec = Math.floor(fs.statSync(full).mtimeMs / 1000);
        } catch {}
        return {
          name: f.name,
          relPath: path.join(CLIENTS_DIR_REL, folderName, sub.name, f.name),
          mtimeSec,
        };
      })
      .sort((a, b) => b.mtimeSec - a.mtimeSec);
    if (fileList.length > 0) {
      out.push({ section: sub.name, files: fileList });
    }
  }
  return out;
}

export default app;
