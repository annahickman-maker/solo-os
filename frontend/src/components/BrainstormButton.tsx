/**
 * Compact pill button next to the avatar. Opens the brainstorm modal where
 * the creator fills out prompts and saves them straight into the bank.
 */

import { useEffect, useState } from 'react';
import { Voice } from '../pages/Voice';

function LightbulbSvg() {
  // Outline lightbulb in the same visual language as AvatarSvg: 48-unit
  // viewBox, hairline circle backdrop, recovery-color outline at 1.6 stroke.
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="23" fill="rgba(255,255,255,0.04)" stroke="var(--hairline)" />
      {/* bulb dome */}
      <path
        d="M16 22a8 8 0 1 1 16 0c0 3-1.6 5.4-3.4 7-1 .9-1.6 1.7-1.6 3v1H21v-1c0-1.3-.6-2.1-1.6-3-1.8-1.6-3.4-4-3.4-7Z"
        fill="none"
        stroke="var(--recovery)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* screw threads */}
      <path d="M20 35h8" fill="none" stroke="var(--recovery)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21 38h6" fill="none" stroke="var(--recovery)" strokeWidth="1.6" strokeLinecap="round" />
      {/* filament hint */}
      <path d="M22 23v3M26 23v3" fill="none" stroke="var(--recovery)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function BrainstormButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="open your ideas bank"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px 6px 6px',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-pill)',
          color: 'var(--ink)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'var(--body-sm)',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
          (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.22)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--surface)';
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LightbulbSvg />
        </span>
        <span
          style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            lineHeight: 1.2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: 'var(--muted)',
              fontWeight: 500,
            }}
          >
            ideas bank
          </span>
          <span style={{ fontSize: 12 }}>brainstorm prompts</span>
        </span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: 'var(--space-5)',
            overflowY: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: 920,
              width: '100%',
              padding: 'var(--space-5)',
              marginTop: 'var(--space-4)',
            }}
          >
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <span className="eyebrow">ideas bank</span>
                <h2 className="h2" style={{ marginTop: 4 }}>brainstorm prompts</h2>
                <p
                  className="muted"
                  style={{ marginTop: 6, fontSize: 'var(--body-sm)', maxWidth: '56ch' }}
                >
                  open a prompt, dictate or type your answer, pick a category, hit save. saves the
                  answer and drops a verbatim entry into the matching bank.
                </p>
              </div>
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => setOpen(false)}
              >
                close
              </button>
            </header>
            <Voice embedded />
          </div>
        </div>
      )}
    </>
  );
}
