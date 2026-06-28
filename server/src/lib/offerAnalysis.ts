/**
 * Claude analysis for the per-offer 25-question scoring system.
 *
 * Inputs per section:
 *   avatar     - the attached avatar's markdown file
 *   pricing    - pricing fields + pinned proof bank (for 10x value cross-ref)
 *   proof      - the pinned proof items (from reputation slot_pinned_proof_ids)
 *   validation - validation fields + customer count + pricing stage
 *   content    - VSL URL HTML (fetched) + content fields
 *
 * Output: 5 question scores (1-5) + reasoning per question.
 */

import fs from 'node:fs';
import path from 'node:path';
import { abs, loadFile } from '../vault.js';

import { BRIDGE_URL } from './bridge.js';

// The 25 questions, mirroring the frontend OFFER_QUIZ. Kept here as the
// source-of-truth for the Claude prompt; if you edit the questions on the
// frontend, edit them here too so the analysis matches the UI.
const QUESTIONS = {
  avatar: [
    'Could I describe their before state in vivid emotional detail?',
    'Could I describe their dream outcomes in vivid emotional detail?',
    'Are their pain points captured specifically?',
    'Would my avatar feel the sales page was written just for them?',
    'My dream customer immediately recognises this offer is for them',
  ],
  pricing: [
    'Is this price calibrated to the results (10x value rule, monetary or clarity/confidence)?',
    'Is the offer priced as a no-brainer tradeoff?',
    'Have I defined a price ladder with criteria to raise each rung?',
    'Have I set revenue + customer targets for this offer?',
    "Does the current price match the offer's stage (idea → scaling)?",
  ],
  proof: [
    'I have achieved this result for myself or someone else',
    'I have case studies, testimonials, or data showing real results',
    'My proof is specific to my target avatar',
    'I have examples of customers getting results quickly',
    'Proof shows up across all my content (social, sales page, emails)',
  ],
  validation: [
    'Have I had 1:1 conversations with at least 10 ideal customers?',
    'At least 1 real customer has paid for this offer',
    'At least 1 customer has actually achieved the promised result',
    'The offer has been launched publicly at least once',
    'I have customer-reported satisfaction (testimonial / review / repurchase)',
  ],
  content: [
    'Have I recorded a VSL? (yes / no)',
    'Have I created a sales page? (yes / no)',
    'Are common objections addressed inside the sales page?',
    'Does the content remove roadblocks (clarity / tech / overwhelm)?',
    'Would a friend understand this offer from the sales page in 10 seconds?',
  ],
} as const;

export type SectionKey = keyof typeof QUESTIONS;

export type AnalysisResult = {
  scores: number[]; // 5 entries, each 1-5
  reasoning: string[]; // 5 entries
  warnings?: string[];
};

// ─── Input loaders ─────────────────────────────────────────────────────────

function loadAttachedAvatarMd(avatarId: string | null): string {
  if (!avatarId) return '(no avatar attached to this offer)';
  // Match the avatar loader's filename slug logic: avatar-<slug>.md
  const slug = avatarId.replace(/^avatar-/, '');
  const candidates = [
    abs('05_Assets', 'Avatars', `${slug}.md`),
    abs('05_Assets', 'Avatars', `avatar-${slug}.md`),
    abs('05_Assets', 'Avatars', `${slug}-avatar.md`),
  ];
  for (const p of candidates) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      if (txt && txt.trim().length > 0) return txt;
    } catch {}
  }
  // Fallback: try scanning the Avatars dir for any file that mentions the slug.
  try {
    const dir = abs('05_Assets', 'Avatars');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const fSlug = f.replace(/\.md$/, '').replace(/^avatar-/, '').toLowerCase();
      if (fSlug.includes(slug.toLowerCase()) || slug.toLowerCase().includes(fSlug)) {
        return fs.readFileSync(path.join(dir, f), 'utf8');
      }
    }
  } catch {}
  return `(avatar with id ${avatarId} not found on disk)`;
}

