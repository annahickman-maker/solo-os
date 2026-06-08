import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Task } from '../api';
import { Ring } from '../components/Ring';
import { Card } from '../components/Card';
import { ActivityTracker } from '../components/ActivityTracker';
import { greetingFromHour } from '../lib/format';

// Use the user's local wall-clock date everywhere - "today" should mean
// "today in PDT/PST" not "today in UTC". This matters most after local
// 5pm when UTC has already rolled to tomorrow.
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

function formatHours(sec: number): string {
  if (sec < 60) return '0m';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = sec / 3600;
  return h === Math.floor(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

export function Today() {
  const qc = useQueryClient();
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
  // Local midnight of the viewed day, as Unix seconds. This is the single
  // source of truth for "what day are we showing" - backend filters with it,
  // so timezone never matters server-side. Selected day → its local midnight.
  const viewedDayStart = Math.floor(selectedDate.getTime() / 1000);

  const { data, error } = useQuery({
    queryKey: ['today', viewedDateStr],
    queryFn: () => api.today({ date: viewedDateStr, day_start: viewedDayStart }),
  });
  // Deep work data is now read inside <ActivityTracker />, kept the query
  // running for the rings to reflect totals.
  useQuery({
    queryKey: ['deep-work', 'today'],
    queryFn: api.deepWorkToday,
    refetchInterval: 30000,
  });

  const setTarget = useMutation({
    mutationFn: (seconds: number) => api.setDeepWorkTarget(seconds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  });

  if (error) {
    return <div className="empty">couldn't load today: {(error as Error).message}</div>;
  }

  const greeting = data?.greeting ?? greetingFromHour();
  const dateStr =
    data?.date ??
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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

  function editDeepWorkTarget() {
    const currentHours = rings.deep_work_target_seconds / 3600;
    const v = window.prompt(
      'daily deep-work target in hours (e.g. 2.5):',
      String(currentHours)
    );
    if (!v) return;
    const h = parseFloat(v);
    if (!Number.isFinite(h) || h <= 0) return;
    setTarget.mutate(Math.round(h * 3600));
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <header className="page-header">
          <span className="eyebrow">{dateStr}</span>
          <h1 className="h2">{greeting}</h1>
        </header>

        <DayToggle
          offset={dayOffset}
          date={selectedDate}
          today={today}
          onPrev={() => setSelectedDate((d) => addDays(d, -1))}
          onNext={() => setSelectedDate((d) => addDays(d, 1))}
          onPick={(d) => setSelectedDate(d)}
        />
      </div>

      <div
        className="today__rings"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-3)',
          justifyItems: 'center',
          alignItems: 'start',
          padding: 'var(--space-2) 0',
        }}
      >
        <Ring
          value={rings.focus_pct}
          label="focus"
          bigNumber={`${Math.round(rings.focus_pct * 100)}`}
          unit="%"
          subline={`${rings.focus_current} / ${rings.focus_target || '?'}`}
          size="hero"
          color="var(--recovery)"
        />
        <DeepWorkRing
          seconds={rings.deep_work_seconds}
          targetSeconds={rings.deep_work_target_seconds}
          onEditTarget={editDeepWorkTarget}
        />
        <Ring
          value={rings.strain_score / rings.strain_max}
          label="strain"
          bigNumber={rings.strain_score.toFixed(1)}
          size="hero"
          color="var(--strain)"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 'var(--space-3)',
          fontSize: 'var(--body-sm)',
          color: 'var(--muted)',
          padding: '0 var(--space-3)',
          textAlign: 'center',
        }}
      >
        <span>{rings.focus_target ? `${Math.round(rings.focus_pct * 100)}% toward goal` : 'no active goal'}</span>
        <span>{Math.round((rings.deep_work_seconds / Math.max(1, rings.deep_work_target_seconds)) * 100)}% toward today's focus</span>
        <span>{rings.tasks_done_today} task{rings.tasks_done_today === 1 ? '' : 's'} ticked today</span>
      </div>

      <ActivityTracker date={viewedDateStr} dayStart={viewedDayStart} isToday={isToday} />

      <LongGame topTasks={data?.top_tasks ?? []} />
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
    background: 'rgba(255,255,255,0.08)',
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
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 999,
          padding: 2,
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

  // Build cells - week starts Monday. Day-of-week: JS Sun=0..Sat=6, we want Mon=0..Sun=6.
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
// Deep Work ring with a small pencil-edit button overlay for the target.
// =========================================================================
function DeepWorkRing({
  seconds,
  targetSeconds,
  onEditTarget,
}: {
  seconds: number;
  targetSeconds: number;
  onEditTarget: () => void;
}) {
  const safeTarget = Math.max(1, targetSeconds);
  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Ring
        value={Math.min(1, seconds / safeTarget)}
        label="deep work"
        bigNumber={`${Math.round((seconds / safeTarget) * 100)}`}
        unit="%"
        subline={`${formatHours(seconds)} / ${formatHours(targetSeconds)}`}
        size="hero"
        color="var(--sleep)"
      />
      <button
        type="button"
        onClick={onEditTarget}
        title="edit daily target"
        aria-label="edit daily deep work target"
        style={{
          position: 'absolute',
          top: 4,
          right: 'calc(50% - 112px)', // align with the right edge of the 220px max-width ring
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'transparent',
          border: 'none',
          color: 'var(--ink)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        >
          <path d="M5 19h2.4l8.6-8.6-2.4-2.4L5 16.6V19zm14.7-12.3l-2.4-2.4a1 1 0 0 0-1.4 0l-1.9 1.9 3.8 3.8 1.9-1.9a1 1 0 0 0 0-1.4z" />
        </svg>
      </button>
    </div>
  );
}

// =========================================================================
// LongGame: where the focus is + how the bigger picture moves.
// Left half = the 3 main tasks for today. Right half = brand + offer dials.
// =========================================================================
// Stage-weighted scoring for a single pricing rung (focus offer). Mirrors the
// math in Offer.tsx so the Today + Focus pages show the SAME number for the
// focus offer that its overall-offer-score card shows.
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

function LongGame({ topTasks }: { topTasks: Task[] }) {
  const qc = useQueryClient();
  const { data: reputation } = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const { data: offer } = useQuery({ queryKey: ['offers'], queryFn: api.offers });

  // The "offer" dial reads the FOCUS (featured) offer's stage-weighted
  // overall score. Falls back to the legacy suite-wide overall_score only if
  // no rung is currently set as focus, so the dial is never blank.
  const pricingSection = offer?.sections?.find((s: any) => s.id === 'pricing');
  const focusRung = (pricingSection?.pricing_rungs ?? []).find((r: any) => r?.featured);
  const focusOfferScore = focusRung ? focusRungScore(focusRung) : (offer?.overall_score ?? 0);
  const focusOfferLabel = focusRung
    ? `focus offer · ${focusRung.name || 'unnamed'}`
    : 'no focus offer set';

  const toggleTask = useMutation({
    mutationFn: (vars: { id: string; status: Task['status'] }) =>
      api.updateTask(vars.id, { status: vars.status }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['today'] });
      const prev = qc.getQueryData<{ top_tasks: Task[] }>(['today']);
      if (prev) {
        qc.setQueryData(['today'], {
          ...prev,
          top_tasks: prev.top_tasks.map((t) =>
            t.id === vars.id ? { ...t, status: vars.status } : t
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['today'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['focus'] });
    },
  });

  function gotoProfile(tab: string) {
    const href = tab === 'reputation' ? '/profile/reputation' : '/profile/offer';
    window.history.pushState({}, '', href);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  const tasks = topTasks.slice(0, 3);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-4)',
        alignItems: 'stretch',
      }}
      className="long-game__pair"
    >
      {/* Section 1 - where the focus is */}
      <Card eyebrow="today" title="where the focus is" style={{ height: '100%' }}>
        {tasks.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted-2)', fontStyle: 'italic' }}>
            no tasks queued. add some in focus →
          </p>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              flex: 1,
            }}
          >
            {tasks.map((t, i) => {
              const done = t.status === 'completed';
              return (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'flex-start',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'background 0.15s',
                  }}
                  className="long-game__task-row"
                >
                  <button
                    type="button"
                    onClick={() =>
                      toggleTask.mutate({ id: t.id, status: done ? 'pending' : 'completed' })
                    }
                    aria-label={done ? 'mark task as not done' : 'mark task as done'}
                    title={done ? 'mark as not done' : 'mark as done'}
                    style={{
                      ...buttonReset,
                      width: 22,
                      height: 22,
                      minWidth: 22,
                      marginTop: 2,
                      borderRadius: '50%',
                      border: '1.5px solid var(--muted-2)',
                      background: done ? 'var(--recovery)' : 'transparent',
                      borderColor: done ? 'var(--recovery)' : 'var(--muted-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {done && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.2rem',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      minWidth: '1.2em',
                      lineHeight: 1.35,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: '1.05rem',
                        lineHeight: 1.35,
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'var(--muted)' : 'inherit',
                      }}
                    >
                      {t.title}
                    </span>
                    {(t.category || t.project_name) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.category && <span style={chipStyle}>{t.category}</span>}
                        {t.project_name && <span style={chipStyle}>{t.project_name}</span>}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* Section 2 - how the bigger picture moves */}
      <Card eyebrow="the long game" title="how the bigger picture moves" style={{ height: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-4)',
            alignItems: 'start',
            flex: 1,
          }}
          className="long-game__dials"
        >
          <button type="button" onClick={() => gotoProfile('reputation')} className="long-game__col" style={{ ...colStyle, ...buttonReset }}>
            <span className="eyebrow">reputation</span>
            <Ring
              value={(reputation?.overall_score ?? 0) / 100}
              label=""
              bigNumber={`${reputation?.overall_score ?? 0}`}
              unit="%"
              color="var(--strain)"
            />
            <span className="muted" style={subStyle}>value · authority · pov · connection</span>
          </button>

          <button type="button" onClick={() => gotoProfile('offer')} className="long-game__col" style={{ ...colStyle, ...buttonReset }}>
            <span className="eyebrow">offer</span>
            <Ring
              value={focusOfferScore / 100}
              label=""
              bigNumber={`${focusOfferScore}`}
              unit="%"
              color="var(--sleep)"
            />
            <span className="muted" style={subStyle}>{focusOfferLabel}</span>
          </button>
        </div>
      </Card>

      <style>{`
        @media (max-width: 880px) {
          .long-game__pair { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 560px) {
          .long-game__dials { grid-template-columns: 1fr !important; }
        }
        .long-game__col:hover { background: rgba(255,255,255,0.03); border-color: var(--hairline); }
        .long-game__task-row:hover { background: rgba(255,255,255,0.03); }
      `}</style>
    </div>
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

const chipStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--muted)',
  background: 'rgba(255,255,255,0.06)',
  padding: '3px 8px',
  borderRadius: 'var(--radius-pill)',
};

const subStyle: React.CSSProperties = {
  fontSize: 'var(--body-sm)',
  textAlign: 'center',
  maxWidth: 220,
  lineHeight: 1.4,
};
