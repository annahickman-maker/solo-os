/**
 * Factory for a standard "file-per-row" CRUD route.
 *
 * Most entities follow the same pattern: each is a markdown file with
 * frontmatter + body. List = read the folder. Create = write a new file.
 * Patch = edit frontmatter. Delete = archive.
 *
 * Each entity-specific route just declares: folder path, type tag,
 * frontmatter shape, optional projection for the list response. Everything
 * else is mechanical.
 */

import { Hono } from 'hono';
import path from 'node:path';
import {
  abs,
  archiveFile,
  loadCollection,
  loadFile,
  saveFile,
  slugify,
  VAULT_ROOT,
  type Entry,
} from '../vault.js';

export type FileRouteConfig<F extends Record<string, unknown>, R> = {
  /** Vault-relative folder where files live (e.g. '00_System/projects'). */
  folder: string;
  /** Frontmatter `type` field that identifies entries belonging to this route. */
  type: string;
  /** Subfolder recursion */
  recursive?: boolean;
  /** Project a loaded file into the API response shape. */
  toResponse: (entry: Entry<F>) => R | null;
  /** Build a new file's frontmatter + body from POST body. */
  fromCreate: (body: any) => { id: string; frontmatter: F; body: string } | null;
  /** Apply a PATCH body to existing frontmatter + body. Returns updated values. */
  applyPatch?: (
    entry: Entry<F>,
    body: any
  ) => { frontmatter: F; body: string };
  /** Filter list results from a query param map. */
  applyFilters?: (items: R[], query: Record<string, string | undefined>) => R[];
  /** Sort comparator. Defaults to no sort. */
  sort?: (a: R, b: R) => number;
};

export function createFileRoute<F extends Record<string, unknown>, R>(
  config: FileRouteConfig<F, R>
) {
  const app = new Hono();
  // Two-step lookup:
  //   1. canonical: <folder>/<id>.md (matches files created via POST or
  //      migration scripts that use the id as filename)
  //   2. fallback: scan the collection for an entry whose frontmatter id
  //      matches. This covers legacy filenames (eg. `project_X.md` with
  //      `id: video-X` in frontmatter).
  const fileById = (id: string) => {
    const canonical = abs(config.folder, `${id}.md`);
    if (loadFile(canonical)) return canonical;
    const found = loadCollection<F>(config.folder, { type: config.type })
      .find((e) => (e.frontmatter as any)?.id === id || e.id === id);
    return found ? found.path : canonical;
  };

  const list = (): R[] => {
    return loadCollection<F>(config.folder, { type: config.type, recursive: !!config.recursive })
      .map(config.toResponse)
      .filter((r): r is R => r !== null);
  };

  app.get('/', (c) => {
    let items = list();
    if (config.applyFilters) {
      const q: Record<string, string | undefined> = {};
      // c.req.queries() in some Hono versions; fall back to query() per known keys
      const url = new URL(c.req.url);
      url.searchParams.forEach((v, k) => (q[k] = v));
      items = config.applyFilters(items, q);
    }
    if (config.sort) items.sort(config.sort);
    return c.json({ items, count: items.length });
  });

  app.get('/:id', (c) => {
    const id = c.req.param('id');
    const entry = loadFile<F>(fileById(id));
    if (!entry) return c.json({ error: 'not found' }, 404);
    const projected = config.toResponse(entry);
    if (!projected) return c.json({ error: 'not found' }, 404);
    return c.json(projected);
  });

  app.post('/', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'body required' }, 400);
    const built = config.fromCreate(body);
    if (!built) return c.json({ error: 'invalid body' }, 400);
    // Ensure id isn't already taken; suffix if needed.
    let id = built.id;
    let n = 2;
    while (loadFile(fileById(id))) {
      id = `${built.id}-${n++}`;
    }
    saveFile(fileById(id), { ...built.frontmatter, id }, built.body);
    const entry = loadFile<F>(fileById(id));
    return c.json(entry ? config.toResponse(entry) : null, 201);
  });

  app.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const entry = loadFile<F>(fileById(id));
    if (!entry) return c.json({ error: 'not found' }, 404);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ error: 'body required' }, 400);
    if (!config.applyPatch) return c.json({ error: 'patch not supported' }, 405);
    const { frontmatter, body: newBody } = config.applyPatch(entry, body);
    saveFile(fileById(id), frontmatter as Record<string, unknown>, newBody);
    const updated = loadFile<F>(fileById(id));
    return c.json(updated ? config.toResponse(updated) : null);
  });

  app.delete('/:id', (c) => {
    const id = c.req.param('id');
    if (!loadFile(fileById(id))) return c.json({ error: 'not found' }, 404);
    const archivedTo = archiveFile(fileById(id));
    if (!archivedTo) return c.json({ error: 'failed to archive' }, 500);
    return c.json({
      ok: true,
      archived: true,
      archived_to: archivedTo.replace(VAULT_ROOT + '/', ''),
    });
  });

  return app;
}

// Helpers individual routes can use.
export { slugify, abs, loadFile, loadCollection, type Entry };
export const todayISO = () => new Date().toISOString().slice(0, 10);
export function ridOf(folderName: string): string {
  return path.basename(folderName).replace(/\.md$/, '');
}
