/**
 * Offers - file-backed Offer page.
 *
 * Storage:
 *   - Offer profile + section slots + self-rates -> state.md frontmatter (offer_* keys)
 *   - Pricing rungs, results, testimonials -> 00_System/offer-banks.json
 *   - Avatars -> 05_Assets/Avatars/<file>.md (already file-per-row)
 */

import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { abs, loadFile, saveFile } from '../vault.js';
import { BRIDGE_URL } from '../lib/bridge.js';
import { buildOffersResponse, setFeaturedRung, clearFeaturedRung } from '../lib/offersPage.js';
import { analyzeSection, type SectionKey as AnalysisSection } from '../lib/offerAnalysis.js';

const app = new Hono();

// ─── Main GET ──────────────────────────────────────────────────────────────

app.get('/', (c) => {
  return c.json(buildOffersResponse());
});

// ─── Slot + rating updates (state.md) ──────────────────────────────────────

function setStateField(field: string, value: unknown): void {
  const filePath = abs('00_System', 'state.md');
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}), [field]: value, updated: new Date().toISOString() };
  saveFile(
    filePath,
    fm as Record<string, unknown>,
    existing?.body ?? '# Dashboard State\n\nAggregate metrics for the dashboard.\n'
  );
}

app.patch('/slots', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { slot?: string; value?: any } | null;
  if (!body?.slot) return c.json({ error: 'slot required' }, 400);
  setStateField(`offer_${body.slot}`, body.value ?? null);
  return c.json({ ok: true });
});

// PATCH /api/offers/pricing-rungs/:id/slots
//
// Per-rung slot writer. Writes to `offer_rung_<rungId>_<slot>` so each
// pricing rung has its own independent state for validation checks,
// proof promise text, pinned proof ids, etc. - what's ticked on one
// rung doesn't bleed into another.
app.patch('/pricing-rungs/:id/slots', async (c) => {
  const rungId = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { slot?: string; value?: any } | null;
  if (!body?.slot) return c.json({ error: 'slot required' }, 400);
  setStateField(`offer_rung_${rungId}_${body.slot}`, body.value ?? null);
  return c.json({ ok: true });
});

// PATCH /api/offers/pricing-rungs/:id/proof-pin {id, pinned}
//
// Per-rung pin toggle. Adds/removes a proof bank entry from this rung's
// pinned set (offer_rung_<rungId>_pinned_proof_ids). Each rung has its
// own independent set - pinning the same bank entry on rung A doesn't
// pin it on rung B.
app.patch('/pricing-rungs/:id/proof-pin', async (c) => {
  const rungId = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { id?: string; pinned?: boolean } | null;
  if (!body?.id || typeof body.pinned !== 'boolean') {
    return c.json({ error: 'id (string) + pinned (boolean) required' }, 400);
  }
  const existing = loadFile(abs('00_System', 'state.md'));
  const fm = (existing?.frontmatter ?? {}) as Record<string, unknown>;
  const slotKey = `offer_rung_${rungId}_pinned_proof_ids`;
  const raw = fm[slotKey];
  const current: string[] = Array.isArray(raw)
    ? (raw as unknown[]).filter((x) => typeof x === 'string') as string[]
    : typeof raw === 'string' && raw.length > 0
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const set = new Set(current);
  if (body.pinned) set.add(body.id);
  else set.delete(body.id);
  setStateField(slotKey, [...set]);
  return c.json({ ok: true, pinned_proof_ids: [...set] });
});

app.patch('/ratings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { slot?: string; score?: number } | null;
  if (!body?.slot || typeof body.score !== 'number') return c.json({ error: 'slot + score required' }, 400);
  const score = Math.max(1, Math.min(5, Math.round(body.score)));
  setStateField(`offer_strength_${body.slot}`, score);
  return c.json({ ok: true });
});

app.patch('/stage', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { stage?: string } | null;
  const valid = ['idea', 'validated', 'iterating', 'signature', 'scaling'];
  if (!body?.stage || !valid.includes(body.stage)) return c.json({ error: 'invalid stage' }, 400);
  setStateField('offer_stage', body.stage);
  return c.json({ ok: true });
});

// ─── Bank items (pricing rungs, results, testimonials) JSON-backed ─────────

type BankItem = { id: string; created_at: number; updated_at: number; [k: string]: any };

