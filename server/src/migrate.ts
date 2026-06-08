/**
 * One-shot migration: takes data that currently lives in 00_System/projects-and-clients.md
 * + the existing 08_Service/clients/<Name>/ folders, and writes each client
 * to its own 08_Service/clients/<Name>/_client.md.
 *
 * Idempotent. Re-running is safe - if the target file already exists with
 * the same data, no write happens. If it exists with different data, this
 * script doesn't overwrite (vault is authoritative once written).
 *
 * Run: `cd server && npm run migrate -- clients`
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { abs, loadFile, saveFile, slugify, VAULT_ROOT } from './vault.js';

const CLIENTS_DIR_REL = path.join('08_Service', 'clients');
const MANIFEST_REL = path.join('00_System', 'projects-and-clients.md');

type ManifestClient = {
  id: string;
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct: number;
  description?: string;
};

function parseManifestClients(): ManifestClient[] {
  const md = fs.readFileSync(abs(MANIFEST_REL), 'utf8');
  const headingRe = /##\s+Clients\s*([\s\S]*?)(?=\n##\s|$)/i;
  const m = md.match(headingRe);
  if (!m) return [];
  const fence = m[1].match(/```yaml\s*([\s\S]*?)```/);
  if (!fence) return [];
  const parsed = yaml.load(fence[1]) as { clients?: ManifestClient[] };
  return Array.isArray(parsed?.clients) ? parsed.clients : [];
}

function migrateClients() {
  const manifest = parseManifestClients();
  console.log(`Found ${manifest.length} clients in ${MANIFEST_REL}`);

  // Index by name (case-insensitive) so we can match to existing folders.
  const byNameLower = new Map<string, ManifestClient>();
  for (const c of manifest) byNameLower.set(c.name.toLowerCase(), c);

  // Walk the clients folder, ensure each has a _client.md.
  const clientsDir = abs(CLIENTS_DIR_REL);
  let folders: fs.Dirent[];
  try {
    folders = fs.readdirSync(clientsDir, { withFileTypes: true });
  } catch {
    console.error(`Clients dir not found: ${clientsDir}`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  const handled = new Set<string>();

  for (const dirent of folders) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.') || dirent.name.startsWith('_')) continue;
    const folderName = dirent.name;
    const filePath = path.join(clientsDir, folderName, '_client.md');
    const existing = loadFile(filePath);
    if (existing) {
      console.log(`  skip ${folderName} (_client.md already exists)`);
      skipped++;
      handled.add(folderName.toLowerCase());
      continue;
    }
    const fromManifest = byNameLower.get(folderName.toLowerCase());
    const frontmatter = {
      id: fromManifest?.id ?? `client-${slugify(folderName)}`,
      type: 'client' as const,
      name: folderName,
      status: fromManifest?.status ?? 'in_progress',
      progress_pct: fromManifest?.progress_pct ?? 0,
      description: fromManifest?.description ?? '',
      signed: today,
      created: today,
      updated: today,
    };
    const body = fromManifest?.description
      ? `# ${folderName}\n\n${fromManifest.description}\n`
      : `# ${folderName}\n\nClient notes go here.\n`;
    saveFile(filePath, frontmatter, body);
    console.log(`  created ${path.relative(VAULT_ROOT, filePath)}`);
    created++;
    handled.add(folderName.toLowerCase());
  }

  // Also handle clients in the manifest that don't have a folder yet.
  for (const c of manifest) {
    if (handled.has(c.name.toLowerCase())) continue;
    const folderPath = path.join(clientsDir, c.name);
    fs.mkdirSync(folderPath, { recursive: true });
    const filePath = path.join(folderPath, '_client.md');
    if (loadFile(filePath)) {
      skipped++;
      continue;
    }
    const frontmatter = {
      id: c.id,
      type: 'client' as const,
      name: c.name,
      status: c.status,
      progress_pct: c.progress_pct,
      description: c.description ?? '',
      signed: today,
      created: today,
      updated: today,
    };
    const body = c.description ? `# ${c.name}\n\n${c.description}\n` : `# ${c.name}\n`;
    saveFile(filePath, frontmatter, body);
    console.log(`  created ${path.relative(VAULT_ROOT, filePath)} (folder did not exist)`);
    created++;
  }

  console.log(`\n${created} created, ${skipped} skipped.`);
}

// ─── tasks migration ──────────────────────────────────────────────────────

type TaskCategory = 'filming' | 'scripting' | 'building' | 'operations' | 'admin' | 'other';
type TaskStatus = 'pending' | 'in_progress' | 'completed';

const TASK_CATEGORY_MAP: Record<string, TaskCategory> = {
  filming: 'filming',
  scripting: 'scripting',
  building: 'building',
  build: 'building',
  builds: 'building',
  operations: 'operations',
  ops: 'operations',
  admin: 'admin',
  'ss operations': 'operations',
  'pending decisions': 'admin',
  backlog: 'admin',
};

function categoryFromHeading(heading: string): TaskCategory {
  const h = heading.toLowerCase().trim();
  for (const key of Object.keys(TASK_CATEGORY_MAP)) {
    if (h.includes(key)) return TASK_CATEGORY_MAP[key]!;
  }
  return 'other';
}

const TASK_PROJECT_KEYWORDS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'client-angie', patterns: [/\bangie\b/i] },
  { id: 'client-fab', patterns: [/\bfab\b/i] },
  { id: 'client-tharros', patterns: [/\btharros\b/i] },
  { id: 'proj-os-builds-sales-page', patterns: [/os builds (sales page|service)/i, /builds page/i, /builds sales/i] },
  { id: 'proj-ss-vsl', patterns: [/\bvsl\b/i, /video sales letter/i] },
  { id: 'ss-instagram-skills', patterns: [/\binstagram\b/i, /\bIG\b/, /\breel/i, /\bcarousel/i] },
  { id: 'ss-web-design-os', patterns: [/web design os/i, /\bweb design\b/i] },
  { id: 'ss-solopreneur-os', patterns: [/solopreneur os/i, /the offer/i] },
  { id: 'ss-foundation', patterns: [/\bfoundation\b/i, /onboarding/i, /workshop/i] },
];

function projectFromTitle(title: string, sectionHeading: string): string | null {
  const haystack = `${title} ${sectionHeading}`;
  for (const { id, patterns } of TASK_PROJECT_KEYWORDS) {
    if (patterns.some((re) => re.test(haystack))) return id;
  }
  return null;
}

type ParsedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  category: TaskCategory;
  section: string;
  this_week: boolean;
  project: string | null;
  source_line: number;
};

function parseTasksFromMd(md: string): ParsedTask[] {
  const lines = md.split('\n');
  const headingStack: { level: number; text: string }[] = [];
  let inKilled = false;
  let inRecentlyDone = false;
  const seenIds = new Set<string>();
  const out: ParsedTask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/\r$/, '');
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!.replace(/\*\*/g, '').trim();
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      const lower = text.toLowerCase();
      inKilled = lower.includes('killed');
      inRecentlyDone = lower.includes('recently done');
      continue;
    }
    if (inKilled) continue;

    const m = line.match(/^(\s*)-\s*\[( |x|X)\]\s+(.+?)\s*$/);
    if (!m) continue;

    const checked = m[2]!.toLowerCase() === 'x';
    let titleRaw = m[3]!.trim();
    // Strip leading bold wrapper for slugging, but keep the whole title for display.
    const titleForSlug = titleRaw.replace(/^\*\*(.+?)\*\*/, '$1').trim();
    if (!titleForSlug) continue;

    const section = headingStack.length ? headingStack[headingStack.length - 1]!.text : '';
    const category = inRecentlyDone ? 'other' : categoryFromHeading(section);
    const baseSlug = slugify(titleForSlug) || 'task';
    let id = `task-${baseSlug}`;
    let n = 2;
    while (seenIds.has(id)) {
      id = `task-${baseSlug}-${n++}`;
    }
    seenIds.add(id);

    const this_week =
      headingStack.some((x) => /this week/i.test(x.text)) ||
      headingStack.some((x) =>
        /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i.test(x.text)
      );

    out.push({
      id,
      title: titleRaw,
      status: inRecentlyDone || checked ? 'completed' : 'pending',
      category,
      section,
      this_week,
      project: projectFromTitle(titleForSlug, section),
      source_line: i + 1,
    });
  }
  return out;
}

