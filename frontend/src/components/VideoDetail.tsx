import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Video, VideoStatus, VideoSuggestions } from '../api';
import { VideoScriptBuilder, type VideoScriptBuilderHandle } from './VideoScriptBuilder';

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

  useEffect(() => {
    if (data) {
      setTitle(data.title);
      setGoal(data.goal ?? '');
      setScript(data.script_content ?? '');
      setSaveStatus('idle');
    }
  }, [data]);

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
    onSuccess: () => {
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
  const lastSavedRef = useRef<{ title: string; goal: string; script: string } | null>(null);
  // Initialize ref the first time `data` lands so the auto-save effect
  // doesn't fire a redundant save against the value just received.
  useEffect(() => {
    if (data && !lastSavedRef.current) {
      lastSavedRef.current = {
        title: data.title,
        goal: data.goal ?? '',
        script: data.script_content ?? '',
      };
    }
  }, [data]);

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
            lastSavedRef.current = { title, goal, script };
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

  const currentStage = data ? STAGES.findIndex((s) => s.status === data.status) : -1;

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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span className="eyebrow">video detail</span>
          <button
            type="button"
            onClick={() => void handleClose()}
            aria-label="close"
            style={{
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-pill)',
              padding: '6px 14px',
              color: 'var(--muted)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 'var(--body-sm)',
              fontWeight: 500,
            }}
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
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                // auto-save handled by debounced effect — no manual flag needed
              }}
              style={{
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
                width: '100%',
              }}
            />

            {/* Goal of the video - shown as the subhead on each video card.
                Keep it short, one line. the creator sets it here. */}
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <span className="eyebrow">goal of this video</span>
              <input
                value={goal}
                onChange={(e) => {
                  setGoal(e.target.value);
                  // auto-save handled by debounced effect — no manual flag needed
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

            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              <span className="eyebrow">progress</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {STAGES.map((s, i) => {
                  const filled = i <= currentStage;
                  const active = i === currentStage;
                  return (
                    <button
                      key={s.status}
                      type="button"
                      onClick={() => setStage.mutate(s.status)}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: filled ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                        color: filled ? '#0E1116' : 'var(--muted)',
                        fontSize: 10,
                        fontWeight: active ? 700 : 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        transition: 'background var(--duration-fast) var(--ease-out)',
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
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
                sub="the drafted script for this video. edit anything you want before filming."
              />
              <textarea
                value={script}
                onChange={(e) => {
                  setScript(e.target.value);
                  // auto-save handled by debounced effect — no manual flag needed
                }}
                placeholder="no script yet. fill in the section briefs above, hit suggest stories, then draft script."
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
            </div>

            {/* ─── Title + thumbnail section ──────────────────────────── */}
            {data.status !== 'published' && (
              <div className="stack" style={{ gap: 'var(--space-4)' }}>
                <VdSectionHeading
                  eyebrow="step 3"
                  title="title + thumbnail"
                  sub="generate 10 title options + 5 thumbnail phrases. click any to lock as liked, then regenerate to refresh only the non-liked."
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
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>audience called out (click to like)</span>
                      {suggestions.titles_explicit.map((t, i) => (
                        <TitleRow key={`e${i}-${t.title}`} title={t.title} tag={t.formula} liked={!!t.liked} onToggle={() => toggleLiked('titles_explicit', i)} />
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>audience implied</span>
                      {suggestions.titles_implied.map((t, i) => (
                        <TitleRow key={`i${i}-${t.title}`} title={t.title} tag={t.formula} liked={!!t.liked} onToggle={() => toggleLiked('titles_implied', i)} />
                      ))}
                    </div>
                    <div className="stack" style={{ gap: 'var(--space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>thumbnail phrases (click to like)</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                        {suggestions.thumbnail_phrases.map((p, i) => (
                          <button
                            key={`p${i}-${p.phrase}`}
                            type="button"
                            onClick={() => toggleLiked('thumbnail_phrases', i)}
                            style={{
                              background: p.liked ? 'rgba(22,201,126,0.15)' : 'var(--surface)',
                              border: `1px solid ${p.liked ? 'var(--recovery)' : 'var(--hairline)'}`,
                              borderRadius: 'var(--radius-md)',
                              padding: '10px 14px',
                              fontFamily: 'var(--font-display)',
                              fontWeight: 600,
                              fontSize: 'var(--body)',
                              letterSpacing: '-0.01em',
                              cursor: 'pointer',
                              color: p.liked ? 'var(--recovery)' : 'var(--ink)',
                              transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                            }}
                          >
                            {p.phrase}
                            {p.gap && (
                              <span style={{ color: p.liked ? 'rgba(22,201,126,0.6)' : 'var(--muted-2)', fontSize: 10, marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                {p.gap}
                              </span>
                            )}
                          </button>
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

function TitleRow({ title, tag, liked, onToggle }: { title: string; tag?: string; liked?: boolean; onToggle?: () => void }) {
  return (
    <div
      onClick={onToggle}
      onDoubleClick={() => navigator.clipboard?.writeText(title)}
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'flex-start',
        padding: 'var(--space-3) var(--space-4)',
        background: liked ? 'rgba(22,201,126,0.15)' : 'var(--surface)',
        border: `1px solid ${liked ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
      }}
      title={liked ? 'click to unlike, double-click to copy' : 'click to like, double-click to copy'}
    >
      <span style={{ flex: 1, fontSize: 'var(--body)', lineHeight: 1.4, color: liked ? 'var(--recovery)' : 'var(--ink)' }}>{title}</span>
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
          marginTop: 4,
          whiteSpace: 'nowrap',
        }}>{tag}</span>
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
  // The generate mutation now optionally accepts an inline transcript. When
  // the creator drops a transcript file onto the section, the file text is passed
  // through and the description is drafted off that text (one-shot - it
  // doesn't overwrite the video's full script).
  const generate = useMutation({
    mutationFn: (transcript?: string) => api.generateVideoDescription(video.id, transcript),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', video.id] }),
  });
  const update = useMutation({
    mutationFn: (description: string) => api.updateVideoDescription(video.id, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video', video.id] }),
  });
  const [draft, setDraft] = useState<string>(video.description ?? '');
  const [copied, setCopied] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [droppedFileName, setDroppedFileName] = useState<string | null>(null);
  useEffect(() => { setDraft(video.description ?? ''); }, [video.description]);

  const has = !!(video.description && video.description.trim());
  const hasScript = !!(video.script_content && video.script_content.trim());

  async function handleFile(file: File) {
    const text = await file.text();
    if (!text.trim()) return;
    setDroppedFileName(file.name);
    generate.mutate(text);
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
      {/* Transcript drop zone. Drop a .txt / .md / .vtt / .srt file in
          here and the description is generated from that transcript. The
          file isn't saved as the video's full script (the full script is
          the drafted one, not the spoken recording) - this is one-shot
          input for description generation. */}
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
          {droppedFileName
            ? droppedFileName
            : dropActive
            ? 'drop the transcript file'
            : 'drop a transcript here, or click to browse'}
        </span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          .txt / .md / .vtt / .srt - generates the description from it
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
          disabled={generate.isPending || (!hasScript && !droppedFileName)}
          title={hasScript || droppedFileName ? '' : 'drop a transcript above first, or add a script in the full script section'}
        >
          {generate.isPending ? 'drafting…' : has ? 'regenerate' : 'generate description'}
        </button>
        {has && (
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'copied ✓' : 'copy'}
          </button>
        )}
      </div>

      {!hasScript && !droppedFileName && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          drop the transcript above to generate the description, or paste it into the full script section first.
        </span>
      )}

      {generate.isPending && hasScript && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          drafting description in your voice. uses your focus CTA + script content. usually 20-60 seconds.
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

      {!has && !generate.isPending && hasScript && (
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          click generate to draft a ready-to-paste description: your focus CTA at the top, a 2-sentence hook, and 4-6 timestamped chapters pulled from the script.
        </span>
      )}

      {generate.isError && (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
          {(generate.error as Error).message}
        </span>
      )}
    </div>
  );
}

/**
 * Visual section heading used to break VideoDetail into clear chapters
 * (script → title script → titles + thumbnail → youtube description). A
 * subtle top border separates the section from whatever came above so the
 * panel doesn't blur into one continuous wall.
 */
function VdSectionHeading({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
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
      {sub && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--body-sm)', lineHeight: 1.5, maxWidth: '56ch' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
