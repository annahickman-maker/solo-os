/**
 * Tasks - file-per-row at 00_System/tasks/<id>.md
 *
 * Each task lives as its own markdown file with YAML frontmatter:
 *   - id: filename without .md (stable forever)
 *   - title: the markdown body's first heading (or the body itself)
 *   - status, category, this_week, section, project, energy, due_date
 *
 * Tick a task -> PATCH writes frontmatter.status = 'completed' to the file.
 * Add a task -> POST creates a new file in 00_System/tasks/.
 * Delete a task -> DELETE removes the file. Done. No tombstones.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import {
  abs,
  archiveFile,
  loadFile,
  loadCollection,
  saveFile,
  slugify,
  VAULT_ROOT,
} from '../vault.js';
import { resetStaleWeeklyTasks, stampThisWeek } from '../lib/weeklyReset.js';

const TASKS_DIR_REL = path.join('00_System', 'tasks');

type TaskStatus = 'pending' | 'in_progress' | 'completed';
type TaskCategory =
  | 'filming'
  | 'scripting'
  | 'building'
  | 'operations'
  | 'admin'
  | 'other';

type TaskFrontmatter = {
  id?: string;
  type: 'task';
  status: TaskStatus;
  category: TaskCategory;
  this_week?: boolean;
  section?: string;
  project?: string | null;
  energy?: number | null;
  due_date?: string | null;
  created?: string;
  updated?: string;
  completed_at?: string;
  // Day-of-week pin for the Focus page's WeekPlanner. One of
  // "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun" or null when unscheduled.
  // Persistent: does NOT clear at week-end. The Today page surfaces
  // tasks whose weekday matches today.
  scheduled_weekday?: string | null;
  // DEPRECATED: legacy ISO-date pin. Still read for one-time migration
  // (focus.ts derives a weekday from it if scheduled_weekday is empty).
  // Do not write.
  scheduled_day?: string | null;
  // When true, this task is in the project's BACKLOG. It's visible in
  // the project / client detail panel only - hidden from the Focus
  // page's master todo + the WeekPlanner. Drag from backlog into
  // priority (this field flips to false) to make it active again.
  backlog?: boolean;
};

type TaskResponse = {
  id: string;
  title: string;
  status: TaskStatus;
  category: TaskCategory;
  this_week: boolean;
  section: string;
  project: string | null;
  energy: number | null;
  due_date: string | null;
  notes: string;
  source_file: string;
  updated_at: number;
  created_at?: string;
  completed_at?: string;
  scheduled_weekday: string | null;
  backlog: boolean;
};

function taskPath(id: string): string {
  return abs(TASKS_DIR_REL, `${id}.md`);
}

function titleFromBody(body: string, fallback: string): string {
  const firstHeading = body.match(/^#\s+(.+?)\s*$/m);
  if (firstHeading) return firstHeading[1]!;
  const firstLine = body.trim().split('\n')[0];
  return firstLine || fallback;
}

function entryToTask(entry: ReturnType<typeof loadFile<TaskFrontmatter>>): TaskResponse | null {
  if (!entry) return null;
  const fm = entry.frontmatter;
  if (fm?.type !== 'task') return null;
  return {
    id: fm.id ?? entry.id,
    title: titleFromBody(entry.body, entry.id),
    status: fm.status ?? 'pending',
    category: fm.category ?? 'other',
    this_week: !!fm.this_week,
    section: fm.section ?? '',
    project: fm.project ?? null,
    energy: typeof fm.energy === 'number' ? fm.energy : null,
    due_date: fm.due_date ?? null,
    notes: stripFirstHeading(entry.body).trim(),
    source_file: entry.relPath,
    updated_at: entry.mtimeSec,
    created_at: fm.created,
    completed_at: fm.completed_at,
    scheduled_weekday: deriveScheduledWeekday(fm),
    backlog: (fm as any).backlog === true,
  };
}

function stripFirstHeading(body: string): string {
  return body.replace(/^#\s+.+?\n/, '');
}

// Valid weekday short names. The WeekPlanner pins tasks to one of these.
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Weekday = typeof WEEKDAYS[number];
function isWeekday(v: unknown): v is Weekday {
  return typeof v === 'string' && (WEEKDAYS as readonly string[]).includes(v);
}
// Convert a YYYY-MM-DD ISO date to its weekday short name in local time.
function weekdayFromIsoDate(iso: string): Weekday | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const idx = date.getDay(); // 0=Sun ... 6=Sat
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx] as Weekday;
}
// Read the persisted weekday, falling back to deriving it from the legacy
// scheduled_day ISO date. Lets pre-existing planning carry forward on
// first read after the rollout.
function deriveScheduledWeekday(fm: Record<string, unknown> | undefined | null): Weekday | null {
  if (!fm) return null;
  const wd = (fm as any).scheduled_weekday;
  if (isWeekday(wd)) return wd;
  const legacy = (fm as any).scheduled_day;
  if (typeof legacy === 'string') return weekdayFromIsoDate(legacy);
  return null;
}

function listTasks(): TaskResponse[] {
  return loadCollection<TaskFrontmatter>(TASKS_DIR_REL, { type: 'task' })
    .map(entryToTask)
    .filter((t): t is TaskResponse => t !== null);
}

const app = new Hono();

// GET /api/tasks - list all (with optional filters)
app.get('/', (c) => {
  // Throttled (1/min): flips this_week tasks back to master-todo if their
  // stamped ISO week has rolled over. No-op most calls.
  resetStaleWeeklyTasks();
  const status = c.req.query('status');
  const thisWeek = c.req.query('this_week');
  // Accept either `project` or `project_id` for the same field - the frontend
  // uses project_id, the file stores project. Same key on tasks regardless of
  // whether the value points at a project or a client; the relationship is the
  // same thing.
  const project = c.req.query('project') ?? c.req.query('project_id');
  let tasks = listTasks();
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (thisWeek === '1' || thisWeek === 'true') tasks = tasks.filter((t) => t.this_week);
  if (project) tasks = tasks.filter((t) => t.project === project);
  // Sort: pending+in_progress first, then by category, then by section.
  tasks.sort((a, b) => {
    const order = { in_progress: 0, pending: 1, completed: 2 };
    return (
      (order[a.status] ?? 99) - (order[b.status] ?? 99) ||
      a.category.localeCompare(b.category) ||
      a.section.localeCompare(b.section)
    );
  });
  return c.json({ tasks, count: tasks.length });
});

// GET /api/tasks/:id - one task
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const entry = loadFile<TaskFrontmatter>(taskPath(id));
  const task = entryToTask(entry);
  if (!task) return c.json({ error: 'not found' }, 404);
  return c.json(task);
});

// POST /api/tasks - create
app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | (Partial<TaskFrontmatter> & { title: string; notes?: string })
    | null;
  if (!body?.title) return c.json({ error: 'title required' }, 400);
  const slug = slugify(body.title) || 'task';
  let id = `task-${slug}`;
  let n = 2;
  while (loadFile(taskPath(id))) {
    id = `task-${slug}-${n++}`;
  }
  const today = new Date().toISOString().slice(0, 10);
  // Frontend sends project_id; file format uses project. Treat them as the
  // same field (a project OR client id - never both).
  const projectRef =
    body.project ?? (body as { project_id?: string }).project_id ?? null;
  const fm: TaskFrontmatter = {
    id,
    type: 'task',
    status: body.status ?? 'pending',
    category: body.category ?? 'other',
    this_week: body.this_week ?? false,
    section: body.section ?? '',
    project: projectRef,
    energy: typeof body.energy === 'number' ? body.energy : null,
    due_date: body.due_date ?? null,
    created: today,
    updated: today,
  };
  const bodyText = `# ${body.title}\n${body.notes ? `\n${body.notes}\n` : ''}`;
  saveFile(taskPath(id), fm, bodyText);
  return c.json(entryToTask(loadFile<TaskFrontmatter>(taskPath(id))), 201);
});

// PATCH /api/tasks/:id - edit
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = loadFile<TaskFrontmatter>(taskPath(id));
  if (!existing) return c.json({ error: 'not found' }, 404);
  const body = (await c.req.json().catch(() => null)) as
    | (Partial<TaskFrontmatter> & { title?: string; notes?: string })
    | null;
  if (!body) return c.json({ error: 'body required' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const patch: Partial<TaskFrontmatter> = { updated: today };
  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === 'completed') patch.completed_at = today;
    else patch.completed_at = undefined;
  }
  if (body.category !== undefined) patch.category = body.category;
  if (body.this_week !== undefined) {
    patch.this_week = body.this_week;
    // Stamp the ISO week so weeklyReset can later auto-flip this task
    // back to master-todo if it's still pending after the week rolls
    // over. Clear the stamp when this_week is set to false.
    (patch as any).this_week_iso_week = body.this_week ? stampThisWeek() : undefined;
  }
  // Accept either project or project_id - same field, frontend sends project_id.
  const patchProject = body.project !== undefined
    ? body.project
    : (body as { project_id?: string | null }).project_id;
  if (patchProject !== undefined) patch.project = patchProject;
  if (body.energy !== undefined) patch.energy = body.energy;
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.section !== undefined) patch.section = body.section;
  // scheduled_weekday: pins the task to a day-of-week column in the
  // WeekPlanner. Persistent across weeks. Null clears the pin. Also
  // clear the legacy scheduled_day so it doesn't shadow the new value.
  if ((body as any).scheduled_weekday !== undefined) {
    const raw = (body as any).scheduled_weekday;
    (patch as any).scheduled_weekday = isWeekday(raw) ? raw : null;
    (patch as any).scheduled_day = undefined;
  }
  // backlog: when true the task is hidden from the Focus page +
  // WeekPlanner. Only visible inside its project / client detail.
  // Moving to backlog also clears any weekday pin.
  if ((body as any).backlog !== undefined) {
    const isBacklog = (body as any).backlog === true;
    (patch as any).backlog = isBacklog;
    if (isBacklog) {
      (patch as any).scheduled_weekday = null;
      (patch as any).scheduled_day = undefined;
    }
  }

  // Optionally rewrite the title (first heading) and/or notes.
  let nextBody = existing.body;
  if (body.title !== undefined) {
    nextBody = `# ${body.title}\n${stripFirstHeading(existing.body)}`;
  }
  if (body.notes !== undefined) {
    nextBody = nextBody.replace(/^(#.+\n)([\s\S]*)$/, (_, heading: string) => `${heading}\n${body.notes}\n`);
    // If there was no heading, just write notes plainly.
    if (!nextBody.includes(body.notes!)) {
      nextBody = body.notes!;
    }
  }
  const merged = { ...existing.frontmatter, ...patch };
  // Clean up undefined keys before YAML serialization.
  for (const k of Object.keys(merged) as (keyof typeof merged)[]) {
    if (merged[k] === undefined) delete merged[k];
  }
  saveFile(taskPath(id), merged as Record<string, unknown>, nextBody);
  return c.json(entryToTask(loadFile<TaskFrontmatter>(taskPath(id))));
});

// DELETE /api/tasks/:id - archive the file (soft delete, recoverable).
// Moves to 00_System/tasks/_archive/. To restore: drag the file out of
// _archive/ back into 00_System/tasks/. Use ?hard=true to actually unlink
// (rarely needed - the file is still in git history either way).
app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const file = loadFile(taskPath(id));
  if (!file) return c.json({ error: 'not found' }, 404);
  const archivedTo = archiveFile(taskPath(id));
  if (!archivedTo) return c.json({ error: 'failed to archive' }, 500);
  return c.json({
    ok: true,
    archived: true,
    archived_to: archivedTo.replace(VAULT_ROOT + '/', ''),
  });
});

// Suppress unused warning for fs (intentionally available for future expansions).
void fs;

export default app;
