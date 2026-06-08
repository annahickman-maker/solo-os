/**
 * Offers page state - shape-faithful port of the old backend's GET /api/offers.
 *
 * Sourced from state.md frontmatter slots (offer_*). The complex Hormozi
 * scoring lives here too but is a heuristic when not enough data is filled in.
 *
 * Offer slot keys (prefix-namespaced in state.md so they don't collide):
 *   offer_name, offer_transformation, offer_big_promise, offer_mechanism, offer_who
 *   offer_strength_clarity_q[1-5], offer_strength_proof_q[1-5], offer_strength_avatar_q[1-5]
 *   offer_strength_effort_q[1-5], offer_strength_time_q[1-5]
 *   offer_stage (current pipeline stage: idea / validated / iterating / signature / scaling)
 */

import fs from 'node:fs';
import { abs, loadCollection, loadFile } from '../vault.js';

const FRAMING =
  'Two things happen on this page. One: the richer you build it, the better Claude scripts your sales pages, launch emails, CTAs, walkthrough content - everything that sells this offer. Two: your offer itself gets stronger over time.';

function getSlots(): Record<string, unknown> {
  return (loadFile(abs('00_System', 'state.md'))?.frontmatter as Record<string, unknown>) ?? {};
}

function slot(slots: Record<string, unknown>, key: string, fallback: any = null) {
  return slots[`offer_${key}`] ?? slots[`slot_${key}`] ?? fallback;
}

function rate(slots: Record<string, unknown>, key: string, fallback = 0): number {
  const v = slots[`offer_${key}`];
  return typeof v === 'number' ? v : fallback;
}

const STAGES = [
  { id: 'idea', label: 'Idea', description: 'Drafted but never sold. No paid customers yet.' },
  { id: 'validated', label: 'Validated', description: 'First 1-5 paid customers from a real launch.' },
  { id: 'iterating', label: 'Iterating', description: 'Launch cycles every 6-8 weeks. Price rising.' },
  { id: 'signature', label: 'Signature', description: 'Named, streamlined, premium-priced.' },
  { id: 'scaling', label: 'Scaling', description: 'Suite + email systems + inbound flow.' },
];

const OFFERCHECK_QUESTIONS = {
  clarity: [
    'If I explained my offer to a friend, would they "get it" in under 10 seconds?',
    'My dream customer can immediately recognize this offer is for them.',
    'My offer promises a specific, desirable, and measurable result.',
    "Does this solve my avatar's most urgent pain point?",
    'Does my offer feel focused? (not trying to be everything for everyone)',
  ],
  proof: [
    'I have achieved this result for myself or someone else.',
    'I consistently publish content that demonstrates my authority and expertise.',
    'I have case studies, testimonials, or data showing real results from customers.',
    'My proof is specific to my target avatar, so they can see someone like them succeed.',
    'I share proof across all my content (social media, sales page, emails, webinars).',
  ],
  avatar: [
    'If they read my sales page, would my avatar feel like it was written just for them?',
    'Could I describe their "before state" in vivid emotional detail?',
    'Could I describe their dream outcomes in vivid emotional detail?',
    'Have I had a 1:1 conversation with at least 10 of my ideal customers?',
    "Could I write a piece of content that makes them feel \"exposed\" because it's so accurate?",
  ],
  effort: [
    'Have I addressed any common objections (time, energy, skill) within my sales page?',
    'Can I explain the path to see results in 3-5 simple steps?',
    'Does my offer remove common roadblocks (like confusion, tech setup, or overwhelm)?',
    'Is it clear how this is simpler or faster than what they have tried before?',
    'Does my offer feel like a no-brainer tradeoff - small effort for big gain?',
  ],
  time: [
    'Can they see or feel a quick win immediately after purchase?',
    'I have a timeline for my customers achieving their desired result (3, 6 or 12 months).',
    'Does getting started feel quick and effortless?',
    'Do I show examples of others getting results quickly?',
    "I have a clear time-bound offer with milestones showing when they'll see results.",
  ],
};