function loadPinnedProof(): string {
  // Pull pinned_proof_ids from state.md, then materialise from wins + bank.
  try {
    const stateEntry = loadFile(abs('00_System', 'state.md'));
    const fm = (stateEntry?.frontmatter as Record<string, unknown>) ?? {};
    const rawIds = fm.slot_pinned_proof_ids;
    const pinnedIds: string[] = Array.isArray(rawIds)
      ? (rawIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (pinnedIds.length === 0) return '(no proof pinned yet - encourage the creator to pin proof items on the Proof tab)';
    const lines: string[] = [];
    // Wins
    try {
      const wins = JSON.parse(fs.readFileSync(abs('00_System', 'wins.json'), 'utf8')) as any[];
      for (const w of wins) {
        if (!pinnedIds.includes(w.id)) continue;
        lines.push(`- [win:${w.kind}] ${w.title}${w.body ? ` - ${w.body}` : ''}`);
      }
    } catch {}
    // Proof bank
    try {
      const bank = JSON.parse(fs.readFileSync(abs('00_System', 'proof-points.json'), 'utf8')) as any[];
      for (const b of bank) {
        if (!pinnedIds.includes(b.id)) continue;
        lines.push(`- [bank] ${b.title ? `${b.title}: ` : ''}${b.text}`);
      }
    } catch {}
    return lines.length > 0 ? lines.join('\n') : '(pinned proof ids do not match any wins or bank entries on disk)';
  } catch {
    return '(could not read pinned proof)';
  }
}

// Sentinel string the prompt looks for to enforce score=1 on sales-page-
// dependent questions. Any reason the page can't be read collapses to this.
const SALES_PAGE_UNREADABLE = '(SALES PAGE COULD NOT BE READ)';

async function fetchSalesPageText(url: string): Promise<string> {
  if (!url || !/^https?:\/\//i.test(url)) return SALES_PAGE_UNREADABLE;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoloOsDashboard/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return SALES_PAGE_UNREADABLE;
    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    // JS-rendered SPAs (e.g. Skool) return an almost-empty shell when fetched
    // server-side. Under ~500 chars of meaningful text means the page wasn't
    // really delivered - treat it as unreadable so Claude doesn't rate
    // sales-page questions off a stub.
    if (stripped.length < 500) return SALES_PAGE_UNREADABLE;
    return stripped.length > 6000 ? stripped.slice(0, 6000) + '… [truncated]' : stripped;
  } catch {
    return SALES_PAGE_UNREADABLE;
  }
}

// ─── Build the context block per section ───────────────────────────────────

async function buildContext(section: SectionKey, rung: any): Promise<string> {
  const lines: string[] = [];
  lines.push(`OFFER: ${rung.name || '(unnamed)'}`);
  lines.push(`PROMISE: ${rung.promise || '(no promise set)'}`);
  lines.push(`PRICE: ${rung.price_label || '(no price set)'}`);
  lines.push(`STAGE: ${rung.status}`);

  if (section === 'avatar') {
    lines.push('');
    lines.push('ATTACHED AVATAR MARKDOWN:');
    lines.push(loadAttachedAvatarMd(rung.avatar_id));
    if (rung.vsl_url) {
      lines.push('');
      lines.push('SALES PAGE COPY (for the "would it feel written for them?" check):');
      lines.push(await fetchSalesPageText(rung.vsl_url));
    }
  }
  if (section === 'pricing') {
    lines.push('');
    lines.push(`GOAL PRICE: ${rung.goal_price_label || '(not set)'}`);
    lines.push(`TARGET REVENUE/MO: $${rung.target_revenue_per_month_usd ?? '(not set)'}`);
    lines.push(`TARGET CUSTOMERS/MO: ${rung.target_customers_per_month ?? '(not set)'}`);
    lines.push(`PRICING PLAN: ${rung.pricing_plan || '(no plan written)'}`);
    lines.push('');
    lines.push('PINNED PROOF (for the 10x value cross-reference):');
    lines.push(loadPinnedProof());
  }
  if (section === 'proof') {
    lines.push('');
    lines.push('PINNED PROOF FOR THIS PROMISE:');
    lines.push(loadPinnedProof());
    lines.push('');
    lines.push('ATTACHED AVATAR (so you can judge proof-vs-avatar fit):');
    lines.push(loadAttachedAvatarMd(rung.avatar_id));
  }
  if (section === 'validation') {
    lines.push('');
    lines.push(`STAGE: ${rung.status}`);
    lines.push(`TARGET CUSTOMERS/MO: ${rung.target_customers_per_month ?? 0}`);
    lines.push('PINNED PROOF (use to infer paying-customer evidence):');
    lines.push(loadPinnedProof());
  }
  if (section === 'content') {
    lines.push('');
    lines.push(`VSL URL: ${rung.vsl_url || '(no link)'}`);
    lines.push(`CONTENT MENTIONS / MONTH: ${rung.content_mentions_per_month ?? '(not set)'}`);
    lines.push(`CTAs / VIDEO: ${rung.cta_count_per_video ?? '(not set)'}`);
    lines.push(`HAS EMAIL FUNNEL: ${rung.has_email_funnel ? 'yes' : 'no'}`);
    lines.push(`DIRECT FROM CONTENT: ${rung.direct_from_content ? 'yes' : 'no'}`);
    lines.push(`CTA LOCATIONS: ${rung.cta_locations || '(not set)'}`);
    lines.push(`AUDIENCE JOURNEY: ${rung.audience_journey || '(not set)'}`);
    lines.push(`CTA FREQUENCY: ${rung.cta_frequency || '(not set)'}`);
    lines.push('');
    lines.push('SALES PAGE / VSL COPY (fetched from vsl_url):');
    lines.push(await fetchSalesPageText(rung.vsl_url));
  }
  return lines.join('\n');
}

// ─── Claude call ──────────────────────────────────────────────────────────

async function callBridge(system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'offerAnalysis', system, user, maxTokens: 4000, expectJson: true }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { text?: string; error?: string };
    if (data.error) throw new Error(`claude-bridge: ${data.error}`);
    if (!data.text) throw new Error('claude-bridge: no text in response');
    return data.text;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('offer analysis timed out after 3 minutes.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseClaudeJson(raw: string): { scores: number[]; reasoning: string[] } {
  // Try direct parse first; fall back to extracting the first {...} block.
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch {}
  if (!parsed) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
  }
  if (!parsed || !Array.isArray(parsed.questions)) {
    return { scores: [0, 0, 0, 0, 0], reasoning: ['(could not parse Claude response)', '', '', '', ''] };
  }
  const scores: number[] = [];
  const reasoning: string[] = [];
  for (let i = 0; i < 5; i++) {
    const q = parsed.questions[i] ?? {};
    const n = Number(q.score);
    scores.push(Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 0);
    reasoning.push(typeof q.reasoning === 'string' ? q.reasoning : '');
  }
  return { scores, reasoning };
}

