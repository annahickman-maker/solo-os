/**
 * Client decks - in-browser editor + one-click publish to Cloudflare Pages.
 *
 * Each deck is a self-contained HTML file at
 *   08_Service/clients/<client>/02_strategy/strategy-deck.html
 *
 * Routes:
 *   GET  /api/decks                 list every deck + last-published URL
 *   GET  /api/decks/file            serve a deck's HTML for in-browser editing
 *                                   (accepts ?pw= so a new tab can authenticate
 *                                   without a custom header)
 *   POST /api/decks/save            overwrite the deck's HTML in the vault with
 *                                   the baked version from the editor
 *   POST /api/decks/publish         strip the edit toolbar + contenteditable
 *                                   attrs, deploy all decks together to the
 *                                   Cloudflare Pages project, return the URL
 *
 * Cloudflare Pages project: the creator-client-decks (created on first publish).
 * Custom domain: decks.yourdomain.com - attach once via CF dashboard.
 * Wrangler auth comes from ~/.wrangler/config/default.toml (already present).
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { abs, VAULT_ROOT } from '../vault.js';

const CLIENTS_DIR = abs('08_Service', 'clients');
const TEMPLATES_DIR = abs('02_Skills', 'templates');

const ALLOWED_TEMPLATES: Record<string, string> = {
  // template id -> template file path relative to TEMPLATES_DIR
  'strategy-deck': 'strategy-deck/template.html',
  'content-world': 'content-world/template.html',
};

// Each deck gets its OWN Cloudflare Pages project. Project name shape:
//   <client-slug>-<filename-slug>
// e.g. client-b + strategy-deck.html -> "client-b-strategy-deck"
//      client-c + ecosystem-roadmap.html -> "client-c-ecosystem-roadmap"
// This keeps URLs the creator has already sent to clients stable.
function pagesProjectName(clientSlug: string, filename: string): string {
  const base = filename.replace(/\.html?$/i, '');
  const fileSlug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${clientSlug}-${fileSlug}`;
}

// Resolve a deck path passed from the client to its absolute path on disk.
// Hard-locked to 08_Service/clients/*/02_strategy/*.html so a malicious POST
// can't write outside the deck folder.
function resolveDeckPath(relPath: string): string | null {
  if (!relPath || typeof relPath !== 'string') return null;
  if (relPath.includes('..')) return null;
  const norm = relPath.replace(/^\/+/, '');
  if (!/^08_Service\/clients\/[^/]+\/02_strategy\/[^/]+\.html$/.test(norm)) return null;
  const full = path.join(VAULT_ROOT, norm);
  // Must resolve inside CLIENTS_DIR after symlink/.. resolution.
  const resolved = path.resolve(full);
  if (!resolved.startsWith(CLIENTS_DIR + path.sep)) return null;
  return resolved;
}

function clientSlugFromPath(relPath: string): string | null {
  const m = relPath.match(/^08_Service\/clients\/([^/]+)\/02_strategy\//);
  if (!m) return null;
  return m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

type DeckType = 'strategy-deck' | 'content-world';

// Peek at the first ~4KB of the HTML to determine which template it came
// from. content-world templates contain a unique global; strategy decks
// don't. Default is strategy-deck for legacy files.
function detectDeckType(absPath: string): DeckType {
  try {
    const fd = fs.openSync(absPath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf8', 0, n);
    if (head.includes('deck-type" content="content-world"')) return 'content-world';
    if (head.includes("deck-type' content='content-world'")) return 'content-world';
    return 'strategy-deck';
  } catch {
    return 'strategy-deck';
  }
}

function listDecks(): Array<{
  path: string;
  client: string;
  client_slug: string;
  filename: string;
  type: DeckType;
  mtime: number;
  published_url: string | null;
  last_published_at: number | null;
}> {
  const out: Array<{
    path: string;
    client: string;
    client_slug: string;
    filename: string;
    type: DeckType;
    mtime: number;
    published_url: string | null;
    last_published_at: number | null;
  }> = [];
  let clients: fs.Dirent[];
  try {
    clients = fs.readdirSync(CLIENTS_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const c of clients) {
    if (!c.isDirectory()) continue;
    if (c.name.startsWith('.') || c.name.startsWith('_')) continue;
    const stratDir = path.join(CLIENTS_DIR, c.name, '02_strategy');
    let files: fs.Dirent[];
    try {
      files = fs.readdirSync(stratDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith('.html')) continue;
      const full = path.join(stratDir, f.name);
      const stat = fs.statSync(full);
      const relPath = path.relative(VAULT_ROOT, full);
      const sidecar = full.replace(/\.html$/, '.published.json');
      let publishedUrl: string | null = null;
      let lastPublishedAt: number | null = null;
      try {
        const meta = JSON.parse(fs.readFileSync(sidecar, 'utf8'));
        publishedUrl = meta.url ?? null;
        lastPublishedAt = meta.last_published_at ?? null;
      } catch {
        // no sidecar yet
      }
      out.push({
        path: relPath,
        client: c.name,
        client_slug: clientSlugFromPath(relPath) ?? c.name.toLowerCase(),
        filename: f.name,
        type: detectDeckType(full),
        mtime: Math.floor(stat.mtimeMs / 1000),
        published_url: publishedUrl,
        last_published_at: lastPublishedAt,
      });
    }
  }
  return out;
}

// Strip the editor chrome so the published version looks identical but isn't
// editable. Run on the raw HTML string - no DOM library, just targeted removes.
function stripEditorChrome(html: string): string {
  let out = html;
  // Remove the floating edit toolbar
  out = out.replace(/<div class="edit-bar"[\s\S]*?<\/div>\s*/g, '');
  // Remove contenteditable attributes (true/false/plain)
  out = out.replace(/\s+contenteditable="[^"]*"/g, '');
  out = out.replace(/\s+contenteditable(?=\s|>)/g, '');
  // Remove the editing class hooks
  out = out.replace(/\s+class="editable"/g, '');
  out = out.replace(/(class="[^"]*?)\s+editable\b/g, '$1');
  out = out.replace(/\bis-editing\b/g, '');
  return out;
}

