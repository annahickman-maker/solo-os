import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { BankItem, BankKind, Video, VideoStatus, VideoSuggestions } from '../api';
import { VideoScriptBuilder, BankPicker, type VideoScriptBuilderHandle } from './VideoScriptBuilder';
import { useTeleprompter } from './TeleprompterProvider';
import { useChat } from './ChatProvider';
import { Icon, PlayIcon, ICON_COLOR } from '../lib/skillVisuals';
import { solidButtonStyle } from '../lib/ui';

interface VideoDetailProps {
  videoId: string | null;
  onClose: () => void;
}

const STAGES: { status: VideoStatus; label: string }[] = [
  { status: 'idea', label: 'idea' },
  { status: 'scripted', label: 'scripted' },
  { status: 'filmed', label: 'filmed' },
  { status: 'editing', label: 'editing' },
  { status: 'published', label: 'published' },
];

function formatStatNumber(n?: number | null): string {
  if (n == null) return '-';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function benchmarkColor(value: number | null | undefined, low: number, high: number): string {
  if (value == null) return 'var(--muted-2)';
  if (value < low) return 'var(--danger)';
  if (value > high) return 'var(--recovery)';
  return 'var(--strain)';
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: 'var(--ink)',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 'var(--eyebrow)',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--muted)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function MetricRow({
  label,
  helper,
  value,
  benchmark,
  onClick,
  editing,
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  label: string;
  helper: string;
  value: number | null | undefined;
  benchmark: { low: number; high: number };
  onClick: () => void;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onSave: (v: number | null) => void;
  onCancel: () => void;
}) {
  const color = benchmarkColor(value, benchmark.low, benchmark.high);
  const ratio = value == null ? 0 : Math.min(1, value / (benchmark.high * 2));
  return (
    <div
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
        <div className="stack" style={{ gap: 2, flex: 1 }}>
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{label}</span>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>{helper}</span>
        </div>
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = parseFloat(draft);
              onSave(Number.isNaN(v) ? null : v);
            }}
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
          >
            <input
              autoFocus
              type="number"
              step="0.1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0.0"
              style={{
                width: 70,
                background: 'var(--bg)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                padding: '6px 10px',
                fontSize: 'var(--body)',
                outline: 'none',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <button type="submit" className="btn btn--primary" style={{ padding: '4px 12px', fontSize: 'var(--body-sm)' }}>save</button>
            <button type="button" onClick={onCancel} className="btn" style={{ padding: '4px 12px', fontSize: 'var(--body-sm)', color: 'var(--muted)' }}>cancel</button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onClick}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value == null ? '-' : `${value.toFixed(1)}%`}
          </button>
        )}
      </div>
      <div
        style={{
          marginTop: 'var(--space-2)',
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 'var(--radius-pill)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${ratio * 100}%`,
            background: color,
            borderRadius: 'var(--radius-pill)',
            transition: 'width var(--duration-base) var(--ease-out)',
          }}
        />
      </div>
    </div>
  );
}

