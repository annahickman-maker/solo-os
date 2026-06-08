/**
 * Stripe sync - reads lifetime gross income from Stripe balance transactions,
 * stores in 00_System/state.md.
 *
 * Uses STRIPE_API_KEY from env. Set in dashboard/server/.env or via the
 * dashboard.command launcher.
 */

import { Hono } from 'hono';
import { abs, loadFile, saveFile } from '../vault.js';

const app = new Hono();

type BalanceTxn = { id: string; type: string; amount: number; currency: string; created: number };
type BalanceTxnList = { has_more: boolean; data: BalanceTxn[] };

async function fetchStripeLifetime(apiKey: string): Promise<{ total_usd: number; charge_count: number }> {
  let starting_after: string | undefined;
  let totalCents = 0;
  let chargeCount = 0;
  for (let safety = 0; safety < 200; safety++) {
    const url = new URL('https://api.stripe.com/v1/balance_transactions');
    url.searchParams.set('limit', '100');
    url.searchParams.set('type', 'charge');
    if (starting_after) url.searchParams.set('starting_after', starting_after);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`stripe balance_transactions failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as BalanceTxnList;
    for (const t of page.data) {
      if (t.currency.toLowerCase() === 'usd') {
        totalCents += t.amount;
        chargeCount++;
      }
    }
    if (!page.has_more || page.data.length === 0) break;
    starting_after = page.data[page.data.length - 1]!.id;
  }
  return { total_usd: totalCents / 100, charge_count: chargeCount };
}

function writeStateFile(updates: Record<string, unknown>): void {
  const filePath = abs('00_System', 'state.md');
  const existing = loadFile(filePath);
  const fm = { ...(existing?.frontmatter ?? {}), ...updates, updated: new Date().toISOString() };
  saveFile(
    filePath,
    fm as Record<string, unknown>,
    existing?.body ?? '# Dashboard State\n\nAggregate metrics for the dashboard.\n'
  );
}

app.post('/sync', async (c) => {
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    return c.json(
      { error: 'STRIPE_API_KEY not configured. Set it in dashboard/server/.env or the launcher.' },
      400
    );
  }
  try {
    const { total_usd, charge_count } = await fetchStripeLifetime(apiKey);
    const nowSec = Math.floor(Date.now() / 1000);
    writeStateFile({
      lifetime_income_usd: total_usd,
      stripe_last_sync_at: nowSec,
      stripe_charge_count: charge_count,
    });
    return c.json({ ok: true, total_usd, charge_count, last_sync_at: nowSec });
  } catch (err: any) {
    console.error('stripe sync failed:', err);
    return c.json({ error: err?.message ?? 'stripe sync failed' }, 500);
  }
});

app.get('/status', (c) => {
  const state = loadFile(abs('00_System', 'state.md'));
  const fm = (state?.frontmatter as Record<string, unknown>) ?? {};
  return c.json({
    total_usd: (fm.lifetime_income_usd as number) ?? (fm.lifetime_income as number) ?? 0,
    last_sync_at: (fm.stripe_last_sync_at as number) ?? null,
    charge_count: (fm.stripe_charge_count as number) ?? null,
    configured: !!process.env.STRIPE_API_KEY,
  });
});

export default app;
