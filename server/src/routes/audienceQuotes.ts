/**
 * Audience-quotes route. Lives at /api/audience-quotes/*.
 *
 * Endpoints:
 *   GET    /                         - list all (optional ?transcript_id, ?avatar_id, ?category)
 *   POST   /:transcriptId/extract    - run Claude extraction for one transcript
 *   PATCH  /:id                      - update fields (avatar_id, category, status, text)
 *   POST   /:id/to-proof-bank        - push as a proof-points entry
 *   DELETE /:id                      - hard delete
 */

import { Hono } from 'hono';
import {
  extractAudienceQuotesFromTranscript,
  readBank,
  writeBank,
  pushQuoteToProofBank,
  reconcileAvatarLists,
  detachQuoteFromAvatar,
  type AudienceQuote,
  type AudienceQuoteCategory,
} from '../lib/audienceQuotes.js';
import { loadTranscriptContent } from './extracts.js';

const app = new Hono();

app.get('/', (c) => {
  const transcriptId = c.req.query('transcript_id');
  const avatarId = c.req.query('avatar_id');
  const category = c.req.query('category') as AudienceQuoteCategory | undefined;
  const bank = readBank();
  let quotes = bank.quotes;
  if (transcriptId) quotes = quotes.filter((q) => q.source_transcript_id === transcriptId);
  if (avatarId) quotes = quotes.filter((q) => q.avatar_id === avatarId);
  if (category) quotes = quotes.filter((q) => q.category === category);
  return c.json({ quotes });
});

// Run audience-quote extraction for a transcript and merge into the bank.
// Exported so it can fire automatically on upload, not just from the button.
export async function runAudienceExtraction(transcriptId: string): Promise<AudienceQuote[]> {
  const loaded = loadTranscriptContent(transcriptId);
  if (!loaded) throw new Error('transcript not found');
  const fresh = await extractAudienceQuotesFromTranscript({
    transcriptId,
    transcriptFilename: loaded.filename,
    transcriptText: loaded.content,
  });
  const bank = readBank();
  // Replace pending quotes for this transcript - keep approved-to-proof ones.
  const others = bank.quotes.filter(
    (q) => !(q.source_transcript_id === transcriptId && q.status === 'pending' && !q.approved_proof_id),
  );
  bank.quotes = [...others, ...fresh];
  writeBank(bank);
  return fresh;
}

app.post('/:transcriptId/extract', async (c) => {
  const transcriptId = c.req.param('transcriptId');
  try {
    const fresh = await runAudienceExtraction(transcriptId);
    return c.json({ quotes: fresh, total: fresh.length });
  } catch (err: any) {
    if (err?.message === 'transcript not found') return c.json({ error: 'transcript not found' }, 404);
    console.error('audience-extract failed:', err);
    return c.json({ error: err?.message ?? 'extract failed' }, 500);
  }
});

app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as Partial<AudienceQuote> | null;
  if (!body) return c.json({ error: 'body required' }, 400);
  const bank = readBank();
  const idx = bank.quotes.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const cur = bank.quotes[idx]!;
  const next: AudienceQuote = { ...cur, updated_at: Math.floor(Date.now() / 1000) };
  if (typeof body.text === 'string') next.text = body.text;
  if (typeof body.speaker_label === 'string') next.speaker_label = body.speaker_label;
  if (body.category && (['struggle', 'desire', 'win'] as const).includes(body.category as any)) {
    next.category = body.category as AudienceQuoteCategory;
  }
  // Accept legacy values from older clients.
  if ((body as any).category === 'want') next.category = 'desire';
  if ((body as any).category === 'unsorted') next.category = 'struggle';
  if (body.avatar_id === null || typeof body.avatar_id === 'string') {
    next.avatar_id = body.avatar_id;
  }
  if (body.status && (['pending', 'dismissed'] as const).includes(body.status)) {
    next.status = body.status;
  }
  if (typeof body.title === 'string') next.title = body.title;
  // Accept legacy `context` from older clients and route to the new title field.
  if (typeof (body as any).context === 'string') next.title = (body as any).context;
  bank.quotes[idx] = next;
  writeBank(bank);
  // Note: we no longer sync verbatim quote text into the avatar's
  // struggles / outcomes arrays. Quotes are referenced separately on the
  // avatar editor with the summary headline (`title`) as the main display
  // and the verbatim text shown muted below.
  void reconcileAvatarLists; // kept exported for backward compat; not called
  void cur;
  return c.json({ ok: true, quote: next });
});

app.post('/:id/to-proof-bank', (c) => {
  const id = c.req.param('id');
  const bank = readBank();
  const idx = bank.quotes.findIndex((x) => x.id === id);
  if (idx === -1) return c.json({ error: 'not found' }, 404);
  const quote = bank.quotes[idx]!;
  if (quote.approved_proof_id) return c.json({ ok: true, proof_id: quote.approved_proof_id, alreadyExisted: true });
  const { id: proofId } = pushQuoteToProofBank(quote);
  bank.quotes[idx] = { ...quote, approved_proof_id: proofId, approved_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) };
  writeBank(bank);
  return c.json({ ok: true, proof_id: proofId });
});

app.delete('/:id', (c) => {
  const id = c.req.param('id');
  const bank = readBank();
  const target = bank.quotes.find((x) => x.id === id);
  if (!target) return c.json({ error: 'not found' }, 404);
  bank.quotes = bank.quotes.filter((x) => x.id !== id);
  writeBank(bank);
  // Detach is also a no-op now since we don't sync into the avatar's list.
  void detachQuoteFromAvatar;
  void target;
  return c.json({ ok: true });
});

export default app;