function leverScore(slots: Record<string, unknown>, prefix: string, count = 5): number {
  let sum = 0;
  let n = 0;
  for (let i = 1; i <= count; i++) {
    const v = rate(slots, `strength_${prefix}_q${i}`, 0);
    if (v > 0) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

// Parse an avatar markdown file into the structured fields the editor uses.
// Maps known H2 sections by heading prefix - "Who She Is" → one_line (first
// paragraph), "Her Daily Reality" → before_state (whole section), "What She
// Is Trying to Do" → after_state, "Her Fears" → struggles (parsed bullets),
// "What Actually Motivates Her" → outcomes (parsed bullets). Returns only
// the fields it could find so the merge below leaves anything else alone.
function parseAvatarMd(body: string): {
  one_line?: string;
  before_state?: string;
  after_state?: string;
  struggles?: string[];
  outcomes?: string[];
} {
  // Split by H2 headings, keep heading text + section content together.
  const sections = new Map<string, string>();
  const re = /^##\s+(.+?)\s*$([\s\S]*?)(?=^##\s+|\Z)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    sections.set(m[1]!.trim().toLowerCase(), (m[2] ?? '').trim());
  }
  const out: ReturnType<typeof parseAvatarMd> = {};
  const get = (...candidates: string[]) =>
    candidates
      .map((c) => sections.get(c.toLowerCase()))
      .find((v): v is string => !!v && v.trim().length > 0);
  // Bullet extractor: lines that start with - or * become the list. Falls
  // back to splitting paragraphs on newlines if there are no bullets at all.
  const toBullets = (section: string): string[] => {
    const bullets = section
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean);
    return bullets;
  };
  const whoSection = get('Who She Is', 'Who He Is', 'Who They Are', 'Who');
  if (whoSection) {
    // First paragraph as one_line (compact identity statement).
    const firstPara = whoSection.split(/\n\s*\n/)[0]?.trim();
    if (firstPara) out.one_line = firstPara;
  }
  const dailyReality = get('Her Daily Reality', 'His Daily Reality', 'Their Daily Reality', 'Daily Reality', 'Current State');
  if (dailyReality) out.before_state = dailyReality;
  const tryingToDo = get('What She Is Trying to Do', 'What He Is Trying to Do', 'What They Are Trying to Do', 'What She Wants', 'Goal');
  if (tryingToDo) out.after_state = tryingToDo;
  const fears = get('Her Fears', 'His Fears', 'Their Fears', 'Fears');
  const objections = get('Her Objections', 'His Objections', 'Their Objections', 'Objections');
  const struggleBullets = [
    ...(fears ? toBullets(fears) : []),
    ...(objections ? toBullets(objections) : []),
  ];
  if (struggleBullets.length > 0) out.struggles = struggleBullets;
  const motivates = get('What Actually Motivates Her', 'What Actually Motivates Him', 'What Actually Motivates Them', 'What Motivates Her', 'Outcomes');
  if (motivates) {
    const outcomeBullets = toBullets(motivates);
    if (outcomeBullets.length > 0) out.outcomes = outcomeBullets;
  }
  return out;
}

// Slug helper: bank entries are keyed by display name ("adriana"), files
// are keyed by full filename ("avatar-adriana"). We normalise both to a
// comparable slug for merging.
function avatarSlug(s: string): string {
  return s.toLowerCase().replace(/^avatar-/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function loadAvatars() {
  // Three sources, merged:
  //   1. Markdown files in 05_Assets/Avatars/ - the canonical source of
  //      truth the creator writes by hand. Parsed for default field values.
  //   2. JSON bank entries in 00_System/offer-results.json - where dashboard
  //      edits land. Bank fields override parsed defaults when populated.
  //   3. Either-or: an avatar can exist in just one source. File-only
  //      avatars show as fully populated from the parse. Bank-only avatars
  //      show with whatever the creator typed in the dashboard.
  type Out = {
    id: string;
    name: string | null;
    source_file?: string | null;
    one_line?: string | null;
    price_point?: string | null;
    before_state?: string | null;
    after_state?: string | null;
    demographics?: string | null;
    struggles?: string[];
    outcomes?: string[];
    image_path?: string | null;
    // One-sentence card-sized description, written by Claude specifically
    // for the avatar sub-card on each offer rung. Distinct from one_line
    // (which can be long/paragraph-y from the parsed .md).
    card_summary?: string | null;
  };

  const dir = abs('05_Assets', 'Avatars');
  const files: Array<{ slug: string; filename: string; parsed: ReturnType<typeof parseAvatarMd> }> = [];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md') || f.startsWith('_') || f.startsWith('.')) continue;
      const slug = avatarSlug(f.replace(/\.md$/, ''));
      let parsed: ReturnType<typeof parseAvatarMd> = {};
      try {
        const raw = fs.readFileSync(`${dir}/${f}`, 'utf8');
        parsed = parseAvatarMd(raw);
      } catch {}
      files.push({ slug, filename: f, parsed });
    }
  } catch {}

  // Bank entries live in offer-results.json (the "results" bank is reused
  // for avatars - see makeBankCRUD('results', 'name') in routes/offers.ts).
  let bankItems: Array<Record<string, any>> = [];
  try {
    bankItems = JSON.parse(fs.readFileSync(abs('00_System', 'offer-results.json'), 'utf8'));
  } catch {}
  // Heuristic for "is this a results entry or an avatar entry?" - results
  // have `title`, avatars have `name`. We only treat name-bearing rows as
  // avatars.
  bankItems = bankItems.filter((b) => typeof b?.name === 'string' && b.name.trim().length > 0);

  // Merge keyed by ID, not by name. The avatar's id is stable across
  // renames (file-based id is `avatar-<slug>` derived from the filename;
  // bank entries that upsert through PATCH preserve that same id). Using
  // id as the join key means renaming "adriana" → "alyssa" updates the
  // existing card instead of orphaning the file row and creating a
  // duplicate under the new slug. Bank fields override parsed defaults.
  const byId = new Map<string, Out>();
  for (const f of files) {
    const id = `avatar-${f.slug}`;
    byId.set(id, {
      id,
      name: f.slug,
      source_file: `05_Assets/Avatars/${f.filename}`,
      one_line: f.parsed.one_line ?? null,
      before_state: f.parsed.before_state ?? null,
      after_state: f.parsed.after_state ?? null,
      struggles: f.parsed.struggles ?? [],
      outcomes: f.parsed.outcomes ?? [],
      price_point: null,
      demographics: null,
      image_path: null,
      card_summary: null,
    });
  }
  for (const b of bankItems) {
    const id = String(b.id);
    const existing = byId.get(id);
    const merged: Out = existing ?? {
      id,
      name: String(b.name),
      source_file: null,
      one_line: null,
      before_state: null,
      after_state: null,
      struggles: [],
      outcomes: [],
      price_point: null,
      demographics: null,
      image_path: null,
      card_summary: null,
    };
    // Bank name always overrides file-derived slug name - renames are
    // intentional and should be visible immediately.
    if (typeof b.name === 'string' && b.name.trim()) merged.name = b.name;
    if (typeof b.one_line === 'string' && b.one_line.trim()) merged.one_line = b.one_line;
    if (typeof b.before_state === 'string' && b.before_state.trim()) merged.before_state = b.before_state;
    if (typeof b.after_state === 'string' && b.after_state.trim()) merged.after_state = b.after_state;
    if (typeof b.price_point === 'string' && b.price_point.trim()) merged.price_point = b.price_point;
    if (typeof b.demographics === 'string') merged.demographics = b.demographics;
    if (Array.isArray(b.struggles) && b.struggles.length) merged.struggles = b.struggles;
    if (Array.isArray(b.outcomes) && b.outcomes.length) merged.outcomes = b.outcomes;
    if (typeof b.image_path === 'string' && b.image_path.trim()) merged.image_path = b.image_path;
    if (typeof b.card_summary === 'string' && b.card_summary.trim()) merged.card_summary = b.card_summary;
    byId.set(id, merged);
  }
  return [...byId.values()];
}

