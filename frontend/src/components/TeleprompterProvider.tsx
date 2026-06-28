import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

// Self-contained HTML for the pop-out. Talks to the opener window via
// postMessage: requests the current script on load, sends back every edit
// (debounced), and tells the opener when it closes.
const TELEPROMPTER_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>teleprompter</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0a0a0a; color: #f5f5f5; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }
  .wrap { display: flex; flex-direction: column; height: 100vh; }
  .toolbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #111; border-bottom: 1px solid #222; flex: 0 0 auto; }
  .toolbar button { background: #1a1a1a; color: #f5f5f5; border: 1px solid #2a2a2a; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 14px; font-family: inherit; }
  .toolbar button:hover { background: #262626; }
  .toolbar .size { min-width: 56px; text-align: center; color: #999; font-size: 13px; font-variant-numeric: tabular-nums; }
  .toolbar .spacer { flex: 1; }
  .toolbar .lbl { color: #777; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  textarea { flex: 1 1 auto; width: 100%; box-sizing: border-box; background: #0a0a0a; color: #f5f5f5; border: none; outline: none; padding: 48px 96px; line-height: 1.55; resize: none; font-family: inherit; caret-color: #f5f5f5; }
  textarea::selection { background: #2a3a55; }
</style>
</head>
<body>
<div class="wrap">
  <div class="toolbar">
    <span class="lbl">teleprompter</span>
    <div class="spacer"></div>
    <button id="dec" title="smaller (cmd -)">A−</button>
    <span class="size" id="sz">32px</span>
    <button id="inc" title="bigger (cmd +)">A+</button>
    <button id="close" title="close window">close</button>
  </div>
  <textarea id="t" spellcheck="false"></textarea>
</div>
<script>
  (function(){
    var t = document.getElementById('t');
    var sz = document.getElementById('sz');
    var size = parseInt(localStorage.getItem('teleprompter:size') || '32', 10);
    if (isNaN(size)) size = 32;
    function applySize(){ t.style.fontSize = size + 'px'; sz.textContent = size + 'px'; localStorage.setItem('teleprompter:size', String(size)); }
    applySize();
    document.getElementById('inc').onclick = function(){ size = Math.min(120, size + 4); applySize(); };
    document.getElementById('dec').onclick = function(){ size = Math.max(12, size - 4); applySize(); };
    document.getElementById('close').onclick = function(){ window.close(); };

    window.addEventListener('message', function(e){
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'teleprompter:init') {
        var next = e.data.script || '';
        if (t.value !== next) {
          var s = t.selectionStart, en = t.selectionEnd;
          t.value = next;
          try { t.setSelectionRange(s, en); } catch (_) {}
        }
      }
    });

    if (window.opener) {
      try { window.opener.postMessage({ type: 'teleprompter:ready' }, '*'); } catch (_) {}
    }

    var timer = null;
    t.addEventListener('input', function(){
      if (timer) clearTimeout(timer);
      timer = setTimeout(function(){
        if (window.opener) {
          try { window.opener.postMessage({ type: 'teleprompter:update', script: t.value }, '*'); } catch (_) {}
        }
      }, 200);
    });

    document.addEventListener('keydown', function(e){
      if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); size = Math.min(120, size + 4); applySize(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); size = Math.max(12, size - 4); applySize(); }
      else if ((e.metaKey || e.ctrlKey) && (e.key === '0')) { e.preventDefault(); size = 32; applySize(); }
    });

    window.addEventListener('beforeunload', function(){
      if (window.opener) {
        try { window.opener.postMessage({ type: 'teleprompter:closed' }, '*'); } catch (_) {}
      }
    });

    setTimeout(function(){ t.focus(); }, 50);
  })();
</script>
</body>
</html>`;

interface TeleprompterCtx {
  openVideoId: string | null;
  openFor: (videoId: string, script: string) => void;
  pushScript: (videoId: string, script: string) => void;
  isOpenFor: (videoId: string) => boolean;
}

// The teleprompter is a plain textarea, so markdown symbols render literally
// (`## Intro`, `**bold**`) and clutter the read. Scripts are meant to be read
// aloud, so strip the formatting to clean spoken text before it ever reaches
// the teleprompter - this also cleans up older scripts that still have it.
function cleanScript(s: string): string {
  return (s || '')
    .replace(/^﻿/, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')        // # headings -> plain line
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')      // ***bold italic***
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // **bold**
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1') // *italic*
    .replace(/^\s{0,3}[-*+]\s+/gm, '')          // -, * bullet markers
    .replace(/`([^`]+)`/g, '$1')                // `inline code`
    .replace(/^\s{0,3}>\s?/gm, '');             // > blockquote
}

const Ctx = createContext<TeleprompterCtx | null>(null);

export function useTeleprompter(): TeleprompterCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTeleprompter must be used inside TeleprompterProvider');
  return ctx;
}

export function TeleprompterProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const winRef = useRef<Window | null>(null);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);
  // Latest script per videoId. The window asks for this on `:ready`, and we
  // also use it to debounce-save edits back to the vault when the video page
  // isn't mounted.
  const scriptByVideoRef = useRef<Map<string, string>>(new Map());
  const openVideoIdRef = useRef<string | null>(null);
  openVideoIdRef.current = openVideoId;

  // Debounced save for edits coming from the teleprompter. Mirrors the same
  // 600ms cadence VideoDetail uses for its own autosave so the two behave the
  // same way; if VideoDetail is mounted it will see the invalidated query and
  // pick up the new value on its next initialize-from-server.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ videoId: string; script: string } | null>(null);
  const scheduleSave = useCallback(
    (videoId: string, script: string) => {
      pendingSaveRef.current = { videoId, script };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const pending = pendingSaveRef.current;
        if (!pending) return;
        api
          .updateVideo(pending.videoId, { script_content: pending.script })
          .then(() => {
            qc.invalidateQueries({ queryKey: ['video', pending.videoId] });
            qc.invalidateQueries({ queryKey: ['pipeline'] });
          })
          .catch(() => {});
      }, 600);
    },
    [qc],
  );

  // Global postMessage listener. Lives for the lifetime of the app so edits
  // continue to sync no matter which page the creator is on.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const win = winRef.current;
      if (!win || e.source !== win) return;
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      const videoId = openVideoIdRef.current;
      if (d.type === 'teleprompter:ready') {
        if (videoId) {
          const script = scriptByVideoRef.current.get(videoId) ?? '';
          win.postMessage({ type: 'teleprompter:init', script }, '*');
        }
      } else if (d.type === 'teleprompter:update') {
        const next = typeof d.script === 'string' ? d.script : '';
        if (videoId) {
          scriptByVideoRef.current.set(videoId, next);
          scheduleSave(videoId, next);
        }
      } else if (d.type === 'teleprompter:closed') {
        winRef.current = null;
        setOpenVideoId(null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [scheduleSave]);

  // Poll for native window close so the button state flips back.
  useEffect(() => {
    if (!openVideoId) return;
    const id = setInterval(() => {
      const win = winRef.current;
      if (!win || win.closed) {
        winRef.current = null;
        setOpenVideoId(null);
      }
    }, 800);
    return () => clearInterval(id);
  }, [openVideoId]);

  const openFor = useCallback((videoId: string, scriptRaw: string) => {
    const script = cleanScript(scriptRaw);
    scriptByVideoRef.current.set(videoId, script);
    const existing = winRef.current;
    if (existing && !existing.closed) {
      existing.focus();
      existing.postMessage({ type: 'teleprompter:init', script }, '*');
      setOpenVideoId(videoId);
      return;
    }
    const w = window.open('', 'teleprompter', 'width=960,height=760');
    if (!w) return;
    w.document.open();
    w.document.write(TELEPROMPTER_HTML);
    w.document.close();
    winRef.current = w;
    setOpenVideoId(videoId);
  }, []);

  const pushScript = useCallback((videoId: string, scriptRaw: string) => {
    const script = cleanScript(scriptRaw);
    scriptByVideoRef.current.set(videoId, script);
    const win = winRef.current;
    if (!win || win.closed) return;
    if (openVideoIdRef.current !== videoId) return;
    win.postMessage({ type: 'teleprompter:init', script }, '*');
  }, []);

  const isOpenFor = useCallback(
    (videoId: string) => {
      const win = winRef.current;
      return !!win && !win.closed && openVideoId === videoId;
    },
    [openVideoId],
  );

  const value = useMemo<TeleprompterCtx>(
    () => ({ openVideoId, openFor, pushScript, isOpenFor }),
    [openVideoId, openFor, pushScript, isOpenFor],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
