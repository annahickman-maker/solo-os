/**
 * Build a YouTube script from approved bank items, organized into sections.
 *
 * Sections (default): Intro -> Reframe -> Value 1..N -> Outro / CTA
 * Each section has a brief (what the creator wants in this section) and a list of
 * anchor bank items. Drag/drop anchors between sections, edit briefs, click
 * suggest to have Claude assign anchors per section, click draft to synthesize
 * each section independently using only its anchors + brief.
 *
 * Persists to the video file's frontmatter as `script_sections` so the creator can
 * close the modal and come back later without losing her work.
 */

import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BankItem, type BankKind, type ScriptSection, type SectionKind } from '../api';

const KIND_META: Record<BankKind, { label: string; color: string }> = {
  pov: { label: 'POV', color: 'var(--recovery)' },
  framework: { label: 'Teaching framework', color: 'var(--sleep)' },
  story: { label: 'Connection', color: '#E6A52F' },
  proof: { label: 'Proof', color: 'var(--strain)' },
};

const SECTION_KIND_HINTS: Record<SectionKind, string> = {
  intro: 'emphasise the result. increase anticipation for the value coming. show the size of the outcome.',
  context: 'either shift a belief or give framing the viewer needs. set up the value sections.',
  value: 'one teaching point. a framework walked end-to-end (why → what → how → payoff).',
  cta: 'soft pitch for the offer. barrier → shortcut → casual invite. not pushy.',
  outro: 'reinforce the transformation. curiosity gap for the next video. tight sign-off.',
};

// Normalise legacy persisted sections (`reframe` -> `context`).
function normalizeKind(k: string): SectionKind {
  if (k === 'reframe') return 'context';
  if (k === 'intro' || k === 'context' || k === 'value' || k === 'cta' || k === 'outro') return k;
  return 'value';
}

const DEFAULT_SECTIONS = (): ScriptSection[] => [
  { id: 'intro', label: 'Intro', kind: 'intro', brief: '', anchor_ids: [] },
  { id: 'context', label: 'Context', kind: 'context', brief: '', anchor_ids: [] },
  { id: 'value-1', label: 'Value point 1', kind: 'value', brief: '', anchor_ids: [] },
  { id: 'value-2', label: 'Value point 2', kind: 'value', brief: '', anchor_ids: [] },
  { id: 'value-3', label: 'Value point 3', kind: 'value', brief: '', anchor_ids: [] },
  { id: 'cta', label: 'CTA', kind: 'cta', brief: '', anchor_ids: [] },
  { id: 'outro', label: 'Outro', kind: 'outro', brief: '', anchor_ids: [] },
];

/**
 * Imperative handle exposed via ref. Parent calls flush() before closing to
 * synchronously commit any pending in-memory section changes to disk.
 */
export type VideoScriptBuilderHandle = {
  flush: () => Promise<void>;
};