function bankPath(name: 'pricing-rungs' | 'pricing-results' | 'results' | 'testimonials' | 'emails' | 'short-form-links'): string {
  return abs('00_System', `offer-${name}.json`);
}
function loadBank<T extends BankItem>(name: 'pricing-rungs' | 'pricing-results' | 'results' | 'testimonials' | 'emails' | 'short-form-links'): T[] {
  try {
    return JSON.parse(fs.readFileSync(bankPath(name), 'utf8')) as T[];
  } catch {
    return [];
  }
}
function saveBank<T extends BankItem>(name: 'pricing-rungs' | 'pricing-results' | 'results' | 'testimonials' | 'emails' | 'short-form-links', items: T[]): void {
  fs.mkdirSync(path.dirname(bankPath(name)), { recursive: true });
  fs.writeFileSync(bankPath(name), JSON.stringify(items, null, 2), 'utf8');
}
function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function makeBankCRUD(name: 'pricing-rungs' | 'pricing-results' | 'results' | 'testimonials' | 'emails' | 'short-form-links', requiredField: string) {
  return {
    post: async (c: any) => {
      const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
      if (!body?.[requiredField]?.toString().trim()) return c.json({ error: `${requiredField} required` }, 400);
      const items = loadBank(name);
      const entry: BankItem = {
        id: crypto.randomUUID(),
        ...body,
        created_at: nowSec(),
        updated_at: nowSec(),
      };
      items.unshift(entry);
      saveBank(name, items);
      return c.json({ ok: true, id: entry.id });
    },
    patch: async (c: any) => {
      const id = c.req.param('id');
      const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
      if (!body) return c.json({ error: 'body required' }, 400);
      const items = loadBank(name);
      const idx = items.findIndex((x) => x.id === id);
      if (idx === -1) return c.json({ error: 'not found' }, 404);
      items[idx] = { ...items[idx]!, ...body, updated_at: nowSec() };
      saveBank(name, items);
      return c.json({ ok: true });
    },
    del: (c: any) => {
      const id = c.req.param('id');
      const items = loadBank(name).filter((x) => x.id !== id);
      saveBank(name, items);
      return c.json({ ok: true });
    },
  };
}

const rungs = makeBankCRUD('pricing-rungs', 'price_label');

/**
 * Toggle a rung's "featured" flag. Featured is single-occupancy across the
 * whole suite - setting one as featured clears it on all others.
 *
 * Registered BEFORE /pricing-rungs/:id so the literal "featured" path
 * isn't captured by the id param matcher.
 *
 * body: { id: string, featured: boolean }
 */
app.patch('/pricing-rungs/featured', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { id?: string; featured?: boolean } | null;
  if (!body?.id || typeof body.featured !== 'boolean') {
    return c.json({ error: 'id (string) + featured (boolean) required' }, 400);
  }
  if (body.featured) setFeaturedRung(body.id);
  else clearFeaturedRung();
  return c.json({ ok: true });
});

// Custom POST for pricing-rungs: do NOT require price_label on create.
// the creator wants to add a blank offer card and fill it in inline, so an empty
// price at creation time is valid.
app.post('/pricing-rungs', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  const items = loadBank('pricing-rungs');
  const entry: BankItem = {
    id: crypto.randomUUID(),
    price_label: typeof body?.price_label === 'string' ? body.price_label : '',
    ...(body ?? {}),
    created_at: nowSec(),
    updated_at: nowSec(),
  };
  // Ensure id from the spread doesn't get clobbered.
  entry.id = entry.id || crypto.randomUUID();
  items.unshift(entry);
  saveBank('pricing-rungs', items);
  return c.json({ ok: true, id: entry.id });
});
app.patch('/pricing-rungs/:id', rungs.patch);
app.delete('/pricing-rungs/:id', rungs.del);

/**
 * Analyze ONE section of ONE rung with Claude. Reads the rung's inputs +
 * supporting files (attached avatar markdown, pinned proof, fetched VSL),
 * sends to Claude with a strict scoring prompt, returns 5 scores + reasoning.
 *
 * body: { section: 'avatar' | 'pricing' | 'proof' | 'validation' | 'content' }
 */
app.post('/pricing-rungs/:id/analyze', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { section?: AnalysisSection } | null;
  if (!body?.section) return c.json({ error: 'section required' }, 400);
  const items = loadBank('pricing-rungs');
  const rung = items.find((x) => x.id === id);
  if (!rung) return c.json({ error: 'rung not found' }, 404);
  try {
    const result = await analyzeSection(body.section, rung);
    return c.json({ ok: true, ...result });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message ?? 'analysis failed' }, 500);
  }
});

// ─── Worker link-stats proxy ───────────────────────────────────────────────
// Fetches aggregated click counts from the Cloudflare worker for a given
// /go/<slug>. Used by the frontend's Conversions panel to auto-fill the
// "sales page clicks" field on short-form / VSL / email rows. The worker
// must be deployed with the /link-stats route (see wrangler.toml).
app.get('/link-stats', async (c) => {
  const slug = c.req.query('slug');
  const days = c.req.query('days') ?? '30';
  if (!slug) return c.json({ error: 'slug query param required' }, 400);
  const workerBase = process.env.LINK_STATS_BASE_URL ?? 'https://yourdomain.com';
  const url = `${workerBase}/link-stats?slug=${encodeURIComponent(slug)}&days=${encodeURIComponent(days)}`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    // Pass through the worker's status + body so frontend can show
    // "not deployed yet" / "slug not in manifest" distinctly.
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return c.json(
      {
        error: `could not reach worker: ${err?.message ?? String(err)}. has the worker been deployed with the /link-stats route?`,
      },
      502,
    );
  }
});

