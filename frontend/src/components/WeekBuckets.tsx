import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { ThisWeekTask } from '../api';
import { Card } from './Card';

// Four energy buckets - tasks for this week pulled from the
// "## This Week" / weekday headings in master-todo.md.
// Pinned tasks appear in a strip at the top. Tap any task to pin it
// to TODAY (or unpin if already pinned).

const BUCKET_META: Array<{
  key: 'filming' | 'scripting' | 'building' | 'admin';
  label: string;
  color: string;
}> = [
  { key: 'filming',   label: 'filming',   color: 'var(--strain)' },
  { key: 'scripting', label: 'scripting', color: '#A87BD9' },
  { key: 'building',  label: 'building',  color: 'var(--recovery)' },
  { key: 'admin',     label: 'admin',     color: '#E6A52F' },
];

export function WeekBuckets() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['this-week'],
    queryFn: api.thisWeek,
    refetchInterval: 60000,
  });

  const togglePin = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) => api.setPinned(vars.id, vars.pinned),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['this-week'] });
      const prev = qc.getQueryData<typeof data>(['this-week']);
      if (prev) {
        // Optimistic: flip the pinned flag in place
        const flip = (t: ThisWeekTask): ThisWeekTask =>
          t.id === vars.id ? { ...t, pinned_today: vars.pinned ? Math.floor(Date.now() / 1000) : null } : t;
        const buckets = {
          filming: prev.buckets.filming.map(flip),
          scripting: prev.buckets.scripting.map(flip),
          building: prev.buckets.building.map(flip),
          admin: prev.buckets.admin.map(flip),
        };
        const allFlipped = [...buckets.filming, ...buckets.scripting, ...buckets.building, ...buckets.admin];
        const pinned = allFlipped.filter((t) => t.pinned_today);
        qc.setQueryData(['this-week'], { ...prev, pinned, buckets });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['this-week'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['this-week'] }),
  });

  if (isLoading || !data) {
    return <div className="empty">loading this week</div>;
  }
  if (data.total === 0) {
    return (
      <div className="empty">
        no tasks marked "this week" in master-todo.md.<br />
        add tasks under a "## This Week" or weekday heading and re-sync.
      </div>
    );
  }

  const pinnedIds = new Set(data.pinned.map((t) => t.id));

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      {/* Pinned today strip */}
      <Card eyebrow="pinned to today" title={`${data.pinned.length} ${data.pinned.length === 1 ? 'task' : 'tasks'} you're focusing on`}>
        {data.pinned.length === 0 ? (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            tap any task below to pin it here. tap again to unpin. resets at midnight.
          </span>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {data.pinned.map((t) => {
              const meta = BUCKET_META.find((b) => b.key === t.category) ?? BUCKET_META[3];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => togglePin.mutate({ id: t.id, pinned: false })}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: meta.color,
                    color: 'var(--bg)',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--body-sm)',
                    fontWeight: 600,
                    cursor: 'pointer',
                    maxWidth: '100%',
                  }}
                  title="unpin"
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </span>
                  <span style={{ opacity: 0.6, fontSize: 14 }}>×</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* 4 buckets */}
      <Card eyebrow="this week" title="pick from your energy buckets">
        <div className="week-buckets">
          {BUCKET_META.map((meta) => {
            const tasks = data.buckets[meta.key] ?? [];
            return (
              <div key={meta.key} className="week-buckets__col">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    paddingBottom: 'var(--space-2)',
                    borderBottom: `2px solid ${meta.color}`,
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: meta.color,
                    }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="muted"
                    style={{ fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {tasks.length}
                  </span>
                </div>
                {tasks.length === 0 ? (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                    nothing yet
                  </span>
                ) : (
                  <div className="stack" style={{ gap: 'var(--space-1)' }}>
                    {tasks.map((t) => {
                      const isPinned = pinnedIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => togglePin.mutate({ id: t.id, pinned: !isPinned })}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 'var(--space-2)',
                            padding: 'var(--space-2) var(--space-3)',
                            background: isPinned ? `${meta.color}` : 'transparent',
                            color: isPinned ? 'var(--bg)' : 'var(--ink)',
                            border: `1px solid ${isPinned ? meta.color : 'var(--hairline)'}`,
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: 'var(--body-sm)',
                            lineHeight: 1.35,
                            transition: 'background var(--duration-fast) var(--ease-out)',
                          }}
                        >
                          <span style={{ fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                            {isPinned ? '★' : '☆'}
                          </span>
                          <span>{t.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
