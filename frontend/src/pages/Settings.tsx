import { useMutation } from '@tanstack/react-query';
import { api, clearStoredPassword } from '../api';
import { Card } from '../components/Card';

export function Settings() {
  const updateSoloOs = useMutation({ mutationFn: api.updateSoloOs });

  const logOut = () => {
    clearStoredPassword();
    window.location.reload();
  };

  const result = updateSoloOs.data;
  const errored = updateSoloOs.isError || (result && result.ok === false);
  const errorMessage =
    updateSoloOs.error instanceof Error ? updateSoloOs.error.message : null;

  let statusLine: string | null = null;
  if (updateSoloOs.isPending) {
    statusLine = 'checking github';
  } else if (errored) {
    statusLine = errorMessage ?? result?.output ?? 'update failed';
  } else if (result?.alreadyUpToDate) {
    statusLine = 'already up to date';
  } else if (result?.ok) {
    statusLine = 'updated. restart solo OS to load the new code.';
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <header className="page-header">
        <span className="eyebrow">settings</span>
        <h1 className="h2">house keeping</h1>
      </header>

      <Card eyebrow="auth" title="password">
        <p className="muted" style={{ margin: 0 }}>
          clears the cached password and reloads the gate
        </p>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button className="btn" onClick={logOut}>
            log out
          </button>
        </div>
      </Card>

      <Card eyebrow="updates" title="update solo OS">
        <p className="muted" style={{ margin: 0 }}>
          pulls any updates from GitHub to solo OS
        </p>
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button
            className="btn"
            onClick={() => updateSoloOs.mutate()}
            disabled={updateSoloOs.isPending}
          >
            {updateSoloOs.isPending ? 'checking' : 'check for updates'}
          </button>
        </div>
        {statusLine && (
          <p
            className="muted"
            style={{
              margin: 0,
              fontSize: 'var(--body-sm)',
              color: errored ? 'var(--danger)' : 'var(--muted)',
            }}
          >
            {statusLine}
          </p>
        )}
      </Card>
    </div>
  );
}
