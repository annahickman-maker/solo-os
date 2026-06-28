import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { FocusTargets } from '../api';

// 90-day target editor. Three clear sections:
//   1. Target goal      - the end date + reset-to-90-days
//   2. Revenue target   - $/mo + avg price + buyer count + model (drives labels)
//   3. Content targets  - one card per platform (YouTube + Instagram for now;
//                         "+ add platform" stub flagged as coming soon)
//
// The revenue-model selector is purely a labeling switch on the front end:
// "members" for recurring, "clients" for service, "buyers" for product,
// "cohort seats" for cohort launches. The underlying data fields are the
// same (mrr_target_usd, avg_member_price_usd, member_target) so any model
// stores correctly without backend forks.

// Revenue type toggle. Two options - everything else (membership, service,
// product, cohort) collapses into one of these two: are you targeting a
// MONTHLY RECURRING figure, or a TOTAL revenue figure for the window?
type RevenueModel = 'mrr' | 'total';

const REVENUE_MODES: Array<{ value: RevenueModel; label: string; suffix: string }> = [
  { value: 'mrr',   label: 'Monthly recurring revenue', suffix: '/ mo' },
  { value: 'total', label: 'Total revenue',             suffix: ''      },
];

export function FocusTargetEditor({
  targets,
  goalId,
}: {
  targets: FocusTargets | undefined;
  goalId: string | null;
  alwaysOpen?: boolean;
}) {
  const qc = useQueryClient();

  const [model, setModel] = useState<RevenueModel>('mrr');
  const [revenue, setRevenue] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [longForm, setLongForm] = useState<string>('');
  const [shortForm, setShortForm] = useState<string>('');

  useEffect(() => {
    if (!targets) return;
    const m = targets.revenue_model === 'total' ? 'total' : 'mrr';
    setModel(m);
    setRevenue(targets.mrr_target_usd != null ? String(targets.mrr_target_usd) : '');
    setPrice(targets.avg_member_price_usd != null ? String(targets.avg_member_price_usd) : '');
    setEndDate(targets.target_date ?? '');
    setLongForm(String(targets.long_form_per_week ?? 1));
    setShortForm(String(targets.short_form_per_week ?? 0));
  }, [targets]);

  const mode = REVENUE_MODES.find((m) => m.value === model)!;

  // Sales needed is now FULLY derived: revenue ÷ price, rounded up. No
  // manual input, no button - changes automatically as revenue or price
  // change, and gets persisted on save.
  const revenueNum = Number(revenue);
  const priceNum = Number(price);
  const computedSales =
    Number.isFinite(revenueNum) && revenueNum > 0 && Number.isFinite(priceNum) && priceNum > 0
      ? Math.ceil(revenueNum / priceNum)
      : null;

  const updateGoal = useMutation({
    mutationFn: (patch: Parameters<typeof api.updateGoal>[1]) =>
      goalId ? api.updateGoal(goalId, patch) : Promise.reject(new Error('no goal id')),
  });
  const updateSettings = useMutation({
    mutationFn: (body: { long_form_per_week?: number; short_form_per_week?: number }) =>
      api.updateSettings(body),
  });

  // Auto-save: every field commits on blur (or on click for toggles/dates).
  // No save button. Each commit runs only the patch it needs, then
  // invalidates the relevant queries so the dial + counters update live.
  async function commit(args: {
    goalPatch?: Parameters<typeof api.updateGoal>[1];
    settingsPatch?: { long_form_per_week?: number; short_form_per_week?: number };
  }) {
    const goalPatch = args.goalPatch ?? {};
    const settingsPatch = args.settingsPatch ?? {};
    const tasks: Promise<unknown>[] = [];
    if (Object.keys(goalPatch).length > 0) tasks.push(updateGoal.mutateAsync(goalPatch));
    if (Object.keys(settingsPatch).length > 0) tasks.push(updateSettings.mutateAsync(settingsPatch));
    if (tasks.length === 0) return;
    try {
      await Promise.all(tasks);
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    } catch (e) {
      window.alert(`save failed: ${(e as Error).message}`);
    }
  }

  function commitPrice() {
    const v = price === '' ? null : Number(price);
    if (v === (targets?.avg_member_price_usd ?? null)) return;
    // Saving price also bakes in the auto-computed sales count so
    // downstream consumers (the Focus dial) see them update together.
    void commit({ goalPatch: { avg_member_price_usd: v, target_value: computedSales } });
  }
  function commitRevenueAndPrice() {
    // When revenue is saved we also push the freshly-computed sales count
    // since sales is fully derived from revenue ÷ price.
    void commit({ goalPatch: { mrr_target_usd: revenue === '' ? null : Number(revenue), target_value: computedSales } });
  }
  function commitDate(next: string) {
    const v = next || null;
    if (v === (targets?.target_date ?? null)) return;
    void commit({ goalPatch: { target_date: v } });
  }
  function commitModel(next: RevenueModel) {
    if (next === (targets?.revenue_model || 'mrr')) return;
    void commit({ goalPatch: { revenue_model: next } });
  }
  function commitLongForm() {
    const v = Math.max(0, Number(longForm) || 0);
    if (v === (targets?.long_form_per_week ?? 0)) return;
    void commit({ settingsPatch: { long_form_per_week: v } });
  }
  function commitShortForm() {
    const v = Math.max(0, Number(shortForm) || 0);
    if (v === (targets?.short_form_per_week ?? 0)) return;
    void commit({ settingsPatch: { short_form_per_week: v } });
  }

  function resetEndDateTo90Days() {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const next = `${y}-${m}-${day}`;
    setEndDate(next);
    commitDate(next);
  }

  const saving = updateGoal.isPending || updateSettings.isPending;

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <Section
        eyebrow="01 · target goal"
        title="when does this 90-day window end?"
      >
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>end date</span>
          {/* Input + reset button on the SAME row, same height. The button
              is a primary (green) action - same visual weight as Save. The
              hint sits below both so the button doesn't get pushed out of
              line with the input. */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                commitDate(e.target.value);
              }}
              style={{ ...inputStyle, flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={resetEndDateTo90Days}
              style={{ whiteSpace: 'nowrap' }}
            >
              reset to 90 days
            </button>
          </div>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {endDate ? daysFromNow(endDate) : 'pick the day the 90-day sprint ends'}
          </span>
        </div>
      </Section>

      <Section
        eyebrow="02 · revenue target"
        title="what does success look like?"
      >
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {/* Segmented toggle: MRR vs Total revenue. Two options, no chrome -
              same visual pattern as a tab switcher. */}
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>revenue goal</span>
            <div
              style={{
                display: 'inline-flex',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-pill)',
                padding: 3,
                width: 'fit-content',
              }}
            >
              {REVENUE_MODES.map((opt) => {
                const active = opt.value === model;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setModel(opt.value);
                      commitModel(opt.value);
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-pill)',
                      border: 'none',
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? 'var(--bg)' : 'var(--muted)',
                      fontSize: 'var(--body-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: '0.02em',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <NumberField
              label="revenue"
              prefix="$"
              suffix={mode.suffix}
              value={revenue}
              onChange={setRevenue}
              onBlur={commitRevenueAndPrice}
              hint={
                targets
                  ? `currently $${(targets.current_mrr_usd ?? 0).toLocaleString('en-US')}${mode.suffix ? ` ${mode.suffix}` : ''}`
                  : undefined
              }
            />
            <NumberField
              label="price"
              prefix="$"
              value={price}
              onChange={setPrice}
              onBlur={commitPrice}
              hint={priceHint(price)}
            />
            <ComputedField
              label="sales needed"
              value={computedSales != null ? String(computedSales) : '-'}
              hint={
                computedSales != null
                  ? 'revenue ÷ price, updates as you type'
                  : 'set revenue + price to calculate'
              }
            />
          </div>
        </div>
      </Section>

      <Section
        eyebrow="03 · content targets"
        title="the content that gets you there"
      >
        <div className="stack" style={{ gap: 'var(--space-3)' }}>
          <PlatformCard
            name="YouTube"
            kind="long-form"
            href="/content"
            value={longForm}
            onChange={setLongForm}
            onBlur={commitLongForm}
            unit="per week"
            step={0.25}
            hint={longFormHint(longForm)}
          />
          <PlatformCard
            name="Instagram"
            kind="short-form"
            href="/content"
            value={shortForm}
            onChange={setShortForm}
            onBlur={commitShortForm}
            unit="per week"
            step={1}
            hint={shortFormHint(shortForm)}
          />
        </div>
      </Section>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          fontSize: 'var(--body-sm)',
          color: 'var(--muted)',
          minHeight: 18,
        }}
      >
        {saving ? 'saving…' : 'auto-saves as you go'}
      </div>
    </div>
  );
}

