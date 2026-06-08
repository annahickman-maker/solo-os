import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ExtractedQuote, type QuoteTag, type AudienceQuote, type AudienceQuoteCategory, type OfferAvatar } from '../api';
import { TagChips } from '../components/TagChips';

export function Archive() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Lock body scroll while panel is open (Reputation does the same implicitly via overlay).
  useEffect(() => {
    if (!selectedId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selectedId]);

  return (
    <>
      <style>{TX_CSS}</style>
      <div className="stack" style={{ gap: 'var(--space-7)' }}>
        <header className="page-header">
          <span className="eyebrow">vault</span>
          <h1 className="h2">transcripts</h1>
        </header>
        <TranscriptDropZone />
        <TranscriptList onSelect={setSelectedId} />
      </div>
      {selectedId && (
        <TranscriptPanel id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

// ─── Drop zone ────────────────────────────────────────────────────────────
// Drag-and-drop or click-to-pick transcript files. The server auto-
// categorises by filename pattern (yt-* / workshop* / client* / fallback
// QA), saves to the correct vault folder, then we kick off extraction
// immediately so the new transcript shows up as "processed" without
// Anna needing to open the panel and click Extract.
function TranscriptDropZone() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<Array<{ name: string; status: 'uploading' | 'extracting' | 'done' | 'error'; message?: string }>>([]);
  const inputRef = useState<{ el: HTMLInputElement | null }>({ el: null })[0];

  const upload = useMutation({
    mutationFn: async (file: File) => api.uploadTranscript(file),
  });

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    // Seed queue rows so Anna sees each file's progress in real time.
    setQueue((prev) => [...prev, ...arr.map((f) => ({ name: f.name, status: 'uploading' as const }))]);

    for (const file of arr) {
      try {
        const res = await upload.mutateAsync(file);
        setQueue((prev) =>
          prev.map((q) => (q.name === file.name && q.status === 'uploading' ? { ...q, status: 'extracting' as const } : q)),
        );
        // Refresh the list so the new file appears immediately.
        qc.invalidateQueries({ queryKey: ['archive-transcripts'] });
        // Kick off extraction (POVs, audience quotes, etc). Best-effort:
        // if the bridge isn't up or extraction fails, the row still
        // appears - Anna can re-run from the panel.
        if (res.id) {
          try {
            await api.runExtraction(res.id);
          } catch (err: any) {
            // Mark as done-with-warning rather than full error.
            setQueue((prev) =>
              prev.map((q) =>
                q.name === file.name
                  ? { ...q, status: 'done' as const, message: `uploaded · extraction failed (run manually): ${err?.message ?? err}` }
                  : q,
              ),
            );
            continue;
          }
        }
        setQueue((prev) =>
          prev.map((q) => (q.name === file.name ? { ...q, status: 'done' as const, message: `saved as ${res.type}${res.auto_detected_type ? ' (auto)' : ''}` } : q)),
        );
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((q) => (q.name === file.name ? { ...q, status: 'error' as const, message: err?.message ?? 'upload failed' } : q)),
        );
      }
    }
    // Auto-clear completed rows after 6s so the zone doesn't accumulate
    // stale status forever. Errors stay until manually dismissed.
    setTimeout(() => {
      setQueue((prev) => prev.filter((q) => q.status === 'error' || q.status === 'uploading' || q.status === 'extracting'));
    }, 6000);
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.el?.click()}
      style={{
        border: `2px dashed ${dragging ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        textAlign: 'center',
        cursor: 'pointer',
        background: dragging ? 'color-mix(in srgb, var(--recovery) 6%, transparent)' : 'rgba(255,255,255,0.02)',
        transition: 'all 0.15s',
      }}
    >
      <input
        ref={(el) => { inputRef.el = el; }}
        type="file"
        multiple
        accept=".md,.txt,.vtt,.srt"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = ''; // allow re-picking the same file
        }}
      />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 6,
          color: dragging ? 'var(--recovery)' : 'var(--text)',
          letterSpacing: '-0.01em',
        }}
      >
        {dragging ? 'drop to upload' : 'drop transcripts here or click to pick'}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
        .md · .txt · .vtt · .srt — category is auto-detected from the filename (yt-* → video, workshop* → workshop, client* → client, fallback → Q&A). extraction runs automatically once the file lands.
      </p>

      {queue.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
          {queue.map((q, i) => (
            <div
              key={`${q.name}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                border: `1px solid ${q.status === 'error' ? '#ff6b6b' : q.status === 'done' ? 'color-mix(in srgb, var(--recovery) 25%, var(--hairline))' : 'var(--hairline)'}`,
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                {q.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color:
                    q.status === 'error' ? '#ff6b6b'
                    : q.status === 'done' ? 'var(--recovery)'
                    : 'var(--muted)',
                  flexShrink: 0,
                }}
                title={q.message}
              >
                {q.status === 'uploading' ? 'uploading…'
                  : q.status === 'extracting' ? 'extracting…'
                  : q.status === 'done' ? `✓ ${q.message ?? 'done'}`
                  : `✕ ${q.message ?? 'error'}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── List ──────────────────────────────────────────────────────────────────

const CATEGORY_ORDER: Array<{ key: string; label: string; color: string }> = [
  { key: 'qa', label: 'Q&A calls', color: 'var(--recovery)' },
  { key: 'workshop', label: 'Live workshops', color: '#E6A52F' },
  { key: 'video', label: 'YouTube videos', color: 'var(--sleep)' },
  { key: 'client', label: 'Client calls', color: 'var(--strain)' },
];

type TranscriptItem = {
  id: string;
  filename: string;
  title?: string;
  type: string;
  date?: number | null;
  processed: number;
  summary?: string;
  youtube_url?: string | null;
  has_raw?: boolean;
};

function TranscriptList({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['archive-transcripts'],
    queryFn: api.archiveTranscripts,
  });

  const grouped = useMemo(() => {
    const items = (data?.items ?? []) as TranscriptItem[];
    const byType = new Map<string, TranscriptItem[]>();
    for (const it of items) {
      const arr = byType.get(it.type) ?? [];
      arr.push(it);
      byType.set(it.type, arr);
    }
    return CATEGORY_ORDER
      .filter((c) => byType.has(c.key))
      .map((c) => ({ ...c, items: byType.get(c.key)! }));
  }, [data]);

  if (isLoading) return <div className="empty">loading</div>;
  if (!grouped.length) return <div className="empty">no transcripts yet</div>;
  const total = grouped.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      <div className="tx-meta">
        {total} transcript{total === 1 ? '' : 's'} across {grouped.length} categor{grouped.length === 1 ? 'y' : 'ies'}
      </div>
      {grouped.map((g) => (
        <section key={g.key} className="stack" style={{ gap: 'var(--space-4)' }}>
          <header
            className="tx-cat-head"
            style={{ borderBottomColor: `color-mix(in srgb, ${g.color} 25%, transparent)` }}
          >
            <h2 className="tx-cat-title" style={{ color: g.color }}>
              {g.label}
            </h2>
            <span className="tx-meta">{g.items.length}</span>
          </header>
          <div className="tx-rows">
            {g.items.map((t) => (
              <TranscriptRow key={t.id} item={t} onSelect={() => onSelect(t.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TranscriptRow({ item, onSelect }: { item: TranscriptItem; onSelect: () => void }) {
  const cleanName = item.title ?? item.filename.replace(/\.(md|txt)$/, '');
  const isVerbatim = item.type === 'video' || item.has_raw === true;
  return (
    <button type="button" onClick={onSelect} className="tx-row">
      <span className="tx-row__name">{cleanName}</span>
      <span className={`tx-badge ${isVerbatim ? 'tx-badge--ok' : 'tx-badge--muted'}`}>
        {isVerbatim ? 'verbatim' : 'summary'}
      </span>
      {item.date ? (
        <span className="tx-row__date">
          {new Date(item.date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
        </span>
      ) : null}
    </button>
  );
}

// ─── Panel ─────────────────────────────────────────────────────────────────

const TAG_META: Record<QuoteTag, { label: string; color: string }> = {
  'pov': { label: 'POV', color: 'var(--sleep)' },
  'value': { label: 'Value', color: 'var(--recovery)' },
  'authority': { label: 'Authority', color: 'var(--strain)' },
  'connection': { label: 'Connection', color: 'var(--hrv)' },
};

const TYPE_COLOR: Record<string, string> = {
  qa: 'var(--recovery)',
  workshop: '#E6A52F',
  video: 'var(--sleep)',
  client: 'var(--strain)',
};

const TYPE_LABEL: Record<string, string> = {
  qa: 'Q&A call',
  workshop: 'live workshop',
  video: 'YouTube video',
  client: 'client call',
};

function TranscriptPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: transcript, isLoading: tLoading } = useQuery({
    queryKey: ['transcript', id],
    queryFn: () => api.getTranscript(id),
  });
  const { data: extractsData, isLoading: qLoading } = useQuery({
    queryKey: ['extracts', id],
    queryFn: () => api.listExtracts(id),
  });
  const qc = useQueryClient();
  const runExtract = useMutation({
    mutationFn: () => api.runExtract(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extracts', id] }),
  });

  const allQuotes = extractsData?.quotes ?? [];
  const visible = allQuotes.filter((q) => q.status !== 'dismissed');
  const stories = visible.filter((q) => q.kind === 'story');
  const quotes = visible.filter((q) => q.kind !== 'story');

  // Multi-select state for combining individual quotes into a story
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Clear selection when transcript changes
  useEffect(() => { setSelectedIds(new Set()); }, [id]);
  const toggleSelect = (qid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const combine = useMutation({
    mutationFn: () => api.combineExtracts(id, [...selectedIds]),
    onSuccess: () => {
      clearSelection();
      qc.invalidateQueries({ queryKey: ['extracts', id] });
    },
  });
  // Summary lives in the summary file (the one in the parent transcript folder),
  // not the raw transcript. Backend returns it separately as `summary_content`.
  const summary = useMemo(
    () => extractSummary(transcript?.summary_content ?? transcript?.content ?? ''),
    [transcript]
  );
  const dimColor = TYPE_COLOR[transcript?.type ?? ''] ?? 'var(--recovery)';
  const title = transcript?.title ?? transcript?.filename?.replace(/\.(md|txt)$/, '') ?? '...';
  const dateLabel = transcript?.date
    ? new Date(transcript.date * 1000).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside
        className="rep-panel tx-panel"
        style={{ '--dim-c': dimColor } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow" style={{ color: dimColor }}>
              {TYPE_LABEL[transcript?.type ?? ''] ?? 'transcript'}
            </span>
            <h2 className="rep-panel__title">{title}</h2>
            {dateLabel && <p className="rep-panel__def">{dateLabel}</p>}
          </div>
          <div className="rep-panel__head-r">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>
              close
            </button>
          </div>
        </header>

        {/* Summary */}
        <section className="rep-section">
          <header className="rep-section__head">
            <h3 className="rep-section__title">summary</h3>
            <p className="rep-section__sub">
              the post / recap ready to copy. for Q&A calls this is the Skool community post; for strategy calls it's the email recap.
            </p>
          </header>
          {tLoading ? (
            <p className="rep-section__sub">loading…</p>
          ) : summary ? (
            <div className="rep-card rep-card--inline">
              <div className="tx-summary">{summary}</div>
              <div className="rep-actions">
                <button
                  type="button"
                  className="rep-btn rep-btn--ghost"
                  onClick={() => navigator.clipboard.writeText(summary)}
                >
                  copy
                </button>
              </div>
            </div>
          ) : (
            <p className="rep-section__sub">no summary section in this file</p>
          )}
        </section>

        {/* Extractor */}
        <section className="rep-section">
          <header className="rep-section__head" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--space-3)' }}>
            <div className="stack" style={{ gap: 4 }}>
              <h3 className="rep-section__title">extracted quotes</h3>
              <p className="rep-section__sub">
                claude pulls verbatim quotes from anna only and tags each one. edit, change the tag, then approve to bank or queue to instagram.
              </p>
            </div>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => runExtract.mutate()}
              disabled={runExtract.isPending}
            >
              {runExtract.isPending ? 'extracting…' : visible.length ? 're-extract' : 'extract quotes'}
            </button>
          </header>
          {runExtract.isPending && (
            <p className="rep-section__sub">
              this takes 1-4 minutes depending on transcript length. claude is reading the whole thing and writing JSON. keep this tab open.
            </p>
          )}
          {runExtract.isError && (
            <p className="rep-section__sub" style={{ color: '#ff6b6b' }}>
              extract failed: {(runExtract.error as Error)?.message ?? String(runExtract.error)}
            </p>
          )}
          {qLoading ? (
            <p className="rep-section__sub">loading…</p>
          ) : visible.length === 0 ? (
            <p className="rep-section__sub">no quotes yet. click extract to scan the transcript.</p>
          ) : (
            <div className="stack" style={{ gap: 'var(--space-5)' }}>
              {stories.length > 0 && (
                <div className="stack" style={{ gap: 'var(--space-3)' }}>
                  <h4 className="tx-subsection">
                    synthesized stories <span className="tx-meta">{stories.length}</span>
                  </h4>
                  <p className="rep-section__sub" style={{ marginTop: -4 }}>
                    related quotes from this transcript woven into cohesive pieces, fillers stripped, anna's words preserved. select a story + extra quotes to merge them.
                  </p>
                  <div className="rep-list">
                    {stories.map((s) => (
                      <QuoteCard
                        key={s.id}
                        q={s}
                        transcriptId={id}
                        selected={selectedIds.has(s.id)}
                        onToggleSelect={() => toggleSelect(s.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {quotes.length > 0 && (
                <div className="stack" style={{ gap: 'var(--space-3)' }}>
                  <h4 className="tx-subsection">
                    individual quotes <span className="tx-meta">{quotes.length}</span>
                  </h4>
                  <p className="rep-section__sub" style={{ marginTop: -4 }}>
                    standalone verbatim moments. fillers preserved. select 2+ to combine into a new story.
                  </p>
                  <div className="rep-list">
                    {quotes.map((q) => (
                      <QuoteCard
                        key={q.id}
                        q={q}
                        transcriptId={id}
                        selected={selectedIds.has(q.id)}
                        onToggleSelect={() => toggleSelect(q.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Audience quotes - separate from the creator's quotes above */}
        <AudienceQuotesSection transcriptId={id} />

        {/* Raw transcript */}
        <section className="rep-section">
          <details className="tx-details">
            <summary className="tx-details__summary">
              <span className="rep-section__title">full transcript</span>
              <span className="rep-section__sub" style={{ marginLeft: 12 }}>click to expand</span>
            </summary>
            <div className="rep-card rep-card--inline tx-transcript">
              {transcript?.content ?? '...'}
            </div>
          </details>
        </section>

        {/* Floating combine bar - appears when 2+ quotes selected */}
        {selectedIds.size >= 2 && (
          <div className="tx-combine-bar">
            <span className="tx-meta">{selectedIds.size} selected</span>
            <button type="button" className="rep-btn rep-btn--ghost" onClick={clearSelection}>
              clear
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => combine.mutate()}
              disabled={combine.isPending}
            >
              {combine.isPending ? 'combining…' : `combine into story`}
            </button>
          </div>
        )}
        {combine.isError && (
          <p className="rep-section__sub" style={{ color: '#ff6b6b' }}>
            combine failed: {String(combine.error)}
          </p>
        )}
      </aside>
    </div>
  );
}

// =========================================================================
// Audience-quote extraction - quotes spoken BY audience members in transcripts
// =========================================================================
function AudienceQuotesSection({ transcriptId }: { transcriptId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['audience-quotes', transcriptId],
    queryFn: () => api.listAudienceQuotes({ transcript_id: transcriptId }),
  });
  // Avatars come from the offers payload (we already serve them on the avatar
  // section of /api/offers). One query, used here for the per-quote dropdown.
  const { data: offers } = useQuery({ queryKey: ['offers'], queryFn: api.offers });
  const avatars: OfferAvatar[] =
    offers?.sections.find((s) => s.id === 'avatar')?.avatars ?? [];

  const runExtract = useMutation({
    mutationFn: () => api.runAudienceExtract(transcriptId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audience-quotes', transcriptId] }),
  });

  const quotes = (data?.quotes ?? []).filter((q) => q.status !== 'dismissed');
  const grouped: Record<AudienceQuoteCategory, AudienceQuote[]> = {
    struggle: quotes.filter((q) => q.category === 'struggle'),
    desire: quotes.filter((q) => q.category === 'desire'),
    win: quotes.filter((q) => q.category === 'win'),
  };

  return (
    <section className="rep-section">
      <header
        className="rep-section__head"
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 'var(--space-3)' }}
      >
        <div className="stack" style={{ gap: 4 }}>
          <h3 className="rep-section__title">extract quotes from audience</h3>
          <p className="rep-section__sub">
            claude pulls verbatim quotes spoken by students / callers / clients in this transcript - NOT anna. attach each quote to an avatar, sort into struggle / want, and push the gold ones to your proof bank.
          </p>
        </div>
        <button
          type="button"
          className="rep-btn rep-btn--primary"
          onClick={() => runExtract.mutate()}
          disabled={runExtract.isPending}
        >
          {runExtract.isPending ? 'extracting…' : quotes.length > 0 ? 're-extract' : 'extract audience quotes'}
        </button>
      </header>
      {runExtract.isPending && (
        <p className="rep-section__sub">
          claude is reading the transcript to find audience speech. takes 1-4 minutes. keep this tab open.
        </p>
      )}
      {runExtract.isError && (
        <p className="rep-section__sub" style={{ color: '#ff6b6b' }}>
          extract failed: {(runExtract.error as Error)?.message ?? String(runExtract.error)}
        </p>
      )}
      {isLoading ? (
        <p className="rep-section__sub">loading…</p>
      ) : quotes.length === 0 ? (
        <p className="rep-section__sub">
          no audience quotes yet. click extract to scan the transcript for non-anna speech.
        </p>
      ) : (
        <div className="stack" style={{ gap: 'var(--space-5)' }}>
          {(['struggle', 'desire', 'win'] as AudienceQuoteCategory[]).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const meta: Record<AudienceQuoteCategory, { label: string; color: string; sub: string }> = {
              struggle: { label: 'what they struggle with', color: 'var(--strain)', sub: 'pain points + obstacles they\'re dealing with right now' },
              desire: { label: 'what they desire', color: 'var(--recovery)', sub: 'outcomes + aspirations they speak about' },
              win: { label: 'wins', color: 'var(--hrv)', sub: 'positive outcomes / transformations they\'ve already experienced - testimonial material' },
            };
            return (
              <div key={cat} className="stack" style={{ gap: 'var(--space-3)' }}>
                <header
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    borderBottom: `1px solid color-mix(in srgb, ${meta[cat].color} 25%, var(--hairline))`,
                    paddingBottom: 6,
                  }}
                >
                  <span style={{ color: meta[cat].color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 11 }}>
                    {meta[cat].label} <span style={{ color: 'var(--muted-2)', marginLeft: 6 }}>{items.length}</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{meta[cat].sub}</span>
                </header>
                <div className="rep-list">
                  {items.map((q) => (
                    <AudienceQuoteRow key={q.id} quote={q} avatars={avatars} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AudienceQuoteRow({ quote, avatars }: { quote: AudienceQuote; avatars: OfferAvatar[] }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<Pick<AudienceQuote, 'category' | 'avatar_id' | 'status' | 'text' | 'speaker_label' | 'title'>>) =>
      api.updateAudienceQuote(quote.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audience-quotes', quote.source_transcript_id] });
      // Avatar struggles/outcomes are updated server-side - refresh /api/offers
      // so the avatar editor reflects new entries.
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
  // Inline edit of the quote text. Mirrors the click-to-edit pattern on the
  // other QuoteCard - click the text, edit in a textarea, save on blur/enter.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(quote.text);
  useEffect(() => { if (!editing) setDraft(quote.text); }, [quote.text, editing]);
  function commitText() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== quote.text.trim()) {
      update.mutate({ text: draft.trim() });
    }
  }
  const toProof = useMutation({
    mutationFn: () => api.audienceQuoteToProofBank(quote.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audience-quotes', quote.source_transcript_id] });
      qc.invalidateQueries({ queryKey: ['reputation'] });
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteAudienceQuote(quote.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audience-quotes', quote.source_transcript_id] }),
  });

  const alreadyInProof = !!quote.approved_proof_id;

  return (
    <article
      style={{
        background: 'var(--surface)',
        border: `1px solid ${alreadyInProof ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          {quote.speaker_label}
          {quote.timestamp && <span style={{ color: 'var(--muted-2)', marginLeft: 8 }}>{quote.timestamp}</span>}
        </span>
        {alreadyInProof && (
          <span style={{ fontSize: 10, color: 'var(--recovery)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            ★ in proof bank
          </span>
        )}
      </div>
      {/* Title comes first as the headline summary - audience voice, no
          avatar names. Click to edit. */}
      <EditableTitle
        value={quote.title}
        onSave={(v) => update.mutate({ title: v })}
      />
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitText(); }
            if (e.key === 'Escape') { setEditing(false); setDraft(quote.text); }
          }}
          rows={Math.max(2, Math.ceil(draft.length / 70))}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--recovery)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--ink)',
            padding: 'var(--space-2)',
            fontFamily: 'inherit',
            fontSize: 'var(--body)',
            lineHeight: 1.55,
            outline: 'none',
            resize: 'vertical',
          }}
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          title="click to edit"
          style={{
            margin: '0 -4px',
            fontSize: 'var(--body-sm)',
            lineHeight: 1.5,
            color: 'var(--muted)',
            whiteSpace: 'pre-wrap',
            cursor: 'text',
            padding: '2px 4px',
            borderRadius: 'var(--radius-sm)',
            transition: 'background 0.12s',
            fontStyle: 'italic',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          "{quote.text}"
        </p>
      )}
      {/* Avatar + category as tag-style chip pickers. Mirrors TagChips on
          the rest of the dashboard - single-select chips you click. */}
      <ChipPickerRow label="avatar">
        {avatars.map((a) => {
          const active = quote.avatar_id === a.id;
          return (
            <ChipButton
              key={a.id}
              active={active}
              color="var(--hrv)"
              onClick={() => update.mutate({ avatar_id: active ? null : a.id })}
              title={active ? 'click to detach' : `attach to ${a.name ?? 'this avatar'}`}
            >
              {a.name ?? '(unnamed)'}
            </ChipButton>
          );
        })}
        {avatars.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            no avatars in your library yet
          </span>
        )}
      </ChipPickerRow>
      <ChipPickerRow label="category">
        <ChipButton
          active={quote.category === 'struggle'}
          color="var(--strain)"
          onClick={() => update.mutate({ category: 'struggle' })}
        >
          struggle
        </ChipButton>
        <ChipButton
          active={quote.category === 'desire'}
          color="var(--recovery)"
          onClick={() => update.mutate({ category: 'desire' })}
        >
          desire
        </ChipButton>
        <ChipButton
          active={quote.category === 'win'}
          color="var(--hrv)"
          onClick={() => update.mutate({ category: 'win' })}
        >
          win
        </ChipButton>
      </ChipPickerRow>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="rep-btn rep-btn--primary"
          onClick={() => toProof.mutate()}
          disabled={toProof.isPending || alreadyInProof}
          style={{ fontSize: 11 }}
          title={alreadyInProof ? 'already in proof bank' : 'push this quote into the proof bank as a customer testimonial'}
        >
          {toProof.isPending ? 'adding…' : alreadyInProof ? '✓ added to proof' : '+ add to proof bank'}
        </button>
        <button
          type="button"
          className="rep-btn rep-btn--ghost"
          onClick={() => update.mutate({ status: 'dismissed' })}
          style={{ fontSize: 11 }}
        >
          dismiss
        </button>
        <button
          type="button"
          className="rep-btn rep-btn--danger-ghost"
          onClick={() => { if (confirm('delete this audience quote permanently?')) del.mutate(); }}
          style={{ fontSize: 11, marginLeft: 'auto' }}
        >
          delete
        </button>
      </div>
    </article>
  );
}

