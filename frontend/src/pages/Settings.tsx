import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearStoredPassword, type MembershipStatus, type ZoomStatus } from '../api';
import { Card } from '../components/Card';

const ZOOM_CONNECT_PROMPT = 'Connect Zoom transcripts to my dashboard';

export function Settings() {
  const qc = useQueryClient();
  const updateSoloOs = useMutation({ mutationFn: api.updateSoloOs });

  const logOut = () => {
    clearStoredPassword();
    window.location.reload();
  };

  const result = updateSoloOs.data;
  const errored = updateSoloOs.isError || (result && result.ok === false);
  const errorMessage =
    updateSoloOs.error instanceof Error ? updateSoloOs.error.message : null;
  const blockedByMembership =
    !!result && result.ok === false && result.membership_state && result.membership_state !== 'valid';

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

      <MembershipCard
        onChanged={() => qc.invalidateQueries({ queryKey: ['membership-status'] })}
      />

      <ZoomCard />

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
        {blockedByMembership && (
          <p
            className="muted"
            style={{
              margin: 0,
              fontSize: 'var(--body-sm)',
              color: 'var(--muted)',
            }}
          >
            paste your current key in the membership card above to re-enable updates.
          </p>
        )}
      </Card>
    </div>
  );
}

// ─── Membership card ─────────────────────────────────────────────────────

function MembershipCard({ onChanged }: { onChanged: () => void }) {
  const status = useQuery({
    queryKey: ['membership-status'],
    queryFn: api.membershipStatus,
  });

  const [showInput, setShowInput] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Auto-open the input when the cached key is missing or expired.
  useEffect(() => {
    if (!status.data) return;
    const state = status.data.state;
    if (state === 'unverified' || state === 'expired') {
      setShowInput(true);
    }
  }, [status.data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await api.verifyMembershipKey(value.trim());
      setPending(false);
      if (next.state === 'valid') {
        setValue('');
        setShowInput(false);
        status.refetch();
        onChanged();
        return;
      }
      setError('reason' in next ? next.reason : 'key not accepted');
    } catch (err) {
      setPending(false);
      setError((err as Error).message ?? 'verification failed');
    }
  }

  async function clear() {
    if (!confirm('clear the local key? you will need to paste it again to enable updates.')) return;
    await api.clearMembership();
    status.refetch();
    onChanged();
  }

  return (
    <Card eyebrow="membership" title="solopreneur systems key">
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        solo OS pulls updates straight from this repo on github. updates are gated by your
        active SS membership. paste the current key from inside the{' '}
        <a
          href="https://www.skool.com/mastermind-5724/about"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          community
        </a>
        . the key rotates periodically - if your membership lapses, the dashboard keeps
        running but the update button stops working until you re-enter a valid key.
      </p>

      <StatusLine status={status.data ?? null} loading={status.isLoading} />

      {showInput ? (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="ss-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            style={{
              border: '1px solid var(--hairline)',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              fontSize: 'var(--body)',
              color: 'var(--ink)',
              outline: 'none',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />
          {error && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              {error}
            </span>
          )}
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <button type="submit" className="btn" disabled={pending || !value.trim()}>
              {pending ? 'verifying' : 'save key'}
            </button>
            {status.data?.state === 'valid' && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setShowInput(false);
                  setValue('');
                  setError(null);
                }}
              >
                cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button className="btn" onClick={() => setShowInput(true)}>
            update key
          </button>
          {status.data?.state === 'valid' && (
            <button className="btn btn--ghost" onClick={clear}>
              clear key (testing)
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusLine({ status, loading }: { status: MembershipStatus | null; loading: boolean }) {
  if (loading || !status) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
        checking key…
      </p>
    );
  }

  if (status.state === 'unverified') {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', color: 'var(--strain)' }}>
        no key on file. paste the current SS key below.
      </p>
    );
  }

  if (status.state === 'expired') {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', color: 'var(--strain)' }}>
        cached key expired on {formatDate(status.token.valid_until)}. paste the current SS key to refresh.
      </p>
    );
  }

  if (status.state === 'rejected') {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', color: 'var(--danger)' }}>
        {status.reason}
      </p>
    );
  }

  // valid
  const ageDays = Math.floor((Date.now() / 1000 - status.token.last_checked) / 86400);
  const validUntilStr = formatDate(status.token.valid_until);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0 }}>
      <span style={{ fontSize: 'var(--body-sm)', color: 'var(--recovery)' }}>
        ✓ key verified · valid through {validUntilStr}
      </span>
      <span className="muted" style={{ fontSize: 11 }}>
        last checked {ageDays === 0 ? 'today' : `${ageDays} day${ageDays === 1 ? '' : 's'} ago`}
      </span>
      {status.rotation_warning && (
        <span style={{ fontSize: 11, color: 'var(--strain)' }}>
          you're on the previous key - rotate to the current one soon.
        </span>
      )}
    </div>
  );
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Zoom card ──────────────────────────────────────────────────────────

