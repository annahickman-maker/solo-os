import type { ReactNode } from 'react';

interface BigNumberProps {
  value: string | number;
  label: string;
  delta?: string;
  unit?: string;
  tone?: 'default' | 'accent';
  trailing?: ReactNode;
}

export function BigNumber({
  value,
  label,
  delta,
  unit,
  tone = 'default',
  trailing,
}: BigNumberProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <span className="eyebrow">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'clamp(3rem, 6vw, 4.5rem)',
            letterSpacing: '-0.02em',
            lineHeight: 0.95,
            color: tone === 'accent' ? 'var(--accent)' : 'var(--ink)',
            fontVariationSettings: "'opsz' 144",
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.25rem',
              color: 'var(--muted)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {(delta || trailing) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
          }}
        >
          {delta && (
            <span
              style={{
                fontSize: 'var(--body-sm)',
                color: 'var(--muted)',
                fontWeight: 500,
              }}
            >
              {delta}
            </span>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
}