export const VideoScriptBuilder = forwardRef<VideoScriptBuilderHandle, {
  videoId: string;
  videoTitle: string;
  initialSections?: ScriptSection[] | null;
  videoGoal?: string | null;
}>(function VideoScriptBuilder({
  videoId,
  initialSections,
  videoGoal,
}, ref) {
  const qc = useQueryClient();
  const transformation = videoGoal ?? '';
  const [sections, setSections] = useState<ScriptSection[]>(
    initialSections && initialSections.length > 0
      ? initialSections.map((s) => ({
          ...s,
          kind: normalizeKind(s.kind as string),
          // Auto-rename legacy 'Reframe' label to 'Context' to match the new kind
          label: s.label === 'Reframe' ? 'Context' : s.label,
        }))
      : DEFAULT_SECTIONS()
  );
  const [pickerForSection, setPickerForSection] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ anchorId: string; fromSection: string } | null>(null);
  const [hoverSection, setHoverSection] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<{
    sections: Array<{ section_id: string; label: string; text: string }>;
  } | null>(null);

  const banksQuery = useQuery({ queryKey: ['banks'], queryFn: api.listBanks });
  const allItems = banksQuery.data?.items ?? [];
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  // The "+ add proof" picker pulls from the regular approved bank PLUS the
  // wins bank from the authority section (brag bank + customer/client wins).
  // Reputation is fetched here once and exposed to SectionBox via the
  // proofItems prop below.
  const reputationQuery = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const proofItems = useMemo<BankItem[]>(() => {
    const fromBank = allItems.filter((i) => i.kind === 'proof');
    const wins = reputationQuery.data?.dimensions?.find?.((d) => d.id === 'authority')?.wins_bank ?? [];
    const fromWins: BankItem[] = wins
      .filter((w) => w.status !== 'rejected')
      .map((w) => ({
        id: `win-${w.id}`,
        kind: 'proof' as BankKind,
        text: (w.body && w.body.trim() ? w.body.trim() : w.title) || '',
        title: w.title || null,
        // Surface the win type (own / student / client) in the context so
        // the creator can scan the picker and immediately see what kind of brag
        // each row is. Date too if available.
        context: [
          w.kind === 'own' ? 'own win'
            : w.kind === 'student' ? 'student win'
            : 'client win',
          w.date ? new Date(w.date * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '',
        ].filter(Boolean).join(' · '),
        source_transcript: w.source_episode ?? null,
        source_timestamp: null,
        source_moments: [],
        topics: w.tags ?? [],
      }));
    return [...fromBank, ...fromWins];
  }, [allItems, reputationQuery.data]);

  // ─── Auto-save sections (serialized, with explicit flush) ───────────────
  // Pattern:
  //   1. Debounce 300ms after the last sections change
  //   2. A save in flight blocks new saves; the latest pending value is
  //      queued and fires when the current one returns (last-write-wins,
  //      no out-of-order races)
  //   3. flush() callable via ref - parent calls it BEFORE unmounting so
  //      pending changes are committed before the modal closes
  const lastSavedJsonRef = useRef<string>('');
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const queueRef = useRef<{ inFlight: boolean; pending: ScriptSection[] | null }>({
    inFlight: false,
    pending: null,
  });

  async function doSave(secs: ScriptSection[]): Promise<void> {
    const json = JSON.stringify(secs);
    if (json === lastSavedJsonRef.current) return;
    const q = queueRef.current;
    if (q.inFlight) {
      q.pending = secs;
      return;
    }
    q.inFlight = true;
    try {
      await api.saveScriptSections(videoId, secs);
      lastSavedJsonRef.current = json;
    } catch {
      // swallow - status pill not yet wired here; user will retry naturally
    } finally {
      q.inFlight = false;
    }
    if (q.pending) {
      const next = q.pending;
      q.pending = null;
      // Don't await - return immediately so the caller's debounce keeps flowing.
      void doSave(next);
    }
  }

  // Set initial baseline so we don't save what we just loaded.
  useEffect(() => {
    lastSavedJsonRef.current = JSON.stringify(sectionsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Debounced save on sections change.
  useEffect(() => {
    const json = JSON.stringify(sections);
    if (json === lastSavedJsonRef.current) return;
    const t = setTimeout(() => { void doSave(sections); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, videoId]);

  // Expose flush() to the parent. Called BEFORE the modal unmounts so any
  // pending changes are guaranteed to land on disk.
  useImperativeHandle(ref, () => ({
    async flush() {
      const current = sectionsRef.current;
      const json = JSON.stringify(current);
      if (json === lastSavedJsonRef.current) return;
      // Wait for any in-flight save to settle, then commit the latest.
      while (queueRef.current.inFlight) {
        await new Promise((r) => setTimeout(r, 30));
      }
      await api.saveScriptSections(videoId, current).catch(() => {});
      lastSavedJsonRef.current = json;
    },
  }), [videoId]);

  function patchSection(id: string, patch: Partial<ScriptSection>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function moveAnchor(from: string, to: string, anchorId: string, beforeAnchorId?: string) {
    setSections((prev) => {
      const next = prev.map((s) => {
        if (s.id === from) {
          return { ...s, anchor_ids: s.anchor_ids.filter((a) => a !== anchorId) };
        }
        return s;
      });
      return next.map((s) => {
        if (s.id === to) {
          const ids = s.anchor_ids.filter((a) => a !== anchorId);
          const idx = beforeAnchorId ? ids.indexOf(beforeAnchorId) : -1;
          if (idx === -1) ids.push(anchorId);
          else ids.splice(idx, 0, anchorId);
          return { ...s, anchor_ids: ids };
        }
        return s;
      });
    });
  }
  function addAnchor(sectionId: string, anchorId: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId && !s.anchor_ids.includes(anchorId)
        ? { ...s, anchor_ids: [...s.anchor_ids, anchorId] }
        : s))
    );
  }
  function removeAnchor(sectionId: string, anchorId: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, anchor_ids: s.anchor_ids.filter((a) => a !== anchorId) } : s))
    );
  }
  function addValueSection() {
    const count = sections.filter((s) => s.kind === 'value').length;
    const id = `value-${count + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const newSection: ScriptSection = {
      id,
      label: `Value point ${count + 1}`,
      kind: 'value',
      brief: '',
      anchor_ids: [],
    };
    // Insert before the first cta or outro section (whichever comes first)
    setSections((prev) => {
      const closingIdx = prev.findIndex((s) => s.kind === 'cta' || s.kind === 'outro');
      if (closingIdx === -1) return [...prev, newSection];
      return [...prev.slice(0, closingIdx), newSection, ...prev.slice(closingIdx)];
    });
  }
  function removeSection(id: string) {
    setSections((prev) => prev.filter((s) => s.id !== id));
  }

  const suggest = useMutation({
    mutationFn: () =>
      // We send the current anchor_ids per section as `locked` so Claude
      // treats them as already-chosen and only suggests COMPLEMENTS that
      // round out each section without conflicting with what the creator already
      // picked. The merge below preserves her picks at the top of each
      // section and appends any new suggestions after.
      api.suggestAnchorsBySection(videoId, {
        transformation: transformation || undefined,
        sections: sections.map((s) => ({
          id: s.id,
          label: s.label,
          kind: s.kind,
          brief: s.brief,
          locked_anchor_ids: s.anchor_ids,
        })),
      }),
    onSuccess: (data) => {
      // Additive merge: keep every existing pick in place (the creator may have
      // dragged them, ordered them, or hand-picked them), then append the
      // new suggestions after, deduplicating across the whole video.
      setSections((prev) => {
        const usedAcrossVideo = new Set<string>();
        // First pass: mark every existing pick as used (they survive).
        prev.forEach((s) => s.anchor_ids.forEach((id) => usedAcrossVideo.add(id)));
        // Second pass: for each section, append Claude's NEW picks
        // (skipping any that are already used somewhere on the video).
        return prev.map((s) => {
          const ass = data.assignments.find((a) => a.section_id === s.id);
          if (!ass) return s;
          const additions: string[] = [];
          for (const p of ass.picks) {
            if (!usedAcrossVideo.has(p.anchor_id)) {
              additions.push(p.anchor_id);
              usedAcrossVideo.add(p.anchor_id);
            }
          }
          if (additions.length === 0) return s;
          return { ...s, anchor_ids: [...s.anchor_ids, ...additions] };
        });
      });
    },
  });

  const draft = useMutation({
    mutationFn: () =>
      api.draftSectionedScript(videoId, {
        transformation: transformation || undefined,
        sections,
        save: true,
      }),
    onSuccess: (data) => {
      setLastDraft({ sections: data.sections });
      qc.invalidateQueries({ queryKey: ['video', videoId] });
    },
  });

  const totalAnchors = sections.reduce((acc, s) => acc + s.anchor_ids.length, 0);

  return (
    <>
      <style>{SB_CSS}</style>
      <div className="stack" style={{ gap: 'var(--space-4)' }}>
        {/* Goal of the video is read from videoGoal prop (set on the card)
            and used as the suggest + draft steering prompt below. No
            in-builder input - one source of truth lives on the card. */}

        {/* Top action: suggest stories. Draft script lives under outro
            because that's the natural next step after every section is
            filled. */}
        <div className="sb-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => suggest.mutate()}
            disabled={suggest.isPending || allItems.length === 0}
          >
            {suggest.isPending ? 'suggesting…' : totalAnchors > 0 ? 're-suggest stories' : 'suggest stories'}
          </button>
        </div>
        {suggest.isError && (
          <p style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)', margin: 0 }}>
            suggest failed: {(suggest.error as Error)?.message}
          </p>
        )}

        {/* Section boxes. "+ add value point" is rendered right after the
            last non-closing section (intro / context / value) so it always
            shows up - even when every value section has been removed and
            sections is just intro → context → cta → outro. Previously it was
            anchored to the last value section, which vanished when there
            were no value sections left. */}
        <div className="sb-sections">
          {(() => {
            // Index of the last section that isn't cta/outro. The add button
            // lands right after this row when no value sections exist, so the
            // user can re-seed.
            let lastNonClosing = -1;
            sections.forEach((s, i) => {
              if (s.kind !== 'cta' && s.kind !== 'outro') lastNonClosing = i;
            });
            const hasAnyValue = sections.some((s) => s.kind === 'value');
            return sections.map((section, idx) => {
              const next = sections[idx + 1];
              const isLastValue = section.kind === 'value' && (!next || next.kind !== 'value');
              const isInsertSlot = !hasAnyValue && idx === lastNonClosing;
              const showAddButton = isLastValue || isInsertSlot;
              return (
                <Fragment key={section.id}>
                  <SectionBox
                    section={section}
                    videoId={videoId}
                    byId={byId}
                    proofItems={proofItems}
                    canRemove={section.kind === 'value'}
                    isHovered={hoverSection === section.id}
                    isDragging={!!dragging}
                    onBriefChange={(brief) => patchSection(section.id, { brief })}
                    onRemoveAnchor={(aid) => removeAnchor(section.id, aid)}
                    onPick={() => setPickerForSection(section.id)}
                    onRemoveSection={() => removeSection(section.id)}
                    onDragStart={(anchorId) => setDragging({ anchorId, fromSection: section.id })}
                    onDragEnd={() => { setDragging(null); setHoverSection(null); }}
                    onDragOver={() => setHoverSection(section.id)}
                    onDrop={(beforeAnchorId) => {
                      if (dragging) {
                        moveAnchor(dragging.fromSection, section.id, dragging.anchorId, beforeAnchorId);
                        setDragging(null);
                        setHoverSection(null);
                      }
                    }}
                  />
                  {showAddButton && (
                    <div className="sb-add-section">
                      <button type="button" className="btn btn--ghost" onClick={addValueSection}>
                        + add value point
                      </button>
                    </div>
                  )}
                </Fragment>
              );
            });
          })()}
        </div>

        {/* Bottom action: draft the whole script from every section's stories
            + brief. Sits under outro because that's the last section - hit
            this once the rest is filled in. */}
        <div className="sb-actions" style={{ justifyContent: 'center', marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => draft.mutate()}
            disabled={draft.isPending || totalAnchors < 2}
          >
            {draft.isPending ? 'drafting… (2-6 min)' : `draft script (${totalAnchors} stories)`}
          </button>
        </div>
        {draft.isError && (
          <p style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)', margin: 0, textAlign: 'center' }}>
            draft failed: {(draft.error as Error)?.message}
          </p>
        )}

        {/* Last draft summary */}
        {lastDraft && (
          <div className="sb-result">
            <p className="muted" style={{ fontSize: 'var(--body-sm)', margin: 0 }}>
              script saved to the video. open the script section above to read it.
            </p>
            <div className="sb-outline">
              <span className="eyebrow">drafted sections</span>
              {lastDraft.sections.map((s) => (
                <div key={s.section_id} className="sb-outline__row">
                  <span className="sb-outline__sec">{s.label}</span>
                  <span className="sb-outline__count">{s.text.split(/\s+/).length} words</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {pickerForSection && (
        <BankPicker
          items={allItems}
          selectedIdsAcrossAll={new Set(sections.flatMap((s) => s.anchor_ids))}
          onClose={() => setPickerForSection(null)}
          onAdd={(id) => addAnchor(pickerForSection, id)}
        />
      )}
    </>
  );
});

// ─── Intro draft button ───────────────────────────────────────────────────
// Lives in the SectionBox header for the intro section, alongside `+ add
// story`. Fires the suggest-intro endpoint and writes the serialized 5-part
// brief back through onResult so the editor re-parses and shows the new
// values. Visually matches the `+ add story` pill (same size, same shape)
// but with a solid white-tinted border to mark it as the more deliberate
// action - drafting replaces the entire intro, picking a story doesn't.
function IntroDraftButton({
  videoId,
  currentBrief,
  onResult,
}: {
  videoId: string;
  currentBrief: string;
  onResult: (serialized: string) => void;
}) {
  const draft = useMutation({
    mutationFn: () => api.suggestIntroFromScript(videoId),
    onSuccess: (data) => {
      const next: Record<IntroPartKey, string> = {
        clarity: data.parts.clarity ?? '',
        belief: data.parts.belief ?? '',
        contrarian: data.parts.contrarian ?? '',
        proof: data.parts.proof ?? '',
        outcome: data.parts.outcome ?? '',
      };
      onResult(serializeIntroBrief(next));
    },
  });
  const hasContent = currentBrief.trim().length > 0;
  return (
    <button
      type="button"
      className="sb-section__draft"
      onClick={() => {
        if (hasContent && !confirm('replace what\'s already in the 5 intro fields?')) return;
        draft.mutate();
      }}
      disabled={draft.isPending}
      title={
        draft.isError
          ? (draft.error as Error)?.message
          : 'read script body + section briefs + linked stories and propose the 5 intro pieces'
      }
    >
      {draft.isPending ? 'drafting…' : 'draft intro'}
    </button>
  );
}

// ─── Intro brief editor ───────────────────────────────────────────────────
// The intro section is special: instead of one freeform brief, the creator writes
// one sentence per element of her intro framework (clarity / belief /
// contrarian / proof / outcome). The five inputs are concatenated into the
// section's `brief` string using a labelled format Claude can read directly,
// and the same format is parsed back on load so each input shows the right
// piece. Non-intro sections keep the single-textarea behaviour.

const INTRO_PARTS = [
  {
    key: 'clarity',
    label: 'Clarity',
    placeholder: 'what this video is about + what they\'ll learn by the end. one sentence.',
  },
  {
    key: 'belief',
    label: 'Baseline belief',
    placeholder: 'the main objection or the dominant belief everyone else is saying on this subject.',
  },
  {
    key: 'contrarian',
    label: 'Contrarian',
    placeholder: 'your unique opinion. flip the belief above to raise curiosity.',
  },
  {
    key: 'proof',
    label: 'Proof',
    placeholder: 'the proof point you\'re using to back this video up.',
  },
  {
    key: 'outcome',
    label: 'Tangible outcome',
    placeholder: 'the actual tangible result / benefit they walk away with by the end of the video.',
  },
] as const;

type IntroPartKey = (typeof INTRO_PARTS)[number]['key'];

function parseIntroBrief(brief: string): Record<IntroPartKey, string> {
  const out: Record<IntroPartKey, string> = {
    clarity: '', belief: '', contrarian: '', proof: '', outcome: '',
  };
  if (!brief || typeof brief !== 'string') return out;
  // Each piece is stored as `**Label:** value` separated by blank lines. We
  // split the brief into runs that start at each `**Label:**` heading, then
  // assign by label. No regex backtracking, no infinite loop risk.
  const labelToKey: Record<string, IntroPartKey> = {
    clarity: 'clarity',
    'baseline belief': 'belief',
    belief: 'belief',
    contrarian: 'contrarian',
    proof: 'proof',
    'tangible outcome': 'outcome',
    outcome: 'outcome',
  };
  // Split on lines that look like a label heading. Keeps the heading text in
  // the result so we can route by label.
  const lines = brief.split(/\r?\n/);
  let currentKey: IntroPartKey | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentKey) {
      // Preserve typed whitespace verbatim. We only strip stray markdown
      // bold wrappers (legacy data with `**` baked in). DO NOT trim trailing
      // whitespace - that would eat every space the user types mid-edit and
      // make the textarea feel broken.
      let v = buffer.join('\n');
      // Strip ONLY the `**` markers, never surrounding whitespace - leading
      // and trailing spaces the user typed must survive the round trip.
      v = v.replace(/^\*{2}/, '').replace(/\*{2}$/, '');
      // Strip trailing NEWLINES only (the blank line that separates sections
      // in the serialised form gets absorbed into the previous section's
      // buffer otherwise, so every keystroke would accrue a `\n` and make
      // space/backspace feel like Enter). Trailing spaces stay intact.
      v = v.replace(/\n+$/, '');
      // Empty check is whether the value has any non-empty content at all.
      // We preserve raw whitespace if there's any character there - the
      // local-state in IntroBriefEditor is what actually gates the textarea.
      if (v !== '') out[currentKey] = v;
    }
    buffer = [];
  };
  for (const line of lines) {
    // Match the canonical serialized form `**Label:** value` with exactly
    // one space between `**` and the value, so any extra leading whitespace
    // the user typed becomes part of the captured value. Tolerates the
    // legacy `**Label**: value` and bare `Label: value` shapes too.
    // The capture group is greedy `(.*)` so trailing spaces are preserved.
    const m = line.match(/^\s*\*{0,2}\s*([A-Za-z][A-Za-z\s]*?)\s*\*{0,2}\s*:\s*\*{0,2} ?(.*)$/);
    const label = m?.[1]?.trim().toLowerCase();
    if (label && labelToKey[label]) {
      flush();
      currentKey = labelToKey[label]!;
      const rest = m![2]!;
      // Important: rest may end with a trailing space the user just typed.
      // Push it as-is. Empty string is also fine - flush will store '' below
      // if a follow-up line adds content.
      buffer.push(rest);
    } else if (currentKey) {
      buffer.push(line);
    }
  }
  flush();
  return out;
}

