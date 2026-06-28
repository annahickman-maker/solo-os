import { useEffect, useRef, useState } from 'react';
import type { Task, TaskCategory, TaskEnergy } from '../api';
import { StatusPill } from './StatusPill';
import { formatShortDate } from '../lib/format';

// One entry in the project/client picker - a project OR a client (we treat
// them as the same field on the task: a task is either tied to one or
// neither, never both).
export type ProjectOption = { id: string; name: string; kind: 'project' | 'client' };

interface TaskRowProps {
  task: Task;
  onToggle?: (next: Task['status']) => void;
  // Kept for backward compat; energy toggle removed from the UI.
  onSetEnergy?: (next: TaskEnergy) => void;
  onEditTitle?: (next: string) => void;
  onCycleCategory?: (next: TaskCategory) => void;
  onSetProject?: (next: string | null) => void;
  onDelete?: () => void;
  // Kept for backward compat; category pill now always shows when editable.
  showCategory?: boolean;
  compact?: boolean;
  projectOptions?: ProjectOption[];
  // When true, the row gets a full border outline (master to-do, client
  // project tasks) so each task stands out instead of just a bottom rule.
  outlined?: boolean;
}

// Categories listed highest-strain-first, matching the activity-tracker picker.
const CATEGORY_OPTIONS: TaskCategory[] = ['filming', 'operations', 'scripting', 'building', 'admin', 'other'];

// CATEGORY_TONE used to power StatusPill colors but was lossy (4 of 6
// categories all collapsed to "default" grey). Replaced by CategoryPill
// + CATEGORY_DOT below so every category gets its own distinct color
// matching the Focus page's WeekPlanner cards.

// Display labels for category keys. Keys stay stable in storage; we just
// render them as "calls" / "other things" everywhere the user sees them.
const CATEGORY_LABEL: Record<string, string> = {
  operations: 'calls',
  other: 'other things',
};

const CATEGORY_DOT: Record<string, string> = {
  filming: 'var(--strain)',
  operations: '#E6A52F',
  scripting: '#A87BD9',
  building: 'var(--recovery)',
  admin: 'var(--muted)',
  other: 'var(--muted-2)',
};