function buildLever(id: 'clarity' | 'likelihood' | 'time_delay' | 'effort_sacrifice', slots: Record<string, unknown>) {
  // Map lever id to OfferCHK question category.
  const qKey = id === 'clarity' ? 'clarity' : id === 'likelihood' ? 'proof' : id === 'time_delay' ? 'time' : 'effort';
  const avg = leverScore(slots, qKey);
  return {
    id,
    label:
      id === 'clarity' ? 'Clarity / Dream Outcome'
      : id === 'likelihood' ? 'Proof / Perceived Likelihood'
      : id === 'time_delay' ? 'Time Delay'
      : 'Effort & Sacrifice',
    hormozi_role: id === 'clarity' || id === 'likelihood' ? 'numerator' : 'denominator',
    color:
      id === 'clarity' ? 'var(--recovery)'
      : id === 'likelihood' ? 'var(--strain)'
      : id === 'time_delay' ? 'var(--sleep)'
      : 'var(--hrv)',
    score: avg,
    self_rate_avg: Math.round(avg),
    section_signal: 0,
    offercheck_qs: OFFERCHECK_QUESTIONS[qKey].map((q, i) => ({
      id: `${qKey}_q${i + 1}`,
      question: q,
      self_rate: rate(slots, `strength_${qKey}_q${i + 1}`, 0),
    })),
    feeds_from_sections: id === 'clarity' ? ['avatar', 'validation', 'content_offer']
      : id === 'likelihood' ? ['proof', 'pricing', 'content_offer']
      : [],
  };
}

// Per-slot display metadata. When a slot key appears here its `label` is
// used as the foundation row's heading (a real question) and `prompt` is
// shown as a one-line nudge under the heading the first time the creator opens
// the row. Slots not listed here fall back to the auto-label (key with
// underscores replaced by spaces) and no prompt.
const FIELD_DEFS: Record<string, { label: string; prompt?: string }> = {};

// Validation checklist, grouped by the 5 offer stages. Each phase has
// its own set of tangible yes/no checks - the furthest phase that isn't
// fully complete is the phase the creator's currently working in. Done state
// persists in state.md as `offer_vcheck_<check_id>` so check ids must
// be unique across all phases.
type ValidationCheckDef = { id: string; label: string; hint?: string };
type ValidationPhaseDef = {
  id: 'idea' | 'validating' | 'iterating' | 'signature' | 'scaling';
  label: string;
  description: string;
  checks: ValidationCheckDef[];
};

