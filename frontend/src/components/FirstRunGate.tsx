import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useSkillRun } from './SkillRunProvider';
import { solidButtonStyle } from '../lib/ui';

// First-run gate. While the 6 core files aren't filled in, it auto-opens the
// consolidated onboarding box once per app load (title + description + the
// bring-your-content inputs, all in one box) and leaves a persistent pill nudge
// until onboarding is done. Add ?onboarding to the URL to force it open
// (testing / "set me up again").
const DONE_THRESHOLD = 85; // overall_completion at/above this = set up

export function FirstRunGate() {
  const { runSkill } = useSkillRun();
  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: api.profile });
  const { data: skills } = useQuery({ queryKey: ['skills'], queryFn: () => api.skills() });

  const forced = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('onboarding');
  const incomplete = forced || (profile ? (profile.overall_completion ?? 0) < DONE_THRESHOLD : false);

  const onboarding = skills?.items.find((s) => s.name === 'solopreneur-onboarding') ?? null;
  const launchedRef = useRef(false);

  // Auto-open the consolidated onboarding box once per app load while incomplete.
  // runSkill('solopreneur-onboarding') is special-cased to render OnboardingLauncher.
  useEffect(() => {
    if (incomplete && onboarding && !launchedRef.current) {
      launchedRef.current = true;
      runSkill(onboarding.id);
    }
  }, [incomplete, onboarding, runSkill]);

  if (!incomplete) return null;

  // Persistent nudge - reopens the onboarding box. Stays until onboarding is done.
  return (
    <button
      type="button"
      onClick={() => onboarding && runSkill(onboarding.id)}
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
  );
}
