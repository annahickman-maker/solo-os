/**
 * Weekly auto-reset for tasks dragged into "This Week".
 *
 * Rule: when the creator drags a task into the week, it stays this_week=true
 * until the end of the ISO week (Monday-Sunday). If she hasn't ticked
 * it off by Monday morning, it auto-flips this_week=false so it falls
 * back into master-todo and she can re-plan it.
 *
 * Implementation:
 *   - When a task is patched with this_week=true, we also stamp the
 *     current ISO week onto the file as `this_week_iso_week`.
 *   - On each task-related read, we call resetStaleWeeklyTasks() once
 *     per minute (cheap, idempotent) to flip any tasks whose stamp is
 *     older than the current week and that aren't completed.
 *   - Completed tasks are left alone (so the "Recently Done" view still
 *     shows them).
 *
 * No cron, no race conditions, no server restart needed at week rollover.
 */

import { loadCollection, saveFile, VAULT_ROOT } from '../vault.js';
import path from 'node:path';

/**
 * Return the current ISO week as "YYYY-Www" (e.g. "2026-W23").
 * Week starts Monday; weeks belong to the year that contains their Thursday.
 */
export function isoWeekString(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Throttle: only do a real sweep once per minute. Reads happen often;
 * walking the tasks folder every time is wasteful.
 */
let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

type TaskFrontmatter = {
  type?: string;
  status?: string;
  this_week?: boolean;
  this_week_iso_week?: string;
  section?: string;
  scheduled_day?: string | null;
  [k: string]: unknown;
};

/**
 * Walk 00_System/tasks/ and flip stale this_week tasks back to master-todo.
 *
 * Stale = this_week === true AND this_week_iso_week !== currentWeek
 *         AND status !== 'completed'
 *
 * Safe to call on every read - throttled to one real sweep per minute.
 */
export function resetStaleWeeklyTasks(): { reset: number; checked: number } {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return { reset: 0, checked: 0 };
  lastSweepAt = now;

  const currentWeek = isoWeekString();
  const entries = loadCollection<TaskFrontmatter>('00_System/tasks', { type: 'task' });
  let reset = 0;

  for (const entry of entries) {
    const fm = entry.frontmatter;
    if (!fm?.this_week) continue;
    if (fm.status === 'completed') continue;
    const stamped = typeof fm.this_week_iso_week === 'string' ? fm.this_week_iso_week : null;
    if (stamped === currentWeek) continue;
    // Stale: flip it back to master-todo. Do NOT clear the WeekPlanner
    // weekday pin - those are persistent across weeks now and only
    // change when the user moves them or completes the task.
    const nextFm: TaskFrontmatter = {
      ...fm,
      this_week: false,
      this_week_iso_week: undefined,
      section: '',
      updated: new Date().toISOString().slice(0, 10),
    };
    // Drop undefined keys so YAML doesn't emit "null" for them.
    for (const k of Object.keys(nextFm) as (keyof TaskFrontmatter)[]) {
      if (nextFm[k] === undefined) delete nextFm[k];
    }
    const absPath = path.join(VAULT_ROOT, entry.relPath);
    saveFile(absPath, nextFm as Record<string, unknown>, entry.body);
    reset++;
  }

  return { reset, checked: entries.length };
}

/**
 * Stamp helper: call when a task is patched with this_week=true so the
 * weekly-reset sweep can later detect when it's gone stale.
 */
export function stampThisWeek(): string {
  return isoWeekString();
}
