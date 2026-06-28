import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Ring } from '../components/Ring';
import { Reputation } from './Reputation';
import { Offer } from './Offer';
import { useLocation, useNavigate } from 'react-router-dom';
import { SkillRow } from './Skills';
import { PageTabs } from '../components/PageTabs';

// The Personal Brand Strategy skill, shown as its exact Skills-page row (icon,
// title + built-in badge, card line, run skill) minus the schedule button - a
// direct way to open a conversation with Claude to sharpen the foundation.
function StrategyLaunchCard() {
  const navigate = useNavigate();
  const { data: skills } = useQuery({ queryKey: ['skills'], queryFn: api.skills });
  const item = skills?.items.find((s) => s.name === 'solopreneur-onboarding');
  if (!item) return null;
  return <SkillRow skill={item} onOpen={() => navigate(`/skills/${item.id}`)} hideSchedule />;
}

// One-sentence "what this onboarding phase will help you do" copy per phase.
// Falls back to the section's existing summary if a phase id isn't here.
const PHASE_HELP: Record<string, string> = {
  positioning:
    'Sharpens who you help, what transformation you deliver, and what sets you apart.',
  audience:
    'Defines the one persona your content, copy, and offers should speak to.',
  'my-story':
    'Distills the personal arc that proves you can deliver the transformation you sell.',
  'core-ip':
    'Captures the repeatable method you teach so every piece of content can plug into it.',
  'offer-suite':
    'Maps how you package and price your work across the rungs of your offer ladder.',
  'voice-style':
    'Locks in your sentence rhythm, signature phrases, and the way you sound on the page.',
};

// Gradient from neutral gray (0% complete) to vivid green (100% complete).
// the creator's ask: complete = green, partial = a shade of gray gradually warming
// toward green. Single hue family the whole way through.
function gradualPhaseColor(completion: number): string {
  const t = Math.max(0, Math.min(1, completion / 100));
  // gray rgb(120,120,120) → recovery green rgb(22, 201, 126)
  const r = Math.round(120 + (22 - 120) * t);
  const g = Math.round(120 + (201 - 120) * t);
  const b = Math.round(120 + (126 - 120) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

type Tab = 'overview' | 'reputation' | 'offer';

const TABS: { id: Tab; label: string; path: string }[] = [
  { id: 'overview', label: 'foundation', path: '/profile' },
  { id: 'reputation', label: 'reputation', path: '/profile/reputation' },
  { id: 'offer', label: 'offer', path: '/profile/offer' },
];

export function Profile() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const activeTab: Tab = path.endsWith('/offer')
    ? 'offer'
    : path.endsWith('/reputation')
    ? 'reputation'
    : 'overview';

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      {/* Foundation / Reputation / Offer file-folder page-tabs. Navigation-based:
          each tab maps to a /profile route. No page title - the tabs are the header. */}
      <PageTabs
        value={activeTab}
        onChange={(v) => {
          const t = TABS.find((x) => x.id === v);
          if (t) navigate(t.path);
        }}
        ariaLabel="profile section"
        options={TABS.map((t) => ({ value: t.id, label: t.label }))}
      />

      {activeTab === 'overview' && <ProfileOverview />}
      {activeTab === 'reputation' && <Reputation />}
      {activeTab === 'offer' && <Offer />}
    </div>
  );
}

