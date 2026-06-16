// "Where the focus is" - the central card on the Today page.
//
// Replaces the old timer/activity tracker. No timing, no start button, no
// log of completed blocks. Just two stacked sections:
//   1. From your calendar - read-only events with their time + a join link
//   2. Today's tasks - tickable, with category color, inline-editable title
//      and category
//
// All rows share the same shape so the list reads as one unified set of
// "things to focus on today." The pop-out button opens a floating window
// (Document Picture-in-Picture) that mirrors the tasks so you can tick
// them off while working in another app.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CalendarEvent, Task } from '../api';
import { Card } from '../components/Card';
import { FloatingFocusButton } from '../components/FloatingTimer';

// Strain-weight order. The key 'operations' is kept for backend
// compatibility - displayed as 'calls'.
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  filming:    { label: 'filming',      color: 'var(--strain)'   },
  operations: { label: 'calls',        color: '#E6A52F'         },
  scripting:  { label: 'scripting',    color: '#A87BD9'         },
  building:   { label: 'building',     color: 'var(--recovery)' },
  admin:      { label: 'admin',        color: 'var(--muted)'    },
  other:      { label: 'other things', color: 'var(--muted-2)'  },
};

function fmtEventTime(ev: CalendarEvent): string {
  if (ev.all_day) return 'all day';
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${s.toLocaleTimeString('en-US', opts)} - ${e.toLocaleTimeString('en-US', opts)}`;
}

function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"]+/g, '')
    .replace(/\s*[·,;|-]\s*(?=[·,;|-]|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ActivityTracker({
  date,
  dayStart,
  isToday,
  tasks,
}: {
  date: string;
  dayStart: number;
  isToday: boolean;
  tasks: Task[];
}) {
  const qc = useQueryClient();
  const { data: calendar } = useQuery({
    queryKey: ['calendar-events', date],
    queryFn: () => api.calendarEvents({ date, day_start: dayStart }),
    staleTime: 60_000,
  });

  const updateTask = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof api.updateTask>[1] }) =>
      api.updateTask(vars.id, vars.patch),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['today'] });
      const prev = qc.getQueryData<{ top_tasks: Task[] }>(['today']);
      if (prev) {
        qc.setQueryData(['today'], {
          ...prev,
          top_tasks: prev.top_tasks.map((t) =>
            t.id === vars.id ? { ...t, ...(vars.patch as Partial<Task>) } : t
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

  const events = calendar?.events ?? [];
  const calendarConnected = calendar?.connected ?? false;
  const calendarConfigured = calendar?.configured ?? false;

  return (
    <Card
      eyebrow={isToday ? 'today' : 'focus'}
      title="where the focus is"
      action={<FloatingFocusButton tasks={tasks} />}
    >
      {/* Calendar events for the day - awareness only, not tickable. */}
      {events.length > 0 && (
        <div className="stack" style={{ gap: 0, marginBottom: 'var(--space-3)' }}>
          {events.map((ev) => (
            <EventRow key={ev.id} ev={ev} />
          ))}
        </div>
      )}
      {events.length === 0 && !calendarConnected && isToday && (
        <ConnectCalendarPrompt configured={calendarConfigured} />
      )}

      {/* Tasks - tickable, with editable name + category. */}
      {tasks.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--muted-2)', fontStyle: 'italic' }}>
          no tasks queued for today. add some in focus →
        </p>
      ) : (
        <div className="stack" style={{ gap: 0 }}>
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() =>
                updateTask.mutate({
                  id: t.id,
                  patch: { status: t.status === 'completed' ? 'pending' : 'completed' },
                })
              }
              onRename={(title) => updateTask.mutate({ id: t.id, patch: { title } })}
              onChangeCategory={(category) =>
                updateTask.mutate({ id: t.id, patch: { category: category as Task['category'] } })
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}

// =========================================================================
// Calendar event row - time chip on the left, title, optional "join" link.
// No checkbox - meetings aren't a tickable to-do. Category picker lets you
// retag the meeting (e.g. label a sales call as "calls" vs "other").
// =========================================================================
function EventRow({ ev }: { ev: CalendarEvent }) {
  // Default-categorise calendar events as "calls" - that's almost always
  // what they are. User can change via the category picker.
  const [category, setCategory] = useState<string>('operations');
  const meta = CATEGORY_META[category] ?? CATEGORY_META.other;
  const locClean = ev.location ? stripUrls(ev.location) : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <CategoryDot value={category} onChange={setCategory} />
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 'var(--body)' }}>{ev.title}</span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          {fmtEventTime(ev)}
          {locClean ? ` · ${locClean}` : ''}
        </span>
      </div>
      <span
        className="muted"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>
      {ev.conference_url && (
        <a
          href={ev.conference_url}
          target="_blank"
          rel="noreferrer"
          className="btn btn--ghost"
          style={{ flexShrink: 0 }}
        >
          join
        </a>
      )}
    </div>
  );
}

// =========================================================================
// Task row - checkbox, category color dot, click-to-edit title, category
// picker. No edit pencil, no timer icon, no × delete.
// =========================================================================
function TaskRow({
  task,
  onToggle,
  onRename,
  onChangeCategory,
}: {
  task: Task;
  onToggle: () => void;
  onRename: (title: string) => void;
  onChangeCategory: (category: string) => void;
}) {
  const cat = task.category ?? 'other';
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const done = task.status === 'completed';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function commit() {
    const next = draft.trim();
    if (!next || next === task.title) {
      setEditing(false);
      setDraft(task.title);
      return;
    }
    onRename(next);
    setEditing(false);
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? 'mark task as not done' : 'mark task as done'}
        title={done ? 'mark as not done' : 'mark as done'}
        style={{
          width: 22,
          height: 22,
          minWidth: 22,
          borderRadius: '50%',
          border: done ? 'none' : '1.5px solid var(--muted-2)',
          background: done ? 'var(--recovery)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.15s',
        }}
      >
        {done && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--bg)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <CategoryDot value={cat} onChange={onChangeCategory} />
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            style={{
              fontFamily: 'inherit',
              fontWeight: 500,
              fontSize: 'var(--body)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 8px',
              color: 'var(--ink)',
              width: '100%',
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(task.title);
              setEditing(true);
            }}
            title="click to rename"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              color: done ? 'var(--muted)' : 'inherit',
              textDecoration: done ? 'line-through' : 'none',
              fontWeight: 500,
              fontSize: 'var(--body)',
              cursor: 'text',
              font: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            {task.title}
          </button>
        )}
        {task.project_name && (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            {task.project_name}
          </span>
        )}
      </div>
      <span
        className="muted"
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>
    </div>
  );
}

// =========================================================================
// CategoryDot - a small colored circle. Click pops a category picker. Used
// on both task rows and event rows so the surface is consistent.
// =========================================================================
function CategoryDot({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
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
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: meta.color,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      />
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
                  <span className="muted" style={{ fontSize: 11 }}>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// "Run this prompt in Claude" panel for SS members who haven't connected
// their Google Calendar yet. Once configured, this is replaced by the
// native OAuth connect button.
// =========================================================================
const CONNECT_PROMPT = 'Connect my Google Calendar to the dashboard';

function ConnectCalendarPrompt({ configured }: { configured: boolean }) {
  if (!configured) return <ConnectViaClaudePanel />;
  return <ConnectViaOAuthButton />;
}

function ConnectViaClaudePanel() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(CONNECT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('copy this prompt:', CONNECT_PROMPT);
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
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
        connect google calendar so today's meetings show up here. run this prompt in claude inside this vault:
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 'var(--body-sm)',
        }}
      >
        <span style={{ flex: 1, color: 'var(--ink)' }}>{CONNECT_PROMPT}</span>
        <button type="button" className="btn btn--ghost" onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <span className="muted" style={{ fontSize: 11 }}>
        claude will guide you through a one-time google cloud console setup (~10 min) and wire up your own credentials. your tokens stay on this machine.
      </span>
    </div>
  );
}

function ConnectViaOAuthButton() {
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
        google credentials are configured. grant access to surface today's meetings.
      </span>
      <button type="button" className="btn" disabled={pending} onClick={connect}>
        {pending ? 'opening google' : 'connect calendar'}
      </button>
    </div>
  );
}

// Re-export for FloatingTimer (and any other consumer that wants the same
// category color/label map without re-declaring it).
export { CATEGORY_META };