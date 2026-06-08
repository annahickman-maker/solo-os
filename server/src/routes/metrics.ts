/**
 * Metrics - aggregate snapshot for the Metrics page. Reads state.md for
 * top-line numbers and counts files for derived stats.
 *
 * Frontend expects:
 *   ss_members, ss_mrr, yt_subs, gumroad_mrr, tiktok_followers,
 *   total_gumroad_sales, students_count, lifetime_income, total_audience,
 *   videos_published_this_year, trend (subs/members/revenue arrays),
 *   videos_per_week, wins, student_wins
 */

import { Hono } from 'hono';
import { abs, loadCollection, loadFile } from '../vault.js';

const app = new Hono();

app.get('/', (c) => {
  const state = loadFile(abs('00_System', 'state.md'));
  const fm = (state?.frontmatter as Record<string, unknown>) ?? {};
  const ss_members = (fm.ss_members as number) ?? 0;
  const ss_mrr = (fm.ss_mrr_usd as number) ?? (fm.ss_mrr as number) ?? 0;
  const yt_subs = (fm.yt_subs as number) ?? 0;
  const gumroad_mrr = (fm.gumroad_mrr_usd as number) ?? (fm.gumroad_mrr as number) ?? 0;
  const tiktok_followers = (fm.tiktok_followers as number) ?? 0;
  const total_gumroad_sales = (fm.total_gumroad_sales as number) ?? 0;
  const students_count = (fm.students_count as number) ?? ss_members;
  const lifetime_income = (fm.lifetime_income_usd as number) ?? (fm.lifetime_income as number) ?? 0;

  // Count published videos this year from video files.
  const year = new Date().getUTCFullYear();
  const videos = loadCollection('04_Channel/04_Projects', { type: 'video' });
  let videosPublishedThisYear = 0;
  const weekCounts = new Array(7).fill(0);
  const nowSec = Math.floor(Date.now() / 1000);
  const startOfWeek = nowSec - 7 * 24 * 3600;

  for (const v of videos) {
    const fm = v.frontmatter as Record<string, unknown>;
    if (fm.status !== 'published') continue;
    const pd = fm.publish_date;
    let ts: number | null = null;
    if (typeof pd === 'number') ts = pd;
    else if (typeof pd === 'string' && pd) {
      const t = Date.parse(pd);
      if (!Number.isNaN(t)) ts = Math.floor(t / 1000);
    }
    if (!ts) continue;
    const date = new Date(ts * 1000);
    if (date.getUTCFullYear() === year) videosPublishedThisYear++;
    if (ts >= startOfWeek) {
      const dayIdx = Math.floor((ts - startOfWeek) / (24 * 3600));
      if (dayIdx >= 0 && dayIdx < 7) weekCounts[dayIdx]++;
    }
  }

  // Wins from state.md or empty until we migrate the wins bank.
  const wins = Array.isArray(fm.wins) ? (fm.wins as unknown[]) : [];
  const student_wins = Array.isArray(fm.student_wins) ? (fm.student_wins as unknown[]) : [];

  return c.json({
    ss_members,
    ss_mrr,
    yt_subs,
    gumroad_mrr,
    tiktok_followers,
    total_gumroad_sales,
    students_count,
    lifetime_income,
    total_audience: yt_subs + tiktok_followers,
    videos_published_this_year: videosPublishedThisYear,
    trend: { subs: [], members: [], revenue: [] },
    videos_per_week: weekCounts,
    wins,
    student_wins,
  });
});

export default app;
