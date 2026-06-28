import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function History() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['chatThreads'], queryFn: api.chatThreads });
  const items = data?.items ?? [];

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await api.deleteChatThread(id);
    qc.invalidateQueries({ queryKey: ['chatThreads'] });
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-5)', maxWidth: 760 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="h2">chat history</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 'var(--body-sm)' }}>
            every chat you've had, saved to your vault. open one to keep going.
          </p>
        </div>
        <button type="button" onClick={() => navigate('/chat')} style={primaryBtn}>
          + new chat
        </button>
      </header>

      {isLoading ? (
        <div className="empty">loading</div>
      ) : items.length === 0 ? (
        <div className="empty">no chats yet. run a skill or start a new chat.</div>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          {items.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/chat/${t.id}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-4)',
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--body)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </div>
                <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
                  {t.messageCount} message{t.messageCount === 1 ? '' : 's'} · {relativeDate(t.updatedAt)}
                </div>
              </div>
              <button type="button" onClick={(e) => remove(e, t.id)} title="delete chat" style={deleteBtn}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const primaryBtn = {
  background: 'var(--ink)',
  color: 'var(--bg)',
  borderRadius: 'var(--radius-md)',
  padding: '8px 18px',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  flex: '0 0 auto',
} as const;

const deleteBtn = {
  background: 'transparent',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--muted)',
  padding: '6px 11px',
  fontSize: 'var(--body-sm)',
  cursor: 'pointer',
  flex: '0 0 auto',
} as const;
