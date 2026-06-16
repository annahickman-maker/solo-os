import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, deckEditorUrl } from '../api';
import type { SSModule, Task, TaskCategory, TaskEnergy, DeckEntry } from '../api';
import { TaskRow } from './TaskRow';

interface ModuleDetailProps {
  moduleId: string | null;
  onClose: () => void;
}

const STAGES: { status: SSModule['status']; label: string }[] = [
  { status: 'planned', label: 'planned' },
  { status: 'in_progress', label: 'in progress' },
  { status: 'live', label: 'live' },
];

const CATEGORIES: TaskCategory[] = ['filming', 'scripting', 'building', 'operations', 'admin', 'other'];

export function ModuleDetail({ moduleId, onClose }: ModuleDetailProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ss-module', moduleId],
    queryFn: () => api.getSSModule(moduleId as string),
    enabled: !!moduleId,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<TaskCategory>('other');
  const [dirty, setDirty] = useState(false);
  // Tab inside the client panel: existing tasks view vs the new content
  // (decks/funnels/links) view. Only meaningful when kind === 'client';
  // projects always show tasks.
  const [panelTab, setPanelTab] = useState<'tasks' | 'content'>('tasks');

  // Only initialize local form state from the server ONCE per moduleId. Stage
  // clicks and other mutations invalidate the module query, which would
  // otherwise overwrite in-progress name/description edits on every refetch.
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (data && initializedFor.current !== moduleId) {
      setName(data.name);
      setDescription(data.description ?? '');
      setDirty(false);
      initializedFor.current = moduleId as string;
    }
  }, [data, moduleId]);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['ss-module', moduleId] });
    qc.invalidateQueries({ queryKey: ['focus'] });
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
  }

  const save = useMutation({
    mutationFn: (body: any) => api.updateSSModule(moduleId as string, body),
    onSuccess: () => {
      invalidate();
      setDirty(false);
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: SSModule['status']) =>
      api.updateSSModule(moduleId as string, { status }),
    onMutate: (status) => {
      qc.setQueryData<any>(['ss-module', moduleId], (prev: any) =>
        prev ? { ...prev, status } : prev
      );
    },
    onSettled: () => invalidate(),
  });

  const archiveModule = useMutation({
    mutationFn: () => api.updateSSModule(moduleId as string, { archived: true }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const deleteModule = useMutation({
    mutationFn: () => api.deleteSSModule(moduleId as string),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const createTask = useMutation({
    mutationFn: (vars: { title: string; category: TaskCategory }) =>
      api.createTask({ title: vars.title, category: vars.category, project_id: moduleId as string }),
    onSuccess: (created) => {
      setNewTaskTitle('');
      setNewTaskCategory('other');
      // Optimistically splice the new task into linked_tasks so the panel
      // updates instantly. The invalidate() below then refetches for source
      // of truth; if the server reflects something different (e.g. different
      // id or category), the optimistic row gets replaced on refetch.
      qc.setQueryData<{ linked_tasks?: Task[] } | undefined>(
        ['ss-module', moduleId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            linked_tasks: [...(old.linked_tasks ?? []), created],
          };
        }
      );
      invalidate();
    },
  });

  const toggleTask = useMutation({
    mutationFn: (vars: { id: string; status: Task['status'] }) =>
      api.updateTask(vars.id, { status: vars.status }),
    onSettled: () => invalidate(),
  });

  const editTaskTitle = useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      api.updateTask(vars.id, { title: vars.title }),
    onSettled: () => invalidate(),
  });

  const cycleTaskCategory = useMutation({
    mutationFn: (vars: { id: string; category: TaskCategory }) =>
      api.updateTask(vars.id, { category: vars.category }),
    onSettled: () => invalidate(),
  });

  const setTaskEnergy = useMutation({
    mutationFn: (vars: { id: string; energy: TaskEnergy }) =>
      api.updateTask(vars.id, { energy: vars.energy }),
    onSettled: () => invalidate(),
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSettled: () => invalidate(),
  });

  // Move a task between PRIORITY (backlog=false) and BACKLOG (backlog=true).
  // Drag-and-drop on the panel below sets dataTransfer to the task id;
  // each section's drop handler calls this with the appropriate value.
  const setBacklog = useMutation({
    mutationFn: (v: { id: string; backlog: boolean }) =>
      api.setTaskBacklog(v.id, v.backlog),
    onMutate: async (v) => {
      // Optimistic: flip the task's backlog flag in the cached
      // linked_tasks so it hops to the other section instantly.
      await qc.cancelQueries({ queryKey: ['ss-module', moduleId] });
      const prev = qc.getQueryData<{ linked_tasks?: Task[] }>(['ss-module', moduleId]);
      if (prev?.linked_tasks) {
        qc.setQueryData(['ss-module', moduleId], {
          ...prev,
          linked_tasks: prev.linked_tasks.map((t) =>
            t.id === v.id ? { ...t, backlog: v.backlog } : t
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ss-module', moduleId], ctx.prev);
    },
    onSettled: () => {
      invalidate();
      // Focus + Today read the same tasks - keep them in sync so a
      // moved-to-backlog task disappears there immediately too.
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (moduleId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moduleId, onClose]);

  if (!moduleId) return null;

  const linkedTasks = (data?.linked_tasks ?? []) as Task[];
  // Three buckets: priority (active + not backlog), backlog (active +
  // backlog), done. Priority shows on Focus; backlog only shows here.
  const priorityTasks = linkedTasks.filter((t) => t.status !== 'completed' && !t.backlog);
  const backlogTasks = linkedTasks.filter((t) => t.status !== 'completed' && t.backlog);
  const doneTasks = linkedTasks.filter((t) => t.status === 'completed');
  const completedCount = doneTasks.length;
  const progressPct = linkedTasks.length === 0
    ? data?.progress_pct ?? 0
    : Math.round((completedCount / linkedTasks.length) * 100);
  const currentStageIdx = data ? STAGES.findIndex((s) => s.status === data.status) : -1;

  function saveAll() {
    save.mutate({
      name,
      description,
      progress_pct: linkedTasks.length > 0 ? progressPct : undefined,
    });
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 90,
          backdropFilter: 'blur(2px)',
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(720px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--hairline)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.4)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span className="eyebrow">{data?.kind === 'client' ? 'client' : 'project'} detail</span>
          <button type="button" onClick={onClose} className="btn" style={{ color: 'var(--muted)' }}>
            close
          </button>
        </header>

        {isLoading || !data ? (
          <div className="empty" style={{ margin: 'var(--space-7)' }}>loading</div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-6)',
            }}
          >
            {/* Name + inline status pill row. Status is a compact segmented
                control sitting on the same baseline as the title. */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
                style={{
                  flex: 1,
                  minWidth: 200,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-display)',
                  fontSize: '2rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                  lineHeight: 1.1,
                  padding: 0,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 2,
                  padding: 2,
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                }}
                title={
                  linkedTasks.length === 0
                    ? 'add tasks below to track progress'
                    : `${completedCount} of ${linkedTasks.length} done (${progressPct}%)`
                }
              >
                {STAGES.map((s) => {
                  const active = s.status === data?.status;
                  return (
                    <button
                      key={s.status}
                      type="button"
                      onClick={() => setStatus.mutate(s.status)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? '#0E1116' : 'var(--muted)',
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
            </div>

            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDirty(true);
              }}
              placeholder="what is this"
              style={{
                width: '100%',
                minHeight: 60,
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--ink)',
                padding: 'var(--space-4)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--body)',
                lineHeight: 1.55,
                resize: 'vertical',
                outline: 'none',
              }}
            />

            {data?.kind === 'client' && (
              <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--surface)', borderRadius: 'var(--radius-md)', alignSelf: 'flex-start' }}>
                {(['tasks', 'content'] as const).map((t) => {
                  const active = panelTab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPanelTab(t)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: active ? 'var(--bg)' : 'transparent',
                        color: active ? 'var(--ink)' : 'var(--muted)',
                        fontSize: 'var(--body-sm)',
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}

            {data?.kind === 'client' && panelTab === 'content' && (
              <ClientContentPanel clientFolder={data.name} />
            )}

            {(data?.kind !== 'client' || panelTab === 'tasks') && (<>
            <div className="stack" style={{ gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="eyebrow">priority tasks</span>
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  show on the focus page · drag to backlog below to hide
                </span>
              </div>
              <div
                className="stack"
                // Drop zone: dragging from the backlog section sends the
                // task back to priority (backlog=false).
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) setBacklog.mutate({ id, backlog: false });
                }}
                style={{ minHeight: priorityTasks.length === 0 ? 56 : undefined }}
              >
                {priorityTasks.length === 0 && doneTasks.length === 0 && backlogTasks.length === 0 && (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)', padding: 'var(--space-3) 0' }}>
                    no tasks yet, add one below
                  </span>
                )}
                {priorityTasks.length === 0 && (doneTasks.length > 0 || backlogTasks.length > 0) && (
                  <span className="muted" style={{ fontSize: 'var(--body-sm)', fontStyle: 'italic', padding: 'var(--space-2) 0' }}>
                    nothing in priority - drag from backlog ↓ to surface a task on the focus page
                  </span>
                )}
                {priorityTasks.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    style={{ cursor: 'grab' }}
                    title="drag down to backlog to defer"
                  >
                    <TaskRowWithDelete
                      task={t}
                      onToggle={(status) => toggleTask.mutate({ id: t.id, status })}
                      onEditTitle={(title) => editTaskTitle.mutate({ id: t.id, title })}
                      onCycleCategory={(category) => cycleTaskCategory.mutate({ id: t.id, category })}
                      onSetEnergy={(energy) => setTaskEnergy.mutate({ id: t.id, energy })}
                      onDelete={() => deleteTask.mutate(t.id)}
                    />
                  </div>
                ))}
              </div>

              {/* Backlog drop zone. Visible only in this panel; tasks
                  in here are hidden from Focus + WeekPlanner. Drop a
                  priority row here to push it to backlog (backlog=true). */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) setBacklog.mutate({ id, backlog: true });
                }}
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px dashed var(--hairline)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255,255,255,0.02)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="eyebrow" style={{ color: 'var(--muted)' }}>
                    backlog · {backlogTasks.length}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    hidden from focus · drop here to defer · drag back up to prioritise
                  </span>
                </div>
                {backlogTasks.length === 0 ? (
                  <p className="muted" style={{ fontSize: 12, fontStyle: 'italic', margin: 0 }}>
                    nothing in the backlog yet. drag a priority task in to defer it.
                  </p>
                ) : (
                  backlogTasks.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      style={{ cursor: 'grab', opacity: 0.85 }}
                      title="drag up to priority to surface on the focus page"
                    >
                      <TaskRowWithDelete
                        task={t}
                        onToggle={(status) => toggleTask.mutate({ id: t.id, status })}
                        onEditTitle={(title) => editTaskTitle.mutate({ id: t.id, title })}
                        onCycleCategory={(category) => cycleTaskCategory.mutate({ id: t.id, category })}
                        onSetEnergy={(energy) => setTaskEnergy.mutate({ id: t.id, energy })}
                        onDelete={() => deleteTask.mutate(t.id)}
                      />
                    </div>
                  ))
                )}
              </div>
              {doneTasks.length > 0 && (
                <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                  <button
                    type="button"
                    onClick={() => setShowArchive((v) => !v)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 'var(--space-2) 0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      textAlign: 'left',
                    }}
                  >
                    <span className="eyebrow" style={{ color: 'var(--recovery)' }}>
                      done ({doneTasks.length})
                    </span>
                    <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                      {showArchive ? 'hide' : 'show'}
                    </span>
                  </button>
                  {showArchive && (
                    <div className="stack">
                      {doneTasks.map((t) => (
                        <TaskRowWithDelete
                          key={t.id}
                          task={t}
                          onToggle={(status) => toggleTask.mutate({ id: t.id, status })}
                          onEditTitle={(title) => editTaskTitle.mutate({ id: t.id, title })}
                          onCycleCategory={(category) => cycleTaskCategory.mutate({ id: t.id, category })}
                          onSetEnergy={(energy) => setTaskEnergy.mutate({ id: t.id, energy })}
                          onDelete={() => deleteTask.mutate(t.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = newTaskTitle.trim();
                  if (!trimmed) return;
                  createTask.mutate({ title: trimmed, category: newTaskCategory });
                }}
                style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}
              >
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="add a task and hit enter"
                  style={{
                    flex: 1,
                    minWidth: 200,
                    background: 'var(--surface)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--ink)',
                    padding: '10px 14px',
                    fontSize: 'var(--body)',
                    outline: 'none',
                  }}
                />
                <select
                  value={newTaskCategory}
                  onChange={(e) => setNewTaskCategory(e.target.value as TaskCategory)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--ink)',
                    padding: '10px 14px',
                    fontSize: 'var(--body-sm)',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn--primary" disabled={!newTaskTitle.trim() || createTask.isPending}>
                  {createTask.isPending ? 'adding' : 'add'}
                </button>
              </form>
            </div>
            </>)}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--hairline)',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const label = data?.kind === 'client' ? 'client' : 'project';
                  if (confirm(`archive this ${label}? it'll hide from the list but tasks stay linked.`)) {
                    archiveModule.mutate();
                  }
                }}
                disabled={archiveModule.isPending}
                className="btn"
                style={{ color: 'var(--muted)', marginRight: 'auto' }}
              >
                {archiveModule.isPending ? 'archiving' : 'archive'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const label = data?.kind === 'client' ? 'client' : 'project';
                  if (confirm(`permanently delete this ${label}? linked tasks lose their link but are not deleted. cannot be undone.`)) {
                    deleteModule.mutate();
                  }
                }}
                disabled={deleteModule.isPending}
                className="btn"
                style={{ color: 'var(--danger)', borderColor: 'rgba(255,77,77,0.4)' }}
              >
                {deleteModule.isPending ? 'deleting' : 'delete'}
              </button>
              {dirty && (
                <span className="muted" style={{ fontSize: 'var(--body-sm)', alignSelf: 'center' }}>
                  unsaved
                </span>
              )}
              <button
                type="button"
                onClick={saveAll}
                disabled={!dirty || save.isPending}
                className="btn btn--primary"
                style={{ opacity: !dirty || save.isPending ? 0.4 : 1 }}
              >
                {save.isPending ? 'saving' : 'save'}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function TaskRowWithDelete({
  task,
  onToggle,
  onEditTitle,
  onCycleCategory,
  onSetEnergy,
  onDelete,
}: {
  task: Task;
  onToggle: (status: Task['status']) => void;
  onEditTitle: (title: string) => void;
  onCycleCategory: (category: TaskCategory) => void;
  onSetEnergy: (energy: TaskEnergy) => void;
  onDelete: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <TaskRow
          task={{ ...task, project_name: undefined }}
          showCategory
          onToggle={onToggle}
          onEditTitle={onEditTitle}
          onCycleCategory={onCycleCategory}
          onSetEnergy={onSetEnergy}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          if (confirm('delete this task? it will also disappear from your master todo.')) {
            onDelete();
          }
        }}
        aria-label="delete task"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted-2)',
          cursor: 'pointer',
          fontSize: 18,
          padding: 'var(--space-3) var(--space-2)',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Client content panel ────────────────────────────────────────────────
// Lists every deck (and later: funnel diagrams, other docs) attached to one
// client. Each row has an open-editor link, the live URL with copy, and a
// publish button. Filtered by client folder name.

const TEMPLATE_OPTIONS: Array<{ id: string; label: string; description: string; disabled?: boolean }> = [
  { id: 'strategy-deck', label: 'Strategy Deck', description: 'A multi-slide strategy presentation with editable text, video breakdowns, roadmap tasks.' },
  { id: 'content-world', label: 'Content world', description: 'Visual content map - drag cards (Instagram, YouTube, lead magnet, etc.) and connect them with lines.' },
];

function ClientContentPanel({ clientFolder }: { clientFolder: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['decks'],
    queryFn: api.decks,
  });
  const allDecks: DeckEntry[] = data?.decks ?? [];
  const decks = allDecks.filter((d) => d.client === clientFolder);

  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ key: string; kind: 'ok' | 'err'; text: string } | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [creating, setCreating] = useState(false);

  const publish = useMutation({
    mutationFn: (path: string) => api.publishDeck(path),
    onSuccess: async (res, path) => {
      try { await navigator.clipboard.writeText(res.url); } catch { /* clipboard can fail without gesture */ }
      setFlash({ key: path, kind: 'ok', text: 'Published. URL copied.' });
      qc.invalidateQueries({ queryKey: ['decks'] });
    },
    onError: (err: unknown, path) => {
      setFlash({ key: path, kind: 'err', text: err instanceof Error ? err.message : 'publish failed' });
    },
    onSettled: () => setBusyPath(null),
  });

  function onPublish(d: DeckEntry) {
    setFlash(null);
    setBusyPath(d.path);
    publish.mutate(d.path);
  }

  function copyUrl(url: string, key: string) {
    navigator.clipboard.writeText(url).then(
      () => setFlash({ key, kind: 'ok', text: 'URL copied.' }),
      () => setFlash({ key, kind: 'err', text: 'Could not copy.' }),
    );
  }

  async function createFromTemplate(templateId: string) {
    const name = newDocName.trim();
    if (!name) {
      setFlash({ key: 'new', kind: 'err', text: 'Give it a name first.' });
      return;
    }
    setCreating(true);
    setFlash(null);
    try {
      const res = await api.createDeckFromTemplate({
        template: templateId,
        client_folder: clientFolder,
        name,
      });
      setFlash({ key: 'new', kind: 'ok', text: `Created ${res.path}` });
      setTemplatePickerOpen(false);
      setNewDocName('');
      qc.invalidateQueries({ queryKey: ['decks'] });
    } catch (err) {
      setFlash({ key: 'new', kind: 'err', text: err instanceof Error ? err.message : 'create failed' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="eyebrow">documents + links</span>
        <button
          type="button"
          className="btn"
          onClick={() => setTemplatePickerOpen((v) => !v)}
          style={{ fontSize: 'var(--body-sm)' }}
        >
          {templatePickerOpen ? 'cancel' : '+ create from template'}
        </button>
      </div>

      {templatePickerOpen && (
        <div
          className="stack"
          style={{
            gap: 'var(--space-3)',
            padding: 'var(--space-4)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface)',
          }}
        >
          <label className="stack" style={{ gap: 4 }}>
            <span className="eyebrow">step 1 - name it</span>
            <input
              autoFocus
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              placeholder="e.g. strategy-deck, q2-funnel"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--ink)',
                padding: '10px 14px',
                fontSize: 'var(--body)',
                outline: 'none',
              }}
            />
          </label>
          <div className="stack" style={{ gap: 'var(--space-2)' }}>
            <span className="eyebrow">step 2 - pick a template</span>
            {TEMPLATE_OPTIONS.map((t) => {
              const isReady = !t.disabled && !creating && !!newDocName.trim();
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={t.disabled || creating}
                  onClick={() => createFromTemplate(t.id)}
                  style={{
                    textAlign: 'left',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--bg)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--ink)',
                    cursor: t.disabled ? 'not-allowed' : 'pointer',
                    opacity: t.disabled ? 0.5 : isReady ? 1 : 0.75,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 'var(--body)' }}>{t.label}</div>
                  <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>{t.description}</div>
                </button>
              );
            })}
          </div>
          {flash && flash.key === 'new' && (
            <div style={{ fontSize: 'var(--body-sm)', color: flash.kind === 'ok' ? 'var(--recovery)' : 'var(--strain)' }}>
              {flash.text}
            </div>
          )}
        </div>
      )}

      {isLoading && <div className="empty">loading…</div>}
      {error && <div className="empty">couldn't load: {(error as Error).message}</div>}

      {!isLoading && !error && decks.length === 0 && (
        <div className="empty">
          no documents yet. click + create from template to make a strategy deck.
        </div>
      )}

      {decks.map((d) => {
        const editUrl = deckEditorUrl(d.path);
        const isBusy = busyPath === d.path;
        const f = flash && flash.key === d.path ? flash : null;
        return (
          <article
            key={d.path}
            style={{
              padding: 'var(--space-4)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface)',
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">{d.type === 'content-world' ? 'content world' : 'strategy deck'}</span>
                <h4 className="h4" style={{ margin: 0, fontWeight: 600 }}>{d.filename.replace(/\.html$/, '')}</h4>
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>edited {formatRel(d.mtime)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a className="btn btn--primary" href={editUrl} target="_blank" rel="noopener">open editor →</a>
                <button
                  className="btn"
                  type="button"
                  onClick={() => onPublish(d)}
                  disabled={isBusy}
                >
                  {isBusy ? 'publishing…' : 'publish'}
                </button>
              </div>
            </div>

            {d.published_url ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--bg)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--hairline)',
                  fontSize: 'var(--body-sm)',
                }}
              >
                <span className="muted" style={{ minWidth: 84 }}>live URL</span>
                <a
                  href={d.published_url}
                  target="_blank"
                  rel="noopener"
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}
                >
                  {d.published_url}
                </a>
                <button
                  className="btn"
                  type="button"
                  onClick={() => copyUrl(d.published_url!, d.path)}
                  style={{ padding: '4px 10px', fontSize: 'var(--body-sm)' }}
                >
                  copy
                </button>
                <span className="muted" style={{ fontSize: 'var(--body-xs)' }}>
                  pub {formatRel(d.last_published_at ?? 0)}
                </span>
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                not published yet. click publish to push the first version to Cloudflare.
              </span>
            )}

            {f && (
              <div style={{ fontSize: 'var(--body-sm)', color: f.kind === 'ok' ? 'var(--recovery)' : 'var(--strain)' }}>
                {f.text}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function formatRel(unixSec: number): string {
  if (!unixSec) return 'never';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSec;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString();
}
