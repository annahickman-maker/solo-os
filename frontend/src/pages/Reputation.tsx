import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  ReputationDimension,
  ReputationPovEntry,
  ReputationMicroStory,
  ReputationStoryAction,
  ReputationWin,
  ReputationTransformationAnchor,
  ReputationResponse,
  ContentAnalysisDimension,
} from '../api';
import { Ring } from '../components/Ring';
import { TagChips } from '../components/TagChips';

// Reputation page v4.
//   • Hero: score ring + "what this is for" line + maturity chip. No big headline.
//   • Baseline strip: hours on transformation / total hours / cadence / multiplier.
//   • Avatar card: who you help + Before / After (compact) + value tags.
//   • 2x2 dimension grid.
//   • Per-dimension panels: each tailored to that dimension's bank pattern.

export function Reputation() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const [openDim, setOpenDim] = useState<string | null>(null);
  const setSlot = useMutation({
    mutationFn: (v: { slot: string; value: string | null }) => api.setReputationSlot(v.slot, v.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });

  if (error) return <div className="empty">couldn't load reputation: {(error as Error).message}</div>;
  if (isLoading || !data) return <div className="empty">loading</div>;

  const dim = openDim ? data.dimensions.find((d) => d.id === openDim) ?? null : null;

  return (
    <div className="rep">
      <ScoreHero score={data.overall_score} stage={data.maturity_stage} framing={data.framing} />
      <AvatarCard
        anchor={data.transformation_anchor}
        onSave={(slot, value) => setSlot.mutate({ slot, value })}
      />
      <div className="rep-grid">
        {data.dimensions.map((d) => (
          <DimensionCard key={d.id} dim={d} onOpen={() => setOpenDim(d.id)} />
        ))}
      </div>

      <ShowingUpSection
        dimensionColors={Object.fromEntries(data.dimensions.map((d) => [d.id, d.color]))}
        totalHours={data.output_baseline?.total_long_form_hours ?? 0}
      />

      {dim && (
        <DimensionPanel
          dim={dim}
          baseline={data.output_baseline}
          onClose={() => setOpenDim(null)}
          onSaveField={(slot, value) => setSlot.mutate({ slot, value })}
        />
      )}

      <style>{REP_CSS}</style>
    </div>
  );
}

// =========================================================================
// Hero
// =========================================================================
function ScoreHero({
  score,
  stage,
  framing,
}: {
  score: number;
  stage: ReputationResponse['maturity_stage'];
  framing: string;
}) {
  return (
    <section className="rep-hero">
      <div className="rep-hero__ring">
        <Ring value={score / 100} label="" bigNumber={`${score}`} unit="" size="hero" color="var(--recovery)" />
      </div>
      <div className="rep-hero__copy">
        <span className="rep-stage">stage · {stage.label.toLowerCase()}</span>
        <h1 className="rep-hero__title">how strong is your personal brand?</h1>
        <p className="rep-hero__framing">{framing}</p>
      </div>
    </section>
  );
}

// =========================================================================
// Avatar card
// =========================================================================
function AvatarCard({
  anchor,
  onSave,
}: {
  anchor: ReputationTransformationAnchor;
  onSave: (slot: string, value: string | null) => void;
}) {
  return (
    <section className="rep-avatar">
      <header className="rep-avatar__head">
        <span className="rep-eyebrow rep-eyebrow--accent">
          the transformation that I want to be known for
        </span>
      </header>
      <InlineField
        slot="positioning_statement"
        value={anchor.positioning_statement}
        placeholder="One powerful sentence that fully encompasses the transformation you want to be known for in your industry."
        onSave={onSave}
        large
      />
    </section>
  );
}