function serializeIntroBrief(parts: Record<IntroPartKey, string>): string {
  return INTRO_PARTS
    .map((p) => {
      const raw = parts[p.key];
      // Empty-check on the trimmed value (so a whitespace-only entry is
      // treated as empty), but emit the RAW value so trailing whitespace
      // typed mid-word survives the round trip.
      if (!raw.trim()) return '';
      return `**${p.label}:** ${raw}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function IntroBriefEditor({
  value,
  onChange,
  proofItems,
}: {
  value: string;
  onChange: (next: string) => void;
  // The bank items that should be pickable from the "Add proof" button
  // next to the Proof line. Pre-filtered to kind === 'proof' by the parent.
  proofItems: BankItem[];
}) {
  // Local state per part. The textarea is bound to what the user actually
  // typed - we never re-derive its value from a parse/serialize round-trip
  // mid-keystroke. The serialize step is one-way: emit on every keystroke
  // so the parent / autosave see the latest, but never read back through it.
  //
  // Re-init from `value` only when the parent gives us a value that didn't
  // come from our own most recent emit (e.g. switching to a different video,
  // or "+ add proof" pre-fills the proof field). lastEmittedRef breaks the
  // self-loop so a value === lastEmitted is recognised as our echo, not an
  // external write.
  const [parts, setParts] = useState<Record<IntroPartKey, string>>(() => parseIntroBrief(value));
  const lastEmittedRef = useRef<string>(value);
  const [proofPickerOpen, setProofPickerOpen] = useState(false);

  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      setParts(parseIntroBrief(value));
      lastEmittedRef.current = value;
    }
  }, [value]);

  function patch(key: IntroPartKey, next: string) {
    setParts((prev) => {
      const updated = { ...prev, [key]: next };
      const serialized = serializeIntroBrief(updated);
      lastEmittedRef.current = serialized;
      onChange(serialized);
      return updated;
    });
  }


  function pickProof(id: string) {
    const bi = proofItems.find((i) => i.id === id);
    if (!bi) return;
    // Use the bank item's title if it has one (synthesised stories do),
    // otherwise fall back to the first ~140 chars of the text so the creator gets
    // a usable summary in the Proof box. She can edit after. Strip markdown
    // bold (**...**) so the seed reads cleanly inside the textarea - the
    // brief's serialisation already adds bold around the label, double-bold
    // confuses both the eye and the parser.
    const raw = bi.title?.trim()
      ? bi.title.trim()
      : (bi.text.length > 140 ? bi.text.slice(0, 140).trim() + '…' : bi.text.trim());
    const seed = raw.replace(/\*\*/g, '').trim();
    patch('proof', seed);
    setProofPickerOpen(false);
  }

  return (
    <div className="sb-intro-parts">
      {INTRO_PARTS.map((p, i) => (
        <div key={p.key} className="sb-intro-part">
          <span className="sb-intro-part__label">
            <span className="sb-intro-part__num">{i + 1}</span>
            {p.label}
            {p.key === 'proof' && (
              <button
                type="button"
                className="sb-intro-part__add-proof"
                onClick={() => setProofPickerOpen(true)}
                disabled={proofItems.length === 0}
                title={proofItems.length === 0 ? 'no proof bank items yet' : 'pick from your proof bank'}
              >
                + add proof
              </button>
            )}
          </span>
          <textarea
            className="sb-section__brief sb-intro-part__input"
            placeholder={p.placeholder}
            value={parts[p.key]}
            onChange={(e) => patch(p.key, e.target.value)}
            rows={2}
          />
        </div>
      ))}

      {proofPickerOpen && (
        <BankPicker
          items={proofItems}
          selectedIdsAcrossAll={new Set()}
          onClose={() => setProofPickerOpen(false)}
          onAdd={pickProof}
        />
      )}
    </div>
  );
}

// ─── Section box ──────────────────────────────────────────────────────────

function SectionBox({
  section,
  videoId,
  byId,
  proofItems,
  canRemove,
  isHovered,
  isDragging,
  onBriefChange,
  onRemoveAnchor,
  onPick,
  onRemoveSection,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  section: ScriptSection;
  videoId: string;
  byId: Map<string, BankItem>;
  // Combined "Add proof" picker source: approved proof bank + wins bank
  // from the authority section. Pre-merged by the parent so the picker
  // just renders them as one list.
  proofItems: BankItem[];
  canRemove: boolean;
  isHovered: boolean;
  isDragging: boolean;
  onBriefChange: (brief: string) => void;
  onRemoveAnchor: (anchorId: string) => void;
  onPick: () => void;
  onRemoveSection: () => void;
  onDragStart: (anchorId: string) => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: (beforeAnchorId?: string) => void;
}) {
  const anchors = section.anchor_ids.map((id) => byId.get(id)).filter((x): x is BankItem => !!x);

  return (
    <article
      className={`sb-section ${isHovered ? 'sb-section--drop' : ''}`}
      onDragOver={(e) => {
        if (isDragging) {
          e.preventDefault();
          onDragOver();
        }
      }}
      onDrop={(e) => {
        if (isDragging) {
          e.preventDefault();
          onDrop();
        }
      }}
    >
      <header className="sb-section__head">
        <div className="sb-section__title">
          <span className="sb-section__kind">{section.kind}</span>
          <span className="sb-section__label">{section.label}</span>
        </div>
        <div className="sb-section__actions">
          {section.kind === 'intro' && (
            <IntroDraftButton
              videoId={videoId}
              currentBrief={section.brief}
              onResult={onBriefChange}
            />
          )}
          <button type="button" className="sb-section__add" onClick={onPick}>+ add story</button>
          {canRemove && (
            <button type="button" className="sb-section__remove" onClick={onRemoveSection} aria-label="remove section">
              remove section
            </button>
          )}
        </div>
      </header>

      {section.kind === 'intro' ? (
        <IntroBriefEditor
          value={section.brief}
          onChange={onBriefChange}
          proofItems={proofItems}
        />
      ) : (
        <textarea
          className="sb-section__brief"
          placeholder={`brief: ${SECTION_KIND_HINTS[section.kind]}`}
          value={section.brief}
          onChange={(e) => onBriefChange(e.target.value)}
          rows={2}
        />
      )}

      <div className="sb-section__drop">
        {anchors.length === 0 ? (
          <p className="sb-section__empty">
            drag stories here, click + add story, or hit suggest stories at the top.
          </p>
        ) : (
          anchors.map((item) => (
            <SectionAnchor
              key={item.id}
              item={item}
              onRemove={() => onRemoveAnchor(item.id)}
              onDragStart={() => onDragStart(item.id)}
              onDragEnd={onDragEnd}
              onDropBefore={() => onDrop(item.id)}
              isDragging={isDragging}
            />
          ))
        )}
      </div>
    </article>
  );
}

function SectionAnchor({
  item,
  onRemove,
  onDragStart,
  onDragEnd,
  onDropBefore,
  isDragging,
}: {
  item: BankItem;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  isDragging: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = KIND_META[item.kind];
  const long = item.text.length > 200;
  const shown = expanded || !long ? item.text : item.text.slice(0, 200) + '…';
  return (
    <div
      className="sb-banchor"
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (isDragging) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (isDragging) {
          e.stopPropagation();
          e.preventDefault();
          onDropBefore();
        }
      }}
      style={{ borderColor: `color-mix(in srgb, ${meta.color} 30%, var(--hairline))` }}
    >
      <div className="sb-banchor__head">
        <span className="sb-banchor__handle" title="drag to reorder">⋮⋮</span>
        <span className="sb-banchor__tag" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}>
          {meta.label}
        </span>
        {item.title && <span className="sb-banchor__title">{item.title}</span>}
        <button type="button" className="sb-banchor__x" onClick={onRemove} aria-label="remove story">×</button>
      </div>
      <p
        className="sb-banchor__text"
        onClick={() => long && setExpanded(!expanded)}
        style={{ cursor: long ? 'pointer' : 'default', whiteSpace: 'pre-wrap' }}
      >
        {shown}
      </p>
      {long && (
        <button type="button" className="sb-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▴ collapse' : '▾ read full text'}
        </button>
      )}
      {item.source_transcript && (
        <p className="sb-banchor__src">
          {item.source_transcript.replace(/\.(md|txt)$/, '')}
          {item.source_timestamp && ` · @ ${item.source_timestamp}`}
        </p>
      )}
    </div>
  );
}

// ─── Bank picker ──────────────────────────────────────────────────────────

export function BankPicker({
  items,
  selectedIdsAcrossAll,
  onClose,
  onAdd,
}: {
  items: BankItem[];
  selectedIdsAcrossAll: Set<string>;
  onClose: () => void;
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | BankKind>('all');
  const [activeTopics, setActiveTopics] = useState<Set<string>>(new Set());

  // Collect the union of topic chips across all items, sorted by frequency.
  // Strip slash-namespaced YAML metadata (type/asset, domain/povs, etc.) so
  // the filter pills only show real topic tags.
  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) for (const t of i.topics ?? []) {
      if (!t || t.includes('/')) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [items]);

  function toggleTopic(t: string) {
    setActiveTopics((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kindFilter !== 'all' && i.kind !== kindFilter) return false;
      if (activeTopics.size > 0) {
        const hasAll = [...activeTopics].every((t) => (i.topics ?? []).includes(t));
        if (!hasAll) return false;
      }
      if (!q) return true;
      const hay = `${i.title ?? ''} ${i.text} ${i.context ?? ''} ${(i.topics ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, kindFilter, activeTopics]);

  return (
    <div className="sb-picker-wrap" onClick={onClose}>
      <aside className="sb-picker" onClick={(e) => e.stopPropagation()}>
        <header className="sb-picker__head">
          <div>
            <span className="eyebrow">pick stories</span>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem' }}>
              {items.length} bank items
            </h3>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>done</button>
        </header>
        <div className="sb-picker__controls">
          <input
            type="text"
            className="sb-input"
            placeholder="search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="sb-picker__pills">
            {(['all', 'pov', 'framework', 'story', 'proof'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`sb-mode-pill ${kindFilter === k ? 'sb-mode-pill--on' : ''}`}
                onClick={() => setKindFilter(k)}
              >
                {k === 'all' ? 'all' : KIND_META[k as BankKind].label}
              </button>
            ))}
          </div>
          {topicOptions.length > 0 && (
            <div className="sb-picker__pills" style={{ borderTop: '1px dashed var(--hairline)', paddingTop: 'var(--space-2)' }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 700, alignSelf: 'center', marginRight: 4 }}>
                tags:
              </span>
              {topicOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`sb-mode-pill ${activeTopics.has(t) ? 'sb-mode-pill--on' : ''}`}
                  onClick={() => toggleTopic(t)}
                >
                  {t}
                </button>
              ))}
              {activeTopics.size > 0 && (
                <button type="button" className="sb-mode-pill" onClick={() => setActiveTopics(new Set())} style={{ color: '#ff6b6b' }}>
                  clear
                </button>
              )}
            </div>
          )}
        </div>
        <div className="sb-picker__list">
          {filtered.map((item) => (
            <PickCard
              key={item.id}
              item={item}
              isSelected={selectedIdsAcrossAll.has(item.id)}
              onAdd={() => onAdd(item.id)}
            />
          ))}
          {filtered.length === 0 && <p className="muted">no matches</p>}
        </div>
      </aside>
    </div>
  );
}

