/**
 * Reusable month-grid date picker popover. Same visual language as the
 * DatePopover on the Today page (Mon-first week, circular day cells, today
 * outlined, selected filled).
 *
 * Position is `absolute` - render inside a parent with `position: relative`.
 * Closes on outside click (handled by parent) or Escape.
 */

import { useEffect, useRef, useState } from 'react';

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Chevron({ dir, size = 14 }: { dir: 'left' | 'right'; size?: number }) {
  const d = dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

interface DatePickerPopoverProps {
  selected: Date | null;
  onPick: (d: Date) => void;
  onClose: () => void;
  // Anchor position - default centered below trigger.
  align?: 'left' | 'center' | 'right';
}

export function DatePickerPopover({ selected, onPick, onClose, align = 'center' }: DatePickerPopoverProps) {
  const today = new Date();
  const initial = selected ?? today;
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = new Date(initial);
    d.setUTCDate(1);
    return d;
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape to close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const year = viewMonth.getUTCFullYear();
  const month = viewMonth.getUTCMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const firstDow = (firstOfMonth.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(Date.UTC(year, month, day)));

  const todayKey = ymd(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  const selectedKey = selected ? ymd(new Date(Date.UTC(selected.getFullYear(), selected.getMonth(), selected.getDate()))) : null;

  function shiftMonth(delta: number) {
    setViewMonth(new Date(Date.UTC(year, month + delta, 1)));
  }

  const dows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const chevStyle: React.CSSProperties = {
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

  const positionStyle: React.CSSProperties =
    align === 'left'
      ? { left: 0 }
      : align === 'right'
        ? { right: 0 }
        : { left: '50%', transform: 'translateX(-50%)' };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="pick a date"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        zIndex: 50,
        background: 'var(--bg)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        minWidth: 320,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        ...positionStyle,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="previous month" style={chevStyle}>
          <Chevron dir="left" />
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '0.08em' }}>{monthLabel} {year}</span>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="next month" style={chevStyle}>
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
              onClick={() => {
                // Build a LOCAL Date for the picked day (UTC-built `c` could
                // shift by one in negative UTC offsets if used as-is).
                const local = new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), 12, 0, 0);
                onPick(local);
              }}
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
