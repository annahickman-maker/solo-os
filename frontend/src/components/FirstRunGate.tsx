import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useSkillRun } from './SkillRunProvider';
import { solidButtonStyle, ghostButtonStyle } from '../lib/ui';

// Soft-but-prominent first-run gate. When the 6 core files aren't filled in,
// it pops a welcome modal once that launches Personal Brand Strategy, then
// leaves a persistent pill nudge until onboarding is done. Add ?onboarding to
// the URL to force it open (testing / "set me up again").
const DISMISS_KEY = 'onboarding_nudge_dismissed';
const DONE_THRESHOLD = 85; // overall_completion at/above this = set up

export function FirstRunGate() {
  const { runSkill } = useSkillRun();
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: api.profile });
  const { data: skills } = useQuery({ queryKey: ['skills'], queryFn: api.skills });

  const forced = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('onboarding');
  const incomplete = forced || (profile ? (profile.overall_completion ?? 0) < DONE_THRESHOLD : false);

  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  const [open, setOpen] = useState(false);

  // Pop once per app load when incomplete and not previously dismissed.
  useEffect(() => {
    if (incomplete && !dismissed) setOpen(true);
  }, [incomplete, dismissed]);

  if (!incomplete) return null;

  const onboardingId =
    skills?.items.find((s) => s.name === 'solopreneur-onboarding')?.id ??
    'skill-solopreneur-os-solopreneur-onboarding';

  function start() {
    setOpen(false);
    runSkill(onboardingId);
  }
  function later() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
    setOpen(false);
  }

  return (
    <>
      {/* Persistent nudge - stays until onboarding is done. */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 22,
            transform: 'translateX(-50%)',
            zIndex: 900,
            ...solidButtonStyle,
            padding: '10px 18px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
          }}
        >
          ✦ Complete your onboarding
        </button>
      )}

      {open && (
        <div
          onClick={later}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(10,10,10,0.55)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(520px, 96vw)',
              background: 'var(--bg)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
              padding: 'var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <span className="eyebrow" style={{ color: 'var(--muted)' }}>welcome</span>
            <h2 className="h2">Complete your onboarding</h2>
            <p className="muted" style={{ fontSize: 'var(--body)', lineHeight: 1.55, margin: 0 }}>
              This is the foundation everything else in the system reads from - your positioning, audience,
              story, offer, and voice. It's the first thing to do. You can bring in your existing content to
              start from a draft, and break it across sessions if you need to.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button type="button" onClick={start} style={solidButtonStyle}>start now</button>
              <button type="button" onClick={later} style={ghostButtonStyle}>maybe later</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