function ProfileOverview() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['profile'],
    queryFn: api.profile,
  });

  // Bridge health check - surface "AI features not connected" if the claude-bridge
  // is down OR the claude CLI is missing. We don't burn tokens on a real Claude
  // call here - this is just a reachability + install check. Auth issues surface
  // separately via extraction_error on the main /api/profile payload.
  const { data: bridgeHealth } = useQuery({
    queryKey: ['profile', 'bridge-health'],
    queryFn: api.bridgeHealth,
    refetchInterval: 30_000,
    retry: false,
  });

  if (error) return <div className="empty">couldn't load profile: {(error as Error).message}</div>;

  const items = data?.items ?? [];
  const overall = data?.overall_completion ?? 0;
  const showBridgeBanner = bridgeHealth && !bridgeHealth.ok;
  const showExtractionBanner = data?.extraction_status === 'error' && data?.extraction_error;

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <style>{PHASE_CARD_CSS}</style>

      {showBridgeBanner && (
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(230, 165, 47, 0.08)',
            border: '1px solid rgba(230, 165, 47, 0.3)',
            color: 'var(--ink)',
            fontSize: 'var(--body-sm)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--strain)' }}>
            AI features are not connected
          </strong>
          The claude-bridge isn't reachable. Open a terminal and run{' '}
          <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
            claude auth login
          </code>{' '}
          to set up Claude Code, then restart the dashboard. Without this, extraction, title
          generation, transcript analysis, and voice features will fail silently.
        </div>
      )}

      {showExtractionBanner && (
        <div
          style={{
            padding: 'var(--space-4) var(--space-5)',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 77, 77, 0.08)',
            border: '1px solid rgba(255, 77, 77, 0.3)',
            color: 'var(--ink)',
            fontSize: 'var(--body-sm)',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 4, color: 'var(--danger)' }}>
            Extraction failed
          </strong>
          {data?.extraction_error}
          <br />
          Most often this means Claude isn't authenticated. Run{' '}
          <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>
            claude auth login
          </code>{' '}
          and reload.
        </div>
      )}

      <ProfileHero
        overall={overall}
        completeCount={items.filter((i) => i.completion >= 85).length}
        totalCount={items.length || 6}
        slotsPopulated={data?.slots_populated ?? 0}
        slotsTotal={data?.slots_total ?? 18}
        extractionStatus={data?.extraction_status ?? 'idle'}
      />

      <StrategyLaunchCard />

      {isLoading ? (
        <div className="empty">loading</div>
      ) : (
        <section className="stack" style={{ gap: 'var(--space-4)' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              paddingBottom: 'var(--space-3)',
              borderBottom: '1px solid var(--hairline)',
              gap: 'var(--space-3)',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                letterSpacing: '-0.03em',
                margin: 0,
              }}
            >
              Onboarding phases
            </h2>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              click to read
            </span>
          </header>
          <div className="grid grid--2">
            {items.map((s) => (
              <PhaseCard
                key={s.id}
                id={s.id}
                title={s.title}
                phase={s.phase}
                summary={s.summary}
                completion={s.completion}
                open={openId === s.id}
                onToggle={() => setOpenId(openId === s.id ? null : s.id)}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function ProfileHero({
  overall,
  completeCount,
  totalCount,
  slotsPopulated,
  slotsTotal,
  extractionStatus,
}: {
  overall: number;
  completeCount: number;
  totalCount: number;
  slotsPopulated: number;
  slotsTotal: number;
  extractionStatus: 'idle' | 'running' | 'completed' | 'error';
}) {
  // True completion gates on BOTH layers: file content present (overall) AND
  // structured data extracted (slotsPopulated). Previously a fresh vault with
  // 6 prose-filled core files showed 100% even though Reputation + Offer
  // pages were empty because no slot_* fields were populated yet.
  const filesComplete = overall >= 85;
  const slotsComplete = slotsTotal > 0 && slotsPopulated / slotsTotal >= 0.85;
  const trulyComplete = filesComplete && slotsComplete;
  const stageLabel = trulyComplete
    ? 'complete'
    : extractionStatus === 'running'
    ? 'extracting'
    : overall >= 60
    ? 'almost there'
    : overall >= 30
    ? 'in progress'
    : 'just getting started';
  return (
    <section className="profile-hero">
      <div className="profile-hero__ring">
        <Ring
          value={overall / 100}
          label=""
          bigNumber={`${overall}`}
          unit="%"
          size="hero"
          color="var(--recovery)"
        />
      </div>
      <div className="profile-hero__copy">
        <span className="profile-hero__stage">
          stage · {stageLabel} · foundation {completeCount}/{totalCount} · structured data {slotsPopulated}/{slotsTotal}
        </span>
        {extractionStatus === 'running' && (
          <div
            style={{
              marginTop: 4,
              fontSize: 'var(--body-sm)',
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            extraction running in the background - reload in a minute to see your reputation and offer pages populate
          </div>
        )}
        {trulyComplete ? (
          <>
            <h1 className="profile-hero__title">100% of your onboarding is complete</h1>
            <p className="profile-hero__framing">
              All six phases done and all {slotsTotal} structured slots populated. Your positioning, audience, story, IP,
              offer suite, and voice are locked in - every other surface of the dashboard pulls from this foundation.
              Come back here whenever something shifts and update the relevant phase.
            </p>
          </>
        ) : (
          <>
            <h1 className="profile-hero__title">your onboarding progress</h1>
            <p className="profile-hero__framing">
              These six phases lay the foundation of who you are and what you stand for. Every piece of content,
              every offer, and every conversation flows from them. Continue and finish the rest of this
              inside Claude - run the onboarding skill and it picks up exactly where you left off.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function PhaseCard({
  id,
  title,
  phase,
  summary,
  completion,
  open,
  onToggle,
}: {
  id: string;
  title: string;
  phase: string;
  summary: string;
  completion: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { data: full } = useQuery({
    queryKey: ['profile-section', id],
    queryFn: () => api.getProfileSection(id),
    enabled: open,
  });
  const color = gradualPhaseColor(completion);
  const helpText = PHASE_HELP[id] ?? summary;
  const stateLabel =
    completion === 0
      ? 'empty'
      : completion < 60
      ? 'started'
      : completion < 85
      ? 'in progress'
      : 'complete';

  return (
    <>
      <button
        type="button"
        className="rep-dim"
        style={{ ['--dim-c' as string]: color } as React.CSSProperties}
        onClick={onToggle}
        aria-expanded={open}
      >
        <div className="rep-dim__head">
          <div className="rep-dim__head-row">
            <span className="rep-eyebrow" style={{ color }}>
              {title.toLowerCase()}
            </span>
            <span className="rep-dim__pct" style={{ color }}>
              {completion}
              <span className="rep-dim__pct-unit">%</span>
            </span>
          </div>
          <p className="rep-dim__def">{helpText}</p>
        </div>
        <div className="rep-dim__bar">
          <div className="rep-dim__bar-fill" style={{ width: `${completion}%` }} />
        </div>
        <div className="rep-dim__meta">
          <span>{stateLabel}</span>
          <span>read →</span>
        </div>
      </button>
      {open && (
        <PhasePanel
          title={title}
          phase={phase}
          completion={completion}
          color={color}
          helpText={helpText}
          content={full?.content ?? null}
          onClose={onToggle}
        />
      )}
    </>
  );
}

// Slide-over reader for an onboarding phase. Mirrors the Reputation page's
// DimensionPanel: scrim, right-anchored card, colored left border, header
// with eyebrow + title + completion + close. Body renders the section's
// markdown formatted properly (headings, paragraphs, lists, bold, etc.).
function PhasePanel({
  title,
  phase,
  completion,
  color,
  helpText,
  content,
  onClose,
}: {
  title: string;
  phase: string;
  completion: number;
  color: string;
  helpText: string;
  content: string | null;
  onClose: () => void;
}) {
  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside
        className="rep-panel"
        style={{ ['--dim-c' as string]: color } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow" style={{ color }}>{phase}</span>
            <h2 className="rep-panel__title">{title.toLowerCase()}</h2>
            <p className="rep-panel__def">{helpText}</p>
          </div>
          <div className="rep-panel__head-r">
            <div className="rep-panel__score">
              <span>{completion}</span>
              <span className="rep-panel__score-sub">%</span>
            </div>
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>
              close
            </button>
          </div>
        </header>
        <div className="phase-panel__body">
          {content === null ? (
            <div className="muted" style={{ fontSize: 'var(--body-sm)' }}>loading...</div>
          ) : content.trim() === '' ? (
            <div className="muted" style={{ fontSize: 'var(--body-sm)' }}>(this phase has no content yet)</div>
          ) : (
            <Markdown source={content} />
          )}
        </div>
      </aside>
    </div>
  );
}

// Tiny markdown renderer. Handles the subset we actually use in onboarding
// files: ATX headings (h1-h4), paragraphs, bullet + numbered lists, blockquotes,
// fenced code blocks, horizontal rules, plus inline **bold**, *italic*,
// `code`, and [text](url). No HTML, no tables - if those ever show up we'll
// upgrade. Keeps output safe-by-default since we never inject raw HTML.
function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="md">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  );
}

type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ulist'; items: string[] }
  | { kind: 'olist'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'hr' };

function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Fenced code
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] ?? '';
      i++;
      const buf: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').match(/^```\s*$/)) {
        buf.push(lines[i] ?? '');
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }
    // Horizontal rule
    if (/^([-*_])\1{2,}\s*$/.test(line.trim())) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (h) {
      const level = h[1]!.length as 1 | 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, text: h[2]! });
      i++;
      continue;
    }
    // Blockquote (collapse contiguous > lines)
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        buf.push((lines[i] ?? '').replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: buf.join(' ') });
      continue;
    }
    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ulist', items });
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'olist', items });
      continue;
    }
    // Paragraph: collapse contiguous non-blank, non-block-starting lines
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '') break;
      if (/^(#{1,4}\s|>\s|\s*[-*+]\s|\s*\d+\.\s|```|([-*_])\2{2,})/.test(next)) break;
      buf.push(next);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: buf.join(' ') });
  }
  return blocks;
}