// ─── Tracking-link generator ───────────────────────────────────────────────
// Generates a `/go/<slug>` short link in the Cloudflare worker's link
// manifest, then patches the rung to store the slug. After this runs,
// the creator runs `cd 03_Projects/agents/worker && npm run deploy` to push the
// new slug live. If the manifest file is missing the response tells her
// exactly how to set it up.

const LINK_MANIFEST_PATH = abs('scripts', 'link_manifest.json');
const WORKER_DIR_REL = '03_Projects/agents/worker';

function slugifyForLink(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

/**
 * GET /api/offers/tracking-setup-status
 *
 * Tells the frontend whether the Cloudflare-worker link system is set up.
 * Used to decide between rendering the "Generate tracking link" button
 * vs the "Not set up - paste this in Claude" copy-paste setup prompt.
 */
app.get('/tracking-setup-status', async (c) => {
  const manifestExists = fs.existsSync(LINK_MANIFEST_PATH);
  const workerExists = fs.existsSync(abs(WORKER_DIR_REL));
  const ok = manifestExists && workerExists;
  return c.json({
    ok,
    manifest_exists: manifestExists,
    worker_exists: workerExists,
    manifest_path: 'scripts/link_manifest.json',
    worker_path: WORKER_DIR_REL,
    deploy_command: `cd ${WORKER_DIR_REL} && npm run deploy`,
    // If not set up, this is the exact prompt the creator pastes into Claude.
    setup_prompt: ok ? null : [
      'Set up the Cloudflare Worker tracking-link system for the dashboard.',
      '',
      'Requirements:',
      `1. A worker project at ${WORKER_DIR_REL} that handles routes like yourdomain.com/go/<slug>.`,
      '2. A bundled link manifest at scripts/link_manifest.json mapping slug -> { destination, source, created }.',
      '3. The worker reads the manifest at deploy time and serves a 302 redirect to the destination, logging clicks to a LINK_CLICKS KV namespace.',
      '4. A `npm run deploy` command in the worker that publishes the latest manifest to Cloudflare.',
      '',
      'Once set up, come back to the dashboard and click "Generate tracking link" again.',
    ].join('\n'),
  });
});

/**
 * POST /api/offers/pricing-rungs/:id/generate-tracking-link
 *
 * Body: { kind: 'vsl' | 'sales_page' }
 *
 * Reads the URL the user typed for that page (vsl_url / sales_page_url),
 * derives a short slug from the offer name + kind, writes the entry to
 * scripts/link_manifest.json, patches the rung's tracking-slug field,
 * and returns the deploy command the creator runs in her terminal to activate.
 */
app.post('/pricing-rungs/:id/generate-tracking-link', async (c) => {
  const id = c.req.param('id');
  // Only VSL has a generate-tracking-link path. Sales page IS the
  // destination of every tracking link in this offer's funnel - it
  // doesn't get its own /go/ link. Keep accepting the param so older
  // clients fail loudly rather than silently mis-route.
  const body = (await c.req.json().catch(() => null)) as { kind?: 'vsl' } | null;
  if (body?.kind !== 'vsl') {
    return c.json({ error: 'tracking links are only generated for the VSL - the sales page is the destination, not an upstream link.' }, 400);
  }

  const rungs = loadBank('pricing-rungs');
  const rung = rungs.find((x) => x.id === id);
  if (!rung) return c.json({ error: 'rung not found' }, 404);

  // VSL's tracking link points AT the sales page (the VSL drives viewers
  // there). So both URLs must be filled - VSL URL identifies the video,
  // sales page URL is the destination of the short link.
  const vslUrl = (rung.vsl_url || '').toString().trim();
  const salesUrl = (rung.sales_page_url || '').toString().trim();
  if (!salesUrl) {
    return c.json({ error: 'set the sales page URL first - the VSL tracking link points at the sales page.' }, 400);
  }
  if (!vslUrl) {
    return c.json({ error: 'set the VSL URL first so we know which video this link is for.' }, 400);
  }
  // The actual destination of /go/<slug> is the sales page. VSL URL is
  // metadata only (where the link is embedded).
  const url = salesUrl;
  const slugField = 'vsl_tracking_slug';

  // Validate the manifest exists. If it doesn't, return a 409 with the
  // setup prompt so the frontend can show the "not set up" prompt.
  if (!fs.existsSync(LINK_MANIFEST_PATH)) {
    return c.json({
      error: 'tracking system not set up',
      setup_required: true,
      message: 'The Cloudflare worker link manifest is missing. Use the setup prompt to configure it first.',
    }, 409);
  }

  // Derive slug. Base = slug(rung name or price label). Suffix = -vsl.
  const baseRaw = rung.name?.toString() || rung.price_label?.toString() || rung.id;
  const base = slugifyForLink(baseRaw) || 'offer';
  let slug = `${base}-vsl`.slice(0, 28);

  // Read manifest, ensure uniqueness, write entry, write back.
  let manifest: Record<string, any>;
  try {
    manifest = JSON.parse(fs.readFileSync(LINK_MANIFEST_PATH, 'utf8'));
  } catch (err: any) {
    return c.json({ error: `manifest unreadable: ${err?.message ?? String(err)}` }, 500);
  }
  // If the slug already exists pointing somewhere else, suffix a counter.
  let counter = 2;
  while (manifest[slug] && manifest[slug].destination !== url) {
    slug = `${base}-vsl-${counter}`.slice(0, 28);
    counter++;
    if (counter > 99) {
      return c.json({ error: 'could not find a unique slug after 99 tries - rename the offer.' }, 500);
    }
  }
  // ISO date without the time component (manifest convention).
  const today = new Date().toISOString().slice(0, 10);
  manifest[slug] = {
    destination: url,
    source: `dashboard · ${rung.name || rung.price_label || rung.id} · vsl → sales page`,
    created: today,
  };
  fs.writeFileSync(LINK_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Patch the rung's tracking-slug field.
  const idx = rungs.findIndex((x) => x.id === id);
  rungs[idx] = { ...rungs[idx]!, [slugField]: slug, updated_at: Math.floor(Date.now() / 1000) };
  saveBank('pricing-rungs', rungs);

  return c.json({
    ok: true,
    slug,
    short_url: `https://yourdomain.com/go/${slug}`,
    deploy_command: `cd ${WORKER_DIR_REL} && npm run deploy`,
    needs_deploy: true,
  });
});

const pricingResults = makeBankCRUD('pricing-results', 'title');
app.post('/pricing-results', pricingResults.post);
app.patch('/pricing-results/:id', pricingResults.patch);
app.delete('/pricing-results/:id', pricingResults.del);

// ─── Emails (per-offer upstream-link list) ─────────────────────────────────
// One row per email that leads to this offer's sales page. Tracking slug
// points at the rung's sales_page_url. Conversion = clicks / sends.
// Sends + clicks are manual for now; clicks will auto-pull from the worker
// stats endpoint once that ships.

app.get('/pricing-rungs/:id/emails', (c) => {
  const id = c.req.param('id');
  const all = loadBank('emails');
  return c.json({ items: all.filter((x) => x.rung_id === id) });
});

app.post('/pricing-rungs/:id/emails', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body?.subject?.toString().trim()) return c.json({ error: 'subject required' }, 400);
  const validKinds = ['one_time', 'launch', 'automated'];
  const kind = validKinds.includes(body.kind) ? body.kind : 'one_time';
  const items = loadBank('emails');
  // Simplified shape: subject + kind + one manual conversion rate.
  // (was: tracking_slug, sends_count, clicks_count, sent_at - all
  // dropped because email platforms already surface conversion rates
  // and the per-email /go/ link was overkill.)
  const entry = {
    id: crypto.randomUUID(),
    rung_id: id,
    subject: body.subject.toString().trim(),
    kind,
    conversion_rate_pct: typeof body.conversion_rate_pct === 'number' ? body.conversion_rate_pct : null,
    created_at: nowSec(),
    updated_at: nowSec(),
  };
  items.unshift(entry);
  saveBank('emails', items);
  return c.json({ ok: true, id: entry.id });
});

