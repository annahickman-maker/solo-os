import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Win } from '../api';
import { Card } from '../components/Card';
import { BigNumber } from '../components/BigNumber';
import { Sparkline } from '../components/Sparkline';
import { formatCurrency, formatNumber, formatShortDate, formatRelative } from '../lib/format';

export function Metrics() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['metrics'],
    queryFn: api.metrics,
  });
  const { data: stripe } = useQuery({
    queryKey: ['stripe-status'],
    queryFn: api.stripeStatus,
  });
  const stripeSync = useMutation({
    mutationFn: () => api.stripeSync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stripe-status'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
    },
  });

  if (error) {
    return <div className="empty">couldn't load metrics: {(error as Error).message}</div>;
  }

  const combinedMRR = (data?.ss_mrr ?? 0) + (data?.gumroad_mrr ?? 0);

  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      <header className="page-header">
        <span className="eyebrow">metrics</span>
        <h1 className="h2">how the business is moving</h1>
      </header>

      {isLoading ? (
        <div className="empty">loading</div>
      ) : (
        <>
          <div className="grid grid--2">
            <Card>
              <BigNumber
                value={formatNumber(data?.total_audience ?? data?.yt_subs ?? 0)}
                label="total audience"
                trailing={<Sparkline data={data?.trend.subs ?? []} />}
              />
            </Card>
            <Card>
              <BigNumber
                value={formatCurrency(data?.lifetime_income ?? 0)}
                label="total lifetime income"
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  marginTop: 'var(--space-3)',
                  paddingTop: 'var(--space-3)',
                  borderTop: '1px solid var(--hairline)',
                  flexWrap: 'wrap',
                }}
              >
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  {stripe?.configured === false
                    ? 'stripe not configured'
                    : stripe?.last_sync_at
                    ? `synced ${formatRelative(stripe.last_sync_at)} · ${stripe.charge_count ?? 0} charges`
                    : 'never synced'}
                </span>
                {stripe?.configured !== false && (
                  <button
                    type="button"
                    onClick={() => stripeSync.mutate()}
                    disabled={stripeSync.isPending}
                    className="btn"
                    style={{ fontSize: 'var(--body-sm)' }}
                  >
                    {stripeSync.isPending ? 'syncing stripe' : 'sync from stripe'}
                  </button>
                )}
              </div>
            </Card>
          </div>

          <Card eyebrow="business wins" title="proof points">
            <div className="stack">
              <ProofRow
                label="total audience across platforms"
                value={formatNumber(data?.total_audience ?? data?.yt_subs ?? 0)}
                source="youtube + tiktok"
              />
              <ProofRow
                label="total lifetime income"
                value={formatCurrency(data?.lifetime_income ?? 0)}
                source="gumroad + ss combined"
              />
              <ProofRow
                label="monthly recurring revenue"
                value={formatCurrency(combinedMRR)}
                source="ss + gumroad"
              />
              <ProofRow
                label="total digital product sales"
                value={formatNumber(data?.total_gumroad_sales ?? 0)}
                source="gumroad lifetime"
              />
              {(data?.wins ?? []).map((w) => {
                const numericMatch = w.title.match(/^([0-9][0-9,]*)\+?\s+(.*)$/);
                if (numericMatch) {
                  return (
                    <ProofRow
                      key={w.id}
                      label={numericMatch[2]!}
                      value={`${numericMatch[1]!}+`}
                      source={w.source}
                    />
                  );
                }
                return (
                  <ProofRow
                    key={w.id}
                    label={w.title}
                    value={formatShortDate(w.date)}
                    source={w.source}
                    valueAsDate
                  />
                );
              })}
            </div>
          </Card>

          {(data?.student_wins ?? []).length > 0 && (
            <Card eyebrow="student wins" title="results from people in the programme">
              <WinList wins={data?.student_wins ?? []} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ProofRow({
  label,
  value,
  source,
  valueAsDate,
}: {
  label: string;
  value: string;
  source?: string;
  valueAsDate?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
        alignItems: 'baseline',
      }}
    >
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ wordBreak: 'break-word' }}>{label}</span>
        {source && (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {source}
          </span>
        )}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: valueAsDate ? 400 : 700,
          fontSize: valueAsDate ? 'var(--body-sm)' : '1.5rem',
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          color: valueAsDate ? 'var(--muted)' : 'var(--ink)',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function WinList({ wins }: { wins: Win[] }) {
  return (
    <div className="stack">
      {wins.map((w) => (
        <div
          key={w.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--hairline)',
            alignItems: 'flex-start',
          }}
        >
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ wordBreak: 'break-word' }}>{w.title}</span>
            {w.source && (
              <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                {w.source}
              </span>
            )}
          </div>
          <span
            className="muted"
            style={{ fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
          >
            {formatShortDate(w.date)}
          </span>
        </div>
      ))}
    </div>
  );
}
