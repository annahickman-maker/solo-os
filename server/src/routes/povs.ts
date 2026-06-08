/**
 * POVs - 05_Assets/POVs/<filename>.md (file-per-row, existing layout).
 *
 * Each POV has 4 narrative sections in its body (POV / Story / Why I believe /
 * How I'd use). We keep the body verbatim and project a structured response.
 */

import { createFileRoute, todayISO } from './_factory.js';

type PovFrontmatter = {
  id?: string;
  type: 'pov';
  title?: string;
  format?: 'short' | 'long';
  usage_count?: number;
  created?: string;
  updated?: string;
};

type PovResponse = {
  id: string;
  title: string;
  format: 'short' | 'long';
  content: string; // full body
  opinion: string; // POV section only
  usage_count: number;
  source_file: string;
  updated_at: number;
};

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const m = body.match(re);
  return m ? m[1]!.trim() : '';
}

export default createFileRoute<PovFrontmatter, PovResponse>({
  folder: '05_Assets/POVs',
  type: 'pov',
  toResponse: (entry) => {
    const fm = entry.frontmatter;
    if (fm?.type !== 'pov') return null;
    const opinion = extractSection(entry.body, 'POV');
    const titleMatch = entry.body.match(/^#\s+(.+?)\s*$/m);
    return {
      id: fm.id ?? entry.id,
      title: fm.title ?? (titleMatch ? titleMatch[1]! : entry.id),
      format: fm.format ?? 'short',
      content: entry.body,
      opinion: opinion || entry.body.trim().split('\n')[0] || '',
      usage_count: fm.usage_count ?? 0,
      source_file: entry.relPath,
      updated_at: entry.mtimeSec,
    };
  },
  fromCreate: (body) => {
    if (!body?.title) return null;
    const slug = body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const id = `pov-${slug}`;
    const today = todayISO();
    return {
      id,
      frontmatter: {
        id,
        type: 'pov',
        title: body.title,
        format: body.format ?? 'short',
        usage_count: 0,
        created: today,
        updated: today,
      },
      body:
        body.content ??
        `# ${body.title}\n\n## POV\n\n[Your contrarian take here.]\n\n## The Story Behind It\n\n[to be developed]\n\n## Why I Believe This\n\n[to be developed]\n\n## How I'd Use This In A Video\n\n[to be developed]\n`,
    };
  },
  applyPatch: (entry, body) => {
    const fm = { ...entry.frontmatter };
    if (body.title !== undefined) fm.title = body.title;
    if (body.format !== undefined) fm.format = body.format;
    if (body.usage_count !== undefined) fm.usage_count = body.usage_count;
    fm.updated = todayISO();
    let newBody = entry.body;
    if (body.content !== undefined) newBody = body.content;
    else if (body.title !== undefined) {
      newBody = `# ${body.title}\n${entry.body.replace(/^#\s+.+?\n/, '')}`;
    }
    return { frontmatter: fm, body: newBody };
  },
  sort: (a, b) => b.updated_at - a.updated_at,
});
