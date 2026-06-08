interface StatusPillProps {
  status: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
}

const TONE: Record<NonNullable<StatusPillProps['tone']>, { bg: string; color: string }> = {
  default: { bg: 'rgba(255,255,255,0.06)', color: 'var(--muted)' },
  success: { bg: 'rgba(22,224,161,0.14)', color: 'var(--success)' },
  warning: { bg: 'rgba(255,214,10,0.14)', color: 'var(--warning)' },
  danger: { bg: 'rgba(255,77,77,0.16)', color: 'var(--danger)' },
  accent: { bg: 'rgba(22,224,161,0.14)', color: 'var(--accent)' },
};

export function StatusPill({ status, tone = 'default' }: StatusPillProps) {
  const t = TONE[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: t.bg,
        color: t.color,
        fontSize: '0.6875rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}
