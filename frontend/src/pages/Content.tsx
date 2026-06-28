import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { PipelineResponse, Video, VideoStatus } from '../api';
import { VideoDetail } from '../components/VideoDetail';
import { YearGrid } from '../components/YearGrid';
import { AvatarToggle } from '../components/AvatarToggle';
import { BrainstormButton } from '../components/BrainstormButton';
import { ArchivedVideos } from '../components/ArchivedVideos';
import { FilterTabs } from '../components/FilterTabs';
import { PageTabs } from '../components/PageTabs';
import { SectionHeading } from '../components/SectionHeading';
import { ConnectAppCard } from '../components/ConnectAppCard';
import { YouTubeAnalytics } from '../components/YouTubeAnalytics';
import { formatRelative } from '../lib/format';
import { ghostButtonStyle, solidButtonStyle, filledPillStyle } from '../lib/ui';
import { Instagram, BankPicker, IG_CSS, CtaPopup, TargetPopup } from './Instagram';
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
  const { data, error } = useQuery<PipelineResponse>({
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
  const [ytCtaOpen, setYtCtaOpen] = useState(false);
  const [ytTargetOpen, setYtTargetOpen] = useState(false);
  // Stage filter for the YouTube cards ('all' shows every stage). Published is
  // the archive at the bottom - not part of the filter.
  const [ytFilter, setYtFilter] = useState<string>('all');
  const addYtFromBank = useMutation({
    mutationFn: (bi: BankItem) => {
      // A bank item is a quote/story snippet, not a video idea. We seed a
      // new video using the item's title (for synthesised stories) or the
      // first ~80 chars of its text (for raw quotes). the creator edits after.
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
  if (error) {
    return <div className="empty">couldn't load pipeline: {(error as Error).message}</div>;
  }

  const videos = data?.videos ?? [];

  // Categorise PURELY by status so a card moves to the right lane the moment its
  // stage changes (the stage bar / drag both just set status). The legacy
  // `queued` flag is no longer used for lane placement.
  const ideas = videos.filter((v) => v.status === 'idea');
  const scriptingCards = videos.filter((v) => v.status === 'scripted');
  const filmingCards = videos.filter((v) => v.status === 'filmed');
  const packagingCards = videos.filter((v) => v.status === 'editing');
  const ytActive = ideas.length + scriptingCards.length + filmingCards.length + packagingCards.length;
  // Lane display order (top -> bottom): furthest-along first, ideas last. Empty
  // lanes are hidden. (The filter row keeps its own pipeline order.)
  const ytStages: { key: VideoStatus; label: string; cards: Video[] }[] = [
    { key: 'editing', label: 'packaging', cards: packagingCards },
    { key: 'filmed', label: 'filming', cards: filmingCards },
    { key: 'scripted', label: 'scripting', cards: scriptingCards },
    { key: 'idea', label: 'ideas', cards: ideas },
  ];
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

  function handleDropStage(stage: VideoStatus, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    const video = videos.find((v) => v.id === id);
    if (!video || video.status === stage) return;
    // Lanes are status-based, so dropping just sets the status.
    updateStatus.mutate({ id, status: stage });
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      {/* The IG page's CSS block (ig-add-row, ig-idea-input, ig-pill*,
          ig-pick-card*, etc.) lives in IG_CSS. We re-inject it here so the
          YouTube tab's add-bar + bank picker get the same styling as IG. */}
      <style>{IG_CSS}</style>

      {/* YouTube / Instagram file-folder page-tabs on the left, brainstorm +
          avatar on the right, with a full-width hairline beneath. The avatar
          lives here (not inside either tab) so "who this is for" is visible from
          either channel view - it's upstream of both. No page title - the tabs
          are the header. */}
      <PageTabs
        value={tab}
        onChange={(v) => setTab(v as 'youtube' | 'instagram')}
        ariaLabel="content channel"
        options={[
          { value: 'youtube', label: 'youtube', count: ytActive + published.length },
          { value: 'instagram', label: 'instagram', count: igActiveCount },
        ]}
        rightActions={
          <>
            <BrainstormButton />
            <AvatarToggle />
          </>
        }
      />

      {/* Shows only while YouTube analytics isn't connected; self-hides once live. */}
      {tab === 'youtube' && <ConnectAppCard app="youtube" />}

      {tab === 'youtube' && data?.weekly_publish_year && (() => {
        const ytPublished = data.weekly_publish_year.filter((v) => typeof v === 'number' && v > 0).length;
        const ytPerWeeks = settings?.youtube_target_per_weeks ?? 1;
        const ytTargetLabel = ytPerWeeks <= 1
          ? 'target: 1 per week'
          : ytPerWeeks === 2 ? 'target: 1 every 2 weeks' : `target: 1 every ${ytPerWeeks} weeks`;
        const ytCtaSet = !!(settings?.youtube_cta_text ?? '').trim();
        return (
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div>
                <span className="eyebrow">your content output</span>
                <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
                  {ytPublished} {ytPublished === 1 ? 'week' : 'weeks'} you posted this year
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setYtCtaOpen(true)}
                  title="set the call-to-action the description generator points viewers to"
                  style={ytCtaSet ? filledPillStyle : ghostButtonStyle}
                >
                  {ytCtaSet ? 'CTA' : 'add CTA'}
                </button>
                <button
                  type="button"
                  onClick={() => setYtTargetOpen(true)}
                  title="set how often you publish"
                  style={filledPillStyle}
                >
                  {ytTargetLabel}
                </button>
              </div>
            </div>
            <div className="card" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Sync lives inside the tracking-squares card. */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {data?.youtube_last_sync && (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>synced {formatRelative(data.youtube_last_sync)}</span>
                )}
                <button
                  type="button"
                  onClick={() => syncYT.mutate()}
                  disabled={syncYT.isPending}
                  style={ghostButtonStyle}
                >
                  {syncYT.isPending ? 'syncing youtube' : 'sync from youtube'}
                </button>
              </div>
              <YearGrid data={data.weekly_publish_year} targetPerWeeks={ytPerWeeks} showSummary={false} />
            </div>
            {syncYT.isError && (
              <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>{(syncYT.error as Error).message}</span>
            )}
          </div>
        );
      })()}

      {tab === 'youtube' && (
        // Add-row, mirroring the IG pattern: bare-underline idea input + "add
        // idea" (ghost -> green when typing) + "add from bank" (cream solid).
        <div className="ig-add-row" style={{ marginBottom: 0 }}>
          <div className="ig-idea-input" style={{ marginBottom: 0 }}>
            <input
              type="text"
              placeholder="add a video idea..."
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
              onClick={() => {
                if (ytIdeaDraft.trim()) {
                  createIdea.mutate(ytIdeaDraft.trim());
                  setYtIdeaDraft('');
                }
              }}
              disabled={createIdea.isPending}
              style={
                ytIdeaDraft.trim()
                  ? { ...ghostButtonStyle, background: 'var(--accent)', color: 'var(--bg)', border: '1px solid var(--accent)' }
                  : ghostButtonStyle
              }
            >
              {createIdea.isPending ? '...' : 'add idea'}
            </button>
          </div>
          <button
            type="button"
            className="ig-add-row__bank"
            onClick={() => setYtBankOpen(true)}
            style={solidButtonStyle}
          >
            + add from bank
          </button>
        </div>
      )}

      {/* Stage filter (mirrors Instagram). Published is the archive at the
          bottom - not a filter option. 'all' shows every stage lane. */}
      {tab === 'youtube' && (
        <FilterTabs
          value={ytFilter}
          onChange={setYtFilter}
          ariaLabel="filter videos by stage"
          options={[
            { value: 'all', label: 'all', count: ytActive },
            { value: 'idea', label: 'ideas', count: ideas.length },
            { value: 'scripted', label: 'scripting', count: scriptingCards.length },
            { value: 'filmed', label: 'filming', count: filmingCards.length },
            { value: 'editing', label: 'packaging', count: packagingCards.length },
          ]}
        />
      )}

      {tab === 'youtube' && ytStages.map((stage) => (
        // Empty lanes are hidden entirely.
        (stage.cards.length > 0 && (ytFilter === 'all' || ytFilter === stage.key)) && (
          <section
            key={stage.key}
            className="section"
            style={{ marginTop: 0 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropStage(stage.key, e)}
          >
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <SectionHeading label={stage.label} count={stage.cards.length} />
            </div>
            <div className="video-grid">
              {stage.cards.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onSetStage={(status) => updateStatus.mutate({ id: v.id, status })}
                  onOpen={() => setOpenId(v.id)}
                />
              ))}
            </div>
          </section>
        )
      ))}

      {/* Analytics: import the Studio CSV + run the analysis skill, and show top
          content per monitored metric. Sits between the pipeline and the archive. */}
      {tab === 'youtube' && published.length > 0 && <YouTubeAnalytics published={published} />}

      {tab === 'youtube' && published.length > 0 && (
        // Extra top gap so the published archive reads as clearly separate from
        // the active pipeline above it.
        <section className="section" style={{ marginTop: 'var(--space-7)' }}>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <SectionHeading label="published" count={published.length} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
            <span className="eyebrow" style={{ marginRight: 'var(--space-2)' }}>sort by</span>
            <FilterTabs
              value={sortBy}
              onChange={(v) => setSortBy(v as typeof sortBy)}
              ariaLabel="sort published videos"
              options={[
                { value: 'date', label: 'recent' },
                { value: 'views', label: 'views' },
                { value: 'ctr', label: 'ctr' },
                { value: 'sub_rate', label: 'sub rate' },
                { value: 'conversion', label: 'conversion' },
              ]}
            />
          </div>
          <div className="stack">
            {published.map((v) => (
              <PublishedRow key={v.id} v={v} onClick={() => setOpenId(v.id)} highlight={sortBy} />
            ))}
          </div>
        </section>
      )}

      {tab === 'youtube' && <ArchivedVideos />}

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
          /* Resting soft lift (SURFACE_LIFT / Rule 2) so the card reads against
             the canvas in light mode; hover deepens it. */
          box-shadow: 0 1px 3px rgba(15, 15, 15, 0.06), 0 4px 12px -2px rgba(15, 15, 15, 0.07);
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
      {ytCtaOpen && <CtaPopup channel="youtube" onClose={() => setYtCtaOpen(false)} />}
      {ytTargetOpen && <TargetPopup channel="youtube" current={settings?.youtube_target_per_weeks ?? 1} onClose={() => setYtTargetOpen(false)} />}
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
          still a button so the creator can advance the video's status with one
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
