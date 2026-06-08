/**
 * Settings - 00_System/state.md frontmatter. Simple K/V for dashboard
 * preferences like deep_work_target_seconds, youtube_target_per_weeks, etc.
 */

import { Hono } from 'hono';
import { abs, loadFile, saveFile } from '../vault.js';

const STATE_FILE_REL = ['00_System', 'state.md'] as const;
const DEFAULTS = {
  youtube_target_per_weeks: 1,
  deep_work_target_seconds: 7200,
  // Per-channel CTAs. Set these via the dashboard's Settings page once you
  // know the offer + link you want to drive viewers / followers to.
  instagram_cta_text: '',
  instagram_cta_url: '',
  youtube_cta_text: '',
  youtube_cta_url: '',
};

const app = new Hono();

app.get('/', (c) => {
  const entry = loadFile(abs(...STATE_FILE_REL));
  const fm = (entry?.frontmatter as Record<string, unknown>) ?? {};
  const ytPerWeeks = (fm.youtube_target_per_weeks as number) ?? DEFAULTS.youtube_target_per_weeks;
  // Per-channel CTAs. Read the canonical per-channel key first, fall back to
  // the legacy shared focus_cta_*, and finally to the default. This lets
  // existing vaults inherit whatever they had before the split.
  const legacyText = fm.focus_cta_text as string | undefined;
  const legacyUrl = fm.focus_cta_url as string | undefined;
  const igCtaText =
    (fm.instagram_cta_text as string | undefined) ?? legacyText ?? DEFAULTS.instagram_cta_text;
  const igCtaUrl =
    (fm.instagram_cta_url as string | undefined) ?? legacyUrl ?? DEFAULTS.instagram_cta_url;
  const ytCtaText =
    (fm.youtube_cta_text as string | undefined) ?? legacyText ?? DEFAULTS.youtube_cta_text;
  const ytCtaUrl =
    (fm.youtube_cta_url as string | undefined) ?? legacyUrl ?? DEFAULTS.youtube_cta_url;
  return c.json({
    youtube_target_per_weeks: ytPerWeeks,
    deep_work_target_seconds: (fm.deep_work_target_seconds as number) ?? DEFAULTS.deep_work_target_seconds,
    long_form_per_week:
      (fm.long_form_per_week as number | undefined) ?? (ytPerWeeks > 0 ? 1 / ytPerWeeks : 1),
    short_form_per_week: (fm.short_form_per_week as number | undefined) ?? 0,
    instagram_cta_text: igCtaText,
    instagram_cta_url: igCtaUrl,
    youtube_cta_text: ytCtaText,
    youtube_cta_url: ytCtaUrl,
    // Legacy aliases - kept so older frontend code that still reads these
    // names doesn't break. Map to the Instagram pair since that's what the
    // old single-CTA setup historically pointed at.
    focus_cta_text: igCtaText,
    focus_cta_url: igCtaUrl,
    ig_cta_text: igCtaText,
    ig_cta_url: igCtaUrl,
  });
});

app.patch('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const filePath = abs(...STATE_FILE_REL);
  const entry = loadFile(filePath);
  const fm = (entry?.frontmatter as Record<string, unknown>) ?? {};
  const next: Record<string, unknown> = { ...fm };
  if (typeof body.youtube_target_per_weeks === 'number')
    next.youtube_target_per_weeks = body.youtube_target_per_weeks;
  if (typeof body.deep_work_target_seconds === 'number')
    next.deep_work_target_seconds = body.deep_work_target_seconds;
  if (typeof body.long_form_per_week === 'number')
    next.long_form_per_week = body.long_form_per_week;
  if (typeof body.short_form_per_week === 'number')
    next.short_form_per_week = body.short_form_per_week;
  // Per-channel CTA keys - independent for IG vs YT.
  if (typeof body.instagram_cta_text === 'string') next.instagram_cta_text = body.instagram_cta_text;
  if (typeof body.instagram_cta_url === 'string') next.instagram_cta_url = body.instagram_cta_url;
  if (typeof body.youtube_cta_text === 'string') next.youtube_cta_text = body.youtube_cta_text;
  if (typeof body.youtube_cta_url === 'string') next.youtube_cta_url = body.youtube_cta_url;
  // Legacy keys - if someone PATCHes focus_cta_* or ig_cta_*, route into the
  // Instagram pair (that's where the legacy single CTA was used).
  if (typeof body.focus_cta_text === 'string') next.instagram_cta_text = body.focus_cta_text;
  if (typeof body.focus_cta_url === 'string') next.instagram_cta_url = body.focus_cta_url;
  if (typeof body.ig_cta_text === 'string') next.instagram_cta_text = body.ig_cta_text;
  if (typeof body.ig_cta_url === 'string') next.instagram_cta_url = body.ig_cta_url;
  next.updated = new Date().toISOString();
  saveFile(
    filePath,
    next,
    entry?.body ??
      '# Dashboard State\n\nAggregate metrics for the dashboard. Auto-updated by syncs; safe to edit by hand.\n'
  );
  return c.json({ ok: true });
});

export default app;
