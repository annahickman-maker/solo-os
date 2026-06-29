import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mediaUrl, type BankItem, type BankKind, type IgItemStatus, type IgQueueItem, type QuoteTag } from '../api';
import { TagChips } from '../components/TagChips';
import { SectionHeading } from '../components/SectionHeading';
import { FilterTabs } from '../components/FilterTabs';
import { solidButtonStyle, ghostButtonStyle, filledPillStyle } from '../lib/ui';
import { Voice } from './Voice';
import { MonthGrid } from '../components/MonthGrid';
import { Markdown } from '../lib/Markdown';
import { PageSkillLink } from '../components/PageSkillLink';
import { DatePickerPopover } from '../components/DatePickerPopover';
import { CarouselFrame } from '../components/CarouselViewer';

// Map approved bank kinds → IG queue tag values
const BANK_KIND_TO_TAG: Record<BankKind, QuoteTag> = {
  pov: 'pov',
  framework: 'value',
  story: 'connection',
  proof: 'authority',
};

const TAG_META: Record<QuoteTag, { label: string; color: string }> = {
  'pov': { label: 'POV', color: 'var(--sleep)' },
  'value': { label: 'Value', color: 'var(--recovery)' },
  'authority': { label: 'Proof', color: 'var(--strain)' },
  'connection': { label: 'Connection', color: 'var(--hrv)' },
};

const TAG_ORDER: QuoteTag[] = ['pov', 'value', 'authority', 'connection'];

const FALLBACK_TAG_META = { label: 'Quote', color: 'var(--muted)' };
function tagMeta(tag: string) {
  return TAG_META[tag as QuoteTag] ?? FALLBACK_TAG_META;
}



export function Instagram() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Stage filter for the pipeline lanes ('all' shows every lane). Posted always
  // shows at the bottom regardless - it's the archive, not part of the filter.
  const [laneFilter, setLaneFilter] = useState<string>('all');
  // CTA + target popups (edit the instagram CTA line + link / the weekly target).
  const [ctaOpen, setCtaOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const ctaSet = !!(settings?.instagram_cta_text ?? '').trim();
  const { data, isLoading } = useQuery({
    queryKey: ['ig-queue'],
    queryFn: api.igQueue,
  });
  const { data: output } = useQuery({
    queryKey: ['ig-output'],
    queryFn: api.igOutput,
  });

  const createIdea = useMutation({
    // New ideas land in "raw ideas" (unscripted). Creating one opens the panel
    // so you can script it, then move it to "ready to film".
    mutationFn: (title: string) => api.createIgIdea({ title, status: 'idea' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      if (res?.item?.id) setOpenId(res.item.id);
    },
  });

  const addFromBank = useMutation({
    mutationFn: (bi: BankItem) => api.createIgIdea({
      title: bi.title ?? undefined,
      text: bi.text,
      tag: BANK_KIND_TO_TAG[bi.kind],
      context: bi.context ?? undefined,
      timestamp: bi.source_timestamp ?? undefined,
      source_transcript_filename: bi.source_transcript ?? undefined,
      source_moments: bi.source_moments,
      kind: bi.title ? 'story' : 'quote',
      quote_id: bi.id,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  useEffect(() => {
    if (!openId && !pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openId, pickerOpen]);

  const items = data?.items ?? [];
  // Pipeline lanes, driven purely by status (the lane itself shows the phase):
  //   ready to film  = queued   (scripted, needs recording)
  //   ready to edit  = filmed   (recorded, needs editing)
  //   in-edit        = editing  (HIDDEN - the user checked it off ready-to-edit;
  //                              it reappears in ready-to-schedule when the
  //                              edited video file drops in the folder)
  //   ready to schedule = ready_to_schedule (edited file landed)
  const rawIdeas = items.filter((i) => i.status === 'idea');
  const readyToFilm = items.filter((i) => i.status === 'queued');
  const readyToEdit = items.filter((i) => i.status === 'filmed');
  const readyToSchedule = items.filter((i) => i.status === 'ready_to_schedule');
  const scheduled = items.filter((i) => i.status === 'scheduled');
  const posted = items.filter((i) => i.status === 'posted');
  const failed = items.filter((i) => i.status === 'failed');
  const openItem = items.find((i) => i.id === openId) ?? null;

  return (
    <>
      <style>{IG_CSS}</style>

      {/* Content output tracker - 4-month day grid. Visual mirror of the
          YearGrid card on the YouTube tab so both channels feel like the
          same surface: same padding/radius, "publishing months" eyebrow in
          strain blue + "your content output" h3, sync info on the right. */}
      {output && (() => {
        const totalPosts = output.months.reduce((acc, m) => acc + m.days.reduce((s, d) => s + d.count, 0), 0);
        const tLabel =
          output.target_per_week === 1 ? '1 per week'
          : output.target_per_week === 7 ? 'daily'
          : `${output.target_per_week} per week`;
        return (
          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
              <div>
                <span className="eyebrow">your content output</span>
                <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
                  {totalPosts} {totalPosts === 1 ? 'reel' : 'reels'} posted in the last 4 months
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setCtaOpen(true)}
                  title="set the call-to-action the caption generator points viewers to"
                  style={ctaSet ? filledPillStyle : ghostButtonStyle}
                >
                  {ctaSet ? 'CTA' : 'add CTA'}
                </button>
                <button
                  type="button"
                  onClick={() => setTargetOpen(true)}
                  title="set how many reels per week you want to publish"
                  style={output.target_set ? filledPillStyle : ghostButtonStyle}
                >
                  {output.target_set ? `target: ${tLabel}` : 'set daily target'}
                </button>
              </div>
            </div>
            <div className="card" style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-5)' }}>
              <MonthGrid months={output.months} targetPerWeek={output.target_per_week} showSummary={false} />
            </div>
          </div>
        );
      })()}

      <div className="ig-add-row" style={{ marginBottom: 0 }}>
        <IdeaInput onAdd={(title) => createIdea.mutate(title)} pending={createIdea.isPending} />
        <button
          type="button"
          className="ig-add-row__bank"
          onClick={() => setPickerOpen(true)}
          style={solidButtonStyle}
        >
          + add from bank
        </button>
      </div>

      {isLoading ? (
        <div className="empty">loading...</div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Stage filter. Posted is NOT a filter option - it always shows at
              the bottom as the archive. 'all' shows every pipeline lane. */}
          <FilterTabs
            value={laneFilter}
            onChange={setLaneFilter}
            ariaLabel="filter reels by stage"
            options={[
              { value: 'all', label: 'all', count: rawIdeas.length + readyToFilm.length + readyToEdit.length + readyToSchedule.length },
              { value: 'idea', label: 'ideas', count: rawIdeas.length },
              { value: 'queued', label: 'ready to film', count: readyToFilm.length },
              { value: 'filmed', label: 'ready to edit', count: readyToEdit.length },
              { value: 'ready_to_schedule', label: 'ready to schedule', count: readyToSchedule.length },
            ]}
          />

          {/* Action surface: reels the creator dropped from Descript that need her to
              pick a hook and approve. Highest-attention slot - lives above the
              queued lane so it's the first thing she sees on this page. */}
          {(laneFilter === 'all' || laneFilter === 'ready_to_schedule') && readyToSchedule.length > 0 && (
            <Lane
              label="ready to schedule"
              color="var(--strain)"
              items={readyToSchedule}
              onOpen={setOpenId}
              targetStatus="ready_to_schedule"
              scheduleMode
            />
          )}

          {/* Scheduled + failed: edge states, shown only in the full view. */}
          {laneFilter === 'all' && scheduled.length > 0 && <ScheduledStrip items={scheduled} />}
          {laneFilter === 'all' && failed.length > 0 && <FailedStrip items={failed} />}

          {/* ready to edit = filmed. Grouped by source video so all the clips
              from one recording sit under one card, each with its source
              moments in order. Check a clip off (edited) and it disappears;
              it returns under ready to schedule when the edited file drops. */}
          {readyToEdit.length > 0 && (laneFilter === 'all' || laneFilter === 'filmed') && <ReadyToEditLane items={readyToEdit} />}

          {/* ready to film = queued. Check it off once recorded and it moves
              into ready to edit. */}
          {readyToFilm.length > 0 && (laneFilter === 'all' || laneFilter === 'queued') && (
            <Lane
              label="ready to film"
              color="var(--ink)"
              items={readyToFilm}
              onOpen={setOpenId}
              empty="nothing to film yet. add an idea above, or head to vault and click 'queue to instagram' on a quote."
              targetStatus="queued"
              checkTo="filmed"
              checkLabel="filmed"
            />
          )}

          {/* Raw ideas: unscripted ideas you typed in. Open one to script it,
              then tick it off (or use the panel stage bar) to send it to
              "ready to film". Sits between ready-to-film and posted. */}
          {rawIdeas.length > 0 && (laneFilter === 'all' || laneFilter === 'idea') && (
            <Lane
              label="raw ideas"
              color="var(--hrv)"
              items={rawIdeas}
              onOpen={setOpenId}
              empty="no raw ideas yet. type one in the box above - it opens here so you can script it."
              targetStatus="idea"
              checkTo="queued"
              checkLabel="ready to film"
            />
          )}

          {/* Posted is a TABLE at the bottom, not a card lane (the archive).
              Always shown, regardless of the stage filter. */}
          <PostedTable items={posted} onOpen={setOpenId} />
        </>
      )}

      {/* Brainstorm moved to the top of the Content page as a global button.
          Original block kept here, hidden via display:none for one cycle in
          case I need to revert quickly. */}
      <section className="ig-fallback" style={{ display: 'none' }}>
        <header className="ig-fallback__head">
          <h3 className="ig-fallback__title">stuck for ideas? start here</h3>
          <p className="ig-fallback__sub">
            answer one of these prompts to find a story or a hook. use it as raw material for a reel.
          </p>
        </header>
        <details className="ig-fallback__details">
          <summary className="ig-fallback__summary">open the brainstorm prompts</summary>
          <div className="ig-fallback__body">
            <Voice embedded />
          </div>
        </details>
      </section>

      {openItem && <ReelPanel item={openItem} onClose={() => setOpenId(null)} />}
      {ctaOpen && <CtaPopup channel="instagram" onClose={() => setCtaOpen(false)} />}
      {targetOpen && <TargetPopup channel="instagram" current={output?.target_per_week ?? 3} onClose={() => setTargetOpen(false)} />}
      {pickerOpen && (
        <BankPicker
          existingQuoteIds={new Set(items.map((i) => i.quote_id).filter(Boolean) as string[])}
          onAdd={(bi) => addFromBank.mutate(bi)}
          onClose={() => setPickerOpen(false)}
          pending={addFromBank.isPending}
        />
      )}
    </>
  );
}

// Shared centered pop-up box (scrim + card). Used by the CTA and target popups.
function PopupBox({ title, sub, children, footer, onClose }: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-5)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: 'min(520px, 100%)',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <span className="eyebrow">{title}</span>
          {sub && <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>{sub}</div>}
        </div>
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>{footer}</div>
      </div>
    </div>
  );
}

const POPUP_LABEL = { fontSize: 'var(--body-xs)', fontWeight: 600, color: 'var(--muted)' } as const;
const POPUP_FIELD = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 'var(--body-sm)',
  padding: 'var(--space-2) var(--space-3)',
  outline: 'none',
} as const;

