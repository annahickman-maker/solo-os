import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PipelineResponse, Video, VideoStatus } from '../api';
import { VideoDetail } from '../components/VideoDetail';
import { YearGrid } from '../components/YearGrid';
import { AvatarToggle } from '../components/AvatarToggle';
import { BrainstormButton } from '../components/BrainstormButton';
import { FocusCtaEditor } from '../components/FocusCtaEditor';
import { formatRelative } from '../lib/format';
import { Instagram, BankPicker, IG_CSS, Stat } from './Instagram';
import type { BankItem } from '../api';

const STAGES: { status: VideoStatus; label: string }[] = [
  { status: 'scripted', label: 'scripted' },
  { status: 'filmed', label: 'filmed' },
  { status: 'editing', label: 'editing' },
  { status: 'published', label: 'published' },
];

function stageIndex(s: VideoStatus): number {
  if (s === 'idea') return -1;
  return STAGES.findIndex((x) => x.status === s);
}

export function Content() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'youtube' | 'instagram'>('youtube');
  const { data, isLoading, error } = useQuery<PipelineResponse>({
    queryKey: ['pipeline', false],
    queryFn: () => api.pipeline(false),
  });

  const createIdea = useMutation({
    mutationFn: (title: string) => api.createVideo({ title, status: 'idea' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  // YT add-bar state: text draft + bank picker overlay.
  const [ytIdeaDraft, setYtIdeaDraft] = useState('');
  const [ytBankOpen, setYtBankOpen] = useState(false);
  const addYtFromBank = useMutation({
    mutationFn: (bi: BankItem) => {
      // A bank item is a quote/story snippet, not a video idea. We seed a
      // new video using the item's title (for synthesised stories) or the
      // first ~80 chars of its text (for raw quotes). Anna edits after.
      const seed = (bi.title ?? bi.text ?? '').trim();
      const title = seed.length > 80 ? seed.slice(0, 80) + '…' : seed;
      return api.createVideo({ title, status: 'idea' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  const syncYT = useMutation({
    mutationFn: () => api.syncYouTube(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  // Pull just the count of the IG queue so we can show it on the tab toggle.
  const { data: igData } = useQuery({
    queryKey: ['ig-queue'],
    queryFn: api.igQueue,
  });
  const igActiveCount =
    (igData?.counts?.queued ?? 0) + (igData?.counts?.filmed ?? 0) + (igData?.counts?.posted ?? 0);

  const updateSettings = useMutation({
    mutationFn: (body: { youtube_target_per_weeks?: number }) => api.updateSettings(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  function editPublishingTarget() {
    const current = settings?.youtube_target_per_weeks ?? 1;
    const v = window.prompt(
      'how often do you want to publish?\n\nenter the number of weeks between videos (1 = weekly, 2 = every 2 weeks):',
      String(current)
    );
    if (!v) return;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 1 || n > 12) return;
    updateSettings.mutate({ youtube_target_per_weeks: n });
  }

  const updateStatus = useMutation({
    mutationFn: (vars: { id: string; status: VideoStatus }) =>
      api.updateVideo(vars.id, { status: vars.status }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['pipeline'] });
      const prev = qc.getQueryData<PipelineResponse>(['pipeline']);
      if (prev) {
        const next: PipelineResponse = {
          ...prev,
          videos: prev.videos.map((v) =>
            v.id === vars.id ? { ...v, status: vars.status } : v
          ),
        };
        qc.setQueryData(['pipeline'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  // Move a video between the queue and this-week buckets without changing its
  // script status. Lets a scripted video sit in the queue until she's ready to film.
  const updateQueued = useMutation({
    mutationFn: (vars: { id: string; queued: boolean }) =>
      api.updateVideo(vars.id, { queued: vars.queued }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['pipeline'] });
      const prev = qc.getQueryData<PipelineResponse>(['pipeline']);
      if (prev) {
        const next: PipelineResponse = {
          ...prev,
          videos: prev.videos.map((v) =>
            v.id === vars.id ? { ...v, queued: vars.queued ? 1 : 0 } : v
          ),
        };
        qc.setQueryData(['pipeline'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  if (error) {
    return <div className="empty">couldn't load pipeline: {(error as Error).message}</div>;
  }

  const videos = data?.videos ?? [];

  // Bucket rules:
  //   published bucket: status='published'
  //   ideas bucket:    queued=1 OR status='idea' (scripted-but-parked sits here)
  //   working bucket:  everything else (scripted/filmed/editing currently active)
  const isQueued = (v: Video) => v.queued === 1 || v.status === 'idea';
  const working = videos
    .filter((v) => v.status !== 'published' && !isQueued(v))
    .sort((a, b) => (a.queue_order ?? 999) - (b.queue_order ?? 999));
  const ideas = videos.filter((v) => v.status !== 'published' && isQueued(v));
  const [sortBy, setSortBy] = useState<'date' | 'views' | 'ctr' | 'sub_rate' | 'conversion'>('date');
  const published = videos
    .filter((v) => v.status === 'published')
    .sort((a, b) => {
      switch (sortBy) {
        case 'views': return (b.view_count ?? 0) - (a.view_count ?? 0);
        case 'ctr': return (b.ctr_pct ?? -1) - (a.ctr_pct ?? -1);
        case 'sub_rate': return (b.sub_rate_pct ?? -1) - (a.sub_rate_pct ?? -1);
        case 'conversion': return (b.conversion_pct ?? -1) - (a.conversion_pct ?? -1);
        case 'date':
        default: return (b.publish_date ?? 0) - (a.publish_date ?? 0);
      }
    });

  function handleDrop(target: 'working' | 'ideas', e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const video = videos.find((v) => v.id === id);
    if (!video) return;
    if (target === 'ideas') {
      // Park in queue. Status stays as-is so a scripted video stays scripted -
      // it just lives in the queue instead of this-week.
      if (video.queued !== 1) updateQueued.mutate({ id, queued: true });
    } else {
      // Promote to this-week. If it was a raw idea, also bump status to scripted.
      if (video.queued === 1) updateQueued.mutate({ id, queued: false });
      if (video.status === 'idea') updateStatus.mutate({ id, status: 'scripted' });
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-8)' }}>
      {/* The IG page's CSS block (ig-add-row, ig-idea-input, ig-pill*,
          ig-pick-card*, etc.) lives in IG_CSS. We re-inject it here so the
          YouTube tab's add-bar + bank picker get the same styling as IG. */}
      <style>{IG_CSS}</style>

      {/* Page title on the left, avatar trigger on the right. Avatar lives
          here (not inside either tab) so "who this is for" is visible from
          either YT or IG view - it's upstream of both channels. */}
      <header
        className="page-header"
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <span className="eyebrow">content</span>
          <h1 className="h2">youtube + instagram</h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <BrainstormButton />
          <AvatarToggle />
        </div>
      </header>

      <div
        style={{
          display: 'inline-flex',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-pill)',
          padding: 4,
          alignSelf: 'flex-start',
        }}
      >
        {(['youtube', 'instagram'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: 'none',
              padding: '8px 20px',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              background: tab === t ? 'var(--ink)' : 'transparent',
              color: tab === t ? 'var(--bg)' : 'var(--muted)',
              fontSize: 'var(--body-sm)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
          >
            {t}
            {t === 'youtube' && (
              <span style={{ marginLeft: 8, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                {working.length + ideas.length + published.length}
              </span>
            )}
            {t === 'instagram' && (
              <span style={{ marginLeft: 8, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                {igActiveCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'youtube' && data?.weekly_publish_year && (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div>
              <span className="eyebrow" style={{ color: 'var(--strain)' }}>publishing year</span>
              <h3 className="h3" style={{ marginTop: 4 }}>your content output</h3>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              {data?.youtube_last_sync && (
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  synced {formatRelative(data.youtube_last_sync)}
                </span>
              )}
              <button
                type="button"
                onClick={() => syncYT.mutate()}
                disabled={syncYT.isPending}
                className="btn"
                style={{ fontSize: 'var(--body-sm)' }}
              >
                {syncYT.isPending ? 'syncing youtube' : 'sync from youtube'}
              </button>
            </div>
          </div>
          <YearGrid
            data={data.weekly_publish_year}
            targetPerWeeks={settings?.youtube_target_per_weeks ?? 1}
            onEditTarget={editPublishingTarget}
          />
          {syncYT.isError && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              {(syncYT.error as Error).message}
            </span>
          )}
        </div>
      )}

      {tab === 'youtube' && (
        // Pull tight under the output card so CTA reads as part of "what
        // you're publishing → where it points to" instead of a standalone
        // block. The bottom margin adds visual separation so "this week"
        // below doesn't feel glued to the CTA.
        <div style={{ marginTop: 'calc(-1 * var(--space-7))', marginBottom: 'var(--space-5)' }}>
          <FocusCtaEditor channel="youtube" />
        </div>
      )}

      {tab === 'youtube' && (
        // YT queue title block + add-row act as one block to mirror the
        // IG "your Instagram queue" pattern. Title on top with the same
        // three-bucket stat strip (cue / this week / published), add-row
        // directly under it.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <header className="ig-page-head" style={{ marginBottom: 0 }}>
            <div>
              <h1 className="h2">your YouTube queue</h1>
              <p className="ig-page-sub">
                ideas in the cue, drafts in progress, and videos that have shipped.
              </p>
            </div>
            <div className="ig-stat-strip">
              <Stat label="in cue" value={ideas.length} color="var(--recovery)" />
              <Stat label="this week" value={working.length} color="var(--sleep)" />
              <Stat label="published" value={published.length} color="var(--muted-2)" />
            </div>
          </header>

          {/* Add-bar - mirrors the IG add-row pattern (text input +
              "add from bank"). Replaces the old "+ add idea" button that
              used to live inside the video-cue section header. */}
          <div className="ig-add-row" style={{ marginBottom: 0 }}>
          <div className="ig-idea-input" style={{ marginBottom: 0 }}>
            <input
              type="text"
              placeholder="add a video idea… (e.g. 'how I built a $5k OS in one week')"
              value={ytIdeaDraft}
              onChange={(e) => setYtIdeaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ytIdeaDraft.trim()) {
                  createIdea.mutate(ytIdeaDraft.trim());
                  setYtIdeaDraft('');
                }
              }}
              className="ig-idea-input__field"
            />
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => {
                if (ytIdeaDraft.trim()) {
                  createIdea.mutate(ytIdeaDraft.trim());
                  setYtIdeaDraft('');
                }
              }}
              disabled={createIdea.isPending || !ytIdeaDraft.trim()}
              style={{ ['--dim-c' as any]: 'var(--recovery)' }}
            >
              {createIdea.isPending ? '...' : 'add idea'}
            </button>
          </div>
          <button
            type="button"
            className="rep-btn rep-btn--ghost ig-add-row__bank"
            onClick={() => setYtBankOpen(true)}
          >
            + add from bank
          </button>
        </div>
        </div>
      )}

      {tab === 'youtube' && (
      <section
        className="section"
        style={{ marginTop: 0 }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop('working', e)}
      >
        <header className="section__header">
          <div className="section__title">
            <span className="eyebrow">this week</span>
            <h3 className="h3">content to be filmed this week</h3>
          </div>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            drag down to park as an idea
          </span>
        </header>
        {isLoading ? (
          <div className="empty">loading</div>
        ) : working.length === 0 ? (
          <div
            className="empty"
            style={{
              padding: 'var(--space-7)',
              border: '1.5px dashed var(--hairline)',
              borderRadius: 'var(--radius-lg)',
            }}
          >
            drag an idea here to start work
          </div>
        ) : (
          <div className="video-grid">
            {working.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onSetStage={(status) => updateStatus.mutate({ id: v.id, status })}
                onOpen={() => setOpenId(v.id)}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {tab === 'youtube' && (
      <section
        className="section"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop('ideas', e)}
        // Pull tight under "this week" so the queue + this-week read as one
        // section (drag-to-park flow lives between them).
        style={{ marginTop: 'calc(-1 * var(--space-6))' }}
      >
        <header className="section__header">
          <div className="section__title">
            <span className="eyebrow">video cue</span>
            <h3 className="h3">
              {ideas.length === 0
                ? 'cue is empty'
                : `${ideas.length} in the cue`}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              grey bar = idea, green bar = scripted
            </span>
          </div>
        </header>
        {ideas.length === 0 ? (
          <div className="empty">drag a video down here to park it in the cue</div>
        ) : (
          <div className="video-grid">
            {ideas.map((v) => (
              <VideoCard
                key={v.id}
                video={v}
                onSetStage={(status) => updateStatus.mutate({ id: v.id, status })}
                onOpen={() => setOpenId(v.id)}
              />
            ))}
          </div>
        )}
      </section>
      )}

      {tab === 'youtube' && published.length > 0 && (
        <section className="section">
          <header className="section__header">
            <div className="section__title">
              <span className="eyebrow">published</span>
              <h3 className="h3">{published.length} video{published.length === 1 ? '' : 's'} live</h3>
            </div>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              click any to expand
            </span>
          </header>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <span className="eyebrow" style={{ alignSelf: 'center', marginRight: 'var(--space-2)' }}>sort by</span>
            {([
              { key: 'date', label: 'recent' },
              { key: 'views', label: 'views' },
              { key: 'ctr', label: 'ctr' },
              { key: 'sub_rate', label: 'sub rate' },
              { key: 'conversion', label: 'conversion' },
            ] as const).map((opt) => {
              const active = sortBy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortBy(opt.key)}
                  className="btn"
                  style={{
                    fontSize: 'var(--body-sm)',
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--bg)' : 'var(--muted)',
                    borderColor: active ? 'var(--ink)' : 'var(--hairline)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div className="stack">
            {published.map((v) => (
              <PublishedRow key={v.id} v={v} onClick={() => setOpenId(v.id)} highlight={sortBy} />
            ))}
          </div>
        </section>
      )}

      {tab === 'instagram' && <Instagram />}

      <style>{`
        .video-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--space-4);
        }
        @media (max-width: 768px) {
          .video-grid {
            grid-template-columns: 1fr;
          }
        }

        /* YT video card - styled to match .ig-card aesthetic (surface bg,
           hairline border, subtle hover lift, thin progress bars at the
           bottom). No tag chip - YT videos aren't categorised by tag. */
        .yt-card {
          background: var(--surface);
          border: 1px solid var(--hairline);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          transition: transform 0.18s, border-color 0.18s, box-shadow 0.18s;
          position: relative;
        }
        .yt-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.22);
          box-shadow: 0 12px 32px -20px rgba(0,0,0,0.55);
        }
        /* Match .ig-card__title sizing: same weight, font-family, size. */
        .yt-card__title {
          margin: 0;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.05rem;
          line-height: 1.25;
          letter-spacing: -0.015em;
        }
        /* Goal subhead - mirrors .ig-card__preview styling. */
        .yt-card__goal {
          margin: 0;
          font-size: var(--body-sm);
          line-height: 1.55;
          color: var(--muted);
          flex: 1;
        }
        .yt-card__order {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted-2);
          font-weight: 600;
        }
        .yt-card__stages {
          display: flex;
          gap: 4px;
          margin-top: auto;
        }
        .yt-stage {
          flex: 1;
          height: 4px;
          min-height: 4px;
          border: none;
          border-radius: 2px;
          background: rgba(255,255,255,0.06);
          cursor: pointer;
          padding: 0;
          font-size: 0;
          line-height: 0;
          transition: background 0.18s, height 0.18s;
        }
        .yt-stage--on { background: var(--accent); }
        .yt-stage--current { height: 6px; min-height: 6px; margin-top: -1px; }
        .yt-stage:hover { background: var(--ink); }
      `}</style>

      <VideoDetail videoId={openId} onClose={() => setOpenId(null)} />

      {ytBankOpen && (
        <BankPicker
          existingQuoteIds={new Set()}
          onAdd={(bi) => addYtFromBank.mutate(bi)}
          onClose={() => setYtBankOpen(false)}
          pending={addYtFromBank.isPending}
        />
      )}
    </div>
  );
}

function formatStat(n?: number | null): string {
  if (n == null) return '-';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function pctColor(value: number | null | undefined, low: number, high: number): string {
  if (value == null) return 'var(--muted-2)';
  if (value < low) return 'var(--danger)';
  if (value > high) return 'var(--recovery)';
  return 'var(--strain)';
}

function StatCol({ label, value, color, highlight }: { label: string; value: string; color?: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 56 }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: highlight ? '1.25rem' : '1.0625rem',
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color: color ?? 'var(--ink)',
        opacity: highlight ? 1 : 0.85,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: highlight ? 'var(--ink)' : 'var(--muted-2)',
        fontWeight: highlight ? 600 : 400,
      }}>
        {label}
      </div>
    </div>
  );
}

function PublishedRow({
  v,
  onClick,
  highlight,
}: {
  v: Video;
  onClick: () => void;
  highlight?: 'date' | 'views' | 'ctr' | 'sub_rate' | 'conversion';
}) {
  const qc = useQueryClient();
  const toggleTransform = useMutation({
    mutationFn: () => api.setVideoTransformation(v.id, !v.tied_to_transformation),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['pipeline'] });
      const prev = qc.getQueryData<PipelineResponse>(['pipeline', false]);
      if (prev) {
        qc.setQueryData<PipelineResponse>(['pipeline', false], {
          ...prev,
          videos: prev.videos.map((x) =>
            x.id === v.id ? { ...x, tied_to_transformation: x.tied_to_transformation ? 0 : 1 } : x
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['pipeline', false], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['reputation'] });
    },
  });
  const tied = !!v.tied_to_transformation;
  const durationLabel = v.duration_sec
    ? `${Math.floor(v.duration_sec / 60)}m`
    : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleTransform.mutate();
        }}
        title={tied ? 'tagged: part of current transformation' : 'tag as part of current transformation'}
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
          border: `1.5px solid ${tied ? 'var(--recovery)' : 'var(--hairline)'}`,
          background: tied ? 'var(--recovery)' : 'transparent',
          color: tied ? 'var(--bg)' : 'var(--muted-2)',
          cursor: 'pointer',
          flexShrink: 0,
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {tied ? '★' : '☆'}
      </button>
      <div
        className="stack"
        onClick={onClick}
        style={{ gap: 2, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <span style={{ wordBreak: 'break-word' }}>{v.title}</span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums' }}>
          {v.publish_date && new Date(v.publish_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {durationLabel && <> · {durationLabel}</>}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline', flexShrink: 0 }} onClick={onClick}>
        <StatCol label="views" value={formatStat(v.view_count)} highlight={highlight === 'views'} />
        <StatCol label="ctr" value={v.ctr_pct != null ? `${v.ctr_pct.toFixed(1)}%` : '-'} color={pctColor(v.ctr_pct, 3, 5)} highlight={highlight === 'ctr'} />
        <StatCol label="sub rate" value={v.sub_rate_pct != null ? `${v.sub_rate_pct.toFixed(2)}%` : '-'} color={pctColor(v.sub_rate_pct, 0.5, 1)} highlight={highlight === 'sub_rate'} />
        <StatCol label="conv" value={v.conversion_pct != null ? `${v.conversion_pct.toFixed(2)}%` : '-'} color={pctColor(v.conversion_pct, 0.5, 1)} highlight={highlight === 'conversion'} />
      </div>
    </div>
  );
}

function VideoCard({
  video,
  onSetStage,
  onOpen,
}: {
  video: Video;
  onSetStage: (next: VideoStatus) => void;
  onOpen?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const current = stageIndex(video.status);
  const isIdea = video.status === 'idea';

  return (
    <article
      className="yt-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', video.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onOpen?.();
      }}
      style={{ opacity: dragging ? 0.4 : 1 }}
    >
      <h3 className="yt-card__title">{video.title}</h3>
      {video.goal && (
        <p className="yt-card__goal">{video.goal}</p>
      )}
      {video.queue_order != null && (
        <span className="yt-card__order">#{video.queue_order} in queue</span>
      )}

      {/* Thin clickable progress bars at the bottom of the card. Mirrors the
          .ig-stage row on the Instagram cards visually, but each bar is
          still a button so Anna can advance the video's status with one
          click. No text labels - the bar fill is the indicator. */}
      <div className="yt-card__stages">
        {STAGES.map((s, i) => {
          const filled = !isIdea && i <= current;
          const active = !isIdea && i === current;
          return (
            <button
              key={s.status}
              type="button"
              onClick={() => onSetStage(s.status)}
              aria-label={`set status to ${s.label}`}
              title={s.label}
              className={`yt-stage${filled ? ' yt-stage--on' : ''}${active ? ' yt-stage--current' : ''}`}
            />
          );
        })}
      </div>
    </article>
  );
}