const VALIDATION_PHASES: ValidationPhaseDef[] = [
  {
    id: 'idea',
    label: 'Idea',
    description: 'Is there demand? Have you proven people actually want this before you build it?',
    checks: [
      {
        id: 'five_1on1_conversations',
        label: "I've had 1:1 conversations with at least 5 people who told me they want this",
        hint: 'real conversations, not surveys. five different people, each said yes unprompted.',
      },
      {
        id: 'five_audience_quotes',
        label: "I've collected at least 5 verbatim quotes from the audience describing this problem",
        hint: 'their actual words, not your paraphrase. from comments, DMs, transcripts, calls.',
      },
      {
        id: 'waitlist_page_conversion',
        label: 'I have a waitlist page converting at at least 10% (visitors → sign-ups)',
        hint: 'a real page, real traffic going to it, and a measurable sign-up rate above 10%. proves the pitch lands.',
      },
      {
        id: 'comparable_offer_succeeding',
        label: "I've seen at least 1 other person sell something similar successfully",
        hint: 'real numbers ideally (members, revenue, testimonials). proves the market buys.',
      },
      {
        id: 'content_engagement_above_avg',
        label: "I've posted content on this subject and it got above-average engagement",
        hint: 'views, likes, comments, shares - better than your usual baseline. one piece is enough to count.',
      },
    ],
  },
  {
    id: 'validating',
    label: 'Validating',
    description: 'MVP launched, sales page converting, first buyers paying. The offer can sell.',
    checks: [
      {
        id: 'mvp_launched',
        label: "I've launched a minimum viable product (MVP)",
        hint: 'a thin, buyable version is live and people can give you money for it today.',
      },
      {
        id: 'sales_page_traffic_1000',
        label: 'I have at least 1,000 visits to my sales page',
        hint: 'real traffic landing on the sales page for this offer. enough volume that the conversion rate actually means something.',
      },
      {
        id: 'sales_page_converting',
        label: 'My sales page for this offer is converting at least 2%',
        hint: 'visitor → buyer rate is at least 2% on real traffic.',
      },
      {
        id: 'five_positive_results_or_reviews',
        label: 'I have at least 5 positive results, testimonials, or reviews from MVP buyers',
        hint: 'five different buyers, each with a documented positive outcome - a result they got, a written testimonial, or a public review. proof the MVP actually delivered.',
      },
      {
        id: 'buyers_would_buy_again',
        label: 'Buyers have told me they would buy this again or recommend it',
        hint: 'a direct statement: "yes I would buy this again" / "I would recommend it to a friend". documented somewhere.',
      },
    ],
  },
  {
    id: 'iterating',
    label: 'Iterating',
    description: "Buyers are starting to get the results the offer promises. The product actually works.",
    checks: [
      {
        id: 'buyers_getting_promised_results',
        label: 'Buyers are getting the results the offer promises',
        hint: 'not "they liked it" - they actually got the outcome you said they\'d get. measurable, repeatable.',
      },
      {
        id: 'three_testimonials_with_results',
        label: 'I have 3+ documented testimonials describing those results',
        hint: 'written or video, with specifics (what they did → what they got). usable in marketing, permission to publish.',
      },
      {
        id: 'price_raised_conversion_held',
        label: "I've raised the price at least once and conversion stayed above 2%",
        hint: 'price went up, sales page still converts at 2%+. demand held at the new level.',
      },
      {
        id: 'repeatable_acquisition_predictable_conversion',
        label: 'I have a predictable acquisition channel with stable conversion rates',
        hint: 'same channel, same kind of buyer, conversion holds month over month. you can roughly forecast sales.',
      },
      {
        id: 'predictable_consistent_revenue',
        label: "I'm making predictable and consistent revenue from this offer",
        hint: 'month-over-month revenue is steady or growing - not boom-and-bust. you can roughly forecast next month\'s number.',
      },
    ],
  },
  {
    id: 'signature',
    label: 'Signature Offer',
    description: "Signs you're ready to scale. Consistent results, referrals, premium pricing — the offer has crystallised.",
    checks: [
      {
        id: 'consistent_outcome',
        label: 'I consistently deliver the same promised outcome',
        hint: 'most buyers get the thing the offer promises. not "depends on the buyer".',
      },
      {
        id: 'consistent_referrals',
        label: "I'm consistently getting referrals - people refer new buyers to me",
        hint: 'word-of-mouth is producing sales without you asking. multiple referred buyers in the last few months.',
      },
      {
        id: 'conversion_above_signature_threshold',
        label: 'My sales page conversion is consistently above 3%',
        hint: 'higher than the validating bar. holds month over month, not a one-off spike.',
      },
      {
        id: 'premium_priced_still_selling',
        label: 'The offer is priced at a premium and people still buy',
        hint: 'meaningfully above the validating-stage price. demand held at the new level.',
      },
      {
        id: 'clear_name_and_framework',
        label: 'The offer has a clear name + a named signature framework',
        hint: 'not "my coaching program" - a real name + a teachable method (the 3-step thing / 5 pillars / X system).',
      },
    ],
  },
  {
    id: 'scaling',
    label: 'Scaling',
    description: 'Things you can do to scale. Funnels, suite, inbound, systemised delivery, growth.',
    checks: [
      {
        id: 'built_automated_email_funnel',
        label: "I've built an automated email funnel converting cold traffic",
        hint: 'opt-in → nurture → sale, set up once, running without manual touches. measurable conversion.',
      },
      {
        id: 'expanded_into_offer_suite',
        label: "I've expanded into a multi-tier offer suite (entry / core / premium)",
        hint: 'at least 2 other rungs so buyers can climb (and a downsell catches people who balk at the core price).',
      },
      {
        id: 'made_inbound_dominant',
        label: "I've made inbound from content the dominant lead source",
        hint: 'most new buyers find you through content. you\'re not chasing or DMing for sales.',
      },
      {
        id: 'systemised_delivery',
        label: "I've systemised delivery so it runs without me touching every customer",
        hint: 'onboarding, support, fulfilment - templated or delegated. you can take a week off and it still works.',
      },
      {
        id: 'revenue_predictable_mom',
        label: 'Revenue from this offer is predictable month over month',
        hint: 'at scaled volume, the monthly number is forecastable - no big swings. growth is steady because the system, not luck, is driving it.',
      },
    ],
  },
];

