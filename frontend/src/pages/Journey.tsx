import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { JourneyEntry, JourneyEntryType } from '../api';

// =========================================================================
// Journey timeline - a long, horizontally-scrolling visual story.
// Full-bleed secondary page inside the Connection dimension. Each entry is
// a tag pinned to a date: a win, a failure, a teaching moment, or a
// "version of me" avatar.
// =========================================================================

// Colors match the dashboard's dimension palette:
// - win → proof/authority blue (--strain)
// - failure → connection gold (--hrv)
// - lesson → value green (--recovery)
// - avatar → point-of-view light blue (--sleep)
const TYPE_META: Record<JourneyEntryType, { label: string; color: string }> = {
  win: { label: 'win', color: 'var(--strain)' },
  failure: { label: 'failure', color: 'var(--hrv)' },
  lesson: { label: 'teaching moment', color: 'var(--recovery)' },
  avatar: { label: 'version of me', color: 'var(--sleep)' },
};

const PIN_RADIUS = 9;

// Tag-style chip used for the entry's type label and the legend in the
// header. Mirrors the colored pill pattern used elsewhere in the dashboard
// (TagChips on Content / POV / value cards).
function KindChip({
  type,
  active = true,
  onClick,
  size = 'sm',
}: {
  type: JourneyEntryType;
  active?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  const meta = TYPE_META[type];
  const isMd = size === 'md';
  return (
    <span
      className={`jt-tag ${active ? 'jt-tag--on' : 'jt-tag--off'} ${onClick ? 'jt-tag--btn' : ''}`}
      onClick={onClick}
      style={
        {
          '--c': meta.color,
          padding: isMd ? '4px 12px' : '2px 9px',
          fontSize: isMd ? 12 : 10,
        } as React.CSSProperties
      }
    >
      <span className="jt-tag__dot" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

// Dropdown tag picker - mirrors the Instagram queue tag dropdown.
// A colored pill button with a caret; clicking opens a popover below with
// each option as a colored pill. The current selection is shown solid.
function KindPicker({
  value,
  onChange,
}: {
  value: JourneyEntryType;
  onChange: (next: JourneyEntryType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = TYPE_META[value];
  return (
    <div className="jt-kpick" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="jt-kpick__btn"
        style={
          {
            '--c': meta.color,
          } as React.CSSProperties
        }
        onClick={() => setOpen((v) => !v)}
        title="change tag"
      >
        <span className="jt-tag__dot" style={{ background: meta.color }} />
        {meta.label}
        <span className="jt-kpick__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="jt-kpick__pop" role="menu">
          {(Object.keys(TYPE_META) as JourneyEntryType[]).map((t) => {
            const m = TYPE_META[t];
            const active = value === t;
            return (
              <button
                key={t}
                type="button"
                className={`jt-kpick__opt ${active ? 'is-active' : ''}`}
                style={
                  {
                    '--c': m.color,
                  } as React.CSSProperties
                }
                onClick={() => {
                  onChange(t);
                  setOpen(false);
                }}
              >
                <span className="jt-tag__dot" style={{ background: m.color }} />
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DEFAULT_PX_PER_MONTH = 110;
const MIN_PX_PER_MONTH = 36;
const MAX_PX_PER_MONTH = 260;
const ZOOM_STORAGE_KEY = 'journey:pxPerMonth';
const CARD_W = 240;
const CARD_GAP_X = 24;
const CARD_H_EST = 158;
const LANE_GAP = 20;
const MARGIN_FROM_LINE = 56;
const MAX_LANES = 4;
const LEFT_PAD = 140;
const RIGHT_PAD = 200;

function parseYM(s: string): { y: number; m: number } {
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (!m) return { y: 2020, m: 1 };
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function ymToMonths(s: string, anchor: string): number {
  const a = parseYM(anchor);
  const b = parseYM(s);
  return (b.y - a.y) * 12 + (b.m - a.m);
}

function thisYM(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonths(s: string, n: number): string {
  const { y, m } = parseYM(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function Journey() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['journey'],
    queryFn: api.journey,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date: string } | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Hide page scrollbars while this page is mounted - we own the viewport.
  useEffect(() => {
    document.body.classList.add('journey-active');
    return () => document.body.classList.remove('journey-active');
  }, []);

  // Click off the expanded card → collapse. Escape → collapse.
  useEffect(() => {
    if (!expandedId) return;
    function onDown(ev: MouseEvent) {
      const target = ev.target as HTMLElement;
      if (target.closest('.jt-card--expanded')) return;
      setExpandedId(null);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setExpandedId(null);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandedId]);

  const setStart = useMutation({
    mutationFn: (v: string) => api.setJourneyStart(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journey'] }),
  });
  const updateDate = useMutation({
    mutationFn: (v: { id: string; date: string }) =>
      api.updateJourneyEntry(v.id, { date: v.date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journey'] }),
  });
  const updateOffset = useMutation({
    mutationFn: (v: { id: string; vertical_offset: number }) =>
      api.updateJourneyEntry(v.id, { vertical_offset: v.vertical_offset }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journey'] }),
  });

  // `kind` distinguishes pin (horizontal) drags from card (vertical) drags.
  const [drag, setDrag] = useState<
    null | { id: string; kind: 'pin' | 'card'; dx: number; dy: number; moved: boolean }
  >(null);

  // Horizontal zoom (pixels per month). Persists across sessions. Cmd+wheel
  // zooms to the cursor; the +/- buttons in the header step by ~1.25x.
  const [pxPerMonth, setPxPerMonth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
      const n = raw ? parseFloat(raw) : NaN;
      if (Number.isFinite(n) && n >= MIN_PX_PER_MONTH && n <= MAX_PX_PER_MONTH) return n;
    } catch {}
    return DEFAULT_PX_PER_MONTH;
  });
  useEffect(() => {
    try { localStorage.setItem(ZOOM_STORAGE_KEY, String(pxPerMonth)); } catch {}
  }, [pxPerMonth]);

  // Zoom centered on a track-x coordinate. After zooming, adjusts scrollLeft
  // so the same date stays under the anchor x in the viewport.
  function zoomAt(nextPx: number, anchorTrackX: number) {
    const clamped = Math.max(MIN_PX_PER_MONTH, Math.min(MAX_PX_PER_MONTH, nextPx));
    if (clamped === pxPerMonth) return;
    const view = scrollerRef.current;
    if (!view) {
      setPxPerMonth(clamped);
      return;
    }
    // Compute which month sits at the anchor before the zoom...
    const anchorMonth = (anchorTrackX - LEFT_PAD) / pxPerMonth;
    // ...and where the anchor lives in the viewport.
    const viewportAnchorX = anchorTrackX - view.scrollLeft;
    setPxPerMonth(clamped);
    // After the next paint, keep the same month under the same viewport x.
    requestAnimationFrame(() => {
      const newAnchorTrackX = anchorMonth * clamped + LEFT_PAD;
      view.scrollLeft = Math.max(0, newAnchorTrackX - viewportAnchorX);
    });
  }

  const startYM = data?.start_date ?? '2020-01';
  const endYM = thisYM();
  const totalMonths = Math.max(12, ymToMonths(endYM, startYM) + 6);
  const trackWidth = totalMonths * pxPerMonth + LEFT_PAD + RIGHT_PAD;

  // Distribute entries onto lanes so they don't overlap. Manual placements
  // (entries with side + lane set after a drag) are placed first and win;
  // auto entries flow around them.
  const laid = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));
    type Placed = JourneyEntry & { side: 'top' | 'bottom'; lane: number; x: number };
    const placed: Placed[] = [];
    const ends: Record<string, number> = {};
    const manual: JourneyEntry[] = [];
    const auto: JourneyEntry[] = [];
    for (const e of sorted) {
      if (typeof e.vertical_offset === 'number') {
        manual.push(e);
      } else if ((e.side === 'top' || e.side === 'bottom') && typeof e.lane === 'number') {
        manual.push(e);
      } else {
        auto.push(e);
      }
    }
    for (const e of manual) {
      const x = ymToMonths(e.date, startYM) * pxPerMonth + LEFT_PAD;
      const side: 'top' | 'bottom' =
        typeof e.vertical_offset === 'number'
          ? e.vertical_offset < 0
            ? 'top'
            : 'bottom'
          : (e.side as 'top' | 'bottom');
      const lane = Math.min(MAX_LANES - 1, Math.max(0, (e.lane as number) ?? 0));
      placed.push({ ...e, side, lane, x });
    }
    let toggle = 0;
    for (const e of auto) {
      const x = ymToMonths(e.date, startYM) * pxPerMonth + LEFT_PAD;
      const sides: Array<'top' | 'bottom'> = toggle % 2 === 0 ? ['top', 'bottom'] : ['bottom', 'top'];
      toggle++;
      let found = false;
      outer: for (const side of sides) {
        for (let lane = 0; lane < MAX_LANES; lane++) {
          const key = `${side}-${lane}`;
          if ((ends[key] ?? -Infinity) + CARD_GAP_X <= x) {
            placed.push({ ...e, side, lane, x });
            ends[key] = x + CARD_W;
            found = true;
            break outer;
          }
        }
      }
      if (!found) {
        placed.push({ ...e, side: 'top', lane: 0, x });
        ends['top-0'] = x + CARD_W;
      }
    }
    return placed;
  }, [data, startYM, pxPerMonth]);

  // Auto-scroll to "now" on first load
  useEffect(() => {
    if (!data || !scrollerRef.current) return;
    const nowX = ymToMonths(endYM, startYM) * pxPerMonth + LEFT_PAD;
    const view = scrollerRef.current;
    view.scrollTo({ left: Math.max(0, nowX - view.clientWidth * 0.75), behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.start_date]);

  if (error) return <div className="empty">couldn't load journey: {(error as Error).message}</div>;
  if (isLoading || !data) return <div className="empty">loading</div>;

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!trackRef.current) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains('jt-strip')) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const monthOffset = Math.max(0, Math.round((x - LEFT_PAD) / pxPerMonth));
    setAdding({ date: addMonths(startYM, monthOffset) });
  }

  // Pin drag: horizontal only, snaps to month, saves date.
  function startPinDrag(e: React.MouseEvent, entry: JourneyEntry) {
    if (e.button !== 0) return;
    if (expandedId === entry.id) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    setDrag({ id: entry.id, kind: 'pin', dx: 0, dy: 0, moved: false });
    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const moved = Math.abs(dx) > 3;
      setDrag({ id: entry.id, kind: 'pin', dx, dy: 0, moved });
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const dx = ev.clientX - startX;
      const moved = Math.abs(dx) > 3;
      if (!moved) {
        setDrag(null);
        setExpandedId(entry.id);
        return;
      }
      const monthsShift = Math.round(dx / pxPerMonth);
      const currMonths = ymToMonths(entry.date, startYM);
      const newMonths = Math.max(0, currMonths + monthsShift);
      const newDate = addMonths(startYM, newMonths);
      setDrag(null);
      if (newDate !== entry.date) updateDate.mutate({ id: entry.id, date: newDate });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Card drag: vertical only, free-form, saves vertical_offset (px from centerline).
  function startCardDrag(e: React.MouseEvent, entry: JourneyEntry, currentOffset: number) {
    if (e.button !== 0) return;
    if (expandedId === entry.id) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'LABEL') return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    setDrag({ id: entry.id, kind: 'card', dx: 0, dy: 0, moved: false });
    function onMove(ev: MouseEvent) {
      const dy = ev.clientY - startY;
      const moved = Math.abs(dy) > 3;
      setDrag({ id: entry.id, kind: 'card', dx: 0, dy, moved });
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const dy = ev.clientY - startY;
      const moved = Math.abs(dy) > 3;
      if (!moved) {
        setDrag(null);
        setExpandedId(entry.id);
        return;
      }
      let newOffset = currentOffset + dy;
      // Keep at least PIN_RADIUS away from the centerline so the pin always
      // shows. Negative = above, positive = below.
      if (newOffset > -40 && newOffset < 40) {
        newOffset = newOffset < 0 ? -40 : 40;
      }
      setDrag(null);
      updateOffset.mutate({ id: entry.id, vertical_offset: newOffset });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Tick marks - one per month. January is the major year boundary tick.
  const ticks: Array<{ x: number; label: string; major: boolean }> = [];
  for (let i = 0; i <= totalMonths; i++) {
    const ym = addMonths(startYM, i);
    const { m } = parseYM(ym);
    ticks.push({
      x: i * pxPerMonth + LEFT_PAD,
      label: m === 1 ? ym.slice(0, 4) : '',
      major: m === 1,
    });
  }

  const counts = {
    win: data.entries.filter((e) => e.type === 'win').length,
    failure: data.entries.filter((e) => e.type === 'failure').length,
    lesson: data.entries.filter((e) => e.type === 'lesson').length,
    avatar: data.entries.filter((e) => e.type === 'avatar').length,
  };

  return (
    <div className="journey">
      <header className="jt-head">
        <div className="jt-head__l">
          <Link to="/profile/reputation" className="jt-back">← reputation</Link>
          <h1 className="jt-title">my journey</h1>
          <p className="jt-sub">
            the long story, visually. drop a tag at any point - a win, a failure, a teaching moment,
            or a version of you. click the centerline to add one.
          </p>
        </div>
        <div className="jt-head__r">
          <div className="jt-counts">
            {(Object.keys(TYPE_META) as JourneyEntryType[]).map((t) => (
              <span key={t} className="jt-count">
                <KindChip type={t} size="md" />
                <strong>{counts[t]}</strong>
              </span>
            ))}
          </div>
          <label className="jt-start">
            <span>start of arc</span>
            <input
              type="month"
              value={startYM}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{4}-\d{2}$/.test(v)) setStart.mutate(v);
              }}
            />
          </label>
          <div className="jt-zoom" title="zoom (or ⌘ + scroll)">
            <button
              type="button"
              className="jt-zoom__btn"
              onClick={() => {
                const view = scrollerRef.current;
                const anchor = view ? view.scrollLeft + view.clientWidth / 2 : 0;
                zoomAt(pxPerMonth / 1.25, anchor);
              }}
              disabled={pxPerMonth <= MIN_PX_PER_MONTH + 0.01}
              aria-label="zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="jt-zoom__reset"
              onClick={() => {
                const view = scrollerRef.current;
                const anchor = view ? view.scrollLeft + view.clientWidth / 2 : 0;
                zoomAt(DEFAULT_PX_PER_MONTH, anchor);
              }}
              title="reset zoom"
            >
              {Math.round((pxPerMonth / DEFAULT_PX_PER_MONTH) * 100)}%
            </button>
            <button
              type="button"
              className="jt-zoom__btn"
              onClick={() => {
                const view = scrollerRef.current;
                const anchor = view ? view.scrollLeft + view.clientWidth / 2 : 0;
                zoomAt(pxPerMonth * 1.25, anchor);
              }}
              disabled={pxPerMonth >= MAX_PX_PER_MONTH - 0.01}
              aria-label="zoom in"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <div
        className="jt-scroller"
        ref={scrollerRef}
        onWheel={(ev) => {
          // Cmd/Ctrl + scroll, or trackpad pinch (browsers report as
          // ctrlKey-modified wheel), zooms toward the cursor.
          if (!(ev.metaKey || ev.ctrlKey)) return;
          ev.preventDefault();
          const view = scrollerRef.current;
          const track = trackRef.current;
          if (!view || !track) return;
          const trackRect = track.getBoundingClientRect();
          const anchorTrackX = ev.clientX - trackRect.left;
          // negative deltaY = zoom in. Step ~7% per notch.
          const factor = Math.exp(-ev.deltaY * 0.007);
          zoomAt(pxPerMonth * factor, anchorTrackX);
        }}
      >
        <div
          className="jt-track"
          ref={trackRef}
          style={{ width: trackWidth }}
          onClick={handleTrackClick}
        >
          {/* Year labels along the top of the track */}
          {ticks
            .filter((t) => t.major)
            .map((t) => (
              <span key={`y-${t.label}`} className="jt-year" style={{ left: t.x }}>
                {t.label}
              </span>
            ))}

          {/* Centerline tick marks */}
          {ticks.map((t, i) => (
            <div
              key={i}
              className={`jt-tick ${t.major ? 'jt-tick--major' : ''}`}
              style={{ left: t.x }}
            />
          ))}

          {/* Centerline strip - click to add */}
          <div className="jt-strip" />

          {/* "start" label at far left */}
          <div className="jt-anchor" style={{ left: LEFT_PAD }}>
            <span>start</span>
          </div>

          {/* "now" marker at the far right */}
          <div className="jt-now" style={{ left: ymToMonths(endYM, startYM) * pxPerMonth + LEFT_PAD }}>
            <span>now</span>
          </div>

          {/* Entries - wrapper at the date's centerline x; pin sits on the
              line, card floats above or below it. */}
          {laid.map((e) => {
            const meta = TYPE_META[e.type];
            // Resolve vertical position. New entries use vertical_offset;
            // legacy entries fall back to lane/side maths.
            const baseOffset =
              typeof e.vertical_offset === 'number'
                ? e.vertical_offset
                : e.side === 'top'
                ? -(MARGIN_FROM_LINE + (e.lane + 1) * CARD_H_EST + e.lane * LANE_GAP)
                : MARGIN_FROM_LINE + e.lane * (CARD_H_EST + LANE_GAP);

            const isPinDrag = drag?.id === e.id && drag.kind === 'pin' && drag.moved;
            const isCardDrag = drag?.id === e.id && drag.kind === 'card' && drag.moved;
            const isExpanded = expandedId === e.id;
            const hasImage = !!e.image_url;

            // Live drag offsets
            const liveDx = isPinDrag ? drag!.dx : 0;
            const liveDy = isCardDrag ? drag!.dy : 0;
            const offset = baseOffset + liveDy;
            const isTop = offset < 0;
            const absOffset = Math.abs(offset);
            // Stem starts at the pin's outer edge and extends to the card.
            const stemTop = isTop ? -absOffset : PIN_RADIUS;
            const stemHeight = Math.max(0, absOffset - PIN_RADIUS);

            return (
              <div
                key={e.id}
                className={`jt-entry ${isTop ? 'jt-entry--top' : 'jt-entry--bottom'} ${isExpanded ? 'jt-entry--expanded' : ''}`}
                style={{
                  left: e.x,
                  transform: liveDx ? `translateX(${liveDx}px)` : undefined,
                }}
              >
                {/* Stem from pin to card */}
                <div
                  className="jt-stem"
                  style={{
                    top: stemTop,
                    height: stemHeight,
                    background: meta.color,
                  }}
                />

                {/* Pin / toggle - colored dot on the centerline. Drag to
                    move horizontally; snaps to month. */}
                <button
                  type="button"
                  className={`jt-pin ${isPinDrag ? 'jt-pin--dragging' : ''}`}
                  style={{ background: meta.color, borderColor: meta.color }}
                  onMouseDown={(ev) => startPinDrag(ev, e)}
                  title="drag to change month"
                  aria-label={`${meta.label} - ${e.title}`}
                />

                {/* Card */}
                <div
                  className={`jt-card jt-card--${isTop ? 'top' : 'bottom'} ${isCardDrag ? 'jt-card--dragging' : ''} ${isExpanded ? 'jt-card--expanded' : ''} ${hasImage ? 'jt-card--has-image' : ''} jt-card--${e.type}`}
                  style={{
                    top: offset,
                    borderColor: meta.color,
                    animationDelay: `${(e.lane ?? 0) * 60}ms`,
                  }}
                  onMouseDown={(ev) => startCardDrag(ev, e, baseOffset)}
                >
                  {isExpanded ? (
                    <InlineEditor entry={e} onCollapse={() => setExpandedId(null)} />
                  ) : (
                    <>
                      {hasImage && (
                        <div
                          className="jt-card__image"
                          style={{ backgroundImage: `url(${e.image_url})` }}
                          aria-label={e.title}
                        />
                      )}
                      <header className="jt-card__head">
                        <span className="jt-card__date">{formatDate(e.date)}</span>
                        <KindChip type={e.type} />
                      </header>
                      <h3 className="jt-card__title">{e.title}</h3>
                      {e.body && <p className="jt-card__body">{e.body}</p>}
                      {e.tags && e.tags.length > 0 && (
                        <div className="jt-card__tags">
                          {e.tags.map((t) => (
                            <span key={t} className="jt-chip">{t}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="jt-hint">
        <span>drag the dot to change month • drag the card to change height • click to edit</span>
      </div>

      {adding && (
        <EntryEditor
          initial={null}
          defaultDate={adding.date}
          onClose={() => setAdding(null)}
        />
      )}

      <style>{JOURNEY_CSS}</style>
    </div>
  );
}

function formatDate(ym: string): string {
  const { y, m } = parseYM(ym);
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return `${months[m - 1]} ${y}`;
}

// =========================================================================
// Inline editor - renders inside the expanded card. Everything edits in
// place; save-on-blur for text fields, save-on-change for date/type/image.
// =========================================================================
function InlineEditor({
  entry,
  onCollapse,
}: {
  entry: JourneyEntry;
  onCollapse: () => void;
}) {
  const qc = useQueryClient();
  const upd = useMutation({
    mutationFn: (body: Partial<{
      date: string;
      type: JourneyEntryType;
      title: string;
      body: string | null;
      tags: string[];
      image_url: string | null;
    }>) => api.updateJourneyEntry(entry.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journey'] }),
  });
  const del = useMutation({
    mutationFn: () => api.deleteJourneyEntry(entry.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey'] });
      onCollapse();
    },
  });

  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body ?? '');
  const [tagsStr, setTagsStr] = useState((entry.tags ?? []).join(', '));
  const [imageUrl, setImageUrl] = useState(entry.image_url ?? '');
  const [uploading, setUploading] = useState(false);

  function saveTitle() {
    const v = title.trim();
    if (v && v !== entry.title) upd.mutate({ title: v });
  }
  function saveBody() {
    const v = body.trim();
    const prev = entry.body ?? '';
    if (v !== prev) upd.mutate({ body: v || null });
  }
  function saveTags() {
    const next = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
    const prev = entry.tags ?? [];
    if (next.join('|') !== prev.join('|')) upd.mutate({ tags: next });
  }
  function setImage(url: string) {
    setImageUrl(url);
    const prev = entry.image_url ?? '';
    if (url !== prev) upd.mutate({ image_url: url.trim() || null });
  }

  async function onPickFile(file: File) {
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = r.result as string;
          const comma = s.indexOf(',');
          resolve(comma >= 0 ? s.slice(comma + 1) : s);
        };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api.uploadJourneyImage(file.name, data);
      setImage(res.url);
    } catch (err) {
      alert('upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="jt-edit" onMouseDown={(e) => e.stopPropagation()}>
      {imageUrl && (
        <div className="jt-edit__image" style={{ backgroundImage: `url(${imageUrl})` }}>
          <button
            type="button"
            className="jt-edit__image-x"
            onClick={() => setImage('')}
            aria-label="remove image"
          >
            ×
          </button>
        </div>
      )}

      <div className="jt-edit__meta">
        <input
          type="month"
          className="jt-edit__date"
          value={entry.date}
          onChange={(ev) => upd.mutate({ date: ev.target.value })}
        />
        <KindPicker value={entry.type} onChange={(t) => upd.mutate({ type: t })} />
      </div>

      <StoryBankPull
        onPick={(s) => {
          setTitle(s.title || '');
          setBody(s.text || '');
          upd.mutate({
            title: (s.title || entry.title).trim(),
            body: (s.text || '').trim() || null,
          });
        }}
      />

      <label className="jt-edit__field">
        <span className="jt-edit__label">title</span>
        <input
          className="jt-edit__title"
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          onBlur={saveTitle}
          placeholder="give this moment a name"
        />
      </label>

      <label className="jt-edit__field">
        <span className="jt-edit__label">the story behind it</span>
        <textarea
          className="jt-edit__body"
          value={body}
          onChange={(ev) => setBody(ev.target.value)}
          onBlur={saveBody}
          placeholder="the why, the texture, what this meant."
          rows={Math.max(5, Math.ceil((body.length || 80) / 50))}
        />
      </label>

      <label className="jt-edit__field">
        <span className="jt-edit__label">tags</span>
        <input
          className="jt-edit__tags"
          value={tagsStr}
          onChange={(ev) => setTagsStr(ev.target.value)}
          onBlur={saveTags}
          placeholder="comma-separated"
        />
      </label>

      <div className="jt-edit__actions">
        <label className="jt-edit__upload">
          {uploading ? 'uploading…' : imageUrl ? 'replace image' : '+ add image'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) onPickFile(f);
              ev.target.value = '';
            }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="jt-edit__delete"
          onClick={() => {
            if (confirm(`delete "${entry.title}"?`)) del.mutate();
          }}
        >
          delete
        </button>
        <button type="button" className="jt-edit__done" onClick={onCollapse}>
          done
        </button>
      </div>
    </div>
  );
}

// =========================================================================
// Story bank pull - imports a micro-story from the Connection dimension
// into the current journey entry's title + body. Same source the Reputation
// page's story bank pulls from.
// =========================================================================
function StoryBankPull({
  onPick,
}: {
  onPick: (s: { id: string; title?: string; text: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { data: rep } = useQuery({
    queryKey: ['reputation'],
    queryFn: api.reputation,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!open) return;
    function onDown(ev: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const stories =
    rep?.dimensions.find((d) => d.id === 'connection')?.micro_stories ?? [];
  const confirmed = stories.filter((s) => s.status === 'confirmed');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? confirmed.filter(
        (s) =>
          (s.title ?? '').toLowerCase().includes(q) ||
          s.text.toLowerCase().includes(q) ||
          (s.tags ?? []).some((t) => t.toLowerCase().includes(q)),
      )
    : confirmed;

  return (
    <div className="jt-bank" ref={rootRef}>
      <button
        type="button"
        className="jt-bank__btn"
        onClick={() => setOpen((v) => !v)}
        title="pull a micro-story from your bank"
      >
        ↑ pull from story bank
        <span className="jt-bank__caret">▾</span>
      </button>
      {open && (
        <div className="jt-bank__pop">
          <input
            type="text"
            className="jt-bank__search"
            placeholder="search the bank"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            autoFocus
          />
          <div className="jt-bank__list">
            {!rep && <div className="jt-bank__empty">loading your bank…</div>}
            {rep && filtered.length === 0 && (
              <div className="jt-bank__empty">
                {confirmed.length === 0
                  ? "nothing in your bank yet. approve stories from the Connection panel first."
                  : 'no stories match.'}
              </div>
            )}
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="jt-bank__item"
                onClick={() => {
                  onPick({ id: s.id, title: s.title ?? undefined, text: s.text });
                  setOpen(false);
                }}
              >
                {s.title && <strong className="jt-bank__item-title">{s.title}</strong>}
                <span className="jt-bank__item-text">{s.text}</span>
                {s.tags && s.tags.length > 0 && (
                  <span className="jt-bank__item-tags">
                    {s.tags.slice(0, 4).map((t) => (
                      <span key={t} className="jt-chip">{t}</span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Entry editor - modal for ADD only. Editing happens inline via
// InlineEditor above.
// =========================================================================
function EntryEditor({
  initial,
  defaultDate,
  onClose,
}: {
  initial: JourneyEntry | null;
  defaultDate?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: {
      date: string;
      type: JourneyEntryType;
      title: string;
      body?: string;
      tags?: string[];
      image_url?: string;
    }) => api.addJourneyEntry(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey'] });
      onClose();
    },
  });
  const upd = useMutation({
    mutationFn: (body: Partial<{
      date: string;
      type: JourneyEntryType;
      title: string;
      body: string | null;
      tags: string[];
      image_url: string | null;
    }>) => api.updateJourneyEntry(initial!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey'] });
      onClose();
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteJourneyEntry(initial!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journey'] });
      onClose();
    },
  });

  const [date, setDate] = useState(initial?.date ?? defaultDate ?? thisYM());
  const [type, setType] = useState<JourneyEntryType>(initial?.type ?? 'win');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [tagsStr, setTagsStr] = useState((initial?.tags ?? []).join(', '));
  const [imageUrl, setImageUrl] = useState<string>(initial?.image_url ?? '');
  const [uploading, setUploading] = useState(false);

  async function onPickFile(file: File) {
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = r.result as string;
          const comma = s.indexOf(',');
          resolve(comma >= 0 ? s.slice(comma + 1) : s);
        };
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api.uploadJourneyImage(file.name, data);
      setImageUrl(res.url);
    } catch (err) {
      alert('upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (initial) {
      upd.mutate({
        date,
        type,
        title: title.trim(),
        body: body.trim() || null,
        tags,
        image_url: imageUrl.trim() || null,
      });
    } else {
      if (!title.trim()) return;
      add.mutate({
        date,
        type,
        title: title.trim(),
        body: body.trim() || undefined,
        tags: tags.length ? tags : undefined,
        image_url: imageUrl.trim() || undefined,
      });
    }
  }

  return (
    <div className="jt-modal-wrap" onClick={onClose}>
      <div className="jt-modal" onClick={(e) => e.stopPropagation()}>
        <header className="jt-modal__head">
          <h2>{initial ? 'edit tag' : 'add a tag to the timeline'}</h2>
          <button type="button" className="jt-btn jt-btn--ghost" onClick={onClose}>close</button>
        </header>

        <div className="jt-types">
          <KindPicker value={type} onChange={(t) => setType(t)} />
        </div>

        <label className="jt-field">
          <span>when</span>
          <input type="month" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="jt-field">
          <span>title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === 'avatar'
                ? "e.g. 'the 2023 version of me - ready to leave clients behind'"
                : type === 'failure'
                ? "e.g. 'launched my first course - sold 2 copies'"
                : type === 'lesson'
                ? "e.g. 'realised i was building someone else\\'s playbook'"
                : "e.g. 'first $20K month'"
            }
            autoFocus
          />
        </label>

        <label className="jt-field">
          <span>the story behind it</span>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="the why, the texture, what this meant. optional."
          />
        </label>

        <label className="jt-field">
          <span>tags (comma-separated)</span>
          <input
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="e.g. youtube, pivot, money"
          />
        </label>

        <div className="jt-field">
          <span>
            picture {type === 'avatar' ? '(a portrait of this version of you)' : '(optional)'}
          </span>
          <div className="jt-image">
            {imageUrl && (
              <div
                className="jt-image__preview"
                style={{ backgroundImage: `url(${imageUrl})` }}
              />
            )}
            <div className="jt-image__controls">
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="paste an image url, or upload below"
              />
              <div className="jt-image__actions">
                <label className="jt-btn jt-btn--ghost" style={{ cursor: 'pointer' }}>
                  {uploading ? 'uploading…' : imageUrl ? 'replace' : 'upload file'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onPickFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    className="jt-btn jt-btn--ghost"
                    onClick={() => setImageUrl('')}
                  >
                    remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="jt-modal__actions">
          {initial && (
            <button
              type="button"
              className="jt-btn jt-btn--danger"
              onClick={() => {
                if (confirm(`delete "${initial.title}"?`)) del.mutate();
              }}
            >
              delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="jt-btn jt-btn--ghost" onClick={onClose}>cancel</button>
          <button
            type="button"
            className="jt-btn jt-btn--primary"
            disabled={!title.trim()}
            onClick={save}
          >
            {initial ? 'save' : 'add to timeline'}
          </button>
        </div>
      </div>
    </div>
  );
}

const JOURNEY_CSS = `
body.journey-active { overflow: hidden; }

.journey {
  position: fixed;
  top: 0;
  left: 240px;
  right: 0;
  bottom: 0;
  background: var(--bg);
  color: var(--ink);
  display: flex;
  flex-direction: column;
  z-index: 30;
  overflow: hidden;
}
@media (max-width: 1023px) { .journey { left: 0; bottom: 72px; } }

.jt-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 32px;
  padding: 28px 48px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
  background: var(--bg);
}
.jt-head__l { max-width: 620px; }
.jt-back {
  display: inline-block;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  text-decoration: none;
  margin-bottom: 12px;
  transition: color 120ms;
}
.jt-back:hover { color: var(--ink); }
.jt-title {
  font-family: var(--font-display, 'Fraunces', serif);
  font-size: 52px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  margin: 0 0 12px;
}
.jt-sub {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
  margin: 0;
  max-width: 58ch;
}
.jt-head__r {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-end;
}
.jt-counts {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.jt-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}
.jt-count strong {
  font-family: var(--font-display, serif);
  color: var(--ink);
  font-size: 18px;
  letter-spacing: -0.01em;
}

/* ───── Tag chip (colored dot + label) ───────────────────────── */
.jt-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: var(--radius-pill, 999px);
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  background: color-mix(in srgb, var(--c) 12%, transparent);
  color: var(--c);
  border: 1px solid color-mix(in srgb, var(--c) 30%, var(--hairline, rgba(0,0,0,0.12)));
  transition: background 120ms, border-color 120ms, opacity 120ms;
}
.jt-tag__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.jt-tag--off {
  background: transparent;
  color: var(--muted);
  border-color: var(--hairline, rgba(0,0,0,0.15));
  opacity: 0.6;
}
.jt-tag--off .jt-tag__dot {
  background: var(--muted) !important;
  opacity: 0.6;
}
.jt-tag--btn { cursor: pointer; }
.jt-tag--btn:hover {
  background: color-mix(in srgb, var(--c) 18%, transparent);
  opacity: 1;
}

/* ───── Tag dropdown picker (matches Instagram queue) ─────── */
.jt-kpick { position: relative; display: inline-flex; }
.jt-kpick__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: var(--radius-pill, 999px);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 28%, var(--hairline, rgba(0,0,0,0.12)));
  cursor: pointer;
  transition: transform 0.12s, border-color 0.15s, background 0.15s;
  line-height: 1;
  white-space: nowrap;
}
.jt-kpick__btn:hover { transform: translateY(-1px); }
.jt-kpick__caret { font-size: 9px; opacity: 0.7; margin-left: 2px; }
.jt-kpick__pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--surface-2, var(--bg));
  border: 1px solid var(--hairline, rgba(0,0,0,0.12));
  border-radius: var(--radius-md, 8px);
  box-shadow: 0 12px 32px -16px rgba(0,0,0,0.6);
  min-width: 160px;
}
.jt-kpick__opt {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border-radius: var(--radius-pill, 999px);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-align: left;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
  transition: transform 0.12s, background 0.15s;
  line-height: 1;
  white-space: nowrap;
}
.jt-kpick__opt:hover { transform: translateY(-1px); }
.jt-kpick__opt.is-active {
  color: var(--bg);
  background: var(--c);
  border-color: var(--c);
}
.jt-kpick__opt.is-active .jt-tag__dot {
  background: var(--bg) !important;
}
.jt-start {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.jt-start input {
  padding: 6px 10px;
  border: 1px solid var(--hairline, rgba(0,0,0,0.15));
  border-radius: 6px;
  background: var(--bg);
  color: var(--ink);
  font-size: 13px;
  font-family: inherit;
}

/* ───── Zoom controls ─────────────────────────────────────── */
.jt-zoom {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--hairline, rgba(0,0,0,0.15));
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg);
}
.jt-zoom__btn, .jt-zoom__reset {
  font-family: inherit;
  font-size: 13px;
  color: var(--ink);
  background: transparent;
  border: none;
  padding: 6px 10px;
  cursor: pointer;
  line-height: 1;
  transition: background 120ms, color 120ms;
}
.jt-zoom__btn { font-weight: 700; font-size: 15px; }
.jt-zoom__reset {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--muted);
  min-width: 44px;
  border-left: 1px solid var(--hairline, rgba(0,0,0,0.1));
  border-right: 1px solid var(--hairline, rgba(0,0,0,0.1));
}
.jt-zoom__btn:hover:not(:disabled),
.jt-zoom__reset:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); color: var(--ink); }
.jt-zoom__btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* ───── Scroller ─────────────────────────────────────────────── */
.jt-scroller {
  flex: 1;
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
}
.jt-scroller::-webkit-scrollbar { height: 10px; }
.jt-scroller::-webkit-scrollbar-track { background: transparent; }
.jt-scroller::-webkit-scrollbar-thumb {
  background: var(--hairline, rgba(0,0,0,0.12));
  border-radius: 6px;
}
.jt-scroller::-webkit-scrollbar-thumb:hover { background: var(--muted); }

.jt-track {
  position: relative;
  height: 100%;
  min-height: 600px;
}

/* Small year labels along the top of the track */
.jt-year {
  position: absolute;
  top: 18px;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--muted);
  opacity: 0.7;
  pointer-events: none;
  z-index: 1;
  white-space: nowrap;
  font-family: inherit;
}

/* Centerline */
.jt-strip {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 2px;
  background: var(--ink);
  opacity: 0.4;
  transform: translateY(-50%);
  cursor: cell;
  z-index: 2;
}
.jt-strip:hover { opacity: 0.7; }

/* Every-month tick. Small + light for normal months, bigger + bolder for
   January year boundaries. */
.jt-tick {
  position: absolute;
  top: calc(50% - 4px);
  width: 1px;
  height: 8px;
  background: var(--muted);
  opacity: 0.25;
  z-index: 1;
}
.jt-tick--major {
  height: 22px;
  top: calc(50% - 11px);
  width: 2px;
  opacity: 0.7;
  background: var(--ink);
}

.jt-anchor, .jt-now {
  position: absolute;
  top: calc(50% - 38px);
  height: 34px;
  width: 2px;
  z-index: 4;
}
.jt-anchor { background: var(--muted); opacity: 0.5; }
.jt-now { background: var(--strain, #c87a3e); }
.jt-anchor span, .jt-now span {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 800;
  white-space: nowrap;
}
.jt-anchor span { color: var(--muted); }
.jt-now span { color: var(--strain, #c87a3e); }

/* ───── Cards ─────────────────────────────────────────────── */
@keyframes jt-card-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Entry wrapper: positioned at the date's x on the centerline. All three
   inner pieces (pin, stem, card) are positioned relative to it. Crucially,
   no z-index in the normal state so the wrapper doesn't create a stacking
   context - that lets stems from one entry render BEHIND cards of other
   entries. Expanded entries get a high z-index to float above siblings. */
.jt-entry {
  position: absolute;
  top: 50%;
}
.jt-entry--expanded { z-index: 20; }

/* Pin / toggle - colored dot sitting on the centerline. Drag this to move
   horizontally; snaps to month on release. */
.jt-pin {
  position: absolute;
  top: -${PIN_RADIUS}px;
  left: 0;
  transform: translateX(-50%);
  width: ${PIN_RADIUS * 2}px;
  height: ${PIN_RADIUS * 2}px;
  border-radius: 50%;
  border: 2px solid var(--bg);
  padding: 0;
  cursor: ew-resize;
  z-index: 7;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.jt-pin:hover {
  transform: translateX(-50%) scale(1.25);
  box-shadow: 0 2px 8px rgba(0,0,0,0.24);
}
.jt-pin--dragging {
  transform: translateX(-50%) scale(1.35);
  box-shadow: 0 4px 14px rgba(0,0,0,0.28);
  cursor: ew-resize;
}

/* Stem from pin to card. Positioned to render under the card. */
.jt-stem {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
  width: 2px;
  z-index: 3;
  opacity: 0.55;
  border-radius: 1px;
}

.jt-card {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
  width: ${CARD_W}px;
  background: var(--bg);
  border: 1.5px solid;
  border-radius: 12px;
  padding: 14px 16px 16px;
  cursor: ns-resize;
  user-select: none;
  z-index: 5;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04);
  transition: box-shadow 160ms ease, z-index 0s;
  animation: jt-card-in 360ms cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.jt-card:hover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.08), 0 16px 40px rgba(0,0,0,0.08);
  z-index: 8;
}
.jt-card--dragging {
  z-index: 11;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18), 0 20px 60px rgba(0,0,0,0.14);
  transition: none;
}
.jt-card__image {
  width: calc(100% + 32px);
  margin: -14px -16px 12px;
  height: 130px;
  background-size: cover;
  background-position: center;
  background-color: var(--hairline, rgba(0,0,0,0.06));
  border-radius: 10px 10px 0 0;
}
.jt-card--avatar.jt-card--has-image .jt-card__image {
  height: 180px;
}

/* ───── Expanded inline editor ───────────────────────────── */
.jt-card--expanded {
  width: 380px;
  z-index: 12;
  cursor: default;
  box-shadow: 0 12px 36px rgba(0,0,0,0.18), 0 28px 80px rgba(0,0,0,0.14);
  transition: box-shadow 160ms ease;
}

.jt-edit { display: flex; flex-direction: column; gap: 10px; }
.jt-edit__image {
  width: calc(100% + 32px);
  margin: -14px -16px 4px;
  height: 200px;
  background-size: cover;
  background-position: center;
  background-color: var(--hairline, rgba(0,0,0,0.06));
  border-radius: 10px 10px 0 0;
  position: relative;
}
.jt-edit__image-x {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.55);
  color: white;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.jt-edit__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.jt-edit__date {
  border: 1px solid var(--hairline, rgba(0,0,0,0.15));
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 700;
}
.jt-edit__types { display: flex; gap: 6px; flex-wrap: wrap; }
.jt-edit__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.jt-edit__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
  font-weight: 700;
}
.jt-edit__title {
  font-family: var(--font-display, serif);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.015em;
  border: 1px solid var(--hairline, rgba(0,0,0,0.12));
  background: var(--bg);
  color: var(--ink);
  padding: 8px 12px;
  outline: none;
  border-radius: 8px;
  transition: border-color 120ms;
  width: 100%;
  box-sizing: border-box;
}
.jt-edit__title:hover { border-color: var(--muted); }
.jt-edit__title:focus { border-color: var(--ink); }

/* ───── Story bank pull ──────────────────────────────────── */
.jt-bank { position: relative; }
.jt-bank__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  background: transparent;
  border: 1px dashed var(--hairline, rgba(0,0,0,0.2));
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  transition: color 120ms, border-color 120ms, background 120ms;
}
.jt-bank__btn:hover {
  color: var(--ink);
  border-color: var(--muted);
  background: color-mix(in srgb, var(--ink) 4%, transparent);
}
.jt-bank__caret { font-size: 9px; opacity: 0.7; }
.jt-bank__pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 60;
  background: var(--surface-2, var(--bg));
  border: 1px solid var(--hairline, rgba(0,0,0,0.15));
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 12px 32px -16px rgba(0,0,0,0.6);
  display: flex;
  flex-direction: column;
  max-height: 360px;
  overflow: hidden;
}
.jt-bank__search {
  border: none;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.1));
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  padding: 10px 14px;
  outline: none;
}
.jt-bank__list {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.jt-bank__empty {
  padding: 16px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.jt-bank__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 10px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.06));
  font-family: inherit;
  color: var(--ink);
  transition: background 120ms;
}
.jt-bank__item:hover { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.jt-bank__item:last-child { border-bottom: none; }
.jt-bank__item-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.005em;
}
.jt-bank__item-text {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.jt-bank__item-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.jt-edit__body {
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink);
  border: 1px solid var(--hairline, rgba(0,0,0,0.12));
  background: var(--bg);
  border-radius: 8px;
  padding: 10px 12px;
  resize: none;
  outline: none;
  min-height: 100px;
}
.jt-edit__body:focus { border-color: var(--muted); }
.jt-edit__tags {
  font: inherit;
  font-size: 12px;
  color: var(--ink);
  border: 1px solid var(--hairline, rgba(0,0,0,0.12));
  background: var(--bg);
  border-radius: 6px;
  padding: 6px 10px;
  outline: none;
}
.jt-edit__tags:focus { border-color: var(--muted); }
.jt-edit__actions {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 2px;
}
.jt-edit__upload {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  padding: 6px 10px;
  border: 1px dashed var(--hairline, rgba(0,0,0,0.18));
  border-radius: 6px;
  transition: color 120ms, border-color 120ms;
}
.jt-edit__upload:hover { color: var(--ink); border-color: var(--muted); }
.jt-edit__delete, .jt-edit__done {
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.jt-edit__delete {
  background: transparent;
  color: var(--hrv, #b94a3a);
  border: 1px solid color-mix(in srgb, var(--hrv, #b94a3a) 35%, transparent);
}
.jt-edit__delete:hover { background: color-mix(in srgb, var(--hrv, #b94a3a) 10%, transparent); }
.jt-edit__done {
  background: var(--ink);
  color: var(--bg);
  border: 1px solid var(--ink);
}

.jt-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.jt-card__date {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.jt-card__title {
  font-family: var(--font-display, serif);
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  line-height: 1.25;
  letter-spacing: -0.015em;
}
.jt-card__body {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0 0 8px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.jt-card__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.jt-chip {
  display: inline-block;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-pill, 999px);
  background: var(--hairline, rgba(0,0,0,0.06));
  color: var(--muted);
  font-weight: 500;
}

.jt-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  opacity: 0.5;
  pointer-events: none;
  z-index: 9;
}

/* ───── Modal ─────────────────────────────────────────────── */
.jt-modal-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}
.jt-modal {
  background: var(--bg);
  border-radius: 14px;
  padding: 28px;
  width: 100%;
  max-width: 580px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 80px rgba(0,0,0,0.3);
}
.jt-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.jt-modal__head h2 {
  font-family: var(--font-display, serif);
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.015em;
}
.jt-types {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.jt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.jt-field > span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 600;
}
.jt-field input,
.jt-field textarea {
  padding: 10px 12px;
  border: 1px solid var(--hairline, rgba(0,0,0,0.15));
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  background: var(--bg);
  color: var(--ink);
  resize: vertical;
}
.jt-field textarea { line-height: 1.5; }

.jt-image {
  display: flex;
  gap: 14px;
  align-items: stretch;
}
.jt-image__preview {
  width: 110px;
  height: 110px;
  border-radius: 10px;
  background-size: cover;
  background-position: center;
  background-color: var(--hairline, rgba(0,0,0,0.06));
  flex-shrink: 0;
  border: 1px solid var(--hairline, rgba(0,0,0,0.12));
}
.jt-image__controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.jt-image__actions {
  display: flex;
  gap: 8px;
}
.jt-modal__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
}
.jt-btn {
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  transition: background 120ms, color 120ms;
}
.jt-btn--primary {
  background: var(--ink);
  color: var(--bg);
  font-weight: 600;
}
.jt-btn--primary:disabled { opacity: 0.35; cursor: not-allowed; }
.jt-btn--ghost {
  background: transparent;
  color: var(--muted);
  border-color: var(--hairline, rgba(0,0,0,0.15));
}
.jt-btn--ghost:hover { color: var(--ink); }
.jt-btn--danger {
  background: transparent;
  color: #b94a3a;
  border-color: rgba(185, 74, 58, 0.4);
}
.jt-btn--danger:hover { background: rgba(185, 74, 58, 0.1); }
`;
