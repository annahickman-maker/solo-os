import { useMutation, useQuery } from '@tanstack/react-query';
import { api, clearStoredPassword } from '../api';
import { Card } from '../components/Card';
import { formatRelative } from '../lib/format';

export function Settings() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['sync-log'],
    queryFn: api.syncLog,
    retry: false,
  });

  const triggerSync = useMutation({ mutationFn: api.triggerSync });

  const logOut = () => {
    clearStoredPassword();
    window.location.reload();
  };

  const changePassword = () => {
    clearStoredPassword();
    window.location.reload();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <header className="page-header">
        <span className="eyebrow">settings</span>
        <h1 className="h2">house keeping</h1>
      </header>

      <Card eyebrow="auth" title="password">
        <p className="muted" style={{ margin: 0 }}>
          this clears the cached password and reloads the gate
        </p>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button className="btn" onClick={changePassword}>
            change password
          </button>
          <button className="btn btn--ghost" onClick={logOut}>
            log out
          </button>
        </div>
      </Card>

      <Card eyebrow="sync" title="pull from the vault">
        <p className="muted" style={{ margin: 0 }}>
          trigger an immediate sync run
        </p>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button
            className="btn"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
          >
            {triggerSync.isPending ? 'syncing' : 'trigger sync'}
          </button>
        </div>
      </Card>

      <Card eyebrow="sync log" title="last runs">
        {error ? (
          <div className="empty">no sync log endpoint yet</div>
        ) : isLoading ? (
          <div className="empty">loading</div>
        ) : (data?.items ?? []).length === 0 ? (
          <div className="empty">no syncs recorded</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>source</th>
                <th style={th}>last sync</th>
                <th style={th}>status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((row) => (
                <tr key={row.source}>
                  <td style={td}>{row.source}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>
                    {formatRelative(row.last_sync)}
                  </td>
                  <td style={{ ...td, color: 'var(--muted)' }}>
                    {row.status ?? 'ok'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 'var(--eyebrow)',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  fontWeight: 500,
  color: 'var(--muted)',
  padding: '8px 0',
  borderBottom: '1px solid var(--hairline)',
};

const td: React.CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid var(--hairline)',
  fontSize: 'var(--body-sm)',
};