function ZoomCard() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['zoom-status'],
    queryFn: api.zoomStatus,
    refetchInterval: 60_000,
  });
  const syncNow = useMutation({
    mutationFn: api.zoomSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zoom-status'] }),
  });
  const disconnect = useMutation({
    mutationFn: api.zoomDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zoom-status'] }),
  });
  const [copied, setCopied] = useState(false);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ZOOM_CONNECT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('copy this prompt:', ZOOM_CONNECT_PROMPT);
    }
  }
  async function onDisconnect() {
    if (!confirm('disconnect Zoom? transcripts already in your vault will stay, but new recordings will stop syncing until you reconnect.')) return;
    await disconnect.mutateAsync();
  }

  return (
    <Card eyebrow="zoom transcripts" title="auto-sync from zoom cloud recordings">
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        connect your zoom account once. every cloud recording with a finished transcript drops into{' '}
        <code>05_Assets/Transcripts/</code> automatically within 15 minutes. credentials stay on this
        machine; nothing is sent to a third party.
      </p>

      <ZoomStatusLine status={status.data ?? null} loading={status.isLoading} />

      {status.data?.connected ? (
        <ZoomConnectedActions
          syncing={syncNow.isPending}
          onSyncNow={() => syncNow.mutate()}
          onDisconnect={onDisconnect}
          syncResult={syncNow.data}
          syncError={syncNow.error instanceof Error ? syncNow.error.message : null}
        />
      ) : (
        <ZoomConnectPrompt copied={copied} onCopy={copyPrompt} />
      )}
    </Card>
  );
}

function ZoomStatusLine({ status, loading }: { status: ZoomStatus | null; loading: boolean }) {
  if (loading || !status) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
        checking zoom connection…
      </p>
    );
  }
  if (!status.connected) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', color: 'var(--strain)' }}>
        not connected. run the prompt below in claude to set it up (~10 minutes).
      </p>
    );
  }
  const lastSync = status.last_sync_at ? formatRelativeTime(status.last_sync_at) : 'never';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: 0 }}>
      <span style={{ fontSize: 'var(--body-sm)', color: 'var(--recovery)' }}>
        ✓ connected{status.account_id_preview ? ` · account ${status.account_id_preview}` : ''}
      </span>
      <span className="muted" style={{ fontSize: 11 }}>
        last sync {lastSync}
        {status.last_sync_count > 0 ? ` · ${status.last_sync_count} transcript${status.last_sync_count === 1 ? '' : 's'} saved` : ''}
      </span>
      {status.last_sync_error && (
        <span style={{ fontSize: 11, color: 'var(--danger)' }}>
          last error: {status.last_sync_error}
        </span>
      )}
    </div>
  );
}

function ZoomConnectedActions({
  syncing,
  onSyncNow,
  onDisconnect,
  syncResult,
  syncError,
}: {
  syncing: boolean;
  onSyncNow: () => void;
  onDisconnect: () => void;
  syncResult: import('../api').ZoomSyncResult | undefined;
  syncError: string | null;
}) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <button className="btn" onClick={onSyncNow} disabled={syncing}>
          {syncing ? 'syncing' : 'sync now'}
        </button>
        <button className="btn btn--ghost" onClick={onDisconnect}>
          disconnect
        </button>
      </div>
      {syncResult && (
        <p
          className="muted"
          style={{
            margin: 0,
            fontSize: 'var(--body-sm)',
            color: syncResult.ok ? 'var(--muted)' : 'var(--danger)',
          }}
        >
          {syncResult.ok
            ? syncResult.saved.length > 0
              ? `saved ${syncResult.saved.length} new transcript${syncResult.saved.length === 1 ? '' : 's'}.`
              : 'no new transcripts. zoom takes 15-30 min after a call to produce a transcript.'
            : syncResult.error ?? 'sync failed'}
        </p>
      )}
      {syncError && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', color: 'var(--danger)' }}>
          {syncError}
        </p>
      )}
    </div>
  );
}

function ZoomConnectPrompt({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 'var(--body-sm)',
      }}
    >
      <span style={{ flex: 1, color: 'var(--ink)' }}>{ZOOM_CONNECT_PROMPT}</span>
      <button type="button" className="btn btn--ghost" onClick={onCopy}>
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

function formatRelativeTime(unix: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unix);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(unix);
}
