import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export function Skills() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['skills'],
    queryFn: api.skills,
  });

  const CATEGORY_COLOR: Record<string, string> = {
    Onboarding: 'var(--recovery)',
    YouTube: 'var(--strain)',
    Instagram: 'var(--sleep)',
    Copywriting: '#E6A52F',
    Design: 'var(--recovery)',
    Workflows: 'var(--sleep)',
    Other: 'var(--muted)',
  };
  const grouped = useMemo(() => {
    const items = (data?.items ?? []).filter((s) =>
      !filter ||
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      (s.summary ?? '').toLowerCase().includes(filter.toLowerCase()) ||
      (s.trigger_summary ?? '').toLowerCase().includes(filter.toLowerCase())
    );
    const byCat = new Map<string, typeof items>();
    for (const s of items) {
      const arr = byCat.get(s.category) ?? [];
      arr.push(s);
      byCat.set(s.category, arr);
    }
    const order = ['Onboarding', 'YouTube', 'Instagram', 'Copywriting', 'Design', 'Workflows', 'Other'];
    return order
      .filter((k) => byCat.has(k))
      .map((k) => [k, byCat.get(k)!] as [string, typeof items]);
  }, [data, filter]);

  if (error) return <div className="empty">couldn't load skills: {(error as Error).message}</div>;

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <header className="page-header">
        <span className="eyebrow">skills</span>
        <h1 className="h2">what your vault knows how to do</h1>
      </header>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter skills..."
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--ink)',
          padding: '10px 14px',
          fontSize: 'var(--body)',
          outline: 'none',
          alignSelf: 'flex-start',
          minWidth: 300,
        }}
      />

      {isLoading ? (
        <div className="empty">loading</div>
      ) : (
        grouped.map(([cat, items]) => (
          <section key={cat} className="stack" style={{ gap: 'var(--space-4)' }}>
            <header
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingBottom: 'var(--space-3)',
                borderBottom: `1px solid ${CATEGORY_COLOR[cat] ?? 'var(--hairline)'}30`,
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: CATEGORY_COLOR[cat] ?? 'var(--muted)' }}>{cat.toLowerCase()}</span>
                <h3 className="h3" style={{ marginTop: 4 }}>{items.length} skill{items.length === 1 ? '' : 's'}</h3>
              </div>
            </header>
            <div className="stack">
              {items.map((s) => (
                <SkillRow key={s.id} id={s.id} name={s.name} summary={s.summary || s.trigger_summary} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function SkillRow({ id, name, summary, open, onToggle }: { id: string; name: string; summary: string; open: boolean; onToggle: () => void }) {
  const { data: full } = useQuery({
    queryKey: ['skill', id],
    queryFn: () => api.getSkill(id),
    enabled: open,
  });

  return (
    <div style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--hairline)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 'var(--body-lg)', fontWeight: 500 }}>/{name}</span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.5 }}>
          {summary}
        </span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            fontSize: 'var(--body-sm)',
            lineHeight: 1.55,
            maxHeight: 500,
            overflowY: 'auto',
          }}
        >
          {full ? full.full_md : 'loading...'}
        </div>
      )}
    </div>
  );
}