// Audience-voice headline above each audience quote. Click anywhere on the
// row (or the explicit pencil icon) to edit inline.
function EditableTitle({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  function commit() {
    setEditing(false);
    if (draft.trim() !== (value ?? '').trim()) onSave(draft.trim());
  }
  const placeholder = 'a short headline summarising the struggle / desire / win — in their voice';
  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setEditing(false); setDraft(value); }
        }}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--recovery)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ink)',
          padding: 'var(--space-2)',
          fontFamily: 'var(--font-display)',
          fontSize: '1.05rem',
          fontWeight: 600,
          lineHeight: 1.35,
          outline: 'none',
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="click to edit title"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        margin: 0,
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed var(--hairline)',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '1.1rem',
        lineHeight: 1.3,
        letterSpacing: '-0.01em',
        color: value ? 'var(--ink)' : 'var(--muted-2)',
        fontStyle: value ? 'normal' : 'italic',
        transition: 'background 0.12s, border-color 0.12s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--recovery)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{value || placeholder}</span>
      <PencilIcon />
    </button>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ opacity: 0.55, flexShrink: 0 }}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// Tag-style chip-picker primitives used by AudienceQuoteRow. Mirrors the
// look of the global TagChips component (pill chips, color-mixed background
// when active, hairline border when inactive).
function ChipPickerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        borderTop: '1px dashed var(--hairline)',
        paddingTop: 8,
        marginTop: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--muted)',
          fontWeight: 700,
          marginRight: 4,
        }}
      >
        {label}:
      </span>
      {children}
    </div>
  );
}

