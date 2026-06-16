// Floating to-do list that lives in a Document Picture-in-Picture window.
// The window stays on top of every other desktop app (incl. outside the
// browser), so you can tick tasks off while working in another tool.
// Chrome/Edge 116+.
//
// The PiP window is in the same JS context as the parent, so ticking a task
// in the floating window calls the same mutation as the main page - both
// stay in sync live.
//
// The component is named FloatingTimer for legacy import compatibility, but
// it's now a focus list, not a timer.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Task } from '../api';
import { CATEGORY_META } from './ActivityTracker';

type PipWindow = Window;

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: { width?: number; height?: number }) => Promise<PipWindow>;
      window: PipWindow | null;
    };
  }
}

export function FloatingFocusButton({ tasks }: { tasks: Task[] }) {
  const [pipWindow, setPipWindow] = useState<PipWindow | null>(null);
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  // Close the PiP window when the parent unmounts.
  useEffect(() => {
    return () => {
      pipWindow?.close();
    };
  }, [pipWindow]);

  async function openPip() {
    if (!window.documentPictureInPicture) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 480,
      });
      copyStyles(pip);
      pip.document.body.style.margin = '0';
      pip.document.body.style.background = 'var(--bg, #0a0a0a)';
      pip.document.body.style.color = 'var(--ink, #f4f1ea)';
      pip.document.title = 'focus';
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
    } catch (err) {
      window.alert(`could not open floating list: ${(err as Error).message}`);
    }
  }

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => (pipWindow ? pipWindow.close() : openPip())}
        title="float the to-do list above every other app so you can tick things off while working elsewhere"
        aria-label="pop out floating to-do list"
      >
        {pipWindow ? 'close pop-out' : 'pop out ↗'}
      </button>
      {pipWindow && createPortal(<FloatingTaskList tasks={tasks} />, pipWindow.document.body)}
    </>
  );
}

function FloatingTaskList({ tasks: initialTasks }: { tasks: Task[] }) {
  const qc = useQueryClient();
  // Keep the floating list in sync with the dashboard by reading the same
  // cache via useQuery. The parent's ['today'] query stays warm; we just
  // observe it. Falls back to the prop snapshot when the cache is empty.
  const { data } = useQuery({
    queryKey: ['today', 'floating-mirror'],
    queryFn: () => api.today(),
    initialData: { top_tasks: initialTasks, rings: null, greeting: '', date: '', focus_goal: null } as any,
    refetchInterval: 15000,
  });
  const tasks = (data?.top_tasks ?? initialTasks) as Task[];

  const updateTask = useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof api.updateTask>[1] }) =>
      api.updateTask(vars.id, vars.patch),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['focus'] });
    },
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        boxSizing: 'border-box',
        background: 'var(--bg, #0a0a0a)',
        color: 'var(--ink, #f4f1ea)',
        fontFamily: 'var(--font-display, system-ui)',
        padding: '14px 16px',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted, #888)',
          marginBottom: 8,
        }}
      >
        where the focus is
      </span>
      {tasks.length === 0 ? (
        <span style={{ color: 'var(--muted-2, #666)', fontSize: 12, fontStyle: 'italic' }}>
          no tasks queued for today
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto', flex: 1 }}>
          {tasks.map((t) => (
            <FloatingTaskRow
              key={t.id}
              task={t}
              onToggle={() =>
                updateTask.mutate({
                  id: t.id,
                  patch: { status: t.status === 'completed' ? 'pending' : 'completed' },
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FloatingTaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const cat = task.category ?? 'other';
  const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
  const done = task.status === 'completed';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--hairline, #2a2a2a)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? 'mark task as not done' : 'mark task as done'}
        style={{
          // Lock the checkbox to a 20x20 square. flex-shrink:0 stops it
          // collapsing horizontally; aspect-ratio:1 + matching min-height
          // stop it stretching vertically (otherwise stray button styles
          // from the parent's CSS can warp it into a tall oval).
          width: 20,
          height: 20,
          minWidth: 20,
          minHeight: 20,
          maxWidth: 20,
          maxHeight: 20,
          aspectRatio: '1 / 1',
          flexShrink: 0,
          flexGrow: 0,
          borderRadius: '50%',
          border: done ? 'none' : '1.5px solid var(--muted-2, #666)',
          background: done ? 'var(--recovery, #5bc97a)' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          boxSizing: 'border-box',
        }}
      >
        {done && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--bg, #0a0a0a)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: meta.color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: done ? 'var(--muted, #888)' : 'var(--ink, #f4f1ea)',
          textDecoration: done ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={task.title}
      >
        {task.title}
      </span>
    </div>
  );
}

// Mirror every stylesheet from the parent into the PiP window so CSS
// variables carry over. Inline sheets get their cssRules cloned; linked
// sheets get a fresh <link> tag.
function copyStyles(pip: PipWindow) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const cssRules = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join('\n');
      const style = pip.document.createElement('style');
      style.textContent = cssRules;
      pip.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pip.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        pip.document.head.appendChild(link);
      }
    }
  }
}
