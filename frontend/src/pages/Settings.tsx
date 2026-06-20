import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearStoredPassword, type MembershipStatus, type ZoomStatus } from '../api';
import { Card } from '../components/Card';

// Slash-command prompts the user pastes into Claude to set up each integration.
const PROMPTS = {
  google: 'Connect my Google Calendar to the dashboard',
  zoom: 'Connect Zoom transcripts to my dashboard',
  youtube: 'Set up the YouTube API',
} as const;

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

      {/* 1. UPDATE SOLO OS - at the top */}
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
            paste your current SS key in the membership card below to re-enable updates.
          </p>
        )}
      </Card>

      {/* 2. SOLOPRENEUR SYSTEMS KEY */}
      <MembershipCard
        onChanged={() => qc.invalidateQueries({ queryKey: ['membership-status'] })}
      />

      {/* 3. CONNECT YOUR APPS - unified integrations card */}
      <ConnectYourAppsCard />

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
        the current key is pinned in the{' '}
        <a
          href="https://www.skool.com/mastermind-5724/about"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          SS community
        </a>
        . if your membership lapses the dashboard keeps running but updates stop until you re-enter a valid key.
      </p>

      <MembershipStatusLine status={status.data ?? null} loading={status.isLoading} />

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

  async function connectGoogle() {
    try {
      const { url } = await api.googleConnectUrl();
      window.location.href = url;
    } catch (err) {
      window.alert(`could not start connect flow: ${(err as Error).message}`);
    }
  }

  const googleConnected = !!google.data?.connected;
  const googleConfigured = !!google.data?.configured;
  const zoomConnected = !!zoom.data?.connected;
  const youtubeConnected = !!youtube.data?.configured;

  return (
    <Card eyebrow="connections" title="connect your apps">
      <p className="muted" style={{ margin: 0, lineHeight: 1.55 }}>
        each integration runs entirely on your machine. credentials are stored locally
        and never sent to a third party server. if a row is grey, paste its prompt
        into claude to walk through the one-time setup.
      </p>

      <ConnectRow
        label="Google Calendar"
        sub="meetings on the Today page"
        live={googleConnected}
        liveLabel={
          googleConnected
            ? `live · ${google.data?.email ?? 'connected'}`
            : googleConfigured
              ? 'credentials set · grant access'
              : null
        }
        prompt={PROMPTS.google}
        primaryAction={
          googleConfigured && !googleConnected
            ? { label: 'grant access', onClick: connectGoogle }
            : googleConnected
              ? { label: 'disconnect', onClick: () => googleDisconnect.mutate(), variant: 'ghost' }
              : null
        }
      />

      <ConnectRow
        label="Zoom"
        sub="cloud recording transcripts auto-synced into the vault"
        live={zoomConnected}
        liveLabel={
          zoomConnected
            ? `live · account ${zoom.data?.account_id_preview ?? ''} · ${formatZoomLastSync(zoom.data ?? null)}`
            : null
        }
        prompt={PROMPTS.zoom}
        primaryAction={
          zoomConnected
            ? {
                label: zoomSync.isPending ? 'syncing…' : 'sync now',
                onClick: () => zoomSync.mutate(),
                disabled: zoomSync.isPending,
              }
            : null
        }
        secondaryAction={
          zoomConnected ? { label: 'disconnect', onClick: () => zoomDisconnect.mutate() } : null
        }
        afterStatus={
          zoomConnected && zoom.data?.last_sync_error ? (
            <span style={{ fontSize: 11, color: 'var(--danger)' }}>
              last sync error: {zoom.data.last_sync_error}
            </span>
          ) : null
        }
      />

      <ConnectRow
        label="YouTube Analytics"
        sub="channel stats + title radar + analytics review"
        live={youtubeConnected}
        liveLabel={
          youtubeConnected
            ? `live${youtube.data?.yt_channel_handle ? ` · @${youtube.data.yt_channel_handle}` : ''}${youtube.data?.last_sync ? ' · ' + formatRelativeTime(youtube.data.last_sync) : ''}`
            : null
        }
        prompt={PROMPTS.youtube}
        primaryAction={null}
      />
    </Card>
  );
}

interface ConnectRowProps {
  label: string;
  sub: string;
  live: boolean;
  liveLabel: string | null;
  prompt: string;
  primaryAction: { label: string; onClick: () => void; disabled?: boolean; variant?: 'ghost' } | null;
  secondaryAction?: { label: string; onClick: () => void } | null;
  afterStatus?: React.ReactNode;
}

function ConnectRow({
  label,
  sub,
  live,
  liveLabel,
  prompt,
  primaryAction,
  secondaryAction,
  afterStatus,
}: ConnectRowProps) {
  const [copied, setCopied] = useState(false);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('copy this prompt:', prompt);
    }
  }
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
            fontSize: 10,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: live ? 'var(--recovery)' : 'var(--muted)',
            opacity: live ? 1 : 0.4,
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
            color: live ? 'var(--recovery)' : 'var(--muted)',
            fontWeight: 600,
          }}
        >
          {live ? 'live' : 'setup'}
        </span>
      </div>

      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
        {liveLabel ?? sub}
      </span>
      {afterStatus}

      {live ? (
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 4 }}>
          {primaryAction && (
            <button type="button" className="btn" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
              {primaryAction.label}
            </button>
          )}
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
            <span style={{ flex: 1, color: 'var(--ink)' }}>{prompt}</span>
            <button type="button" className="btn btn--ghost" onClick={copyPrompt}>
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
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
