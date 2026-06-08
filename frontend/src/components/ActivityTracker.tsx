import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CalendarEvent, DeepWorkBlock, PickableTask, TickedTask } from '../api';
import { Card } from '../components/Card';

// Whoop-style activity tracker. Replaces the "deep work" card on Today.
// One running timer at the top (active block). Below: today's completed
// activities (block + linked task name + duration). Below that: start
// activity picker (filter by category, pick a task → starts timer).

// Listed in strain-weight order (highest first) so the picker reflects
// the ranking. Key 'operations' stays for backend compatibility - we just
// display it as 'calls'.
const CATEGORY_META: Record<string, { label: string; color: string; icon: string }> = {
  filming:    { label: 'filming',      color: 'var(--strain)',   icon: '●' },
  operations: { label: 'calls',        color: '#E6A52F',          icon: '●' },
  scripting:  { label: 'scripting',    color: '#A87BD9',          icon: '●' },
  building:   { label: 'building',     color: 'var(--recovery)',  icon: '●' },
  admin:      { label: 'admin',        color: 'var(--muted)',     icon: '●' },
  other:      { label: 'other things', color: 'var(--muted-2)',   icon: '●' },
};

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

function LiveTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - startedAt);
  const hh = Math.floor(elapsed / 3600);
  const mm = Math.floor((elapsed % 3600) / 60);
  const ss = elapsed % 60;
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 'clamp(2rem, 9vw, 3rem)',
        letterSpacing: '-0.04em',
        color: 'var(--sleep)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {hh > 0 ? `${hh}:` : ''}
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </span>
  );
}