export async function analyzeSection(section: SectionKey, rung: any): Promise<AnalysisResult> {
  const questions = QUESTIONS[section];
  const context = await buildContext(section, rung);
  const system = `You are a SKEPTICAL offer-strategy critic. You are given a context block about ONE specific offer in the creator's solopreneur business, then a list of 5 questions about the "${section}" dimension. Score each question 1-5 where:
1 = clearly absent / very weak / no evidence in the context
2 = weak / unconvincing / partial evidence
3 = present but generic / not yet strong
4 = solid / mostly there / clear evidence
5 = excellent / fully realised / quantified evidence cited

HARD RULES (these override the rubric above - apply them mechanically):
- Default to 1-2. A 4 or 5 requires explicit, specific evidence cited from the context block. Vague positive impressions are NOT evidence.
- If the SALES PAGE COPY block contains the string "${SALES_PAGE_UNREADABLE}", any question that depends on the sales page (avatar fit, sales-page clarity, objections-addressed, friend-understands, proof-shows-up-across-content, etc.) MUST score 1. No exceptions, no "but maybe..." reasoning. If you can't read the sales page, you can't judge it.
- If a required field is "(not set)" or "(no ... provided)" or "(no ... set)", any question that depends on it scores 1.
- Round ties down. When in doubt between 3 and 4, pick 3. Between 4 and 5, pick 4.
- Be willing to score 1s. A row of all 4s and 5s is a sign you are flattering the input.

Reasoning is 1 short sentence per question. CITE the specific evidence (or its absence) you scored against.

Return JSON ONLY in this shape:
{
  "questions": [
    { "score": 2, "reasoning": "..." },
    { "score": 3, "reasoning": "..." },
    { "score": 1, "reasoning": "..." },
    { "score": 2, "reasoning": "..." },
    { "score": 1, "reasoning": "..." }
  ]
}

No markdown, no prose outside the JSON.`;

  const user = `CONTEXT:\n${context}\n\nTHE 5 QUESTIONS (in order, score each 1-5):\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;

  const text = await callBridge(system, user);
  const { scores, reasoning } = parseClaudeJson(text);
  return { scores, reasoning };
}
