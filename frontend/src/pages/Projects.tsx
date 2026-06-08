import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PipelineResponse } from '../api';
import { StatusPill } from '../components/StatusPill';
import { ModuleDetail } from '../components/ModuleDetail';

export function Projects() {
  const qc = useQueryClient();
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [tab, setTab] = useState<'projects' | 'clients'>('projects');
  const { data, isLoading, error } = useQuery<PipelineResponse>({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline(),
  });

  const createItem = useMutation({
    mutationFn: (kind: 'project' | 'client') => {
      const name = window.prompt(`new ${kind} name:`);
      if (!name || !name.trim()) return Promise.reject(new Error('cancelled'));
      return api.createSSModule({ name: name.trim(), kind });
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      setOpenModuleId(m.id);
    },
  });

  if (error) {
    return <div className="empty">couldn't load: {(error as Error).message}</div>;
  }

  const modules = data?.ss_modules ?? [];
  const clients = data?.clients ?? [];

  const items = tab === 'projects' ? modules : clients;
  const heading =
    tab === 'projects' ? `${modules.length} in build` : `${clients.length} client${clients.length === 1 ? '' : 's'}`;
  const tone = tab === 'projects' ? 'accent' : 'default';

  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      <header className="page-header">
        <span className="eyebrow">projects</span>
        <h1 className="h2">projects + clients</h1>
      </header>

      <div
        style={{
          display: 'inline-flex',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-pill)',
          padding: 4,
          alignSelf: 'flex-start',
        }}
      >
        {(['projects', 'clients'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: 'none',
              padding: '8px 20px',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              background: tab === t ? 'var(--ink)' : 'transparent',
              color: tab === t ? 'var(--bg)' : 'var(--muted)',
              fontSize: 'var(--body-sm)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
          >
            {t}
            <span style={{ marginLeft: 8, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
              {t === 'projects' ? modules.length : clients.length}
            </span>
          </button>
        ))}
      </div>

      <section className="section" style={{ marginTop: 0 }}>
        <header className="section__header">
          <div className="section__title">
            <span className="eyebrow">{tab === 'projects' ? 'projects' : 'active engagements'}</span>
            <h3 className="h3">{heading}</h3>
          </div>
          <button
            type="button"
            onClick={() => createItem.mutate(tab === 'projects' ? 'project' : 'client')}
            disabled={createItem.isPending}
            className="btn btn--primary"
          >
            {createItem.isPending ? 'adding' : `+ add ${tab === 'projects' ? 'project' : 'client'}`}
          </button>
        </header>
        {isLoading ? (
          <div className="empty">loading</div>
        ) : items.length === 0 ? (
          <div className="empty">nothing here yet</div>
        ) : (
          <div className="grid grid--2">
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOpenModuleId(m.id)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  alignItems: 'stretch',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'border-color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'; }}
              >
                <div className="row row--between">
                  <span className="eyebrow">{m.status.replace('_', ' ')}</span>
                  <StatusPill
                    status={`${m.progress_pct ?? 0}%`}
                    tone={
                      m.status === 'live'
                        ? 'success'
                        : m.status === 'in_progress'
                        ? tone
                        : 'default'
                    }
                  />
                </div>
                <h3 className="h3" style={{ margin: 0 }}>{m.name}</h3>
                {m.description && <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>{m.description}</p>}
              </button>
            ))}
          </div>
        )}
      </section>

      <ModuleDetail moduleId={openModuleId} onClose={() => setOpenModuleId(null)} />
    </div>
  );
}