// =========================================================================
// Section wrapper - eyebrow + title + optional sub + content
// =========================================================================
function Section({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div className="stack" style={{ gap: 4 }}>
        <span className="eyebrow" style={{ color: 'var(--recovery)' }}>{eyebrow}</span>
        <h3 className="h3" style={{ margin: 0 }}>{title}</h3>
        {sub && (
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--body-sm)' }}>{sub}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// =========================================================================
// Platform card - one row per content surface (YouTube, Instagram, ...).
// Title links to that platform's tab so members can see / tick publishes.
// =========================================================================
function PlatformCard({
  name,
  kind,
  href,
  value,
  onChange,
  onBlur,
  unit,
  step,
  hint,
}: {
  name: string;
  kind: 'long-form' | 'short-form';
  href: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  unit: string;
  step: number;
  hint?: string;
}) {
  function gotoTab() {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 220px)',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3) var(--space-4)',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="stack" style={{ gap: 2 }}>
        <span className="eyebrow" style={{ color: 'var(--muted)' }}>{kind}</span>
        <button
          type="button"
          onClick={gotoTab}
          title={`open the ${name.toLowerCase()} tab`}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: 'var(--ink)',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.05rem',
            textAlign: 'left',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          {name} <span style={{ color: 'var(--muted)', fontSize: '0.85em', fontWeight: 400 }}>→</span>
        </button>
      </div>
      <NumberField
        label="target"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        suffix={unit}
        step={step}
        hint={hint}
      />
    </div>
  );
}

// =========================================================================
// Small helpers (mostly unchanged from the old editor).
// =========================================================================
function longFormHint(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 'set to 0 to opt out';
  if (n >= 1) return `${Math.round(n * 10) / 10} per week`;
  const weeks = Math.round(1 / n);
  return weeks === 1 ? '1 per week' : `1 every ${weeks} weeks`;
}

function shortFormHint(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 'set to 0 to opt out';
  return `${Math.round(n)} per week`;
}

function priceHint(price: string): string {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return 'used to calculate sales needed';
  return `$${n.toLocaleString('en-US')} per sale`;
}


function daysFromNow(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'today';
  if (diff > 0) return `${diff} days from today`;
  return `${Math.abs(diff)} days ago`;
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--hairline)',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 'var(--body)',
  colorScheme: 'dark',
};

// Read-only derived field. Mirrors NumberField's visual shape so the row
// reads as part of the same grid, but the value is computed, not edited.
function ComputedField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="eyebrow" style={{ color: 'var(--muted)' }}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)',
          color: 'var(--ink)',
          fontFamily: 'inherit',
          fontSize: 'var(--body)',
        }}
      >
        {value}
      </div>
      {hint && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>{hint}</span>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  onBlur,
  prefix,
  suffix,
  step,
  hint,
  action,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <label className="stack" style={{ gap: 6 }}>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span className="eyebrow" style={{ color: 'var(--muted)' }}>{label}</span>
        {action}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 10px',
          background: 'transparent',
        }}
      >
        {prefix && <span className="muted">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step ?? 1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--ink)',
            fontFamily: 'inherit',
            fontSize: 'var(--body)',
          }}
        />
        {suffix && <span className="muted">{suffix}</span>}
      </div>
      {hint && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>{hint}</span>
      )}
    </label>
  );
}