/**
 * Asset route - serves sibling files (images, etc.) that the deck references
 * via relative paths. Public (above auth) because <img> tags can't send a
 * custom auth header. Locked to files inside any client's 02_strategy/
 * folder, so the worst a guesser can leak is a strategy-deck asset they
 * already need the URL to find.
 *
 * URL shape: /api/decks/asset/08_Service/clients/Client B/02_strategy/core-ip-sketches/01.png
 */
export function serveDeckAsset(reqUrl: string): Response {
  const url = new URL(reqUrl);
  // Strip the prefix to recover the vault-relative path.
  const m = url.pathname.match(/^\/api\/decks\/asset\/(.+)$/);
  if (!m) return new Response('not found', { status: 404 });
  const relPath = decodeURIComponent(m[1]);
  if (relPath.includes('..') || relPath.startsWith('/')) {
    return new Response('bad path', { status: 400 });
  }
  // Must live inside a client folder (decks often reference ../01_research/
  // for brand refs, etc., so the whole client dir is in scope - not just
  // 02_strategy/).
  if (!/^08_Service\/clients\/[^/]+\//.test(relPath)) {
    return new Response('not allowed', { status: 403 });
  }
  const full = path.join(VAULT_ROOT, relPath);
  const resolved = path.resolve(full);
  if (!resolved.startsWith(CLIENTS_DIR + path.sep)) {
    return new Response('not allowed', { status: 403 });
  }
  let buf: Buffer;
  try {
    buf = fs.readFileSync(resolved);
  } catch {
    return new Response('not found', { status: 404 });
  }
  const ext = path.extname(resolved).toLowerCase();
  const mime =
    ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.webp' ? 'image/webp'
    : ext === '.gif' ? 'image/gif'
    : ext === '.svg' ? 'image/svg+xml'
    : ext === '.mp4' ? 'video/mp4'
    : ext === '.mov' ? 'video/quicktime'
    : ext === '.webm' ? 'video/webm'
    : ext === '.css' ? 'text/css; charset=utf-8'
    : ext === '.js' ? 'application/javascript'
    : 'application/octet-stream';
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'no-cache',
    },
  });
}

/**
 * The /file route is mounted publicly in index.ts (above auth) because a new
 * tab can't send a custom header. It does its own ?pw= check. Exported here
 * so index.ts can register it directly.
 */
