interface WeeklyBarsProps {
  data: number[];
  labels?: string[];
  target?: number;
  height?: number;
}

const DEFAULT_LABELS = ['m', 't', 'w', 't', 'f', 's', 's'];

export function WeeklyBars({
  data,
  labels = DEFAULT_LABELS,
  target = 1,
  height = 96,
}: WeeklyBarsProps) {
  const safe = data.length === 7 ? data : Array.from({ length: 7 }, (_, i) => data[i] ?? 0);
  const max = Math.max(target, ...safe, 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          alignItems: 'end',
          gap: 'var(--space-2)',
          height,
        }}
      >
        {safe.map((v, i) => {
          const ratio = Math.max(0.06, v / max);
          const hit = v >= target;
          return (
            <div
              key={i}
              style={{
                height: `${ratio * 100}%`,
                background: hit ? 'var(--accent)' : 'rgba(255,255,255,0.18)',
                borderRadius: 'var(--radius-sm)',
                transition: 'height 600ms var(--ease-out)',
              }}
              aria-label={`${labels[i]}: ${v}`}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 'var(--space-2)',
        }}
      >
        {labels.map((l, i) => (
          <span
            key={i}
            style={{
              textAlign: 'center',
              fontSize: '0.6875rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