app.patch('/emails/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = loadBank('emails');
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  items[idx] = { ...items[idx]!, ...body, updated_at: nowSec() };
  saveBank('emails', items);
  return c.json({ ok: true });
});

app.delete('/emails/:id', (c) => {
  const id = c.req.param('id');
  const items = loadBank('emails').filter((x) => x.id !== id);
  saveBank('emails', items);
  return c.json({ ok: true });
});

// (per-email tracking-link generator removed - emails capture conversion
// rate manually from their email platform's own analytics, no /go/ link
// per email needed.)

// ─── Short-form content links (per-offer per-platform) ─────────────────────
// One row per platform the creator posts on (Instagram, LinkedIn, TikTok, etc.).
// Tracking slug points at the rung's sales_page_url. Each row tracks
// monthly clicks (auto from worker later) + monthly impressions (manual
// or per-platform API later) + conversion = clicks / impressions.

app.get('/pricing-rungs/:id/short-form-links', (c) => {
  const id = c.req.param('id');
  const all = loadBank('short-form-links');
  return c.json({ items: all.filter((x) => x.rung_id === id) });
});

app.post('/pricing-rungs/:id/short-form-links', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body?.platform?.toString().trim()) return c.json({ error: 'platform required' }, 400);
  const items = loadBank('short-form-links');
  const entry = {
    id: crypto.randomUUID(),
    rung_id: id,
    platform: body.platform.toString().trim(),
    tracking_slug: typeof body.tracking_slug === 'string' ? body.tracking_slug : '',
    // 3 per-platform rolling metrics, all 30d. The `actions_30d` field
    // was removed - it wasn't clear what it meant and didn't earn its
    // place. clicks_30d is now auto-pulled from the worker by the
    // frontend (still kept here for manual override / backfill).
    //   views_30d      - total reach on this platform's posts
    //   clicks_30d     - clicks on /go/<slug> (auto-pulled from worker)
    //   ctas_made_30d  - count of posts/videos that included a CTA
    views_30d: typeof body.views_30d === 'number' ? body.views_30d : null,
    clicks_30d: typeof body.clicks_30d === 'number' ? body.clicks_30d : null,
    ctas_made_30d: typeof body.ctas_made_30d === 'number' ? body.ctas_made_30d : null,
    created_at: nowSec(),
    updated_at: nowSec(),
  };
  items.unshift(entry);
  saveBank('short-form-links', items);
  return c.json({ ok: true, id: entry.id });
});

