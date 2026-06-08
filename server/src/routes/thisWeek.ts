/**
 * This-week aggregation - shows pinned + per-day buckets for the current week.
 * Reads from tasks/<id>.md - groups by `section` frontmatter (e.g. "Monday").
 */

import { Hono } from 'hono';
import { loadCollection } from '../vault.js';

const app = new Hono();

const DAY_HEADINGS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function categoryHeadings(section: string): string | null {
  const s = section.toLowerCase();
  for (const day of DAY_HEADINGS) if (s.includes(day.toLowerCase())) return day;
  if (s.includes('other this-week')) return 'Other';
  return null;
}

app.get('/', (c) => {
  const entries = loadCollection('00_System/tasks', { type: 'task' });
  const pinned: any[] = [];
  const buckets: Record<string, any[]> = {};
  const order: string[] = [];
  let total = 0;

  for (const e of entries) {
    const fm = e.frontmatter as any;
    if (!fm?.this_week) continue;
    if (fm.status === 'completed') continue;
    const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
    const task = {
      id: fm.id ?? e.id,
      title: titleMatch ? titleMatch[1] : e.id,
      status: fm.status ?? 'pending',
      category: fm.category ?? 'other',
      project_id: fm.project ?? null,
      this_week: 1,
      pinned_today: !!fm.pinned_today ? 1 : 0,
    };
    total++;
    if (fm.pinned_today) {
      pinned.push(task);
      continue;
    }
    const heading = categoryHeadings(fm.section ?? '') ?? 'Other';
    if (!buckets[heading]) {
      buckets[heading] = [];
      order.push(heading);
    }
    buckets[heading]!.push(task);
  }

  // Order: weekdays in calendar order, then Other.
  const sortedOrder = [...DAY_HEADINGS, 'Other'].filter((h) => buckets[h]);
  const bucketsOut = sortedOrder.map((h) => ({ heading: h, tasks: buckets[h]! }));

  return c.json({ pinned, buckets: bucketsOut, total });
});

export default app;