export function ActivityTracker({
  date,
  dayStart,
  isToday,
}: {
  date: string;
  dayStart: number;
  isToday: boolean;
}) {
  const qc = useQueryClient();
  const { data: dw } = useQuery({
    queryKey: ['deep-work', date],
    queryFn: () => api.deepWorkToday({ date, day_start: dayStart }),
    refetchInterval: isToday ? 30000 : false,
  });
  const { data: calendar } = useQuery({
    queryKey: ['calendar-events', date],
    queryFn: () => api.calendarEvents({ date, day_start: dayStart }),
    staleTime: 60_000,
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  // Helper: apply an optimistic update to BOTH cache keys that hold this data
  // (ActivityTracker uses ['deep-work', date]; Today.tsx uses ['deep-work', 'today']).
  // Updating only one leaves the Today page rendering stale "active" state.
  const updateDeepWorkCaches = (updater: (prev: any) => any) => {
    qc.setQueryData(['deep-work', date], updater);
    qc.setQueryData(['deep-work', 'today'], updater);
  };

  const start = useMutation({
    mutationFn: (input: { task_id?: string; label?: string; category?: string }) =>
      api.startDeepWork(input),
    onSuccess: (newBlock) => {
      // Optimistically inject the new block as active in BOTH caches so the
      // timer shows up immediately on Today AND in the ActivityTracker.
      updateDeepWorkCaches((prev: any) => {
        if (!prev) return prev;
        return { ...prev, active: newBlock };
      });
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setPickerOpen(false);
    },
  });
  const finish = useMutation({
    mutationFn: (id: string) => api.finishDeepWork(id),
    onSuccess: (finishedBlock) => {
      // Clear active + add the finished block to the completed list, in BOTH caches.
      updateDeepWorkCaches((prev: any) => {
        if (!prev) return prev;
        const items = Array.isArray(prev.items) ? prev.items : [];
        const next = items.some((x: any) => x.id === finishedBlock.id)
          ? items.map((x: any) => (x.id === finishedBlock.id ? finishedBlock : x))
          : [finishedBlock, ...items];
        return { ...prev, active: null, items: next };
      });
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteDeepWork(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
  const edit = useMutation({
    mutationFn: (vars: { id: string; started_at: number; ended_at: number | null; category?: string }) =>
      api.updateDeepWork(vars.id, {
        started_at: vars.started_at,
        ended_at: vars.ended_at,
        category: vars.category,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
  const editTask = useMutation({
    mutationFn: (vars: { id: string; patch: { category?: string; status?: 'pending' } }) =>
      // category is a strict union on Task but the backend accepts any string
      // and re-validates; cast to keep the call site simple.
      api.updateTask(vars.id, vars.patch as Parameters<typeof api.updateTask>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });
  // When a ticked task gets a duration, we log it as a deep-work block linked
  // to the task. The de-dup logic then drops the bare tick and shows the block
  // row instead (with edit + delete on the block).
  const logForTask = useMutation({
    mutationFn: (vars: { task_id: string; started_at: number; ended_at: number }) =>
      api.logDeepWork(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deep-work'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  const active: DeepWorkBlock | null = dw?.active ?? null;
  const completed = (dw?.items ?? []).filter((b) => b.ended_at != null);
  const tickedTasks = dw?.ticked_tasks ?? [];
  // Drop ticked tasks that already have a deep-work block on the same day -
  // the block row already represents that work, no need to double-list.
  const blockTaskIds = new Set(completed.map((b) => b.task_id).filter(Boolean));
  const standaloneTicks = tickedTasks.filter((t) => !blockTaskIds.has(t.id));
  const hasAnyActivity = completed.length > 0 || standaloneTicks.length > 0;
  const events = calendar?.events ?? [];
  const calendarConnected = calendar?.connected ?? false;

  const showStartCta = isToday && !active && !pickerOpen;
  const totalActivities = completed.length + standaloneTicks.length;

  return (
    <Card
      eyebrow={isToday ? "today's activities" : 'activities'}
      title={active ? 'in flow' : `${totalActivities} ${totalActivities === 1 ? 'activity' : 'activities'} so far`}
    >
      {/* Calendar events for the day */}
      {events.length > 0 && (
        <CalendarEventList
          events={events}
          canStart={isToday && !active}
          onStart={(ev) =>
            start.mutate({ label: ev.title, category: 'other' })
          }
          starting={start.isPending}
        />
      )}
      {events.length === 0 && !calendarConnected && isToday && (
        <ConnectCalendarPrompt />
      )}

      {/* Active block timer */}
      {active && (
        <ActiveBlock
          block={active}
          onFinish={() => finish.mutate(active.id)}
          finishing={finish.isPending}
          onEdit={(patch) => edit.mutate({ id: active.id, ...patch })}
          saving={edit.isPending}
        />
      )}

      {/* Completed activities log (blocks + ticked tasks) */}
      {hasAnyActivity && (
        <div
          className="stack"
          style={{
            gap: 0,
            marginTop: active ? 'var(--space-4)' : 0,
            paddingTop: active ? 'var(--space-3)' : 0,
            borderTop: active ? '1px solid var(--hairline)' : 'none',
          }}
        >
          {completed.map((b) => (
            <ActivityRow
              key={b.id}
              block={b}
              onDelete={() => del.mutate(b.id)}
              onEdit={(patch) => edit.mutate({ id: b.id, ...patch })}
              saving={edit.isPending}
            />
          ))}
          {standaloneTicks.map((t) => (
            <TickedTaskRow
              key={`tick-${t.id}`}
              task={t}
              onChangeCategory={(category) =>
                editTask.mutate({ id: t.id, patch: { category } })
              }
              onLogDuration={(started_at, ended_at) =>
                logForTask.mutate({ task_id: t.id, started_at, ended_at })
              }
              onUntick={() => editTask.mutate({ id: t.id, patch: { status: 'pending' } })}
              saving={editTask.isPending || logForTask.isPending}
            />
          ))}
        </div>
      )}

      {/* Bottom action area: start button OR inline task picker. */}
      {!active && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {pickerOpen ? (
            <TaskPicker
              onCancel={() => setPickerOpen(false)}
              onPick={(p) =>
                start.mutate({ task_id: p.id, label: p.title, category: p.category ?? undefined })
              }
              onPickFreeform={(label) =>
                start.mutate({ label: label || 'focus block', category: 'other' })
              }
              starting={start.isPending}
            />
          ) : showStartCta ? (
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setPickerOpen(true)}
              >
                + start activity
              </button>
              {totalActivities === 0 && (
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  pick a task to time-box. it stays in your list until you tick it.
                </span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function ActiveBlock({
  block,
  onFinish,
  finishing,
  onEdit,
  saving,
}: {
  block: DeepWorkBlock;
  onFinish: () => void;
  finishing: boolean;
  onEdit: (patch: { started_at: number; ended_at: number | null; category?: string }) => void;
  saving: boolean;
}) {
  const cat = block.category ?? 'other';
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const [editing, setEditing] = useState(false);
  const [startStr, setStartStr] = useState(toLocalInput(block.started_at));
  const [endStr, setEndStr] = useState('');

  function openEdit() {
    setStartStr(toLocalInput(block.started_at));
    setEndStr('');
    setEditing(true);
  }
  function save() {
    const started_at = fromLocalInput(startStr);
    const ended_at = endStr ? fromLocalInput(endStr) : null;
    if (!Number.isFinite(started_at)) return;
    if (ended_at !== null && ended_at < started_at) {
      window.alert('end time must be after start time');
      return;
    }
    onEdit({ started_at, ended_at });
    setEditing(false);
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'rgba(157,183,209,0.06)',
        border: '1px solid rgba(157,183,209,0.18)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <CategoryPickerButton
        value={cat}
        onChange={(category) =>
          onEdit({ started_at: block.started_at, ended_at: block.ended_at, category })
        }
      />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow" style={{ color: meta.color }}>
            {meta.label}
          </span>
          <LiveTimer startedAt={block.started_at} />
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {block.task_title ?? block.label ?? 'focus block'} · started {fmtTime(block.started_at)}
          </span>
          {editing && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'center',
                flexWrap: 'wrap',
                marginTop: 'var(--space-2)',
                fontSize: 'var(--body-sm)',
              }}
            >
              <label className="muted" style={{ fontSize: 'var(--body-sm)' }}>start</label>
              <input
                type="datetime-local"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                style={editInputStyle}
              />
              <label className="muted" style={{ fontSize: 'var(--body-sm)' }}>finish (optional)</label>
              <input
                type="datetime-local"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                style={editInputStyle}
              />
            </div>
          )}
        </div>
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>
            {saving ? 'saving' : 'save'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
            cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn--ghost" onClick={openEdit} title="edit times">
            edit
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onFinish}
            disabled={finishing}
          >
            {finishing ? 'finishing' : 'finish activity'}
          </button>
        </div>
      )}
    </div>
  );
}

function toLocalInput(unix: number): string {
  // <input type="datetime-local"> wants local time in YYYY-MM-DDTHH:mm
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): number {
  return Math.floor(new Date(s).getTime() / 1000);
}

function ActivityRow({
  block,
  onDelete,
  onEdit,
  saving,
}: {
  block: DeepWorkBlock;
  onDelete: () => void;
  onEdit: (patch: { started_at: number; ended_at: number | null; category?: string }) => void;
  saving: boolean;
}) {
  const cat = block.category ?? 'other';
  const title = block.task_title ?? block.label ?? 'focus block';
  const [editing, setEditing] = useState(false);
  const [startStr, setStartStr] = useState(toLocalInput(block.started_at));
  const [endStr, setEndStr] = useState(
    block.ended_at ? toLocalInput(block.ended_at) : ''
  );

  function openEdit() {
    setStartStr(toLocalInput(block.started_at));
    setEndStr(block.ended_at ? toLocalInput(block.ended_at) : '');
    setEditing(true);
  }

  function save() {
    const started_at = fromLocalInput(startStr);
    const ended_at = endStr ? fromLocalInput(endStr) : null;
    if (!Number.isFinite(started_at)) return;
    if (ended_at !== null && ended_at < started_at) {
      window.alert('end time must be after start time');
      return;
    }
    onEdit({ started_at, ended_at });
    setEditing(false);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: editing ? 'flex-start' : 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
        flexWrap: editing ? 'wrap' : 'nowrap',
      }}
    >
      <CategoryPickerButton
        value={cat}
        onChange={(category) =>
          onEdit({ started_at: block.started_at, ended_at: block.ended_at, category })
        }
      />
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 500,
            fontSize: 'var(--body)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {editing ? (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 'var(--body-sm)',
            }}
          >
            <input
              type="datetime-local"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              style={editInputStyle}
            />
            <span className="muted">→</span>
            <input
              type="datetime-local"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              style={editInputStyle}
            />
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {fmtTime(block.started_at)} → {block.ended_at ? fmtTime(block.ended_at) : '…'}
          </span>
        )}
      </div>
      {!editing && (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--body-lg)',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {fmtDuration(block.duration_sec ?? 0)}
        </span>
      )}
      {editing ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="button" className="btn" disabled={saving} onClick={save}>
            {saving ? 'saving' : 'save'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setEditing(false)}
          >
            cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openEdit}
            title="edit times"
            style={iconBtnStyle}
            aria-label="edit times"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="delete this activity"
            style={iconBtnStyle}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

const editInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--hairline)',
  background: 'transparent',
  color: 'var(--ink)',
  fontSize: 'var(--body-sm)',
  fontFamily: 'inherit',
  colorScheme: 'dark',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--muted-2)',
  cursor: 'pointer',
  fontSize: 'var(--body)',
  padding: '4px 8px',
};

function TaskPicker({
  onCancel,
  onPick,
  onPickFreeform,
  starting,
}: {
  onCancel: () => void;
  onPick: (task: PickableTask) => void;
  onPickFreeform: (label: string) => void;
  starting: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['pickable-tasks'],
    queryFn: api.pickableTasks,
  });
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const all = data?.items ?? [];
  const counts: Record<string, number> = {};
  for (const t of all) {
    const c = t.category ?? 'other';
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const filtered = all
    .filter((t) => filter === 'all' || (t.category ?? 'other') === filter)
    .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()));

  const categories = ['all', 'filming', 'scripting', 'building', 'operations', 'admin', 'other'];

  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {categories.map((c) => {
          const meta = c === 'all' ? null : CATEGORY_META[c];
          const active = filter === c;
          const count = c === 'all' ? all.length : counts[c] ?? 0;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--hairline)',
                background: active ? meta?.color ?? 'var(--ink)' : 'transparent',
                color: active ? 'var(--bg)' : 'var(--muted)',
                fontSize: 'var(--body-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {c} <span style={{ opacity: 0.6, marginLeft: 4 }}>{count}</span>
            </button>
          );
        })}
      </div>
      <input
        type="text"
        placeholder="search tasks..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline)',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: 'var(--body)',
          width: '100%',
        }}
      />
      {isLoading ? (
        <div className="empty">loading tasks</div>
      ) : filtered.length === 0 ? (
        <FreeformStart onStart={onPickFreeform} starting={starting} onCancel={onCancel} />
      ) : (
        <>
          <div className="stack" style={{ gap: 0, maxHeight: 320, overflowY: 'auto' }}>
            {filtered.slice(0, 40).map((t) => {
              const meta = CATEGORY_META[t.category ?? 'other'] ?? CATEGORY_META.other;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={starting}
                  onClick={() => onPick(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    borderBottom: '1px solid var(--hairline)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: meta.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 'var(--body)' }}>{t.title}</span>
                  <span
                    className="muted"
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              cancel
            </button>
            <FreeformStart onStart={onPickFreeform} starting={starting} compact />
          </div>
        </>
      )}
    </div>
  );
}

function FreeformStart({
  onStart,
  starting,
  onCancel,
  compact,
}: {
  onStart: (label: string) => void;
  starting: boolean;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [label, setLabel] = useState('');
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: compact ? 0 : 'var(--space-3)',
      }}
    >
      <input
        type="text"
        placeholder="or label a free-form block..."
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{
          flex: 1,
          minWidth: 180,
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline)',
          background: 'transparent',
          color: 'var(--ink)',
          fontSize: 'var(--body-sm)',
        }}
      />
      <button
        type="button"
        className="btn"
        disabled={starting}
        onClick={() => onStart(label.trim() || 'focus block')}
      >
        {starting ? 'starting' : 'start free-form'}
      </button>
      {onCancel && !compact && (
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          cancel
        </button>
      )}
    </div>
  );
}

function fmtEventTime(ev: CalendarEvent): string {
  if (ev.all_day) return 'all day';
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${s.toLocaleTimeString('en-US', opts)} - ${e.toLocaleTimeString('en-US', opts)}`;
}

// Strip URLs out of the location text since the "join" button now carries
// the link. Tidies up commas/dashes left dangling around the removed URL.
function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"]+/g, '')
    .replace(/\s*[·,;|-]\s*(?=[·,;|-]|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function CalendarEventList({
  events,
  canStart,
  onStart,
  starting,
}: {
  events: CalendarEvent[];
  canStart: boolean;
  onStart: (e: CalendarEvent) => void;
  starting: boolean;
}) {
  return (
    <div className="stack" style={{ gap: 0, marginBottom: 'var(--space-3)' }}>
      <div
        className="eyebrow"
        style={{ marginBottom: 'var(--space-2)', color: 'var(--muted)' }}
      >
        from your calendar
      </div>
      {events.map((ev) => (
        <div
          key={ev.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500, fontSize: 'var(--body)' }}>
              {ev.title}
            </span>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              {fmtEventTime(ev)}
              {ev.location && stripUrls(ev.location) ? ` · ${stripUrls(ev.location)}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
            {ev.conference_url && (
              <a
                href={ev.conference_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn--ghost"
                onClick={(e) => e.stopPropagation()}
              >
                join
              </a>
            )}
            {canStart && (
              <button
                type="button"
                className="btn"
                disabled={starting}
                onClick={() => onStart(ev)}
              >
                start
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectCalendarPrompt() {
  const [pending, setPending] = useState(false);
  async function connect() {
    setPending(true);
    try {
      const { url } = await api.googleConnectUrl();
      window.location.href = url;
    } catch (err) {
      setPending(false);
      window.alert(`could not start connect flow: ${(err as Error).message}`);
    }
  }
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        border: '1px dashed var(--hairline)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
        connect google calendar to surface today's meetings as activities
      </span>
      <button type="button" className="btn" disabled={pending} onClick={connect}>
        {pending ? 'opening google' : 'connect calendar'}
      </button>
    </div>
  );
}

// Click the colored letter square → pop a row of category swatches.
// Replaces the dropdown for a cleaner feel.
function CategoryPickerButton({
  value,
  onChange,
  size = 40,
}: {
  value: string;
  onChange: (v: string) => void;
  size?: number;
}) {
  const meta = CATEGORY_META[value] ?? CATEGORY_META.other;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`category: ${meta.label} (click to change)`}
        title={`${meta.label} · click to change`}
        style={{
          width: size,
          height: size,
          borderRadius: 'var(--radius-md)',
          background: meta.color,
          color: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: size <= 28 ? 11 : 'var(--body-sm)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {meta.label.charAt(0)}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="pick a category"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            padding: 4,
            minWidth: 160,
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
          }}
        >
          {Object.keys(CATEGORY_META).map((k) => {
            const m = CATEGORY_META[k]!;
            const selected = k === value;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                aria-label={m.label}
                aria-current={selected ? 'true' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: '8px 10px',
                  background: selected ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--ink)',
                  fontSize: 'var(--body-sm)',
                  textAlign: 'left',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    selected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    selected ? 'rgba(255,255,255,0.05)' : 'transparent';
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: m.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{m.label}</span>
                {selected && (
                  <span className="muted" style={{ fontSize: 11 }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TickedTaskRow({
  task,
  onChangeCategory,
  onLogDuration,
  onUntick,
  saving,
}: {
  task: TickedTask;
  onChangeCategory: (category: string) => void;
  onLogDuration: (started_at: number, ended_at: number) => void;
  onUntick: () => void;
  saving: boolean;
}) {
  const cat = task.category ?? "other";
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const [editing, setEditing] = useState(false);
  // Default to "the last hour", which is a reasonable guess for "I just
  // forgot to start the timer". User edits both ends from there.
  const defaultEnd = Math.floor(Date.now() / 1000);
  const [startStr, setStartStr] = useState(toLocalInput(defaultEnd - 3600));
  const [endStr, setEndStr] = useState(toLocalInput(defaultEnd));

  function openEdit() {
    const now = Math.floor(Date.now() / 1000);
    setStartStr(toLocalInput(now - 3600));
    setEndStr(toLocalInput(now));
    setEditing(true);
  }

  function save() {
    const started_at = fromLocalInput(startStr);
    const ended_at = fromLocalInput(endStr);
    if (!Number.isFinite(started_at) || !Number.isFinite(ended_at)) return;
    if (ended_at < started_at) {
      window.alert('end time must be after start time');
      return;
    }
    onLogDuration(started_at, ended_at);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: editing ? 'flex-start' : 'center',
        gap: "var(--space-3)",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--hairline)",
        flexWrap: editing ? 'wrap' : 'nowrap',
      }}
    >
      <CategoryPickerButton value={cat} onChange={onChangeCategory} />
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 500,
            fontSize: "var(--body)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {task.title}
        </span>
        {editing ? (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 'var(--body-sm)',
            }}
          >
            <input
              type="datetime-local"
              value={startStr}
              onChange={(e) => setStartStr(e.target.value)}
              style={editInputStyle}
            />
            <span className="muted">→</span>
            <input
              type="datetime-local"
              value={endStr}
              onChange={(e) => setEndStr(e.target.value)}
              style={editInputStyle}
            />
          </div>
        ) : (
          <span className="muted" style={{ fontSize: "var(--body-sm)" }}>
            ticked · {meta.label}
          </span>
        )}
      </div>
      {!editing && (
        <span
          className="muted"
          style={{
            fontSize: "var(--body-sm)",
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {fmtTime(task.completed_at)}
        </span>
      )}
      {editing ? (
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button type="button" className="btn" disabled={saving} onClick={save}>
            {saving ? 'saving' : 'log time'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
            cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={openEdit}
            title="add a duration for this task"
            aria-label="edit times"
            style={iconBtnStyle}
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onUntick}
            disabled={saving}
            title="un-tick (return to pending)"
            aria-label="un-tick task"
            style={iconBtnStyle}
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
