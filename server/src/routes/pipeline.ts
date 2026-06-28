/**
 * Pipeline - aggregates projects + clients + videos for the Projects page.
 * Same shape as the old /api/pipeline endpoint expected.
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import { abs, loadCollection, loadFile } from '../vault.js';

const app = new Hono();

app.get('/', (c) => {
  // Projects (file-based)
  const projects = loadCollection('00_System/projects', { type: 'project' })
    .filter((e) => !(e.frontmatter as any).archived)
    .map((e) => {
      const fm = e.frontmatter as any;
      return {
        id: fm.id ?? e.id,
        name: fm.name ?? e.id,
        kind: 'project' as const,
        status: fm.status ?? 'planned',
        progress_pct: fm.progress_pct ?? 0,
        description: fm.description ?? '',
        archived: !!fm.archived,
        sort_order: fm.sort_order ?? 0,
        created_at: fm.created ?? null,
        updated_at: e.mtimeSec,
      };
    });

  // Clients (file-based with auto-discovery)
  const clientsDir = abs('08_Service', 'clients');
  let clientDirs: fs.Dirent[];
  try {
    clientDirs = fs.readdirSync(clientsDir, { withFileTypes: true });
  } catch {
    clientDirs = [];
  }
  const clients: any[] = [];
  for (const d of clientDirs) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name.startsWith('_')) continue;
    const clientFile = loadFile(abs('08_Service', 'clients', d.name, '_client.md'));
    if (!clientFile) {
      // Skip soft-deleted folders (have archived _client.md in _archive/)
      const archive = abs('08_Service', 'clients', d.name, '_archive');
      try {
        const files = fs.readdirSync(archive);
        if (files.some((f) => f.endsWith('_client.md'))) continue;
      } catch {}
      // Auto-discover
      clients.push({
        id: `client-${d.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`,
        name: d.name,
        kind: 'client',
        status: 'in_progress',
        progress_pct: 0,
        description: '',
        archived: false,
        created_at: null,
        updated_at: 0,
      });
      continue;
    }
    const fm = clientFile.frontmatter as any;
    clients.push({
      id: fm.id,
      name: fm.name,
      kind: 'client',
      status: fm.status ?? 'in_progress',
      progress_pct: fm.progress_pct ?? 0,
      description: fm.description ?? '',
      archived: !!fm.archived,
      created_at: fm.created ?? null,
      updated_at: clientFile.mtimeSec,
    });
  }
  clients.sort((a, b) => a.name.localeCompare(b.name));

  // Videos (file-based; not archived)
  // publish_date: tolerate ISO string ("2026-05-13") or unix seconds.
  // Normalize to unix seconds because the frontend sorts numerically.
  function toUnixSeconds(v: unknown): number | null {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
    return null;
  }
  const videos = loadCollection('04_Channel/04_Projects', { type: 'video' })
    .filter((e) => !(e.frontmatter as any).archived)
    .map((e) => {
      const fm = e.frontmatter as any;
      const titleMatch = e.body.match(/^#\s+(.+?)\s*$/m);
      return {
        id: fm.id ?? e.id,
        title: fm.title ?? (titleMatch ? titleMatch[1] : e.id),
        status: fm.status ?? 'idea',
        cta: fm.cta ?? null,
        goal: fm.goal ?? null,
        queue_order: fm.queue_order ?? null,
        publish_date: toUnixSeconds(fm.publish_date),
        youtube_url: fm.youtube_url ?? null,
        youtube_id: fm.youtube_id ?? null,
        view_count: fm.view_count ?? null,
        like_count: fm.like_count ?? null,
        comment_count: fm.comment_count ?? null,
        duration_sec: fm.duration_sec ?? null,
        ctr_pct: fm.ctr_pct ?? null,
        sub_rate_pct: fm.sub_rate_pct ?? null,
        conversion_pct: fm.conversion_pct ?? null,
        archived: false,
        queued: fm.queued ?? 0,
        // Does this video have a transcript to work from? (published YT videos
        // get one on sync; filmed drafts can have one too.) The Description
        // Generator picker filters on this.
        has_transcript: fm.has_transcript === true || !!fm.transcript_path || /##\s+Transcript/i.test(e.body),
        source_file: e.relPath,
        updated_at: e.mtimeSec,
      };
    });
  // Sort: queued/non-queue order first, then by publish_date desc for published.
  videos.sort((a, b) => {
    // Sort published videos by publish_date desc.
    if (a.status === 'published' && b.status === 'published') {
      return (b.publish_date ?? 0) - (a.publish_date ?? 0);
    }
    // Published videos AFTER non-published.
    if (a.status === 'published') return 1;
    if (b.status === 'published') return -1;
    return (a.queue_order ?? 999) - (b.queue_order ?? 999);
  });

  // Weekly publish grid - count published videos per ISO week for the year.
  const year = new Date().getUTCFullYear();
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / 1000);
  const weekSec = 7 * 24 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const currentWeek = Math.floor((nowSec - jan1) / weekSec);
  const weekly_publish_year: (number | null)[] = [];
  // publish_date is already unix seconds at this point (we normalized above),
  // so use the values directly - no second `new Date()` conversion.
  const publishedDates = videos
    .filter((v) => v.status === 'published' && typeof v.publish_date === 'number')
    .map((v) => v.publish_date as number);
  for (let i = 0; i < 52; i++) {
    if (i > currentWeek) {
      weekly_publish_year.push(null);
      continue;
    }
    const start = jan1 + i * weekSec;
    const end = start + weekSec;
    weekly_publish_year.push(publishedDates.filter((d) => d >= start && d < end).length);
  }

  // YouTube last sync from state.md. Normalize to unix seconds: state.md
  // stores it as an ISO string, but the frontend formats it as `new Date(x * 1000)`.
  const state = loadFile(abs('00_System', 'state.md'));
  const rawLastSync = (state?.frontmatter as any)?.yt_last_sync;
  let youtube_last_sync: number | null = null;
  if (typeof rawLastSync === 'number') youtube_last_sync = rawLastSync;
  else if (typeof rawLastSync === 'string' && rawLastSync) {
    const t = Date.parse(rawLastSync);
    if (!Number.isNaN(t)) youtube_last_sync = Math.floor(t / 1000);
  }

  return c.json({
    videos,
    ss_modules: projects,
    clients,
    weekly_publish_year,
    youtube_last_sync,
  });
});

export default app;