// Pill that takes a direct color instead of going through StatusPill's
// generic tone keywords. Used for category tags so every category gets
// its own distinct color (matching the per-category palette used by the
// Focus page's WeekPlanner cards). Same shape as StatusPill - just
// colored from CATEGORY_DOT.
function CategoryPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill)',
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        fontSize: '0.6875rem',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: TaskCategory;
  onChange: (next: TaskCategory) => void;
}) {
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
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`change category, current ${value}`}
        aria-expanded={open}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
        title="click to change category"
      >
        <CategoryPill
          label={CATEGORY_LABEL[value] ?? value}
          color={CATEGORY_DOT[value] ?? 'var(--muted-2)'}
        />
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
          {CATEGORY_OPTIONS.map((k) => {
            const selected = k === value;
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
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
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: CATEGORY_DOT[k] ?? 'var(--muted-2)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{CATEGORY_LABEL[k] ?? k}</span>
                {selected && <span className="muted" style={{ fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Project/client picker - same popover pattern, flat list of all projects +
// clients with a "no project" option at the top. When the task already has
// a project_name but the id isn't in `options` (e.g. options not loaded yet),
// fall back to the cached name so the pill doesn't blank out mid-edit.
function ProjectPicker({
  value,
  currentName,
  currentKind,
  options,
  onChange,
}: {
  value: string | null;
  currentName: string | null;
  currentKind: 'project' | 'client' | null;
  options: ProjectOption[];
  onChange: (id: string | null) => void;
}) {
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

  const matched = options.find((o) => o.id === value);
  const displayName = matched?.name ?? currentName ?? null;
  const kind = matched?.kind ?? currentKind ?? null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={value ? `change project, current ${displayName}` : 'add to a project or client'}
        aria-expanded={open}
        title={value ? 'click to change project / client' : 'click to add to a project or client'}
        style={{
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        {displayName ? (
          <StatusPill status={displayName} tone={kind === 'client' ? 'default' : 'accent'} />
        ) : (
          <span
            style={{
              fontSize: 'var(--eyebrow)',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              borderBottom: '1px dotted var(--hairline)',
            }}
          >
            + project / client
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="pick a project or client"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            padding: 4,
            minWidth: 220,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
          }}
        >
          <PickerRow
            label="no project"
            selected={value == null}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            italic
          />
          {options.length > 0 && (
            <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />
          )}
          {options.map((o) => (
            <PickerRow
              key={o.id}
              label={o.name}
              hint={o.kind === 'client' ? 'client' : 'project'}
              selected={o.id === value}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PickerRow({
  label,
  hint,
  selected,
  italic,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  italic?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        fontStyle: italic ? 'italic' : 'normal',
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {hint && (
        <span className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {hint}
        </span>
      )}
      {selected && <span className="muted" style={{ fontSize: 11 }}>✓</span>}
    </button>
  );
}

export function TaskRow({ task, onToggle, onSetEnergy: _onSetEnergy, onEditTitle, onCycleCategory, onSetProject, onDelete, showCategory: _showCategory = true, compact = false, projectOptions = [], outlined = false }: TaskRowProps) {
  const completed = task.status === 'completed';
  const next = completed ? 'pending' : 'completed';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(task.title);
  }, [task.title]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title && onEditTitle) {
      onEditTitle(trimmed);
    } else {
      setDraft(task.title);
    }
    setEditing(false);
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-4)',
        padding: outlined
          ? compact
            ? 'var(--space-2) var(--space-3)'
            : 'var(--space-3) var(--space-4)'
          : compact
            ? 'var(--space-2) 0'
            : 'var(--space-3) 0',
        position: 'relative',
        ...(outlined
          ? {
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-2)',
            }
          : { borderBottom: '1px solid var(--hairline)' }),
      }}
    >
      <button
        type="button"
        onClick={() => onToggle?.(next)}
        aria-label={completed ? 'mark task pending' : 'mark task complete'}
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          border: `1.5px solid ${completed ? 'var(--accent)' : 'var(--muted-2)'}`,
          background: completed ? 'var(--accent)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
          cursor: 'pointer',
          transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
        }}
      >
        {completed && (
          <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 6.25 5 8.75 9.5 3.5"
              fill="none"
              stroke="var(--bg)"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {editing && onEditTitle ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                setDraft(task.title);
                setEditing(false);
              }
            }}
            rows={1}
            style={{
              width: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink)',
              padding: '6px 8px',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--body)',
              lineHeight: 1.4,
              resize: 'none',
              outline: 'none',
              minHeight: 28,
            }}
          />
        ) : (
          <span
            onClick={() => onEditTitle && setEditing(true)}
            style={{
              fontSize: 'var(--body)',
              lineHeight: 1.4,
              color: completed ? 'var(--muted)' : 'var(--ink)',
              textDecorationLine: completed ? 'line-through' : 'none',
              textDecorationColor: 'rgba(255,255,255,0.3)',
              wordBreak: 'break-word',
              cursor: onEditTitle ? 'text' : 'default',
            }}
          >
            {task.title}
          </span>
        )}
        {(onCycleCategory || task.due_date) && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {onSetProject ? (
              <ProjectPicker
                value={task.project_id ?? null}
                currentName={task.project_name ?? null}
                currentKind={task.project_kind ?? null}
                options={projectOptions}
                onChange={onSetProject}
              />
            ) : (
              task.project_name && (
                <StatusPill
                  status={task.project_name}
                  tone={task.project_kind === 'client' ? 'default' : 'accent'}
                />
              )
            )}
            {onCycleCategory ? (
              <CategoryPicker value={task.category} onChange={onCycleCategory} />
            ) : (
              <CategoryPill
                label={CATEGORY_LABEL[task.category] ?? task.category}
                color={CATEGORY_DOT[task.category] ?? 'var(--muted-2)'}
              />
            )}
            {task.due_date && (
              <span
                style={{
                  fontSize: 'var(--body-sm)',
                  color: 'var(--muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatShortDate(task.due_date)}
              </span>
            )}
          </div>
        )}
      </div>
      {onDelete && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete task "${task.title.slice(0, 80)}"?\n\nThis blocks the vault sync from bringing it back.`)) {
              onDelete();
            }
          }}
          aria-label="delete task"
          title="delete (and tombstone so sync can't bring it back)"
          style={{
            opacity: hovered ? 0.7 : 0,
            transition: 'opacity 0.15s',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 16,
            padding: '2px 6px',
            lineHeight: 1,
            flexShrink: 0,
            alignSelf: 'flex-start',
            marginTop: 2,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff6b6b')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--muted)')}
        >
          ✕
        </button>
      )}
    </div>
  );
}