function PickCard({
  item,
  isSelected,
  onAdd,
}: {
  item: BankItem;
  isSelected: boolean;
  onAdd: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = KIND_META[item.kind];
  const long = item.text.length > 240;
  const shown = expanded || !long ? item.text : item.text.slice(0, 240) + '…';
  return (
    <article className="sb-pick" style={{ borderColor: `color-mix(in srgb, ${meta.color} 22%, var(--hairline))` }}>
      <div className="sb-pick__head">
        <span className="sb-banchor__tag" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 10%, transparent)` }}>
          {meta.label}
        </span>
        {item.title && <span className="sb-pick__title">{item.title}</span>}
        <button
          type="button"
          className={`btn ${isSelected ? 'btn--ghost' : 'btn--primary'}`}
          onClick={onAdd}
          disabled={isSelected}
          style={{ marginLeft: 'auto', fontSize: 'var(--body-sm)', padding: '4px 12px' }}
        >
          {isSelected ? 'in use' : '+ add'}
        </button>
      </div>
      <p
        className="sb-pick__text"
        onClick={() => long && setExpanded(!expanded)}
        style={{ cursor: long ? 'pointer' : 'default', whiteSpace: 'pre-wrap' }}
      >
        {shown}
      </p>
      {long && (
        <button type="button" className="sb-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? '▴ collapse' : '▾ read full text'}
        </button>
      )}
      {item.source_transcript && (
        <p className="sb-banchor__src">{item.source_transcript.replace(/\.(md|txt)$/, '')}</p>
      )}
    </article>
  );
}

const SB_CSS = `
.sb-row { display: flex; flex-direction: column; gap: 6px; }
.sb-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.sb-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  outline: none;
}
.sb-input:focus { border-color: var(--ink); background: rgba(255,255,255,0.06); }

.sb-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center; }

