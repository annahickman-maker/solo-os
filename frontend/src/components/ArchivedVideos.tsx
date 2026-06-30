import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Video } from '../api';

/**
 * Recover a video that left the active queue - either because it got archived,
 * or because it got marked "posted"/published by mistake and vanished into the
 * published pile. Two toggles:
 *   - archived: restore it (flip archived off).
 *   - posted by mistake: a video marked published but with NO YouTube id (so it
 *     was never actually uploaded - an accidental click). Move it back to drafts.
 * Genuinely-published videos (synced from YouTube, they have an id) are left
 * alone so this list stays short and only shows recoverable mistakes.
 */
export function ArchivedVideos() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'archived' | 'posted'>('archived');

  const { data: archivedData } = useQuery({ queryKey: ['archived-videos'], queryFn: api.archivedVideos });
  const { data: pipe } = useQuery({ queryKey: ['pipeline', false], queryFn: () => api.pipeline(false) });

  const archived = archivedData?.items ?? [];
  const postedByMistake = ((pipe?.videos ?? []) as Video[]).filter(
    (v) => v.status === 'published' && !v.youtube_url,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['archived-videos'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
  };
  const restore = useMutation({ mutationFn: (id: string) => api.updateVideo(id, { archived: false }), onSuccess: invalidate });
  const toDrafts = useMutation({ mutationFn: (id: string) => api.updateVideo(id, { status: 'scripted', queued: true }), onSuccess: invalidate });

  if (archived.length === 0 && postedByMistake.length === 0) return null;

  const list = view === 'archived' ? archived : postedByMistake;

  return (
    <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-4)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 'var(--body-sm)', fontWeight: 600, padding: 0 }}
      >
        <span style={{ fontSize: 11 }}>{open ? '▾' : '▸'}</span> archive ({archived.length + postedByMistake.length})
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <TogglePill label={`archived (${archived.length})`} active={view === 'archived'} onClick={() => setView('archived')} />
            <TogglePill label={`published (${postedByMistake.length})`} active={view === 'posted'} onClick={() => setView('posted')} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.length === 0 ? (
              <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>nothing here.</span>
            ) : (
              list.map((v) => (
                <div
                  key={v.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', background: 'var(--surface)' }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--body-sm)' }}>{v.title || v.id}</span>
                  <span className="muted" style={{ fontSize: 'var(--eyebrow)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: '0 0 auto' }}>{v.status}</span>
                  {view === 'archived' ? (
                    <RecoverBtn label="restore" onClick={() => restore.mutate(v.id)} busy={restore.isPending} />
                  ) : (
                    <RecoverBtn label="move to drafts" onClick={() => toDrafts.mutate(v.id)} busy={toDrafts.isPending} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TogglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '5px 12px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--body-sm)',
        fontWeight: 600,
        cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
        background: active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface)',
        color: active ? 'var(--ink)' : 'var(--muted)',
      }}
    >
      {label}
    </button>
  );
}

function RecoverBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{ flex: '0 0 auto', padding: '6px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--body-sm)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {label}
    </button>
  );
}
