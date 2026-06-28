/**
 * Shared UI primitives values. One source so the look stays identical across
 * the app. See docs/DESIGN_UI.md. Will become CSS tokens when codified.
 */

// Thin grey line + soft lift used on cards, selectors, count badges, and the
// create-style buttons. The look locked on the Skills page.
export const SURFACE_LIFT =
  '0 1px 3px rgba(15, 15, 15, 0.06), 0 4px 12px -2px rgba(15, 15, 15, 0.07)';

// ── Canonical button family (radius-md, body-sm, 600, soft lift). The Skills
// "run skill" / IG card "posted" buttons are the reference. See docs/DESIGN_UI.md.

// SOLID / primary action - cream fill, ink text + border. ("run skill", posted,
// edited, filmed, save.)
export const solidButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#EDEDE9',
  color: '#16140F',
  border: '1.5px solid #16140F',
  whiteSpace: 'nowrap',
  boxShadow: SURFACE_LIFT,
} as const;

// OUTLINE / secondary - surface fill, hairline border. ("+ create skill",
// "+ add project", ideas bank, positioning.)
export const createButtonStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink)',
  padding: '8px 16px',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  flex: '0 0 auto',
  boxShadow: SURFACE_LIFT,
} as const;
export const outlineButtonStyle = createButtonStyle;

// GHOST - transparent, hairline border, muted text. ("schedule", quiet actions.)
export const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--hairline)',
  whiteSpace: 'nowrap',
  boxShadow: SURFACE_LIFT,
} as const;

// FILLED (light green) - the "set / done" state of a ghost pill. Matches the
// scheduled-date pill ("Jul 10"). Use when a ghost button's thing is filled in.
export const filledPillStyle = {
  ...ghostButtonStyle,
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  color: 'var(--ink)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--hairline))',
} as const;