app.patch('/short-form-links/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = loadBank('short-form-links');
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  items[idx] = { ...items[idx]!, ...body, updated_at: nowSec() };
  saveBank('short-form-links', items);
  return c.json({ ok: true });
});

app.delete('/short-form-links/:id', (c) => {
  const id = c.req.param('id');
  const items = loadBank('short-form-links').filter((x) => x.id !== id);
  saveBank('short-form-links', items);
  return c.json({ ok: true });
});

app.post('/short-form-links/:id/generate-tracking-link', async (c) => {
  const id = c.req.param('id');
  const links = loadBank('short-form-links');
  const link = links.find((x) => x.id === id);
  if (!link) return c.json({ error: 'short-form link not found' }, 404);
  const rungs = loadBank('pricing-rungs');
  const rung = rungs.find((x) => x.id === link.rung_id);
  if (!rung) return c.json({ error: 'parent offer not found' }, 404);
  const salesUrl = (rung.sales_page_url || '').toString().trim();
  if (!salesUrl) {
    return c.json({ error: 'set the offer\'s sales page URL first.' }, 400);
  }
  if (!fs.existsSync(LINK_MANIFEST_PATH)) {
    return c.json({ error: 'tracking system not set up', setup_required: true }, 409);
  }
  const offerBase = slugifyForLink(rung.name || rung.price_label || rung.id) || 'offer';
  const platformSlug = slugifyForLink(link.platform || 'platform') || 'platform';
  let slug = `${offerBase}-${platformSlug}`.slice(0, 28);
  let manifest: Record<string, any>;
  try {
    manifest = JSON.parse(fs.readFileSync(LINK_MANIFEST_PATH, 'utf8'));
  } catch (err: any) {
    return c.json({ error: `manifest unreadable: ${err?.message ?? String(err)}` }, 500);
  }
  let counter = 2;
  while (manifest[slug] && manifest[slug].destination !== salesUrl) {
    slug = `${offerBase}-${platformSlug}-${counter}`.slice(0, 28);
    counter++;
    if (counter > 99) return c.json({ error: 'could not find unique slug' }, 500);
  }
  manifest[slug] = {
    destination: salesUrl,
    source: `dashboard · ${rung.name || rung.id} · ${link.platform} short-form`,
    created: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(LINK_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  const idx = links.findIndex((x) => x.id === id);
  links[idx] = { ...links[idx]!, tracking_slug: slug, updated_at: nowSec() };
  saveBank('short-form-links', links);
  return c.json({
    ok: true,
    slug,
    short_url: `https://yourdomain.com/go/${slug}`,
    deploy_command: `cd ${WORKER_DIR_REL} && npm run deploy`,
    needs_deploy: true,
  });
});

const results = makeBankCRUD('results', 'title');
app.post('/results', results.post);
app.patch('/results/:id', results.patch);
app.delete('/results/:id', results.del);

const testimonials = makeBankCRUD('testimonials', 'client_name');
app.post('/testimonials', testimonials.post);
app.patch('/testimonials/:id', testimonials.patch);
app.delete('/testimonials/:id', testimonials.del);

// Avatars: file-per-row source-of-truth (05_Assets/Avatars/*.md) merged with
// JSON-backed metadata in offer-results.json. The PATCH route below upserts -
// if the id is a file-derived synthetic ("avatar-<slug>") and no matching
// bank row exists yet, we create one with that slug as the name. That way
// the creator can edit a file-only avatar like the avatar for the first time without
// hitting 404.
const avatars = makeBankCRUD('results', 'name');
app.post('/avatars', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: string } | null;
  if (!body?.name?.trim()) return c.json({ error: 'name required' }, 400);
  return avatars.post(c);
});
app.patch('/avatars/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const items = loadBank('results');
  const idx = items.findIndex((x) => x.id === id);
  const nowSec = Math.floor(Date.now() / 1000);
  if (idx === -1) {
    // No bank row yet. If this is a file-derived id, derive a name from
    // the slug and create the row in place. The synthetic id is preserved
    // so subsequent PATCHes hit this same row.
    const slug = id.startsWith('avatar-') ? id.slice('avatar-'.length) : id;
    const derivedName = body.name?.toString().trim() || slug || 'unnamed';
    items.unshift({
      id,
      name: derivedName,
      ...body,
      created_at: nowSec,
      updated_at: nowSec,
    });
    saveBank('results', items);
    return c.json({ ok: true, created: true });
  }
  items[idx] = { ...items[idx]!, ...body, updated_at: nowSec };
  saveBank('results', items);
  return c.json({ ok: true });
});
app.delete('/avatars/:id', avatars.del);