export function VideoDetail({ videoId, onClose }: VideoDetailProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['video', videoId],
    queryFn: () => api.getVideo(videoId as string),
    enabled: !!videoId,
  });

  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [script, setScript] = useState('');
  // Auto-save status: 'idle' (no pending changes), 'unsaved' (typing),
  // 'saving' (request in flight), 'saved' (just persisted, fades to idle).
  const [saveStatus, setSaveStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved'>('idle');
  const [editingMetric, setEditingMetric] = useState<null | 'ctr_pct' | 'sub_rate_pct' | 'conversion_pct'>(null);
  const [metricDraft, setMetricDraft] = useState('');

  // Only initialize local edit state from the server ONCE per videoId. Without
  // this guard, every successful autosave triggers `qc.invalidateQueries` →
  // refetch → new `data` reference → this effect overwrites whatever the user
  // typed in the last few hundred ms (especially the trailing space or last
  // character of a word). That was the "sometimes my space disappears" bug.
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (data && initializedFor.current !== videoId) {
      setTitle(data.title);
      setGoal(data.goal ?? '');
      setScript(data.script_content ?? '');
      setSaveStatus('idle');
      initializedFor.current = videoId as string;
    }
  }, [data, videoId]);

  const updateMetric = useMutation({
    mutationFn: (vars: { field: string; value: number | null }) =>
      api.updateVideo(videoId as string, { [vars.field]: vars.value } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video', videoId] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      setEditingMetric(null);
    },
  });

  const generate = useMutation({
    mutationFn: (preserve: boolean) => api.generateTitles(videoId as string, preserve),
    onSuccess: (data) => {
      qc.setQueryData(['video', videoId], (prev: any) =>
        prev ? { ...prev, suggestions_json: JSON.stringify(data), suggestions_at: data.generated_at } : prev
      );
      qc.invalidateQueries({ queryKey: ['video', videoId] });
    },
  });

  let suggestions: VideoSuggestions | null = null;
  try {
    suggestions = data?.suggestions_json ? JSON.parse(data.suggestions_json) : null;
  } catch {
    suggestions = null;
  }

  const saveSugg = useMutation({
    mutationFn: (next: VideoSuggestions) => api.saveSuggestions(videoId as string, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', videoId] }),
  });

  function toggleLiked(kind: 'titles_explicit' | 'titles_implied' | 'thumbnail_phrases', index: number) {
    if (!suggestions) return;
    const next: VideoSuggestions = {
      ...suggestions,
      [kind]: suggestions[kind].map((item, i) => (i === index ? { ...item, liked: !item.liked } : item)),
    } as VideoSuggestions;
    qc.setQueryData(['video', videoId], (prev: any) => prev ? { ...prev, suggestions_json: JSON.stringify(next) } : prev);
    saveSugg.mutate(next);
  }

  function editTitle(kind: 'titles_explicit' | 'titles_implied', index: number, newText: string) {
    if (!suggestions) return;
    const current = suggestions[kind][index];
    if (!current || current.title === newText) return;
    const next: VideoSuggestions = {
      ...suggestions,
      [kind]: suggestions[kind].map((item, i) => (i === index ? { ...item, title: newText, edited: true, liked: true } : item)),
    } as VideoSuggestions;
    qc.setQueryData(['video', videoId], (prev: any) => prev ? { ...prev, suggestions_json: JSON.stringify(next) } : prev);
    saveSugg.mutate(next);
  }

  function editPhrase(index: number, newText: string) {
    if (!suggestions) return;
    const current = suggestions.thumbnail_phrases[index];
    if (!current || current.phrase === newText) return;
    const next: VideoSuggestions = {
      ...suggestions,
      thumbnail_phrases: suggestions.thumbnail_phrases.map((item, i) => (i === index ? { ...item, phrase: newText, edited: true, liked: true } : item)),
    };
    qc.setQueryData(['video', videoId], (prev: any) => prev ? { ...prev, suggestions_json: JSON.stringify(next) } : prev);
    saveSugg.mutate(next);
  }

  const likedCount = suggestions
    ? suggestions.titles_explicit.filter((x) => x.liked).length
      + suggestions.titles_implied.filter((x) => x.liked).length
      + suggestions.thumbnail_phrases.filter((x) => x.liked).length
    : 0;

  const save = useMutation({
    mutationFn: (vars: Partial<Video>) =>
      api.updateVideo(videoId as string, vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video', videoId] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      setSaveStatus('saved');
      // Auto-fade the "saved" badge after a beat.
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 1400);
    },
    onError: () => setSaveStatus('unsaved'),
  });

  // ─── Auto-save title / goal / script ────────────────────────────────────
  // Debounce of 600ms after typing stops. On modal close we ALSO flush any
  // pending changes (see the unmount-flush effect further down) so the user
  // never loses edits by clicking away too fast.
  const lastSavedRef = useRef<{ title: string; goal: string; script: string; videoId: string | null } | null>(null);
  // Initialize ref the first time `data` lands FOR THIS videoId so the
  // auto-save effect doesn't fire a redundant save against the value just
  // received. Re-init when switching videos so a stale ref from the previous
  // video can't fool the dirty-check.
  useEffect(() => {
    if (data && lastSavedRef.current?.videoId !== videoId) {
      lastSavedRef.current = {
        title: data.title,
        goal: data.goal ?? '',
        script: data.script_content ?? '',
        videoId: videoId ?? null,
      };
    }
  }, [data, videoId]);

  useEffect(() => {
    if (!data || !videoId) return;
    const last = lastSavedRef.current;
    if (!last) return;
    const isDirty = title !== last.title || goal !== last.goal || script !== last.script;
    if (!isDirty) return;
    setSaveStatus('unsaved');
    const timer = setTimeout(() => {
      setSaveStatus('saving');
      save.mutate(
        { title, goal, script_content: script },
        {
          onSuccess: () => {
            lastSavedRef.current = { title, goal, script, videoId: videoId ?? null };
          },
        },
      );
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, goal, script, videoId, data?.id]);

  // ─── Flush on unmount ───────────────────────────────────────────────────
  // If the creator closes the modal mid-debounce, fire a final save synchronously
  // (fetch goes out even after unmount; we just don't act on the response).
  const titleRef = useRef(title); titleRef.current = title;
  const goalRef = useRef(goal); goalRef.current = goal;
  const scriptRef = useRef(script); scriptRef.current = script;
  useEffect(() => {
    return () => {
      const last = lastSavedRef.current;
      if (!last || !videoId) return;
      const t = titleRef.current;
      const g = goalRef.current;
      const s = scriptRef.current;
      if (t === last.title && g === last.goal && s === last.script) return;
      api
        .updateVideo(videoId as string, { title: t, goal: g, script_content: s })
        .catch(() => {});
    };
  }, [videoId]);

  // Ref to the script builder. Used to flush pending section changes BEFORE
  // we propagate the close. Without this, removing an anchor and closing
  // within the debounce window loses the change.
  const scriptBuilderRef = useRef<VideoScriptBuilderHandle | null>(null);

  // Full-script textarea + "insert from bank" picker. The button opens the
  // same BankPicker the script builder uses; on pick, the story text is
  // spliced in at the textarea's cursor position so the creator can hand-write a
  // script around her own excerpts (or paste them into a Claude draft).
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastScriptCursorRef = useRef<number | null>(null);
  const [scriptBankOpen, setScriptBankOpen] = useState(false);

  // Teleprompter pop-out lives at the app level (TeleprompterProvider) so
  // it persists across page navigation. This component just opens it for
  // the current video and pushes local script changes (e.g. bank inserts)
  // out to the window. Edits in the pop-out are saved to the vault by the
  // provider directly, so they survive even when VideoDetail isn't mounted.
  const teleprompter = useTeleprompter();
  const teleprompterOpen = videoId ? teleprompter.isOpenFor(videoId) : false;

  useEffect(() => {
    if (!videoId) return;
    if (!teleprompter.isOpenFor(videoId)) return;
    teleprompter.pushScript(videoId, script);
  }, [script, videoId, teleprompter]);

  function openTeleprompter() {
    if (!videoId) return;
    teleprompter.openFor(videoId, scriptRef.current);
  }
  const banksQuery = useQuery({ queryKey: ['banks'], queryFn: api.listBanks, enabled: !!videoId });
  // Reputation feeds the wins bank (own / student / client wins from the
  // Authority section). The Insert Story picker merges these into the
  // regular bank items so the creator can splice in a customer win or a brag-bank
  // entry the same way she splices in a story or pov.
  const reputationQuery = useQuery({
    queryKey: ['reputation'],
    queryFn: api.reputation,
    enabled: !!videoId,
  });

  const insertItems = useMemo<BankItem[]>(() => {
    const fromBank = banksQuery.data?.items ?? [];
    const wins =
      reputationQuery.data?.dimensions?.find?.((d: any) => d.id === 'authority')?.wins_bank ?? [];
    const fromWins: BankItem[] = wins
      .filter((w: any) => w.status !== 'rejected')
      .map((w: any) => ({
        id: `win-${w.id}`,
        kind: 'proof' as BankKind,
        text: (w.body && w.body.trim() ? w.body.trim() : w.title) || '',
        title: w.title || null,
        context: [
          w.kind === 'own' ? 'own win' : w.kind === 'student' ? 'student win' : 'client win',
          w.date
            ? new Date(w.date * 1000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        source_transcript: w.source_episode ?? null,
        source_timestamp: null,
        source_moments: [],
        topics: w.tags ?? [],
      }));
    return [...fromBank, ...fromWins];
  }, [banksQuery.data, reputationQuery.data]);

  function insertIntoScript(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ta = scriptTextareaRef.current;
    // Prefer the cursor position the textarea had right before the picker
    // grabbed focus. Falling back to live selectionStart works too, but the
    // picker dialog steals focus so the textarea's reported position is the
    // last place the creator actually typed.
    const current = scriptRef.current;
    const fallback = current.length;
    const pos = lastScriptCursorRef.current ?? ta?.selectionStart ?? fallback;
    const start = Math.min(Math.max(pos, 0), current.length);
    const before = current.slice(0, start);
    const after = current.slice(start);
    // Pad with a blank line on either side unless we're already at one, so
    // pasted excerpts read as their own paragraph instead of jamming into
    // the surrounding sentence.
    const needsLeadGap = before.length > 0 && !/\n\n$/.test(before);
    const needsTailGap = after.length > 0 && !/^\n\n/.test(after);
    const lead = needsLeadGap ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const tail = needsTailGap ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    const insertion = lead + trimmed + tail;
    const next = before + insertion + after;
    setScript(next);
    const cursorAfter = start + insertion.length;
    lastScriptCursorRef.current = cursorAfter;
    requestAnimationFrame(() => {
      const el = scriptTextareaRef.current;
      if (!el) return;
      el.focus();
      el.selectionStart = cursorAfter;
      el.selectionEnd = cursorAfter;
    });
  }

  async function handleClose() {
    try {
      await scriptBuilderRef.current?.flush();
    } catch {
      // Don't block close on a save error - the unmount-flush fallback in
      // VideoScriptBuilder still tries, and the user can always reopen.
    }
    onClose();
  }

  const deleteVideo = useMutation({
    mutationFn: () => api.deleteVideo(videoId as string),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      onClose();
    },
  });

  const setStage = useMutation({
    mutationFn: (status: VideoStatus) => api.updateVideo(videoId as string, { status }),
    onMutate: (status) => {
      qc.setQueryData<Video>(['video', videoId], (prev) =>
        prev ? { ...prev, status } : prev
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['video', videoId] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void handleClose();
    }
    if (videoId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, onClose]);

  if (!videoId) return null;

  return (
    <>
      <div
        onClick={() => void handleClose()}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 90,
          backdropFilter: 'blur(2px)',
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(720px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--hairline)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.4)',
        }}
      >
        <header
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span className="eyebrow" style={{ justifySelf: 'start' }}>video detail</span>
          {data ? (
            <div
              style={{
                display: 'flex',
                gap: 2,
                padding: 2,
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                justifySelf: 'center',
              }}
              title="click a stage to move this video"
            >
              {STAGES.map((s) => {
                const active = s.status === data.status;
                return (
                  <button
                    key={s.status}
                    type="button"
                    onClick={() => setStage.mutate(s.status)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? '#0E1116' : 'var(--muted)',
                      fontSize: 10,
                      fontWeight: active ? 700 : 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => void handleClose()}
            aria-label="close"
            className="btn btn--ghost"
            style={{ justifySelf: 'end' }}
          >
            close
          </button>
        </header>

        {isLoading || !data ? (
          <div className="empty" style={{ margin: 'var(--space-7)' }}>
            loading
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-6)',
            }}
          >
            {/* Title input takes full width now that the stage segmented
                control has moved into the header bar above. */}
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-display)',
                fontSize: '2rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                lineHeight: 1.1,
                padding: 0,
              }}
            />

            {/* Stage meta - queue position OR publish info. Pulled out of
                the old progress block so it still sits near the top of the
                detail view where the creator's eye lands first. */}
            {(data.queue_order != null || (data.status === 'published' && data.publish_date)) && (
              <div style={{ marginTop: 'calc(var(--space-4) * -1)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {data.queue_order != null && (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                    #{data.queue_order} in queue
                  </span>
                )}
                {data.status === 'published' && data.publish_date && (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                    published {new Date(data.publish_date * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {data.youtube_url && (
                      <>
                        {' · '}
                        <a
                          href={data.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--strain)', textDecoration: 'underline' }}
                        >
                          watch on youtube
                        </a>
                      </>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Goal of the video - shown as the subhead on each video card.
                Keep it short, one line. the creator sets it here. */}
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <span className="eyebrow">goal of this video</span>
              <input
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  // auto-save handled by debounced effect - no manual flag needed
                }}
                placeholder="what's this video meant to do for the viewer? one line."
                style={{
                  background: 'transparent',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--body)',
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                  padding: 'var(--space-2) var(--space-3)',
                  width: '100%',
                }}
              />
            </div>

            {data.status === 'published' && (
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                <span className="eyebrow">stats</span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: 'var(--space-3)',
                  }}
                >
                  <StatBlock label="views" value={formatStatNumber(data.view_count)} />
                  <StatBlock label="likes" value={formatStatNumber(data.like_count)} />
                  <StatBlock label="comments" value={formatStatNumber(data.comment_count)} />
                </div>

                <span className="eyebrow" style={{ marginTop: 'var(--space-2)' }}>performance vs benchmark</span>
                <div className="stack" style={{ gap: 'var(--space-2)' }}>
                  <MetricRow
                    label="ctr"
                    helper="3-5% benchmark"
                    value={data.ctr_pct}
                    benchmark={{ low: 3, high: 5 }}
                    onClick={() => { setEditingMetric('ctr_pct'); setMetricDraft(data.ctr_pct?.toString() ?? ''); }}
                    editing={editingMetric === 'ctr_pct'}
                    draft={metricDraft}
                    setDraft={setMetricDraft}
                    onSave={(v) => updateMetric.mutate({ field: 'ctr_pct', value: v })}
                    onCancel={() => setEditingMetric(null)}
                  />
                  <MetricRow
                    label="sub rate"
                    helper="0.5-1% benchmark"
                    value={data.sub_rate_pct}
                    benchmark={{ low: 0.5, high: 1 }}
                    onClick={() => { setEditingMetric('sub_rate_pct'); setMetricDraft(data.sub_rate_pct?.toString() ?? ''); }}
                    editing={editingMetric === 'sub_rate_pct'}
                    draft={metricDraft}
                    setDraft={setMetricDraft}
                    onSave={(v) => updateMetric.mutate({ field: 'sub_rate_pct', value: v })}
                    onCancel={() => setEditingMetric(null)}
                  />
                  <MetricRow
                    label="conversion"
                    helper="0.5-1% benchmark"
                    value={data.conversion_pct}
                    benchmark={{ low: 0.5, high: 1 }}
                    onClick={() => { setEditingMetric('conversion_pct'); setMetricDraft(data.conversion_pct?.toString() ?? ''); }}
                    editing={editingMetric === 'conversion_pct'}
                    draft={metricDraft}
                    setDraft={setMetricDraft}
                    onSave={(v) => updateMetric.mutate({ field: 'conversion_pct', value: v })}
                    onCancel={() => setEditingMetric(null)}
                  />
                </div>
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  click any metric to enter the number from your youtube studio
                </span>
              </div>
            )}

            {/* ─── Script builder section ───────────────────────────── */}
            {data.status !== 'published' && (
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                <VdSectionHeading
                  eyebrow="step 1"
                  title="script"
                  sub="fill in the brief for each section. suggest stories pulls from your bank. draft script weaves them all together."
                />
                <ClaudeInterviewCallout videoId={videoId as string} video={data} />
                <VideoScriptBuilder
                  ref={scriptBuilderRef}
                  videoId={videoId as string}
                  videoTitle={data.title}
                  initialSections={data.script_sections ?? null}
                  videoGoal={data.goal ?? null}
                />
              </div>
            )}

            {/* ─── Title script (the drafted output) ──────────────────── */}
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              <VdSectionHeading
                eyebrow="step 2"
                title="full script"
                sub="the drafted script for this video. edit anything you want before filming. drop your cursor anywhere and click insert story to splice an excerpt in."
              />
              {/* Insert-story pill sits immediately above the textarea so it
                  hugs the top edge - reads as an action attached to the
                  text box rather than to the section heading. */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'calc(var(--space-3) * -1)' }}>
                <button
                  type="button"
                  className="vd-section-action"
                  onClick={() => {
                    const ta = scriptTextareaRef.current;
                    if (ta && document.activeElement === ta) {
                      lastScriptCursorRef.current = ta.selectionStart;
                    }
                    setScriptBankOpen(true);
                  }}
                  disabled={insertItems.length === 0}
                  title={
                    insertItems.length === 0
                      ? 'no bank or wins entries yet'
                      : 'splice a story, pov, framework, proof, or customer win at the cursor'
                  }
                >
                  + insert from bank
                </button>
              </div>
              <textarea
                ref={scriptTextareaRef}
                value={script}
                onChange={(e) => {
                  setScript(e.target.value);
                  lastScriptCursorRef.current = e.target.selectionStart;
                }}
                onSelect={(e) => {
                  lastScriptCursorRef.current = (e.target as HTMLTextAreaElement).selectionStart;
                }}
                onBlur={(e) => {
                  // Remember where the cursor was when focus left, so the
                  // picker's insertion lands at the right spot even though
                  // opening the picker steals focus.
                  lastScriptCursorRef.current = (e.target as HTMLTextAreaElement).selectionStart;
                }}
                placeholder="no script yet. fill in the section briefs above, hit suggest stories, then draft script. or write it yourself - use + insert story to splice in excerpts from your bank."
                style={{
                  width: '100%',
                  minHeight: 480,
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--ink)',
                  padding: 'var(--space-5)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--body)',
                  lineHeight: 1.6,
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'calc(var(--space-3) * -1)' }}>
                <button
                  type="button"
                  className="vd-section-action"
                  onClick={openTeleprompter}
                  title="open the full script in a separate window with adjustable text size for filming"
                >
                  {teleprompterOpen ? 'teleprompter open ↗' : 'open teleprompter ↗'}
                </button>
              </div>
            </div>
            {scriptBankOpen && (
              <BankPicker
                items={insertItems}
                selectedIdsAcrossAll={new Set()}
                onClose={() => setScriptBankOpen(false)}
                onAdd={(id) => {
                  const item = insertItems.find((i) => i.id === id);
                  if (item) insertIntoScript(item.text);
                }}
              />
            )}

            {/* ─── Title + thumbnail section ──────────────────────────── */}
            {data.status !== 'published' && (
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                <VdSectionHeading
                  eyebrow="step 3"
                  title="title + thumbnail"
                  sub="generate 10 title options + 5 thumbnail phrases. click the lock to keep one as-is, or click the text to edit it (edits auto-lock and shape the direction of new titles). regenerate refills the rest."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => generate.mutate(likedCount > 0)}
                    disabled={generate.isPending}
                    className="btn btn--primary"
                  >
                    {generate.isPending
                      ? 'generating'
                      : !suggestions
                      ? 'generate suggestions'
                      : 'regenerate'}
                  </button>
                </div>
                {generate.isError && (
                  <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
                    {(generate.error as Error).message}
                  </span>
                )}
                {suggestions && (
                  <>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>audience called out</span>
                      {suggestions.titles_explicit
                        .map((t, i) => ({ t, i }))
                        .filter(({ t }) => typeof t.title === 'string' && t.title.trim().length > 0)
                        .map(({ t, i }) => (
                          <TitleRow
                            key={`e${i}`}
                            title={t.title}
                            tag={t.formula}
                            liked={!!t.liked}
                            edited={!!t.edited}
                            onToggle={() => toggleLiked('titles_explicit', i)}
                            onEdit={(next) => editTitle('titles_explicit', i, next)}
                          />
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>audience implied</span>
                      {suggestions.titles_implied
                        .map((t, i) => ({ t, i }))
                        .filter(({ t }) => typeof t.title === 'string' && t.title.trim().length > 0)
                        .map(({ t, i }) => (
                          <TitleRow
                            key={`i${i}`}
                            title={t.title}
                            tag={t.formula}
                            liked={!!t.liked}
                            edited={!!t.edited}
                            onToggle={() => toggleLiked('titles_implied', i)}
                            onEdit={(next) => editTitle('titles_implied', i, next)}
                          />
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>thumbnail phrases</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {suggestions.thumbnail_phrases
                          .map((p, i) => ({ p, i }))
                          .filter(({ p }) => typeof p.phrase === 'string' && p.phrase.trim().length > 0)
                          .map(({ p, i }) => (
                            <PhrasePill
                              key={`p${i}`}
                              phrase={p.phrase}
                              gap={p.gap}
                              liked={!!p.liked}
                              edited={!!p.edited}
                              onToggle={() => toggleLiked('thumbnail_phrases', i)}
                              onEdit={(next) => editPhrase(i, next)}
                            />
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─── YouTube description section ─────────────────────────── */}
            <div className="stack" style={{ gap: 'var(--space-4)' }}>
              <VdSectionHeading
                eyebrow="step 4"
                title="youtube description"
                sub="generates a ready-to-paste description from your video transcript after you've finished filming. upload the transcript with timestamps so the chapters can be extracted properly."
              />
              <DescriptionSection video={data} />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--hairline)',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  if (confirm('archive this video? you can show archived videos later from the pipeline page.')) {
                    save.mutate({ archived: true } as any, {
                      onSuccess: () => onClose(),
                    });
                  }
                }}
                disabled={save.isPending}
                className="btn"
                style={{ color: 'var(--muted)', marginRight: 'auto' }}
              >
                archive
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('permanently delete this video? this cannot be undone.')) {
                    deleteVideo.mutate();
                  }
                }}
                disabled={deleteVideo.isPending}
                className="btn"
                style={{ color: 'var(--danger)', borderColor: 'rgba(255,77,77,0.4)' }}
              >
                {deleteVideo.isPending ? 'deleting' : 'delete'}
              </button>
              {/* Auto-save status indicator. Replaces the old save button. */}
              <span
                style={{
                  fontSize: 'var(--body-sm)',
                  alignSelf: 'center',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  background:
                    saveStatus === 'saved'
                      ? 'color-mix(in srgb, var(--recovery) 14%, transparent)'
                      : saveStatus === 'saving'
                        ? 'color-mix(in srgb, var(--strain) 14%, transparent)'
                        : saveStatus === 'unsaved'
                          ? 'color-mix(in srgb, var(--strain) 8%, transparent)'
                          : 'transparent',
                  color:
                    saveStatus === 'saved'
                      ? 'var(--recovery)'
                      : saveStatus === 'saving'
                        ? 'var(--strain)'
                        : saveStatus === 'unsaved'
                          ? 'var(--muted)'
                          : 'var(--muted-2)',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  transition: 'background 0.2s, color 0.2s',
                }}
              >
                {saveStatus === 'saved' && '✓ saved'}
                {saveStatus === 'saving' && '… saving'}
                {saveStatus === 'unsaved' && '• unsaved'}
                {saveStatus === 'idle' && '✓ saved'}
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function TitleRow({ title, tag, liked, edited, onToggle, onEdit }: {
  title: string;
  tag?: string;
  liked?: boolean;
  edited?: boolean;
  onToggle?: () => void;
  onEdit?: (next: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      onEdit?.(trimmed);
    } else {
      setDraft(title);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3) var(--space-4)',
        background: liked ? 'rgba(22,201,126,0.15)' : 'var(--surface)',
        border: `1px solid ${liked ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        title={liked ? 'unlock - allow regenerate to replace this' : 'lock - keep this title verbatim on regenerate'}
        aria-label={liked ? 'unlock' : 'lock'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: liked ? 'var(--recovery)' : 'var(--muted-2)',
          fontSize: 14,
          lineHeight: 1,
          flexShrink: 0,
          width: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {liked ? '✓' : '○'}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setDraft(title); setEditing(false); }
          }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 'var(--body)',
            lineHeight: 1.4,
            color: 'var(--ink)',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          onDoubleClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(title); }}
          title="click to edit, double-click to copy"
          style={{
            flex: 1,
            fontSize: 'var(--body)',
            lineHeight: 1.4,
            color: liked ? 'var(--recovery)' : 'var(--ink)',
            cursor: 'text',
          }}
        >
          {title}
        </span>
      )}
      {edited && (
        <span style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--recovery)',
          padding: '2px 6px',
          background: 'rgba(22,201,126,0.12)',
          borderRadius: 'var(--radius-pill)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>edited</span>
      )}
      {tag && (
        <span style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: liked ? 'rgba(22,201,126,0.7)' : 'var(--muted-2)',
          padding: '2px 8px',
          background: liked ? 'rgba(22,201,126,0.08)' : 'rgba(255,255,255,0.04)',
          borderRadius: 'var(--radius-pill)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}>{tag}</span>
      )}
    </div>
  );
}

function PhrasePill({ phrase, gap, liked, edited, onToggle, onEdit }: {
  phrase: string;
  gap?: string;
  liked?: boolean;
  edited?: boolean;
  onToggle?: () => void;
  onEdit?: (next: string) => void;
}) {
  const [draft, setDraft] = useState(phrase);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(phrase);
  }, [phrase, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== phrase) {
      onEdit?.(trimmed);
    } else {
      setDraft(phrase);
    }
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        background: liked ? 'rgba(22,201,126,0.15)' : 'var(--surface)',
        border: `1px solid ${liked ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        title={liked ? 'unlock' : 'lock'}
        aria-label={liked ? 'unlock' : 'lock'}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: liked ? 'var(--recovery)' : 'var(--muted-2)',
          fontSize: 12,
          lineHeight: 1,
          width: 14,
        }}
      >
        {liked ? '✓' : '○'}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setDraft(phrase); setEditing(false); }
          }}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--body)',
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
            width: Math.max(80, draft.length * 9),
          }}
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          title="click to edit"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--body)',
            letterSpacing: '-0.01em',
            color: liked ? 'var(--recovery)' : 'var(--ink)',
            cursor: 'text',
          }}
        >
          {phrase}
        </span>
      )}
      {edited && (
        <span style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--recovery)',
        }}>edited</span>
      )}
      {gap && (
        <span style={{
          color: liked ? 'rgba(22,201,126,0.6)' : 'var(--muted-2)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>{gap}</span>
      )}
    </div>
  );
}

