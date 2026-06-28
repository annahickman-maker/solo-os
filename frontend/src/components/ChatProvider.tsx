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
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, chatStream, UnauthorizedError, type ChatEvent } from '../api';

// The in-dashboard chat is a full page (/chat/:id), not a sidebar. Threads are
// multi-turn (claude --resume keeps context) and saved to the vault, so you can
// reopen any past chat. It runs on the member's own Claude subscription with
// the vault as cwd, so "add this to my dashboard" writes a real file.

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: string[];
  status?: string;
  pending: boolean;
  error?: boolean;
  hidden?: boolean; // the auto run-command - kept for the model, not shown to the user
  startedAt?: number; // assistant turn start (for the "working Ns" timer)
  elapsedMs?: number; // final duration (for "Worked Ns")
}

// Shapes how every chat / skill run talks to the user: a warm human partner,
// not a tool dump. No file paths, no "running the skill" mechanics, no walls of
// markdown - just clean, conversational guidance.
const CHAT_SYSTEM = [
  "You are the user's creative partner speaking directly to them inside their own dashboard.",
  'Your VERY FIRST words in every conversation must be a warm greeting by their first name, like "Hey the creator," - then go straight into the work. Read the name from their vault if you need it.',
  'Do ALL reading, checking, and planning SILENTLY. Never narrate your process. Never output preamble like "let me read...", "now let me...", "I\'ve read...", "let me check...", "let me follow...", or any step-by-step commentary - not before the greeting, not between steps, not ever. The user only sees warm, human conversation; never the mechanics.',
  'Never paste file paths, internal ids, frontmatter, or say things like "running the skill" or "reading the file". Just do it and talk to them.',
  'HARD RULE: whenever you produce or save a deliverable - a sales page, a script, a description, an email, a carousel, a post, a plan, anything the user asked you to make - ALWAYS paste the FULL finished deliverable into the chat so they can read and copy it right here. Never just say it has been saved and stop, and never point them to a file to go open. They will not open files. Save it AND show the whole thing in the conversation.',
  'Talk like a warm, capable human - encouraging and natural.',
  'Keep formatting clean and minimal: short paragraphs, at most an occasional bold lead-in. Avoid long bullet lists and headers unless they ask.',
  'When you need input, ask for one thing at a time, conversationally.',
].join(' ');

interface OpenOpts {
  seed?: string;
  autosend?: boolean;
  context?: string;
}

interface ChatCtx {
  messages: ChatMsg[];
  sending: boolean;
  context: string | null;
  currentId: string | null;
  // Start a brand-new chat and run a skill / send a seed in it.
  openChat: (opts?: OpenOpts) => void;
  // Empty new chat (used by the "new chat" button / bare /chat route).
  startNew: () => void;
  // Hydrate an existing saved thread by id (used when reopening from history).
  loadThread: (id: string) => Promise<void>;
  send: (text: string, opts?: { hidden?: boolean }) => void;
  // Abort the in-flight turn (the chat "stop" button). Keeps whatever streamed
  // so far; lets the user immediately send something new.
  stop: () => void;
}

const Ctx = createContext<ChatCtx | null>(null);