/**
 * POST /avatars/:id/synthesise
 * Claude reads all the audience quotes attached to this avatar + the avatar's
 * current profile, then writes punchy in-voice bullets for the 4 fields:
 * before_state / struggles[] / after_state / outcomes[].
 *
 * Writes the result into the avatar's bank row (creating it if file-only).
 * Returns the generated fields so the frontend can refresh.
 */
app.post('/avatars/:id/synthesise', async (c) => {
  const id = c.req.param('id');
  // Load merged avatar (markdown + bank).
  const { default: mod } = await import('../lib/offersPage.js') as any;
  void mod;
  const { synthesiseAvatarFromQuotes } = await import('../lib/avatarSynthesis.js');
  const { readBank: readAudienceBank } = await import('../lib/audienceQuotes.js');
  // Look up the avatar via the offers response so we get the merged profile.
  const resp = (await import('../lib/offersPage.js')).buildOffersResponse();
  const avatarsSection = resp.sections.find((s: any) => s.id === 'avatar');
  const avatar = avatarsSection?.avatars?.find((a: any) => a.id === id);
  if (!avatar) return c.json({ error: 'avatar not found' }, 404);

  const audienceQuotes = readAudienceBank().quotes.filter(
    (q) => q.avatar_id === id && q.status !== 'dismissed',
  );
  if (audienceQuotes.length === 0) {
    return c.json({ error: 'no audience quotes attached to this avatar. attach some on a transcript page first.' }, 400);
  }

  let result;
  try {
    result = await synthesiseAvatarFromQuotes(
      {
        name: avatar.name,
        before_state: avatar.before_state,
        after_state: avatar.after_state,
        struggles: avatar.struggles,
        outcomes: avatar.outcomes,
      },
      audienceQuotes,
    );
  } catch (err: any) {
    return c.json({ error: err?.message ?? 'synthesis failed' }, 500);
  }

  // Upsert into the bank: same lazy-create pattern as PATCH /avatars/:id.
  const items = loadBank('results');
  const idx = items.findIndex((x) => x.id === id);
  const nowSec = Math.floor(Date.now() / 1000);
  const patch: Record<string, any> = {
    before_state: result.before_state,
    after_state: result.after_state,
    struggles: result.struggles,
    outcomes: result.outcomes,
  };
  if (idx === -1) {
    const slug = id.startsWith('avatar-') ? id.slice('avatar-'.length) : id;
    items.unshift({
      id,
      name: avatar.name ?? slug,
      ...patch,
      created_at: nowSec,
      updated_at: nowSec,
    });
  } else {
    items[idx] = { ...items[idx]!, ...patch, updated_at: nowSec };
  }
  saveBank('results', items);

  return c.json({ ok: true, ...result });
});

