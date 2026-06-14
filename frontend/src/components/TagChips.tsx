/**
 * Topic-tag chip editor. the creator's topic taxonomy is locked to 8 options (see
 * lib/topics.ts) — you don't type freeform, you pick from the dropdown.
 *
 * Slash-namespaced YAML metadata tags (e.g. type/asset, domain/povs) are
 * filtered out at display time so they never show up to the creator.
 *
 * Existing freeform tags that DON'T match the allowed list still render so
 * old data isn't silently lost; she can remove them with × if she wants.
 *
 * Controlled component — parent owns the topics array and saves on change.
 */

import { useEffect, useRef, useState } from 'react';
import { ALLOWED_TOPICS, cleanTopics } from '../lib/topics';

export function TagChips({
  topics,
  onChange,
  color,
  placeholder = '+ tag',
  size = 'normal',
}: {
  topics: string[];
  onChange: (next: string[]) => void;
  color?: string;
  placeholder?: string;
  size?: 'normal' | 'small';
}) {
  // Drop slash-namespaced metadata at the boundary. The persisted array can
  // still contain them (we don't mutate the parent's source), but the user
  // never sees them in the picker.
  const visible = cleanTopics(topics);
  const [local, setLocal] = useState<string[]>(visible);
  useEffect(() => { setLocal(visible); }, [visible.join('|')]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function add(t: string) {
    if (local.includes(t)) return;
    const next = [...local, t];
    setLocal(next);
    // Preserve any persisted-but-hidden tags from parent (slash-namespaced)
    // by merging into the original array rather than replacing.
    const hidden = (topics ?? []).filter((x) => !cleanTopics([x]).length);
    onChange([...hidden, ...next]);
    setPickerOpen(false);
  }

  function remove(i: number) {
    const next = local.filter((_, idx) => idx !== i);
    setLocal(next);
    const hidden = (topics ?? []).filter((x) => !cleanTopics([x]).length);
    onChange([...hidden, ...next]);
  }

  const isSmall = size === 'small';
  const fontSize = isSmall ? 10 : 11;
  const padding = isSmall ? '2px 8px' : '3px 10px';
  const available = ALLOWED_TOPICS.filter((t) => !local.includes(t));

  return (
    <div
      ref={rootRef}
      className="tg-chips"
      style={{
        borderTop: '1px dashed var(--hairline)',
        paddingTop: 8,
        marginTop: 4,
        position: 'relative',
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--muted)',
          fontWeight: 700,
          marginRight: 6,
        }}
      >
        topics:
      </span>
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', verticalAlign: 'middle' }}>
        {local.map((t, i) => {
          const isLegacy = !(ALLOWED_TOPICS as readonly string[]).includes(t);
          return (
            <span
              key={`${t}-${i}`}
              className="tg-chip"
              title={isLegacy ? 'legacy tag — not in the current 8. click × to remove.' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding,
                borderRadius: 'var(--radius-pill)',
                fontSize,
                fontWeight: 600,
                background: color ? `color-mix(in srgb, ${color} 12%, transparent)` : 'rgba(255,255,255,0.06)',
                color: color || 'var(--muted)',
                border: `1px solid ${
                  isLegacy
                    ? 'rgba(255,180,80,0.45)'
                    : color
                      ? `color-mix(in srgb, ${color} 30%, var(--hairline))`
                      : 'transparent'
                }`,
                opacity: isLegacy ? 0.7 : 1,
                fontStyle: isLegacy ? 'italic' : 'normal',
              }}
            >
              {t}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`remove ${t}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: 0.55,
                  fontSize: 14,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.55'; }}
              >
                ×
              </button>
            </span>
          );
        })}

        {available.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px dashed var(--hairline)',
              color: 'var(--muted)',
              padding,
              borderRadius: 'var(--radius-pill)',
              fontSize,
              fontFamily: 'inherit',
              cursor: 'pointer',
              fontWeight: 600,
              letterSpacing: 0.2,
            }}
          >
            {placeholder}
          </button>
        )}

        {pickerOpen && available.length > 0 && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              zIndex: 30,
              background: 'var(--bg)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              padding: 6,
              minWidth: 180,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {available.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => add(t)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  fontSize: 12,
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}