// Build the per-phase validation payload by reading every check's
// done-state from state.md (offer_vcheck_<id>). Computes a pct_complete
// per phase and identifies the "current" phase = the first phase that
// isn't 100% complete (or "scaling" if every check is done).
// Validation state is now PER-RUNG, not global. Each pricing rung has
// its own independent set of ticked checks - what's ticked on Solopreneur
// Systems doesn't apply to OS Builds. Slot key shape:
//   offer_rung_<rungId>_vcheck_<checkId>: '1' | null
//
// rungId is the pricing-rungs.json id (e.g. "seed-mid"). If rungId is
// null/undefined, falls back to reading the legacy global slot - kept
// only as a transitional read path; new writes always go to the rung
// namespace.
function loadValidationPhasesForRung(slots: Record<string, unknown>, rungId: string | null) {
  const slotKey = (checkId: string) =>
    rungId ? `offer_rung_${rungId}_vcheck_${checkId}` : `offer_vcheck_${checkId}`;
  const phases = VALIDATION_PHASES.map((p) => {
    const checks = p.checks.map((def) => {
      const v = slots[slotKey(def.id)];
      return {
        id: def.id,
        label: def.label,
        hint: def.hint ?? null,
        done: v === '1' || v === 1 || v === true,
      };
    });
    const doneCount = checks.filter((c) => c.done).length;
    return {
      id: p.id,
      label: p.label,
      description: p.description,
      checks,
      done_count: doneCount,
      total: checks.length,
      pct_complete: checks.length > 0 ? doneCount / checks.length : 0,
    };
  });
  // Current phase = first phase < 100% complete; if all done, the last phase.
  const currentPhase =
    phases.find((p) => p.pct_complete < 1)?.id ?? phases[phases.length - 1]!.id;
  return { phases, currentPhase };
}

function buildSection(id: string, label: string, color: string, feeds: string[], fieldSlots: string[], slots: Record<string, unknown>) {
  const build = fieldSlots.map((k) => {
    const def = FIELD_DEFS[k];
    return {
      id: k,
      label: def?.label ?? k.replace(/_/g, ' '),
      source: '00_System/state.md',
      value: slot(slots, k),
      filled: !!slot(slots, k),
      prompt: def?.prompt ?? '',
    };
  });
  const filled = build.filter((b) => b.filled).length;
  const completion = build.length > 0 ? filled / build.length : 0;
  // Section-level validation_phases is no longer surfaced - validation
  // state is per-rung now. The global section panel at the bottom of
  // the page is being deprecated in favour of the per-rung sub-card
  // panel. build_completion stays as the foundation-fields % for
  // non-validation sections; for validation it's just 0 since there's
  // no foundation fields and no global state.
  return {
    id,
    label,
    color,
    feeds_levers: feeds,
    build,
    avatars: id === 'avatar' ? loadAvatars() : [],
    build_completion: completion,
  };
}

// ─── Pricing rungs (offer-pricing-rungs.json) ──────────────────────────────
// Each rung is an offer in the creator's suite. The full suite has three default
// tiers (low / mid / high) seeded the first time the file is empty; she can
// add custom tiers on top. Each rung optionally attaches one avatar_id that
// links to an avatar from 05_Assets/Avatars/.

type PricingRung = {
  id: string;
  price_label: string;
  name: string;
  proof_required: string | null;
  // One sentence: what specific outcome this offer delivers + in what time
  // frame. Sits at the top of the expanded offer card. Drives the rest of
  // the offer's framing.
  promise: string;
  status: 'idea' | 'validated' | 'iterating' | 'signature' | 'scaling';
  sort_order: number;
  tier: 'low' | 'mid' | 'high' | 'custom';
  avatar_id: string | null;
  // Exactly one rung is "featured" at a time. The featured offer is what
  // the creator's actively building/iterating - shown big at the top of the suite,
  // and its score flows into Today + Focus pages under the 90-day sprint.
  featured: boolean;

  // ─── Pricing strategy (per-offer) ──────────────────────────────────────
  goal_price_label: string;
  target_revenue_per_month_usd: number | null;
  target_customers_per_month: number | null;
  pricing_plan: string; // free text: how the creator plans to raise the price over time

  // ─── Conversions (per-offer funnel) ────────────────────────────────────
  // Sales Page is the destination - the page where checkout happens. No
  // tracking link of its own (it IS the destination); conversion is
  // manual (buyers / visitors).
  //
  // VSL is upstream of the sales page. The /go/<vsl-tracking-slug>
  // points AT the sales page URL, not at the VSL URL. Conversion =
  // link_clicks / views = click-through rate (what % of viewers went to
  // the sales page).
  //
  // YouTube content videos work like VSLs - each has its own /go/<slug>
  // short link that points at this offer's sales page. Auto-managed by
  // the YouTube description generator (Pass 2 - not wired yet).
  sales_page_url: string;
  sales_page_visitors_30d: number | null;
  sales_page_buyers_30d: number | null;

  vsl_url: string;
  vsl_tracking_slug: string;
  vsl_views_30d: number | null;       // YouTube views in the last 30 days
  vsl_link_clicks_30d: number | null; // clicks on /go/<vsl-tracking-slug>

  content_mentions_per_month: number | null;
  cta_count_per_video: number | null;
  has_email_funnel: boolean;
  direct_from_content: boolean; // straight from content → offer (no list / VSL)
  cta_locations: string;        // where the CTA appears (bio, pinned, end of video, etc)
  audience_journey: string;     // step by step path the viewer takes to the offer
  cta_frequency: string;        // how often audience actually sees the CTA

  // ─── 25-question self-rate scores (0 = unrated, 1-5 = self-score) ──────
  // Five sub-sections × five questions each. The Overall Score card on the
  // expanded offer surfaces all 25 and computes the per-section + overall
  // (stage-weighted) scores from these arrays.
  scores: {
    avatar: number[];     // 5 entries
    pricing: number[];    // 5 entries
    proof: number[];      // 5 entries
    validation: number[]; // 5 entries
    content: number[];    // 5 entries
  };

  // Claude's per-question reasoning from the last analyze call. Same
  // shape as scores - 5 strings per section, empty string when never
  // analyzed. Persisted so closing the panel doesn't lose Claude's
  // suggestions; only overwritten when she clicks "re-analyze".
  reasoning?: {
    avatar: string[];
    pricing: string[];
    proof: string[];
    validation: string[];
    content: string[];
  };

  created_at?: number;
  updated_at?: number;
};

