/**
 * Projects - 00_System/projects/<id>.md
 */

import { createFileRoute, slugify, todayISO } from './_factory.js';

type ProjectFrontmatter = {
  id?: string;
  type: 'project';
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct: number;
  description?: string;
  created?: string;
  updated?: string;
};

type ProjectResponse = {
  id: string;
  name: string;
  status: ProjectFrontmatter['status'];
  progress_pct: number;
  description: string;
  notes: string;
  source_file: string;
  updated_at: number;
};

export default createFileRoute<ProjectFrontmatter, ProjectResponse>({
  folder: '00_System/projects',
  type: 'project',
  toResponse: (entry) => {
    const fm = entry.frontmatter;
    if (fm?.type !== 'project') return null;
    return {
      id: fm.id ?? entry.id,
      name: fm.name ?? entry.id,
      status: fm.status ?? 'planned',
      progress_pct: typeof fm.progress_pct === 'number' ? fm.progress_pct : 0,
      description: fm.description ?? '',
      notes: entry.body.replace(/^#\s+.+?\n/, '').trim(),
      source_file: entry.relPath,
      updated_at: entry.mtimeSec,
    };
  },
  fromCreate: (body) => {
    if (!body?.name) return null;
    const id = `proj-${slugify(body.name)}`;
    const today = todayISO();
    return {
      id,
      frontmatter: {
        id,
        type: 'project',
        name: body.name,
        status: body.status ?? 'planned',
        progress_pct: body.progress_pct ?? 0,
        description: body.description ?? '',
        created: today,
        updated: today,
      },
      body: `# ${body.name}\n${body.description ? `\n${body.description}\n` : ''}`,
    };
  },
  applyPatch: (entry, body) => {
    const fm = { ...entry.frontmatter };
    if (body.name !== undefined) fm.name = body.name;
    if (body.status !== undefined) fm.status = body.status;
    if (body.progress_pct !== undefined) fm.progress_pct = body.progress_pct;
    if (body.description !== undefined) fm.description = body.description;
    fm.updated = todayISO();
    let newBody = entry.body;
    if (body.name !== undefined) {
      newBody = `# ${body.name}\n${entry.body.replace(/^#\s+.+?\n/, '')}`;
    }
    return { frontmatter: fm, body: newBody };
  },
  applyFilters: (items, q) => {
    if (q.status) items = items.filter((x) => x.status === q.status);
    return items;
  },
  sort: (a, b) => {
    const order = { in_progress: 0, planned: 1, live: 2 } as const;
    return (order[a.status] ?? 99) - (order[b.status] ?? 99) || a.name.localeCompare(b.name);
  },
});
