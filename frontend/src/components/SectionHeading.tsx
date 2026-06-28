/**
 * SectionHeading - the ONE canonical section heading for the whole dashboard.
 * The Skills page section headers (eyebrow + "x custom / y built-in" sub-line +
 * a round count badge) are the reference look, and this component IS that look.
 *
 * HARD RULE (see docs/DESIGN_UI.md): every "section of a list" heading uses this
 * component. Do not hand-roll a colored <h2>/<h3> title + bare count. Use
 * <SectionHeading> so every section heading stays identical.
 */
import type { ReactNode } from 'react';
import { SURFACE_LIFT } from '../lib/ui';

interface SectionHeadingProps {
  /** Eyebrow label (rendered uppercase via the .eyebrow class). */
  label: ReactNode;
  /** Optional count shown in the round badge on the right. */
  count?: number;
  /** Optional muted sub-line under the eyebrow. */
  sub?: ReactNode;
  /** Optional eyebrow color (e.g. a category color). Defaults to muted. */
  color?: string;
}

export function SectionHeading({ label, count, sub, color }: SectionHeadingProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span className="eyebrow" style={color ? { color } : undefined}>
          {label}
        </span>
        {sub != null && (
          <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
            {sub}
          </div>
        )}
      </div>
      {count != null && (
        <span
          style={{
            flex: '0 0 auto',
            width: 26,
            height: 26,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 'var(--body-sm)',
            color: 'var(--muted)',
            background: 'var(--fill-subtle)',
            border: '1px solid var(--hairline)',
            boxShadow: SURFACE_LIFT,
          }}
        >
          {count}
        </span>
      )}
    </header>
  );
}