function normScoreArray(v: unknown): number[] {
  const out = [0, 0, 0, 0, 0];
  if (!Array.isArray(v)) return out;
  for (let i = 0; i < 5; i++) {
    const n = (v as unknown[])[i];
    if (typeof n === 'number' && n >= 0 && n <= 5) out[i] = Math.round(n);
  }
  return out;
}

// Same shape as normScoreArray but for the persisted reasoning strings.
// Fills missing/non-string slots with '' so the array is always length 5.
function normReasoningArray(v: unknown): string[] {
  const out: string[] = ['', '', '', '', ''];
  if (!Array.isArray(v)) return out;
  for (let i = 0; i < 5; i++) {
    const s = (v as unknown[])[i];
    if (typeof s === 'string') out[i] = s;
  }
  return out;
}

const PRICING_STATUSES = ['idea', 'validated', 'iterating', 'signature', 'scaling'] as const;

function normalizePricingStatus(v: unknown): PricingRung['status'] {
  if (typeof v !== 'string') return 'idea';
  if ((PRICING_STATUSES as readonly string[]).includes(v)) return v as PricingRung['status'];
  // Migrate legacy ladder + earlier 'unvalidated' value to the new 'idea'.
  if (v === 'unvalidated') return 'idea';
  if (v === 'achieved') return 'scaling';
  if (v === 'current') return 'iterating';
  if (v === 'target') return 'validated';
  if (v === 'future') return 'idea';
  return 'idea';
}

const PRICING_RUNGS_FILE = abs('00_System', 'offer-pricing-rungs.json');

function loadPricingRungs(): PricingRung[] {
  const now = Math.floor(Date.now() / 1000);
  let raw: any[] = [];
  try {
    raw = JSON.parse(fs.readFileSync(PRICING_RUNGS_FILE, 'utf8'));
    if (!Array.isArray(raw)) raw = [];
  } catch {
    raw = [];
  }

  // Seed defaults the first time the file is empty so the creator sees the
  // low / mid / high frame immediately. Once she edits any rung the seed is
  // a real persisted entry like any other.
  if (raw.length === 0) {
    raw = (['low', 'mid', 'high'] as const).map((tier, i) => ({
      id: `seed-${tier}`,
      price_label: '',
      name: '',
      proof_required: null,
      promise: '',
      status: 'idea',
      sort_order: i + 1,
      tier,
      avatar_id: null,
      featured: false,
      created_at: now,
      updated_at: now,
    }));
    try {
      fs.mkdirSync(abs('00_System'), { recursive: true });
      fs.writeFileSync(PRICING_RUNGS_FILE, JSON.stringify(raw, null, 2));
    } catch {}
  }

  // Normalise legacy rows that don't have the new fields yet.
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const normalized = raw.map((r: any) => ({
    id: r.id,
    price_label: str(r.price_label),
    name: str(r.name),
    proof_required: typeof r.proof_required === 'string' ? r.proof_required : null,
    promise: str(r.promise),
    status: normalizePricingStatus(r.status),
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    tier: (['low', 'mid', 'high', 'custom'].includes(r.tier) ? r.tier : 'custom') as PricingRung['tier'],
    avatar_id: typeof r.avatar_id === 'string' && r.avatar_id ? r.avatar_id : null,
    featured: r.featured === true,
    goal_price_label: str(r.goal_price_label),
    target_revenue_per_month_usd: num(r.target_revenue_per_month_usd),
    target_customers_per_month: num(r.target_customers_per_month),
    pricing_plan: str(r.pricing_plan),
    sales_page_url: str(r.sales_page_url),
    sales_page_visitors_30d: num(r.sales_page_visitors_30d),
    sales_page_buyers_30d: num(r.sales_page_buyers_30d),
    vsl_url: str(r.vsl_url),
    vsl_tracking_slug: str(r.vsl_tracking_slug),
    // Field rename: vsl_visitors_30d/vsl_buyers_30d -> vsl_views_30d/vsl_link_clicks_30d.
    // The old names mismatched their meaning. Fallback to old keys for any
    // rung that was already populated under the old names.
    vsl_views_30d: num(r.vsl_views_30d ?? r.vsl_visitors_30d),
    vsl_link_clicks_30d: num(r.vsl_link_clicks_30d ?? r.vsl_buyers_30d),
    content_mentions_per_month: num(r.content_mentions_per_month),
    cta_count_per_video: num(r.cta_count_per_video),
    has_email_funnel: r.has_email_funnel === true,
    direct_from_content: r.direct_from_content === true,
    cta_locations: str(r.cta_locations),
    audience_journey: str(r.audience_journey),
    cta_frequency: str(r.cta_frequency),
    scores: {
      avatar: normScoreArray(r.scores?.avatar),
      pricing: normScoreArray(r.scores?.pricing),
      proof: normScoreArray(r.scores?.proof),
      validation: normScoreArray(r.scores?.validation),
      content: normScoreArray(r.scores?.content),
    },
    reasoning: {
      avatar: normReasoningArray(r.reasoning?.avatar),
      pricing: normReasoningArray(r.reasoning?.pricing),
      proof: normReasoningArray(r.reasoning?.proof),
      validation: normReasoningArray(r.reasoning?.validation),
      content: normReasoningArray(r.reasoning?.content),
    },
    created_at: typeof r.created_at === 'number' ? r.created_at : now,
    updated_at: typeof r.updated_at === 'number' ? r.updated_at : now,
  }));
  // Enforce single-featured invariant. If multiple rows claim featured (shouldn't
  // happen via the API but possible if file is hand-edited), keep the first one.
  let seenFeatured = false;
  for (const r of normalized) {
    if (r.featured && !seenFeatured) seenFeatured = true;
    else r.featured = false;
  }
  return normalized;
}

