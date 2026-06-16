/**
 * Onboarding - conversational interview that captures verbatim + tags +
 * Layer 1 section update in ONE Claude call per turn. Block A foundation.
 *
 * The frontend interview UI calls POST /api/onboarding/turn per user answer.
 * The endpoint:
 *   1. Sends the question + answer + running L1 draft to Claude
 *   2. Gets back layer0_verbatim, layer2_chunks, layer1_section_md
 *   3. Writes the verbatim to 05_Assets/Transcripts/onboarding/<session>.md
 *   4. Returns the structured payload to the frontend for review + accept
 *
 * Layer 2 chunk routing (POV files / journey entries / etc.) and Layer 1
 * heading-anchored writeback are not in this endpoint yet - the frontend
 * receives the proposed writes and the user clicks "accept" which calls
 * the existing per-artifact endpoints. That keeps the interview transparent
 * and reviewable, rather than silently mutating the vault.
 */

import { Hono } from 'hono';
import { processOnboardingTurn, writeOnboardingTurnVerbatim, type CorePhase } from '../lib/onboardingTurn.js';

const app = new Hono();

const VALID_PHASES: CorePhase[] = ['positioning', 'audience', 'my-story', 'ip', 'offer-suite', 'voice-style'];

app.post('/turn', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    session_id?: string;
    phase?: string;
    question?: string;
    answer?: string;
    current_layer1_section?: string;
  } | null;

  if (!body?.session_id || typeof body.session_id !== 'string') {
    return c.json({ error: 'session_id required' }, 400);
  }
  if (!body.phase || !VALID_PHASES.includes(body.phase as CorePhase)) {
    return c.json({ error: `phase must be one of ${VALID_PHASES.join(', ')}` }, 400);
  }
  if (!body.question || !body.answer) {
    return c.json({ error: 'question + answer required' }, 400);
  }
  if (body.answer.trim().length < 3) {
    return c.json({ error: 'answer too short' }, 400);
  }

  try {
    const out = await processOnboardingTurn({
      phase: body.phase as CorePhase,
      question: body.question,
      answer: body.answer,
      current_layer1_section: body.current_layer1_section,
    });

    // Layer 0 write: append verbatim to onboarding transcript file
    const verbatimWrite = writeOnboardingTurnVerbatim(
      body.session_id,
      body.phase as CorePhase,
      body.question,
      out.layer0_verbatim,
    );

    return c.json({
      ok: true,
      session_id: body.session_id,
      phase: body.phase,
      verbatim_written_to: verbatimWrite.path,
      layer0_verbatim: out.layer0_verbatim,
      layer2_chunks: out.layer2_chunks,
      layer1_section_md: out.layer1_section_md,
      turn_summary: out.turn_summary,
    });
  } catch (err: any) {
    console.error('onboarding/turn failed:', err);
    return c.json({ error: err?.message ?? 'turn processing failed' }, 500);
  }
});

export default app;