function migrateTasks() {
  const masterTodoPath = abs('00_System', 'master-todo.md');
  const md = fs.readFileSync(masterTodoPath, 'utf8');
  const parsed = parseTasksFromMd(md);
  console.log(`Parsed ${parsed.length} tasks from master-todo.md`);

  const tasksDir = abs('00_System', 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  for (const t of parsed) {
    const filePath = path.join(tasksDir, `${t.id}.md`);
    if (loadFile(filePath)) {
      skipped++;
      continue;
    }
    const frontmatter: Record<string, unknown> = {
      id: t.id,
      type: 'task',
      status: t.status,
      category: t.category,
      this_week: t.this_week,
      section: t.section,
      project: t.project,
      created: today,
      updated: today,
    };
    if (t.status === 'completed') {
      frontmatter.completed_at = today;
    }
    const body = `# ${t.title}\n`;
    saveFile(filePath, frontmatter, body);
    created++;
  }
  console.log(`\n${created} created, ${skipped} skipped (already existed).`);
  console.log(`Task files now live at: ${path.relative(VAULT_ROOT, tasksDir)}/<id>.md`);
}

// ─── projects migration ───────────────────────────────────────────────────

type ManifestProject = {
  id: string;
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct: number;
  description?: string;
};

function parseManifestProjects(): ManifestProject[] {
  const md = fs.readFileSync(abs(MANIFEST_REL), 'utf8');
  const headingRe = /##\s+Projects\s*([\s\S]*?)(?=\n##\s|$)/i;
  const m = md.match(headingRe);
  if (!m) return [];
  const fence = m[1].match(/```yaml\s*([\s\S]*?)```/);
  if (!fence) return [];
  const parsed = yaml.load(fence[1]) as { projects?: ManifestProject[] };
  return Array.isArray(parsed?.projects) ? parsed.projects : [];
}

function migrateProjects() {
  const projects = parseManifestProjects();
  console.log(`Found ${projects.length} projects in ${MANIFEST_REL}`);
  const projectsDir = abs('00_System', 'projects');
  fs.mkdirSync(projectsDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  for (const p of projects) {
    const filePath = path.join(projectsDir, `${p.id}.md`);
    if (loadFile(filePath)) {
      skipped++;
      continue;
    }
    const frontmatter = {
      id: p.id,
      type: 'project' as const,
      name: p.name,
      status: p.status,
      progress_pct: p.progress_pct,
      description: p.description ?? '',
      created: today,
      updated: today,
    };
    const body = p.description ? `# ${p.name}\n\n${p.description}\n` : `# ${p.name}\n`;
    saveFile(filePath, frontmatter, body);
    created++;
  }
  console.log(`${created} created, ${skipped} skipped.`);
}

// ─── goals migration ──────────────────────────────────────────────────────

function migrateGoals() {
  // Goals currently come from the existing /api/focus endpoint which derives
  // them from project_90-day-focus.md prose + state. We seed three known
  // goals as files. Anna can edit them on dashboard or in Obsidian thereafter.
  const goalsDir = abs('00_System', 'goals');
  fs.mkdirSync(goalsDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const seeds: Array<{
    id: string;
    title: string;
    target_value?: number;
    current_value?: number;
    target_date?: string;
    parent_id?: string;
  }> = [
    {
      id: 'focus-primary',
      title: 'Get the offer generating consistent monthly revenue.',
      target_value: 25,
      target_date: '2026-07-13',
    },
    {
      id: 'focus-sub-25-paid-members',
      title: '25+ paid members in the offer',
      target_value: 25,
      parent_id: 'focus-primary',
    },
    {
      id: 'focus-sub-consistent-publishing',
      title: 'Consistent content publishing on main channel (1 video every 1-2 weeks)',
      parent_id: 'focus-primary',
    },
  ];

  let created = 0;
  let skipped = 0;
  for (const g of seeds) {
    const filePath = path.join(goalsDir, `${g.id}.md`);
    if (loadFile(filePath)) {
      skipped++;
      continue;
    }
    const frontmatter: Record<string, unknown> = {
      id: g.id,
      type: 'goal',
      status: 'active',
      target_value: g.target_value ?? null,
      current_value: g.current_value ?? 0,
      target_date: g.target_date ?? null,
      parent_id: g.parent_id ?? null,
      created: today,
      updated: today,
    };
    saveFile(filePath, frontmatter, `# ${g.title}\n`);
    created++;
  }
  console.log(`Goals: ${created} created, ${skipped} skipped.`);
}

// ─── products migration ───────────────────────────────────────────────────

function migrateProducts() {
  // Parse gumroad-products.md headings into one file per product.
  // Format in source:  ### Name - $price (N reviews, M stars)
  const md = fs.readFileSync(abs('07_Products', 'Gumroad', 'gumroad-products.md'), 'utf8');
  const productsDir = abs('07_Products', 'Gumroad', 'products');
  fs.mkdirSync(productsDir, { recursive: true });

  type Section = 'paid' | 'free';
  const lines = md.split('\n');
  let section: Section | null = null;
  const products: Array<{
    id: string;
    name: string;
    price: number;
    reviews?: number;
    rating?: number;
    type: Section;
    description: string;
  }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const sectionHeading = line.match(/^##\s+(Paid Products|Free Lead Magnets)/i);
    if (sectionHeading) {
      section = /paid/i.test(sectionHeading[1]!) ? 'paid' : 'free';
      continue;
    }
    if (!section) continue;
    // Match: ### Name - $price (N reviews, M stars)
    // Or:    ### Name (N reviews, M stars)   (for free magnets)
    const m = line.match(/^###\s+(.+?)\s*(?:-\s*\$([\d.]+))?\s*(?:\((\d+)\s+reviews?,\s*([\d.]+)\s+stars?\))?\s*$/i);
    if (!m) continue;
    const name = m[1]!.trim();
    const price = m[2] ? parseFloat(m[2]) : 0;
    const reviews = m[3] ? parseInt(m[3]!, 10) : undefined;
    const rating = m[4] ? parseFloat(m[4]!) : undefined;
    // Collect the body until the next ### or ##
    const bodyLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^#{1,3}\s/.test(lines[j]!)) break;
      bodyLines.push(lines[j]!);
    }
    products.push({
      id: `product-${slugify(name)}`,
      name,
      price,
      reviews,
      rating,
      type: section,
      description: bodyLines.join('\n').trim(),
    });
  }

  console.log(`Found ${products.length} products in gumroad-products.md`);
  const today = new Date().toISOString().slice(0, 10);
  let created = 0;
  let skipped = 0;
  for (const p of products) {
    const filePath = path.join(productsDir, `${p.id}.md`);
    if (loadFile(filePath)) {
      skipped++;
      continue;
    }
    const frontmatter = {
      id: p.id,
      type: 'product' as const,
      name: p.name,
      product_type: p.type, // 'paid' | 'free'
      price: p.price,
      reviews: p.reviews ?? 0,
      rating: p.rating ?? null,
      status: 'active',
      created: today,
      updated: today,
    };
    saveFile(filePath, frontmatter, `# ${p.name}\n\n${p.description}\n`);
    created++;
  }
  console.log(`Products: ${created} created, ${skipped} skipped.`);
}

// ─── POVs migration ────────────────────────────────────────────────────────

function migratePOVs() {
  // POVs already exist as files at 05_Assets/POVs/*.md. We just standardize
  // their frontmatter so the new server can read them uniformly. Files that
  // already have type:pov in frontmatter are left alone.
  const dir = abs('05_Assets', 'POVs');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    console.log('POVs dir not found');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  let skipped = 0;
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name.startsWith('_') || /asset_povs\.md$/i.test(e.name)) continue;
    const filePath = path.join(dir, e.name);
    const loaded = loadFile(filePath);
    if (!loaded) continue;
    if ((loaded.frontmatter as any)?.type === 'pov') {
      skipped++;
      continue;
    }
    // Derive a stable id from filename.
    const id = `pov-${slugify(
      e.name.replace(/\.md$/, '').replace(/^asset_pov-/, '').replace(/^pov_/, '')
    )}`;
    // Extract a title from first heading in body, or filename.
    const titleMatch = loaded.body.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1]! : id.replace(/^pov-/, '').replace(/-/g, ' ');
    const frontmatter = {
      ...loaded.frontmatter,
      id,
      type: 'pov' as const,
      title,
      created: (loaded.frontmatter as any)?.created ?? today,
      updated: today,
    };
    saveFile(filePath, frontmatter as Record<string, unknown>, loaded.body);
    added++;
  }
  console.log(`POVs: ${added} frontmatter-added, ${skipped} already had type:pov`);
}

