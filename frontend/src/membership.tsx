import { useEffect, useState, type ReactNode } from 'react';
import { api, type MembershipStatus } from './api';

interface MembershipGateProps {
  children: ReactNode;
}

/**
 * First-launch SS membership gate.
 *
 * Wraps the rest of the dashboard. If the user has NEVER entered a key
 * (status === 'unverified'), shows the key-entry screen. Otherwise renders
 * children - even if the cached key has expired. An expired key only
 * blocks the Update button, not access to the app.
 *
 * Why not re-wall on expiry: members who let SS lapse should keep their
 * dashboard. They just stop getting new code. Hard-walling would punish
 * them retroactively for past use.
 */
export function MembershipGate({ children }: MembershipGateProps) {
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .membershipStatus()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {
        // If the server is unreachable, fall through to the gate so the user can try entering
        // a key (which itself does a server call). Treating an offline server as "unverified"
        // would lock them out of their dashboard for an unrelated reason.
        if (alive) setStatus({ state: 'unverified', reason: 'could not reach server' });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) return null; // splash; loading server status

  // If a key has ever been entered (valid OR expired), the app boots.
  if (status.state !== 'unverified') return <>{children}</>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await api.verifyMembershipKey(value.trim());
      setPending(false);
      if (next.state === 'valid') {
        setStatus(next);
        return;
      }
      setError('reason' in next ? next.reason : 'key not accepted');
    } catch (err) {
      setPending(false);
      setError((err as Error).message ?? 'could not verify - check your internet connection');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-5)',
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: '100%',
          maxWidth: 440,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '3rem',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              fontVariationSettings: "'opsz' 144",
            }}
          >
            solo os<span style={{ color: 'var(--accent)' }}>.</span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--muted)',
              fontWeight: 500,
            }}
          >
            one-time setup
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              lineHeight: 1.2,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            enter your solopreneur systems key
          </h2>
          <p
            className="muted"
            style={{ margin: 0, fontSize: 'var(--body-sm)', lineHeight: 1.55 }}
          >
            solo os is built for members of the{' '}
            <a
              href="https://www.skool.com/mastermind-5724/about"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              solopreneur systems community
            </a>
            . the current key is pinned at the top of the community. paste it once - it stays
            saved on this machine and only re-checks when you click update.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label
            htmlFor="ss-key"
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              fontWeight: 500,
              color: 'var(--muted)',
            }}
          >
            ss key
          </label>
          <input
            id="ss-key"
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            placeholder="ss-..."
            style={{
              border: 'none',
              borderBottom: '1px solid var(--hairline)',
              background: 'transparent',
              padding: 'var(--space-2) 0',
              fontSize: 'var(--body-lg)',
              outline: 'none',
              color: 'var(--ink)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          />
          {error && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              {error}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn--primary"
          disabled={pending || !value.trim()}
        >
          {pending ? 'verifying' : 'unlock dashboard'}
        </button>

        <p
          className="muted"
          style={{ margin: 0, fontSize: 11, lineHeight: 1.5, textAlign: 'center' }}
        >
          your key never leaves the verification check. it's stored locally on this machine only.
        </p>
      </form>
    </div>
  );
}
