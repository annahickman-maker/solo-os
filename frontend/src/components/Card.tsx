import type { ReactNode, CSSProperties } from 'react';

interface CardProps {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
  bordered?: boolean;
  padded?: boolean;
  tone?: 'surface' | 'surface-2';
  children: ReactNode;
  style?: CSSProperties;
}

export function Card({
  eyebrow,
  title,
  action,
  bordered = false,
  padded = true,
  tone = 'surface',
  children,
  style,
}: CardProps) {
  return (
    <section
      className="card"
      style={{
        background:
          tone === 'surface-2' ? 'var(--surface-2)' : 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        padding: padded ? 'var(--space-5)' : 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        // Only force a border inline when explicitly requested. Otherwise leave
        // it to the .card rule so light mode can add the floating border/shadow.
        ...(bordered ? { border: '1px solid var(--hairline)' } : {}),
        ...style,
      }}
    >
      {(eyebrow || title || action) && (
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h3 className="h3">{title}</h3>}
          </div>
          {action && <div>{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
