import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeepWorkBlock } from '../api';

// Floating timer that lives in a Document Picture-in-Picture window. The
// window stays on top of every other desktop app (incl. outside the browser),
// so the creator can run her timer while editing in another tool. Chrome/Edge 116+.
//
// The PiP window is in the same JS context as the parent, so clicking
// "finish" inside the floating window calls the same onFinish prop and
// updates the dashboard immediately.

type PipWindow = Window;

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (opts?: { width?: number; height?: number }) => Promise<PipWindow>;
      window: PipWindow | null;
    };
  }
}

export function FloatingTimerButton({
  block,
  onFinish,
  finishing,
}: {
  block: DeepWorkBlock;
  onFinish: () => void;
  finishing: boolean;
}) {
  const [pipWindow, setPipWindow] = useState<PipWindow | null>(null);
  const supported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  // When the active block disappears (finish/delete) - close the PiP window
  // so it doesn't dangle. Same for unmount.
  useEffect(() => {
    return () => {
      pipWindow?.close();
    };
  }, [pipWindow]);

  async function openPip() {
    if (!window.documentPictureInPicture) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 280,
        height: 160,
      });
      copyStyles(pip);
      pip.document.body.style.margin = '0';
      pip.document.body.style.background = 'var(--bg, #0a0a0a)';
      pip.document.body.style.color = 'var(--ink, #f4f1ea)';
      pip.document.title = 'timer';
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
    } catch (err) {
      window.alert(`could not open floating timer: ${(err as Error).message}`);
    }
  }

  if (!supported) return null;

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => (pipWindow ? pipWindow.close() : openPip())}
        title="pop the timer out into a floating window that stays on top of every app"
        aria-label="pop out floating timer"
      >
        {pipWindow ? 'close pop-out' : 'pop out ↗'}
      </button>
      {pipWindow &&
        createPortal(
          <FloatingTimerBody
            block={block}
            onFinish={() => {
              onFinish();
              pipWindow.close();
            }}
            finishing={finishing}
          />,
          pipWindow.document.body
        )}
    </>
  );
}

function FloatingTimerBody({
  block,
  onFinish,
  finishing,
}: {
  block: DeepWorkBlock;
  onFinish: () => void;
  finishing: boolean;
}) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = Math.max(0, now - block.started_at);
  const hh = Math.floor(elapsed / 3600);
  const mm = Math.floor((elapsed % 3600) / 60);
  const ss = elapsed % 60;
  const label = block.task_title ?? block.label ?? 'focus block';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        gap: 10,
        padding: 14,
        boxSizing: 'border-box',
        background: 'var(--bg, #0a0a0a)',
        color: 'var(--ink, #f4f1ea)',
        fontFamily: 'var(--font-display, system-ui)',
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted, #888)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontWeight: 700,
          fontSize: 'clamp(2rem, 14vw, 3.4rem)',
          letterSpacing: '-0.04em',
          color: 'var(--sleep, #9DB7D1)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hh > 0 ? `${hh}:` : ''}
        {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
      </span>
      <button
        type="button"
        onClick={onFinish}
        disabled={finishing}
        style={{
          marginTop: 4,
          padding: '8px 16px',
          borderRadius: 999,
          border: '1px solid var(--hairline, #333)',
          background: 'var(--ink, #f4f1ea)',
          color: 'var(--bg, #0a0a0a)',
          fontWeight: 600,
          fontSize: 13,
          cursor: finishing ? 'wait' : 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        {finishing ? 'finishing…' : 'finish activity'}
      </button>
    </div>
  );
}

// Mirror every stylesheet in the parent into the PiP window so CSS variables
// (theme colors, fonts) carry over. Inline sheets get cloned via cssRules;
// linked sheets get a fresh <link> tag.
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
