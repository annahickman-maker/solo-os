/**
 * One-shot extractors that populate brand profile slots, wins bank, and
 * micro-stories bank from the creator's core files via Claude.
 *
 * Triggered manually (POST /api/seed/from-core?target=slots|wins|stories|all).
 * Safe to re-run - merge logic prevents overwriting existing values.
 */

import { Hono } from 'hono';
import {
  extractBrandSlots,
  extractMicroStories,
  extractVerbatimMicroStories,
  extractWins,
  writeBrandSlotsToState,
  appendToBank,
} from '../lib/extractFromCore.js';

const app = new Hono();

app.post('/from-core', async (c) => {
  const target = c.req.query('target') ?? 'all';
  const result: Record<string, unknown> = {};

  try {
    if (target === 'all' || target === 'slots') {
      const slots = await extractBrandSlots();
      const out = writeBrandSlotsToState(slots);
      result.slots = { extracted: Object.keys(slots).filter((k) => slots[k]).length, ...out };
    }
    if (target === 'all' || target === 'wins') {
      const wins = await extractWins();
      const out = appendToBank('wins', wins);
      result.wins = { extracted: wins.length, ...out };
    }
    if (target === 'all' || target === 'stories') {
      const stories = await extractMicroStories();
      const out = appendToBank('micro-stories', stories);
      result.micro_stories = { extracted: stories.length, ...out };
    }
    if (target === 'verbatim-stories' || target === 'all-verbatim') {
      const stories = await extractVerbatimMicroStories();
      const out = appendToBank('micro-stories', stories);
      result.verbatim_micro_stories = { extracted: stories.length, ...out, source: 'video transcripts' };
    }
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('seed/from-core failed:', err);
    return c.json({ error: err?.message ?? 'extract failed', partial: result }, 500);
  }
});

export default app;
