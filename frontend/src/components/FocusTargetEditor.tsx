import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { FocusTargets } from '../api';

// 90-day focus editor. Five knobs:
//   - revenue target ($/mo) -> goal.mrr_target_usd
//   - avg member price ($) -> goal.avg_member_price_usd
//     used as a calculator hint: rev / price = suggested members
//   - members target -> goal.target_value
//   - end date -> goal.target_date (ISO YYYY-MM-DD)
//   - long-form content (per week) -> state.md.long_form_per_week
//   - short-form content (per week) -> state.md.short_form_per_week
// Designed to work for any solopreneur, not just Anna - the cadence is
// fully dynamic, no hard-coded "1 per week" assumption.
export function FocusTargetEditor({
  targets,
  goalId,
  alwaysOpen = false,
}: {
  targets: FocusTargets | undefined;
  goalId: string | null;
  // When true, the editor renders its full form straight away with no
  // collapse-toggle header. Used when the editor is mounted inside a
  // side-panel that already has its own header.
  alwaysOpen?: boolean;
}) {
  const [openState, setOpen] = useState(false);
  const open = alwaysOpen || openState;
  const qc = useQueryClient();

  const [mrr, setMrr] = useState<string>('');
  const [price, setPrice] = useState<string>('');
  const [members, setMembers] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [longForm, setLongForm] = useState<string>('');
  const [shortForm, setShortForm] = useState<string>('');

  useEffect(() => {
    if (!targets) return;
    setMrr(targets.mrr_target_usd != null ? String(targets.mrr_target_usd) : '');
    setPrice(targets.avg_member_price_usd != null ? String(targets.avg_member_price_usd) : '');
    setMembers(targets.member_target != null ? String(targets.member_target) : '');
    setEndDate(targets.target_date ?? '');
    setLongForm(String(targets.long_form_per_week ?? 1));
    setShortForm(String(targets.short_form_per_week ?? 0));
  }, [targets]);

  // Calculator: revenue ÷ avg price = suggested members.
  const mrrNum = Number(mrr);
  const priceNum = Number(price);
  const suggestedMembers =
    Number.isFinite(mrrNum) && mrrNum > 0 && Number.isFinite(priceNum) && priceNum > 0
      ? Math.ceil(mrrNum / priceNum)
      : null;

  const updateGoal = useMutation({
    mutationFn: (patch: {
      target_value?: number | null;
      mrr_target_usd?: number | null;
      avg_member_price_usd?: number | null;
      target_date?: string | null;
    }) => (goalId ? api.updateGoal(goalId, patch) : Promise.reject(new Error('no goal id'))),
  });
  const updateSettings = useMutation({
    mutationFn: (body: { long_form_per_week?: number; short_form_per_week?: number }) =>
      api.updateSettings(body),
  });

  async function save() {
    const goalPatch: {
      target_value?: number | null;
      mrr_target_usd?: number | null;
      avg_member_price_usd?: number | null;
      target_date?: string | null;
    } = {};
    const mrrSaved = mrr === '' ? null : Number(mrr);
    const priceSaved = price === '' ? null : Number(price);
    const memberSaved = members === '' ? null : Number(members);
    const dateSaved = endDate || null;

    if (mrrSaved !== targets?.mrr_target_usd) goalPatch.mrr_target_usd = mrrSaved;
    if (priceSaved !== targets?.avg_member_price_usd)
      goalPatch.avg_member_price_usd = priceSaved;
    if (memberSaved !== targets?.member_target) goalPatch.target_value = memberSaved;
    if (dateSaved !== (targets?.target_date ?? null)) goalPatch.target_date = dateSaved;

    const longFormNum = Math.max(0, Number(longForm) || 0);
    const shortFormNum = Math.max(0, Number(shortForm) || 0);
    const settingsPatch: { long_form_per_week?: number; short_form_per_week?: number } = {};
    if (longFormNum !== targets?.long_form_per_week) settingsPatch.long_form_per_week = longFormNum;
    if (shortFormNum !== targets?.short_form_per_week)
      settingsPatch.short_form_per_week = shortFormNum;

    const tasks: Promise<unknown>[] = [];
    if (Object.keys(goalPatch).length > 0) tasks.push(updateGoal.mutateAsync(goalPatch));
    if (Object.keys(settingsPatch).length > 0) tasks.push(updateSettings.mutateAsync(settingsPatch));
    if (tasks.length === 0) {
      setOpen(false);
      return;
    }
    try {
      await Promise.all(tasks);
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setOpen(false);
    } catch (e) {
      window.alert(`save failed: ${(e as Error).message}`);
    }
  }

  const summary = targets
    ? [
        `$${(targets.mrr_target_usd ?? 0).toLocaleString('en-US')}/mo`,
        `${targets.member_target ?? '?'} members`,
        targets.target_date ? `by ${targets.target_date}` : null,
        cadenceShort(targets.long_form_per_week, targets.short_form_per_week),
      ]
        .filter(Boolean)
        .join(' · ')
    : 'set targets';

  const saving = updateGoal.isPending || updateSettings.isPending;

  return (
    <section
      style={{
        background: alwaysOpen ? 'transparent' : 'var(--surface)',
        border: alwaysOpen ? 'none' : '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {!alwaysOpen && (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-5)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--ink)',
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">your 90-day focus · set the targets</span>
          <span style={{ fontSize: 'var(--body)', color: 'var(--muted)' }}>{summary}</span>
        </span>
        <span style={{ fontSize: 22, color: 'var(--muted)', lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </button>
      )}
      {open && (
        <div
          style={{
            padding: alwaysOpen ? 0 : '0 var(--space-5) var(--space-5)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <NumberField
            label="revenue target"
            prefix="$"
            suffix="/ mo"
            value={mrr}
            onChange={setMrr}
            hint={targets ? `currently $${(targets.current_mrr_usd ?? 0).toLocaleString('en-US')}/mo` : undefined}
          />
          <NumberField
            label="avg member price"
            prefix="$"
            value={price}
            onChange={setPrice}
            hint={priceHint(price)}
          />
          <NumberField
            label="members to hit it"
            value={members}
            onChange={setMembers}
            hint={memberHint(targets, suggestedMembers, members)}
            action={
              suggestedMembers && Number(members) !== suggestedMembers ? (
                <button
                  type="button"
                  onClick={() => setMembers(String(suggestedMembers))}
                  style={pillBtnStyle}
                >
                  use {suggestedMembers}
                </button>
              ) : null
            }
          />
          <label className="stack" style={{ gap: 6 }}>
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>end date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              {endDate
                ? daysFromNow(endDate)
                : '90-day sprint end - drives the days-remaining timer'}
            </span>
          </label>
          <NumberField
            label="long-form content"
            suffix="/ week"
            value={longForm}
            onChange={setLongForm}
            step={0.25}
            hint={longFormHint(longForm)}
          />
          <NumberField
            label="short-form content"
            suffix="/ week"
            value={shortForm}
            onChange={setShortForm}
            hint={shortFormHint(shortForm)}
          />
          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 'var(--space-2)',
            }}
          >
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={save}
            >
              {saving ? 'saving' : 'save targets'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function cadenceShort(longPerWeek: number, shortPerWeek: number): string {
  const parts: string[] = [];
  if (longPerWeek > 0) parts.push(`${formatPerWeek(longPerWeek)} long`);
  if (shortPerWeek > 0) parts.push(`${formatPerWeek(shortPerWeek)} short`);
  return parts.length ? parts.join(', ') : 'no cadence set';
}

function formatPerWeek(n: number): string {
  if (n >= 1) {
    const rounded = Math.round(n * 10) / 10;
    return `${rounded}/wk`;
  }
  // Fractional → "1 every N weeks"
  const weeks = Math.round(1 / n);
  return weeks === 1 ? '1/wk' : `1 every ${weeks} wks`;
}

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
  if (!Number.isFinite(n) || n <= 0) return 'used to suggest members needed';
  return `$${n.toLocaleString('en-US')} per member per month`;
}

function memberHint(
  targets: FocusTargets | undefined,
  suggested: number | null,
  current: string
): string {
  const base = targets ? `currently ${targets.current_members ?? 0}` : '';
  if (!suggested) return base;
  const same = Number(current) === suggested;
  const calc = `calc: $${(targets?.mrr_target_usd ?? Number(current) * 0) || 0} ÷ price = ${suggested}`;
  if (same) return base ? `${base} · suggested ${suggested}` : `suggested ${suggested}`;
  return base ? `${base} · ${calc}` : calc;
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

const pillBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-pill)',
  color: 'var(--ink)',
  padding: '2px 10px',
  fontSize: 11,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  hint,
  action,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
