import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

/**
 * Channel CTA editor. The "where do you point viewers" line that feeds:
 *   - the IG caption generator (POST /api/instagram/queue/:id/caption)
 *   - the YT description generator (POST /api/videos/:id/description)
 *
 * channel="instagram" edits instagram_cta_*; channel="youtube" edits
 * youtube_cta_*. The two are independent on the backend so each channel can
 * point at a different offer.
 *
 * Lives directly under <AvatarToggle/> on each page. Same collapsible
 * visual treatment as AvatarToggle so they feel like one block.
 */
export function FocusCtaEditor({ channel }: { channel: 'instagram' | 'youtube' }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const save = useMutation({
    mutationFn: (body: {
      instagram_cta_text?: string;
      instagram_cta_url?: string;
      youtube_cta_text?: string;
      youtube_cta_url?: string;
    }) => api.updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const isIg = channel === 'instagram';
  const ctaText = (isIg ? data?.instagram_cta_text : data?.youtube_cta_text) ?? '';
  const ctaUrl = (isIg ? data?.instagram_cta_url : data?.youtube_cta_url) ?? '';
  const eyebrow = isIg
    ? 'your instagram CTA · what you point viewers to'
    : 'your youtube CTA · what you point viewers to';
  const hint = isIg
    ? 'this is the call to action. the caption generator for Instagram will pull from this. change it once here and every new draft uses it.'
    : 'this is the call to action. the description generator for YouTube will pull from this. change it once here and every new draft uses it.';

  function saveText(v: string) {
    save.mutate(isIg ? { instagram_cta_text: v } : { youtube_cta_text: v });
  }
  function saveUrl(v: string) {
    save.mutate(isIg ? { instagram_cta_url: v } : { youtube_cta_url: v });
  }

  return (
    <div className="ytav fce">
      <button
        type="button"
        className={`ytav__head ${open ? 'ytav__head--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ytav__icon-wrap">
          <ArrowSvg />
        </span>
        <span className="ytav__head-text">
          <span className="ytav__eyebrow">{eyebrow}</span>
          <span className="ytav__head-sub">
            {ctaText ? truncate(ctaText, 90) : 'the line and link the generator pulls from'}
          </span>
        </span>
        <span className="ytav__caret">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="ytav__body">
          <Field
            label="CTA line"
            placeholder={isIg
              ? 'want my system for building a one-person business that fits your brain? link in bio.'
              : 'want my system for building a one-person business that fits your brain? join my free community.'}
            value={ctaText}
            multiline
            onSave={saveText}
          />
          <Field
            label="link"
            placeholder="https://..."
            value={ctaUrl}
            onSave={saveUrl}
          />
          <p className="fce__hint muted">{hint}</p>
        </div>
      )}

      <style>{FCE_CSS}</style>
    </div>
  );
}

function ArrowSvg() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="23" fill="rgba(255,255,255,0.04)" stroke="var(--hairline)" />
      <path
        d="M14 24 L30 24 M24 18 L30 24 L24 30"
        fill="none"
        stroke="var(--strain)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function truncate(s: string, n: number) {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : flat.slice(0, n).trimEnd() + '…';
}

function Field({
  label,
  value,
  placeholder,
  onSave,
  multiline,
}: {
  label: string;
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const hasValue = !!value?.trim();
  return (
    <div className="ytav__field">
      <span className="ytav__field-label">{label}</span>
      {editing ? (
        <>
          {multiline ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(2, Math.ceil((draft.length || 80) / 90))}
              className="ytav__textarea"
              placeholder={placeholder}
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="ytav__textarea"
              placeholder={placeholder}
              style={{ minHeight: 0 }}
            />
          )}
          <div className="ytav__actions">
            <button type="button" className="ytav__btn ytav__btn--ghost" onClick={() => { setEditing(false); setDraft(value); }}>cancel</button>
            <button
              type="button"
              className="ytav__btn ytav__btn--primary"
              onClick={() => { onSave(draft.trim()); setEditing(false); }}
            >
              save
            </button>
          </div>
        </>
      ) : (
        <div
          className={`ytav__view ${hasValue ? '' : 'ytav__view--empty'}`}
          onClick={() => setEditing(true)}
        >
          {hasValue ? (
            <p className="ytav__view-text">{value}</p>
          ) : (
            <p className="ytav__view-placeholder">{placeholder}</p>
          )}
        </div>
      )}
    </div>
  );
}

const FCE_CSS = `
.fce { margin-top: var(--space-3); }
.fce .ytav__eyebrow { color: var(--strain); }
.fce .ytav__head--open { background: color-mix(in srgb, var(--strain) 5%, transparent); }
.fce__hint {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.5;
  padding: var(--space-2) var(--space-3);
  border-left: 2px solid color-mix(in srgb, var(--strain) 40%, transparent);
  background: rgba(255,255,255,0.02);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
`;