/**
 * Set exactly one rung as featured. Clears featured on all others. Returns
 * the new state so the route can write back to disk in one pass.
 */
export function setFeaturedRung(id: string): PricingRung[] {
  const all = loadPricingRungs();
  if (!all.find((r) => r.id === id)) return all;
  const next = all.map((r) => ({ ...r, featured: r.id === id, updated_at: Math.floor(Date.now() / 1000) }));
  try {
    fs.writeFileSync(PRICING_RUNGS_FILE, JSON.stringify(next, null, 2));
  } catch {}
  return next;
}

/** Clear featured on all rungs (no featured offer). */
export function clearFeaturedRung(): PricingRung[] {
  const all = loadPricingRungs();
  const next = all.map((r) => ({ ...r, featured: false, updated_at: Math.floor(Date.now() / 1000) }));
  try {
    fs.writeFileSync(PRICING_RUNGS_FILE, JSON.stringify(next, null, 2));
  } catch {}
  return next;
}

/**
 * Proof section's build_completion is driven by The Promise + pinned proof
 * (managed under the proof section panel), NOT the legacy foundation slots
 * (testimonial_bank, client_results, own_result) which were hidden when the
 * promise-and-pinned-proof UX shipped.
 *
 * Three "fields" rolled into one score:
 *   1. promise written
 *   2. at least one item pinned as proof
 *   3. at least three items pinned (diverse evidence)
 */
// Per-rung proof state. Each rung has its own independent promise text
// + pinned proof IDs. Slot keys:
//   offer_rung_<rungId>_promise_text         (string)
//   offer_rung_<rungId>_pinned_proof_ids     (string[])
//
// Unlike validation, the GLOBAL section is still rendered for
// backward-compat at the bottom of the offer page (returning 0% if no
// global slots set). The per-rung sub-card opens the per-rung panel.
export function loadRungProofState(slots: Record<string, unknown>, rungId: string): {
  promise_text: string | null;
  pinned_proof_ids: string[];
  build_completion: number;
} {
  const promiseRaw = slots[`offer_rung_${rungId}_promise_text`];
  const promise_text = typeof promiseRaw === 'string' && promiseRaw.trim() ? promiseRaw : null;
  const pinnedRaw = slots[`offer_rung_${rungId}_pinned_proof_ids`];
  const pinned_proof_ids: string[] = Array.isArray(pinnedRaw)
    ? (pinnedRaw as unknown[]).filter((x): x is string => typeof x === 'string')
    : typeof pinnedRaw === 'string' && pinnedRaw.length > 0
    ? pinnedRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  // 3-field completion: promise written / 1+ pinned / 3+ pinned.
  let filled = 0;
  if (promise_text) filled++;
  if (pinned_proof_ids.length >= 1) filled++;
  if (pinned_proof_ids.length >= 3) filled++;
  return { promise_text, pinned_proof_ids, build_completion: filled / 3 };
}