// =========================================================================
// InlineField - click to edit, expandable textarea
// =========================================================================
function InlineField({
  slot,
  value,
  placeholder,
  onSave,
  large,
  compact,
}: {
  slot: string;
  value: string | null;
  placeholder: string;
  onSave: (slot: string, value: string | null) => void;
  large?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  const hasValue = !!value?.trim();

  if (editing) {
    return (
      <div className="rep-inline rep-inline--editing">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, Math.ceil((draft.length || 80) / 90))}
          className={`rep-textarea ${large ? 'rep-textarea--large' : ''}`}
          placeholder={placeholder}
        />
        <div className="rep-actions">
          <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(false)}>
            cancel
          </button>
          <button
            type="button"
            className="rep-btn rep-btn--primary"
            onClick={() => {
              onSave(slot, draft.trim() || null);
              setEditing(false);
            }}
          >
            save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rep-inline ${hasValue ? 'rep-inline--filled' : 'rep-inline--empty'}`}
      onClick={() => setEditing(true)}
    >
      {hasValue ? (
        <p
          className={`rep-inline__value ${large ? 'rep-inline__value--lg' : ''} ${
            compact ? 'rep-inline__value--sm' : ''
          }`}
        >
          {value}
        </p>
      ) : (
        <p className="rep-inline__placeholder">{placeholder}</p>
      )}
    </div>
  );
}

// =========================================================================
// Dimension card (2×2 grid)
// =========================================================================
function DimensionCard({ dim, onOpen }: { dim: ReputationDimension; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="rep-dim"
      style={{ '--dim-c': dim.color } as React.CSSProperties}
      onClick={onOpen}
    >
      <div className="rep-dim__row">
        <Ring
          value={Math.min(1, dim.score / 5)}
          label=""
          bigNumber={dim.score.toFixed(1)}
          unit=""
          size="small"
          color={dim.color}
        />
        <div className="rep-dim__head">
          <span className="rep-eyebrow" style={{ color: dim.color }}>
            {dim.label.toLowerCase()}
          </span>
          <p className="rep-dim__def">{dim.definition.split('.')[0]}.</p>
        </div>
      </div>
      <div className="rep-dim__bar">
        <div className="rep-dim__bar-fill" style={{ width: `${Math.round((dim.score / 5) * 100)}%` }} />
      </div>
      <div className="rep-dim__meta">
        <span>{Math.round(dim.build_completion * 100)}% built</span>
        <span>open →</span>
      </div>
    </button>
  );
}

// =========================================================================
// Dimension panel (slide-over) - branches per dimension
// =========================================================================
function DimensionPanel({
  dim,
  baseline,
  onClose,
  onSaveField,
}: {
  dim: ReputationDimension;
  baseline: ReputationResponse['output_baseline'];
  onClose: () => void;
  onSaveField: (slot: string, value: string | null) => void;
}) {
  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside
        className="rep-panel"
        style={{ '--dim-c': dim.color } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow" style={{ color: dim.color }}>
              dimension
            </span>
            <h2 className="rep-panel__title">{dim.label.toLowerCase()}</h2>
            <p className="rep-panel__def">{dim.definition}</p>
          </div>
          <div className="rep-panel__head-r">
            <div className="rep-panel__score">
              <span>{dim.score.toFixed(1)}</span>
              <span className="rep-panel__score-sub">/ 5</span>
            </div>
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>
              close
            </button>
          </div>
        </header>

        {dim.id === 'value' && <ValuePanel dim={dim} baseline={baseline} onSaveField={onSaveField} />}
        {dim.id === 'authority' && <AuthorityPanel dim={dim} />}
        {dim.id === 'point_of_view' && <PovPanel dim={dim} onSaveField={onSaveField} />}
        {dim.id === 'connection' && <ConnectionPanel dim={dim} onSaveField={onSaveField} />}
      </aside>
    </div>
  );
}

// =========================================================================
// VALUE panel - 5 step boxes + long-form content stripe
// =========================================================================
function ValuePanel({
  dim,
  baseline,
  onSaveField,
}: {
  dim: ReputationDimension;
  baseline: ReputationResponse['output_baseline'];
  onSaveField: (slot: string, value: string | null) => void;
}) {
  // build = [method, method_result, step_1..step_5]
  const method = dim.build.find((f) => f.id === 'value_method');
  const methodResult = dim.build.find((f) => f.id === 'value_method_result');
  const steps = dim.build.filter((f) => f.id.startsWith('value_step_'));
  return (
    <>
      <Section
        title="the method"
        subtitle="this is how you help them achieve their transformation and the method you use to help them do it. the prose lives here; the steps live below."
      >
        {method && (
          <MethodBox
            label="the method"
            field={method}
            color={dim.color}
            onSave={(v) => onSaveField(method.id, v)}
          />
        )}
        {methodResult && (
          <MethodBox
            label="the result of the method"
            field={methodResult}
            color={dim.color}
            onSave={(v) => onSaveField(methodResult.id, v)}
          />
        )}
      </Section>

      <Section
        title="your 5 steps"
        subtitle="the phases a student walks through to complete the method. each box is one phase, in your words."
      >
        <div className="rep-steps">
          {steps.map((f, i) => (
            <StepBox
              key={f.id}
              n={i + 1}
              field={f}
              color={dim.color}
              onSave={(v) => onSaveField(f.id, v)}
            />
          ))}
        </div>
      </Section>

      <Section
        title="hours of content"
        subtitle="a running total of everything you've published. the more you ship, the more claude has to pull from when writing in your voice."
      >
        <div className="rep-vmetrics">
          <HoursShippedTile
            autoHours={baseline.total_long_form_hours}
            manualHours={baseline.hours_on_transformation}
            onSave={(v) => onSaveField('hours_on_transformation', v)}
          />
          <div className="rep-vmetric">
            <span className="rep-eyebrow">transformation series</span>
            <span className="rep-vmetric__num">
              {Math.min(5, dim.build.filter((f) => f.id.startsWith('value_step_') && f.filled).length)} / 5
            </span>
            <span className="rep-vmetric__sub">one cornerstone video per step</span>
          </div>
        </div>

        <div className="rep-cta-card">
          <div className="rep-cta-card__copy">
            <strong>not sure where to start?</strong>
            <p>open Claude and run the transformation-series skill to draft 5 cornerstone scripts.</p>
          </div>
          <code className="rep-cta-card__code">/skill transformation-series</code>
        </div>
      </Section>

      <ApprovedBankSection
        title="value bank"
        subtitle="verbatim teaching moments you've approved from your transcripts. systems, steps, processes you've named on calls. drop into videos as your core method."
        entries={dim.frameworks_bank ?? []}
        color={dim.color}
        emptyHint="approve a quote tagged 'value' on the vault page to bank one here."
        currentKind="value"
      />
    </>
  );
}

// HoursShippedTile - editable count of long-form content hours. Auto-counted
// from published videos in the channel folder. If the user has no YouTube /
// Instagram linked (or simply has content elsewhere), they can click to type
// the number in manually. The score uses whichever is larger.
function HoursShippedTile({
  autoHours,
  manualHours,
  onSave,
}: {
  autoHours: number;
  manualHours: number;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(manualHours || ''));
  useEffect(() => {
    if (!editing) setDraft(String(manualHours || ''));
  }, [manualHours, editing]);

  const effective = Math.max(autoHours, manualHours);
  const usingManual = manualHours > autoHours;

  function save() {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onSave(null);
    } else {
      const parsed = parseFloat(trimmed);
      onSave(isFinite(parsed) && parsed >= 0 ? String(Math.round(parsed * 10) / 10) : null);
    }
    setEditing(false);
  }

  return (
    <div className="rep-vmetric" style={{ position: 'relative' }}>
      <span className="rep-eyebrow">total hours shipped</span>
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0' }}>
          <input
            type="number"
            min={0}
            step="0.1"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              else if (e.key === 'Escape') {
                setDraft(String(manualHours || ''));
                setEditing(false);
              }
            }}
            onBlur={save}
            style={{
              width: 90,
              background: 'transparent',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 700,
              padding: '2px 8px',
              outline: 'none',
            }}
          />
          <span className="rep-vmetric__num" style={{ fontSize: '1.25rem' }}>h</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="click to type in your hours manually if your channel is not linked"
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            font: 'inherit',
          }}
        >
          <span className="rep-vmetric__num">{effective}h</span>
        </button>
      )}
      <span className="rep-vmetric__sub">
        {usingManual
          ? 'manual override · click number to edit'
          : autoHours > 0
            ? 'across all published videos · click to override'
            : 'click the number to enter manually if your channel is not linked'}
      </span>
    </div>
  );
}

function MethodBox({
  label,
  field,
  color,
  onSave,
}: {
  label: string;
  field: ReputationDimension['build'][number];
  color: string;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value ?? '');
  useEffect(() => {
    if (!editing) setDraft(field.value ?? '');
  }, [field.value, editing]);
  return (
    <div className={`rep-methodbox ${field.filled ? 'rep-methodbox--done' : ''}`}>
      <header className="rep-methodbox__head">
        <span className="rep-eyebrow" style={{ color: field.filled ? color : 'var(--muted)' }}>
          {label}
        </span>
        {field.filled && !editing && (
          <button type="button" className="rep-methodbox__edit" onClick={() => setEditing(true)}>
            edit
          </button>
        )}
      </header>
      {editing ? (
        <>
          <textarea
            className="rep-textarea rep-textarea--large"
            autoFocus
            rows={Math.max(5, Math.ceil((draft.length || 200) / 80))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={field.prompt}
          />
          <div className="rep-actions">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(false)}>
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => {
                onSave(draft.trim() || null);
                setEditing(false);
              }}
            >
              save
            </button>
          </div>
        </>
      ) : field.value ? (
        <p className="rep-methodbox__copy" onClick={() => setEditing(true)}>
          {field.value}
        </p>
      ) : (
        <div className="rep-methodbox__empty" onClick={() => setEditing(true)}>
          <p className="rep-methodbox__prompt">{field.prompt}</p>
          <button type="button" className="rep-btn rep-btn--ghost">
            + fill in
          </button>
        </div>
      )}
    </div>
  );
}

function StepBox({
  n,
  field,
  color,
  onSave,
}: {
  n: number;
  field: ReputationDimension['build'][number];
  color: string;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(!field.filled);
  const [draft, setDraft] = useState(field.value ?? '');
  return (
    <div className={`rep-step ${field.filled ? 'rep-step--done' : ''}`}>
      <div className="rep-step__num" style={{ background: field.filled ? color : 'transparent', borderColor: color, color: field.filled ? 'var(--bg)' : color }}>
        {n}
      </div>
      <div className="rep-step__body">
        {editing ? (
          <>
            <textarea
              className="rep-textarea"
              autoFocus
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={field.prompt}
            />
            <div className="rep-actions">
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => {
                  setDraft(field.value ?? '');
                  setEditing(false);
                }}
              >
                cancel
              </button>
              <button
                type="button"
                className="rep-btn rep-btn--primary"
                onClick={() => {
                  onSave(draft.trim() || null);
                  setEditing(false);
                }}
              >
                save step {n}
              </button>
            </div>
          </>
        ) : field.value ? (
          <div className="rep-step__view" onClick={() => setEditing(true)}>
            <p>{field.value}</p>
          </div>
        ) : (
          <div className="rep-step__empty" onClick={() => setEditing(true)}>
            <p className="rep-step__prompt">{field.prompt}</p>
            <button type="button" className="rep-btn rep-btn--ghost">
              + fill step {n}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// AUTHORITY panel - brag bank + customer wins
// =========================================================================
function AuthorityPanel({ dim }: { dim: ReputationDimension }) {
  const ownWins = (dim.wins_bank ?? []).filter((w) => w.kind === 'own');
  const customerWins = (dim.wins_bank ?? []).filter((w) => w.kind === 'student' || w.kind === 'client');
  return (
    <>
      <Section
        title="brag bank"
        subtitle="everything you bring: experience, people you've worked with, years in, results you've hit, awards, press, numbers. one long list. examples: '5 years building creator businesses', '$50K month from a 5-video series', 'featured on X podcast', '41K YouTube subs'."
      >
        <WinsList wins={ownWins} kind="own" />
      </Section>

      <Section
        title="customer + client wins"
        subtitle="the people you've helped and what changed for them. specifics: who, intervention, before, after, timeline."
      >
        <WinsList wins={customerWins} kind="student" />
      </Section>

      <ApprovedBankSection
        title="authority bank"
        subtitle="verbatim proof moments you've approved from your transcripts. specific student wins, dollar amounts, subscriber counts. drop into videos as evidence."
        entries={dim.proof_bank ?? []}
        color={dim.color}
        emptyHint="approve a quote tagged 'authority' on the vault page to bank one here."
        currentKind="authority"
      />
    </>
  );
}


function WinsList({ wins, kind }: { wins: ReputationWin[]; kind: 'own' | 'student' }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: { title: string; body?: string }) =>
      api.addReputationWin({ ...body, kind, status: 'confirmed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const upd = useMutation({
    mutationFn: (v: { id: string; status: 'confirmed' | 'rejected' }) =>
      api.updateReputationWin(v.id, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteReputationWin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '' });
  const [openId, setOpenId] = useState<string | null>(null);

  const confirmed = wins.filter((w) => w.status === 'confirmed');
  const candidates = wins.filter((w) => w.status === 'candidate');

  return (
    <div className="rep-list">
      {confirmed.map((w) => (
        <WinRow
          key={w.id}
          win={w}
          open={openId === w.id}
          onToggle={() => setOpenId(openId === w.id ? null : w.id)}
          onReject={() => upd.mutate({ id: w.id, status: 'rejected' })}
          onDelete={() => {
            if (confirm(`delete "${w.title}"?`)) del.mutate(w.id);
          }}
        />
      ))}

      {candidates.length > 0 && (
        <div className="rep-candidates">
          <span className="rep-eyebrow rep-eyebrow--warn">claude found · {candidates.length} candidates</span>
          {candidates.map((w) => (
            <div key={w.id} className="rep-candidate">
              <div className="rep-candidate__copy">
                <strong>{w.title}</strong>
                {w.body && <p>{w.body}</p>}
                {w.source_episode && <span className="rep-candidate__src">from: {w.source_episode}</span>}
              </div>
              <div className="rep-actions">
                <button
                  type="button"
                  className="rep-btn rep-btn--primary"
                  onClick={() => upd.mutate({ id: w.id, status: 'confirmed' })}
                >
                  keep
                </button>
                <button
                  type="button"
                  className="rep-btn rep-btn--ghost"
                  onClick={() => upd.mutate({ id: w.id, status: 'rejected' })}
                >
                  reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="rep-card rep-card--inline">
          <input
            className="rep-text-input"
            placeholder={
              kind === 'own'
                ? "Headline (e.g. '$50K month from 5-video series', '41K YouTube subs')"
                : "Client headline (e.g. 'Client A - 0 to 2K subs in 90 days')"
            }
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            autoFocus
          />
          <textarea
            className="rep-textarea"
            rows={3}
            placeholder="Specifics: numbers, dates, what was done. (optional)"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => {
                setAdding(false);
                setDraft({ title: '', body: '' });
              }}
            >
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              disabled={!draft.title.trim()}
              onClick={() => {
                add.mutate({ title: draft.title.trim(), body: draft.body.trim() || undefined });
                setAdding(false);
                setDraft({ title: '', body: '' });
              }}
            >
              add
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="rep-add" onClick={() => setAdding(true)}>
          + {kind === 'own' ? 'add a brag' : 'add a customer win'}
        </button>
      )}
    </div>
  );
}

function WinRow({
  win,
  open,
  onToggle,
  onReject,
  onDelete,
  pinned = false,
  showPin = false,
}: {
  win: ReputationWin;
  open: boolean;
  onToggle: () => void;
  onReject: () => void;
  onDelete: () => void;
  pinned?: boolean;
  showPin?: boolean;
}) {
  const qc = useQueryClient();
  const togglePin = useMutation({
    mutationFn: () => api.toggleProofPin(win.id, !pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <div className={`rep-row ${open ? 'rep-row--open' : ''}`}>
      <button type="button" className="rep-row__head" onClick={onToggle}>
        <span className="rep-row__bullet">•</span>
        <span className="rep-row__title">{win.title}</span>
        {showPin && pinned && (
          <span
            title="pinned to the promise"
            style={{ fontSize: 11, color: 'var(--strain)', fontWeight: 700, marginRight: 6 }}
          >
            ★ pinned
          </span>
        )}
        <span className="rep-row__caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="rep-row__body">
          {win.body && <p className="rep-row__copy">{win.body}</p>}
          {win.tags && win.tags.filter((t) => t && !t.includes('/')).length > 0 && (
            <div className="rep-tag-row">
              {win.tags.filter((t) => t && !t.includes('/')).map((t) => (
                <span key={t} className="rep-chip rep-chip--mini">
                  {t}
                </span>
              ))}
            </div>
          )}
          {win.source_episode && <span className="rep-row__src">from: {win.source_episode}</span>}
          <div className="rep-actions">
            {showPin && (
              <button
                type="button"
                onClick={() => togglePin.mutate()}
                disabled={togglePin.isPending}
                className="rep-btn"
                style={{
                  background: pinned ? 'var(--strain)' : 'transparent',
                  color: pinned ? 'var(--bg)' : 'var(--strain)',
                  borderColor: 'var(--strain)',
                  fontWeight: 600,
                }}
                title={pinned ? 'unpin from the promise' : 'pin as proof for the promise'}
              >
                {pinned ? '★ pinned' : '☆ pin to promise'}
              </button>
            )}
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onReject}>
              hide
            </button>
            <button type="button" className="rep-btn rep-btn--danger-ghost" onClick={onDelete}>
              delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// POV panel - enemy + structured-field POV bank
// =========================================================================
function PovPanel({
  dim,
  onSaveField,
}: {
  dim: ReputationDimension;
  onSaveField: (slot: string, value: string | null) => void;
}) {
  const enemy = dim.build.find((f) => f.id === 'common_enemy');
  return (
    <>
      {enemy && (
        <Section title="your common enemy" subtitle="the wedge every POV argues against.">
          <div className={`rep-enemy ${enemy.filled ? 'rep-enemy--done' : ''}`}>
            {!enemy.filled && enemy.prompt && <p className="rep-enemy__prompt">{enemy.prompt}</p>}
            <InlineField
              slot={enemy.id}
              value={enemy.value ?? null}
              placeholder="e.g. 'hustle culture' or 'generic playbooks built for people whose brain works completely differently from mine'"
              onSave={onSaveField}
            />
          </div>
        </Section>
      )}

      <Section
        title="POV bank"
        subtitle="every contrarian point you stake, structured. click a POV to fill in the 4 fields: common belief, your flip, why you believe this, and how you use it in content."
      >
        <PovBank povs={dim.pov_bank ?? []} color={dim.color} />
      </Section>

      <ApprovedBankSection
        title="approved POVs from transcripts"
        subtitle="verbatim POVs you've approved from your transcripts. these come straight from things you've said on calls or in workshops, not from POV files you've authored."
        entries={dim.pov_transcript_bank ?? []}
        color={dim.color}
        emptyHint="approve a quote tagged 'POV' on the vault page to bank one here."
        currentKind="pov"
      />
    </>
  );
}

function PovBank({ povs, color }: { povs: ReputationPovEntry[]; color: string }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: {
      title: string;
      common_belief?: string;
      my_pov?: string;
      story_behind?: string;
      how_i_use?: string;
    }) => api.addReputationPov(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteReputationPov(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', common_belief: '', my_pov: '', story_behind: '', how_i_use: '' });

  return (
    <div className="rep-list">
      {povs.map((p) => (
        <PovRow
          key={p.id}
          pov={p}
          color={color}
          open={openId === p.id}
          onToggle={() => setOpenId(openId === p.id ? null : p.id)}
          onDelete={() => {
            if (confirm(`delete "${p.title}"?`)) del.mutate(p.id);
          }}
        />
      ))}

      {adding ? (
        <div className="rep-card rep-card--inline">
          <input
            className="rep-text-input"
            placeholder="POV title (e.g. 'Long-form > short-form for solopreneurs')"
            value={draft.title}
            autoFocus
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => {
                setAdding(false);
                setDraft({ title: '', common_belief: '', my_pov: '', story_behind: '', how_i_use: '' });
              }}
            >
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              disabled={!draft.title.trim()}
              onClick={() => {
                add.mutate({ title: draft.title.trim() });
                setAdding(false);
                setDraft({ title: '', common_belief: '', my_pov: '', story_behind: '', how_i_use: '' });
              }}
            >
              add POV
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="rep-add" onClick={() => setAdding(true)}>
          + add POV
        </button>
      )}
    </div>
  );
}

function PovRow({
  pov,
  color,
  open,
  onToggle,
  onDelete,
}: {
  pov: ReputationPovEntry;
  color: string;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const patch = useMutation({
    mutationFn: (body: Partial<Pick<ReputationPovEntry, 'title' | 'common_belief' | 'my_pov' | 'story_behind' | 'how_i_use'>>) =>
      api.updateReputationPov(pov.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(pov.title);
  useEffect(() => {
    if (!editingTitle) setTitleDraft(pov.title);
  }, [pov.title, editingTitle]);

  const filled =
    !!pov.common_belief?.trim() &&
    !!pov.my_pov?.trim();
  return (
    <div className={`rep-row ${open ? 'rep-row--open' : ''} ${filled ? 'rep-row--filled' : ''}`}>
      <div className="rep-row__head">
        <span className="rep-row__bullet" style={{ color: filled ? color : 'var(--muted)' }}>
          {filled ? '●' : '○'}
        </span>
        {editingTitle ? (
          <input
            type="text"
            className="rep-text-input"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const v = titleDraft.trim();
              if (v && v !== pov.title) patch.mutate({ title: v });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setTitleDraft(pov.title); setEditingTitle(false); }
            }}
            style={{ flex: 1, padding: '4px 8px', fontSize: 'var(--body)' }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span
              className="rep-row__title"
              onClick={onToggle}
              style={{ cursor: 'pointer', flex: 1 }}
            >
              {pov.title}
            </span>
            <button
              type="button"
              className="rep-row__edit"
              onClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
              aria-label="rename POV"
              title="rename"
            >
              ✎
            </button>
            <button
              type="button"
              className="rep-row__caret-btn"
              onClick={onToggle}
              aria-label={open ? 'collapse' : 'expand'}
            >
              {open ? '−' : '+'}
            </button>
          </>
        )}
      </div>
      {open && (
        <div className="rep-row__body">
          <PovField
            label="common belief"
            value={pov.common_belief ?? null}
            placeholder="What does your industry say about this? (the thing you're going to argue with)"
            onSave={(v) => patch.mutate({ common_belief: v })}
          />
          <PovField
            label="my point of view"
            accent={color}
            value={pov.my_pov ?? null}
            placeholder="Your stance. The flip. What you actually believe."
            onSave={(v) => patch.mutate({ my_pov: v })}
          />
          <PovField
            label="story behind it"
            value={pov.story_behind ?? null}
            placeholder="Why do you believe this? The moment or experience that made you certain."
            onSave={(v) => patch.mutate({ story_behind: v })}
          />
          <PovField
            label="how I use it in a video"
            value={pov.how_i_use ?? null}
            placeholder="The line you'd open a video with, or the section where this lives in your scripts."
            onSave={(v) => patch.mutate({ how_i_use: v })}
          />
          <div className="rep-actions">
            <button type="button" className="rep-btn rep-btn--danger-ghost" onClick={onDelete}>
              delete POV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PovField({
  label,
  accent,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  accent?: string;
  value: string | null;
  placeholder: string;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  return (
    <div className="rep-povf">
      <span className="rep-eyebrow" style={{ color: accent ?? 'var(--muted)' }}>
        {label}
      </span>
      {editing ? (
        <>
          <textarea
            className="rep-textarea"
            rows={Math.max(2, Math.ceil((draft.length || 60) / 80))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
          />
          <div className="rep-actions">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(false)}>
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => {
                onSave(draft.trim() || null);
                setEditing(false);
              }}
            >
              save
            </button>
          </div>
        </>
      ) : value ? (
        <div className="rep-povf__view" onClick={() => setEditing(true)}>
          <p>{value}</p>
        </div>
      ) : (
        <button type="button" className="rep-povf__add" onClick={() => setEditing(true)}>
          + {placeholder}
        </button>
      )}
    </div>
  );
}

// =========================================================================
// CONNECTION panel - long story → auto compressed → actions → micro-stories
// =========================================================================
function ConnectionPanel({
  dim,
  onSaveField,
}: {
  dim: ReputationDimension;
  onSaveField: (slot: string, value: string | null) => void;
}) {
  // Auto-derive the 30s version from the long story if no manual override.
  const autoCompressed = useMemo(() => deriveCompressed(dim.story_core ?? null), [dim.story_core]);
  const compressed = dim.story_compressed?.trim() || autoCompressed;

  return (
    <>
      <Section
        title="journey timeline"
        subtitle="the visual version of your story. drop wins, failures, teaching moments and 'versions of me' along a horizontal arc - from where you started to now."
      >
        <Link
          to="/profile/reputation/journey"
          className="rep-card rep-card--inline"
          style={{
            display: 'block',
            borderColor: hexA(dim.color, 0.35),
            textDecoration: 'none',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <strong style={{ color: dim.color, display: 'block', marginBottom: 4 }}>
            open the journey timeline →
          </strong>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            a scrollable horizontal arc you can pin moments to.
          </span>
        </Link>
      </Section>

      <Section
        title="your story"
        subtitle="the long version. where you started, the turning point, what you do now and who it's for. claude pulls from this when writing in your voice."
      >
        <StoryCoreBox story={dim.story_core ?? ''} onSave={(v) => onSaveField('my_story_text', v)} color={dim.color} />
      </Section>

      <Section
        title="30-second version"
        subtitle="auto-drafted from your story above. edit to make it punchier - this is what you'd say on a podcast intro or pin to your profile."
      >
        <CompressedBox
          auto={autoCompressed}
          override={dim.story_compressed ?? null}
          shown={compressed}
          onSave={(v) => onSaveField('compressed_story', v)}
          color={dim.color}
        />
      </Section>

      <Section
        title="where your story is placed"
        subtitle="check off where your story actually lives in the wild."
      >
        <StoryActions actions={dim.story_actions ?? []} />
      </Section>

      <Section
        title="micro-stories bank"
        subtitle="moments worth reusing across content. claude pulls candidates from your transcripts; you keep what feels like you and tag by topic so we can pull the right one for the right script."
      >
        <MicroStoriesBank stories={dim.micro_stories ?? []} />
      </Section>
    </>
  );
}

function deriveCompressed(story: string | null): string {
  if (!story?.trim()) return '';
  const flat = story.replace(/\s+/g, ' ').trim();
  if (flat.length <= 280) return flat;
  // First 2-3 sentences, capped at 280 chars.
  const sentences = flat.split(/(?<=[.!?])\s+/);
  let out = '';
  for (const s of sentences) {
    if ((out + ' ' + s).trim().length > 280) break;
    out = (out + ' ' + s).trim();
  }
  return out || flat.slice(0, 280) + '…';
}

function StoryCoreBox({
  story,
  onSave,
  color,
}: {
  story: string;
  onSave: (v: string | null) => void;
  color: string;
}) {
  const [draft, setDraft] = useState(story);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(story);
  }, [story, dirty]);
  return (
    <div className="rep-card rep-card--inline" style={{ borderColor: hexA(color, 0.25) }}>
      <textarea
        className="rep-textarea rep-textarea--large"
        rows={Math.max(8, Math.ceil((draft.length || 100) / 80))}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        placeholder="Start at the beginning. The world you were in. What changed. The version of you now. Who it's for."
      />
      {dirty && (
        <div className="rep-actions">
          <button
            type="button"
            className="rep-btn rep-btn--ghost"
            onClick={() => {
              setDraft(story);
              setDirty(false);
            }}
          >
            revert
          </button>
          <button
            type="button"
            className="rep-btn rep-btn--primary"
            onClick={() => {
              onSave(draft.trim() || null);
              setDirty(false);
            }}
          >
            save story
          </button>
        </div>
      )}
    </div>
  );
}

function CompressedBox({
  auto,
  override,
  shown,
  onSave,
  color,
}: {
  auto: string;
  override: string | null;
  shown: string;
  onSave: (v: string | null) => void;
  color: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(override ?? shown);
  useEffect(() => {
    if (!editing) setDraft(override ?? shown);
  }, [override, shown, editing]);
  const isAuto = !override?.trim();
  if (!auto && !override) {
    return <p className="rep-empty">fill in your long story above to see the auto-draft here.</p>;
  }
  if (editing) {
    return (
      <div className="rep-card rep-card--inline" style={{ borderColor: hexA(color, 0.25) }}>
        <textarea
          className="rep-textarea"
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="rep-actions">
          <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(false)}>
            cancel
          </button>
          <button
            type="button"
            className="rep-btn rep-btn--ghost"
            onClick={() => {
              onSave(null);
              setEditing(false);
            }}
          >
            revert to auto
          </button>
          <button
            type="button"
            className="rep-btn rep-btn--primary"
            onClick={() => {
              onSave(draft.trim() || null);
              setEditing(false);
            }}
          >
            save
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="rep-card rep-card--inline" onClick={() => setEditing(true)} style={{ cursor: 'text' }}>
      <p className="rep-compressed">{shown}</p>
      <div className="rep-compressed__meta">
        <span className="rep-eyebrow" style={{ color: isAuto ? 'var(--muted)' : color }}>
          {isAuto ? 'auto-drafted' : 'edited by you'}
        </span>
        <span className="rep-compressed__hint">click to edit</span>
      </div>
    </div>
  );
}

function StoryActions({ actions }: { actions: ReputationStoryAction[] }) {
  const qc = useQueryClient();
  const set = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => api.setStoryAction(v.id, v.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <div className="rep-list">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`rep-action ${a.done ? 'rep-action--done' : ''}`}
          onClick={() => set.mutate({ id: a.id, done: !a.done })}
        >
          <span className={`rep-action__box ${a.done ? 'rep-action__box--on' : ''}`}>{a.done ? '✓' : ''}</span>
          <div className="rep-action__copy">
            <span className="rep-action__label">{a.label}</span>
            {a.hint && <span className="rep-action__hint">{a.hint}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function MicroStoriesBank({ stories }: { stories: ReputationMicroStory[] }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: { text: string; tags?: string[] }) =>
      api.addMicroStory({ text: body.text.trim(), tags: body.tags, status: 'confirmed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const upd = useMutation({
    mutationFn: (v: {
      id: string;
      status?: 'candidate' | 'confirmed' | 'rejected';
      tags?: string[];
      text?: string;
    }) => api.updateMicroStory(v.id, { status: v.status, tags: v.tags, text: v.text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteMicroStory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });

  const confirmedCount = stories.filter((s) => s.status === 'confirmed').length;
  const candidateCount = stories.filter((s) => s.status === 'candidate').length;
  // Default tab: 'all' when nothing is in candidate (the new flow approves
  // straight to confirmed). Land on candidate only when there's triage to do.
  const [filter, setFilter] = useState<'candidate' | 'confirmed' | 'all'>(
    candidateCount > 0 ? 'candidate' : 'all'
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const filtered = stories.filter((s) => (filter === 'all' ? true : s.status === filter));

  return (
    <div className="rep-list">
      <div className="rep-filter">
        {(['candidate', 'confirmed', 'all'] as const).map((s) => {
          const count = s === 'candidate' ? candidateCount : s === 'confirmed' ? confirmedCount : stories.length;
          return (
            <button
              key={s}
              type="button"
              className={`rep-filter__btn ${filter === s ? 'rep-filter__btn--on' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s}
              <span className="rep-filter__count">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && <p className="rep-empty">nothing in this view.</p>}

      {filtered.map((s) => (
        <MicroRow
          key={s.id}
          story={s}
          onKeep={() => upd.mutate({ id: s.id, status: 'confirmed' })}
          onReject={() => upd.mutate({ id: s.id, status: 'rejected' })}
          onSaveText={(text) => upd.mutate({ id: s.id, text })}
          onAddTag={(tag) => upd.mutate({ id: s.id, tags: [...(s.tags ?? []), tag] })}
          onRemoveTag={(i) =>
            upd.mutate({ id: s.id, tags: (s.tags ?? []).filter((_, j) => j !== i) })
          }
          onDelete={() => {
            if (confirm('delete?')) del.mutate(s.id);
          }}
        />
      ))}

      {adding ? (
        <div className="rep-card rep-card--inline">
          <textarea
            className="rep-textarea"
            autoFocus
            rows={3}
            placeholder="A specific moment in your voice. Concrete details, not summary."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => {
                setAdding(false);
                setDraft('');
              }}
            >
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              disabled={!draft.trim()}
              onClick={() => {
                add.mutate({ text: draft });
                setAdding(false);
                setDraft('');
              }}
            >
              add story
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="rep-add" onClick={() => setAdding(true)}>
          + add a micro-story
        </button>
      )}
    </div>
  );
}

