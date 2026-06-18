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
import { resetStaleWeeklyTasks } from '../lib/weeklyReset.js';

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

// Greeting reads the user's wall-clock hour and the name slot in state.md.
// Without a name it's "morning" / "afternoon" / "evening"; with a name it's
// "morning {name}" etc. The bare "hello" fallback was a placeholder that
// felt unfinished on first-load.
function greetingFromHour(hour?: number, name?: string): string {
  const h = typeof hour === 'number' ? hour : new Date().getHours();
  const tod = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const trimmed = (name ?? '').trim();
  return trimmed ? `${tod} ${trimmed.toLowerCase()}` : tod;
}

// Local wall-clock YYYY-MM-DD. We use local time everywhere so "today"
// matches the user's wall clock, not whatever UTC says after 5pm Pacific.
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Impact weighting. Each completed task contributes base*energy with mild
// diminishing returns; each completed deep-work block (not linked to a
// counted task) contributes base*hours capped at 2x base.
//
// Weights are calibrated against the creator's own read of recent days:
//   - 2 filming tasks alone = high-impact day (~15 / 20)
//   - 1 strategy/Q&A call + 1 video edit = solid day (~11 / 20)
// Ranked highest → lowest: filming > calls (operations) > scripting >
// building > admin > other.
const CATEGORY_WEIGHT: Record<string, number> = {
  filming: 8.0,
  operations: 7.0,
  scripting: 5.5,
  building: 4.5,
  admin: 1.5,
  other: 1.0,
};
const ENERGY_MULT: Record<string, number> = { high: 1.3, medium: 1.0, low: 0.7 };
// Slower decay than the old 0.88 - a busy multi-task day shouldn't get
// crushed by the 3rd or 4th completion.
const TASK_DECAY = 0.92;
const IMPACT_MAX = 20;

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
  const FALLBACK_WEIGHT = CATEGORY_WEIGHT.other!;
  const sorted = [...completedTasks].sort(
    (a, b) =>
      (CATEGORY_WEIGHT[b.category ?? 'other'] ?? FALLBACK_WEIGHT) -
      (CATEGORY_WEIGHT[a.category ?? 'other'] ?? FALLBACK_WEIGHT)
  );
  let strain = 0;
  let i = 0;
  for (const t of sorted) {
    const base = CATEGORY_WEIGHT[t.category ?? 'other'] ?? FALLBACK_WEIGHT;
    const energy = ENERGY_MULT[t.energy ?? ''] ?? 1.0;
    const decay = Math.pow(TASK_DECAY, i);
    strain += base * energy * decay;
    i++;
  }
  const countedIds = new Set(completedTasks.map((t) => t.id).filter(Boolean) as string[]);
  for (const b of blocks) {
    if (b.task_id && countedIds.has(b.task_id)) continue;
    const base = CATEGORY_WEIGHT[b.category ?? 'other'] ?? FALLBACK_WEIGHT;
    const hours = Math.max(0.1, (b.duration_sec ?? 0) / 3600);
    strain += base * Math.min(2, hours);
  }
  return Math.min(IMPACT_MAX, Math.round(strain * 10) / 10);
}

app.get('/', async (c) => {
  // Throttled (1/min): flip stale this_week tasks back to master-todo
  // when the ISO week has rolled over.
  resetStaleWeeklyTasks();
  const requestedDate = c.req.query('date');
  const dayStartParam = c.req.query('day_start');

  // Top tasks: prefer anything pinned to the VIEWED day's weekday in the
  // Focus page's WeekPlanner over generic this_week tasks. Weekday-pinned
  // tasks come first; remaining slots fill from this_week.
  //
  // The WeekPlanner stores a day-of-week string ("mon"..."sun"), not a
  // date - so a task pinned to "wed" surfaces every Wednesday. When the
  // user toggles the Today page to yesterday/tomorrow/etc., we need to
  // pick the weekday of THAT day, not whatever today's calendar says, or
  // the task list won't update with the date picker.
  function pickViewedWeekday(): string {
    const wdNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayStartNum = dayStartParam ? Number(dayStartParam) : NaN;
    if (Number.isFinite(dayStartNum) && dayStartNum > 0) {
      return wdNames[new Date(dayStartNum * 1000).getDay()]!;
    }
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      const [y, m, d] = requestedDate.split('-').map(Number) as [number, number, number];
      return wdNames[new Date(y, m - 1, d).getDay()]!;
    }
    return wdNames[new Date().getDay()]!;
  }
  const viewedWeekday = pickViewedWeekday();

  const allTasks = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' });
  function taskWeekday(fm: any): string | null {
    const wd = fm?.scheduled_weekday;
    if (typeof wd === 'string') return wd;
    const legacy = fm?.scheduled_day;
    if (typeof legacy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(legacy)) {
      const [y, m, d] = legacy.split('-').map(Number) as [number, number, number];
      const idx = new Date(y, m - 1, d).getDay();
      return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx]!;
    }
    return null;
  }
  const scheduledToday = allTasks.filter((e) => {
    const fm = e.frontmatter;
    return (
      taskWeekday(fm) === viewedWeekday &&
      (fm.status === 'pending' || fm.status === 'in_progress')
    );
  });
  const thisWeekUnscheduled = allTasks.filter((e) => {
    const fm = e.frontmatter;
    if (taskWeekday(fm) === viewedWeekday) return false; // already counted
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

  // Pull the user's name from state.md slot_user_name if set, fall back to
  // slot_first_name. Greeting reads as "morning the creator" / "evening" etc.
  const stateFm = (loadFile(abs('00_System', 'state.md'))?.frontmatter ?? {}) as Record<string, unknown>;
  const nameSlot =
    typeof stateFm.slot_user_name === 'string' && stateFm.slot_user_name.trim()
      ? (stateFm.slot_user_name as string)
      : typeof stateFm.slot_first_name === 'string' && stateFm.slot_first_name.trim()
      ? (stateFm.slot_first_name as string)
      : undefined;

  return c.json({
    greeting: greetingFromHour(undefined, nameSlot),
    date: requestedDate ?? localYmd(new Date()),
    focus_goal,
    top_tasks: top,
    rings: {
      strain_score: strainScore,
      strain_max: IMPACT_MAX,
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
  if (/paid members|the offer/i.test(title)) {
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