function ChipButton({
  active,
  color,
  onClick,
  children,
  title,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${active
          ? `color-mix(in srgb, ${color} 55%, transparent)`
          : 'var(--hairline)'}`,
        background: active
          ? `color-mix(in srgb, ${color} 18%, transparent)`
          : 'transparent',
        color: active ? color : 'var(--muted)',
        fontFamily: 'inherit',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${color} 30%, var(--hairline))`;
          (e.currentTarget as HTMLElement).style.color = color;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
          (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
        }
      }}
    >
      {active && '✓ '}{children}
    </button>
  );
}

function QuoteCard({
  q,
  transcriptId,
  selected,
  onToggleSelect,
}: {
  q: ExtractedQuote;
  transcriptId: string;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const qc = useQueryClient();
  const [editText, setEditText] = useState(q.text);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setEditText(q.text);
  }, [q.text, editing]);

  const patch = useMutation({
    mutationFn: (body: { text?: string; tag?: QuoteTag; title?: string; topics?: string[]; context?: string }) =>
      api.patchExtract(transcriptId, q.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extracts', transcriptId] }),
  });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(q.title ?? '');
  useEffect(() => {
    if (!editingTitle) setTitleDraft(q.title ?? '');
  }, [q.title, editingTitle]);
  const approve = useMutation({
    mutationFn: () => api.approveExtract(transcriptId, q.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extracts', transcriptId] });
      // Approval may have added an entry to a reputation-backed bank
      // (proof-points / teaching-frameworks / micro-stories / POV files), so
      // the Reputation page needs to refetch on next open.
      qc.invalidateQueries({ queryKey: ['reputation'] });
    },
  });
  const unapprove = useMutation({
    mutationFn: () => api.unapproveExtract(transcriptId, q.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['extracts', transcriptId] });
      qc.invalidateQueries({ queryKey: ['reputation'] });
    },
  });
  const queueIg = useMutation({
    mutationFn: () => api.queueExtractToIg(transcriptId, q.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extracts', transcriptId] }),
  });
  const unqueueIg = useMutation({
    mutationFn: () => api.unqueueExtractFromIg(transcriptId, q.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extracts', transcriptId] }),
  });
  const dismiss = useMutation({
    mutationFn: () => api.dismissExtract(transcriptId, q.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['extracts', transcriptId] }),
  });

  function copyDescriptPlan() {
    const moments = q.source_moments ?? [];
    const lines: string[] = [];
    lines.push(`# ${q.title ?? 'Reel from ' + q.source_transcript_filename}`);
    lines.push('');
    lines.push('## What the reel says (final cut)');
    lines.push('');
    lines.push(q.text);
    lines.push('');
    if (moments.length > 0) {
      lines.push('## Find these clips in Descript (in this order)');
      lines.push('');
      lines.push(`Source: ${q.source_transcript_filename}`);
      lines.push('');
      moments.forEach((m, i) => {
        lines.push(`${i + 1}. [${m.timestamp}] Search Descript for: "${m.text.split(/\s+/).slice(0, 8).join(' ')}…"`);
        lines.push(`   Verbatim: "${m.text}"`);
        lines.push('');
      });
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }

  const meta = TAG_META[q.tag];
  const isActive = q.status !== 'dismissed';
  const isApproved = !!q.approved_at;
  const isQueued = q.in_ig_queue === true;
  // Tag is locked once approved (changing tag would orphan the bank entry).
  const tagLocked = isApproved;
  const isStory = q.kind === 'story';

  return (
    <article
      className={`tx-quote ${isStory ? 'tx-quote--story' : ''} ${!isActive ? 'tx-quote--done' : ''} ${selected ? 'tx-quote--selected' : ''}`}
      style={{ borderColor: selected
        ? meta.color
        : `color-mix(in srgb, ${meta.color} ${isStory ? 38 : 24}%, var(--hairline))` }}
    >
      <div className="tx-quote__head">
        {onToggleSelect && isActive && (
          <button
            type="button"
            className={`tx-checkbox ${selected ? 'tx-checkbox--on' : ''}`}
            onClick={onToggleSelect}
            aria-label={selected ? 'unselect' : 'select to combine'}
            style={selected ? { background: meta.color, borderColor: meta.color, color: 'var(--bg)' } : undefined}
          >
            {selected ? '✓' : ''}
          </button>
        )}
        <select
          value={q.tag}
          onChange={(e) => patch.mutate({ tag: e.target.value as QuoteTag })}
          disabled={tagLocked || !isActive}
          className="tx-tag-select"
          style={{
            color: meta.color,
            borderColor: `color-mix(in srgb, ${meta.color} 40%, var(--hairline))`,
            background: `color-mix(in srgb, ${meta.color} 8%, transparent)`,
          }}
          title={tagLocked ? 'unapprove first to change tag' : undefined}
        >
          {Object.entries(TAG_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </select>
        <div className="tx-quote__badges">
          {isApproved && (
            <span className="tx-badge--inline" style={{ color: 'var(--recovery)' }}>✓ in bank</span>
          )}
          {isQueued && (
            <span className="tx-badge--inline" style={{ color: 'var(--sleep)' }}>→ IG queue</span>
          )}
          {!isApproved && !isQueued && isActive && (
            <span className="tx-quote__ts">
              {q.timestamp || (isStory ? `${q.source_moments?.length ?? 0} moments` : '')}
            </span>
          )}
        </div>
      </div>

      {/* Title: shown if it exists, OR as an editable placeholder for any active
          non-approved item (story OR quote). Hidden once approved. */}
      {(q.title || (isActive && !isApproved)) && (
        editingTitle ? (
          <input
            type="text"
            className="tx-quote__title-input"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              const v = titleDraft.trim();
              if (v !== (q.title ?? '')) patch.mutate({ title: v });
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setTitleDraft(q.title ?? ''); setEditingTitle(false); }
            }}
            placeholder="add a title to make this easier to find later…"
            style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 40%, var(--hairline))` }}
          />
        ) : (
          <h5
            className="tx-quote__title"
            style={{ color: meta.color, cursor: isActive && !isApproved ? 'text' : 'default' }}
            onClick={() => { if (isActive && !isApproved) setEditingTitle(true); }}
            title={isActive && !isApproved ? 'click to edit title' : undefined}
          >
            {q.title || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>+ add title</span>}
          </h5>
        )
      )}

      {editing ? (
        <textarea
          className="rep-textarea"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => {
            if (editText.trim() && editText !== q.text) patch.mutate({ text: editText.trim() });
            setEditing(false);
          }}
          autoFocus
          rows={Math.max(3, Math.ceil(editText.length / 60))}
        />
      ) : (
        <p
          className={`tx-quote__text ${isStory ? 'tx-quote__text--story' : ''}`}
          onClick={() => isActive && !isApproved && setEditing(true)}
          style={{ cursor: isActive && !isApproved ? 'text' : 'default' }}
        >
          {q.text}
        </p>
      )}

      {q.context && <p className="tx-quote__context">{q.context}</p>}

      {isStory && q.source_moments && q.source_moments.length > 0 && (
        <details className="tx-moments">
          <summary className="tx-moments__summary">
            source moments <span className="tx-meta">{q.source_moments.length}</span>
          </summary>
          <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            {q.source_moments.map((m, i) => (
              <div key={i} className="tx-moment">
                <span className="tx-moment__ts">{m.timestamp}</span>
                <span className="tx-moment__text">"{m.text}"</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {isActive && (
        <TagChips
          topics={q.topics ?? []}
          onChange={(next) => patch.mutate({ topics: next })}
          color={meta.color}
        />
      )}

      {isActive && (
        <div className="rep-actions">
          <button
            type="button"
            className="rep-btn rep-btn--ghost"
            onClick={() => dismiss.mutate()}
            disabled={dismiss.isPending}
            style={{ marginRight: 'auto', color: 'var(--muted-2)' }}
          >
            dismiss
          </button>
          {isStory && (q.source_moments?.length ?? 0) > 0 && (
            <button type="button" className="rep-btn rep-btn--ghost" onClick={copyDescriptPlan}>
              copy edit plan
            </button>
          )}
          {isQueued ? (
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => unqueueIg.mutate()}
              disabled={unqueueIg.isPending}
              style={{ color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.3)' }}
            >
              {unqueueIg.isPending ? '...' : 'remove from IG queue'}
            </button>
          ) : (
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => queueIg.mutate()}
              disabled={queueIg.isPending}
            >
              {queueIg.isPending ? '...' : 'queue to instagram'}
            </button>
          )}
          {isApproved ? (
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => unapprove.mutate()}
              disabled={unapprove.isPending}
              style={{ color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.3)' }}
            >
              {unapprove.isPending ? '...' : 'unapprove'}
            </button>
          ) : (
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
            >
              {approve.isPending ? '...' : `approve as ${meta.label.toLowerCase()}`}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function extractSummary(content: string): string {
  if (!content) return '';
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  const postMatch = body.match(/##\s+(Community Post|Post)\s*\n+([\s\S]*?)(?=\n##\s|$)/i);
  if (postMatch) return postMatch[2]!.trim();
  const h1Match = body.match(/^#\s+[^\n]+\n+([\s\S]*?)(?=\n---\n|## Full Transcript|$)/);
  if (h1Match) return h1Match[1]!.trim().slice(0, 4000);
  return body.trim().slice(0, 1500);
}

// ─── styles ────────────────────────────────────────────────────────────────

const TX_CSS = `
/* Shared with Reputation panel - if Reputation isn't mounted we still need them. */
.rep-eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.rep-panel-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: tx-fade 0.18s ease-out;
}
@keyframes tx-fade { from { opacity: 0; } to { opacity: 1; } }
.rep-panel {
  width: min(680px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--dim-c);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: tx-slide 0.22s ease-out;
}
@keyframes tx-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.rep-panel__head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; }
.rep-panel__head-l { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; flex: 1; }
.rep-panel__head-r { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.rep-panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.45rem;
  letter-spacing: -0.025em;
  line-height: 1.15;
  word-break: break-word;
}
.rep-panel__def { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }

.rep-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--hairline);
}
.rep-section:first-of-type { padding-top: 0; border-top: none; }
.rep-section__head { display: flex; flex-direction: column; gap: 4px; }
.rep-section__title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.05rem; letter-spacing: -0.015em; }
.rep-section__sub { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }

