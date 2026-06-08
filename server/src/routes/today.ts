/**
 * Today - the home page payload. Aggregates from files:
 *   - top 3 tasks (pending + this_week)
 *   - primary goal (focus-primary) for progress dial
 *   - simple ring data
 *
 * Deep work and activity tracker data is intentionally NOT here yet -
 * they need their own storage decision (Chunk E continued).
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import { abs, loadCollection, loadFile } from '../vault.js';

const app = new Hono();

type TaskFrontmatter = {
  id?: string;
  type: 'task';
  status: string;
  category?: string;
  this_week?: boolean;
  project?: string | null;
};

type GoalFrontmatter = {
  type: 'goal';
  status?: string;
  target_value?: number;
  current_value?: number;
  target_date?: string;
  parent_id?: string | null;
};

function greetingFromHour(_h?: number): string {
  return 'hello';
}

// Local wall-clock YYYY-MM-DD. We use local time everywhere so "today"
// matches the user's wall clock, not whatever UTC says after 5pm Pacific.
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Strain weighting - mirrors the Cloudflare worker's model so prod + local stay
// consistent. Each completed task contributes base*energy with diminishing
// returns; each completed deep-work block (not linked to a counted task)
// contributes base*hours capped at 2x base.
// Strain weights, ranked highest → lowest:
// filming > calls (operations) > scripting > building > admin > other things.
const CATEGORY_WEIGHT: Record<string, number> = {
  filming: 4.5,
  operations: 3.6,
  scripting: 2.8,
  building: 2.0,
  admin: 0.7,
  other: 0.5,
};
const ENERGY_MULT: Record<string, number> = { high: 1.3, medium: 1.0, low: 0.7 };

type BlockRow = {
  id: string;
  task_id: string | null;
  category: string | null;
  started_at: number;
  ended_at: number | null;
  duration_sec: number | null;
};

function readBlocksFile(): BlockRow[] {
  const filePath = abs('00_System', 'deep-work', 'blocks.jsonl');
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const out: BlockRow[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {}
  }
  return out;
}

function computeStrain(
  completedTasks: Array<{ category?: string; energy?: string; id?: string }>,
  blocks: BlockRow[]
): number {
  const sorted = [...completedTasks].sort(
    (a, b) =>
      (CATEGORY_WEIGHT[b.category ?? 'other'] ?? 1.2) -
      (CATEGORY_WEIGHT[a.category ?? 'other'] ?? 1.2)
  );
  let strain = 0;
  let i = 0;
  for (const t of sorted) {
    const base = CATEGORY_WEIGHT[t.category ?? 'other'] ?? 1.2;
    const energy = ENERGY_MULT[t.energy ?? ''] ?? 1.0;
    const decay = Math.pow(0.88, i);
    strain += base * energy * decay;
    i++;
  }
  const countedIds = new Set(completedTasks.map((t) => t.id).filter(Boolean) as string[]);
  for (const b of blocks) {
    if (b.task_id && countedIds.has(b.task_id)) continue;
    const base = CATEGORY_WEIGHT[b.category ?? 'other'] ?? 1.2;
    const hours = Math.max(0.1, (b.duration_sec ?? 0) / 3600);
    strain += base * Math.min(2, hours);
  }
  return Math.min(21, Math.round(strain * 10) / 10);
}

app.get('/', async (c) => {
  const requestedDate = c.req.query('date');
  const dayStartParam = c.req.query('day_start');
  // Top tasks: prefer anything scheduled FOR TODAY (from the Focus
  // page's WeekPlanner) over generic this_week tasks. Today-scheduled
  // tasks come first; remaining slots fill from this_week.
  //
  // LOCAL date parts (matching the planner) - toISOString returns UTC,
  // which after ~5pm Pacific compares as "tomorrow" and silently hides
  // today's scheduled tasks.
  const _now = new Date();
  const todayISO =
    `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  const allTasks = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' });
  const scheduledToday = allTasks.filter((e) => {
    const fm = e.frontmatter;
    return (
      (fm as any)?.scheduled_day === todayISO &&
      (fm.status === 'pending' || fm.status === 'in_progress')
    );
  });
  const thisWeekUnscheduled = allTasks.filter((e) => {
    const fm = e.frontmatter;
    if ((fm as any)?.scheduled_day === todayISO) return false; // already counted
    return fm?.this_week === true && (fm.status === 'pending' || fm.status === 'in_progress');
  });
  const top = [...scheduledToday, ...thisWeekUnscheduled]
    .sort((a, b) => {
      // in_progress before pending within each group
      const sa = a.frontmatter.status === 'in_progress' ? 0 : 1;
      const sb = b.frontmatter.status === 'in_progress' ? 0 : 1;
      return sa - sb;
    })
    // Show ALL of today's scheduled tasks (no slice cap when scheduled
    // is non-empty); otherwise fall back to the old top-3 from this_week.
    .slice(0, scheduledToday.length > 0 ? scheduledToday.length + 2 : 3)
    .map((e) => {
      const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
      const title = titleMatch ? titleMatch[1]! : e.id;
      const fm = e.frontmatter;
      return {
        id: fm.id ?? e.id,
        title,
        status: fm.status,
        category: fm.category ?? 'other',
        project_id: fm.project ?? null,
        project_name: null, // resolved below
        project_kind: null,
      };
    });

  // Resolve project_name + kind from project_id via clients + projects.
  const clients = listClientNames();
  const projects = listProjectNames();
  for (const t of top) {
    if (!t.project_id) continue;
    const c = clients[t.project_id];
    const p = projects[t.project_id];
    if (c) {
      (t as any).project_name = c;
      (t as any).project_kind = 'client';
    } else if (p) {
      (t as any).project_name = p;
      (t as any).project_kind = 'project';
    }
  }

  // Focus goal: focus-primary if present, else first 'active' goal.
  const allGoals = loadCollection<GoalFrontmatter>('00_System/goals', { type: 'goal' });
  let primary = allGoals.find((g) => g.id === 'focus-primary' || g.frontmatter.parent_id == null);
  if (!primary) primary = allGoals[0];
  // If the primary goal targets paid SS members, merge in the latest member
  // count from state.md so the dial reflects reality.
  const stateForGoal = loadFile(abs('00_System', 'state.md'));
  const ssMembers = ((stateForGoal?.frontmatter as any)?.ss_members as number) ?? 0;
  const focus_goal = primary ? buildGoalShape(primary, ssMembers) : null;

  // Resolve the day window FIRST so every downstream filter agrees.
  // day_start (Unix sec, local midnight) is authoritative when present;
  // date string is a legacy fallback parsed as local midnight; otherwise
  // default to "now's" local midnight.
  let dayStartSec: number;
  const dayStartNum = dayStartParam ? Number(dayStartParam) : NaN;
  if (Number.isFinite(dayStartNum) && dayStartNum > 0) {
    dayStartSec = Math.floor(dayStartNum);
  } else if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    dayStartSec = Math.floor(new Date(`${requestedDate}T00:00:00`).getTime() / 1000);
  } else {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    dayStartSec = Math.floor(t.getTime() / 1000);
  }
  const dayEndSec = dayStartSec + 86400;
  const dayStr = localYmd(new Date(dayStartSec * 1000));

  const tasksDoneToday = allTasks.filter(
    (e) => (e.frontmatter as any).completed_at === dayStr
  ).length;

  const focus_current = focus_goal?.current_value ?? 0;
  const focus_target = focus_goal?.target_value ?? 0;
  if (focus_goal) (focus_goal as any).current_value = focus_current;
  const focus_pct = focus_target > 0 ? Math.min(1, focus_current / focus_target) : 0;

  // Deep work + strain computed locally so an edited block / changed target
  // reflects immediately without waiting on D1 sync.
  const state = loadFile(abs('00_System', 'state.md'));
  const dwTarget = ((state?.frontmatter as any)?.deep_work_target_seconds as number) ?? 7200;
  const allBlocks = readBlocksFile();
  const dayBlocks = allBlocks.filter(
    (b) => b.ended_at !== null && b.started_at >= dayStartSec && b.started_at < dayEndSec
  );
  const dwBlocks = dayBlocks.length;
  const dwSeconds = dayBlocks.reduce((acc, b) => acc + (b.duration_sec ?? 0), 0);

  // Pull completed tasks for the day (for strain calc - same tasks_done_today
  // we report below but with category/energy fields needed for the math).
  const completedTasksForStrain = allTasks
    .filter((e) => (e.frontmatter as any).completed_at === dayStr)
    .map((e) => ({
      id: (e.frontmatter as any).id ?? e.id,
      category: (e.frontmatter as any).category ?? 'other',
      energy: (e.frontmatter as any).energy ?? undefined,
    }));
  const strainScore = computeStrain(completedTasksForStrain, dayBlocks);

  return c.json({
    greeting: greetingFromHour(),
    date: requestedDate ?? localYmd(new Date()),
    focus_goal,
    top_tasks: top,
    rings: {
      strain_score: strainScore,
      strain_max: 21,
      tasks_done_today: tasksDoneToday,
      deep_work_blocks: dwBlocks,
      deep_work_seconds: dwSeconds,
      deep_work_target_seconds: dwTarget,
      focus_pct,
      focus_current,
      focus_target,
    },
  });
});

// Convert a goal entry to the shape the frontend expects: target_date is a
// unix-seconds number (not an ISO string), current_value reflects live state
// for SS-member-targeted goals.
function buildGoalShape(
  entry: ReturnType<typeof loadCollection<GoalFrontmatter>>[number],
  ssMembers: number
) {
  const fm = entry.frontmatter;
  const title = (entry.body.match(/^#\s+(.+?)\s*$/m)?.[1] ?? entry.id) as string;
  let current = fm.current_value ?? 0;
  // Heuristic: if the goal mentions paid members, current = live count.
  if (/paid members|solopreneur systems/i.test(title)) {
    current = ssMembers || current;
  }
  // Parse target_date - tolerate ISO date strings ("2026-07-13") and unix
  // seconds (already a number). Output is always unix seconds for the frontend.
  let targetDate: number | null = null;
  if (typeof fm.target_date === 'number') targetDate = fm.target_date;
  else if (typeof fm.target_date === 'string' && fm.target_date) {
    const t = Date.parse(fm.target_date);
    if (!Number.isNaN(t)) targetDate = Math.floor(t / 1000);
  }
  return {
    id: fm.id ?? entry.id,
    title,
    target_value: fm.target_value ?? null,
    current_value: current,
    target_date: targetDate,
    status: fm.status ?? 'active',
    parent_id: fm.parent_id ?? null,
  };
}

function listClientNames(): Record<string, string> {
  const out: Record<string, string> = {};
  const dir = abs('08_Service', 'clients');
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const clientFile = loadFile(abs('08_Service', 'clients', e.name, '_client.md'));
    if (!clientFile) continue;
    const fm = clientFile.frontmatter as any;
    if (fm?.id) out[fm.id] = fm.name ?? e.name;
  }
  return out;
}

function listProjectNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of loadCollection('00_System/projects', { type: 'project' })) {
    const fm = e.frontmatter as any;
    out[fm.id ?? e.id] = fm.name ?? e.id;
  }
  return out;
}

export default app;