function renderBlock(b: MdBlock, key: number): React.ReactNode {
  switch (b.kind) {
    case 'heading': {
      const Tag = (`h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4');
      return (
        <Tag key={key} className={`md__h md__h-${b.level}`}>
          {renderInline(b.text)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="md__p">
          {renderInline(b.text)}
        </p>
      );
    case 'ulist':
      return (
        <ul key={key} className="md__ul">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case 'olist':
      return (
        <ol key={key} className="md__ol">
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case 'quote':
      return (
        <blockquote key={key} className="md__quote">
          {renderInline(b.text)}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={key} className="md__code">
          <code>{b.text}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} className="md__hr" />;
  }
}

// Inline parser. Walks the text emitting alternating plain + styled spans.
// Order matters: code first (so backticks inside other styles aren't matched),
// then links, then bold, then italic.
function renderInline(text: string): React.ReactNode[] {
  // Strategy: tokenize. We use a stack of pattern matches with priorities.
  const PATTERNS: Array<{
    re: RegExp;
    render: (m: RegExpExecArray, key: number) => React.ReactNode;
  }> = [
    {
      re: /`([^`]+)`/,
      render: (m, k) => (
        <code key={k} className="md__inline-code">
          {m[1]}
        </code>
      ),
    },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m, k) => (
        <a key={k} href={m[2]} target="_blank" rel="noreferrer" className="md__link">
          {m[1]}
        </a>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m, k) => <strong key={k}>{m[1]}</strong>,
    },
    {
      re: /\*([^*]+)\*/,
      render: (m, k) => <em key={k}>{m[1]}</em>,
    },
    {
      re: /_([^_]+)_/,
      render: (m, k) => <em key={k}>{m[1]}</em>,
    },
  ];

  const out: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestMatch: RegExpExecArray | null = null;
    let bestPattern = -1;
    for (let p = 0; p < PATTERNS.length; p++) {
      const m = PATTERNS[p]!.re.exec(remaining);
      if (m && (bestIdx === -1 || m.index < bestIdx)) {
        bestIdx = m.index;
        bestMatch = m;
        bestPattern = p;
      }
    }
    if (!bestMatch || bestIdx < 0) {
      out.push(remaining);
      break;
    }
    if (bestIdx > 0) out.push(remaining.slice(0, bestIdx));
    out.push(PATTERNS[bestPattern]!.render(bestMatch, key++));
    remaining = remaining.slice(bestIdx + bestMatch[0].length);
  }
  return out;
}