.sb-sections { display: flex; flex-direction: column; gap: var(--space-4); }
.sb-add-section { display: flex; justify-content: center; padding-top: var(--space-2); }

.sb-section {
  border: 1.5px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: border-color 0.18s, background 0.18s;
}
.sb-section--drop {
  border-color: var(--ink);
  background: rgba(255,255,255,0.06);
}
.sb-section__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.sb-section__title { display: flex; align-items: baseline; gap: var(--space-2); }
.sb-section__kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--muted);
  font-weight: 700;
}
.sb-section__label {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.015em;
}
.sb-section__actions { display: flex; gap: var(--space-2); align-items: center; }
.sb-section__add {
  background: transparent;
  border: 1px dashed var(--hairline);
  color: var(--muted);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.sb-section__add:hover { color: var(--ink); border-color: var(--ink); }
/* Sibling to + add story: same pill, but solid white-tinted border so the
   draft-intro action reads as the more deliberate / prominent of the two. */
.sb-section__draft {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.35);
  color: var(--ink);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.sb-section__draft:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.65);
  background: rgba(255, 255, 255, 0.04);
}
.sb-section__draft:disabled { opacity: 0.55; cursor: not-allowed; }
.sb-section__remove {
  background: transparent;
  border: none;
  color: var(--muted-2);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
}
.sb-section__remove:hover { color: #ff6b6b; }

.sb-section__brief {
  width: 100%;
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body-sm);
  line-height: 1.5;
  resize: vertical;
  outline: none;
  min-height: 50px;
}
.sb-section__brief:focus { border-color: var(--ink); background: rgba(255,255,255,0.03); }
.sb-section__brief::placeholder { color: var(--muted-2); font-style: italic; }

