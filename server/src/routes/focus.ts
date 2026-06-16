/**
 * Focus - aggregates tasks + goals so the Focus page renders with the same
 * shape it expected from the old backend.
 */

import { Hono } from 'hono';
import { abs, loadCollection, loadFile } from '../vault.js';
import { resetStaleWeeklyTasks } from '../lib/weeklyReset.js';

const app = new Hono();

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
function deriveWeekday(fm: Record<string, unknown> | undefined | null): string | null {
  if (!fm) return null;
  const wd = (fm as any).scheduled_weekday;
  if (typeof wd === 'string' && (WEEKDAYS as readonly string[]).includes(wd)) return wd;
  const legacy = (fm as any).scheduled_day;
  if (typeof legacy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(legacy)) {
    const [y, m, d] = legacy.split('-').map(Number) as [number, number, number];
    const idx = new Date(y, m - 1, d).getDay();
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx]!;
  }
  return null;
}

type TaskFrontmatter = {
  id?: string;
  type: 'task';
  status: string;
  category?: string;
  this_week?: boolean;
  project?: string | null;
  energy?: number | null;
  due_date?: string | null;
  completed_at?: string;
  created?: string;
  updated?: string;
  // Day-of-week pin ("mon"..."sun") for the Focus WeekPlanner.
  // Persistent across weeks.
  scheduled_weekday?: string | null;
  // DEPRECATED legacy date pin - read-only migration fallback.
  scheduled_day?: string | null;
  // When true, this task is in a project's backlog and should be
  // hidden from the Focus page. Only the project / client detail
  // panel surfaces backlog tasks.
  backlog?: boolean;
};

type GoalFrontmatter = {
  type: 'goal';
  status?: string;
  target_value?: number;
  current_value?: number;
  target_date?: string;
  parent_id?: string | null;
  mrr_target_usd?: number | null;
  avg_member_price_usd?: number | null;
};

app.get('/', (c) => {
  // Throttled (1/min): flip stale this_week tasks back to master-todo
  // when the ISO week has rolled over.
  resetStaleWeeklyTasks();
  // Backlog tasks are scoped to their project / client detail panel
  // only - the Focus page (master todo + WeekPlanner) hides them so
  // your priority view stays focused. Filter at the source.
  const allTasks = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' })
    .filter((e) => (e.frontmatter as any)?.backlog !== true);

  // Weekday-pinned tasks persist forever - the WeekPlanner is now keyed
  // by day-of-week, not by date, so there's no "stale" condition to
  // sweep. Tasks stay in their column until completed or moved.

  const tasks = allTasks.map((e) => {
    const fm = e.frontmatter;
    const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
    return {
      id: fm.id ?? e.id,
      title: titleMatch ? titleMatch[1]! : e.id,
      status: fm.status ?? 'pending',
      category: fm.category ?? 'other',
      this_week: fm.this_week ? 1 : 0,
      project_id: fm.project ?? null,
      project_name: null,
      project_kind: null,
      energy: typeof fm.energy === 'number' ? fm.energy : null,
      due_date: fm.due_date ?? null,
      created_at: fm.created ?? null,
      updated_at: fm.updated ?? null,
      completed_at: fm.completed_at ?? null,
      source_file: e.relPath,
      // Weekday this task is pinned to in the WeekPlanner. Read the
      // new field; fall back to deriving from the legacy scheduled_day
      // ISO date so pre-rollout planning carries forward seamlessly.
      scheduled_weekday: deriveWeekday(fm),
    };
  });

  const allGoals = loadCollection<GoalFrontmatter>('00_System/goals', { type: 'goal' });
  const primary = allGoals.find((g) => g.frontmatter.parent_id == null) ?? allGoals[0];
  const subs = allGoals.filter(
    (g) => g.frontmatter.parent_id != null && g.frontmatter.parent_id === (primary?.id ?? null)
  );

  // Merge live SS member count from state.md into SS-related goals.
  const stateForGoal = loadFile(abs('00_System', 'state.md'));
  const ssMembers = ((stateForGoal?.frontmatter as any)?.ss_members as number) ?? 0;
  const ssMrrUsd = ((stateForGoal?.frontmatter as any)?.ss_mrr_usd as number) ?? 0;
  const stateFm = (stateForGoal?.frontmatter ?? {}) as Record<string, unknown>;
  const ytTargetPerWeeks = (stateFm.youtube_target_per_weeks as number) ?? 1;
  // New, more dynamic cadence fields (per-week rates). Fall back to converting
  // the legacy youtube_target_per_weeks (which is "1 every N weeks") so existing
  // setups keep working.
  const longFormPerWeek =
    (stateFm.long_form_per_week as number | undefined) ??
    (ytTargetPerWeeks > 0 ? 1 / ytTargetPerWeeks : 1);
  const shortFormPerWeek = (stateFm.short_form_per_week as number | undefined) ?? 0;

  function goalShape(g: typeof allGoals[number]) {
    const fm = g.frontmatter;
    const titleMatch = g.body.match(/^#\s+(.+?)\s*$/m);
    const title = titleMatch ? titleMatch[1]! : g.id;
    let current = fm.current_value ?? 0;
    if (/paid members|the offer/i.test(title)) {
      current = ssMembers || current;
    }
    // Convert ISO date string to unix seconds (frontend expects number)
    let targetDate: number | null = null;
    if (typeof fm.target_date === 'number') targetDate = fm.target_date;
    else if (typeof fm.target_date === 'string' && fm.target_date) {
      const t = Date.parse(fm.target_date);
      if (!Number.isNaN(t)) targetDate = Math.floor(t / 1000);
    }
    return {
      id: g.id,
      title,
      target_value: fm.target_value ?? null,
      current_value: current,
      target_date: targetDate,
      status: fm.status ?? 'active',
      parent_id: fm.parent_id ?? null,
      mrr_target_usd: fm.mrr_target_usd ?? null,
    };
  }

  return c.json({
    goal: primary ? goalShape(primary) : null,
    sub_goals: subs.map(goalShape),
    tasks,
    // 90-day-focus knobs surfaced together so the editor can read/write them.
    targets: {
      mrr_target_usd: primary?.frontmatter.mrr_target_usd ?? null,
      member_target: primary?.frontmatter.target_value ?? null,
      avg_member_price_usd: primary?.frontmatter.avg_member_price_usd ?? null,
      revenue_model: (primary?.frontmatter as any)?.revenue_model ?? null,
      youtube_target_per_weeks: ytTargetPerWeeks,
      long_form_per_week: longFormPerWeek,
      short_form_per_week: shortFormPerWeek,
      target_date: primary?.frontmatter.target_date ?? null,
      current_mrr_usd: ssMrrUsd,
      current_members: ssMembers,
    },
  });
});

export default app;