// Pop-up box to edit a channel's CTA line + link. Saves to settings
// (instagram_cta_* or youtube_cta_*) - the same fields the caption/description
// generators read. Opened by the "add CTA" button in the content-output box.
export function CtaPopup({ channel, onClose }: { channel: 'instagram' | 'youtube'; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const isIg = channel === 'instagram';
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (data && !loaded) {
      setText((isIg ? data.instagram_cta_text : data.youtube_cta_text) ?? '');
      setUrl((isIg ? data.instagram_cta_url : data.youtube_cta_url) ?? '');
      setLoaded(true);
    }
  }, [data, loaded, isIg]);
  const save = useMutation({
    mutationFn: () => api.updateSettings(isIg
      ? { instagram_cta_text: text.trim(), instagram_cta_url: url.trim() }
      : { youtube_cta_text: text.trim(), youtube_cta_url: url.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); onClose(); },
  });
  return (
    <PopupBox
      title={isIg ? 'instagram call to action' : 'youtube call to action'}
      sub={isIg
        ? 'the line and link the caption generator points viewers to.'
        : 'the line and link the description generator points viewers to.'}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn--ghost" onClick={onClose}>cancel</button>
        <button type="button" className="btn btn--primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'saving' : 'save'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={POPUP_LABEL}>CTA line</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isIg
            ? 'want my system for building a one-person business that fits your brain? link in bio.'
            : 'want my system for building a one-person business that fits your brain? join my free community.'}
          autoFocus
          rows={3}
          style={{ ...POPUP_FIELD, lineHeight: 1.5, resize: 'vertical' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={POPUP_LABEL}>link</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          style={POPUP_FIELD}
        />
      </div>
    </PopupBox>
  );
}

// Pop-up box to set the publishing target. Instagram = reels per week (7 = daily);
// YouTube = how often you publish (1 = every week). Same style as the CTA popup.
export function TargetPopup({ channel, current, onClose }: { channel: 'instagram' | 'youtube'; current: number; onClose: () => void }) {
  const qc = useQueryClient();
  const isIg = channel === 'instagram';
  const [n, setN] = useState(String(current || (isIg ? 3 : 1)));
  const num = parseFloat(n);
  const valid = Number.isFinite(num) && num > 0;
  const save = useMutation({
    mutationFn: () => (isIg
      ? api.setIgTarget(Math.round(num))
      : api.updateSettings({ youtube_target_per_weeks: Math.round(num) })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [isIg ? 'ig-output' : 'settings'] }); onClose(); },
  });
  return (
    <PopupBox
      title="publishing target"
      sub={isIg
        ? 'how many reels per week do you want to publish? (7 = daily)'
        : 'how often do you publish a video? (1 = every week, 2 = every 2 weeks)'}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn btn--ghost" onClick={onClose}>cancel</button>
        <button type="button" className="btn btn--primary" onClick={() => { if (valid) save.mutate(); }} disabled={!valid || save.isPending}>
          {save.isPending ? 'saving' : 'save'}
        </button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={POPUP_LABEL}>{isIg ? 'reels per week' : 'weeks between videos'}</label>
        <input
          type="number"
          min={1}
          max={14}
          value={n}
          onChange={(e) => setN(e.target.value)}
          autoFocus
          style={POPUP_FIELD}
        />
      </div>
    </PopupBox>
  );
}

function IdeaInput({ onAdd, pending }: { onAdd: (title: string) => void; pending: boolean }) {
  const [value, setValue] = useState('');
  function submit() {
    const t = value.trim();
    if (!t) return;
    onAdd(t);
    setValue('');
  }
  return (
    <div className="ig-idea-input">
      <input
        type="text"
        placeholder="add a reel idea..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="ig-idea-input__field"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        style={
          value.trim()
            ? { ...ghostButtonStyle, background: 'var(--accent)', color: 'var(--bg)', border: '1px solid var(--accent)' }
            : ghostButtonStyle
        }
      >
        {pending ? '...' : 'add idea'}
      </button>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="ig-stat">
      <span className="ig-stat__num" style={{ color }}>{value}</span>
      <span className="ig-stat__lbl">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ig-empty">
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.15rem' }}>
        no reels queued yet
      </h3>
      <p className="muted" style={{ fontSize: 'var(--body-sm)', maxWidth: '52ch' }}>
        go to <strong>vault</strong>, click any transcript, extract quotes, and hit{' '}
        <strong>queue to instagram</strong> on the stories and quotes you want to film.
        they'll show up here as filmable reels.
      </p>
      {/* Or pull clippable moments straight from an existing video transcript. */}
      <div style={{ marginTop: 'var(--space-4)', width: '100%', maxWidth: 520 }}>
        <PageSkillLink name="reel-scripter" />
      </div>
    </div>
  );
}