export function serveDeckFile(reqUrl: string): Response {
  const url = new URL(reqUrl);
  const pw = url.searchParams.get('pw') ?? '';
  const expected = process.env.DASHBOARD_PASSWORD ?? 'dev';
  if (pw !== expected) {
    return new Response('unauthorized', { status: 401 });
  }
  const relPath = url.searchParams.get('path') ?? '';
  const full = resolveDeckPath(relPath);
  if (!full || !fs.existsSync(full)) {
    return new Response('not found', { status: 404 });
  }
  let html = fs.readFileSync(full, 'utf8');
  // Inject a <base href> so relative image / asset paths inside the deck
  // (e.g. <img src="core-ip-sketches/01.png">) resolve against the deck's
  // own folder, served through /api/decks/asset/<deckDir>/. Without this,
  // the browser would resolve against /api/decks/ and 404 every asset.
  const deckDir = path.dirname(relPath); // e.g. 08_Service/clients/Client B/02_strategy
  const baseHref = '/api/decks/asset/' + deckDir.split(path.sep).map(encodeURIComponent).join('/') + '/';
  // Inject the dashboard password + relative deck path so the deck's embedded
  // save/publish scripts can authenticate. Inserted right after <head>.
  const inject =
    `<base href="${baseHref}" data-role="deck-base">` +
    `<script>window.__DASHBOARD_PW__=${JSON.stringify(pw)};window.__DECK_PATH__=${JSON.stringify(relPath)};</script>`;
  html = html.replace(/<head[^>]*>/i, (m) => m + inject);
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

const decks = new Hono();

// LIST -----------------------------------------------------------------------
decks.get('/', (c) => {
  return c.json({ decks: listDecks() });
});

// SAVE - overwrite the deck's HTML in the vault with the baked version.
// Used by the strategy-deck template where the user's edits live in
// contenteditable HTML so the full document needs to be persisted.
decks.post('/save', async (c) => {
  let body: { path?: string; html?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const full = resolveDeckPath(body.path ?? '');
  if (!full) return c.json({ error: 'invalid path' }, 400);
  if (typeof body.html !== 'string' || body.html.length < 100) {
    return c.json({ error: 'html missing or too short' }, 400);
  }
  // Atomic write: tmp + rename.
  const tmp = full + '.tmp-' + Date.now();
  fs.writeFileSync(tmp, body.html, 'utf8');
  fs.renameSync(tmp, full);
  const stat = fs.statSync(full);
  return c.json({ ok: true, mtime: Math.floor(stat.mtimeMs / 1000) });
});

// SAVE STATE - surgical save for structured templates like content-world.
// The client only sends the state JSON (nodes/edges); the server reads the
// existing file, replaces JUST the seed script contents, and writes back.
// This means template-level changes (new CSS, new HTML structure, new
// features like zoom) survive every save - the user can never accidentally
// overwrite the template with a stale browser tab's DOM.
decks.post('/save-state', async (c) => {
  let body: { path?: string; seed_key?: string; state?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const full = resolveDeckPath(body.path ?? '');
  if (!full) return c.json({ error: 'invalid path' }, 400);
  if (!fs.existsSync(full)) return c.json({ error: 'file not found' }, 404);
  // Allow-list of seed scripts the client can update. Each maps an opaque
  // key from the template to its actual script id + the global it sets.
  const SEED_KEYS: Record<string, { scriptId: string; globalName: string }> = {
    'cworld': { scriptId: 'cworldSeed', globalName: '__CWORLD_SEED__' },
  };
  const seedDef = SEED_KEYS[String(body.seed_key ?? '')];
  if (!seedDef) return c.json({ error: 'unknown seed_key' }, 400);

  const stateJson = JSON.stringify(body.state ?? null);
  if (stateJson.length > 4 * 1024 * 1024) {
    return c.json({ error: 'state too large' }, 413);
  }

  let html = fs.readFileSync(full, 'utf8');
  // Match <script id="<seedDef.scriptId>" ...>...</script> and rewrite the
  // body. Tolerant of whitespace / extra attributes / either quote style.
  const seedRe = new RegExp(
    '(<script\\b[^>]*\\bid=["\']' + seedDef.scriptId + '["\'][^>]*>)([\\s\\S]*?)(</script>)',
    'i',
  );
  const newInner = `\n  window.${seedDef.globalName} = ${stateJson};\n`;
  if (!seedRe.test(html)) {
    return c.json({ error: 'seed script not found in file' }, 422);
  }
  html = html.replace(seedRe, (_m, open, _inner, close) => open + newInner + close);

  const tmp = full + '.tmp-' + Date.now();
  fs.writeFileSync(tmp, html, 'utf8');
  fs.renameSync(tmp, full);
  const stat = fs.statSync(full);
  return c.json({ ok: true, mtime: Math.floor(stat.mtimeMs / 1000) });
});

// Walk the cleaned HTML for relative asset paths and copy each referenced
// file into the staging dir at the same relative position. This is what
// makes the published deck actually render images.
//
// We look for any of:  src="..."  href="..."  url(...) inside inline CSS.
// Skip absolute URLs (http://, https://, data:, /…), and skip the cross-folder
// '..' paths only if they resolve outside the client folder.
function copyDeckAssets(
  html: string,
  deckAbsDir: string,
  clientDirAbs: string,
  stagingDir: string,
): { copied: string[]; skipped: string[] } {
  const copied: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  const candidates: string[] = [];
  const attrRe = /\b(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html))) candidates.push(m[1]);
  const cssRe = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
  while ((m = cssRe.exec(html))) candidates.push(m[1]);

  for (const raw of candidates) {
    const ref = raw.trim();
    if (!ref) continue;
    // Skip absolute / data / hash / protocol-relative
    if (/^(?:[a-z]+:)?\/\//i.test(ref)) continue;
    if (ref.startsWith('/')) continue;
    if (ref.startsWith('data:')) continue;
    if (ref.startsWith('#')) continue;
    if (ref.startsWith('mailto:')) continue;
    // Strip any ?query or #fragment from the path part
    const pathOnly = ref.split(/[?#]/)[0];
    if (!pathOnly) continue;
    if (seen.has(pathOnly)) continue;
    seen.add(pathOnly);

    const absSrc = path.resolve(deckAbsDir, pathOnly);
    if (!absSrc.startsWith(clientDirAbs + path.sep)) {
      skipped.push(pathOnly);
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absSrc);
    } catch {
      skipped.push(pathOnly);
      continue;
    }
    if (!stat.isFile()) {
      skipped.push(pathOnly);
      continue;
    }
    // Destination = same relative path against the deck folder. So a
    // src="core-ip-sketches/01.png" lands at <staging>/core-ip-sketches/01.png.
    const dest = path.resolve(stagingDir, pathOnly);
    if (!dest.startsWith(stagingDir + path.sep)) {
      skipped.push(pathOnly);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(absSrc, dest);
    copied.push(pathOnly);
  }
  return { copied, skipped };
}

// FROM TEMPLATE - clone a template into a client's strategy folder,
// substituting {{CLIENT_NAME}} and friends.
decks.post('/from-template', async (c) => {
  let body: { template?: string; client_folder?: string; name?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const tplId = body.template ?? '';
  const tplRel = ALLOWED_TEMPLATES[tplId];
  if (!tplRel) return c.json({ error: 'unknown template' }, 400);

  const clientFolder = (body.client_folder ?? '').trim();
  // Client folder must exist (no auto-create here - dashboard creates clients
  // elsewhere). Tight pattern: no slashes, no dots.
  if (!clientFolder || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(clientFolder)) {
    return c.json({ error: 'invalid client_folder' }, 400);
  }
  const clientAbs = path.join(CLIENTS_DIR, clientFolder);
  if (!fs.existsSync(clientAbs) || !fs.statSync(clientAbs).isDirectory()) {
    return c.json({ error: 'client folder not found' }, 404);
  }

  const rawName = (body.name ?? '').trim();
  // Filename slug: lowercase, words separated by single hyphens.
  const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return c.json({ error: 'invalid name' }, 400);
  const filename = slug + '.html';

  const stratDir = path.join(clientAbs, '02_strategy');
  fs.mkdirSync(stratDir, { recursive: true });
  const destAbs = path.join(stratDir, filename);
  if (fs.existsSync(destAbs)) {
    return c.json({ error: 'file already exists: ' + filename }, 409);
  }

  const tplAbs = path.join(TEMPLATES_DIR, tplRel);
  let tplHtml: string;
  try {
    tplHtml = fs.readFileSync(tplAbs, 'utf8');
  } catch {
    return c.json({ error: 'template file missing: ' + tplRel }, 500);
  }
  // Substitution table. Add new tokens here as templates need them.
  const subs: Record<string, string> = {
    '{{CLIENT_NAME}}': clientFolder,
    '{{CLIENT_NAME_LOWER}}': clientFolder.toLowerCase(),
    '{{CLIENT_SLUG}}': clientFolder.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    '{{DOC_NAME}}': rawName,
  };
  let out = tplHtml;
  for (const [k, v] of Object.entries(subs)) {
    out = out.split(k).join(v);
  }

  fs.writeFileSync(destAbs, out, 'utf8');
  const relPath = path.relative(VAULT_ROOT, destAbs);
  return c.json({ ok: true, path: relPath });
});

// PUBLISH - deploy ONE deck to its own Cloudflare Pages project.
//
// Each deck gets project name <client-slug>-<filename-slug>, so the URL is
// stable per deck and matches what may already exist in Cloudflare from
// before this automation (e.g. client-b-strategy-deck.pages.dev was the URL
// the creator had manually uploaded before).
//
// Staging layout:  <tmp>/index.html + every relative asset the deck refs.
decks.post('/publish', async (c) => {
  let body: { path?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  const targetFull = resolveDeckPath(body.path ?? '');
  if (!targetFull) return c.json({ error: 'invalid path' }, 400);
  if (!fs.existsSync(targetFull)) return c.json({ error: 'deck not found' }, 404);

  // Recover deck metadata for project naming + asset resolution.
  const relPath = path.relative(VAULT_ROOT, targetFull);
  const clientSlug = clientSlugFromPath(relPath);
  if (!clientSlug) return c.json({ error: 'could not derive client slug' }, 400);
  const filename = path.basename(targetFull);
  const projectName = pagesProjectName(clientSlug, filename);
  const deckDir = path.dirname(targetFull);
  // Resolve the client root (08_Service/clients/<client>/) for asset scoping.
  const clientDir = path.resolve(deckDir, '..');

  const tmpDir = fs.mkdtempSync(path.join(VAULT_ROOT, '.deck-publish-'));
  try {
    const raw = fs.readFileSync(targetFull, 'utf8');
    const cleaned = stripEditorChrome(raw);
    fs.writeFileSync(path.join(tmpDir, 'index.html'), cleaned, 'utf8');

    const { copied, skipped } = copyDeckAssets(cleaned, deckDir, clientDir, tmpDir);

    // Deploy via wrangler. Uses the existing OAuth session under
    // ~/.wrangler/config/default.toml (scope includes pages:write).
    //
    // First attempt: deploy. If the project doesn't exist yet, wrangler
    // returns code 1 with "Project not found" - create it then retry.
    let { stdout, stderr, code } = await runWrangler([
      'pages',
      'deploy',
      tmpDir,
      '--project-name=' + projectName,
      '--branch=main',
      '--commit-dirty=true',
    ]);
    if (code !== 0 && /Project not found/i.test(stderr)) {
      const created = await runWrangler([
        'pages',
        'project',
        'create',
        projectName,
        '--production-branch=main',
      ]);
      if (created.code === 0 || /already exists/i.test(created.stderr)) {
        ({ stdout, stderr, code } = await runWrangler([
          'pages',
          'deploy',
          tmpDir,
          '--project-name=' + projectName,
          '--branch=main',
          '--commit-dirty=true',
        ]));
      } else {
        return c.json(
          {
            error: 'wrangler failed to create project',
            code: created.code,
            project: projectName,
            stderr: created.stderr.slice(-2000),
          },
          500,
        );
      }
    }
    if (code !== 0) {
      return c.json(
        {
          error: 'wrangler failed',
          code,
          project: projectName,
          assets_copied: copied,
          assets_skipped: skipped,
          stdout: stdout.slice(-2000),
          stderr: stderr.slice(-2000),
        },
        500,
      );
    }
    // Wrangler prints the per-deployment URL (https://<hash>.<project>.pages.dev).
    // The STABLE URL for the client is https://<project>.pages.dev - that's
    // what we save + return.
    const deploymentUrl = (stdout.match(/https:\/\/[a-z0-9-]+\.pages\.dev[^\s]*/i) || [])[0] ?? null;
    const stableUrl = `https://${projectName}.pages.dev/`;

    const now = Math.floor(Date.now() / 1000);
    const sidecar = targetFull.replace(/\.html$/, '.published.json');
    fs.writeFileSync(
      sidecar,
      JSON.stringify(
        {
          url: stableUrl,
          project: projectName,
          deployment_url: deploymentUrl,
          last_published_at: now,
          assets_copied: copied,
          assets_skipped: skipped,
        },
        null,
        2,
      ),
      'utf8',
    );

    return c.json({
      ok: true,
      url: stableUrl,
      project: projectName,
      deployment_url: deploymentUrl,
      published_at: now,
      assets_copied: copied.length,
      assets_skipped: skipped,
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

// Run a wrangler command, capture stdout/stderr/exit code.
function runWrangler(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve) => {
    const child = spawn('wrangler', args, {
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString('utf8');
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr += b.toString('utf8');
    });
    child.on('error', (err) => {
      resolve({ stdout, stderr: stderr + '\n' + err.message, code: 1 });
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export default decks;
