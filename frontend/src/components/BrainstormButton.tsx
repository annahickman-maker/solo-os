/**
 * Compact pill button next to the avatar. Opens the brainstorm modal where
 * the creator fills out prompts and saves them straight into the bank.
 */

import { useEffect, useState } from 'react';
import { Voice } from '../pages/Voice';
import { createButtonStyle } from '../lib/ui';

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
        style={{ ...createButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.5.4.9 1.1 1 1.8v.5h6v-.5c.1-.7.5-1.4 1-1.8A7 7 0 0 0 12 2Z" />
        </svg>
        ideas bank
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