function MicroRow({
  story,
  onKeep,
  onReject,
  onSaveText,
  onAddTag,
  onRemoveTag,
  onDelete,
}: {
  story: ReputationMicroStory;
  onKeep: () => void;
  onReject: () => void;
  onSaveText: (text: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (index: number) => void;
  onDelete: () => void;
}) {
  const [tagDraft, setTagDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(story.text);
  useEffect(() => {
    if (!editing) setDraft(story.text);
  }, [story.text, editing]);
  return (
    <div className="rep-micro">
      {editing ? (
        <>
          <textarea
            className="rep-textarea rep-textarea--large"
            autoFocus
            rows={Math.max(5, Math.ceil((draft.length || 200) / 80))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tell the whole anecdote. Concrete details, in your voice. Multiple paragraphs are fine."
          />
          <div className="rep-actions">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(false)}>
              cancel
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              disabled={!draft.trim()}
              onClick={() => {
                onSaveText(draft.trim());
                setEditing(false);
              }}
            >
              save
            </button>
          </div>
        </>
      ) : (
        <>
          {story.title && (
            <h5
              style={{
                margin: '0 0 8px 0',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '0.95rem',
                letterSpacing: '-0.015em',
              }}
            >
              {story.title}
            </h5>
          )}
          <p className="rep-micro__text" onClick={() => setEditing(true)} style={{ cursor: 'text' }}>
            {story.text}
          </p>
        </>
      )}
      {story.source_episode && <p className="rep-micro__src">{story.source_episode}</p>}
      {(story.source_transcript || story.source_timestamp) && (
        <p className="rep-micro__src">
          {story.source_transcript && <>source: {story.source_transcript.replace(/\.(md|txt)$/, '')}</>}
          {story.source_timestamp && <> · @ {story.source_timestamp}</>}
        </p>
      )}
      <div className="rep-micro__tags">
        {(story.tags ?? []).map((t, i) => (
          <span key={`${t}-${i}`} className="rep-chip rep-chip--mini">
            {t}
            <button
              type="button"
              className="rep-chip__x"
              onClick={() => onRemoveTag(i)}
              aria-label="remove tag"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="rep-chip-input"
          placeholder="+ topic"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tagDraft.trim()) {
              onAddTag(tagDraft.trim());
              setTagDraft('');
            }
          }}
          onBlur={() => {
            if (tagDraft.trim()) {
              onAddTag(tagDraft.trim());
              setTagDraft('');
            }
          }}
        />
      </div>
      <div className="rep-actions">
        {!editing && (
          <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setEditing(true)}>
            edit
          </button>
        )}
        {story.status === 'candidate' && (
          <>
            <button type="button" className="rep-btn rep-btn--primary" onClick={onKeep}>
              keep
            </button>
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onReject}>
              reject
            </button>
          </>
        )}
        {story.status === 'confirmed' && (
          <button type="button" className="rep-btn rep-btn--ghost" onClick={onReject}>
            hide
          </button>
        )}
        <button type="button" className="rep-btn rep-btn--danger-ghost" onClick={onDelete}>
          delete
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// Section wrapper
// =========================================================================
/**
 * Renders the verbatim "approved from transcripts" bank that sits at the bottom
 * of every dimension panel that uses one. Same shape across Authority (proof),
 * Value (frameworks), Connection (micro-stories already wired via legacy), and
 * future POV bank if/when wired.
 */
function ApprovedBankSection({
  title,
  subtitle,
  entries,
  color,
  emptyHint,
  currentKind,
  pinnedSet,
}: {
  title: string;
  subtitle: string;
  entries: import('../api').ApprovedBankEntry[];
  color: string;
  emptyHint: string;
  currentKind: import('../api').DimKind;
  // Only passed on the authority dim. When defined, each card shows a
  // pin-to-promise toggle.
  pinnedSet?: Set<string>;
}) {
  return (
    <Section title={title} subtitle={subtitle}>
      {entries.length === 0 ? (
        <p className="rep-empty" style={{ margin: 0 }}>{emptyHint}</p>
      ) : (
        <div className="rep-list">
          {entries.map((e) => (
            <ApprovedBankCard
              key={e.id}
              entry={e}
              color={color}
              currentKind={currentKind}
              pinned={pinnedSet?.has(e.id) ?? false}
              showPin={pinnedSet !== undefined}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

const DIM_KIND_LABELS: Record<import('../api').DimKind, string> = {
  pov: 'POV',
  value: 'Value',
  authority: 'Authority',
  connection: 'Connection',
};

function TagChipsForBankCard({
  currentKind,
  entryId,
  initialTags,
  color,
}: {
  currentKind: import('../api').DimKind;
  entryId: string;
  initialTags: string[];
  color: string;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (next: string[]) => api.setBankEntryTags(currentKind, entryId, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <TagChips
      topics={initialTags}
      onChange={(next) => save.mutate(next)}
      color={color}
    />
  );
}

function ApprovedBankCard({
  entry,
  color,
  currentKind,
  pinned = false,
  showPin = false,
}: {
  entry: import('../api').ApprovedBankEntry;
  color: string;
  currentKind: import('../api').DimKind;
  pinned?: boolean;
  showPin?: boolean;
}) {
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: (to: import('../api').DimKind) =>
      api.moveBankEntry({ entry_id: entry.id, from: currentKind, to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const togglePin = useMutation({
    mutationFn: () => api.toggleProofPin(entry.id, !pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <article
      className="rep-card rep-card--inline"
      style={{
        borderColor: pinned
          ? `color-mix(in srgb, ${color} 55%, var(--hairline))`
          : `color-mix(in srgb, ${color} 22%, var(--hairline))`,
        boxShadow: pinned ? `0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
      }}
    >
      {showPin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
          <button
            type="button"
            onClick={() => togglePin.mutate()}
            disabled={togglePin.isPending}
            title={pinned ? 'unpin from the promise' : 'pin as proof for the promise'}
            style={{
              background: pinned ? color : 'transparent',
              color: pinned ? 'var(--bg)' : color,
              border: `1px solid ${color}`,
              borderRadius: 'var(--radius-pill)',
              padding: '2px 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {pinned ? '★ pinned' : '☆ pin'}
          </button>
        </div>
      )}
      {entry.title && (
        <h5
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.95rem',
            letterSpacing: '-0.015em',
            color,
          }}
        >
          {entry.title}
        </h5>
      )}
      <p style={{ margin: 0, fontSize: 'var(--body)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {entry.text}
      </p>
      {entry.context && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {entry.context}
        </p>
      )}
      {(entry.source_transcript || entry.source_timestamp) && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            fontSize: 10,
            color: 'var(--muted-2)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}
        >
          {entry.source_transcript && (
            <span>source: {entry.source_transcript.replace(/\.(md|txt)$/, '')}</span>
          )}
          {entry.source_timestamp && <span>@ {entry.source_timestamp}</span>}
        </div>
      )}
      {entry.source_moments.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
            }}
          >
            source moments ({entry.source_moments.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {entry.source_moments.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'rgba(0,0,0,0.18)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: 'var(--muted-2)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 10, letterSpacing: '0.04em' }}>
                  {m.timestamp}
                </span>
                <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>"{m.text}"</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Topic tags */}
      <TagChipsForBankCard
        currentKind={currentKind}
        entryId={entry.id}
        initialTags={entry.tags ?? []}
        color={color}
      />

      {/* Move-to-different-dim selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 4,
          paddingTop: 8,
          borderTop: '1px dashed var(--hairline)',
        }}
      >
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 700 }}>
          category:
        </span>
        <select
          value={currentKind}
          onChange={(e) => {
            const to = e.target.value as import('../api').DimKind;
            if (to !== currentKind) move.mutate(to);
          }}
          disabled={move.isPending}
          style={{
            background: 'transparent',
            color: 'var(--ink)',
            border: `1px solid color-mix(in srgb, ${color} 35%, var(--hairline))`,
            borderRadius: 'var(--radius-pill)',
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: move.isPending ? 'wait' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {(['pov', 'value', 'authority', 'connection'] as const).map((k) => (
            <option key={k} value={k} style={{ background: 'var(--bg)' }}>
              {DIM_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        {move.isError && (
          <span style={{ fontSize: 11, color: '#ff6b6b' }}>
            {(move.error as Error)?.message ?? 'move failed'}
          </span>
        )}
      </div>
    </article>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rep-section">
      <header className="rep-section__head">
        <h3 className="rep-section__title">{title}</h3>
        {subtitle && <p className="rep-section__sub">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

// =========================================================================
// ShowingUpSection: Claude's analysis of how much each dimension actually
// surfaces in published content. Cached server-side; refresh on demand.
// =========================================================================
function ShowingUpSection({
  dimensionColors,
  totalHours,
}: {
  dimensionColors: Record<string, string>;
  totalHours: number;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['reputation-analysis'],
    queryFn: api.getContentAnalysis,
  });
  const refresh = useMutation({
    mutationFn: () => api.refreshContentAnalysis(),
    onSuccess: (res) => qc.setQueryData(['reputation-analysis'], res),
  });

  const analysis = data?.analysis ?? null;
  const ageStr = analysis ? relativeAge(analysis.generated_at) : null;

  // Format hours nicely: 12.3 -> "12.3 hours", 0.5 -> "30 minutes", 25 -> "25 hours"
  const hoursLabel = (() => {
    if (totalHours <= 0) return 'no published content yet';
    if (totalHours < 1) return `${Math.round(totalHours * 60)} min of published content`;
    const rounded = Math.round(totalHours * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'hour' : 'hours'} of published content`;
  })();
  const heroNumber = totalHours <= 0
    ? '0'
    : totalHours < 1
    ? `${Math.round(totalHours * 60)}m`
    : `${Math.round(totalHours * 10) / 10}h`;

  return (
    <section className="rep-showup">
      <div className="rep-showup__hours">
        <span className="rep-showup__hours-num">{heroNumber}</span>
        <span className="rep-showup__hours-label">{hoursLabel}</span>
      </div>
      <header className="rep-showup__head">
        <div className="rep-showup__head-l">
          <span className="rep-eyebrow rep-eyebrow--accent">your touch points</span>
          <h2 className="rep-showup__title">how consistently are you showing up?</h2>
          <p className="rep-showup__sub">
            Long-form video is your biggest touch point. Every published video is a chance to land
            each dimension with the audience. Claude reads the full transcripts of your videos and
            scores how consistently each dimension surfaces across the body of work. Inconsistency
            is touch points wasted.
          </p>
        </div>
        <div className="rep-showup__actions">
          {analysis && (
            <span className="rep-showup__age">
              last run · {ageStr} · {analysis.sample_size} transcripts
            </span>
          )}
          <button
            type="button"
            className="rep-btn rep-btn--primary"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending
              ? 'analyzing…'
              : analysis
              ? 'refresh analysis'
              : 'run analysis'}
          </button>
        </div>
      </header>

      {refresh.isError && (
        <p className="rep-showup__error">
          {(refresh.error as Error).message || 'analysis failed'}
        </p>
      )}

      {!analysis && !isLoading && !refresh.isPending && (
        <p className="rep-empty">
          no analysis yet. click run to see how consistently each dimension shows up across your videos.
        </p>
      )}

      {analysis && (
        <div className="rep-showup__grid">
          {analysis.dimensions.map((d) => (
            <ShowingUpCard
              key={d.id}
              dim={d}
              color={dimensionColors[d.id] ?? 'var(--recovery)'}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ShowingUpCard({ dim, color }: { dim: ContentAnalysisDimension; color: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(dim.consistency_pct)));
  const tone = pct >= 65 ? 'strong' : pct >= 40 ? 'medium' : 'weak';
  return (
    <article
      className={`rep-showup-card rep-showup-card--${tone}`}
      style={{ '--dim-c': color } as React.CSSProperties}
    >
      <header className="rep-showup-card__head">
        <span className="rep-eyebrow" style={{ color }}>
          {dim.label.toLowerCase()}
        </span>
        <span className="rep-showup-card__pct">{pct}%</span>
      </header>
      <div className="rep-showup-card__bar">
        <div className="rep-showup-card__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="rep-showup-card__noticed">{dim.what_claude_noticed}</p>
      {dim.opportunities.length > 0 && (
        <details className="rep-showup-card__ops">
          <summary>
            <span>see {dim.opportunities.length} opportunities</span>
            <span className="rep-showup-card__chevron">▾</span>
          </summary>
          <ul className="rep-showup-card__list">
            {dim.opportunities.map((op, i) => (
              <li key={i}>{op}</li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function relativeAge(ts: number): string {
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// =========================================================================
// hex helper
// =========================================================================
function hexA(c: string, a: number): string {
  if (c.startsWith('var('))
    return c.replace('var(', 'color-mix(in srgb, var(').replace(/\)$/, `) ${Math.round(a * 100)}%, transparent)`);
  if (c.startsWith('#') && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

// =========================================================================
// CSS
// =========================================================================
const REP_CSS = `
.rep { display: flex; flex-direction: column; gap: var(--space-5); }

.rep-eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.rep-eyebrow--accent { color: var(--recovery); }
.rep-eyebrow--warn { color: #E6A52F; }

/* HERO */
.rep-hero {
  display: grid;
  grid-template-columns: minmax(0, 180px) 1fr;
  gap: var(--space-5);
  align-items: center;
  padding: var(--space-5);
  background: linear-gradient(180deg, color-mix(in srgb, var(--recovery) 6%, transparent), var(--surface));
  border: 1px solid color-mix(in srgb, var(--recovery) 18%, transparent);
  border-radius: var(--radius-lg);
}
.rep-hero__ring { display: flex; justify-content: center; }
.rep-hero__copy { display: flex; flex-direction: column; gap: var(--space-2); }
.rep-stage {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--recovery);
  font-weight: 700;
}
.rep-hero__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.3rem, 2.2vw, 1.65rem);
  letter-spacing: -0.025em;
}
.rep-hero__framing {
  margin: 0;
  font-size: var(--body);
  line-height: 1.55;
  color: var(--muted);
  max-width: 64ch;
}
@media (max-width: 640px) {
  .rep-hero { grid-template-columns: 140px 1fr; gap: var(--space-4); padding: var(--space-4); }
}

/* BASELINE STRIP */
.rep-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
}
@media (max-width: 640px) { .rep-strip { grid-template-columns: 1fr; } }
.rep-strip__cell { display: flex; flex-direction: column; gap: 4px; }
.rep-strip__num {
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.rep-strip__sub { font-size: var(--body-sm); color: var(--muted); }

/* AVATAR CARD */
.rep-avatar {
  padding: var(--space-5);
  background: linear-gradient(180deg, color-mix(in srgb, var(--recovery) 4%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in srgb, var(--recovery) 14%, var(--hairline));
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rep-avatar__who { display: flex; gap: var(--space-3); align-items: flex-start; }
.rep-avatar__icon { width: 56px; height: 56px; flex-shrink: 0; }
.rep-avatar__who-text { flex: 1; min-width: 0; }
.rep-avatar__pair {
  display: grid;
  grid-template-columns: 1fr 36px 1fr;
  gap: var(--space-3);
  align-items: stretch;
}
.rep-avatar__arrow { align-self: center; opacity: 0.55; }
@media (max-width: 640px) {
  .rep-avatar__pair { grid-template-columns: 1fr; }
  .rep-avatar__arrow { transform: rotate(90deg); justify-self: center; }
}
.rep-side {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rep-side__head { display: flex; align-items: center; gap: 6px; }
.rep-side__dot { width: 6px; height: 6px; border-radius: 50%; }
.rep-side__label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--muted);
}

.rep-avatar__tags {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
@media (max-width: 640px) { .rep-avatar__tags { grid-template-columns: 1fr; } }
.rep-tagcol { display: flex; flex-direction: column; gap: var(--space-2); }
.rep-tagcol__row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* INLINE FIELD */
.rep-inline {
  border-radius: var(--radius-md);
  transition: background 0.15s;
}
.rep-inline--filled, .rep-inline--empty {
  padding: var(--space-2);
  cursor: text;
  border: 1px solid transparent;
}
.rep-inline--filled:hover, .rep-inline--empty:hover {
  background: rgba(255,255,255,0.03);
  border-color: var(--hairline);
}
.rep-inline--editing { display: flex; flex-direction: column; gap: var(--space-2); }
.rep-inline__value { margin: 0; line-height: 1.55; font-size: var(--body); white-space: pre-wrap; }
.rep-inline__value--lg { font-size: var(--body-lg); font-weight: 500; letter-spacing: -0.005em; }
.rep-inline__value--sm { font-size: var(--body-sm); line-height: 1.5; color: var(--muted); }
.rep-inline__placeholder { margin: 0; line-height: 1.55; font-size: var(--body-sm); color: var(--muted-2); font-style: italic; }

.rep-textarea {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  line-height: 1.55;
  resize: vertical;
  min-height: 70px;
  outline: none;
}
.rep-textarea:focus { border-color: var(--recovery); background: rgba(255,255,255,0.06); }
.rep-textarea--large { min-height: 130px; }
.rep-text-input {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  outline: none;
}
.rep-text-input:focus { border-color: var(--recovery); }

/* CHIPS */
.rep-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}
.rep-chip--mini { padding: 2px 8px; font-size: 10px; background: rgba(255,255,255,0.06); color: var(--muted); }
.rep-chip__x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.55;
}
.rep-chip__x:hover { opacity: 1; }
.rep-chip-input {
  background: transparent;
  border: 1px dashed var(--hairline);
  color: var(--ink);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-family: inherit;
  width: 84px;
  outline: none;
}
.rep-chip-input:focus { background: rgba(255,255,255,0.04); }

/* BUTTONS */
.rep-btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.rep-btn--primary { background: var(--recovery); color: var(--bg); }
.rep-btn--primary:hover { transform: translateY(-1px); }
.rep-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.rep-btn--ghost { background: transparent; color: var(--muted); border-color: var(--hairline); }
.rep-btn--ghost:hover { color: var(--ink); border-color: var(--ink); }
.rep-btn--danger-ghost { background: transparent; color: #ff6b6b; border-color: rgba(255,107,107,0.3); }
.rep-btn--danger-ghost:hover { background: rgba(255,107,107,0.08); }

.rep-actions { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }

/* DIM GRID */
.rep-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
@media (max-width: 720px) { .rep-grid { grid-template-columns: 1fr; } }

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
  transition: all 0.18s;
  color: inherit;
  font-family: inherit;
}
.rep-dim:hover {
  border-color: var(--dim-c);
  transform: translateY(-2px);
  box-shadow: 0 10px 28px -16px var(--dim-c);
}
.rep-dim__row { display: grid; grid-template-columns: 76px 1fr; gap: var(--space-4); align-items: center; }
.rep-dim__head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rep-dim__def { margin: 0; font-size: var(--body-sm); color: var(--muted); line-height: 1.45; }
.rep-dim__bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.rep-dim__bar-fill { height: 100%; background: var(--dim-c); border-radius: 2px; transition: width 0.3s; }
.rep-dim__meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* PANEL */
.rep-panel-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: rep-fade 0.18s ease-out;
}
@keyframes rep-fade { from { opacity: 0; } to { opacity: 1; } }
.rep-panel {
  width: min(680px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--dim-c);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: rep-slide 0.22s ease-out;
}
@keyframes rep-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.rep-panel__head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; }
.rep-panel__head-l { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.rep-panel__head-r { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.rep-panel__title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.7rem; letter-spacing: -0.025em; }
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

.rep-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--hairline);
}
.rep-section:first-of-type { padding-top: 0; border-top: none; }
.rep-section__head { display: flex; flex-direction: column; gap: 4px; }
.rep-section__title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.15rem; letter-spacing: -0.015em; }
.rep-section__sub { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }

.rep-list { display: flex; flex-direction: column; gap: var(--space-2); }

.rep-card {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-card--inline {
  background: rgba(255,255,255,0.03);
}

/* METHOD BOXES (Value: the method + the result of the method) */
.rep-methodbox {
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.rep-methodbox:last-child { margin-bottom: 0; }
.rep-methodbox--done { border-color: color-mix(in srgb, var(--dim-c) 28%, var(--hairline)); background: color-mix(in srgb, var(--dim-c) 3%, transparent); }
.rep-methodbox__head { display: flex; justify-content: space-between; align-items: baseline; }
.rep-methodbox__edit {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
}
.rep-methodbox__edit:hover { color: var(--ink); }
.rep-methodbox__copy {
  margin: 0;
  line-height: 1.6;
  font-size: var(--body);
  white-space: pre-wrap;
  cursor: text;
}
.rep-methodbox__empty { cursor: text; display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.rep-methodbox__prompt { margin: 0; color: var(--muted-2); font-size: var(--body-sm); line-height: 1.55; font-style: italic; }

/* STEP BOXES (Value) */
.rep-steps { display: flex; flex-direction: column; gap: var(--space-3); }
.rep-step {
  display: grid;
  grid-template-columns: 44px 1fr;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
}
.rep-step--done { border-color: color-mix(in srgb, var(--dim-c) 28%, var(--hairline)); }
.rep-step__num {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
}
.rep-step__body { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.rep-step__view, .rep-step__empty { cursor: text; }
.rep-step__view p { margin: 0; line-height: 1.55; font-size: var(--body); white-space: pre-wrap; }
.rep-step__empty { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-start; }
.rep-step__prompt { margin: 0; color: var(--muted-2); font-size: var(--body-sm); line-height: 1.5; font-style: italic; }

/* VALUE METRICS */
.rep-vmetrics { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
@media (max-width: 640px) { .rep-vmetrics { grid-template-columns: 1fr; } }
.rep-vmetric {
  padding: var(--space-4);
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rep-vmetric__num {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.65rem;
  letter-spacing: -0.02em;
  color: var(--dim-c);
}
.rep-vmetric__sub { font-size: var(--body-sm); color: var(--muted); }

.rep-cta-card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: color-mix(in srgb, var(--dim-c) 7%, transparent);
  border: 1px solid color-mix(in srgb, var(--dim-c) 22%, transparent);
  border-radius: var(--radius-md);
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
}
.rep-cta-card__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rep-cta-card__copy strong { font-family: var(--font-display); font-weight: 600; font-size: var(--body); }
.rep-cta-card__copy p { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }
.rep-cta-card__code {
  background: rgba(0,0,0,0.3);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--body-sm);
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--dim-c);
}

/* ENEMY */
.rep-enemy {
  padding: var(--space-3);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rep-enemy--done { border-color: color-mix(in srgb, var(--dim-c) 28%, var(--hairline)); }
.rep-enemy__prompt { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; font-style: italic; }

/* GENERIC ROW (POVs, wins) */
.rep-row {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
}
.rep-row--open { border-color: color-mix(in srgb, var(--dim-c) 28%, var(--hairline)); }
.rep-row--filled { background: color-mix(in srgb, var(--dim-c) 3%, transparent); }
.rep-row__head {
  width: 100%;
  background: none;
  border: none;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  font-size: var(--body);
  text-align: left;
}
.rep-row__bullet { flex-shrink: 0; }
.rep-row__title { flex: 1; font-weight: 500; }
.rep-row__caret { color: var(--muted); font-size: 1.2rem; }
.rep-row__edit, .rep-row__caret-btn {
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 8px;
  font-family: inherit;
  font-size: var(--body);
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
}
.rep-row__edit:hover, .rep-row__caret-btn:hover {
  color: var(--ink);
  background: rgba(255,255,255,0.06);
}
.rep-row__caret-btn { font-size: 1.2rem; line-height: 1; }
.rep-row__body {
  padding: 0 var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-row__copy { margin: 0; line-height: 1.55; font-size: var(--body); }
.rep-row__src { color: var(--muted); font-size: var(--body-sm); font-style: italic; }

/* POV STRUCTURED FIELDS */
.rep-povf { display: flex; flex-direction: column; gap: 6px; }
.rep-povf__view { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); cursor: text; }
.rep-povf__view:hover { background: rgba(255,255,255,0.03); }
.rep-povf__view p { margin: 0; line-height: 1.55; font-size: var(--body); white-space: pre-wrap; }
.rep-povf__add {
  text-align: left;
  background: none;
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  color: var(--muted);
  font-family: inherit;
  font-size: var(--body-sm);
  cursor: pointer;
  line-height: 1.4;
}
.rep-povf__add:hover { color: var(--ink); border-color: var(--muted); }

/* CANDIDATES */
.rep-candidates {
  padding: var(--space-3);
  border: 1px dashed color-mix(in srgb, #E6A52F 30%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, #E6A52F 4%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-candidate {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--surface);
  border-radius: var(--radius-md);
}
.rep-candidate__copy strong { font-weight: 600; }
.rep-candidate__copy p { margin: 4px 0 0; line-height: 1.5; color: var(--muted); font-size: var(--body-sm); }
.rep-candidate__src { display: block; margin-top: 4px; color: var(--muted); font-size: var(--body-sm); font-style: italic; }

.rep-add {
  background: none;
  border: 1px dashed var(--hairline);
  color: var(--muted);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: all 0.15s;
}
.rep-add:hover { border-color: var(--dim-c); color: var(--ink); }

/* FILTERS */
.rep-filter { display: flex; gap: var(--space-2); }
.rep-filter__btn {
  background: none;
  border: 1px solid var(--hairline);
  color: var(--muted);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.rep-filter__btn--on { background: var(--dim-c); color: var(--bg); border-color: var(--dim-c); }
.rep-filter__count { background: rgba(0,0,0,0.28); padding: 0 6px; border-radius: var(--radius-pill); font-size: 10px; }

.rep-empty { color: var(--muted); font-size: var(--body-sm); margin: 0; padding: var(--space-2) 0; }
.rep-tag-row { display: flex; gap: 6px; flex-wrap: wrap; }

/* STORY ACTIONS */
.rep-action {
  width: 100%;
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  text-align: left;
  transition: all 0.15s;
}
.rep-action:hover { border-color: var(--dim-c); }
.rep-action--done {
  background: color-mix(in srgb, var(--dim-c) 5%, transparent);
  border-color: color-mix(in srgb, var(--dim-c) 28%, var(--hairline));
}
.rep-action__box {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  margin-top: 2px;
}
.rep-action__box--on { background: var(--dim-c); border-color: var(--dim-c); color: var(--bg); }
.rep-action__copy { display: flex; flex-direction: column; gap: 2px; }
.rep-action__label { font-weight: 500; }
.rep-action__hint { color: var(--muted); font-size: var(--body-sm); line-height: 1.45; }

/* COMPRESSED */
.rep-compressed { margin: 0; line-height: 1.55; font-size: var(--body); }
.rep-compressed__meta {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-2);
  font-size: var(--body-sm);
  color: var(--muted);
}
.rep-compressed__hint { font-size: 11px; }

/* MICRO STORIES */
.rep-micro {
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.02);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rep-micro__text { margin: 0; line-height: 1.55; font-size: var(--body); }
.rep-micro__src { margin: 0; font-size: var(--body-sm); color: var(--muted); font-style: italic; }
.rep-micro__tags { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }

/* SHOWING UP - content analysis section */
.rep-showup {
  margin-top: var(--space-3);
  padding: var(--space-5);
  background: linear-gradient(180deg, color-mix(in srgb, var(--recovery) 5%, transparent), var(--surface));
  border: 1px solid color-mix(in srgb, var(--recovery) 18%, var(--hairline));
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rep-showup__hours {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--hairline);
}
.rep-showup__hours-num {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(3rem, 7vw, 5rem);
  letter-spacing: -0.04em;
  line-height: 1;
  color: var(--ink);
}
.rep-showup__hours-label {
  font-size: var(--body-sm);
  color: var(--muted);
  letter-spacing: 0.02em;
}
.rep-showup__head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  align-items: flex-start;
}
.rep-showup__head-l { display: flex; flex-direction: column; gap: var(--space-2); flex: 1; min-width: 280px; }
.rep-showup__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.2rem, 2vw, 1.45rem);
  letter-spacing: -0.025em;
  line-height: 1.2;
}
.rep-showup__sub {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.5;
  color: var(--muted);
  max-width: 70ch;
}
.rep-showup__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
}
.rep-showup__age {
  font-size: var(--body-sm);
  color: var(--muted);
  font-style: italic;
}
.rep-showup__error {
  margin: 0;
  padding: var(--space-3);
  background: rgba(255,107,107,0.08);
  border: 1px solid rgba(255,107,107,0.3);
  border-radius: var(--radius-md);
  color: #ff6b6b;
  font-size: var(--body-sm);
}
.rep-showup__summary {
  margin: 0;
  padding: var(--space-4);
  background: rgba(255,255,255,0.04);
  border-left: 3px solid var(--recovery);
  border-radius: var(--radius-md);
  font-size: var(--body);
  line-height: 1.6;
}
.rep-showup__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
@media (max-width: 720px) { .rep-showup__grid { grid-template-columns: 1fr; } }

.rep-showup-card {
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-showup-card--strong { border-color: color-mix(in srgb, var(--dim-c) 35%, var(--hairline)); }
.rep-showup-card--weak { border-color: rgba(255,107,107,0.22); }
.rep-showup-card__head { display: flex; justify-content: space-between; align-items: baseline; }
.rep-showup-card__pct {
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--dim-c);
}
.rep-showup-card__bar {
  height: 5px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  overflow: hidden;
}
.rep-showup-card__bar-fill {
  height: 100%;
  background: var(--dim-c);
  border-radius: 3px;
  transition: width 0.3s;
}
.rep-showup-card__noticed {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.55;
  color: var(--ink);
}
.rep-showup-card__ops {
  border-top: 1px dashed var(--hairline);
  padding-top: var(--space-3);
}
.rep-showup-card__ops > summary {
  cursor: pointer;
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--body-sm);
  font-weight: 600;
  color: var(--dim-c);
  letter-spacing: 0.02em;
}
.rep-showup-card__ops > summary::-webkit-details-marker { display: none; }
.rep-showup-card__chevron { transition: transform 0.18s; }
.rep-showup-card__ops[open] .rep-showup-card__chevron { transform: rotate(180deg); }
.rep-showup-card__list {
  margin: var(--space-3) 0 0;
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rep-showup-card__list li {
  font-size: var(--body-sm);
  line-height: 1.55;
  color: var(--ink);
}
.rep-showup-card__list li::marker { color: var(--dim-c); }
`;
