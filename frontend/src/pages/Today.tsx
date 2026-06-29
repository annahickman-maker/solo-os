import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Ring } from '../components/Ring';
import { Card } from '../components/Card';
import { ActivityTracker } from '../components/ActivityTracker';
import { SURFACE_LIFT } from '../lib/ui';

// Local wall-clock date helpers. "Today" should mean today in the user's
// timezone, never UTC - this matters most after local 5pm when UTC has
// already rolled to tomorrow.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function dayLabel(offset: number, date: Date): string {
  if (offset === 0) return 'today';
  if (offset === -1) return 'yesterday';
  if (offset === 1) return 'tomorrow';
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function Today() {
  const today = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const viewedDateStr = ymd(selectedDate);
  const todayStr = ymd(today);
  const isToday = viewedDateStr === todayStr;
  const dayOffset = diffDays(selectedDate, today);
  const viewedDayStart = Math.floor(selectedDate.getTime() / 1000);

  const { data, error } = useQuery({
    queryKey: ['today', viewedDateStr],
    queryFn: () => api.today({ date: viewedDateStr, day_start: viewedDayStart }),
  });

  if (error) {
    return <div className="empty">couldn't load today: {(error as Error).message}</div>;
  }

  // The server still returns deep_work_* fields - we just don't render them
  // on the page anymore. Keep them in the fallback so the type matches.
  const rings = data?.rings ?? {
    strain_score: 0,
    strain_max: 21,
    tasks_done_today: 0,
    deep_work_blocks: 0,
    deep_work_seconds: 0,
    deep_work_target_seconds: 7200,
    focus_pct: 0,
    focus_current: 0,
    focus_target: 0,
  };
  const tasks = data?.top_tasks ?? [];

  return (
    <div
      className="stack"
      style={{
        gap: 'var(--space-7)',
        // Two side-by-side dial cards at the top need horizontal room. Wider
        // cap, still centered. Drop to a single column on narrower viewports
        // via the media-query in <style> below.
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <DayToggle
        offset={dayOffset}
        date={selectedDate}
        today={today}
        onPrev={() => setSelectedDate((d) => addDays(d, -1))}
        onNext={() => setSelectedDate((d) => addDays(d, 1))}
        onPick={(d) => setSelectedDate(d)}
      />

      {/* Side-by-side top: strain dial on the LEFT, task list on the RIGHT.
          Both cards have a 378px floor on desktop so the layout doesn't
          collapse to a stub on a light task day; either can stretch taller
          when the task list has more rows. Below 980px the row stacks and
          the floor is dropped. */}
      <div
        className="today__top-row"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-4)',
          alignItems: 'stretch',
        }}
      >
        <Card style={{ height: '100%', minHeight: 378 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <Ring
              value={rings.strain_score / rings.strain_max}
              label="impact"
              bigNumber={rings.strain_score.toFixed(1)}
              subline={`${rings.tasks_done_today} task${rings.tasks_done_today === 1 ? '' : 's'} ticked today`}
              size="hero"
              color="var(--strain)"
            />
          </div>
        </Card>

        <ActivityTracker
          date={viewedDateStr}
          dayStart={viewedDayStart}
          isToday={isToday}
          tasks={tasks}
        />
      </div>

      <LongGame
        focusPct={rings.focus_pct}
        focusCurrent={rings.focus_current}
        focusTarget={rings.focus_target}
      />

      <style>{`
        @media (max-width: 980px) {
          .today__top-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// =========================================================================
// Day toggle - Whoop-style pill: prev | clickable label | next.
// Clicking the label opens a calendar popover to jump to any day.
// =========================================================================
function DayToggle({
  offset,
  date,
  today,
  onPrev,
  onNext,
  onPick,
}: {
  offset: number;
  date: Date;
  today: Date;
  onPrev: () => void;
  onNext: () => void;
  onPick: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const label = dayLabel(offset, date).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chevStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--ink)',
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  };
  const centerStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'var(--ink)',
    height: 24,
    minWidth: 130,
    padding: '0 var(--space-3)',
    borderRadius: 999,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '0.7rem',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
          borderRadius: 999,
          padding: 3,
          boxShadow: SURFACE_LIFT,
        }}
      >
        <button type="button" onClick={onPrev} aria-label="previous day" style={chevStyle}>
          <Chevron dir="left" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="open date picker"
          aria-expanded={open}
          style={centerStyle}
        >
          {label}
        </button>
        <button type="button" onClick={onNext} aria-label="next day" style={chevStyle}>
          <Chevron dir="right" />
        </button>
      </div>
      {open && (
        <DatePopover
          selected={date}
          today={today}
          onPick={(d) => {
            onPick(d);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Chevron({ dir, size = 14 }: { dir: 'left' | 'right'; size?: number }) {
  const d = dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// =========================================================================
// Calendar popover - month grid, click a day to jump.
// =========================================================================
function DatePopover({
  selected,
  today,
  onPick,
}: {
  selected: Date;
  today: Date;
  onPick: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(selected);
    d.setUTCDate(1);
    return d;
  });

  const year = viewMonth.getUTCFullYear();
  const month = viewMonth.getUTCMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstDow = (firstOfMonth.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(Date.UTC(year, month, day)));

  const todayKey = ymd(today);
  const selectedKey = ymd(selected);

  function shiftMonth(delta: number) {
    setViewMonth(new Date(Date.UTC(year, month + delta, 1)));
  }

  const dows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  return (
    <div
      role="dialog"
      aria-label="pick a date"
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        background: 'var(--bg)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        minWidth: 320,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="previous month" style={popChevStyle}>
          <Chevron dir="left" />
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em' }}>{monthLabel} {year}</span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="next month" style={popChevStyle}>
          <Chevron dir="right" />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {dows.map((d) => (
          <div key={d} style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', letterSpacing: '0.1em', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`pad-${i}`} />;
          const key = ymd(c);
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(c)}
              aria-label={c.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}
              aria-current={isSelected ? 'date' : undefined}
              style={{
                background: isSelected ? 'var(--ink)' : 'transparent',
                color: isSelected ? 'var(--bg)' : 'var(--ink)',
                border: isToday && !isSelected ? '1px solid var(--ink)' : '1px solid transparent',
                borderRadius: '50%',
                aspectRatio: '1 / 1',
                fontSize: 13,
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {c.getUTCDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const popChevStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--ink)',
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

// =========================================================================
// LongGame: just the reputation + offer dials now. The "where the focus is"
// task list was moved up into the ActivityTracker card.
// =========================================================================
const FOCUS_STAGE_WEIGHTS: Record<string, Record<'avatar' | 'pricing' | 'proof' | 'validation' | 'content', number>> = {
  idea:      { avatar: 0.30, content: 0.20, proof: 0.20, validation: 0.15, pricing: 0.15 },
  validated: { avatar: 0.25, content: 0.25, proof: 0.20, validation: 0.15, pricing: 0.15 },
  iterating: { avatar: 0.20, content: 0.20, proof: 0.20, validation: 0.20, pricing: 0.20 },
  signature: { avatar: 0.15, content: 0.25, proof: 0.20, validation: 0.20, pricing: 0.20 },
  scaling:   { avatar: 0.15, content: 0.30, proof: 0.15, validation: 0.15, pricing: 0.25 },
};

function rungSectionScore(arr: number[] | undefined): number {
  if (!Array.isArray(arr)) return 0;
  const rated = arr.filter((n) => n > 0);
  if (rated.length === 0) return 0;
  return rated.reduce((a, b) => a + b, 0) / rated.length / 5;
}

function focusRungScore(rung: any): number {
  if (!rung) return 0;
  const w = FOCUS_STAGE_WEIGHTS[rung.status] ?? FOCUS_STAGE_WEIGHTS.iterating;
  const s = rung.scores ?? {};
  const v =
    rungSectionScore(s.avatar) * w!.avatar +
    rungSectionScore(s.pricing) * w!.pricing +
    rungSectionScore(s.proof) * w!.proof +
    rungSectionScore(s.validation) * w!.validation +
    rungSectionScore(s.content) * w!.content;
  return Math.round(v * 100);
}

function LongGame({
  focusPct,
  focusCurrent,
  focusTarget,
}: {
  focusPct: number;
  focusCurrent: number;
  focusTarget: number;
}) {
  const { data: reputation } = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const { data: offer } = useQuery({ queryKey: ['offers'], queryFn: api.offers });

  const pricingSection = offer?.sections?.find((s: any) => s.id === 'pricing');
  const focusRung = (pricingSection?.pricing_rungs ?? []).find((r: any) => r?.featured);
  const focusOfferScore = focusRung ? focusRungScore(focusRung) : (offer?.overall_score ?? 0);
  const focusOfferLabel = focusRung
    ? `focus offer · ${focusRung.name || 'unnamed'}`
    : 'no focus offer set';

  function goto(href: string) {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <Card eyebrow="the long game" title="the bigger picture">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-3)',
          justifyItems: 'center',
          alignItems: 'start',
        }}
        className="long-game__dials"
      >
        <button type="button" onClick={() => goto('/profile/reputation')} className="long-game__col" style={{ ...colStyle, ...buttonReset }}>
          <Ring
            value={(reputation?.overall_score ?? 0) / 100}
            label="reputation"
            bigNumber={`${reputation?.overall_score ?? 0}`}
            unit="%"
            size="hero"
            color="var(--strain)"
          />
          <span className="muted" style={subStyle}>value · authority · pov · connection</span>
        </button>

        <button type="button" onClick={() => goto('/profile/offer')} className="long-game__col" style={{ ...colStyle, ...buttonReset }}>
          <Ring
            value={focusOfferScore / 100}
            label="offer"
            bigNumber={`${focusOfferScore}`}
            unit="%"
            size="hero"
            color="var(--sleep)"
          />
          <span className="muted" style={subStyle}>{focusOfferLabel}</span>
        </button>

        <button type="button" onClick={() => goto('/focus')} className="long-game__col" style={{ ...colStyle, ...buttonReset }}>
          <Ring
            value={focusPct}
            label="focus"
            bigNumber={`${Math.round(focusPct * 100)}`}
            unit="%"
            size="hero"
            color="var(--recovery)"
          />
          <span className="muted" style={subStyle}>{focusCurrent} / {focusTarget || '?'} toward 90-day goal</span>
        </button>
      </div>

      <style>{`
        @media (max-width: 880px) {
          .long-game__dials { grid-template-columns: 1fr !important; }
        }
        .long-game__col:hover { background: rgba(255,255,255,0.03); border-color: var(--hairline); }
      `}</style>
    </Card>
  );
}

const colStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  border: '1px solid transparent',
  transition: 'all 0.15s',
  textAlign: 'center',
  minHeight: 0,
};

const buttonReset: React.CSSProperties = {
  background: 'none',
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
};

const subStyle: React.CSSProperties = {
  fontSize: 'var(--body-sm)',
  textAlign: 'center',
  maxWidth: 220,
  lineHeight: 1.4,
};
