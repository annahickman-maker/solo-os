import { useEffect, useState, type ReactNode } from 'react';
import { api, type MembershipStatus } from './api';

interface MembershipGateProps {
  children: ReactNode;
}

// Persisted once the user has successfully verified at least once. After that
// the wall never shows again, even if a future status call hiccups - we trust
// the local token. Members who go from valid -> expired keep the app running
// (per the membership policy); the Update button handles the gating instead.
const EVER_VERIFIED_KEY = 'dashboard.membership.ever-verified';

function hasEverVerified(): boolean {
  try {
    return localStorage.getItem(EVER_VERIFIED_KEY) === '1';
  } catch {
    return false;
  }
}
function markEverVerified(): void {
  try {
    localStorage.setItem(EVER_VERIFIED_KEY, '1');
  } catch {
    // ignore - storage unavailable just means the wall might show again
  }
}

/**
 * First-launch SS membership gate.
 *
 * Walls the app ONLY on a brand-new install with no successful verification on
 * record. Once verified, a localStorage flag prevents the wall from coming back
 * - so transient network failures, server hiccups, or token rechecks never
 * surprise the user with a re-wall. Expired tokens still don't wall (the
 * Update button is what enforces the policy).
 */
export function MembershipGate({ children }: MembershipGateProps) {
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [skipWall, setSkipWall] = useState<boolean>(() => hasEverVerified());
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Returning users (ever verified) never wall and never need the network -
    // skip the status check entirely so first paint isn't blocked on it.
    if (hasEverVerified()) return;
    let alive = true;
    // Brand-new install only: check status, but cap the wait so a slow or dead
    // verification endpoint can't leave the user staring at a blank splash.
    const timeout = new Promise<MembershipStatus>((resolve) =>
      setTimeout(() => resolve({ state: 'unverified', reason: 'verification timed out' }), 6000)
    );
    Promise.race([api.membershipStatus(), timeout])
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        if (s.state === 'valid' || s.state === 'expired') markEverVerified();
      })
      .catch(() => {
        // Offline / transient server error - never wall. Treat as unverified so
        // the first-launch user CAN see the wall and enter their key.
        if (alive) setStatus({ state: 'unverified', reason: 'could not reach server' });
      });
    return () => {
      alive = false;
    };
  }, []);

  // Sticky bypass: once verified at any point, never wall again - checked
  // BEFORE the loading splash so returning users paint instantly (no network).
  if (skipWall) return <>{children}</>;

  if (status === null) return null; // brand-new install: brief splash while we check

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
        markEverVerified();
        setSkipWall(true);
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
            enter your the offer key
          </h2>
          <p
            className="muted"
            style={{ margin: 0, fontSize: 'var(--body-sm)', lineHeight: 1.55 }}
          >
            solo os is built for members of the{' '}
            <a
              href=""
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              the offer community
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
