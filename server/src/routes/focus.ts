/**
 * Focus - aggregates tasks + goals so the Focus page renders with the same
 * shape it expected from the old backend.
 */

import { Hono } from 'hono';
import { abs, loadCollection, loadFile, saveFile } from '../vault.js';

const app = new Hono();

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
  // ISO date string (YYYY-MM-DD) - which day this task is planned for
  // in the Focus page's WeekPlanner. Bubbled up by /api/focus so the
  // planner cache stays in sync after a drop.
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
  // Backlog tasks are scoped to their project / client detail panel
  // only - the Focus page (master todo + WeekPlanner) hides them so
  // your priority view stays focused. Filter at the source so the
  // sweep + downstream map only see priority tasks.
  let allTasks = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' })
    .filter((e) => (e.frontmatter as any)?.backlog !== true);

  // ─── Stale scheduled-day rescue ────────────────────────────────────────
  // If a task was scheduled for a past day but never marked complete,
  // clear its scheduled_day so it falls back into the master todo list
  // (visible + droppable into a new day). The user's mental model:
  // "the day passed and I didn't do it - put it back in front of me".
  //
  // Use LOCAL date parts here. toISOString() returns UTC, which after
  // ~5pm Pacific is already "tomorrow" and silently sweeps today's
  // scheduled tasks because their YYYY-MM-DD compares less-than UTC's.
  // The WeekPlanner generates day ISOs from local parts for the same
  // reason, so this matches up.
  const _now = new Date();
  const todayISO =
    `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;
  let sweptAny = false;
  for (const e of allTasks) {
    const fm = e.frontmatter;
    const day = (fm as any)?.scheduled_day;
    if (
      typeof day === 'string' &&
      day < todayISO &&
      fm?.status !== 'completed'
    ) {
      // Strip scheduled_day from the frontmatter and persist.
      const next = { ...fm };
      delete (next as any).scheduled_day;
      saveFile(abs(e.relPath), next as Record<string, unknown>, e.body);
      sweptAny = true;
    }
  }
  // Reload after a sweep so the downstream map sees the cleared state.
  if (sweptAny) {
    allTasks = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' });
  }

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
      // Day this task is scheduled for in the Focus page's WeekPlanner.
      // Without this here, the refetch after onMutate would drop the
      // freshly-scheduled task back to undefined and the day column
      // would visually empty out (the "task disappears on drop" bug).
      scheduled_day: (fm as any).scheduled_day ?? null,
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
