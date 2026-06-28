import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearStoredPassword, type MembershipStatus, type ZoomStatus } from '../api';
import { Card } from '../components/Card';
import { ConnectAppCard } from '../components/ConnectAppCard';

export function Settings() {
  const qc = useQueryClient();

  const logOut = () => {
    clearStoredPassword();
    window.location.reload();
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="eyebrow">settings</span>
        <h1 className="h2">house keeping</h1>
      </header>

      {/* 1. SOLOPRENEUR SYSTEMS - merged: SS key + update solo OS */}
      <MembershipCard
        onChanged={() => qc.invalidateQueries({ queryKey: ['membership-status'] })}
      />

      {/* 2. CONNECT YOUR APPS - unified integrations card */}
      <ConnectYourAppsCard />

      {/* 3. APPEARANCE - light / dark theme */}
      <AppearanceCard />

      {/* 4. PASSWORD / LOG OUT - at the bottom */}
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
    </div>
  );
}

// ─── Appearance / theme card ─────────────────────────────────────────────

type Theme = 'dark' | 'light';

function AppearanceCard() {
  const [theme, setTheme] = useState<Theme>(
    () => ((document.documentElement.getAttribute('data-theme') as Theme) || 'dark'),
  );

  const apply = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('solo-os-theme', next);
    } catch {
      // storage unavailable - the theme still applies for this session
    }
  };

  return (
    <Card eyebrow="appearance" title="theme">
      <p className="muted" style={{ margin: 0 }}>
        switch between the dark interface and the light warm-grey one
      </p>
      <div className="row" style={{ gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
        {(['dark', 'light'] as Theme[]).map((t) => (
          <button
            key={t}
            className="btn"
            onClick={() => apply(t)}
            style={{
              outline: theme === t ? '2px solid var(--accent)' : '1px solid var(--hairline)',
              outlineOffset: theme === t ? '0' : '-1px',
            }}
          >
            {t} mode
          </button>
        ))}
      </div>
    </Card>
  );
}

// ─── Membership card ─────────────────────────────────────────────────────

function MembershipCard({ onChanged }: { onChanged: () => void }) {
  const status = useQuery({
    queryKey: ['membership-status'],
    queryFn: api.membershipStatus,
  });
  const updateSoloOs = useMutation({ mutationFn: api.updateSoloOs });

  const [showInput, setShowInput] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  // Update Solo OS state
  const updateResult = updateSoloOs.data;
  const updateErrored = updateSoloOs.isError || (updateResult && updateResult.ok === false);
  const updateErrorMessage =
    updateSoloOs.error instanceof Error ? updateSoloOs.error.message : null;
  const blockedByMembership =
    !!updateResult && updateResult.ok === false && updateResult.membership_state && updateResult.membership_state !== 'valid';

  let updateStatusLine: string | null = null;
  if (updateSoloOs.isPending) {
    updateStatusLine = 'checking github';
  } else if (updateErrored) {
    updateStatusLine = updateErrorMessage ?? updateResult?.output ?? 'update failed';
  } else if (updateResult?.alreadyUpToDate) {
    updateStatusLine = 'already up to date';
  } else if (updateResult?.ok) {
    updateStatusLine = 'updated. restart solo OS to load the new code.';
  }

  const membershipValid = status.data?.state === 'valid';

  return (
    <Card eyebrow="the offer" title="membership + updates">
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        the current key is pinned in the{' '}
        <a
          href=""
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          SS community
        </a>
        {' '}under the solo os classroom module. if your membership lapses the dashboard keeps running but updates stop until you re-enter a valid key.
      </p>

      <MembershipStatusLine status={status.data ?? null} loading={status.isLoading} />

      {showInput && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="ss-..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            autoFocus
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
          </div>
        </form>
      )}

      {!showInput && (
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <button
            className="btn"
            onClick={() => updateSoloOs.mutate()}
            disabled={updateSoloOs.isPending || !membershipValid}
            title={!membershipValid ? 'enter a valid SS key first' : undefined}
          >
            {updateSoloOs.isPending ? 'checking…' : 'check for updates'}
          </button>
          <button className="btn btn--ghost" onClick={() => setShowInput(true)}>
            {membershipValid ? 'update key' : 'enter key'}
          </button>
        </div>
      )}

      {updateStatusLine && (
        <p
          className="muted"
          style={{
            margin: 0,
            fontSize: 'var(--body-sm)',
            color: updateErrored ? 'var(--danger)' : 'var(--muted)',
          }}
        >
          {updateStatusLine}
        </p>
      )}
      {blockedByMembership && (
        <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
          re-enter your current SS key above to re-enable updates.
        </p>
      )}
    </Card>
  );
}

