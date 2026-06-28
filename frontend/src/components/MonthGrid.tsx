/**
 * 4-row × ~31-col grid showing daily post output for the last 4 months.
 * Each row is one month, each cell is one day. Cell brightness reflects
 * how many posts went live that day.
 *
 * Mirrors the YearGrid pattern (one row per year of weeks) but oriented
 * toward Instagram's higher cadence - tracking per-day matters more than
 * per-week.
 */

interface DayCount {
  day: number; // 1-31
  count: number;
}

interface MonthData {
  year: number;
  month: number; // 1-12
  label: string; // 'jun', 'may', etc.
  days_in_month: number;
  days: DayCount[];
}

interface MonthGridProps {
  months: MonthData[]; // newest first; the renderer reverses to oldest-on-top
  targetPerWeek?: number;
  onEditTarget?: () => void;
  // When false, hides the internal "X reels posted / target" summary row (the IG
  // content-output box renders that itself as a section heading). Default true.
  showSummary?: boolean;
}

function targetLabel(perWeek: number): string {
  if (perWeek === 1) return 'target: 1 per week';
  if (perWeek === 7) return 'target: daily';
  return `target: ${perWeek} per week`;
}

export function MonthGrid({ months, targetPerWeek = 3, onEditTarget, showSummary = true }: MonthGridProps) {
  // Bottom row should be the current month, oldest on top - mirrors how
  // a calendar reads (most recent activity closest to the eye).
  const rows = [...months].reverse();
  const totalPosts = months.reduce(
    (acc, m) => acc + m.days.reduce((s, d) => s + d.count, 0),
    0,
  );

  // Posted = solid accent green, matches YearGrid (YouTube tracker). No
  // count-based opacity tiering - single posted day reads the same as a
  // stacked day, which is consistent with how YearGrid renders weeks.
  function bgFor(count: number): string {
    if (count === 0) return 'var(--fill-subtle-2)';
    return 'var(--accent)';
  }

  // Pad day rows up to 31 so the grid is uniform.
  const PAD_TO = 31;

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {showSummary && (
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          {totalPosts} {totalPosts === 1 ? 'reel' : 'reels'} posted in the last 4 months
        </span>
        {onEditTarget ? (
          <button
            type="button"
            onClick={onEditTarget}
            className="btn btn--ghost"
            style={{ fontSize: 'var(--body-sm)', padding: '4px 10px', color: 'var(--muted)' }}
            title="click to change target"
          >
            {targetLabel(targetPerWeek)} <span style={{ opacity: 0.5, marginLeft: 4 }}>edit</span>
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {targetLabel(targetPerWeek)}
          </span>
        )}
      </div>
      )}

      <div className="stack" style={{ gap: 4 }}>
        {rows.map((m) => {
          const dayMap = new Map(m.days.map((d) => [d.day, d.count]));
          return (
            <div
              key={`${m.year}-${m.month}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px repeat(31, minmax(0, 1fr))',
                gap: 3,
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--muted)',
                  fontWeight: 600,
                  textAlign: 'right',
                  paddingRight: 4,
                }}
              >
                {m.label}
              </span>
              {Array.from({ length: PAD_TO }, (_, i) => {
                const day = i + 1;
                const inThisMonth = day <= m.days_in_month;
                const count = dayMap.get(day) ?? 0;
                if (!inThisMonth) {
                  return (
                    <div
                      key={day}
                      style={{
                        aspectRatio: '1',
                        background: 'transparent',
                        borderRadius: 2,
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={day}
                    title={`${m.label} ${day}${count ? `, ${count} posted` : ''}`}
                    style={{
                      aspectRatio: '1',
                      background: bgFor(count),
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px repeat(31, minmax(0, 1fr))',
          gap: 3,
          marginTop: 2,
        }}
      >
        <span />
        {Array.from({ length: PAD_TO }, (_, i) => {
          // Only label every 5th day so it stays readable.
          const day = i + 1;
          const show = day === 1 || day % 5 === 0;
          return (
            <span
              key={day}
              style={{
                fontSize: 9,
                color: 'var(--muted)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
                opacity: show ? 1 : 0,
              }}
            >
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}
