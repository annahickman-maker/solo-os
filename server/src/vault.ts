/**
 * Vault storage layer - the heart of the Phase 2 architecture.
 *
 * Every entity the dashboard tracks (tasks, clients, projects, videos, POVs,
 * goals, products) lives as a markdown file with YAML frontmatter.
 *
 *   The file path is the identity. Rename a title - id stays.
 *   The frontmatter is the structured data. JSON-parseable.
 *   The body is the human-readable prose. Title + notes.
 *   File exists -> row exists. Delete file -> delete row. No tombstones.
 *
 * The dashboard routes use these helpers instead of SQL queries. The whole
 * sync system, PRESERVE_ON_UPSERT allowlist, tombstone tables, mtime games,
 * and pullback functions are no longer needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const VAULT_ROOT =
  process.env.VAULT_ROOT ?? path.resolve(__dirname, '..', '..', '..', 'sample-vault');

export type Entry<T = Record<string, unknown>> = {
  id: string; // derived from filename
  path: string; // absolute path
  relPath: string; // relative to VAULT_ROOT
  frontmatter: T;
  body: string;
  mtimeSec: number;
};

/**
 * Load a single .md file. Returns null if missing.
 */
export function loadFile<T = Record<string, unknown>>(absPath: string): Entry<T> | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const raw = fs.readFileSync(absPath, 'utf8');
  const parsed = matter(raw);
  const id = path.basename(absPath, '.md');
  return {
    id,
    path: absPath,
    relPath: path.relative(VAULT_ROOT, absPath),
    frontmatter: parsed.data as T,
    body: parsed.content,
    mtimeSec: Math.floor(stat.mtimeMs / 1000),
  };
}

/**
 * Load every .md file in a folder (one level deep). Skips files starting
 * with `.` or `_` and any `_archive` / `archive` subfolders.
 *
 * Useful for "give me all tasks" / "give me all clients" calls.
 */
export function loadCollection<T = Record<string, unknown>>(
  folderRelPath: string,
  opts?: {
    /** Filter to entries whose frontmatter.type matches (e.g. 'task') */
    type?: string;
    /** Filter callback */
    filter?: (entry: Entry<T>) => boolean;
    /** Recurse into subfolders */
    recursive?: boolean;
  }
): Entry<T>[] {
  const dir = path.isAbsolute(folderRelPath)
    ? folderRelPath
    : path.join(VAULT_ROOT, folderRelPath);
  return walk<T>(dir, opts?.recursive ?? false)
    .filter((e) => !opts?.type || (e.frontmatter as any)?.type === opts.type)
    .filter((e) => !opts?.filter || opts.filter(e));
}

function walk<T>(dir: string, recursive: boolean): Entry<T>[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Entry<T>[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    if (e.name === 'node_modules' || e.name.toLowerCase() === 'archive') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...walk<T>(full, true));
      continue;
    }
    if (!e.name.endsWith('.md')) continue;
    const loaded = loadFile<T>(full);
    if (loaded) out.push(loaded);
  }
  return out;
}

/**
 * Save (create or overwrite) a single file. Frontmatter is written as YAML,
 * body as plain markdown.
 *
 * Atomic: writes to a tmp file, then renames. Safe under concurrent reads.
 */
export function saveFile(
  absPath: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  const tmp = absPath + '.tmp-' + Date.now();
  const content = matter.stringify(body, frontmatter);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, absPath);
}

/**
 * Patch a file - load, mutate frontmatter, save. Returns the new Entry.
 * If the file doesn't exist, creates it with the given frontmatter + body.
 */
export function patchFile<T extends Record<string, unknown>>(
  absPath: string,
  patch: Partial<T>,
  bodyIfNew?: string
): Entry<T> {
  const existing = loadFile<T>(absPath);
  if (existing) {
    const nextFrontmatter = { ...existing.frontmatter, ...patch };
    saveFile(absPath, nextFrontmatter as Record<string, unknown>, existing.body);
  } else {
    saveFile(absPath, patch as Record<string, unknown>, bodyIfNew ?? '');
  }
  const loaded = loadFile<T>(absPath);
  if (!loaded) throw new Error(`saved but couldn't reload: ${absPath}`);
  return loaded;
}

/**
 * Soft-delete a file. Moves it to an `_archive/` folder sibling to its
 * parent, NOT `fs.unlink`. Recoverable: re-open the vault folder, drag the
 * file out of _archive/, dashboard sees it again on next read.
 *
 * loadCollection() skips folders starting with `_`, so archived files
 * disappear from the dashboard but stay on disk + in git.
 *
 * Returns the new archived path (or null if source missing).
 */
export function archiveFile(absPath: string): string | null {
  try {
    const dir = path.dirname(absPath);
    const archiveDir = path.join(dir, '_archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const base = path.basename(absPath);
    // Stamp the archived filename so multiple archive cycles don't clash.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archivedPath = path.join(archiveDir, `${stamp}__${base}`);
    fs.renameSync(absPath, archivedPath);
    return archivedPath;
  } catch {
    return null;
  }
}

/**
 * Hard delete - actually removes the file. Use sparingly. Most dashboard
 * deletes should go through archiveFile() so they're recoverable.
 */
export function deleteFileHard(absPath: string): boolean {
  try {
    fs.unlinkSync(absPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @deprecated use archiveFile() for dashboard deletes, deleteFileHard() for
 * intentional hard removes. Kept as alias for backwards compat - default
 * behavior now archives.
 */
export function deleteFile(absPath: string): boolean {
  return archiveFile(absPath) !== null;
}

/**
 * Generate a stable filename slug from a title. Used when creating new
 * entries via the dashboard - the filename becomes the ID forever.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

export function abs(...parts: string[]): string {
  return path.join(VAULT_ROOT, ...parts);
}
