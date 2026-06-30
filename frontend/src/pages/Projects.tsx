import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PipelineResponse } from '../api';
import { StatusPill } from '../components/StatusPill';
import { ModuleDetail } from '../components/ModuleDetail';
import { SectionHeading } from '../components/SectionHeading';
import { PageTabs } from '../components/PageTabs';
import { createButtonStyle, SURFACE_LIFT } from '../lib/ui';

export function Projects() {
  const qc = useQueryClient();
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  // True only for an item we just created via "+ add", so the detail panel
  // focuses + selects the placeholder name on open.
  const [justCreated, setJustCreated] = useState(false);
  const [tab, setTab] = useState<'projects' | 'clients'>('projects');
  const { data, isLoading, error } = useQuery<PipelineResponse>({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline(),
  });

  // Add project / client: create a blank one with a unique placeholder name and
  // open it straight in the detail panel - no name prompt. The user renames and
  // fills everything in the panel. The unique-name pass avoids the create route
  // overwriting (projects) or 409-ing (clients) on a repeated default name.
  const createItem = useMutation({
    mutationFn: (kind: 'project' | 'client') => {
      const base = kind === 'project' ? 'New project' : 'New client';
      const existing = kind === 'project' ? data?.ss_modules ?? [] : data?.clients ?? [];
      const taken = new Set(existing.map((m) => m.name));
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
      return api.createSSModule({ name, kind });
    },
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      setJustCreated(true);
      setOpenModuleId(m.id);
    },
  });

  if (error) {
    return <div className="empty">couldn't load: {(error as Error).message}</div>;
  }

  const modules = data?.ss_modules ?? [];
  const clients = data?.clients ?? [];

  const items = tab === 'projects' ? modules : clients;
  const tone = tab === 'projects' ? 'accent' : 'default';

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      {/* Projects / Clients file-folder page-tabs with the contextual + add
          button on the right. No page title - the tabs are the header. */}
      <PageTabs
        value={tab}
        onChange={(v) => setTab(v as 'projects' | 'clients')}
        ariaLabel="projects or clients"
        options={[
          { value: 'projects', label: 'projects', count: modules.length },
          { value: 'clients', label: 'clients', count: clients.length },
        ]}
        rightActions={
          <button
            type="button"
            onClick={() => createItem.mutate(tab === 'projects' ? 'project' : 'client')}
            disabled={createItem.isPending}
            style={{ ...createButtonStyle, ...(createItem.isPending ? { opacity: 0.6, cursor: 'wait' } : {}) }}
          >
            {createItem.isPending ? 'adding' : `+ add ${tab === 'projects' ? 'project' : 'client'}`}
          </button>
        }
      />

      <section className="section" style={{ marginTop: 0 }}>
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <SectionHeading
            label={tab === 'projects' ? 'the offer' : 'active engagements'}
            count={items.length}
          />
        </div>
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
                onClick={() => { setJustCreated(false); setOpenModuleId(m.id); }}
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
                  boxShadow: SURFACE_LIFT,
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

      <ModuleDetail
        moduleId={openModuleId}
        autofocusName={justCreated}
        onClose={() => { setOpenModuleId(null); setJustCreated(false); }}
      />
    </div>
  );
}
