import { type Video } from '../api';
import { useSkillRun } from './SkillRunProvider';
import { PlayIcon } from '../lib/skillVisuals';
import { solidButtonStyle, SURFACE_LIFT } from '../lib/ui';

/**
 * YouTubeAnalytics - the analytics block between the content pipeline and the
 * published archive on the Content (YouTube) page. It shows your top content per
 * monitored metric (CTR / sub rate / conversion), computed from the imported
 * per-video metrics.
 *
 * "Run analysis" opens the youtube-analytics skill's "set up this skill" step
 * (AnalyticsSetupPanel) - that's where the Studio CSV gets imported and where
 * the export instructions live - then runs the skill. So importing happens there,
 * not with a separate button here.
 */
const ANALYTICS_SKILL = 'skill-solopreneur-os-youtube-analytics';

interface MetricDef {
  key: 'ctr_pct' | 'sub_rate_pct' | 'conversion_pct';
  label: string;
  color: string;
  low: number;
  high: number;
  blurb: string;
  emptyHint: string;
}

// Mirrors the benchmarks the youtube-analytics skill measures against.
const METRICS: MetricDef[] = [
  {
    key: 'ctr_pct',
    label: 'click-through rate',
    color: 'var(--strain)',
    low: 3,
    high: 5,
    blurb: 'how often the thumbnail + title earn the click',
    emptyHint: 'run analysis to import your Studio CSV and see CTR',
  },
  {
    key: 'sub_rate_pct',
    label: 'subscriber rate',
    color: 'var(--sleep)',
    low: 0.5,
    high: 1,
    blurb: 'how many viewers a video turns into subscribers',
    emptyHint: 'run analysis to import your Studio CSV and see sub rate',
  },
  {
    key: 'conversion_pct',
    label: 'conversion',
    color: 'var(--recovery)',
    low: 0.5,
    high: 1,
    blurb: 'how many viewers take the next step toward the offer',
    emptyHint: 'set up /go/ tracking links to see conversion',
  },
];

function valColor(v: number | null | undefined, low: number, high: number): string {
  if (v == null) return 'var(--muted-2)';
  if (v < low) return 'var(--danger)';
  if (v > high) return 'var(--recovery)';
  return 'var(--strain)';
}

function fmtPct(v: number | null | undefined): string {
  return v == null ? '-' : `${v.toFixed(v < 10 ? 2 : 1)}%`;
}

export function YouTubeAnalytics({ published }: { published: Video[] }) {
  const { runSkill } = useSkillRun();
  const hasAnyMetric = METRICS.some((m) => published.some((v) => typeof v[m.key] === 'number'));

  return (
    <section className="section" style={{ marginTop: 'var(--space-7)' }}>
      {/* Heading + run */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-5)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">analytics</span>
          <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
            your top content by the metrics you track
          </div>
        </div>
        <button type="button" onClick={() => runSkill(ANALYTICS_SKILL)} style={solidButtonStyle}>
          <PlayIcon /> run analysis
        </button>
      </div>

      {!hasAnyMetric ? (
        <div
          className="empty"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: SURFACE_LIFT,
          }}
        >
          no analytics yet. hit &ldquo;run analysis&rdquo; to import your YouTube Studio export and see your top content by CTR, sub rate, and conversion.
        </div>
      ) : (
        <div className="ytan-grid">
          {METRICS.map((m) => {
            const ranked = published
              .filter((v) => typeof v[m.key] === 'number')
              .sort((a, b) => (b[m.key] as number) - (a[m.key] as number));
            const avg = ranked.length
              ? ranked.reduce((s, v) => s + (v[m.key] as number), 0) / ranked.length
              : null;
            const top = ranked.slice(0, 3);
            return (
              <div key={m.key} className="ytan-card">
                <header className="ytan-card__head">
                  <span className="eyebrow" style={{ color: m.color }}>{m.label}</span>
                  <span className="ytan-card__avg" style={{ color: valColor(avg, m.low, m.high) }}>
                    {fmtPct(avg)}
                    <span className="ytan-card__avg-label"> avg</span>
                  </span>
                </header>
                <p className="ytan-card__blurb">{m.blurb}</p>
                {top.length === 0 ? (
                  <p className="ytan-card__empty">{m.emptyHint}</p>
                ) : (
                  <ol className="ytan-card__list">
                    {top.map((v, i) => (
                      <li key={v.id} className="ytan-card__row">
                        <span className="ytan-card__rank">{i + 1}</span>
                        <span className="ytan-card__title" title={v.title}>{v.title}</span>
                        <span className="ytan-card__val" style={{ color: valColor(v[m.key], m.low, m.high) }}>
                          {fmtPct(v[m.key])}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .ytan-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--space-4);
        }
        @media (max-width: 900px) { .ytan-grid { grid-template-columns: 1fr; } }
        .ytan-card {
          background: var(--surface);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          box-shadow: ${SURFACE_LIFT};
          padding: var(--space-5);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }
        .ytan-card__head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-3);
        }
        .ytan-card__avg {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.5rem;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          line-height: 1;
          white-space: nowrap;
        }
        .ytan-card__avg-label { font-size: 0.5em; color: var(--muted-2); letter-spacing: 0.04em; font-weight: 600; }
        .ytan-card__blurb { margin: 0; font-size: var(--body-sm); color: var(--muted); line-height: 1.45; }
        .ytan-card__empty { margin: var(--space-2) 0 0; font-size: var(--body-sm); color: var(--muted-2); font-style: italic; }
        .ytan-card__list { list-style: none; margin: var(--space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
        .ytan-card__row { display: flex; align-items: center; gap: var(--space-3); }
        .ytan-card__rank {
          flex: 0 0 auto; width: 18px; height: 18px; border-radius: 50%;
          display: grid; place-items: center;
          font-size: 10px; font-weight: 700; color: var(--muted);
          background: var(--fill-subtle); border: 1px solid var(--hairline);
        }
        .ytan-card__title {
          flex: 1; min-width: 0;
          font-size: var(--body-sm); line-height: 1.3;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .ytan-card__val {
          flex: 0 0 auto;
          font-size: var(--body-sm); font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </section>
  );
}