// POST /avatars/:id/generate-card-summary
//
// Asks Claude to write a ONE-sentence (~12-18 words) card-sized
// summary of who this avatar is. Distinct from `one_line` (which can be
// long/paragraph-y from the parsed .md). This summary is sized to fit
// the avatar sub-card on each offer rung without truncation.
//
// Stores the result on the avatar as `card_summary`. Idempotent: if you
// re-call, it overwrites with a fresh take.
app.post('/avatars/:id/generate-card-summary', async (c) => {
  const id = c.req.param('id');
  const items = loadBank('results');
  const bankRow = items.find((x) => x.id === id);
  const slug = id.startsWith('avatar-') ? id.slice('avatar-'.length) : id;
  const name = bankRow?.name?.toString() || slug;

  // Pull as much context as we have: parsed fields on the bank row +
  // raw markdown if a source file exists. The .md is where the deepest
  // context lives (fears, daily reality, motivations, etc.).
  const oneLine = bankRow?.one_line?.toString() || '';
  const beforeState = bankRow?.before_state?.toString() || '';
  const afterState = bankRow?.after_state?.toString() || '';
  const struggles = Array.isArray(bankRow?.struggles) ? bankRow.struggles : [];
  const outcomes = Array.isArray(bankRow?.outcomes) ? bankRow.outcomes : [];

  let mdContext = '';
  try {
    const mdPath = abs('05_Assets', 'Avatars', `avatar-${slug}.md`);
    if (fs.existsSync(mdPath)) {
      mdContext = fs.readFileSync(mdPath, 'utf8').slice(0, 6000);
    }
  } catch {}

  const userPrompt = [
    `Avatar name: ${name}`,
    oneLine ? `Existing one-line description: ${oneLine}` : '',
    beforeState ? `Before state: ${beforeState.slice(0, 400)}` : '',
    afterState ? `After state: ${afterState.slice(0, 400)}` : '',
    struggles.length ? `Their struggles:\n${struggles.slice(0, 5).map((s: string) => `- ${s}`).join('\n')}` : '',
    outcomes.length ? `What they want:\n${outcomes.slice(0, 5).map((s: string) => `- ${s}`).join('\n')}` : '',
    mdContext ? `\nFull source markdown:\n${mdContext}` : '',
  ].filter(Boolean).join('\n\n');

  const systemPrompt = [
    "You write one-sentence card-sized descriptions of customer avatars for the creator's dashboard.",
    '',
    'Output requirements:',
    '- EXACTLY ONE sentence.',
    '- 12 to 20 words MAX.',
    '- Plain present tense, third person ("she is", "he wants", "they have").',
    '- Concrete: include what they DO, what stage they\'re at, and the tension they sit in.',
    '- No hype, no jargon, no clichés.',
    '- Use the hyphen (`-`), NOT the em dash.',
    '- No quotes around the output. Just the sentence.',
    '',
    'Examples of the right shape:',
    '- "A Romanian illustrator with 14 years on Fiverr who is trying to replace client work with teaching income."',
    '- "A web designer two years into TikTok who has clients but no longer wants to trade time for money."',
    '',
    'Output ONLY the sentence. No preamble, no quotes, no explanation.',
  ].join('\n');

  let bridgeRes: Response;
  try {
    bridgeRes = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        user: userPrompt,
        type: 'avatar-card-summary',
        maxTokens: 200,
      }),
    });
  } catch (err: any) {
    return c.json({ error: `claude-bridge unreachable: ${err?.message ?? String(err)}` }, 502);
  }
  if (!bridgeRes.ok) {
    return c.json({ error: `claude-bridge ${bridgeRes.status}: ${await bridgeRes.text().catch(() => '')}` }, 502);
  }
  const data = (await bridgeRes.json()) as { text?: string; error?: string };
  if (data.error) return c.json({ error: `claude-bridge: ${data.error}` }, 502);
  // Strip surrounding quotes / markdown the model sometimes adds even
  // when told not to.
  const summary = (data.text ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
  if (!summary) return c.json({ error: 'claude returned empty text' }, 502);

  // Upsert (same pattern as the image generator) so file-only avatars
  // without a bank row yet still get the summary persisted.
  const idx = items.findIndex((x) => x.id === id);
  const nowSec = Math.floor(Date.now() / 1000);
  if (idx === -1) {
    items.unshift({
      id,
      name,
      card_summary: summary,
      created_at: nowSec,
      updated_at: nowSec,
    });
  } else {
    items[idx] = { ...items[idx]!, card_summary: summary, updated_at: nowSec };
  }
  saveBank('results', items);

  return c.json({ ok: true, card_summary: summary });
});

