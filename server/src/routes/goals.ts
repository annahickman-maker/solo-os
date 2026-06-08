/**
 * Goals - 00_System/goals/<id>.md
 */

import { createFileRoute, slugify, todayISO } from './_factory.js';

type GoalFrontmatter = {
  id?: string;
  type: 'goal';
  status: 'active' | 'achieved' | 'parked';
  target_value?: number | null;
  current_value?: number | null;
  target_date?: string | null;
  parent_id?: string | null;
  // 90-day revenue target ($/mo). Only meaningful on focus-primary; left
  // optional so other goals don't carry the field.
  mrr_target_usd?: number | null;
  // Used in the editor's calculator: members needed = revenue / avg_price.
  avg_member_price_usd?: number | null;
  created?: string;
  updated?: string;
};

type GoalResponse = {
  id: string;
  title: string;
  status: GoalFrontmatter['status'];
  target_value: number | null;
  current_value: number | null;
  target_date: string | null;
  parent_id: string | null;
  mrr_target_usd: number | null;
  avg_member_price_usd: number | null;
  source_file: string;
  updated_at: number;
};

export default createFileRoute<GoalFrontmatter, GoalResponse>({
  folder: '00_System/goals',
  type: 'goal',
  toResponse: (entry) => {
    const fm = entry.frontmatter;
    if (fm?.type !== 'goal') return null;
    const titleMatch = entry.body.match(/^#\s+(.+?)\s*$/m);
    return {
      id: fm.id ?? entry.id,
      title: titleMatch ? titleMatch[1]! : entry.id,
      status: fm.status ?? 'active',
      target_value: fm.target_value ?? null,
      current_value: fm.current_value ?? 0,
      target_date: fm.target_date ?? null,
      parent_id: fm.parent_id ?? null,
      mrr_target_usd: fm.mrr_target_usd ?? null,
      avg_member_price_usd: fm.avg_member_price_usd ?? null,
      source_file: entry.relPath,
      updated_at: entry.mtimeSec,
    };
  },
  fromCreate: (body) => {
    if (!body?.title) return null;
    const id = `goal-${slugify(body.title)}`;
    const today = todayISO();
    return {
      id,
      frontmatter: {
        id,
        type: 'goal',
        status: body.status ?? 'active',
        target_value: body.target_value ?? null,
        current_value: body.current_value ?? 0,
        target_date: body.target_date ?? null,
        parent_id: body.parent_id ?? null,
        created: today,
        updated: today,
      },
      body: `# ${body.title}\n`,
    };
  },
  applyPatch: (entry, body) => {
    const fm = { ...entry.frontmatter };
    if (body.status !== undefined) fm.status = body.status;
    if (body.target_value !== undefined) fm.target_value = body.target_value;
    if (body.current_value !== undefined) fm.current_value = body.current_value;
    if (body.target_date !== undefined) fm.target_date = body.target_date;
    if (body.parent_id !== undefined) fm.parent_id = body.parent_id;
    if (body.mrr_target_usd !== undefined) fm.mrr_target_usd = body.mrr_target_usd;
    if (body.avg_member_price_usd !== undefined) fm.avg_member_price_usd = body.avg_member_price_usd;
    fm.updated = todayISO();
    let newBody = entry.body;
    if (body.title !== undefined) {
      newBody = `# ${body.title}\n${entry.body.replace(/^#\s+.+?\n/, '')}`;
    }
    return { frontmatter: fm, body: newBody };
  },
  sort: (a, b) => {
    // Primary goals (no parent) first.
    return Number(!!a.parent_id) - Number(!!b.parent_id);
  },
});