.rep-list { display: flex; flex-direction: column; gap: var(--space-3); }
.rep-card {
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-card--inline { background: rgba(255,255,255,0.03); }

.rep-textarea {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  line-height: 1.55;
  resize: vertical;
  min-height: 70px;
  outline: none;
}
.rep-textarea:focus { border-color: var(--dim-c); background: rgba(255,255,255,0.06); }

.rep-btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.rep-btn--primary { background: var(--dim-c); color: var(--bg); }
.rep-btn--primary:hover { transform: translateY(-1px); }
.rep-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
.rep-btn--ghost { background: transparent; color: var(--muted); border-color: var(--hairline); }
.rep-btn--ghost:hover { color: var(--ink); border-color: var(--ink); }
.rep-actions { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; align-items: center; }

/* List page styles */
.tx-meta {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
}
.tx-cat-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--hairline);
  gap: var(--space-4);
}
.tx-cat-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.5rem, 3vw, 2rem);
  letter-spacing: -0.03em;
  line-height: 1.05;
  margin: 0;
}
.tx-rows { display: flex; flex-direction: column; }
.tx-row {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--hairline);
  border-left: 2px solid transparent;
  padding: var(--space-3) var(--space-3);
  text-align: left;
  cursor: pointer;
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  color: inherit;
  font-family: inherit;
  transition: background 0.12s, border-color 0.12s;
}
.tx-row:hover { background: rgba(255,255,255,0.03); border-left-color: var(--ink); }
.tx-row__name { flex: 1; font-size: var(--body); word-break: break-word; }
.tx-row__date { font-size: var(--body-sm); color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tx-badge {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-weight: 600;
  white-space: nowrap;
}
.tx-badge--ok { color: var(--recovery); background: rgba(22,201,126,0.10); }
.tx-badge--muted { color: var(--muted-2); background: rgba(255,255,255,0.04); }

/* Panel-specific */
.tx-summary {
  font-size: var(--body-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 260px;
  overflow-y: auto;
  color: var(--ink);
}

.tx-details { display: flex; flex-direction: column; gap: var(--space-3); }
.tx-details__summary {
  cursor: pointer;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  list-style: none;
}
.tx-details__summary::-webkit-details-marker { display: none; }
.tx-details__summary::before {
  content: '▸';
  color: var(--muted);
  font-size: 10px;
  transition: transform 0.15s;
}
.tx-details[open] .tx-details__summary::before { transform: rotate(90deg); }
.tx-transcript {
  margin-top: var(--space-3);
  font-size: 12px;
  line-height: 1.55;
  max-height: 420px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.tx-quote {
  padding: var(--space-4);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: opacity 0.18s;
}
.tx-quote--done { opacity: 0.55; }
.tx-quote__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}
.tx-quote__ts {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.tx-quote__badges {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.tx-badge--inline {
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  white-space: nowrap;
}
.tx-quote__text {
  margin: 0;
  font-size: var(--body);
  line-height: 1.55;
  white-space: pre-wrap;
  border-radius: var(--radius-sm);
  padding: 4px 0;
}
.tx-quote__text:hover { background: rgba(255,255,255,0.02); }
.tx-quote__context {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  font-style: italic;
}

.tx-tag-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 3px 26px 3px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  border-radius: var(--radius-pill);
  border: 1px solid;
  cursor: pointer;
  font-family: inherit;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M3 4.5l3 3 3-3' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 10px;
}
.tx-tag-select:disabled {
  cursor: default;
  background-image: none;
  padding-right: 10px;
  opacity: 0.7;
}
.tx-tag-select option {
  background: var(--bg);
  color: var(--ink);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 500;
}

.tx-subsection {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.92rem;
  letter-spacing: -0.01em;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.tx-quote--story {
  background: rgba(255,255,255,0.04);
  border-width: 1.5px;
}
.tx-quote__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: background 0.12s;
}
.tx-quote__title:hover {
  background: rgba(255,255,255,0.04);
}
.tx-quote__title-input {
  width: 100%;
  background: rgba(255,255,255,0.06);
  border: 1px solid;
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
  outline: none;
}
.tx-quote__title-input::placeholder {
  color: var(--muted-2);
  font-style: italic;
  font-weight: 500;
}
.tx-quote__text--story {
  font-size: var(--body);
  line-height: 1.65;
}

.tx-moments {
  border-top: 1px dashed var(--hairline);
  padding-top: var(--space-3);
}
.tx-moments__summary {
  cursor: pointer;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
  list-style: none;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}
.tx-moments__summary::-webkit-details-marker { display: none; }
.tx-moments__summary::before {
  content: '▸';
  color: var(--muted);
  font-size: 9px;
  transition: transform 0.15s;
}
.tx-moments[open] .tx-moments__summary::before { transform: rotate(90deg); }
.tx-moment {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: rgba(0,0,0,0.18);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.5;
}
.tx-moment__ts {
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.tx-moment__text { color: var(--muted); font-style: italic; }

.tx-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1.5px solid var(--hairline);
  background: transparent;
  color: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  padding: 0;
  transition: all 0.12s;
  flex-shrink: 0;
}
.tx-checkbox:hover { border-color: var(--ink); }
.tx-checkbox--on { color: var(--bg); }

.tx-quote--selected {
  background: rgba(255,255,255,0.06);
  border-width: 1.5px;
}

.tx-combine-bar {
  position: sticky;
  bottom: 0;
  margin-top: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--bg);
  border: 1px solid var(--dim-c);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  justify-content: flex-end;
  box-shadow: 0 -8px 24px -12px rgba(0,0,0,0.5);
  animation: tx-combine-pop 0.18s ease-out;
}
.tx-combine-bar .tx-meta { margin-right: auto; }
@keyframes tx-combine-pop {
  from { transform: translateY(8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@media (max-width: 640px) {
  .rep-panel { padding: var(--space-4); }
  .rep-panel__head { flex-direction: column; align-items: stretch; }
  .rep-panel__head-r { flex-direction: row; align-items: center; justify-content: flex-end; }
}
`;