// Skills-style breakdown sub-line for a lane heading, e.g. "1 carousel · 8 reels".
function laneBreakdown(items: IgQueueItem[]): string | undefined {
  const carousels = items.filter((i) => i.format === 'carousel').length;
  const reels = items.length - carousels;
  const parts: string[] = [];
  if (carousels) parts.push(`${carousels} carousel${carousels === 1 ? '' : 's'}`);
  if (reels) parts.push(`${reels} reel${reels === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : undefined;
}

function Lane({
  label,
  color,
  items,
  onOpen,
  empty,
  targetStatus,
  checkTo,
  checkLabel,
  scheduleMode,
}: {
  label: string;
  color: string;
  items: IgQueueItem[];
  onOpen: (id: string) => void;
  empty?: string;
  // Status to assign to a card dropped onto this lane.
  targetStatus: IgItemStatus;
  // When set, each row shows a checkbox; ticking it advances the item to this
  // status (e.g. ready-to-film -> filmed, ready-to-edit -> editing), which
  // moves it out of this lane.
  checkTo?: IgItemStatus;
  checkLabel?: string;
  // When set, rows show a "schedule" button (date picker) instead of a stage advance.
  scheduleMode?: boolean;
}) {
  const qc = useQueryClient();
  const [hover, setHover] = useState(false);
  const move = useMutation({
    mutationFn: (id: string) => api.updateIgItem(id, { status: targetStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  return (
    <section
      className="ig-lane"
      onDragOver={(e) => {
        // preventDefault is REQUIRED to mark this element as a valid drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id && !items.some((x) => x.id === id)) {
          // Only fire if the card came from a different lane.
          move.mutate(id);
        }
      }}
      style={
        hover
          ? {
              outline: `2px dashed ${color}`,
              outlineOffset: -4,
              background: `color-mix(in srgb, ${color} 4%, transparent)`,
            }
          : undefined
      }
    >
      <SectionHeading label={label} count={items.length} color={color} sub={laneBreakdown(items)} />
      {items.length === 0 && empty ? (
        <p className="ig-lane__empty">{empty}</p>
      ) : items.length === 0 ? (
        <p className="ig-lane__empty">drop a reel here to mark it {targetStatus}.</p>
      ) : (
        <div className="ig-grid">
          {items.map((it) => (
            <ReelCard key={it.id} item={it} onClick={() => onOpen(it.id)} checkTo={checkTo} checkLabel={checkLabel} scheduleMode={scheduleMode} />
          ))}
        </div>
      )}
    </section>
  );
}

// Ready-to-edit lane, grouped by source video. Each source is one clean card
// (title like a YouTube video card). Clicking it OPENS a panel showing every
// clip to edit from that video, each with its edit plan + source moments.
// How a ready-to-edit reel got here. Explicit field if set; otherwise infer
// (seeds carry original_quote; clips don't).
function reelOrigin(it: IgQueueItem): 'clip' | 'film' {
  return it.reel_origin ?? (it.original_quote ? 'film' : 'clip');
}
function filmedDateKey(it: IgQueueItem): string {
  const ts = it.filmed_at ?? it.queued_at;
  return ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'undated';
}

function ReadyToEditLane({ items }: { items: IgQueueItem[] }) {
  const [open, setOpen] = useState<{ mode: 'clip' | 'film'; key: string } | null>(null);
  const { clipGroups, filmGroups } = useMemo(() => {
    const clips = new Map<string, IgQueueItem[]>();
    const films = new Map<string, IgQueueItem[]>();
    for (const it of items) {
      if (reelOrigin(it) === 'film') {
        const k = filmedDateKey(it);
        films.set(k, [...(films.get(k) ?? []), it]);
      } else {
        const k = it.source_transcript_filename || 'no source';
        clips.set(k, [...(clips.get(k) ?? []), it]);
      }
    }
    return { clipGroups: [...clips.entries()], filmGroups: [...films.entries()] };
  }, [items]);

  const openGroup = open
    ? (open.mode === 'clip' ? clipGroups : filmGroups).find(([k]) => k === open.key)
    : undefined;

  return (
    <section className="ig-lane">
      <SectionHeading label="ready to edit" count={items.length} color="var(--sleep)" sub={laneBreakdown(items)} />
      {items.length === 0 ? (
        <p className="ig-lane__empty">nothing to edit yet. check a reel off 'ready to film' once you've recorded it.</p>
      ) : (
        <div className="ig-grid">
          {clipGroups.map(([src, clips]) => (
            <EditGroupCard
              key={`c-${src}`}
              title={src.replace(/\.(md|txt)$/, '')}
              subtitle={`${clips.length} clip${clips.length > 1 ? 's' : ''} to edit from this video`}
              clips={clips}
              onOpen={() => setOpen({ mode: 'clip', key: src })}
            />
          ))}
          {filmGroups.map(([date, clips]) => (
            <EditGroupCard
              key={`f-${date}`}
              title={`filmed ${date}`}
              subtitle={`${clips.length} reel${clips.length > 1 ? 's' : ''} to edit`}
              clips={clips}
              onOpen={() => setOpen({ mode: 'film', key: date })}
            />
          ))}
        </div>
      )}
      {openGroup && (
        <GroupEditPanel
          mode={open!.mode}
          title={open!.mode === 'clip' ? openGroup[0].replace(/\.(md|txt)$/, '') : `filmed ${openGroup[0]}`}
          subtitle={open!.mode === 'clip'
            ? `${openGroup[1].length} clip${openGroup[1].length > 1 ? 's' : ''} to cut from this video`
            : `${openGroup[1].length} reel${openGroup[1].length > 1 ? 's' : ''} to edit`}
          clips={openGroup[1]}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

// One group as a clean card - title (like a YouTube video card), a count badge
// when there's more than one, and an "edited" button. Clicking opens the panel.
function EditGroupCard({ title, subtitle, clips, onOpen }: { title: string; subtitle: string; clips: IgQueueItem[]; onOpen: () => void }) {
  const qc = useQueryClient();
  const markEdited = useMutation({
    mutationFn: () => Promise.all(clips.map((c) => api.updateIgItem(c.id, { status: 'editing' }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  return (
    <div className="ig-card" onClick={onOpen} style={{ cursor: 'pointer' }}>
      {clips.length > 1 && <span className="ig-count-badge">{clips.length}</span>}
      <div className="ig-card__main">
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.02rem',
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>{subtitle}</span>
      </div>
      <button
        type="button"
        className="ig-card__action"
        onClick={(e) => { e.stopPropagation(); markEdited.mutate(); }}
        disabled={markEdited.isPending}
        style={{ flex: '0 0 auto' }}
        title="mark all edited - they move on to schedule when the files drop"
      >
        {markEdited.isPending ? '...' : 'edited'}
      </button>
    </div>
  );
}

// The opened edit panel for one group. Header mirrors the YouTube video detail
// (eyebrow + big title + close). Body lists every reel with its editable script.
// Clip groups show source moments; film groups show a "re-film" button instead.
function GroupEditPanel({ mode, title, subtitle, clips, onClose }: { mode: 'clip' | 'film'; title: string; subtitle: string; clips: IgQueueItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const markEdited = useMutation({
    mutationFn: () => Promise.all(clips.map((c) => api.updateIgItem(c.id, { status: 'editing' }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
      onClose();
    },
  });
  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside className="rep-panel" style={{ '--dim-c': 'var(--sleep)' } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow" style={{ color: 'var(--sleep)' }}>ready to edit</span>
            <h2 className="rep-panel__title">{title}</h2>
            <p className="rep-panel__def">{subtitle}</p>
          </div>
          <div className="rep-panel__head-r" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button type="button" className="rep-btn rep-btn--primary" onClick={() => markEdited.mutate()} disabled={markEdited.isPending}>
              {markEdited.isPending ? '...' : 'mark all edited'}
            </button>
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>close</button>
          </div>
        </header>

        {clips.map((clip, idx) => (
          <EditClipCard key={clip.id} clip={clip} index={idx} total={clips.length} mode={mode} />
        ))}
      </aside>
    </div>
  );
}

// One reel inside the edit panel. Tick box to mark it edited, the editable
// script, then either a source-moments dropdown (clip) or a "re-film" button
// (film - sends it back to ready to film).
function EditClipCard({ clip, index, total, mode }: { clip: IgQueueItem; index: number; total: number; mode: 'clip' | 'film' }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(clip.script ?? clip.text ?? '');
  useEffect(() => { setDraft(clip.script ?? clip.text ?? ''); }, [clip.script, clip.text]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [draft]);
  const save = useMutation({
    mutationFn: (s: string) => api.updateIgItem(clip.id, { script: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const markDone = useMutation({
    mutationFn: () => api.updateIgItem(clip.id, { status: 'editing' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  // Film mode: send this reel back to "ready to film" to re-record it.
  const refilm = useMutation({
    mutationFn: () => api.updateIgItem(clip.id, { status: 'queued' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  const moments = clip.source_moments ?? [];
  return (
    <section className="rep-section">
      <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} title="mark this clip edited">
            <input
              type="checkbox"
              checked={false}
              disabled={markDone.isPending}
              onChange={() => markDone.mutate()}
              style={{ width: 18, height: 18, accentColor: 'var(--recovery)', cursor: 'pointer' }}
            />
          </label>
          <h3 className="rep-section__title" style={{ margin: 0, flex: 1, minWidth: 0 }}>
            {total > 1 ? `${index + 1}. ` : ''}{clip.title || (clip.text || '').slice(0, 60)}
          </h3>
        </div>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== (clip.script ?? clip.text ?? '')) save.mutate(draft); }}
          style={{
            width: '100%',
            overflow: 'hidden',
            minHeight: 80,
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--ink)',
            padding: 'var(--space-3)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--body)',
            lineHeight: 1.6,
            resize: 'none',
            outline: 'none',
            whiteSpace: 'pre-wrap',
          }}
        />
        {mode === 'film' ? (
          <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px dashed var(--hairline)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => refilm.mutate()}
              disabled={refilm.isPending}
              title="send this reel back to ready to film to re-record it"
            >
              {refilm.isPending ? '...' : 're-film'}
            </button>
          </div>
        ) : (
          moments.length > 0 && (
            <details style={{ marginTop: 'var(--space-3)', borderTop: '1px dashed var(--hairline)', paddingTop: 'var(--space-3)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                source moments <span style={{ color: 'var(--muted-2)' }}>{moments.length}</span>
              </summary>
              <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {moments.map((m, i) => (
                  <div key={i} className="ig-moment">
                    <span className="ig-moment__ts">{m.timestamp}</span>
                    <span className="ig-moment__text">"{m.text}"</span>
                  </div>
                ))}
              </div>
            </details>
          )
        )}
      </div>
    </section>
  );
}

function ReelCard({ item, onClick, checkTo, checkLabel, scheduleMode }: { item: IgQueueItem; onClick: () => void; checkTo?: IgItemStatus; checkLabel?: string; scheduleMode?: boolean }) {
  const qc = useQueryClient();
  const meta = tagMeta(item.tag);
  const text = item.text ?? '';
  const title = item.title ?? (text.length > 80 ? text.slice(0, 80) + '…' : text);
  const preview = text.length > 240 ? text.slice(0, 240) + '…' : text;
  const [tagOpen, setTagOpen] = useState(false);
  const tagMutation = useMutation({
    mutationFn: (t: QuoteTag) => api.updateIgItem(item.id, { tag: t }),
    onMutate: async (t: QuoteTag) => {
      // Optimistic patch so the card border + chip color flip immediately.
      // Without this, the user clicks a tag and nothing visible happens until
      // the next refetch lands - which feels like a broken click.
      await qc.cancelQueries({ queryKey: ['ig-queue'] });
      const prev = qc.getQueryData<{ items: IgQueueItem[]; counts: any }>(['ig-queue']);
      if (prev) {
        qc.setQueryData(['ig-queue'], {
          ...prev,
          items: prev.items.map((x) => (x.id === item.id ? { ...x, tag: t } : x)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ig-queue'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  // Mark posted (the dark button on the ready-to-schedule lane).
  const markPosted = useMutation({
    mutationFn: () => api.updateIgItem(item.id, { status: 'posted', posted_at: Math.floor(Date.now() / 1000) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  // Advance this reel to the next stage (filmed / editing), which moves it out
  // of this lane.
  const advance = useMutation({
    mutationFn: () => api.updateIgItem(item.id, { status: checkTo as IgItemStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });

  useEffect(() => {
    if (!tagOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`.ig-card__tag-wrap[data-id="${item.id}"]`)) setTagOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTagOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [tagOpen, item.id]);

  return (
    <article
      className="ig-card"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{ borderColor: `color-mix(in srgb, ${meta.color} 22%, var(--hairline))`, cursor: 'grab' }}
    >
      {/* Left: colored tag tile - communicates the tag, click to change it. */}
      <div className="ig-card__tagbox ig-card__tag-wrap" data-id={item.id} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="ig-card__tagtile"
          style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 28%, transparent)` }}
          onClick={() => setTagOpen((v) => !v)}
          title={`tag: ${meta.label} (click to change)`}
        >
          <TagIcon tag={item.tag} />
        </button>
        {tagOpen && (
          <div className="ig-card__tag-pop" role="menu">
            {TAG_ORDER.map((t) => {
              const m = TAG_META[t];
              const active = item.tag === t;
              return (
                <button
                  key={t}
                  type="button"
                  className={`ig-card__tag-opt${active ? ' is-active' : ''}`}
                  style={{
                    color: active ? 'var(--bg)' : m.color,
                    background: active ? m.color : `color-mix(in srgb, ${m.color} 10%, transparent)`,
                    borderColor: `color-mix(in srgb, ${m.color} 28%, transparent)`,
                  }}
                  onClick={() => { tagMutation.mutate(t); setTagOpen(false); }}
                  disabled={tagMutation.isPending}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Middle: title + one-line preview + source. The carousel badge sits
          inline at the end of the title so the card stays the same height as
          the reel cards. */}
      <div className="ig-card__main">
        <h3 className="ig-card__title">
          {title}
          {item.format === 'carousel' && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginLeft: 8,
                verticalAlign: 'middle',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                borderRadius: 'var(--radius-pill)',
                padding: '1px 7px',
                whiteSpace: 'nowrap',
              }}
            >
              ▦ carousel
            </span>
          )}
        </h3>
        <p className="ig-card__preview">{preview}</p>
        {item.source_transcript_filename && (
          <p className="ig-card__src">
            source: {item.source_transcript_filename.replace(/\.(md|txt)$/, '')}
            {item.source_moments && item.source_moments.length > 0 && ` · ${item.source_moments.length} moments`}
          </p>
        )}
      </div>

      {/* Right: matches the skills card - a schedule pill (showing the date) +
          a dark action button (filmed / edited / posted). */}
      {scheduleMode ? (
        <div className="ig-card__action-wrap" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <SchedulePill item={item} />
          <button
            type="button"
            className="ig-card__action"
            onClick={(e) => { e.stopPropagation(); markPosted.mutate(); }}
            disabled={markPosted.isPending}
          >
            {markPosted.isPending ? '...' : 'posted'}
          </button>
        </div>
      ) : checkTo ? (
        <button
          type="button"
          className="ig-card__action"
          onClick={(e) => { e.stopPropagation(); advance.mutate(); }}
          disabled={advance.isPending}
        >
          {advance.isPending ? '...' : (checkLabel ?? 'mark done')}
        </button>
      ) : null}
    </article>
  );
}