function MembershipStatusLine({ status, loading }: { status: MembershipStatus | null; loading: boolean }) {
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

// ─── Connect Your Apps card (unified) ────────────────────────────────────

function ConnectYourAppsCard() {
  const qc = useQueryClient();
  const google = useQuery({
    queryKey: ['google-status'],
    queryFn: api.googleStatus,
    refetchInterval: 60_000,
  });
  const zoom = useQuery({
    queryKey: ['zoom-status'],
    queryFn: api.zoomStatus,
    refetchInterval: 60_000,
  });
  const youtube = useQuery({
    queryKey: ['youtube-status'],
    queryFn: api.youtubeStatus,
    refetchInterval: 60_000,
  });
  const tracking = useQuery({
    queryKey: ['tracking-setup-status'],
    queryFn: api.getTrackingSetupStatus,
    refetchInterval: 60_000,
  });
  const nanobanana = useQuery({
    queryKey: ['nano-banana-status'],
    queryFn: api.nanoBananaStatus,
    refetchInterval: 60_000,
  });

  const zoomSync = useMutation({
    mutationFn: api.zoomSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zoom-status'] }),
  });
  const zoomDisconnect = useMutation({
    mutationFn: api.zoomDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zoom-status'] }),
  });
  const googleDisconnect = useMutation({
    mutationFn: api.googleDisconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['google-status'] }),
  });

  const googleConnected = !!google.data?.connected;
  const zoomConnected = !!zoom.data?.connected;
  const youtubeConnected = !!youtube.data?.configured;
  const trackingConnected = !!(tracking.data?.manifest_exists && tracking.data?.worker_exists);
  const nanobananaConnected = !!nanobanana.data?.connected;

  return (
    <Card eyebrow="connections" title="connect your apps">
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        each integration runs entirely on your machine. credentials are stored locally
        and never sent to a third party server. run the setup on any card below - it
        disappears here once that app is connected and live.
      </p>

      {/* Each app shows the connect card until it's live, then flips to a live
          management row (disconnect / sync / review). */}
      {googleConnected ? (
        <ConnectRow
          label="Google Calendar"
          liveLabel={`live · ${google.data?.email ?? 'connected'}`}
          primaryAction={{ label: 'disconnect', onClick: () => googleDisconnect.mutate(), variant: 'ghost' }}
        />
      ) : (
        <ConnectAppCard app="google" />
      )}

      {zoomConnected ? (
        <ConnectRow
          label="Zoom"
          liveLabel={`live · account ${zoom.data?.account_id_preview ?? ''} · ${formatZoomLastSync(zoom.data ?? null)}`}
          primaryAction={{
            label: zoomSync.isPending ? 'syncing…' : 'sync now',
            onClick: () => zoomSync.mutate(),
            disabled: zoomSync.isPending,
          }}
          secondaryAction={{ label: 'disconnect', onClick: () => zoomDisconnect.mutate() }}
          afterStatus={
            zoom.data?.last_sync_error ? (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>
                last sync error: {zoom.data.last_sync_error}
              </span>
            ) : null
          }
        />
      ) : (
        <ConnectAppCard app="zoom" />
      )}

      {youtubeConnected ? (
        <ConnectRow
          label="YouTube Analytics"
          liveLabel={`live${youtube.data?.yt_channel_handle ? ` · @${youtube.data.yt_channel_handle.replace(/^@/, '')}` : ''}${youtube.data?.last_sync ? ' · ' + formatRelativeTime(youtube.data.last_sync) : ''}`}
        />
      ) : (
        <ConnectAppCard app="youtube" />
      )}

      {trackingConnected ? (
        <ConnectRow label="Conversion Tracking" liveLabel="live · worker deployed" />
      ) : (
        <ConnectAppCard app="tracking" />
      )}

      {nanobananaConnected ? (
        <ConnectRow
          label="Nano Banana"
          liveLabel={`live · key ${nanobanana.data?.key_preview ?? 'saved'}`}
        />
      ) : (
        <ConnectAppCard app="nanobanana" />
      )}
    </Card>
  );
}

interface ConnectRowProps {
  label: string;
  liveLabel: string;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean; variant?: 'ghost' } | null;
  secondaryAction?: { label: string; onClick: () => void } | null;
  afterStatus?: React.ReactNode;
}

// Live management row for a connected integration (status + disconnect / sync /
// review). The disconnected state is handled by <ConnectAppCard>, not here.
function ConnectRow({
  label,
  liveLabel,
  primaryAction,
  secondaryAction,
  afterStatus,
}: ConnectRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) 0',
        borderTop: '1px solid var(--hairline)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--recovery)',
            flexShrink: 0,
            alignSelf: 'center',
            marginRight: 4,
          }}
          aria-hidden
        />
        <span style={{ fontSize: 'var(--body)', fontWeight: 500, flex: 1 }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--recovery)',
            fontWeight: 600,
          }}
        >
          live
        </span>
      </div>

      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
        {liveLabel}
      </span>
      {afterStatus}

      {(primaryAction || secondaryAction) && (
        <div className="row" style={{ gap: 'var(--space-3)', marginTop: 4 }}>
          {primaryAction && (
            <button
              type="button"
              className={`btn${primaryAction.variant === 'ghost' ? ' btn--ghost' : ''}`}
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button type="button" className="btn btn--ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatZoomLastSync(z: ZoomStatus | null): string {
  if (!z?.last_sync_at) return 'never synced';
  const rel = formatRelativeTime(z.last_sync_at);
  return z.last_sync_count > 0
    ? `${rel} (${z.last_sync_count} new)`
    : rel;
}

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatRelativeTime(unix: number | string): string {
  const ts = typeof unix === 'number' ? unix : Math.floor(new Date(unix).getTime() / 1000);
  if (!Number.isFinite(ts)) return 'unknown';
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(ts);
}
