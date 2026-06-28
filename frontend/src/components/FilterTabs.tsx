/**
 * FilterTabs - the ONE canonical category / filter selector for the whole
 * dashboard. The Skills page tab row (all / research / ideas / create / ...)
 * is the reference look, and this component IS that look. Every segmented
 * "filter a list by category" selector must use this component so they can
 * never drift apart.
 *
 * HARD RULE (see docs/DESIGN_UI.md): do not hand-roll a row of filter pills.
 * Use <FilterTabs>. If you need a variation, change it here so every selector
 * changes together.
 */
import type { ReactNode } from 'react';
import { SURFACE_LIFT as LIFT } from '../lib/ui';

export interface FilterTabOption {
  /** The value stored in state when this tab is active. */
  value: string;
  /** Visible label. */
  label: ReactNode;
  /** Optional trailing count (number like 12, or a string like "3/5"). */
  count?: number | string;
}

interface FilterTabsProps {
  options: FilterTabOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export function FilterTabs({ options, value, onChange, ariaLabel }: FilterTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--body-sm)',
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              background: active ? 'var(--ink)' : 'var(--surface)',
              color: active ? 'var(--bg)' : 'var(--muted)',
              border: `1px solid ${active ? 'var(--ink)' : 'var(--hairline)'}`,
              boxShadow: LIFT,
              transition: 'all var(--duration-fast) var(--ease-out)',
            }}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
