/**
 * PageTabs - the ONE canonical page-level tab switcher for the whole dashboard.
 * These are the file-folder tabs locked on the Content page (YouTube / Instagram):
 * the active tab is a filled ink "folder" with rounded top corners whose bottom
 * edge overlaps a full-width hairline (margin-bottom:-1px) so it reads as
 * connected to the content below; inactive tabs are plain muted labels sitting on
 * the line. Optional right-side actions live at the end of the same row.
 *
 * HARD RULE (see docs/DESIGN_UI.md): top-of-page section switchers (the channel
 * switcher, projects/clients, the profile foundation/reputation/offer router) use
 * THIS component. This is distinct from FilterTabs (Rule 1), which is for
 * filtering a list by category. PageTabs switch which whole view you are looking
 * at; FilterTabs filter the items inside one view.
 */
import type { ReactNode } from 'react';

export interface PageTabOption {
  /** The value stored in state when this tab is active. */
  value: string;
  /** Visible label (rendered uppercase). */
  label: ReactNode;
  /** Optional trailing count (number like 49, or a string). */
  count?: number | string;
}

interface PageTabsProps {
  options: PageTabOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Optional actions rendered on the right of the tab row (e.g. + add, avatar). */
  rightActions?: ReactNode;
}

export function PageTabs({ options, value, onChange, ariaLabel, rightActions }: PageTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div
        role="tablist"
        aria-label={ariaLabel}
        style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'flex-end' }}
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
                // File-folder tab: rounded top, borders on top + sides, and the
                // bottom edge overlaps the row's hairline. The active tab's bottom
                // is painted in the page bg so it "cuts" the line and connects to
                // the content below; inactive tabs sit behind the visible line.
                padding: '13px 26px',
                borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                borderTop: `1px solid ${active ? 'var(--ink)' : 'transparent'}`,
                borderLeft: `1px solid ${active ? 'var(--ink)' : 'transparent'}`,
                borderRight: `1px solid ${active ? 'var(--ink)' : 'transparent'}`,
                borderBottom: `1px solid ${active ? 'var(--ink)' : 'transparent'}`,
                marginBottom: '-1px',
                cursor: 'pointer',
                background: active ? 'var(--ink)' : 'transparent',
                color: active ? 'var(--bg)' : 'var(--muted)',
                fontSize: 'var(--body)',
                fontWeight: active ? 700 : 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                transition: 'color var(--duration-fast) var(--ease-out)',
              }}
            >
              {opt.label}
              {opt.count !== undefined && (
                <span style={{ marginLeft: 8, opacity: 0.55, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightActions != null && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 'var(--space-3)',
          }}
        >
          {rightActions}
        </div>
      )}
    </div>
  );
}
