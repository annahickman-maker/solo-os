import { useEffect, useState, type ReactNode } from 'react';
import {
  getStoredPassword,
  setStoredPassword,
  verifyPassword,
} from './api';

interface PasswordGateProps {
  children: ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const stored = getStoredPassword();
    if (stored) {
      setAuthed(true);
    }
    setReady(true);

    const onAuthLost = () => setAuthed(false);
    window.addEventListener('dashboard:unauthorized', onAuthLost);
    return () => window.removeEventListener('dashboard:unauthorized', onAuthLost);
  }, []);

  if (!ready) return null;

  if (authed) return <>{children}</>;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setPending(true);
    setError(null);
    const ok = await verifyPassword(value.trim()).catch(() => false);
    setPending(false);
    if (!ok) {
      setError('that password didn\'t work');
      return;
    }
    setStoredPassword(value.trim());
    setAuthed(true);
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
          maxWidth: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-7)',
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
          <label
            htmlFor="password"
            style={{
              fontSize: 'var(--eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              fontWeight: 500,
              color: 'var(--muted)',
            }}
          >
            password
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            style={{
              border: 'none',
              borderBottom: '1px solid var(--hairline)',
              background: 'transparent',
              padding: 'var(--space-2) 0',
              fontSize: 'var(--body-lg)',
              outline: 'none',
              color: 'var(--ink)',
            }}
          />
          {error && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              {error}
            </span>
          )}
        </div>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? 'checking' : 'enter'}
        </button>
      </form>
    </div>
  );
}