// Same visual treatment as the Reputation page's dimension cards.
// Card sets `--dim-c` inline (the gradient color for this phase), and the
// CSS picks it up for the eyebrow text, the progress bar, and the hover glow.
const PHASE_CARD_CSS = `
.profile-hero {
  display: grid;
  grid-template-columns: minmax(0, 180px) 1fr;
  gap: var(--space-5);
  align-items: center;
  padding: var(--space-5);
  background: var(--surface);
  border: 2px solid var(--recovery);
  border-radius: var(--radius-lg);
}
.profile-hero__ring { display: flex; justify-content: center; }
.profile-hero__copy { display: flex; flex-direction: column; gap: var(--space-2); }
.profile-hero__stage {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--recovery);
  font-weight: 700;
}
.profile-hero__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.3rem, 2.2vw, 1.65rem);
  letter-spacing: -0.025em;
}
.profile-hero__framing {
  margin: 0;
  font-size: var(--body);
  line-height: 1.55;
  color: var(--muted);
  max-width: 64ch;
}
@media (max-width: 640px) {
  .profile-hero {
    grid-template-columns: 140px 1fr;
    gap: var(--space-4);
    padding: var(--space-4);
  }
}

.rep-dim {
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  /* Resting soft lift (SURFACE_LIFT / Rule 2); hover swaps to the colored lift. */
  box-shadow: 0 1px 3px rgba(15, 15, 15, 0.06), 0 4px 12px -2px rgba(15, 15, 15, 0.07);
  transition: all 0.18s;
  color: inherit;
  font-family: inherit;
}
.rep-dim:hover {
  border-color: var(--dim-c);
  transform: translateY(-2px);
  box-shadow: 0 10px 28px -16px var(--dim-c);
}
.rep-dim__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.rep-dim__head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}
.rep-dim__pct {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.5rem;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.rep-dim__pct-unit {
  font-size: 0.55em;
  opacity: 0.7;
  margin-left: 2px;
}
.rep-eyebrow {
  font-size: var(--eyebrow);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 600;
}
.rep-dim__def {
  margin: 0;
  font-size: var(--body-sm);
  color: var(--muted);
  line-height: 1.45;
}
.rep-dim__bar {
  height: 4px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
}
.rep-dim__bar-fill {
  height: 100%;
  background: var(--dim-c);
  border-radius: 2px;
  transition: width 0.3s, background 0.3s;
}
.rep-dim__meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Slide-over panel for an onboarding phase. Mirrors the reputation panel. */
.rep-panel-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: phasePanelFade 0.18s ease-out;
}
@keyframes phasePanelFade { from { opacity: 0; } to { opacity: 1; } }
.rep-panel {
  width: min(720px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--dim-c);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: phasePanelSlide 0.22s ease-out;
}
@keyframes phasePanelSlide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.rep-panel__head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; }
.rep-panel__head-l { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.rep-panel__head-r { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.rep-panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.7rem;
  letter-spacing: -0.025em;
}
.rep-panel__def { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }
.rep-panel__score {
  font-family: var(--font-display);
  font-size: 2.1rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  color: var(--dim-c);
  line-height: 1;
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.rep-panel__score-sub { font-size: 0.9rem; color: var(--muted); font-weight: 500; }
.rep-btn {
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  padding: 6px 14px;
  color: var(--ink);
  font-size: var(--body-sm);
  cursor: pointer;
  font-family: inherit;
}
.rep-btn:hover { border-color: var(--dim-c); }

/* Markdown body inside the panel. Spaced for reading, not for editing. */
.phase-panel__body { padding-top: var(--space-3); border-top: 1px solid var(--hairline); }
.md { display: flex; flex-direction: column; gap: var(--space-3); color: var(--ink); }
.md__h { margin: 0; font-family: var(--font-display); letter-spacing: -0.02em; }
.md__h-1 { font-size: 1.5rem; font-weight: 700; margin-top: var(--space-3); }
.md__h-2 { font-size: 1.25rem; font-weight: 700; margin-top: var(--space-3); color: var(--ink); }
.md__h-3 { font-size: 1.05rem; font-weight: 600; margin-top: var(--space-2); color: var(--ink); }
.md__h-4 { font-size: 0.95rem; font-weight: 600; margin-top: var(--space-2); color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
.md__p { margin: 0; font-size: var(--body); line-height: 1.65; color: var(--ink); opacity: 0.85; }
.md__ul, .md__ol {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--body);
  line-height: 1.55;
  color: var(--ink);
  opacity: 0.85;
}
.md__ul li::marker { color: var(--dim-c); }
.md__ol li::marker { color: var(--dim-c); font-weight: 700; }
.md__quote {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-left: 3px solid var(--dim-c);
  background: rgba(255,255,255,0.03);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  font-size: var(--body);
  line-height: 1.55;
  color: var(--muted);
  font-style: italic;
}
.md__code {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.85rem;
  line-height: 1.55;
}
.md__code code { background: none; padding: 0; }
.md__inline-code {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.85em;
  padding: 1px 6px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  color: var(--ink);
}
.md__link { color: var(--dim-c); text-decoration: underline; }
.md__hr { border: none; border-top: 1px solid var(--hairline); margin: var(--space-2) 0; }
`;