export function useChat(): ChatCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function toolLabel(name: string): string {
  switch (name) {
    case 'Read':
      return 'reading files';
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return 'writing to the vault';
    case 'Bash':
      return 'running a command';
    case 'Grep':
    case 'Glob':
      return 'searching the vault';
    case 'WebFetch':
    case 'WebSearch':
      return 'searching the web';
    case 'Skill':
      return 'running a skill';
    case 'Task':
      return 'delegating to a subagent';
    case 'TodoWrite':
      return 'planning';
    default:
      return name;
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const turnsRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantId = useRef<string | null>(null);
  const dirtyRef = useRef(false); // a turn happened that should be persisted
  const messagesRef = useRef<ChatMsg[]>([]); // mirror of `messages` for the imperative flush
  const contextRef = useRef<string | null>(null); // mirror of `context`; saved as the thread title

  const resetState = useCallback((id: string | null) => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = id;
    turnsRef.current = 0;
    activeAssistantId.current = null;
    dirtyRef.current = false;
    setMessages([]);
    setSending(false);
    setContext(null);
    setCurrentId(id);
  }, []);

  const patchAssistant = useCallback((fn: (m: ChatMsg) => ChatMsg) => {
    const id = activeAssistantId.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const send = useCallback(
    (text: string, opts?: { hidden?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      if (!sessionIdRef.current) {
        sessionIdRef.current = uuid();
        setCurrentId(sessionIdRef.current);
      }
      const sessionId = sessionIdRef.current;
      const resume = turnsRef.current > 0;

      const userMsg: ChatMsg = { id: uuid(), role: 'user', content: trimmed, tools: [], pending: false, hidden: opts?.hidden };
      const assistantMsg: ChatMsg = { id: uuid(), role: 'assistant', content: '', tools: [], pending: true, startedAt: Date.now() };
      activeAssistantId.current = assistantMsg.id;
      dirtyRef.current = true;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setSending(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const onEvent = (e: ChatEvent) => {
        if (e.type === 'delta') {
          // Keep `pending` true while text streams - the "working Ns" timer
          // ticks off `pending`, so flipping it here froze the counter the
          // moment the first token arrived. It clears in `finally` when the
          // turn actually settles.
          patchAssistant((m) => ({ ...m, content: m.content + e.text, status: undefined }));
        } else if (e.type === 'tool') {
          patchAssistant((m) => ({ ...m, tools: [...m.tools, toolLabel(e.name)] }));
        } else if (e.type === 'status') {
          patchAssistant((m) => (m.content ? m : { ...m, status: e.label }));
        } else if (e.type === 'done') {
          patchAssistant((m) => ({ ...m, content: m.content || e.text || '(no response)', pending: false, status: undefined, error: e.isError }));
        } else if (e.type === 'error') {
          patchAssistant((m) => ({ ...m, content: m.content || `⚠ ${e.message}`, pending: false, status: undefined, error: true }));
        }
      };

      chatStream({ sessionId, message: trimmed, resume, system: CHAT_SYSTEM }, onEvent, ctrl.signal)
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          const msg = err instanceof UnauthorizedError ? 'session expired - refresh and log in again' : (err?.message ?? String(err));
          patchAssistant((m) => ({ ...m, content: m.content || `⚠ ${msg}`, pending: false, status: undefined, error: true }));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) turnsRef.current += 1;
          patchAssistant((m) => ({ ...m, pending: false, elapsedMs: Date.now() - (m.startedAt ?? Date.now()) }));
          setSending(false);
          activeAssistantId.current = null;
          abortRef.current = null;
        });
    },
    [sending, patchAssistant],
  );

  // Keep refs in sync with state so the imperative flush() reads the latest.
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { contextRef.current = context; }, [context]);

  // Build the saveable payload. Returns null when there's nothing worth saving
  // (need at least one user + one assistant message with content).
  const buildSave = (msgs: ChatMsg[]) => {
    const stored = msgs.filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content, hidden: m.hidden }));
    if (!stored.some((m) => m.role === 'user') || !stored.some((m) => m.role === 'assistant')) return null;
    return stored;
  };

  // Persist the thread after each completed turn (when sending settles). The
  // title is the chat context (e.g. the skill name) so skill runs show up as
  // "Idea Sharper" in history instead of the assistant's first narration line.
  useEffect(() => {
    if (sending || !dirtyRef.current) return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    const stored = buildSave(messages);
    if (!stored) return;
    dirtyRef.current = false;
    api
      .saveChatThread(sid, { sessionId: sid, title: contextRef.current || undefined, messages: stored })
      .then(() => qc.invalidateQueries({ queryKey: ['chatThreads'] }))
      .catch(() => {});
  }, [sending, messages, qc]);

  // Persist immediately before switching away, so a chat is never lost when the
  // user navigates mid-turn (the "timer looked frozen, so I clicked away" case).
  const flush = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid || !dirtyRef.current) return;
    const stored = buildSave(messagesRef.current);
    if (!stored) return;
    dirtyRef.current = false;
    api
      .saveChatThread(sid, { sessionId: sid, title: contextRef.current || undefined, messages: stored })
      .then(() => qc.invalidateQueries({ queryKey: ['chatThreads'] }))
      .catch(() => {});
  }, [qc]);

  const openChat = useCallback(
    (opts?: OpenOpts) => {
      flush();
      const id = uuid();
      resetState(id);
      setContext(opts?.context ?? null);
      navigate(`/chat/${id}`);
      if (opts?.seed && opts.autosend) {
        // send() reads sessionIdRef which resetState just set. The auto
        // run-command is hidden from the UI - the user sees the context chip +
        // the assistant's reply, not the raw "Run the X skill" plumbing.
        setTimeout(() => send(opts.seed!, { hidden: true }), 0);
      }
    },
    [navigate, resetState, send, flush],
  );

  const startNew = useCallback(() => {
    flush();
    const id = uuid();
    resetState(id);
    navigate(`/chat/${id}`);
  }, [navigate, resetState, flush]);

  const loadThread = useCallback(
    async (id: string) => {
      if (sessionIdRef.current === id) return; // already the active thread
      flush();
      resetState(id);
      try {
        const thread = await api.getChatThread(id);
        sessionIdRef.current = thread.sessionId || id;
        turnsRef.current = thread.messages.filter((m) => m.role === 'assistant').length;
        dirtyRef.current = false;
        setMessages(
          thread.messages.map((m) => ({ id: uuid(), role: m.role, content: m.content, tools: [], pending: false, hidden: m.hidden })),
        );
        setCurrentId(id);
      } catch {
        // not found - leave it as an empty new chat under this id
      }
    },
    [resetState, flush],
  );

  // Stop the in-flight turn. Aborting rejects the stream; its `.catch` returns
  // quietly (no error message) and `finally` settles sending/pending + saves
  // elapsed, so whatever streamed so far stays as a finished message and the
  // composer frees up for a new message immediately.
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const value = useMemo<ChatCtx>(
    () => ({ messages, sending, context, currentId, openChat, startNew, loadThread, send, stop }),
    [messages, sending, context, currentId, openChat, startNew, loadThread, send, stop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