// ─── videos migration ──────────────────────────────────────────────────────

function migrateVideos() {
  // Videos already exist as files at 04_Channel/04_Projects/project_*.md.
  // Standardize frontmatter, derive status from existing content where possible.
  const dir = abs('04_Channel', '04_Projects');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    console.log('Videos dir not found');
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  let skipped = 0;
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md') || e.name.startsWith('_')) continue;
    if (!/^project_/.test(e.name)) continue;
    const filePath = path.join(dir, e.name);
    const loaded = loadFile(filePath);
    if (!loaded) continue;
    if ((loaded.frontmatter as any)?.type === 'video') {
      skipped++;
      continue;
    }
    // Strip both `project_` and any leading `video-` from the slug source so
    // we don't end up with double-prefixed ids like `video-video-foo`.
    const idSlugSource = e.name
      .replace(/\.md$/, '')
      .replace(/^project_/, '')
      .replace(/^video-/, '');
    const id = `video-${slugify(idSlugSource)}`;
    const titleMatch = loaded.body.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1]! : id;
    // Try to derive status from body keywords.
    const lower = loaded.body.toLowerCase();
    let status = 'idea';
    if (/\bpublished\b/.test(lower)) status = 'published';
    else if (/\bediting\b/.test(lower)) status = 'editing';
    else if (/\bfilmed\b/.test(lower)) status = 'filmed';
    else if (/\bscripted\b/.test(lower) || /\bscript\b/.test(lower)) status = 'scripted';
    const frontmatter = {
      ...loaded.frontmatter,
      id,
      type: 'video' as const,
      title,
      status,
      created: (loaded.frontmatter as any)?.created ?? today,
      updated: today,
    };
    saveFile(filePath, frontmatter as Record<string, unknown>, loaded.body);
    added++;
  }
  console.log(`Videos: ${added} frontmatter-added, ${skipped} already had type:video`);
}