function buildProofSection(slots: Record<string, unknown>) {
  const promiseText = slot(slots, 'promise_text');
  const rawPinned = slots['slot_pinned_proof_ids'];
  const pinnedIds: string[] = Array.isArray(rawPinned)
    ? (rawPinned as unknown[]).filter((x): x is string => typeof x === 'string')
    : typeof rawPinned === 'string' && (rawPinned as string).length > 0
      ? (rawPinned as string).split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  const fields = [
    { id: 'proof_promise', label: 'the promise written', filled: !!promiseText },
    { id: 'proof_pin_one', label: 'at least one proof pinned', filled: pinnedIds.length >= 1 },
    { id: 'proof_pin_three', label: 'at least three proofs pinned', filled: pinnedIds.length >= 3 },
  ];
  const filled = fields.filter((f) => f.filled).length;
  return {
    id: 'proof',
    label: 'Proof',
    // var(--strain-light) doesn't exist - the Ring then renders no fill.
    // Use the real strain token (same blue as the rest of the lever).
    color: 'var(--strain)',
    feeds_levers: ['likelihood'],
    build: fields.map((f) => ({
      id: f.id,
      label: f.label,
      source: '00_System/state.md',
      value: null,
      filled: f.filled,
      prompt: '',
    })),
    avatars: [] as ReturnType<typeof loadAvatars>,
    build_completion: filled / fields.length,
  };
}

export function buildOffersResponse() {
  const slots = getSlots();

  const offer_profile = {
    name: slot(slots, 'name'),
    transformation: slot(slots, 'transformation'),
    big_promise: slot(slots, 'big_promise'),
    mechanism: slot(slots, 'mechanism'),
    who_youre_selling_to: slot(slots, 'who'),
  };

  const stageRaw = (slot(slots, 'stage', 'idea') as string) ?? 'idea';
  // Migrate any legacy 'unvalidated' value to the new 'idea'.
  const stageId = stageRaw === 'unvalidated' ? 'idea' : stageRaw;
  const stage = STAGES.find((s) => s.id === stageId) ?? STAGES[0]!;

  const levers = (['clarity', 'likelihood', 'time_delay', 'effort_sacrifice'] as const).map((id) =>
    buildLever(id, slots)
  );

  // Hormozi-style: (clarity * likelihood) / (time * effort) with floor 1.
  const c = Math.max(1, levers[0]!.score);
  const l = Math.max(1, levers[1]!.score);
  const t = Math.max(1, levers[2]!.score);
  const e = Math.max(1, levers[3]!.score);
  const raw = (c * l) / (t * e);
  const normalized = clampPct((raw / 5) * 100);
  const offerStrengthScore = normalized;

  const avatars = loadAvatars();
  const pricingRungs = loadPricingRungs();

  const sections: any[] = [
    // Avatars + Offer Suite both render in sleep blue on the Offer
    // page header (matching the per-rung section panels). Only the
    // overall offer score uses recovery green as the standout.
    buildSection('avatar', 'Avatars', 'var(--sleep)', ['clarity'], ['avatar_name', 'before_state', 'after_state', 'demographics'], slots),
    buildSection('pricing', 'Offer Suite', 'var(--sleep)', ['likelihood'], ['current_price', 'who_buys_at_each_rung', 'mechanism_per_rung'], slots),
    // Proof now scores against The Promise + pinned proof IDs, not the old
     // foundation slots (which were hidden on the panel). See proofCompletion.
    buildProofSection(slots),
    // Validation renders its tangible checkbox list instead of foundation
    // text fields - the fieldSlots array is empty on purpose.
    buildSection('validation', 'Validation', 'var(--sleep)', ['clarity', 'likelihood'], [], slots),
    buildSection('content_offer', 'Content-Offer Integration', 'var(--recovery)', ['clarity', 'likelihood'], ['cornerstone_vsl', 'cta_plan_per_content_type'], slots),
  ];

  // ─── Enrich pricing section ─────────────────────────────────────────────
  // Pricing rungs come from offer-pricing-rungs.json. The avatar dropdown on
  // each rung needs the same list of avatars rendered on the avatar section,
  // so we share the loaded array. Each rung also gets its own per-rung
  // validation state so ticking on one offer doesn't bleed into another.
  const pricing = sections.find((s) => s.id === 'pricing');
  if (pricing) {
    // Attach per-rung validation phases to each rung (read from
    // offer_rung_<rungId>_vcheck_<checkId> slots).
    pricing.pricing_rungs = pricingRungs.map((r) => {
      const v = loadValidationPhasesForRung(slots, r.id);
      const p = loadRungProofState(slots, r.id);
      return {
        ...r,
        validation_phases: v.phases,
        current_validation_phase: v.currentPhase,
        proof_section: p,
      };
    });
    pricing.avatars = avatars;
  }

  const sectionAvg = sections.reduce((acc, s) => acc + s.build_completion * 100, 0) / sections.length;
  const overall = Math.round((offerStrengthScore + sectionAvg * sections.length) / (1 + sections.length));

  return {
    offer_id: 'focus',
    offer_profile,
    stage,
    framing: FRAMING,
    levers,
    sections,
    overall_score: overall,
    offer_strength_score: offerStrengthScore,
    hormozi_breakdown: {
      clarity: levers[0]!.score,
      likelihood: levers[1]!.score,
      time_delay: levers[2]!.score,
      effort_sacrifice: levers[3]!.score,
      raw,
      normalized,
    },
  };
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Cleanup helpers
void loadCollection;
