import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, deckEditorUrl, type DeckEntry } from '../api';

export function Decks() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['decks'],
    queryFn: api.decks,
  });
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ path: string; kind: 'ok' | 'err'; text: string } | null>(null);

  const publish = useMutation({
    mutationFn: (path: string) => api.publishDeck(path),
    onSuccess: async (res, path) => {
      try {
        await navigator.clipboard.writeText(res.url);
      } catch {
        // clipboard can fail without user gesture - ignore.
      }
      setFlash({ path, kind: 'ok', text: `Published. URL copied.` });
      qc.invalidateQueries({ queryKey: ['decks'] });
    },
    onError: (err: unknown, path) => {
      setFlash({
        path,
        kind: 'err',
        text: err instanceof Error ? err.message : 'publish failed',
      });
    },
    onSettled: () => setBusyPath(null),
  });

  function onPublish(d: DeckEntry) {
    setFlash(null);
    setBusyPath(d.path);
    publish.mutate(d.path);
  }

  function copyUrl(url: string, path: string) {
    navigator.clipboard.writeText(url).then(
      () => setFlash({ path, kind: 'ok', text: 'URL copied.' }),
      () => setFlash({ path, kind: 'err', text: 'Could not copy.' }),
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      <header className="stack" style={{ gap: 4 }}>
        <span className="eyebrow">client decks</span>
        <h1 className="h1">strategy decks</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Edit any client deck in the browser. Save writes back to the vault.
          Publish pushes a clean (non-editable) copy to Cloudflare so you can
          share the live URL with the client.
        </p>
      </header>

      {isLoading && <div className="empty">loading decks…</div>}
      {error && <div className="empty">couldn't load: {(error as Error).message}</div>}

      {!isLoading && !error && (data?.decks ?? []).length === 0 && (
        <div className="empty">
          no decks yet. drop a <code>strategy-deck.html</code> into
          {' '}
          <code>08_Service/clients/&lt;client&gt;/02_strategy/</code>
          {' '}
          and it'll show up here.
        </div>
      )}

      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        {(data?.decks ?? []).map((d) => {
          const editUrl = deckEditorUrl(d.path);
          const isBusy = busyPath === d.path;
          const f = flash && flash.path === d.path ? flash : null;
          return (
            <article
              key={d.path}
              className="section"
              style={{ padding: 'var(--space-4)', display: 'grid', gap: 'var(--space-3)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span className="eyebrow">{d.client_slug}</span>
                  <h3 className="h3" style={{ margin: 0 }}>{d.client}</h3>
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                    {d.filename} · edited {formatRel(d.mtime)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <a
                    className="rep-btn rep-btn--primary"
                    href={editUrl}
                    target="_blank"
                    rel="noopener"
                  >
                    open editor →
                  </a>
                  <button
                    className="rep-btn rep-btn--ghost"
                    type="button"
                    onClick={() => onPublish(d)}
                    disabled={isBusy}
                  >
                    {isBusy ? 'publishing…' : 'publish'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--hairline)',
                  fontSize: 'var(--body-sm)',
                }}
              >
                {d.published_url ? (
                  <>
                    <span className="muted" style={{ minWidth: 100 }}>
                      shareable URL
                    </span>
                    <a
                      href={d.published_url}
                      target="_blank"
                      rel="noopener"
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--ink)',
                      }}
                    >
                      {d.published_url}
                    </a>
                    <button
                      className="rep-btn rep-btn--ghost"
                      type="button"
                      onClick={() => copyUrl(d.published_url!, d.path)}
                      style={{ padding: '4px 10px' }}
                    >
                      copy
                    </button>
                    <span className="muted" style={{ fontSize: 'var(--body-xs)' }}>
                      published {formatRel(d.last_published_at ?? 0)}
                    </span>
                  </>
                ) : (
                  <span className="muted">
                    not published yet. click publish to push the first version
                    to Cloudflare.
                  </span>
                )}
              </div>

              {f && (
                <div
                  style={{
                    fontSize: 'var(--body-sm)',
                    color: f.kind === 'ok' ? 'var(--recovery)' : 'var(--strain)',
                  }}
                >
                  {f.text}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function formatRel(unixSec: number): string {
  if (!unixSec) return 'never';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString();
}
