import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { OfferAvatar } from '../api';
import { AV_BANK_CSS } from '../pages/Offer';
import { createButtonStyle } from '../lib/ui';

/**
 * Avatar editor - "who this is for".
 *
 * Renders as a small pill button (icon + label) intended to live in the
 * top-right of the page header, in line with the page title. Clicking opens
 * a slide-over panel from the right with the full editor (who you help,
 * before/after, value chips).
 *
 * Self-contained: fetches reputation data, saves slot changes via the same
 * /api/reputation/slots endpoint that the Profile page uses.
 */
export function AvatarToggle() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  // Reputation transformation_anchor drives the positioning section at
  // the top of the panel (who you help, before/after, value tags).
  // Edits go through /api/reputation/slots.
  const { data: repData } = useQuery({
    queryKey: ['reputation'],
    queryFn: api.reputation,
  });
  const anchor = repData?.transformation_anchor;
  const setSlot = useMutation({
    mutationFn: (v: { slot: string; value: string | null }) =>
      api.setReputationSlot(v.slot, v.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const onSlotSave = (slot: string, value: string | null) => setSlot.mutate({ slot, value });

  // Offer avatars drive the multi-avatar bank picker BELOW the
  // positioning section. Same data the per-offer picker uses.
  const { data: offersData } = useQuery({
    queryKey: ['offers'],
    queryFn: api.offers,
  });
  const avatars: OfferAvatar[] =
    offersData?.sections.find((s) => s.id === 'avatar')?.avatars ?? [];

  // The persisted content focus avatar - the one the YouTube + Instagram
  // skills read as "who this content is for". Stored as the avatar's
  // source-file path (id as fallback) in state.md via /api/settings.
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const focusRef = settings?.content_focus_avatar ?? null;
  const focusAvatar =
    avatars.find((a) => a.source_file && a.source_file === focusRef) ??
    avatars.find((a) => a.id === focusRef) ??
    null;
  const saveFocus = useMutation({
    mutationFn: (ref: string) => api.updateSettings({ content_focus_avatar: ref }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // On open, default the in-panel preview to the persisted focus avatar (or
  // the first avatar if none is set yet).
  useEffect(() => {
    if (open && !selectedId && avatars.length > 0) {
      setSelectedId(focusAvatar?.id ?? avatars[0]!.id);
    }
  }, [open, selectedId, avatars, focusAvatar]);
  const selected = avatars.find((a) => a.id === selectedId) ?? null;

  // Clicking a card previews it AND persists it as the content focus avatar.
  const pickAvatar = (a: OfferAvatar) => {
    setSelectedId(a.id);
    saveFocus.mutate(a.source_file || a.id);
  };

  // Lock body scroll while the slide-over is open, same pattern as ReelPanel.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="open positioning / who this is for"
        style={{ ...createButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
        positioning
      </button>

      {open && (
        <div className="ytav-wrap" onClick={() => setOpen(false)}>
          <aside className="ytav-panel" onClick={(e) => e.stopPropagation()}>
            <header className="ytav-panel__head">
              <div>
                <span className="ytav__eyebrow">your avatar · who this is for</span>
                <h2 className="ytav-panel__title">the human you're talking to</h2>
              </div>
              <button type="button" className="ytav__btn ytav__btn--ghost" onClick={() => setOpen(false)}>close</button>
            </header>

            {/* ─── TOP: overall positioning (who you help / before / after /
                value tags). Edited inline; persists to /api/reputation/slots. */}
            {anchor && (
              <div className="ytav__body" style={{ paddingBottom: 0 }}>
                <div style={{ paddingBottom: 18, marginBottom: 18, borderBottom: '1px solid var(--hairline)' }}>
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                      positioning
                    </span>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                      the overall human you're speaking to. inherited from your reputation profile.
                    </p>
                  </div>
                  <PositioningField
                    slot="who_you_help"
                    value={anchor.who_you_help}
                    label="who you help"
                    placeholder="The exact human you serve. Who they are, what they do, what makes them ready."
                    onSave={onSlotSave}
                    large
                  />
                  <div className="ytav__pair" style={{ marginTop: 14 }}>
                    <PositioningSide
                      label="before"
                      dotColor="#ff6b6b"
                      slot="before_state"
                      value={anchor.before_state}
                      placeholder="The treadmill. The stuck place. The recurring frustration."
                      onSave={onSlotSave}
                    />
                    <span className="ytav__arrow">→</span>
                    <PositioningSide
                      label="after"
                      dotColor="var(--recovery)"
                      slot="after_state"
                      value={anchor.after_state}
                      placeholder="The lifestyle. The cadence. The day-to-day after you've helped them."
                      onSave={onSlotSave}
                    />
                  </div>
                  <div className="ytav__tags" style={{ marginTop: 14 }}>
                    <PositioningTags
                      label="value I share"
                      accent="var(--recovery)"
                      tags={anchor.value_share_tags}
                      onChange={(tags) => onSlotSave('value_share_tags', tags.join('|') || null)}
                    />
                    <PositioningTags
                      label="value I don't share"
                      accent="#ff6b6b"
                      tags={anchor.value_dont_share_tags}
                      onChange={(tags) => onSlotSave('value_dont_share_tags', tags.join('|') || null)}
                    />
                  </div>
                </div>
              </div>
            )}

            {avatars.length === 0 && (
              <p className="muted" style={{ fontSize: 'var(--body-sm)', padding: 'var(--space-3) var(--space-4)' }}>
                no avatars yet. add some from the Offer page (Avatars section at the top) and they'll show up here.
              </p>
            )}

            {avatars.length > 0 && (
              <div className="ytav__body">
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
                    your avatars
                  </span>
                  <p className="muted" style={{ margin: '2px 0 0', fontSize: 11 }}>
                    each specific avatar inside that positioning. click one to set it as your content focus - the person your YouTube and Instagram skills write for.
                  </p>
                </div>
                {/* Card grid - same .av-card pattern as the per-offer
                    avatar picker. Click any card to show that avatar's
                    profile below. */}
                <div className="av-bank" style={{ ['--av-card-accent' as any]: 'var(--recovery)' }}>
                  <div className="av-cards">
                    {avatars.map((a) => {
                      const isSelected = a.id === selectedId;
                      const isFocus = focusAvatar?.id === a.id;
                      const imgUrl = a.image_path
                        ? `/api/vault-asset/${encodeURI(a.image_path)}`
                        : null;
                      const blurb = (a.card_summary || a.one_line || 'no description yet')
                        .replace(/\s+/g, ' ')
                        .trim();
                      const short = blurb.length > 180 ? blurb.slice(0, 180).trimEnd() + '…' : blurb;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className={`av-card ${isSelected ? 'av-card--open' : ''}`}
                          onClick={() => pickAvatar(a)}
                          style={{ ['--av-card-accent' as any]: 'var(--recovery)' }}
                        >
                          <div className={`av-card__img ${imgUrl ? '' : 'av-card__img--empty'}`}>
                            {imgUrl ? (
                              <img src={imgUrl} alt={`${a.name ?? 'avatar'} portrait`} />
                            ) : (
                              <span className="av-card__img-empty-label">no image</span>
                            )}
                          </div>
                          <div className="av-card__body">
                            <span className="av-card__name">{a.name ?? '(unnamed)'}</span>
                            <p className="av-card__desc">{short}</p>
                          </div>
                          <span className="av-card__caret">{isFocus ? '✓ focus' : isSelected ? '→' : '→'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected avatar's profile - read-only summary of the
                    fields they've filled in. Editing happens on the
                    Offer page; this panel is a "see who I'm talking to"
                    surface for the Content page. */}
                {selected && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 16,
                      border: '1px solid var(--recovery)',
                      borderRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--recovery)', fontWeight: 700 }}>
                        profile · {selected.name}
                      </span>
                      {selected.card_summary && (
                        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5 }}>
                          {selected.card_summary}
                        </p>
                      )}
                    </div>

                    {selected.one_line && (
                      <ProfileBlock label="who they are">
                        {selected.one_line}
                      </ProfileBlock>
                    )}
                    {selected.before_state && (
                      <ProfileBlock label="before" dotColor="#ff6b6b">
                        {selected.before_state}
                      </ProfileBlock>
                    )}
                    {selected.after_state && (
                      <ProfileBlock label="after" dotColor="var(--recovery)">
                        {selected.after_state}
                      </ProfileBlock>
                    )}
                    {(selected.struggles?.length ?? 0) > 0 && (
                      <ProfileBlock label="what they struggle with" dotColor="#ff6b6b">
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {selected.struggles.map((s, i) => (
                            <li key={i} style={{ fontSize: 13, lineHeight: 1.45 }}>{s}</li>
                          ))}
                        </ul>
                      </ProfileBlock>
                    )}
                    {(selected.outcomes?.length ?? 0) > 0 && (
                      <ProfileBlock label="what they want" dotColor="var(--recovery)">
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {selected.outcomes.map((s, i) => (
                            <li key={i} style={{ fontSize: 13, lineHeight: 1.45 }}>{s}</li>
                          ))}
                        </ul>
                      </ProfileBlock>
                    )}
                    <p className="muted" style={{ margin: 0, fontSize: 11, fontStyle: 'italic' }}>
                      edit avatar details on the Offer page · Avatars section
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* Re-inject the .av-card styles - they normally only ship
                with the AvatarBank on the Offer page. */}
            <style>{AV_BANK_CSS}</style>
          </aside>
        </div>
      )}

      <style>{YTAV_CSS}</style>
    </>
  );
}

// Small labeled block used by the read-only profile preview below the
// card grid. The optional dotColor matches the old "before / after"
// red/green dot motif so the visual semantics carry across.
function ProfileBlock({
  label,
  dotColor,
  children,
}: {
  label: string;
  dotColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
        {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />}
        {label}
      </span>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
        {children}
      </div>
    </div>
  );
}


// ─── Positioning helpers (used by the top section of the panel) ──────────
// Same shape as the older Field/Side/Tags helpers - powered the click-to-
// edit reputation slots ("who you help", "before/after", value chips).
// Kept as Positioning* names so they read like what they actually do now.

function PositioningField({
  slot,
  value,
  label,
  placeholder,
  onSave,
  large,
}: {
  slot: string;
  value: string | null | undefined;
  label?: string;
  placeholder: string;
  onSave: (slot: string, value: string | null) => void;
  large?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  const hasValue = !!value?.trim();
  return (
    <div className="ytav__field">
      {label && <span className="ytav__field-label">{label}</span>}
      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, Math.ceil((draft.length || 80) / 90))}
            className="ytav__textarea"
            placeholder={placeholder}
          />
          <div className="ytav__actions">
            <button type="button" className="ytav__btn ytav__btn--ghost" onClick={() => setEditing(false)}>cancel</button>
            <button
              type="button"
              className="ytav__btn ytav__btn--primary"
              onClick={() => { onSave(slot, draft.trim() || null); setEditing(false); }}
            >save</button>
          </div>
        </>
      ) : (
        <div className={`ytav__view ${hasValue ? '' : 'ytav__view--empty'}`} onClick={() => setEditing(true)}>
          {hasValue ? (
            <p className={`ytav__view-text ${large ? 'ytav__view-text--lg' : ''}`}>{value}</p>
          ) : (
            <p className="ytav__view-placeholder">{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PositioningSide({
  label,
  dotColor,
  slot,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  dotColor: string;
  slot: string;
  value: string | null | undefined;
  placeholder: string;
  onSave: (slot: string, value: string | null) => void;
}) {
  return (
    <div className="ytav__side">
      <div className="ytav__side-head">
        <span className="ytav__side-dot" style={{ background: dotColor }} />
        <span className="ytav__side-label">{label}</span>
      </div>
      <PositioningField slot={slot} value={value} placeholder={placeholder} onSave={onSave} />
    </div>
  );
}

function PositioningTags({
  label,
  accent,
  tags,
  onChange,
}: {
  label: string;
  accent: string;
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="ytav__tagcol">
      <span className="ytav__field-label" style={{ color: accent }}>{label}</span>
      <div className="ytav__tagrow">
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="ytav__chip"
            style={{ background: alpha(accent, 0.13), color: accent, borderColor: alpha(accent, 0.26) }}
          >
            {t}
            <button
              type="button"
              className="ytav__chip-x"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              aria-label="remove"
            >×</button>
          </span>
        ))}
        <input
          className="ytav__chip-input"
          placeholder="add tag…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) { onChange([...tags, draft.trim()]); setDraft(''); }
          }}
          onBlur={() => { if (draft.trim()) { onChange([...tags, draft.trim()]); setDraft(''); } }}
          style={{ borderColor: alpha(accent, 0.25) }}
        />
      </div>
    </div>
  );
}

function alpha(c: string, a: number): string {
  if (c.startsWith('var('))
    return c.replace('var(', 'color-mix(in srgb, var(').replace(/\)$/, `) ${Math.round(a * 100)}%, transparent)`);
  if (c.startsWith('#') && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

const YTAV_CSS = `
/* ─── Legacy .ytav (collapsible block) ─────────────────────────────────
   Kept because <FocusCtaEditor /> still uses the collapsible pattern
   (.ytav .ytav__head .ytav__head--open .ytav__icon-wrap .ytav__caret).
   AvatarToggle itself no longer renders these - it uses .ytav-trigger
   + .ytav-panel below. */
.ytav {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.ytav__head {
  width: 100%;
  background: none;
  border: none;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  text-align: left;
  transition: background 0.15s;
}
.ytav__head:hover { background: rgba(255,255,255,0.02); }
.ytav__head--open {
  background: color-mix(in srgb, var(--recovery) 4%, transparent);
  border-bottom: 1px solid var(--hairline);
}
.ytav__icon-wrap svg { width: 36px; height: 36px; display: block; }
.ytav__head-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ytav__head-sub {
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ytav__caret { color: var(--muted); font-size: 1.4rem; flex-shrink: 0; }

/* ─── Compact trigger button (top-right of page header) ────────────── */
.ytav-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 14px 6px 6px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--hairline);
  background: var(--surface);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, background 0.15s;
  white-space: nowrap;
}
.ytav-trigger:hover {
  border-color: color-mix(in srgb, var(--recovery) 50%, var(--hairline));
  transform: translateY(-1px);
}
.ytav-trigger__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ytav-trigger__icon svg { width: 28px; height: 28px; display: block; }
.ytav-trigger__label {
  color: var(--recovery);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
  font-weight: 700;
}

/* ─── Slide-over panel ──────────────────────────────────────────────── */
.ytav-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: ytav-fade 0.18s ease-out;
}
@keyframes ytav-fade { from { opacity: 0; } to { opacity: 1; } }
.ytav-panel {
  width: min(680px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--recovery);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: ytav-slide 0.22s ease-out;
}
@keyframes ytav-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.ytav-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
}
.ytav-panel__title {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.45rem;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

/* Legacy in-card body (used by FocusCtaEditor's collapsible). */
.ytav__body {
  padding: var(--space-4) var(--space-5) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
/* In-panel body (used by AvatarToggle's slide-over). Drop the padding
   since the panel itself already has padding. */
.ytav-panel .ytav__body { padding: 0; }

.ytav__field { display: flex; flex-direction: column; gap: 6px; }
.ytav__field-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.ytav__eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--recovery);
  font-weight: 700;
}
.ytav__view {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: text;
  border: 1px solid transparent;
  transition: background 0.15s;
}
.ytav__view:hover { background: rgba(255,255,255,0.03); border-color: var(--hairline); }
.ytav__view--empty { background: rgba(255,255,255,0.02); border-color: var(--hairline); }
.ytav__view-text { margin: 0; line-height: 1.55; font-size: var(--body); white-space: pre-wrap; }
.ytav__view-text--lg { font-size: var(--body-lg); font-weight: 500; letter-spacing: -0.005em; }
.ytav__view-placeholder { margin: 0; line-height: 1.55; font-size: var(--body-sm); color: var(--muted-2); font-style: italic; }
.ytav__textarea {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  line-height: 1.55;
  resize: vertical;
  min-height: 80px;
  outline: none;
}
.ytav__textarea:focus { border-color: var(--recovery); background: rgba(255,255,255,0.06); }

.ytav__actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
.ytav__btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
}
.ytav__btn--primary { background: #EDEDE9; color: #16140F; border: 1.5px solid #16140F; box-shadow: 0 1px 3px rgba(15,15,15,0.06), 0 4px 12px -2px rgba(15,15,15,0.07); }
.ytav__btn--ghost { background: transparent; color: var(--muted); border-color: var(--hairline); }
.ytav__btn--ghost:hover { color: var(--ink); border-color: var(--ink); }

.ytav__pair {
  display: grid;
  grid-template-columns: 1fr 28px 1fr;
  gap: var(--space-3);
  align-items: stretch;
}
.ytav__arrow { align-self: center; color: var(--muted); font-size: 1.2rem; text-align: center; opacity: 0.55; }
@media (max-width: 640px) {
  .ytav__pair { grid-template-columns: 1fr; }
  .ytav__arrow { transform: rotate(90deg); }
}
.ytav__side {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ytav__side-head { display: flex; align-items: center; gap: 6px; }
.ytav__side-dot { width: 6px; height: 6px; border-radius: 50%; }
.ytav__side-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--muted);
}

.ytav__tags { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 640px) { .ytav__tags { grid-template-columns: 1fr; } }
.ytav__tagcol { display: flex; flex-direction: column; gap: 6px; }
.ytav__tagrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ytav__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}
.ytav__chip-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.55;
}
.ytav__chip-x:hover { opacity: 1; }
.ytav__chip-input {
  background: transparent;
  border: 1px dashed var(--hairline);
  color: var(--ink);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-family: inherit;
  width: 90px;
  outline: none;
}
.ytav__chip-input:focus { background: rgba(255,255,255,0.04); }
`;