/* Intro section uses 5 labelled textareas instead of one freeform brief. */
.sb-intro-parts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.sb-intro-part {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sb-intro-part__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.sb-intro-part__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--recovery) 18%, transparent);
  color: var(--recovery);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}
.sb-intro-part__input { min-height: 44px; }
.sb-intro-part__add-proof {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  color: var(--strain);
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 3px 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.sb-intro-part__add-proof:hover:not(:disabled) {
  border-color: var(--strain);
  background: color-mix(in srgb, var(--strain) 8%, transparent);
}
.sb-intro-part__add-proof:disabled { opacity: 0.4; cursor: not-allowed; }

.sb-section__drop {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 60px;
}
.sb-section__empty {
  margin: 0;
  padding: var(--space-3);
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-sm);
  color: var(--muted-2);
  font-size: var(--body-sm);
  font-style: italic;
  text-align: center;
}

/* Bank anchor card inside a section box */
.sb-banchor {
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  cursor: grab;
}
.sb-banchor:active { cursor: grabbing; }
.sb-banchor__head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.sb-banchor__handle {
  color: var(--muted-2);
  font-size: 14px;
  cursor: grab;
  user-select: none;
  letter-spacing: -2px;
}
.sb-banchor__tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.sb-banchor__title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--body-sm);
  letter-spacing: -0.01em;
}
.sb-banchor__x {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--muted-2);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}
.sb-banchor__x:hover { color: #ff6b6b; }
.sb-banchor__text { margin: 0; font-size: var(--body-sm); line-height: 1.55; color: var(--ink); }
.sb-banchor__src {
  margin: 0;
  font-size: 10px;
  color: var(--muted-2);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}

.sb-expand-btn {
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.sb-expand-btn:hover { color: var(--ink); }

.sb-result {
  padding: var(--space-3);
  background: rgba(22,201,126,0.05);
  border: 1px solid rgba(22,201,126,0.25);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sb-outline { display: flex; flex-direction: column; gap: 4px; }
.sb-outline__row {
  display: grid;
  grid-template-columns: 1fr 80px;
  gap: var(--space-2);
  padding: 4px 0;
  font-size: 12px;
}
.sb-outline__sec {
  font-weight: 600;
}
.sb-outline__count { color: var(--muted-2); text-align: right; font-variant-numeric: tabular-nums; }

.sb-mode-pill {
  background: transparent;
  border: 1px solid var(--hairline);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.sb-mode-pill--on { background: var(--ink); color: var(--bg); border-color: var(--ink); }

/* Bank picker (right-side slide-over) */
.sb-picker-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  animation: sb-fade 0.18s ease-out;
}
@keyframes sb-fade { from { opacity: 0; } to { opacity: 1; } }
.sb-picker {
  width: min(640px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--hairline);
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  gap: var(--space-4);
  animation: sb-slide 0.22s ease-out;
}
@keyframes sb-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.sb-picker__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); }
.sb-picker__controls { display: flex; flex-direction: column; gap: var(--space-3); }
.sb-picker__pills { display: flex; gap: 4px; flex-wrap: wrap; }
.sb-picker__list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); padding-bottom: var(--space-4); }
.sb-pick {
  padding: var(--space-3);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.sb-pick__head { display: flex; align-items: center; gap: var(--space-2); }
.sb-pick__title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--body-sm);
  letter-spacing: -0.01em;
}
.sb-pick__text { margin: 0; font-size: var(--body-sm); line-height: 1.55; color: var(--muted); }
`;
