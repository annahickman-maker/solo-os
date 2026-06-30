import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useChat, type ChatMsg } from '../components/ChatProvider';
import { Markdown } from '../lib/Markdown';

export function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { messages, sending, context, currentId, send, startNew, loadThread, stop } = useChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync the route to the active thread.
  useEffect(() => {
    if (!id) {
      startNew();
      return;
    }
    if (id !== currentId) loadThread(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-scroll as content streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, [currentId]);

  // Auto-grow the composer as you type, up to a cap, then it scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [draft]);

  // Tick once a second while a turn is running, so the "working Ns" timer counts.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sending]);

  const submit = () => {
    if (!draft.trim() || sending) return;
    send(draft);
    setDraft('');
  };

  // Title from the first message the user actually sees - never the hidden run command.
  const visible = messages.filter((m) => !m.hidden);
  const title =
    messages.find((m) => m.role === 'user' && !m.hidden)?.content.slice(0, 70) ||
    (context ? context.replace(/^running \//, '') : '') ||
    'new chat';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 2 * var(--space-8))',
        maxWidth: 760,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--hairline)',
          flex: '0 0 auto',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>ask claude</span>
          <div style={{ fontSize: 'var(--body-lg)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: '0 0 auto' }}>
          <button type="button" onClick={() => navigate('/history')} style={ghostBtn}>
            history
          </button>
          <button type="button" onClick={startNew} style={ghostBtn}>
            + new chat
          </button>
        </div>
      </header>

      {context && (
        <div style={{ padding: 'var(--space-2) 0', fontSize: 'var(--body-sm)', color: 'var(--muted)', flex: '0 0 auto' }}>
          {context}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          padding: 'var(--space-5) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {visible.length === 0 ? (
          <div className="muted" style={{ fontSize: 'var(--body)', lineHeight: 1.6, maxWidth: '48ch', margin: 'auto 0' }}>
            runs on your own claude subscription, with your vault as context. ask it to pull your
            positioning, draft from a POV, run a skill, or "add this to my dashboard" - it writes real files.
          </div>
        ) : (
          visible.map((m) => <MessageBubble key={m.id} msg={m} now={now} />)
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          flex: '0 0 auto',
          paddingTop: 'var(--space-4)',
          borderTop: '1px solid var(--hairline)',
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="message claude..."
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            minHeight: 47,
            maxHeight: 200,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--ink)',
            padding: '12px 14px',
            fontSize: 'var(--body)',
            lineHeight: 1.5,
            outline: 'none',
          }}
        />
        {sending ? (
          <button
            type="button"
            onClick={stop}
            title="stop generating"
            aria-label="stop generating"
            style={{
              width: 47,
              height: 47,
              flex: '0 0 auto',
              padding: 0,
              background: 'var(--surface-2)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ width: 13, height: 13, borderRadius: 2, background: 'var(--muted)', display: 'block' }} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            style={{
              background: !draft.trim() ? 'var(--surface-2)' : 'var(--accent)',
              color: !draft.trim() ? 'var(--muted)' : '#06281b',
              borderRadius: 'var(--radius-md)',
              padding: '12px 20px',
              fontWeight: 600,
              fontSize: 'var(--body-sm)',
              cursor: !draft.trim() ? 'default' : 'pointer',
              flex: '0 0 auto',
            }}
          >
            send
          </button>
        )}
      </div>

      <style>{`@keyframes chatBlink { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.9; } }`}</style>
    </div>
  );
}

function MessageBubble({ msg, now }: { msg: ChatMsg; now: number }) {
  const isUser = msg.role === 'user';

  // User message: a quiet right-aligned bubble.
  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            maxWidth: '85%',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            fontSize: 'var(--body)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant: a clean "Worked Ns" line, then the reply rendered as real
  // formatting (no raw markdown), no tool noise.
  const secs = msg.pending
    ? Math.max(0, Math.round((now - (msg.startedAt ?? now)) / 1000))
    : Math.round((msg.elapsedMs ?? 0) / 1000);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--body-sm)', color: 'var(--muted)' }}>
        {msg.pending && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'chatBlink 1s infinite', flex: '0 0 auto' }} />}
        <span>{msg.pending ? `working ${secs}s` : `worked ${secs}s`}</span>
      </div>
      {msg.error ? (
        <div style={{ color: 'var(--danger)', fontSize: 'var(--body)', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
      ) : msg.content ? (
        <div style={{ fontSize: 'var(--body)', lineHeight: 1.65 }}>
          <Markdown text={msg.content} />
        </div>
      ) : null}
    </div>
  );
}

const ghostBtn = {
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--muted)',
  padding: '7px 14px',
  fontSize: 'var(--body-sm)',
  cursor: 'pointer',
} as const;