// ─── dispatcher ───────────────────────────────────────────────────────────

const target = process.argv[2] ?? '';
const ALL_MIGRATIONS: Record<string, () => void> = {
  clients: migrateClients,
  tasks: migrateTasks,
  projects: migrateProjects,
  goals: migrateGoals,
  products: migrateProducts,
  povs: migratePOVs,
  videos: migrateVideos,
};

if (target === 'all') {
  for (const [name, fn] of Object.entries(ALL_MIGRATIONS)) {
    console.log(`\n─── ${name} ────────────────────`);
    try { fn(); } catch (err: any) { console.error(`  error: ${err?.message ?? err}`); }
  }
} else if (ALL_MIGRATIONS[target]) {
  ALL_MIGRATIONS[target]!();
} else {
  console.log('Usage: npm run migrate -- <target>');
  console.log('Targets:');
  console.log('  clients  - 00_System/projects-and-clients.md + folders -> 08_Service/clients/<Name>/_client.md');
  console.log('  tasks    - 00_System/master-todo.md (90 tasks) -> 00_System/tasks/<id>.md');
  console.log('  projects - projects-and-clients.md -> 00_System/projects/<id>.md');
  console.log('  goals    - seeds 90-day focus goals -> 00_System/goals/<id>.md');
  console.log('  products - gumroad-products.md -> 07_Products/Gumroad/products/<id>.md');
  console.log('  povs     - 05_Assets/POVs/*.md - standardize frontmatter');
  console.log('  videos   - 04_Channel/04_Projects/project_*.md - standardize frontmatter');
  console.log('  all      - run everything above');
  process.exit(target ? 1 : 0);
}
