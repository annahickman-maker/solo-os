interface YearGridProps {
  data: (number | null)[];
  targetPerWeeks?: number;
  onEditTarget?: () => void;
}

function targetLabel(weeks: number): string {
  if (weeks <= 1) return 'target: 1 per week';
  if (weeks === 2) return 'target: 1 every 2 weeks';
  return `target: 1 every ${weeks} weeks`;
}

const MONTH_TICKS = [
  { label: 'jan', week: 0 },
  { label: 'feb', week: 4 },
  { label: 'mar', week: 9 },
  { label: 'apr', week: 13 },
  { label: 'may', week: 17 },
  { label: 'jun', week: 22 },
  { label: 'jul', week: 26 },
  { label: 'aug', week: 30 },
  { label: 'sep', week: 35 },
  { label: 'oct', week: 39 },
  { label: 'nov', week: 43 },
  { label: 'dec', week: 47 },
];

export function YearGrid({ data, targetPerWeeks = 1, onEditTarget }: YearGridProps) {
  const weeks = Array.from({ length: 52 }, (_, i) => data[i] ?? null);
  const published = weeks.filter((v) => typeof v === 'number' && v > 0).length;

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          {published} {published === 1 ? 'week' : 'weeks'} you posted this year
        </span>
        {onEditTarget ? (
          <button
            type="button"
            onClick={onEditTarget}
            className="btn btn--ghost"
            style={{
              fontSize: 'var(--body-sm)',
              padding: '4px 10px',
              color: 'var(--muted)',
            }}
            title="click to change target"
          >
            {targetLabel(targetPerWeeks)} <span style={{ opacity: 0.5, marginLeft: 4 }}>edit</span>
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {targetLabel(targetPerWeeks)}
          </span>
        )}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(52, minmax(0, 1fr))',
          gap: 3,
        }}
      >
        {weeks.map((value, i) => {
          const isFuture = value === null;
          const posted = typeof value === 'number' && value > 0;
          let bg = 'rgba(255,255,255,0.06)';
          if (posted) bg = 'var(--accent)';
          else if (isFuture) bg = 'rgba(255,255,255,0.03)';
          return (
            <div
              key={i}
              title={`week ${i + 1}${posted ? `, ${value} published` : ''}`}
              style={{
                aspectRatio: '1',
                background: bg,
                borderRadius: 2,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(52, minmax(0, 1fr))',
          gap: 3,
          marginTop: 2,
        }}
      >
        {Array.from({ length: 52 }, (_, i) => {
          const tick = MONTH_TICKS.find((t) => t.week === i);
          return (
            <span
              key={i}
              style={{
                fontSize: 9,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
              }}
            >
              {tick?.label ?? ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
