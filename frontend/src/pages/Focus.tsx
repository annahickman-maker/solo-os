import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { FocusResponse, Task, TaskCategory, TaskEnergy } from '../api';
import { Card } from '../components/Card';
import { Ring } from '../components/Ring';
import { TaskRow } from '../components/TaskRow';
import { YearGrid } from '../components/YearGrid';
import { MonthGrid } from '../components/MonthGrid';
import { FocusTargetEditor } from '../components/FocusTargetEditor';
import { EditableHeading } from '../components/EditableHeading';
import { daysBetween, formatDate } from '../lib/format';

// Ordered highest-strain-first to match the activity-tracker picker.
const CATEGORIES: (TaskCategory | 'all')[] = [
  'all',
  'filming',
  'operations',
  'scripting',
  'building',
  'admin',
  'other',
];

// Display labels for category keys; storage uses the keys, the UI shows these.
const CATEGORY_DISPLAY: Record<string, string> = {
  operations: 'calls',
  other: 'other things',
};

export function Focus() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['focus'],
    queryFn: api.focus,
  });
  // Inline edit state for the SS members number on the hero ring. Click the
  // count -> small input. Enter or blur saves; Esc cancels.
  const [editingMembers, setEditingMembers] = useState(false);
  const [membersDraft, setMembersDraft] = useState('');
  const updateMembersMutation = useMutation({
    mutationFn: (newCount: number) =>
      api.updateSettings({
        ss_members: newCount,
        // Auto-calc MRR at the default $47/mo price point. If the creator later wants
        // separate control she can split this out, but for now keeping them in
        // sync is the desired behaviour she asked for.
        ss_mrr_usd: newCount * 47,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      setEditingMembers(false);
    },
  });
  const saveMembers = () => {
    const parsed = parseInt(membersDraft, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setEditingMembers(false);
      return;
    }
    updateMembersMutation.mutate(parsed);
  };
  // Secondary fetches: pipeline for the YouTube publish grid, metrics for
  // the SS MRR figure. Both already power other pages so the responses are
  // cached and cheap here.
  const { data: pipeline } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => api.pipeline(),
  });
  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => api.metrics(),
  });
  // Short-form content tracker - same data the Instagram page uses, so the
  // MonthGrid on Focus stays in lock-step with what the IG page shows.
  const { data: igOutput } = useQuery({
    queryKey: ['ig-output'],
    queryFn: api.igOutput,
  });
  const setIgTarget = useMutation({
    mutationFn: (n: number) => api.setIgTarget(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-output'] }),
  });
  function editIgTarget() {
    const cur = igOutput?.target_per_week ?? 3;
    const v = window.prompt('how many reels per week do you want to publish?', String(cur));
    if (!v) return;
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return;
    setIgTarget.mutate(Math.round(n));
  }

  const [filter, setFilter] = useState<TaskCategory | 'all'>('all');
  const [showCompleted, setShowCompleted] = useState(false);

  const toggleTask = useMutation({
    mutationFn: (vars: { id: string; status: Task['status'] }) =>
      api.updateTask(vars.id, { status: vars.status }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['focus'] });
      const prev = qc.getQueryData<FocusResponse>(['focus']);
      if (prev) {
        const next: FocusResponse = {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === vars.id ? { ...t, status: vars.status } : t
          ),
        };
        qc.setQueryData(['focus'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['focus'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  const setEnergy = useMutation({
    mutationFn: (vars: { id: string; energy: TaskEnergy }) =>
      api.updateTask(vars.id, { energy: vars.energy }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['focus'] });
      const prev = qc.getQueryData<FocusResponse>(['focus']);
      if (prev) {
        const next: FocusResponse = {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === vars.id ? { ...t, energy: vars.energy } : t
          ),
        };
        qc.setQueryData(['focus'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['focus'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['focus'] }),
  });

  const editTitle = useMutation({
    mutationFn: (vars: { id: string; title: string }) =>
      api.updateTask(vars.id, { title: vars.title }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['focus'] }),
  });

  // Pin / unpin a task to a weekday column in the WeekPlanner.
  // Optimistically patches the focus cache so the task hops into the
  // new column without waiting for the network.
  const setSchedule = useMutation({
    mutationFn: (vars: { id: string; scheduled_weekday: string | null }) =>
      api.setTaskScheduledWeekday(vars.id, vars.scheduled_weekday),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['focus'] });
      const prev = qc.getQueryData<FocusResponse>(['focus']);
      if (prev) {
        const next: FocusResponse = {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === vars.id ? { ...t, scheduled_weekday: vars.scheduled_weekday ?? undefined } : t
          ),
        };
        qc.setQueryData(['focus'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['focus'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  // Permanent delete: writes a tombstone server-side so the next vault sync
  // can't bring this back from master-todo.md.
  const deleteTask = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['focus'] });
      const prev = qc.getQueryData<FocusResponse>(['focus']);
      if (prev) {
        qc.setQueryData(['focus'], {
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== id),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['focus'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  // Create a new task inline from the master todo header. The composer
  // accepts title + category + project; saved tasks land in the
  // master list immediately via cache invalidation.
  const createTask = useMutation({
    mutationFn: (body: { title: string; category: TaskCategory; project_id?: string }) =>
      api.createTask(body),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  const cycleCategory = useMutation({
    mutationFn: (vars: { id: string; category: import('../api').TaskCategory }) =>
      api.updateTask(vars.id, { category: vars.category }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['focus'] }),
  });

  // Project / client assignment on a task. The backend stores both in the
  // same field (a task is one OR the other, never both), so we send a unified
  // list of projects+clients in the picker.
  const setProject = useMutation({
    mutationFn: (vars: { id: string; project_id: string | null }) =>
      api.updateTask(vars.id, { project_id: vars.project_id } as Parameters<typeof api.updateTask>[1]),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['focus'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  const projectOptions = useMemo(() => {
    const projects = (pipeline?.ss_modules ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      kind: 'project' as const,
    }));
    const clients = (pipeline?.clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: 'client' as const,
    }));
    return [...projects, ...clients].sort((a, b) => a.name.localeCompare(b.name));
  }, [pipeline]);

  const grouped = useMemo(() => {
    const tasks = (data?.tasks ?? []).filter((t) => {
      if (!showCompleted && t.status === 'completed') return false;
      if (filter !== 'all' && t.category !== filter) return false;
      // Tasks pinned to a weekday live in the WeekPlanner on the left,
      // not the master list. Weekday pins persist across weeks - once
      // a task lands in a column it stays there until completed or moved.
      if (t.scheduled_weekday) return false;
      return true;
    });
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries());
  }, [data, filter, showCompleted]);

  if (error) {
    return <div className="empty">couldn't load focus: {(error as Error).message}</div>;
  }

  const goal = data?.goal;
  const current = goal?.current_value ?? 0;
  const target = goal?.target_value ?? 0;
  const progress = target > 0 ? current / target : 0;
  const today = Math.floor(Date.now() / 1000);
  const daysLeft = goal?.target_date ? daysBetween(today, goal.target_date) : 0;

  const targets = data?.targets;
  const mrrTarget = targets?.mrr_target_usd ?? null;
  const currentMrr = targets?.current_mrr_usd ?? metrics?.ss_mrr ?? 0;
  const mrrProgress = mrrTarget && mrrTarget > 0 ? Math.min(1, currentMrr / mrrTarget) : progress;

  return (
    <div className="stack" style={{ gap: 'var(--space-5)' }}>
      {/* "Set target" pill sits flush to the right with no left-side eyebrow.
          The "90-day focus" label now lives inside the goal block below, so
          this top row is just the action affordance. Tighter bottom margin
          pulls the pill closer to the hero content. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 'calc(var(--space-5) * -1 + var(--space-3))',
        }}
      >
        <FocusTargetToggle targets={targets} goalId={goal?.id ?? null} />
      </div>

      {/* Two-column hero. LEFT: goal text on plain page background (no card).
          RIGHT: only the dial is wrapped in a Card so the box visually
          contains just the metric. Both columns share a top-aligned start so
          the goal eyebrow + dial card top read as one horizontal line. */}
      <div
        className="focus__hero"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--space-7)',
          alignItems: 'start',
        }}
      >
        {/* LEFT: plain background, no card. Top-aligned. */}
        <div className="stack" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
          <span className="eyebrow">90-day focus</span>
          <EditableHeading
            value={goal?.title ?? ''}
            placeholder="what are you focused on for the next 90 days?"
            onSave={(title) => {
              if (!goal?.id) return;
              api
                .updateGoal(goal.id, { title })
                .then(() => qc.invalidateQueries({ queryKey: ['focus'] }))
                .catch((e) => window.alert(`save failed: ${(e as Error).message}`));
            }}
          />
          {goal?.target_date && (
            <span className="muted" style={{ marginTop: 'var(--space-2)' }}>
              {daysLeft} days remaining, target {formatDate(goal.target_date)}
            </span>
          )}

          {/* Connecting to your offer - reads/writes the same focus rung
              that the Offer page uses (pricing_rungs.featured). Click to set
              the focus offer; setting here propagates to the Offer page. */}
          <FocusOfferConnector />
        </div>

        {/* RIGHT: the dial inside its own card. */}
        <Card>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <Ring
              value={mrrProgress}
              label={`out of ${target || '?'} members`}
              bigNumber={`${Math.round(mrrProgress * 100)}`}
              unit="%"
              size="hero"
            />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
                textAlign: 'center',
              }}
            >
              ${currentMrr.toLocaleString('en-US')}
              {mrrTarget ? (
                <span
                  style={{
                    color: 'var(--muted)',
                    fontSize: '0.55em',
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                    marginLeft: '0.3em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  / ${mrrTarget.toLocaleString('en-US')}
                </span>
              ) : (
                <span style={{ color: 'var(--muted)', fontSize: '0.55em', fontWeight: 500 }}> / mo</span>
              )}
            </span>
            {editingMembers ? (
              <input
                autoFocus
                type="number"
                min={0}
                value={membersDraft}
                onChange={(e) => setMembersDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveMembers();
                  if (e.key === 'Escape') setEditingMembers(false);
                }}
                onBlur={saveMembers}
                style={{
                  width: 80,
                  textAlign: 'center',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: '1.25rem',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: '4px 8px',
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMembersDraft(String(current));
                  setEditingMembers(true);
                }}
                title="click to update current member count"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--body-sm)',
                  color: 'var(--muted)',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-md)',
                  transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'var(--surface-2, rgba(0,0,0,0.04))';
                  (e.currentTarget as HTMLElement).style.color = 'var(--ink)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
                }}
              >
                {current} members {updateMembersMutation.isPending ? '· saving…' : '· edit'}
              </button>
            )}
          </div>
        </Card>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .focus__hero { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Long-form + short-form publish counters, stacked. Both read the
          same data as the YouTube + Instagram pages so the counts here stay
          in lock-step. */}
      <div className="stack" style={{ gap: 'var(--space-5)' }}>
        {pipeline?.weekly_publish_year && (
          <Card eyebrow="long-form content" title="YouTube">
            <YearGrid
              data={pipeline.weekly_publish_year}
              targetPerWeeks={
                targets?.long_form_per_week && targets.long_form_per_week > 0
                  ? Math.max(1, Math.round(1 / targets.long_form_per_week))
                  : targets?.youtube_target_per_weeks ?? 1
              }
            />
          </Card>
        )}

        {igOutput && (
          <Card eyebrow="short-form content" title="Instagram">
            <MonthGrid
              months={igOutput.months}
              targetPerWeek={igOutput.target_per_week}
            />
          </Card>
        )}
      </div>

      {/* Small gap between the content counters group and the master task
          list - just enough to separate the two sections without breaking
          the page rhythm. */}
      <div style={{ height: 'var(--space-3)' }} />

      {/* Split: sticky vertical Mon-Fri planner on the LEFT, master
          todo list on the RIGHT. Drag any row from the master todo
          across to a day, or use the + on each day to pick from a
          popover. Planner sticks in view while the master todo scrolls. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 320px) 1fr',
          gap: 'var(--space-5)',
          alignItems: 'start',
        }}
      >
      <WeekPlanner
        tasks={data?.tasks ?? []}
        onSchedule={(id, weekday) => setSchedule.mutate({ id, scheduled_weekday: weekday })}
      />

      <section className="section" style={{ minWidth: 0 }}>
        <header className="section__header">
          <div className="section__title">
            <span className="eyebrow">master todo</span>
            <h3 className="h3">everything that moves the goal</h3>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <button
              className="btn btn--ghost"
              onClick={() => setShowCompleted((v) => !v)}
            >
              {showCompleted ? 'hide completed' : 'show completed'}
            </button>
          </div>
        </header>

        {/* Inline task composer. Sits just under the section header.
            Title + category + (optional) project. Saves to /api/tasks. */}
        <TaskComposer
          projectOptions={projectOptions}
          onCreate={(body) => createTask.mutate(body)}
          pending={createTask.isPending}
        />

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-5)',
          }}
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className="btn"
              style={{
                background: filter === c ? 'var(--ink)' : 'transparent',
                color: filter === c ? 'var(--bg)' : 'var(--muted)',
                borderColor: filter === c ? 'var(--ink)' : 'var(--hairline)',
              }}
            >
              {CATEGORY_DISPLAY[c] ?? c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="empty">loading</div>
        ) : grouped.length === 0 ? (
          <div className="empty">no tasks here yet</div>
        ) : (
          <div className="stack" style={{ gap: 'var(--space-6)' }}>
            {grouped.map(([cat, tasks]) => (
              <div key={cat} className="stack" style={{ gap: 'var(--space-3)' }}>
                <span className="eyebrow">{CATEGORY_DISPLAY[cat] ?? cat}</span>
                <div className="stack">
                  {tasks.map((t) => (
                    // The whole row is draggable - mousedown on TaskRow's
                    // interactive elements (checkbox, pill pickers) still
                    // works as a click while dragging from anywhere else
                    // initiates the drag. No separate handle needed.
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      style={{ cursor: 'grab' }}
                      title="drag to a day on the left to schedule"
                    >
                      <TaskRow
                        task={t}
                        showCategory={false}
                        onToggle={(status) => toggleTask.mutate({ id: t.id, status })}
                        onSetEnergy={(energy) => setEnergy.mutate({ id: t.id, energy })}
                        onEditTitle={(title) => editTitle.mutate({ id: t.id, title })}
                        onCycleCategory={(category) => cycleCategory.mutate({ id: t.id, category })}
                        onSetProject={(project_id) => setProject.mutate({ id: t.id, project_id })}
                        onDelete={() => deleteTask.mutate(t.id)}
                        projectOptions={projectOptions}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}

// =========================================================================
// FocusOfferConnector: reads the featured rung from /api/offers and renders
// either (a) a compact card showing the focus offer name + price + stage,
// or (b) a "select your focus offer" empty box (same dashed-border feel as
// the FeaturedDropZone on the Offer page). Clicking either opens a picker
// with all available rungs - selecting one calls setFeaturedRung, which
// promotes that rung and propagates to the Offer page since both surfaces
// read the same /api/offers data.
// =========================================================================
function FocusOfferConnector() {
  const qc = useQueryClient();
  const { data: offer } = useQuery({ queryKey: ['offers'], queryFn: api.offers });
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const pricingSection = offer?.sections?.find((s: any) => s.id === 'pricing');
  const rungs: any[] = pricingSection?.pricing_rungs ?? [];
  const featured = rungs.find((r) => r?.featured) ?? null;

  const setFeatured = useMutation({
    mutationFn: (id: string) => api.setFeaturedRung(id, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['focus'] });
    },
  });

  useEffect(() => {
    if (!pickerOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function gotoOffer() {
    window.history.pushState({}, '', '/profile/offer');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <div ref={pickerRef} style={{ position: 'relative', marginTop: 'var(--space-4)' }}>
      <span className="eyebrow" style={{ display: 'block', marginBottom: 6 }}>
        connecting to your offer
      </span>
      {featured ? (
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          title="click to change the focus offer"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 'var(--space-4)',
            background: 'var(--surface)',
            border: '1.5px solid var(--recovery)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--ink)',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ color: 'var(--recovery)', fontSize: '1em', flexShrink: 0 }}>★</span>
          <span className="eyebrow" style={{ color: 'var(--muted)', flexShrink: 0 }}>focus offer</span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '1.05rem',
              letterSpacing: '-0.01em',
              marginLeft: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {featured.name || '(unnamed offer)'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-6)',
            background: 'transparent',
            border: '2px dashed var(--hairline)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--muted)',
            fontSize: 'var(--body-sm)',
            fontStyle: 'italic',
            textAlign: 'center',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--recovery)';
            (e.currentTarget as HTMLElement).style.color = 'var(--ink)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
            (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
          }}
        >
          ★ select your focus offer · this is what you're building this sprint
        </button>
      )}

      {pickerOpen && (
        <div
          role="dialog"
          aria-label="pick a focus offer"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {rungs.length === 0 && (
            <div style={{ padding: 'var(--space-3)', color: 'var(--muted)', fontSize: 'var(--body-sm)' }}>
              no offers yet.{' '}
              <button
                type="button"
                onClick={gotoOffer}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--recovery)',
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                  textDecoration: 'underline',
                }}
              >
                add one on the offer page →
              </button>
            </div>
          )}
          {rungs.map((r) => {
            const isFeatured = r.id === featured?.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  if (!isFeatured) setFeatured.mutate(r.id);
                  setPickerOpen(false);
                }}
                disabled={setFeatured.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: isFeatured ? 'rgba(157,183,209,0.06)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: isFeatured ? 'default' : 'pointer',
                  color: 'var(--ink)',
                  fontSize: 'var(--body-sm)',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  if (!isFeatured) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isFeatured) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{r.name || '(unnamed)'}</span>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {r.price_label || 'no price'} · {r.status || 'idea'}
                  </span>
                </span>
                {isFeatured && (
                  <span style={{ color: 'var(--recovery)', fontSize: '0.9em' }}>★ focus</span>
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
// Compact "adjust . set target" pill button + slide-over.
// Sits in the top-right of the Focus page header. Mirrors the AvatarToggle
// pattern on Content (.ytav-trigger class + side panel).
// =========================================================================
function FocusTargetToggle({
  targets,
  goalId,
}: {
  targets: FocusResponse['targets'] | undefined;
  goalId: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Body-scroll lock + Escape-to-close, same pattern as AvatarToggle.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="ytav-trigger"
        onClick={() => setOpen(true)}
        aria-label="set target"
      >
        <span className="ytav-trigger__icon">
          <TargetIcon />
        </span>
        <span className="ytav-trigger__label">set target</span>
      </button>

      {open && (
        <div className="ytav-wrap" onClick={() => setOpen(false)}>
          <aside className="ytav-panel" onClick={(e) => e.stopPropagation()}>
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
              }}
            >
              <div>
                <span className="eyebrow" style={{ color: 'var(--recovery)' }}>90-day focus</span>
                <h2
                  style={{
                    margin: '6px 0 0',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '1.6rem',
                    letterSpacing: '-0.01em',
                  }}
                >
                  Set target
                </h2>
                <p
                  className="muted"
                  style={{ margin: '6px 0 0', fontSize: 'var(--body-sm)', maxWidth: '54ch' }}
                >
                  set your MRR + member targets for this 90-day window. these drive every progress dial across the dashboard.
                </p>
              </div>
              <button
                type="button"
                className="off-btn off-btn--ghost"
                onClick={() => setOpen(false)}
              >
                close
              </button>
            </header>
            <FocusTargetEditor targets={targets} goalId={goalId} alwaysOpen />
          </aside>
        </div>
      )}
    </>
  );
}

function TargetIcon() {
  // Concentric-circle "target" mark. Outer circle is the same 48-unit
  // viewBox container that the AvatarSvg uses so the .ytav-trigger button
  // renders it at the matching 28px size. Inner rings are kept small so
  // the icon reads lighter in the pill, not maxed-out to the edge.
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r="23" fill="rgba(255,255,255,0.04)" stroke="var(--hairline)" />
      <circle cx="24" cy="24" r="10" fill="none" stroke="var(--recovery)" strokeWidth="1.6" />
      <circle cx="24" cy="24" r="5" fill="none" stroke="var(--recovery)" strokeWidth="1.4" />
      <circle cx="24" cy="24" r="1.8" fill="var(--recovery)" />
    </svg>
  );
}

// ─── WeekPlanner ──────────────────────────────────────────────────────────
// 7-column visual: Mon → Sun, keyed by day-of-week (NOT by date). Tasks
// pinned to "mon"/"tue"/.../"sun" via scheduled_weekday appear in that
// column and STAY there across weeks until completed or moved. Today's
// column is highlighted. HTML5 native drag-and-drop: each card carries
// its id; columns accept drops and call onSchedule(id, weekday).
// Completed tasks are hidden.
const WEEKDAY_COLUMNS: { label: string; key: string }[] = [
  { label: 'mon', key: 'mon' },
  { label: 'tue', key: 'tue' },
  { label: 'wed', key: 'wed' },
  { label: 'thu', key: 'thu' },
  { label: 'fri', key: 'fri' },
  { label: 'sat', key: 'sat' },
  { label: 'sun', key: 'sun' },
];

function WeekPlanner({
  tasks,
  onSchedule,
}: {
  tasks: Task[];
  onSchedule: (id: string, scheduled_weekday: string | null) => void;
}) {
  const todayWeekday = useMemo(() => {
    const idx = new Date().getDay(); // 0=Sun, 6=Sat
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][idx]!;
  }, []);

  const open = tasks.filter((t) => t.status !== 'completed');
  const byDay = new Map<string, Task[]>();
  for (const d of WEEKDAY_COLUMNS) byDay.set(d.key, []);
  const unscheduled: Task[] = [];
  for (const t of open) {
    const wd = (t as any).scheduled_weekday as string | null | undefined;
    if (wd && byDay.has(wd)) {
      byDay.get(wd)!.push(t);
    } else if (!wd) {
      unscheduled.push(t);
    }
  }
  // Group each day's tasks by category so filming sits with filming, building
  // with building, admin with admin etc. Same order used everywhere else
  // (highest-strain-first to match the activity tracker picker on Today).
  const CATEGORY_ORDER: Record<string, number> = {
    filming: 0,
    operations: 1,
    scripting: 2,
    building: 3,
    admin: 4,
    other: 5,
  };
  function byCategoryThenStatus(a: Task, b: Task): number {
    const ca = CATEGORY_ORDER[a.category ?? 'other'] ?? 99;
    const cb = CATEGORY_ORDER[b.category ?? 'other'] ?? 99;
    if (ca !== cb) return ca - cb;
    // in_progress before pending inside the same category
    const sa = a.status === 'in_progress' ? 0 : 1;
    const sb = b.status === 'in_progress' ? 0 : 1;
    return sa - sb;
  }
  for (const arr of byDay.values()) arr.sort(byCategoryThenStatus);
  unscheduled.sort(byCategoryThenStatus);

  function onDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  }
  function makeDropHandler(target: string | null) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id) onSchedule(id, target);
    };
  }

  // Add-popover state: which day's "+" was last clicked. null = closed.
  // The popover shows all unscheduled (this-week-pickable) tasks; clicking
  // one schedules it to the active day.
  const [addOpenDay, setAddOpenDay] = useState<string | null>(null);

  return (
    <aside
      // Sticks in view as the master todo column on the right scrolls.
      // `top` matches the page's outer top padding so it lines up with
      // the rest of the layout.
      style={{
        position: 'sticky',
        top: 'var(--space-4)',
        alignSelf: 'start',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        // Cap height so a packed week column can scroll inside itself
        // without pushing the page off-screen.
        maxHeight: 'calc(100vh - var(--space-6))',
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      <header className="section__header" style={{ marginBottom: 'var(--space-2)' }}>
        <div className="section__title">
          <span className="eyebrow">this week</span>
          <h3 className="h3" style={{ margin: 0 }}>plan your week</h3>
        </div>
      </header>
      {WEEKDAY_COLUMNS.map((d) => {
        const items = byDay.get(d.key) ?? [];
        const isToday = d.key === todayWeekday;
        const isAddOpen = addOpenDay === d.key;
        return (
          <div
            key={d.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={makeDropHandler(d.key)}
            style={{
              background: isToday
                ? 'color-mix(in srgb, var(--recovery) 6%, var(--surface))'
                : 'var(--surface)',
              border: `1px solid ${isToday ? 'var(--recovery)' : 'var(--hairline)'}`,
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              position: 'relative',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: isToday ? 'var(--recovery)' : 'var(--muted)',
                    fontWeight: 700,
                  }}
                >
                  {d.label}{isToday ? ' · today' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted-2)', fontVariantNumeric: 'tabular-nums' }}>
                  {items.length}
                </span>
                <button
                  type="button"
                  onClick={() => setAddOpenDay(isAddOpen ? null : d.key)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-md)',
                    width: 22,
                    height: 22,
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  title={isAddOpen ? 'close picker' : 'add a task'}
                  aria-label="add task"
                >
                  {isAddOpen ? '×' : '+'}
                </button>
              </div>
            </header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((t) => (
                <PlannerTaskCard
                  key={t.id}
                  task={t}
                  onDragStart={(e) => onDragStart(e, t.id)}
                  onRemove={() => onSchedule(t.id, null)}
                />
              ))}
              {items.length === 0 && !isAddOpen && (
                <p className="muted" style={{ fontSize: 11, fontStyle: 'italic', margin: '6px 0 0' }}>
                  drag a task here, or click +
                </p>
              )}
            </div>
            {/* Add-task popover - a tight list of unscheduled tasks the
                user can click to assign to this day in one click. */}
            {isAddOpen && (
              <div
                style={{
                  marginTop: 4,
                  padding: 'var(--space-2)',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: 220,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {unscheduled.length === 0 ? (
                  <p className="muted" style={{ fontSize: 11, fontStyle: 'italic', margin: 4 }}>
                    nothing unscheduled. add tasks to your master todo first.
                  </p>
                ) : (
                  unscheduled.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => { onSchedule(t.id, d.key); setAddOpenDay(null); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        color: 'var(--text)',
                        fontSize: 12,
                        lineHeight: 1.35,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {t.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}

// Category → accent color. Mirrors ActivityTracker's CATEGORY_META so
// planner cards visually match the rest of the dashboard's category
// language (filming = blue strain, calls = amber, scripting = purple,
// building = green recovery, admin = muted grey).
const PLANNER_CATEGORY_COLOR: Record<string, string> = {
  filming:    'var(--strain)',
  operations: '#E6A52F',
  scripting:  '#A87BD9',
  building:   'var(--recovery)',
  admin:      'var(--muted)',
  other:      'var(--muted-2)',
};

function PlannerTaskCard({
  task,
  onDragStart,
  onRemove,
  compact,
}: {
  task: Task;
  onDragStart: (e: React.DragEvent) => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const accent = PLANNER_CATEGORY_COLOR[task.category] ?? 'var(--hairline)';
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        // Tinted background + colored border per category so similar
        // tasks visually group inside a day column.
        background: `color-mix(in srgb, ${accent} 12%, var(--surface))`,
        border: `1px solid ${accent}`,
        borderRadius: 'var(--radius-md)',
        padding: compact ? '6px 10px' : '8px 10px',
        fontSize: compact ? 11 : 12,
        lineHeight: 1.35,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        // Left edge stripe for an extra-quick visual scan when the
        // border alone doesn't pop on a dark bg.
        borderLeftWidth: 3,
      }}
      title={`${task.category} · ${task.title}`}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {task.title}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted-2)',
            padding: 0,
            fontSize: 13,
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="remove from this day"
        >×</button>
      )}
    </div>
  );
}

// ─── TaskComposer ────────────────────────────────────────────────────────
// Inline create-task strip at the top of the master todo. Title + category
// + (optional) project. Hits POST /api/tasks and lets the focus cache
// invalidate so the new row appears in the list immediately.
function TaskComposer({
  projectOptions,
  onCreate,
  pending,
}: {
  projectOptions: Array<{ id: string; name: string; kind: 'project' | 'client' }>;
  onCreate: (body: { title: string; category: TaskCategory; project_id?: string }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<TaskCategory>('other');
  const [projectId, setProjectId] = useState<string>('');

  function submit() {
    const t = title.trim();
    if (!t || pending) return;
    onCreate({
      title: t,
      category,
      ...(projectId ? { project_id: projectId } : {}),
    });
    // Reset for the next entry. Category + project stay - faster to
    // batch-add a few of the same kind in a row.
    setTitle('');
  }

  // Same category list + display labels the filter row uses, minus 'all'.
  const realCategories = CATEGORIES.filter((c): c is TaskCategory => c !== 'all');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 'var(--space-2)',
        padding: 'var(--space-2) var(--space-3)',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-3)',
        alignItems: 'stretch',
      }}
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
        }}
        placeholder="+ add a task to your master todo…"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontSize: 14,
          padding: '6px 8px',
          minWidth: 0,
          outline: 'none',
        }}
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TaskCategory)}
        title="category"
        style={{
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '4px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {realCategories.map((c) => (
          <option key={c} value={c}>{CATEGORY_DISPLAY[c] ?? c}</option>
        ))}
      </select>
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        title="project or client (optional)"
        style={{
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--text)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          padding: '4px 8px',
          fontSize: 12,
          cursor: 'pointer',
          maxWidth: 180,
        }}
      >
        <option value="">no project</option>
        {projectOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.kind === 'client' ? ' (client)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={!title.trim() || pending}
        className="btn"
        style={{
          background: title.trim() && !pending ? 'var(--recovery)' : 'rgba(255,255,255,0.04)',
          color: title.trim() && !pending ? 'var(--bg)' : 'var(--muted)',
          border: '1px solid',
          borderColor: title.trim() && !pending ? 'var(--recovery)' : 'var(--hairline)',
          fontSize: 12,
          fontWeight: 600,
          padding: '4px 14px',
          letterSpacing: '0.04em',
          cursor: title.trim() && !pending ? 'pointer' : 'not-allowed',
        }}
      >
        {pending ? 'adding…' : 'add'}
      </button>
    </div>
  );
}