/**
 * YouTube description generator + editor. Mirrors the IG CaptionSection on
 * the Instagram panel:
 *   - "generate description" → calls Claude bridge, persists to frontmatter
 *   - editable textarea, autosaves on blur
 *   - "regenerate" + "copy" buttons
 *
 * Hidden until the video has script_content (nothing to summarise otherwise).
 */
function DescriptionSection({ video }: { video: Video }) {
  const qc = useQueryClient();

  // Linked / detected transcript for this video. Refetched after upload or
  // link so the banner updates immediately. When `match` is present and
  // `source === 'linked'`, the creator has wired it (or auto-pull did). When
  // `source === 'detected'`, we matched by youtube_id or title slug and the
  // UI should ask her to confirm before treating it as canonical.
  const tsQuery = useQuery({
    queryKey: ['video-transcript', video.id],
    queryFn: () => api.getVideoTranscript(video.id),
  });

  // Generate the description. Backend will use the linked/detected vault
  // transcript automatically when no inline transcript is provided, so the
  // common path here is `generate.mutate(undefined)`.
  const generate = useMutation({
    mutationFn: (transcript?: string) => api.generateVideoDescription(video.id, transcript),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', video.id] }),
  });
  const update = useMutation({
    mutationFn: (description: string) => api.updateVideoDescription(video.id, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', video.id] }),
  });
  // Persist a dropped file to the vault AND link it to this video. After
  // success we re-run the description generator with no inline text so the
  // backend reads from the now-linked file - a single source of truth.
  const upload = useMutation({
    mutationFn: (vars: { filename: string; text: string }) =>
      api.uploadVideoTranscript(video.id, vars.filename, vars.text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video-transcript', video.id] });
      qc.invalidateQueries({ queryKey: ['video', video.id] });
    },
  });
  const link = useMutation({
    mutationFn: (rel_path: string) => api.linkVideoTranscript(video.id, rel_path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video-transcript', video.id] });
      qc.invalidateQueries({ queryKey: ['video', video.id] });
      setPickerOpen(false);
    },
  });
  const unlink = useMutation({
    mutationFn: () => api.unlinkVideoTranscript(video.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['video-transcript', video.id] });
      qc.invalidateQueries({ queryKey: ['video', video.id] });
    },
  });

  const [draft, setDraft] = useState<string>(video.description ?? '');
  const [copied, setCopied] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => { setDraft(video.description ?? ''); }, [video.description]);

  const has = !!(video.description && video.description.trim());
  const hasScript = !!(video.script_content && video.script_content.trim());
  const tsMatch = tsQuery.data?.match ?? null;
  const tsSource = tsQuery.data?.source ?? null;
  // The description generator has SOMETHING to chew on if there's a linked
  // transcript, a detected-and-confirmable transcript, or the drafted full
  // script. The dropped-file path also satisfies this via the upload flow.
  const hasTranscriptSource = !!tsMatch || hasScript || upload.isPending;

  async function handleFile(file: File) {
    const text = await file.text();
    if (!text.trim()) return;
    upload.mutate(
      { filename: file.name, text },
      {
        onSuccess: () => {
          // Kick off generation immediately once the upload settles. Backend
          // pulls from the linked vault file (no inline text needed).
          generate.mutate(undefined);
        },
      },
    );
  }

  function copy() {
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function saveDraft(latest: string) {
    const next = latest.trim();
    if (next === (video.description ?? '').trim()) return;
    update.mutate(next);
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      {/* Transcript banner: linked (the creator wired it / auto-pulled), detected
          (we matched by youtube_id or slug - she should confirm), or none.
          When something is wired here the description generator reads it
          automatically; no need to drop a file again. */}
      {tsMatch && tsSource === 'linked' && (
        <div className="vd-ts-banner vd-ts-banner--linked">
          <div className="vd-ts-banner__main">
            <span className="vd-ts-banner__icon" aria-hidden>📄</span>
            <div className="vd-ts-banner__text">
              <span className="vd-ts-banner__label">transcript</span>
              <span className="vd-ts-banner__file">{tsMatch.title}</span>
              <span className="vd-ts-banner__hint">{tsMatch.filename}</span>
            </div>
          </div>
          <div className="vd-ts-banner__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setPickerOpen(true)}>change</button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
              title="remove the link (does not delete the transcript file)"
            >
              {unlink.isPending ? 'unlinking…' : 'unlink'}
            </button>
          </div>
        </div>
      )}

      {tsMatch && tsSource === 'detected' && (
        <div className="vd-ts-banner vd-ts-banner--detected">
          <div className="vd-ts-banner__main">
            <span className="vd-ts-banner__icon" aria-hidden>🔎</span>
            <div className="vd-ts-banner__text">
              <span className="vd-ts-banner__label">found a matching transcript in your vault</span>
              <span className="vd-ts-banner__file">{tsMatch.title}</span>
              <span className="vd-ts-banner__hint">{tsMatch.filename}</span>
            </div>
          </div>
          <div className="vd-ts-banner__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => link.mutate(tsMatch.rel_path)}
              disabled={link.isPending}
            >
              {link.isPending ? 'linking…' : 'use this'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setPickerOpen(true)}>
              pick a different one
            </button>
          </div>
        </div>
      )}

      {!tsMatch && (
        <div className="vd-ts-actions">
          <button type="button" className="btn btn--ghost" onClick={() => setPickerOpen(true)}>
            pick from transcript vault
          </button>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            or drop a file below to upload + link it in one shot
          </span>
        </div>
      )}

      {/* Transcript drop zone. Drop a .txt / .md / .vtt / .srt file - we
          save it to 05_Assets/Transcripts/YouTube-Videos/ AND link it to
          this video so the description generator reads from the same file
          next time. */}
      <label
        htmlFor={`yt-desc-drop-${video.id}`}
        onDragEnter={(e) => { e.preventDefault(); setDropActive(true); }}
        onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-5)',
          border: `1.5px dashed ${dropActive ? 'var(--recovery)' : 'var(--hairline)'}`,
          borderRadius: 'var(--radius-lg)',
          background: dropActive ? 'rgba(22,201,126,0.05)' : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
          textAlign: 'center',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dropActive ? 'var(--recovery)' : 'var(--muted)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--body)', color: dropActive ? 'var(--recovery)' : 'var(--ink)' }}>
          {upload.isPending
            ? 'saving transcript to your vault…'
            : dropActive
            ? 'drop the transcript file'
            : tsMatch
            ? 'drop a different transcript to replace'
            : 'drop a transcript here, or click to browse'}
        </span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          .txt / .md / .vtt / .srt - lands in 05_Assets/Transcripts/YouTube-Videos/
        </span>
        <input
          id={`yt-desc-drop-${video.id}`}
          type="file"
          accept=".txt,.md,.vtt,.srt,text/plain,text/markdown"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            // Reset so dropping the same file again still fires onChange.
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
      </label>

      {/* Regenerate on the left, copy right next to it. Header eyebrow +
          "generated [date]" line removed - the section heading lives one
          level up in VideoDetail, so this just shows the actions. */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => generate.mutate(undefined)}
          disabled={generate.isPending || upload.isPending || !hasTranscriptSource}
          title={hasTranscriptSource ? '' : 'link a vault transcript above, drop one, or add the full script first'}
        >
          {generate.isPending ? 'drafting…' : has ? 'regenerate' : 'generate description'}
        </button>
        {has && (
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'copied ✓' : 'copy'}
          </button>
        )}
      </div>

      {!hasTranscriptSource && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          link a vault transcript, drop one above, or fill in the full script section first.
        </span>
      )}

      {generate.isPending && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          drafting description in your voice. uses your focus CTA + the transcript. usually 20-60 seconds.
        </span>
      )}

      {upload.isError && (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
          upload failed: {(upload.error as Error)?.message}
        </span>
      )}

      {has && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => saveDraft(e.target.value)}
          rows={Math.min(20, Math.max(8, draft.split('\n').length + 1))}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--ink)',
            padding: 'var(--space-4)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--body)',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
            whiteSpace: 'pre-wrap',
          }}
        />
      )}

      {generate.isError && (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
          {(generate.error as Error).message}
        </span>
      )}

      {pickerOpen && (
        <TranscriptPicker
          currentRelPath={tsMatch?.rel_path ?? null}
          onClose={() => setPickerOpen(false)}
          onPick={(rel) => link.mutate(rel)}
          linking={link.isPending}
        />
      )}

      <style>{`
        .vd-ts-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-md);
          border: 1px solid var(--hairline);
          background: rgba(255,255,255,0.03);
          flex-wrap: wrap;
        }
        .vd-ts-banner--linked {
          border-color: color-mix(in srgb, var(--recovery) 30%, var(--hairline));
          background: color-mix(in srgb, var(--recovery) 6%, rgba(255,255,255,0.03));
        }
        .vd-ts-banner--detected {
          border-color: color-mix(in srgb, var(--strain) 35%, var(--hairline));
          background: color-mix(in srgb, var(--strain) 6%, rgba(255,255,255,0.03));
        }
        .vd-ts-banner__main { display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 0; }
        .vd-ts-banner__icon { font-size: 18px; line-height: 1; }
        .vd-ts-banner__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .vd-ts-banner__label {
          font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
          color: var(--muted); font-weight: 700;
        }
        .vd-ts-banner__file {
          font-family: var(--font-display); font-weight: 600;
          font-size: var(--body); color: var(--ink);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .vd-ts-banner__hint {
          font-size: 11px; color: var(--muted-2);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .vd-ts-banner__actions { display: flex; gap: var(--space-2); align-items: center; flex-shrink: 0; }
        .vd-ts-actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
      `}</style>
    </div>
  );
}

