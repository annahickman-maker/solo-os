import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { InboxItem, InboxResponse } from '../api';
import { StatusPill } from '../components/StatusPill';
import { formatRelative } from '../lib/format';
import { TranscriptPanel, TX_CSS } from './Archive';

const SOURCE_LABEL: Record<string, string> = {
  skool_reply: 'skool reply',
  zoom_transcript: 'zoom transcript',
  flagged_review: 'flagged review',
  manual: 'from claude',
  transcript: 'new transcript',
};

const SOURCE_TONE: Record<string, 'default' | 'success' | 'warning' | 'accent'> = {
  skool_reply: 'accent',
  zoom_transcript: 'warning',
  flagged_review: 'default',
  manual: 'success',
  transcript: 'accent',
};

export function Inbox() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Transcript inbox items open the same vault view (TranscriptPanel) by id.
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['inbox'],
    queryFn: api.inbox,
    // Poll while the page is open so Zoom transcripts the background sync
    // dropped just now show up without forcing a manual refresh.
    refetchInterval: 60_000,
  });

  const mark = useMutation({
    mutationFn: (vars: { id: string; status: 'done' | 'dismissed' }) =>
      api.updateInboxItem(vars.id, { status: vars.status }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['inbox'] });
      const prev = qc.getQueryData<InboxResponse>(['inbox']);
      if (prev) {
        qc.setQueryData<InboxResponse>(['inbox'], {
          ...prev,
          items: prev.items.filter((i) => i.id !== vars.id),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['inbox'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['inbox'] }),
  });

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (error) {
    return <div className="empty">couldn't load inbox: {(error as Error).message}</div>;
  }

  const items = (data?.items ?? []).filter((i) => i.status === 'pending');

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header className="page-header">
        <span className="eyebrow">inbox</span>
        <h1 className="h2">things waiting on you</h1>
      </header>

      {isLoading ? (
        <div className="empty">loading</div>
      ) : items.length === 0 ? (
        <div className="empty">inbox zero</div>
      ) : (
        <div className="stack">
          {items.map((it) => (
            <InboxRow
              key={it.id}
              item={it}
              open={openId === it.id}
              onToggle={() => setOpenId(openId === it.id ? null : it.id)}
              onCopy={() => copy(it.body ?? it.title, it.id)}
              copied={copied === it.id}
              onDone={() => mark.mutate({ id: it.id, status: 'done' })}
              onDismiss={() => mark.mutate({ id: it.id, status: 'dismissed' })}
              onOpenTranscript={() => it.transcript_id && setOpenTranscript(it.transcript_id)}
            />
          ))}
        </div>
      )}

      {openTranscript && (
        <>
          {/* The panel's styles live in a page-scoped <style> on Archive; inject
              them here so the same vault view renders correctly from the Inbox. */}
          <style>{TX_CSS}</style>
          <TranscriptPanel id={openTranscript} onClose={() => setOpenTranscript(null)} />
        </>
      )}
    </div>
  );
}

function InboxRow({
  item,
  open,
  onToggle,
  onCopy,
  copied,
  onDone,
  onDismiss,
  onOpenTranscript,
}: {
  item: InboxItem;
  open: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  onDone: () => void;
  onDismiss: () => void;
  onOpenTranscript: () => void;
}) {
  const isTranscript = item.source === 'transcript';
  const hasBody = !isTranscript && !!item.body && item.body.trim().length > 0;
  return (
    <div
      style={{
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--hairline)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <StatusPill
          status={SOURCE_LABEL[item.source] ?? item.source}
          tone={SOURCE_TONE[item.source] ?? 'default'}
        />
        <button
          type="button"
          onClick={isTranscript ? onOpenTranscript : hasBody ? onToggle : undefined}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            cursor: isTranscript || hasBody ? 'pointer' : 'default',
          }}
        >
          <div className="stack" style={{ gap: 2 }}>
            <span style={{ wordBreak: 'break-word' }}>{item.title}</span>
            <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
              {formatRelative(item.created_at)}
              {isTranscript ? ' · click to open' : hasBody ? (open ? ' · hide' : ' · click to read') : ''}
            </span>
          </div>
        </button>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="btn btn--ghost"
            aria-label="open source"
          >
            <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M5.5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8.5M8 2h4v4M7 7l5-5"
                stroke="currentColor"
                strokeWidth={1.25}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
        {hasBody && (
          <button className="btn" onClick={onCopy}>
            {copied ? 'copied' : 'copy'}
          </button>
        )}
        <button className="btn btn--primary" onClick={onDone}>
          done
        </button>
        <button className="btn btn--ghost" onClick={onDismiss}>
          dismiss
        </button>
      </div>
      {open && hasBody && (
        <div
          style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-md)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--body)',
            lineHeight: 1.6,
          }}
        >
          {item.body}
        </div>
      )}
    </div>
  );
}