// POST /avatars/:id/upload-image
//
// Accepts a multipart/form-data upload (field: `file`) and saves it as
// the avatar's portrait. Same destination folder as the AI-generated
// images (05_Assets/Avatars/images/) - the only difference is the
// origin. Returns the new image_path; client patches the avatar with
// it. Handles file-only avatars by upserting a bank row (same pattern
// as the generate-image and PATCH endpoints).
app.post('/avatars/:id/upload-image', async (c) => {
  const id = c.req.param('id');
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: 'multipart/form-data required' }, 400);
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'file field missing' }, 400);

  // Validate it's actually an image.
  const mime = (file.type || '').toLowerCase();
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  if (!allowed.includes(mime)) {
    return c.json({ error: `unsupported image type: ${mime || '(unknown)'}. use png / jpg / webp / gif.` }, 400);
  }
  const ext =
    mime === 'image/png' ? 'png'
    : mime === 'image/webp' ? 'webp'
    : mime === 'image/gif' ? 'gif'
    : 'jpg';

  const slug = id.startsWith('avatar-') ? id.slice('avatar-'.length) : id;
  const ts = Math.floor(Date.now() / 1000);
  const imagesDir = abs('05_Assets', 'Avatars', 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const filename = `${slug || 'avatar'}-upload-${ts}.${ext}`;
  const fullPath = `${imagesDir}/${filename}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);
  const relPath = `05_Assets/Avatars/images/${filename}`;

  // Same upsert dance as the AI-generate endpoint - if no bank row
  // exists yet (file-only avatar), create one so image_path persists.
  const items = loadBank('results');
  const bankRow = items.find((x) => x.id === id);
  const idx = items.findIndex((x) => x.id === id);
  const name = bankRow?.name?.toString() || slug;
  const nowSec = Math.floor(Date.now() / 1000);
  if (idx === -1) {
    items.unshift({
      id,
      name,
      image_path: relPath,
      created_at: nowSec,
      updated_at: nowSec,
    });
  } else {
    items[idx] = { ...items[idx]!, image_path: relPath, updated_at: nowSec };
  }
  saveBank('results', items);

  return c.json({ ok: true, image_path: relPath, size_bytes: buffer.length });
});

// POST /avatars/:id/generate-image — generates a portrait via Google's
// Nano Banana (gemini-2.5-flash-image), saves the PNG into 05_Assets/
// Avatars/images/, and PATCHes the bank row with image_path. Reads the
// API key from 04_Channel/00_System/system_config.md (line "GEMINI_API_KEY: ...").
app.post('/avatars/:id/generate-image', async (c) => {
  const id = c.req.param('id');
  // Pull the avatar's current data so the prompt has something to chew on.
  const items = loadBank('results');
  const bankRow = items.find((x) => x.id === id);
  // The avatar might be file-only (no bank row yet). In that case the slug
  // is on the URL id and the name comes from the slug.
  const slug = id.startsWith('avatar-') ? id.slice('avatar-'.length) : id;
  const name = bankRow?.name?.toString() || slug;
  const oneLine = bankRow?.one_line?.toString() || '';
  const beforeState = bankRow?.before_state?.toString() || '';

  // Load Gemini key. The skill stores it in 04_Channel/00_System/system_config.md
  // as a `GEMINI_API_KEY: <value>` line. We read the file and grep.
  let apiKey = '';
  try {
    const cfg = fs.readFileSync(abs('04_Channel', '00_System', 'system_config.md'), 'utf8');
    const m = cfg.match(/^\s*GEMINI_API_KEY:\s*(\S+)/m);
    if (m) apiKey = m[1]!.trim();
  } catch {}
  if (!apiKey) {
    return c.json(
      { error: 'GEMINI_API_KEY not found. Add a `GEMINI_API_KEY: <value>` line to 04_Channel/00_System/system_config.md to enable avatar image generation.' },
      400,
    );
  }

  // Build the prompt. Aim for a documentary-portrait look so the image
  // feels like a real person, not a stock avatar. The avatar's one_line
  // shapes vibe; falls back to a generic creative-freelancer brief if
  // the creator hasn't filled it in yet.
  const subject = oneLine.trim() ||
    `${name}, an experienced creative freelancer in her mid-30s, mid-stage of building a teaching business off the back of her client work`;
  const promptText = [
    'Editorial documentary portrait, shoulders-up, soft natural window light, slightly off-centre composition, shallow depth of field.',
    'The subject is grounded, present, lightly smiling but not posed. Real skin texture, no plastic finish, no AI gloss.',
    `Subject: ${subject}.`,
    'Wardrobe: muted neutral knit or simple shirt, no logos, no graphic prints.',
    'Background: a softly blurred warm interior (cream wall, a hint of plant or shelf), nothing branded.',
    'Aspect ratio square (1:1). 35mm film aesthetic. Subtle film grain. Warm-tone colour palette.',
    'Absolutely no text, watermarks, captions, or visible logos.',
  ].join(' ');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;
  let geminiData: any;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `gemini ${res.status}: ${errText.slice(0, 400)}` }, 502);
    }
    geminiData = await res.json();
  } catch (err: any) {
    return c.json({ error: `gemini request failed: ${err?.message || String(err)}` }, 502);
  }

  // Walk the response for inline image data (base64 PNG).
  const parts: any[] = geminiData?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p?.inlineData?.data);
  if (!imagePart) {
    return c.json({ error: 'gemini returned no image data' }, 502);
  }
  const base64: string = imagePart.inlineData.data;
  const mime: string = imagePart.inlineData.mimeType || 'image/png';
  const ext = mime === 'image/jpeg' ? 'jpg' : 'png';

  // Save to 05_Assets/Avatars/images/<slug>-<ts>.<ext>. Timestamp the
  // filename so re-generating doesn't silently overwrite the previous one
  // (the creator can keep history and pick the best).
  const ts = Math.floor(Date.now() / 1000);
  const imagesDir = abs('05_Assets', 'Avatars', 'images');
  fs.mkdirSync(imagesDir, { recursive: true });
  const filename = `${slug || 'avatar'}-${ts}.${ext}`;
  const fullPath = `${imagesDir}/${filename}`;
  fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
  const relPath = `05_Assets/Avatars/images/${filename}`;

  // Upsert image_path into the bank. Same upsert logic as the avatars
  // PATCH route - covers the file-only-avatar case.
  const idx = items.findIndex((x) => x.id === id);
  const nowSec = Math.floor(Date.now() / 1000);
  if (idx === -1) {
    items.unshift({
      id,
      name,
      image_path: relPath,
      created_at: nowSec,
      updated_at: nowSec,
    });
  } else {
    items[idx] = { ...items[idx]!, image_path: relPath, updated_at: nowSec };
  }
  saveBank('results', items);

  return c.json({ ok: true, image_path: relPath, prompt: promptText });
});

export default app;