/**
 * Right-side slide-over for picking a YouTube transcript from the vault.
 * Mirrors the BankPicker UX so it feels familiar - search at the top, a
 * scrollable list of cards, click to link. The current selection (if any)
 * is rendered with a different action label.
 */
function TranscriptPicker({
  currentRelPath,
  onClose,
  onPick,
  linking,
}: {
  currentRelPath: string | null;
  onClose: () => void;
  onPick: (rel_path: string) => void;
  linking: boolean;
}) {
  const list = useQuery({ queryKey: ['yt-transcripts'], queryFn: api.listYoutubeTranscripts });
  const [query, setQuery] = useState('');
  const items = list.data?.items ?? [];
  const filtered = items.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      i.title.toLowerCase().includes(q)
      || i.filename.toLowerCase().includes(q)
      || (i.youtube_id ?? '').toLowerCase().includes(q)
    );
  });
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 120,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          height: '100%',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--hairline)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          overflow: 'hidden',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div>
            <span className="eyebrow">pick a transcript</span>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.25rem' }}>
              {items.length} in your vault
            </h3>
          </div>
          <button type="button" className="btn btn--ghost" onClick={onClose}>done</button>
        </header>
        <input
          type="text"
          placeholder="search by title, filename, or youtube id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--hairline)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--ink)',
            fontSize: 'var(--body)',
            outline: 'none',
          }}
        />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingBottom: 'var(--space-4)' }}>
          {list.isLoading && <p className="muted">loading…</p>}
          {!list.isLoading && filtered.length === 0 && <p className="muted">no transcripts match.</p>}
          {filtered.map((i) => {
            const isCurrent = i.rel_path === currentRelPath;
            return (
              <article
                key={i.rel_path}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isCurrent ? 'var(--recovery)' : 'var(--hairline)'}`,
                  background: isCurrent ? 'color-mix(in srgb, var(--recovery) 8%, transparent)' : 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--body-sm)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i.title}
                  </span>
                  <button
                    type="button"
                    className={`btn ${isCurrent ? 'btn--ghost' : 'btn--primary'}`}
                    onClick={() => onPick(i.rel_path)}
                    disabled={isCurrent || linking}
                    style={{ fontSize: 'var(--body-sm)', padding: '4px 12px', flexShrink: 0 }}
                  >
                    {isCurrent ? 'in use' : linking ? '…' : 'use this'}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>
                  {i.filename}
                  {i.youtube_id ? ` · ${i.youtube_id}` : ''}
                </span>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

/**
 * Visual section heading used to break VideoDetail into clear chapters
 * (script → title script → titles + thumbnail → youtube description). A
 * subtle top border separates the section from whatever came above so the
 * panel doesn't blur into one continuous wall.
 */
/**
 * Skill card above the script builder. Instead of filling the briefs in by
 * hand, the creator can run the youtube-script skill in a Claude chat - it interviews
 * her through the idea and writes back into this same video file. One click
 * opens the chat pre-scoped to THIS video (passes its source_file as the
 * skill input) so there's no picker step. Mirrors the run-skill rows on the
 * Skills page so it reads as the same control.
 */
function ClaudeInterviewCallout({ videoId, video }: { videoId: string; video: Video }) {
  const { openChat } = useChat();
  const [opening, setOpening] = useState(false);

  async function run() {
    if (opening) return;
    setOpening(true);
    try {
      // Resolve the skill id by name - the id is location-derived
      // (skill-<pack>-youtube-script) and differs between this vault and the
      // shipped template, so we never hardcode it.
      const { items } = await api.skills();
      const summary = items.find((s) => s.name === 'youtube-script');
      if (!summary) return;
      const full = await api.getSkill(summary.id);

      // Re-fetch the freshest record so the chat binds to THIS video's current
      // state (title/goal/status/script that may have changed since the panel
      // loaded), not a stale closure. Fall back to the prop if the fetch fails.
      let v = video;
      try {
        v = await api.getVideo(videoId);
      } catch {
        /* use the prop data */
      }

      const src = v.source_file;
      const lines = [`Run the ${full.name} skill. Read and follow its instructions at ${full.location}.`];
      if (src) lines.push('', 'Use these inputs:', `- Video: ${src}`);

      // Explicitly bind the chat to this exact video and point the skill at its
      // file for the full current context. The file IS the source of truth -
      // it carries the goal, the brief sections already filled in, and any
      // drafted script - so reading it gives the chat everything that's live.
      lines.push('', `This is for the video "${v.title}".`);
      if (src) {
        lines.push(
          `Its project file is at ${src}. Read that file first for the full current context - the goal, the brief sections already filled in, and any drafted script - and write everything back into that same file. Stay on this video; do not pick or create a different one.`,
        );
      }
      lines.push(`Current state: status ${v.status}${v.goal ? `, goal: "${v.goal}"` : ''}.`);

      openChat({ seed: lines.join('\n'), autosend: true, context: full.title || full.name || v.title });
    } catch {
      // skill not found - leave the card as-is, nothing to open
    } finally {
      setOpening(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--hairline)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          width: 38,
          height: 38,
          borderRadius: 'var(--radius-sm)',
          display: 'grid',
          placeItems: 'center',
          color: ICON_COLOR.youtube,
          background: `color-mix(in srgb, ${ICON_COLOR.youtube} 14%, transparent)`,
        }}
      >
        <Icon kind="youtube" size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--body)', fontWeight: 600, color: 'var(--ink)' }}>Script a Video</div>
        <div className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.45, marginTop: 2 }}>
          prefer to talk it out? Claude interviews you through the idea and fills these briefs in.
        </div>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={opening}
        title="run the script builder in a Claude chat, scoped to this video"
        style={{ ...solidButtonStyle, cursor: opening ? 'default' : 'pointer', opacity: opening ? 0.6 : 1 }}
      >
        <PlayIcon /> {opening ? 'opening…' : 'run skill'}
      </button>
    </div>
  );
}

function VdSectionHeading({
  eyebrow,
  title,
  sub,
  rightAction,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  // Optional action button rendered on the right side of the heading row -
  // baseline-aligned with the title so it sits inline with the section
  // descriptor rather than floating below it.
  rightAction?: ReactNode;
}) {
  return (
    <div
      style={{
        paddingTop: 'var(--space-5)',
        marginTop: 'var(--space-2)',
        borderTop: '1px solid var(--hairline)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {eyebrow && <span className="eyebrow" style={{ color: 'var(--strain)' }}>{eyebrow}</span>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <h3
          className="h2"
          style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
          }}
        >
          {title}
        </h3>
        {rightAction}
      </div>
      {sub && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--body-sm)', lineHeight: 1.5, maxWidth: '56ch' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