// Ghost pill styles - identical to the skills-card schedule button.
const SCHED_PILL = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flex: '0 0 auto',
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--hairline)',
  whiteSpace: 'nowrap',
} as const;
const SCHED_PILL_ACTIVE = {
  ...SCHED_PILL,
  color: 'var(--ink)',
  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--hairline))',
} as const;

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// A glyph per tag so the colored tile communicates the tag without a text label.
function TagIcon({ tag }: { tag: string }) {
  const p = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (tag) {
    case 'value': // star
      return <svg {...p}><path d="M12 3l2.6 5.7 6.1.6-4.6 4.1 1.3 6L12 16.8 6.6 19.5l1.3-6L3.3 9.3l6.1-.6z" /></svg>;
    case 'connection': // two people linked
      return <svg {...p}><circle cx="8" cy="10" r="3" /><circle cx="16" cy="10" r="3" /><path d="M3 19c0-2.2 2.2-4 5-4M21 19c0-2.2-2.2-4-5-4" /></svg>;
    case 'pov': // eye
      return <svg {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    case 'authority': // proof - check badge
      return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12l2.5 2.5L16 9" /></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="4" /></svg>;
  }
}

// The schedule pill on the ready-to-schedule lane: a ghost pill that shows the
// scheduled date once set (else "schedule"). Opening it auto-suggests the next
// free slot; the date is editable. Sets scheduled_for only (status unchanged).
function SchedulePill({ item }: { item: IgQueueItem }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<Date | null>(null);
  const save = useMutation({
    mutationFn: (d: Date) => api.updateIgItem(item.id, { scheduled_for: Math.floor(d.getTime() / 1000) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      setOpen(false);
    },
  });
  async function openPicker() {
    let d = item.scheduled_for ? new Date(item.scheduled_for * 1000) : new Date();
    if (!item.scheduled_for) {
      try { const s = await api.igNextFreeSlot(); if (s?.scheduled_for) d = new Date(s.scheduled_for * 1000); } catch {}
    }
    setSlot(d);
    setOpen(true);
  }
  const label = item.scheduled_for
    ? new Date(item.scheduled_for * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'schedule';
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" style={item.scheduled_for ? SCHED_PILL_ACTIVE : SCHED_PILL} onClick={openPicker} disabled={save.isPending}>
        <ClockIcon /> {save.isPending ? '...' : label}
      </button>
      {open && slot && (
        <DatePickerPopover
          selected={slot}
          onPick={(d) => save.mutate(d)}
          onClose={() => setOpen(false)}
          align="right"
        />
      )}
    </div>
  );
}

// ─── Posted table - mirrors PublishedRow on the YouTube tab ────────────────
// Drop a queued/filmed card on this header to mark it posted (defaults today).
// Click a row to open the panel and edit caption / metrics / posted_url.

function formatIgStat(n?: number | null): string {
  if (n == null) return '-';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PostedTable({ items, onOpen }: { items: IgQueueItem[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [hover, setHover] = useState(false);
  const drop = useMutation({
    mutationFn: (id: string) => {
      const now = Math.floor(Date.now() / 1000);
      return api.updateIgItem(id, { status: 'posted', posted_at: now });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  const sorted = [...items].sort((a, b) => (b.posted_at ?? 0) - (a.posted_at ?? 0));
  // Heading color = white (per the creator). Border still uses an accent to keep
  // the drop-target hint visible.
  const PINK = 'var(--ink)';
  const ACCENT = '#E6A52F';
  return (
    <section
      className="ig-posted"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id && !items.some((x) => x.id === id)) drop.mutate(id);
      }}
      style={{
        // Extra top gap so the posted archive reads as clearly separate from
        // the active lanes above it.
        marginTop: 'var(--space-7)',
        outline: hover ? `2px dashed ${ACCENT}` : 'none',
        outlineOffset: -4,
        borderRadius: 'var(--radius-lg)',
        padding: hover ? 'var(--space-3)' : 0,
        transition: 'padding 0.12s',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <SectionHeading label="posted" count={items.length} color={PINK} sub={laneBreakdown(items)} />
      {items.length === 0 ? (
        <p className="ig-lane__empty">drop a reel here to mark it posted (date stamps as today).</p>
      ) : (
        <div className="stack">
          {sorted.map((it) => (
            <PostedRow key={it.id} item={it} onClick={() => onOpen(it.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function PostedRow({ item, onClick }: { item: IgQueueItem; onClick: () => void }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'view_count' | 'share_count' | 'comment_count'>>) =>
      api.updateIgItem(item.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const dateLabel = item.posted_at
    ? new Date(item.posted_at * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '-';
  const title = item.title ?? (item.text?.length > 80 ? item.text.slice(0, 80) + '…' : item.text);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
        cursor: 'grab',
      }}
    >
      <div
        className="stack"
        style={{ gap: 2, flex: 1, minWidth: 0, cursor: 'pointer' }}
        onClick={onClick}
      >
        <span style={{ wordBreak: 'break-word' }}>{title}</span>
        <span
          className="muted"
          style={{ fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums' }}
        >
          {dateLabel}
          {item.posted_url && (
            <>
              {' · '}
              <a
                href={item.posted_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                open on instagram
              </a>
            </>
          )}
        </span>
      </div>
      <div
        style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <EditableStatCol
          label="views"
          value={item.view_count}
          onSave={(n) => update.mutate({ view_count: n })}
        />
        <EditableStatCol
          label="shares"
          value={item.share_count}
          onSave={(n) => update.mutate({ share_count: n })}
        />
        <EditableStatCol
          label="comments"
          value={item.comment_count}
          onSave={(n) => update.mutate({ comment_count: n })}
        />
      </div>
    </div>
  );
}

function EditableStatCol({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null | undefined;
  onSave: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  function startEdit() {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  }
  function commit() {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n >= 0) onSave(Math.floor(n));
    setEditing(false);
  }
  return (
    <div style={{ textAlign: 'right', minWidth: 64 }}>
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 64,
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            borderRadius: 4,
            color: 'var(--ink)',
            padding: '2px 6px',
            fontSize: '1rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title={`click to edit ${label}`}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.0625rem',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ink)',
            opacity: 0.85,
          }}
        >
          {formatIgStat(value)}
        </button>
      )}
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--muted-2)',
          fontWeight: 400,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// Break a one-block script into sentence beats (blank line between each) so it's
// easy to film and read the story. Scripts that already have blank-line beats
// are left as-is.
function toScriptBeats(s: string): string {
  const t = (s || '').replace(/\r\n/g, '\n').trim();
  if (/\n\s*\n/.test(t)) return t;
  return t.replace(/([.!?])\s+(?=["'A-Z])/g, '$1\n\n');
}

// ─── Side panel for a reel (script + edit plan + actions) ──────────────────

function ReelPanel({ item, onClose }: { item: IgQueueItem; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = tagMeta(item.tag);
  const moments = item.source_moments ?? [];

  // Source moments listed by timestamp - identical block reused inside both the
  // edit-plan and seed-idea boxes so they look the same.
  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'status' | 'posted_url' | 'text' | 'tag' | 'title' | 'posted_at' | 'view_count' | 'share_count' | 'comment_count' | 'script' | 'original_quote' | 'edit_plan' | 'topics'>>) => api.updateIgItem(item.id, body),
    onMutate: async (body) => {
      // Optimistic patch into the ig-queue cache so the panel doesn't flash
      // back to the old value while the network round-trip is in flight.
      // Critical for the title editor: when blur fires from a click-outside,
      // the panel may unmount before the refetch lands, and re-opening would
      // otherwise show the stale title for a beat.
      await qc.cancelQueries({ queryKey: ['ig-queue'] });
      const prev = qc.getQueryData<{ items: IgQueueItem[]; counts: any }>(['ig-queue']);
      if (prev) {
        qc.setQueryData(['ig-queue'], {
          ...prev,
          items: prev.items.map((x) => (x.id === item.id ? { ...x, ...body } : x)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ig-queue'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteIgItem(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      onClose();
    },
  });

  function copyScript() {
    const lines = [item.title ?? 'Reel script', '', item.text];
    navigator.clipboard.writeText(lines.join('\n'));
  }

  function copyDescriptPlan() {
    const lines: string[] = [];
    lines.push(`# ${item.title ?? 'Reel from ' + (item.source_transcript_filename ?? 'transcript')}`);
    lines.push('');
    lines.push('## What the reel says (final cut)');
    lines.push('');
    lines.push(item.text);
    lines.push('');
    if (moments.length > 0 && item.source_transcript_filename) {
      lines.push('## Find these clips in Descript (in this order)');
      lines.push('');
      lines.push(`Source: ${item.source_transcript_filename}`);
      lines.push('');
      moments.forEach((m, i) => {
        lines.push(`${i + 1}. [${m.timestamp}] Search Descript for: "${m.text.split(/\s+/).slice(0, 8).join(' ')}…"`);
        lines.push(`   Verbatim: "${m.text}"`);
        lines.push('');
      });
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }

  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  // The single editable script. Stored in `script`; falls back to `text` for
  // older items that predate the field.
  const scriptValue = item.script ?? item.text ?? '';
  // A fresh raw idea (no script written yet) opens straight into edit mode so
  // you can just start typing the script.
  const [scriptEditing, setScriptEditing] = useState(item.status === 'idea' && !(item.script ?? '').trim());
  const [scriptDraft, setScriptDraft] = useState(scriptValue);
  useEffect(() => {
    if (!scriptEditing) setScriptDraft(scriptValue);
  }, [scriptValue, scriptEditing]);

  function appendFromBank(bi: BankItem) {
    // Insert a personal story / bank entry into the script. Adds a divider
    // for readability, prefixes with the bank entry's title (if any) so the creator
    // can see what she added at a glance.
    const sep = scriptValue.trim().length > 0 ? '\n\n---\n\n' : '';
    const titlePart = bi.title ? `**${bi.title}**\n\n` : '';
    const next = `${scriptValue}${sep}${titlePart}${bi.text}`;
    update.mutate({ script: next });
    setBankPickerOpen(false);
  }

  function setStatus(s: IgItemStatus) {
    if (s === 'posted') {
      // Don't immediately commit posted - open the calendar so the user can
      // pick a date. Clicking a day commits with that posted_at.
      setPanelPickerOpen(true);
      return;
    }
    update.mutate({ status: s });
  }
  function commitPostedWithDate(d: Date) {
    const ts = Math.floor(d.getTime() / 1000);
    update.mutate({ status: 'posted', posted_at: ts });
    setPanelPickerOpen(false);
  }

  // In the raw-idea + ready-to-film stages the script shows open (no toggle) so
  // you can write/read it; later stages collapse it into a toggle.
  const scriptOpen = item.status === 'idea' || item.status === 'queued';
  const scriptBody = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        <p className="rep-section__sub" style={{ margin: 0 }}>what you'll say. weave in a personal story to anchor it.</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setBankPickerOpen(true)} title="insert a personal story or framework from your bank">
            + add from bank
          </button>
          {!scriptEditing && (
            <button type="button" className="rep-btn rep-btn--ghost" onClick={() => setScriptEditing(true)} title="edit the script inline">
              edit
            </button>
          )}
        </div>
      </div>
      <div className="rep-card rep-card--inline">
        {scriptEditing ? (
          <>
            <textarea
              value={scriptDraft}
              onChange={(e) => setScriptDraft(e.target.value)}
              rows={Math.max(8, scriptDraft.split('\n').length + 1)}
              className="rep-text-input"
              style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--body)', lineHeight: 1.55 }}
              autoFocus
            />
            <div className="rep-actions">
              <button
                type="button"
                className="rep-btn rep-btn--primary"
                onClick={() => { update.mutate({ script: scriptDraft }); setScriptEditing(false); }}
                disabled={update.isPending}
              >
                {update.isPending ? 'saving' : 'save'}
              </button>
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => { setScriptDraft(scriptValue); setScriptEditing(false); }}
              >
                cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ig-script" style={{ whiteSpace: 'pre-wrap' }}>{toScriptBeats(scriptValue)}</p>
            <div className="rep-actions">
              <button type="button" className="rep-btn rep-btn--ghost" onClick={copyScript}>copy script</button>
              {moments.length > 0 && (
                <button type="button" className="rep-btn rep-btn--primary" onClick={copyDescriptPlan}>
                  copy descript edit plan
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
  const sourceMomentsBlock = moments.length > 0 ? (
    <section className="rep-section">
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          source moments <span style={{ color: 'var(--muted-2)' }}>{moments.length}</span>
        </summary>
        <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          {moments.map((m, i) => (
            <div key={i} className="ig-moment">
              <span className="ig-moment__ts">{m.timestamp}</span>
              <span className="ig-moment__text">"{m.text}"</span>
            </div>
          ))}
        </div>
      </details>
    </section>
  ) : item.original_quote ? (
    <section className="rep-section">
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
          source moments
        </summary>
        <p style={{ marginTop: 'var(--space-2)', color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.55 }}>"{item.original_quote}"</p>
      </details>
    </section>
  ) : null;

  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside className="rep-panel" style={{ '--dim-c': meta.color } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        {/* Header mirrors the YouTube video detail: eyebrow (left) + stage
            segmented control (center) + close (right). */}
        <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--hairline)' }}>
          <span className="rep-eyebrow" style={{ justifySelf: 'start', color: meta.color }}>reel</span>
          <div style={{ display: 'inline-flex', justifySelf: 'center', gap: 2, padding: 2, background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)' }} title="move this reel through the pipeline">
            {([
              { status: 'idea', label: 'idea' },
              { status: 'queued', label: 'to film' },
              { status: 'filmed', label: 'to edit' },
              { status: 'ready_to_schedule', label: 'to schedule' },
              { status: 'posted', label: 'posted' },
            ] as { status: IgItemStatus; label: string }[]).map((s) => {
              const active = item.status === s.status;
              return (
                <button
                  key={s.status}
                  type="button"
                  onClick={() => setStatus(s.status)}
                  disabled={update.isPending}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: active ? 'var(--recovery)' : 'transparent',
                    color: active ? '#06281b' : 'var(--muted)',
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
          <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose} style={{ justifySelf: 'end' }}>close</button>
        </header>

        {/* Title + tag + source, below the stage bar (like the video detail). */}
        <div className="rep-section" style={{ position: 'relative' }}>
          <TitleEditor value={item.title ?? ''} onSave={(v) => update.mutate({ title: v })} placeholder="untitled reel" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            <select
              value={item.tag}
              onChange={(e) => update.mutate({ tag: e.target.value as QuoteTag })}
              disabled={update.isPending}
              title="what kind of moment this is"
              style={{
                color: meta.color,
                fontWeight: 600,
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid color-mix(in srgb, ${meta.color} 40%, var(--hairline))`,
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'var(--body-sm)',
              }}
            >
              {TAG_ORDER.map((t) => (
                <option key={t} value={t}>{TAG_META[t].label}</option>
              ))}
            </select>
            <TagChips
              inline
              topics={item.topics ?? []}
              onChange={(next) => update.mutate({ topics: next })}
              color={meta.color}
            />
            {item.source_transcript_filename && (
              <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>from {item.source_transcript_filename.replace(/\.(md|txt)$/, '')}</span>
            )}
          </div>
          {panelPickerOpen && (
            <DatePickerPopover selected={item.posted_at ? new Date(item.posted_at * 1000) : new Date()} onPick={commitPostedWithDate} onClose={() => setPanelPickerOpen(false)} align="left" />
          )}
        </div>

        {/* Clip-as-is: the editing brief. */}
        {item.edit_plan && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">edit plan</h3>
              <p className="rep-section__sub">how to cut the footage you already shot.</p>
            </header>
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                lineHeight: 1.6,
              }}
            >
              <Markdown text={item.edit_plan} />
            </div>
          </section>
        )}

        {/* Render at the top - the carousel preview or the reel video - so it
            is the first thing you see, no scrolling. */}
        {item.format === 'carousel' && item.carousel_path && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">carousel</h3>
            </header>
            <CarouselFrame path={item.carousel_path} title={item.title} height={520} />
          </section>
        )}
        {item.format !== 'carousel' && item.video_path && <ReelProductionSection item={item} />}

        {item.context && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">context</h3>
            </header>
            <p className="rep-section__sub" style={{ fontStyle: 'italic' }}>{item.context}</p>
          </section>
        )}

        {/* Script - open (no toggle) for raw ideas + ready-to-film so you can
            write/read it; a toggle in later stages. Source moments sit in a
            toggle directly under it. */}
        <section className="rep-section">
          {scriptOpen ? (
            <>
              <header className="rep-section__head">
                <h3 className="rep-section__title">{item.format === 'carousel' ? 'carousel script' : 'reel script'}</h3>
              </header>
              {scriptBody}
            </>
          ) : (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                {item.format === 'carousel' ? 'carousel script' : 'reel script'}
              </summary>
              <div style={{ marginTop: 'var(--space-3)' }}>
                {scriptBody}
              </div>
            </details>
          )}
        </section>

        {sourceMomentsBlock}

        {/* Instagram caption - not on ready-to-film cards (nothing to caption
            until it's been filmed); shown from the edit stage onward. */}
        {item.status !== 'queued' && item.status !== 'idea' && <CaptionSection item={item} />}

        {/* Posted URL */}
        {item.status === 'posted' && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">posted url</h3>
            </header>
            <input
              type="url"
              className="rep-text-input"
              defaultValue={item.posted_url ?? ''}
              placeholder="https://instagram.com/p/..."
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (item.posted_url ?? '')) update.mutate({ posted_url: v });
              }}
            />
          </section>
        )}

        {/* Bottom row: dismiss on the left, remove on the right. */}
        <section className="rep-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => setStatus('dismissed')}
              disabled={update.isPending}
              style={{ color: 'var(--muted-2)' }}
            >
              {item.status === 'dismissed' ? 'dismissed' : 'dismiss'}
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              style={{ marginLeft: 'auto', color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.3)' }}
              onClick={() => { if (confirm('Remove this reel from the queue entirely?')) remove.mutate(); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? '...' : 'remove from queue'}
            </button>
          </div>
        </section>
      </aside>
      {bankPickerOpen && (
        <BankPicker
          existingQuoteIds={new Set()}
          onAdd={appendFromBank}
          onClose={() => setBankPickerOpen(false)}
          pending={update.isPending}
        />
      )}
    </div>
  );
}

// ─── Caption section: auto-generated IG caption + 5 hashtags ───────────────

function CaptionSection({ item }: { item: IgQueueItem }) {
  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: () => api.generateIgCaption(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'caption' | 'caption_hashtags'>>) => api.updateIgItem(item.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const [draft, setDraft] = useState<string>(item.caption ?? '');
  const [tagsDraft, setTagsDraft] = useState<string>((item.caption_hashtags ?? []).join(' '));
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(item.caption ?? ''); }, [item.caption]);
  useEffect(() => { setTagsDraft((item.caption_hashtags ?? []).join(' ')); }, [item.caption_hashtags]);

  const full = [draft.trim(), tagsDraft.trim()].filter(Boolean).join('\n\n');
  const has = !!(item.caption && item.caption.trim());

  function copy() {
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function saveCaption() {
    const v = draft.trim();
    if (v === (item.caption ?? '').trim()) return;
    update.mutate({ caption: v });
  }
  function saveTags() {
    const next = tagsDraft.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    const prev = item.caption_hashtags ?? [];
    if (next.join(' ') === prev.join(' ')) return;
    update.mutate({ caption_hashtags: next });
  }

  return (
    <section className="rep-section">
      <header className="rep-section__head">
        <h3 className="rep-section__title">instagram caption</h3>
        <p className="rep-section__sub">
          one sharp sentence + your CTA + hashtags. paste straight into instagram.
        </p>
      </header>

      {!has && !generate.isPending && (
        <div className="rep-card rep-card--inline">
          <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', lineHeight: 1.55 }}>
            no caption yet. click generate to draft one based on this reel's title, context, and your voice.
          </p>
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => generate.mutate()}
            >
              generate caption
            </button>
          </div>
        </div>
      )}

      {generate.isPending && (
        <div className="rep-card rep-card--inline">
          <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
            drafting caption in your voice… this calls claude and can take 20-40 seconds.
          </p>
        </div>
      )}

      {has && (
        <div className="rep-card rep-card--inline">
          <textarea
            className="rep-text-input ig-caption-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveCaption}
            rows={Math.min(14, Math.max(6, draft.split('\n').length + 1))}
          />
          <input
            type="text"
            className="rep-text-input ig-caption-tags"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={saveTags}
            placeholder="#tag1 #tag2 #tag3 #tag4 #tag5"
          />
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'regenerating…' : 'regenerate'}
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={copy}
            >
              {copied ? 'copied ✓' : 'copy for instagram'}
            </button>
          </div>
        </div>
      )}

      {generate.isError && (
        <p className="muted" style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)' }}>
          {(generate.error as Error).message}
        </p>
      )}
    </section>
  );
}

// ─── Inline title editor used in ReelPanel header ──────────────────────────

function TitleEditor({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  // Debounced auto-save - 600ms after last keystroke. Catches the case where
  // the user closes the panel before blur fires (clicking outside / X button).
  useEffect(() => {
    const next = draft.trim();
    if (next === value.trim()) return;
    const t = setTimeout(() => onSave(next), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, value]);

  function commit(latest: string) {
    const next = latest.trim();
    if (next === value.trim()) return;
    onSave(next);
  }
  return (
    <input
      type="text"
      className="rep-panel__title rep-panel__title--edit"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

// ─── Bank picker (search approved quotes & stories, add to queue) ──────────

export function BankPicker({
  existingQuoteIds,
  onAdd,
  onClose,
  pending,
}: {
  existingQuoteIds: Set<string>;
  onAdd: (bi: BankItem) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['banks'],
    queryFn: api.listBanks,
  });
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'story' | 'quote'>('all');
  const [tagFilter, setTagFilter] = useState<'all' | BankKind>('all');
  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kindFilter === 'story' && !i.title) return false;
      if (kindFilter === 'quote' && i.title) return false;
      if (tagFilter !== 'all' && i.kind !== tagFilter) return false;
      if (!q) return true;
      const hay = `${i.title ?? ''} ${i.text} ${i.context ?? ''} ${(i.topics ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, kindFilter, tagFilter]);

  const KIND_PILLS: Array<{ key: 'all' | 'story' | 'quote'; label: string }> = [
    { key: 'all', label: 'all' },
    { key: 'story', label: 'stories' },
    { key: 'quote', label: 'quotes' },
  ];
  const TAG_PILLS: Array<{ key: 'all' | BankKind; label: string }> = [
    { key: 'all', label: 'all tags' },
    { key: 'pov', label: 'POV' },
    { key: 'framework', label: 'Value' },
    { key: 'proof', label: 'Proof' },
    { key: 'story', label: 'Connection' },
  ];

  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside className="rep-panel ig-picker" onClick={(e) => e.stopPropagation()}>
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow">add from bank</span>
            <h2 className="rep-panel__title">search your stories &amp; quotes</h2>
            <p className="rep-panel__def">approved moments from your transcripts. click to add as a reel.</p>
          </div>
          <div className="rep-panel__head-r">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>done</button>
          </div>
        </header>

        <div className="ig-picker__controls">
          <input
            type="text"
            className="rep-text-input"
            placeholder="search by text, title, context, topic…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="ig-picker__pills">
            {KIND_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`ig-pill ${kindFilter === p.key ? 'ig-pill--on' : ''}`}
                onClick={() => setKindFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ig-picker__pills">
            {TAG_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`ig-pill ${tagFilter === p.key ? 'ig-pill--on' : ''}`}
                onClick={() => setTagFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ig-picker__list">
          {isLoading && <p className="muted">loading bank…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="muted">no matches. approve quotes from a transcript first (vault → transcript → approve).</p>
          )}
          {filtered.map((bi) => {
            const tag = BANK_KIND_TO_TAG[bi.kind];
            const m = TAG_META[tag];
            const already = existingQuoteIds.has(bi.id);
            const isStory = !!bi.title;
            const preview = bi.text.length > 220 ? bi.text.slice(0, 220) + '…' : bi.text;
            return (
              <article
                key={bi.id}
                className="ig-pick-card"
                style={{ borderColor: `color-mix(in srgb, ${m.color} 22%, var(--hairline))` }}
              >
                <div className="ig-pick-card__head">
                  <span
                    className="ig-card__tag"
                    style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 10%, transparent)` }}
                  >
                    {m.label}
                  </span>
                  <span className="ig-pick-card__kind">{isStory ? 'story' : 'quote'}</span>
                  <button
                    type="button"
                    className="rep-btn rep-btn--primary ig-pick-card__add"
                    style={{ ['--dim-c' as any]: m.color }}
                    onClick={() => onAdd(bi)}
                    disabled={pending || already}
                  >
                    {already ? 'in queue' : pending ? '…' : '+ add'}
                  </button>
                </div>
                {bi.title && <h4 className="ig-pick-card__title">{bi.title}</h4>}
                <p className="ig-pick-card__text">{preview}</p>
                {bi.source_transcript && (
                  <p className="ig-pick-card__src">
                    source: {bi.source_transcript.replace(/\.(md|txt)$/, '')}
                    {bi.source_timestamp && ` · ${bi.source_timestamp}`}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

// ─── Reel production (lives inside ReelPanel for items with video_path) ────
// Renders the video preview with a draggable hook overlay, 3 editable hook
// variants (click to pick, double-click to edit), and the copy + mark buttons.
// Shown only when the item has been dropped through the dropbox.
function ReelProductionSection({ item }: { item: IgQueueItem }) {
  const qc = useQueryClient();

  const saveHook = useMutation({
    mutationFn: (v: string) => api.updateIgItem(item.id, { chosen_hook: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  // "The hook" - the one that ends up on the reel. the creator's free to write
  // whatever she wants here. The 3 generated ideas below are inspiration only.
  const [hookDraft, setHookDraft] = useState<string>(item.chosen_hook ?? '');
  useEffect(() => {
    setHookDraft(item.chosen_hook ?? '');
  }, [item.chosen_hook]);

  // Debounced auto-save - 600ms after last keystroke. Catches the close-before-blur
  // case where clicking X / backdrop unmounts before the blur handler fires.
  useEffect(() => {
    const next = hookDraft.trim();
    const current = (item.chosen_hook ?? '').trim();
    if (next === current) return;
    const t = setTimeout(() => {
      saveHook.mutate(next);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookDraft, item.chosen_hook]);

  // Hook overlay position on the video preview (% of frame, center coords).
  // Persisted per item so the bake-to-video render uses the same coords she
  // dragged the preview to. Mutates on drag-end via savePos.
  const [hookPos, setHookPos] = useState<{ x: number; y: number }>({
    x: typeof item.hook_pos_x === 'number' ? item.hook_pos_x : 50,
    y: typeof item.hook_pos_y === 'number' ? item.hook_pos_y : 50,
  });
  useEffect(() => {
    setHookPos({
      x: typeof item.hook_pos_x === 'number' ? item.hook_pos_x : 50,
      y: typeof item.hook_pos_y === 'number' ? item.hook_pos_y : 50,
    });
  }, [item.hook_pos_x, item.hook_pos_y]);
  const savePos = useMutation({
    mutationFn: (v: { x: number; y: number }) =>
      api.updateIgItem(item.id, { hook_pos_x: v.x, hook_pos_y: v.y }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  // Bake the hook + position onto the video via ffmpeg. After success the
  // dashboard auto-swaps to the titled preview.
  const renderTitle = useMutation({
    mutationFn: () => api.renderReelTitle(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const [showTitled, setShowTitled] = useState(true);

  const [copyMsg, setCopyMsg] = useState<string>('');

  async function copyHook() {
    if (!hookDraft) return;
    try {
      await navigator.clipboard.writeText(hookDraft);
      setCopyMsg('copied');
      setTimeout(() => setCopyMsg(''), 1500);
    } catch {
      setCopyMsg('copy failed');
    }
  }

  function startDrag(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const wrap = (e.currentTarget.parentElement as HTMLDivElement | null);
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let last = hookPos;
    const onMove = (ev: MouseEvent) => {
      // Only treat as a real drag after the cursor has moved >5px in either
      // axis. Without this, a stray click on the overlay snaps it to where
      // the cursor landed and saves that position. Tiny accidental drags
      // were quietly resetting the saved position.
      if (!moved && Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) {
        return;
      }
      moved = true;
      const x = Math.max(5, Math.min(95, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((ev.clientY - rect.top) / rect.height) * 100));
      last = { x, y };
      setHookPos(last);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Only persist if the user actually dragged. A click-without-drag is a
      // no-op and leaves the prior saved position intact.
      if (moved) savePos.mutate(last);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  const regenHooks = useMutation({
    mutationFn: () => api.generateIgHooks(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  function commitHook() {
    const v = hookDraft.trim();
    if (v === (item.chosen_hook ?? '').trim()) return;
    saveHook.mutate(v);
  }

  function useIdea(text: string) {
    setHookDraft(text);
    saveHook.mutate(text);
  }

  const hasTitled = !!item.titled_video_path;
  const showingTitled = hasTitled && showTitled;
  // mediaUrl() appends ?pw=... so the <video> / <img> tags pass auth without
  // a custom header. Cache-bust the titled URL on `titled_at` so a freshly
  // baked render shows up immediately.
  const videoUrl = showingTitled
    ? mediaUrl(`/api/instagram/queue/${item.id}/titled-video`, { t: item.titled_at ?? 0 })
    : mediaUrl(`/api/instagram/queue/${item.id}/video`);
  const posterUrl = item.thumbnail_path
    ? mediaUrl(`/api/instagram/queue/${item.id}/thumbnail`)
    : undefined;
  const ideas = item.hook_variants ?? [];

  return (
    <section className="rep-section">
      <header className="rep-section__head">
        <h3 className="rep-section__title">reel production</h3>
        <p className="rep-section__sub">
          generate hook ideas, pick the best bits, write the final hook. preview shows where it'll land on the frame.
        </p>
      </header>

      <div className="ig-prod">
        {/* Left: video preview with draggable hook overlay */}
        <div className="ig-prod__preview">
          <div className="ig-prod__video-wrap">
            <video
              key={videoUrl}
              src={videoUrl}
              poster={posterUrl}
              controls
              playsInline
              muted
              preload="metadata"
              className="ig-prod__video"
            />
            {/* Only show the CSS overlay on the RAW video. The titled version
                already has the text baked in, so the overlay would double up. */}
            {hookDraft && !showingTitled && (
              <div
                className="ig-prod__hook"
                style={{ left: `${hookPos.x}%`, top: `${hookPos.y}%` }}
                onMouseDown={startDrag}
                title="drag to reposition"
              >
                <span className="ig-prod__hook-text">{hookDraft}</span>
              </div>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => renderTitle.mutate()}
              disabled={renderTitle.isPending || !hookDraft.trim()}
              title={!hookDraft.trim() ? 'write or pick a hook first' : 'bake the hook onto the video at the dragged position'}
            >
              {renderTitle.isPending
                ? 'rendering…'
                : hasTitled
                  ? 're-render title onto video'
                  : 'render title onto video'}
            </button>
            {hasTitled && (
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => setShowTitled((s) => !s)}
                title="toggle between the raw drop and the rendered version"
              >
                {showingTitled ? 'show raw video' : 'show titled video'}
              </button>
            )}
            {renderTitle.isError && (
              <span style={{ fontSize: 11, color: '#ff6b6b' }}>
                {(renderTitle.error as Error)?.message ?? 'render failed'}
              </span>
            )}
          </div>
          <p className="muted ig-prod__hint">
            {showingTitled
              ? 'showing the rendered version. switch to raw video to drag and re-render.'
              : 'drag the hook to position it, then render to bake it into the video.'}
          </p>
        </div>

        {/* Right: hook generator + the hook */}
        <div className="ig-prod__controls">
          <div className="ig-prod__block">
            <div className="ig-prod__block-head">
              <span className="eyebrow">hook ideas (read-only)</span>
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => regenHooks.mutate()}
                disabled={regenHooks.isPending}
              >
                {regenHooks.isPending ? 'generating...' : ideas.length === 0 ? 'generate hook ideas' : 'regenerate ideas'}
              </button>
            </div>
            {ideas.length === 0 ? (
              <p className="muted" style={{ fontSize: 'var(--body-sm)', margin: 0 }}>
                click generate to get 3 angles to draw from.
              </p>
            ) : (
              <div className="ig-prod__ideas">
                {ideas.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    className="ig-prod__idea"
                    onClick={() => useIdea(h)}
                    title="click to use this as the hook"
                  >
                    <span className="ig-prod__idea-num">{i + 1}</span>
                    <span className="ig-prod__idea-text">{h}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ig-prod__block">
            <div className="ig-prod__block-head">
              <span className="eyebrow">the hook (what'll be on the reel)</span>
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={copyHook}
                disabled={!hookDraft}
              >
                {copyMsg || 'copy hook'}
              </button>
            </div>
            <textarea
              className="rep-text-input ig-prod__hook-final"
              value={hookDraft}
              onChange={(e) => setHookDraft(e.target.value)}
              onBlur={commitHook}
              placeholder="write the final hook here. click an idea above to start with it, then tweak."
              rows={2}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ScheduledStrip({ items }: { items: IgQueueItem[] }) {
  const sorted = [...items].sort((a, b) => (a.scheduled_for ?? 0) - (b.scheduled_for ?? 0));
  return (
    <div className="ig-strip" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="ig-strip__head">
        <span className="eyebrow" style={{ color: 'var(--recovery)' }}>queued to auto-post</span>
        <h3 className="ig-strip__title">scheduled ({sorted.length})</h3>
      </div>
      <div className="ig-strip__list">
        {sorted.map((it) => {
          const d = it.scheduled_for ? new Date(it.scheduled_for * 1000) : null;
          const dateLabel = d
            ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toLowerCase()
            : 'no date';
          return (
            <div key={it.id} className="ig-strip__row">
              <span className="ig-strip__date">{dateLabel}</span>
              <span className="ig-strip__hook">{it.chosen_hook ?? it.title ?? '(no hook)'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FailedStrip({ items }: { items: IgQueueItem[] }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: string) => api.updateIgItem(id, { status: 'scheduled' as any }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  return (
    <div className="ig-strip ig-strip--danger" style={{ marginBottom: 'var(--space-5)' }}>
      <div className="ig-strip__head">
        <span className="eyebrow" style={{ color: 'var(--danger)' }}>posts that failed</span>
        <h3 className="ig-strip__title">needs attention ({items.length})</h3>
      </div>
      <div className="ig-strip__list">
        {items.map((it) => (
          <div key={it.id} className="ig-strip__row">
            <span className="ig-strip__date" style={{ color: 'var(--danger)' }}>failed</span>
            <span className="ig-strip__hook">{it.chosen_hook ?? it.title ?? '(no hook)'}</span>
            {it.failed_reason && (
              <span className="muted" style={{ fontSize: 11 }}>{it.failed_reason}</span>
            )}
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => retry.mutate(it.id)}
              style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
            >
              retry
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export const IG_CSS = `
.ig-page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-5);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}
.ig-page-sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.5;
  max-width: 56ch;
}

.ig-stat-strip {
  display: flex;
  gap: var(--space-5);
}
.ig-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ig-stat__num {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.5rem, 3vw, 2.2rem);
  letter-spacing: -0.03em;
  line-height: 1;
}
.ig-stat__lbl {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}

.ig-add-row {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}
.ig-add-row .ig-idea-input { flex: 1; min-width: 280px; margin-bottom: 0; }
.ig-add-row__bank { white-space: nowrap; }

/* Free-text idea entry: no box, just a bottom line. The "add idea" button sits
   inline at the right (ghost grey until you type, green once there's text). */
.ig-idea-input {
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
  margin-bottom: 0;
}
.ig-idea-input__field {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--hairline);
  border-radius: 0;
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  padding: 8px 2px;
  outline: none;
  transition: border-color var(--duration-fast) var(--ease-out);
}
.ig-idea-input__field:focus { border-bottom-color: var(--accent); }
.ig-idea-input__field::placeholder { color: var(--muted-2); }
/* Override the global light-mode "grey well" for text inputs - this one stays a bare line. */
:root[data-theme='light'] input.ig-idea-input__field { background: transparent; }

.ig-empty {
  padding: var(--space-6);
  background: var(--surface);
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.ig-lane { margin-bottom: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.ig-lane__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--hairline);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.ig-lane__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  letter-spacing: -0.025em;
  margin: 0;
  text-transform: lowercase;
}
.ig-lane__empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.55;
}

/* List style: the queue used to be a grid of tall cards. The page got too
   full, so each reel is now a compact horizontal row. */
.ig-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ig-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-4);
  transition: all 0.18s;
  position: relative;
}
.ig-card:hover {
  border-color: rgba(255,255,255,0.22);
  box-shadow: 0 8px 24px -20px rgba(0,0,0,0.55);
}
/* Reel row (skill-card style): colored tag tile (left) · main · action (right). */
.ig-card__tagbox { order: 0; flex: 0 0 auto; position: relative; }
.ig-card__tagtile {
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  border: 1px solid;
  display: grid;
  place-items: center;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.12s;
}
.ig-card__tagtile:hover { transform: translateY(-1px); }
/* The middle column of a reel row: title + one-line preview + source. */
.ig-card__main { order: 1; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ig-count-badge { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--hairline); display: grid; place-items: center; font-weight: 700; font-size: var(--body-sm); color: var(--muted); flex: 0 0 auto; background: var(--surface); }
.ig-card__action, .ig-card__action-wrap { order: 3; flex: 0 0 auto; }
.ig-card__action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
  background: #EDEDE9;
  color: #16140F;
  border: 1.5px solid #16140F;
  white-space: nowrap;
}
.ig-card__action:disabled { opacity: 0.6; cursor: default; }
.ig-card__tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
}
.ig-card__tag-wrap { position: relative; }
.ig-card__tag--btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.12s, border-color 0.15s;
}
.ig-card__tag--btn:hover { transform: translateY(-1px); }
.ig-card__tag-caret { font-size: 9px; opacity: 0.7; }
.ig-card__tag-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -16px rgba(0,0,0,0.6);
  min-width: 130px;
}
.ig-card__tag-opt {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-align: left;
  transition: transform 0.12s, background 0.15s;
}
.ig-card__tag-opt:hover:not(:disabled) { transform: translateY(-1px); }
.ig-card__tag-opt:disabled { opacity: 0.5; cursor: not-allowed; }
.ig-card__kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  font-weight: 600;
}
.ig-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.98rem;
  letter-spacing: -0.015em;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ig-card__preview {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.4;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ig-card__src {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--muted-2);
}
.ig-card__stages { display: flex; gap: 4px; flex: 0 0 64px; width: 64px; }
.ig-stage {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.06);
  transition: background 0.18s;
}
.ig-stage--on { background: var(--recovery); }

.ig-card__quick-btn {
  background: transparent;
  border: 1px solid var(--hairline);
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.04em;
  transition: all 0.12s;
  white-space: nowrap;
}
.ig-card__quick-btn:hover {
  color: var(--ink);
  border-color: var(--ink);
}
.ig-card__quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ig-stage-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}

.ig-tag-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ig-tag-btn {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s, color 0.15s;
}
.ig-tag-btn:hover:not(:disabled) { transform: translateY(-1px); }
.ig-tag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ig-script {
  margin: 0;
  font-size: var(--body);
  line-height: 1.65;
  white-space: pre-wrap;
}

.ig-moment {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
  background: rgba(0,0,0,0.18);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.55;
}
.ig-moment__ts {
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.ig-moment__text { color: var(--muted); font-style: italic; }

/* Fallback brainstorm section - small at the bottom */
.ig-fallback {
  margin-top: var(--space-8);
  padding-top: var(--space-5);
  border-top: 1px dashed var(--hairline);
}
.ig-fallback__head { margin-bottom: var(--space-3); }
.ig-fallback__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
}
.ig-fallback__sub {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.5;
}
.ig-fallback__details { margin-top: var(--space-3); }
.ig-fallback__summary {
  cursor: pointer;
  font-size: var(--body-sm);
  color: var(--muted);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: inline-block;
  list-style: none;
}
.ig-fallback__summary::-webkit-details-marker { display: none; }
.ig-fallback__summary::before { content: '+ '; }
.ig-fallback__details[open] .ig-fallback__summary::before { content: '− '; }
.ig-fallback__body {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
}

/* Bank picker slide-over */
.ig-picker { width: min(760px, 100%); }
.ig-picker__controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--hairline);
}
.ig-picker__pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ig-pill {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.15s;
}
.ig-pill:hover { color: var(--ink); border-color: var(--ink); }
.ig-pill--on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.ig-picker__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
}
.ig-pick-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ig-pick-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ig-pick-card__kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  font-weight: 600;
}
.ig-pick-card__add { margin-left: auto; padding: 4px 14px; font-size: 12px; }
.ig-pick-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
}
.ig-pick-card__text {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.55;
  color: var(--muted);
}
.ig-pick-card__src {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--muted-2);
}

/* Shared panel styles (mirrors Reputation slide-over) */
.rep-eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.rep-panel-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: ig-fade 0.18s ease-out;
}
@keyframes ig-fade { from { opacity: 0; } to { opacity: 1; } }
.rep-panel {
  width: min(680px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--dim-c);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: ig-slide 0.22s ease-out;
}
@keyframes ig-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.rep-panel__head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; }
.rep-panel__head-l { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; flex: 1; }
.rep-panel__head-r { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.rep-panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.45rem;
  letter-spacing: -0.025em;
  line-height: 1.15;
  word-break: break-word;
}
input.rep-panel__title--edit {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ink);
  padding: 4px 8px;
  margin: -4px -8px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
input.rep-panel__title--edit:hover { border-color: transparent; }
input.rep-panel__title--edit:focus { border-color: var(--dim-c); background: transparent; }
input.rep-panel__title--edit::placeholder { color: var(--muted-2); }
.rep-panel__def { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }
.rep-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--hairline);
}
.rep-section:first-of-type { padding-top: 0; border-top: none; }
.rep-section__head { display: flex; flex-direction: column; gap: 4px; }
.rep-section__title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; letter-spacing: -0.015em; }
.rep-section__sub { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }
.rep-card {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-card--inline { background: rgba(255,255,255,0.03); }
.rep-btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.rep-btn--primary { background: var(--dim-c); color: var(--bg); }
.rep-btn--primary:hover { transform: translateY(-1px); }
.rep-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.rep-btn--ghost { background: transparent; color: var(--muted); border-color: var(--hairline); }
.rep-btn--ghost:hover { color: var(--ink); border-color: var(--ink); }
.rep-actions { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; align-items: center; }
.rep-text-input {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  outline: none;
}
.ig-caption-textarea {
  resize: vertical;
  min-height: 160px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.ig-caption-tags {
  font-family: var(--font-mono, monospace);
  font-size: var(--body-sm);
  color: var(--strain);
}

@media (max-width: 640px) {
  .ig-page-head { flex-direction: column; }
  .ig-stat-strip { width: 100%; justify-content: space-between; }
  .rep-panel { padding: var(--space-4); }
}

/* Reel production - inside ReelPanel for items with a dropped video */
.ig-prod {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: var(--space-5);
}
.ig-prod__preview { display: flex; flex-direction: column; gap: 4px; }
.ig-prod__video-wrap {
  position: relative;
  aspect-ratio: 9 / 16;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  user-select: none;
}
.ig-prod__video {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
/* Draggable container - positioned by x/y center coords (percent of frame).
   The white block sits ONLY behind the actual text via box-decoration-break,
   so multi-line hooks get a tight box around each line, IG / CapCut style. */
.ig-prod__hook {
  position: absolute;
  transform: translate(-50%, -50%);
  max-width: 82%;
  text-align: center;
  cursor: grab;
  pointer-events: auto;
  font-weight: 800;
  font-size: 14px;
  line-height: 1.55;
  letter-spacing: -0.01em;
  color: black;
}
.ig-prod__hook:active { cursor: grabbing; }
.ig-prod__hook-text {
  background: white;
  padding: 3px 8px;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  display: inline;
}
.ig-prod__hint {
  font-size: 11px;
  margin: 0;
  text-align: center;
}

.ig-prod__controls { display: flex; flex-direction: column; gap: var(--space-4); }
.ig-prod__block { display: flex; flex-direction: column; gap: var(--space-2); }
.ig-prod__block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
.ig-prod__ideas { display: flex; flex-direction: column; gap: 6px; }
.ig-prod__idea {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body-sm);
  text-align: left;
  cursor: pointer;
  transition: all 0.12s;
  line-height: 1.4;
}
.ig-prod__idea:hover {
  background: color-mix(in srgb, var(--strain) 8%, rgba(255,255,255,0.04));
  border-color: color-mix(in srgb, var(--strain) 40%, var(--hairline));
}
.ig-prod__idea-num {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--strain);
  color: var(--bg);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}
.ig-prod__idea-text { flex: 1; }

.ig-prod__hook-final {
  width: 100%;
  font-size: var(--body);
  font-weight: 600;
  resize: vertical;
  min-height: 56px;
  line-height: 1.4;
}

@media (max-width: 720px) {
  .ig-prod { grid-template-columns: 1fr; }
  .ig-prod__video-wrap { max-width: 280px; margin: 0 auto; }
}

/* Compact horizontal strip used by Scheduled + Failed lanes */
.ig-strip {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  border: 1px solid var(--hairline);
}
.ig-strip--danger { border-color: rgba(255, 99, 99, 0.3); }
.ig-strip__head { margin-bottom: var(--space-3); }
.ig-strip__title { margin: 4px 0 0; font-size: var(--body); font-weight: 600; }
.ig-strip__list { display: flex; flex-direction: column; gap: 6px; }
.ig-strip__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
  font-size: var(--body-sm);
}
.ig-strip__date {
  font-family: var(--font-mono, monospace);
  color: var(--muted);
  min-width: 100px;
}
.ig-strip__hook { color: var(--ink); }

`;
