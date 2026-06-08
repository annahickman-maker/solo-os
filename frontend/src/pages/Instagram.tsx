import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BankItem, type BankKind, type IgItemStatus, type IgQueueItem, type QuoteTag } from '../api';
import { Voice } from './Voice';
import { MonthGrid } from '../components/MonthGrid';
import { FocusCtaEditor } from '../components/FocusCtaEditor';
import { DatePickerPopover } from '../components/DatePickerPopover';

// Map approved bank kinds → IG queue tag values
const BANK_KIND_TO_TAG: Record<BankKind, QuoteTag> = {
  pov: 'pov',
  framework: 'value',
  story: 'connection',
  proof: 'authority',
};

const TAG_META: Record<QuoteTag, { label: string; color: string }> = {
  'pov': { label: 'POV', color: 'var(--sleep)' },
  'value': { label: 'Value', color: 'var(--recovery)' },
  'authority': { label: 'Proof', color: 'var(--strain)' },
  'connection': { label: 'Connection', color: 'var(--hrv)' },
};

const TAG_ORDER: QuoteTag[] = ['pov', 'value', 'authority', 'connection'];

const FALLBACK_TAG_META = { label: 'Quote', color: 'var(--muted)' };
function tagMeta(tag: string) {
  return TAG_META[tag as QuoteTag] ?? FALLBACK_TAG_META;
}

const STAGES: { status: IgItemStatus; label: string }[] = [
  { status: 'queued', label: 'queued' },
  { status: 'filmed', label: 'filmed' },
  { status: 'posted', label: 'posted' },
];

function stageIndex(s: IgItemStatus): number {
  if (s === 'dismissed') return -1;
  return STAGES.findIndex((x) => x.status === s);
}

export function Instagram() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['ig-queue'],
    queryFn: api.igQueue,
  });
  const { data: output } = useQuery({
    queryKey: ['ig-output'],
    queryFn: api.igOutput,
  });
  const setIgTarget = useMutation({
    mutationFn: (n: number) => api.setIgTarget(n),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-output'] }),
  });
  const { data: syncStatus } = useQuery({
    queryKey: ['ig-sync-status'],
    queryFn: api.igSyncStatus,
  });
  const syncIg = useMutation({
    mutationFn: () => api.syncInstagram(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-output'] });
      qc.invalidateQueries({ queryKey: ['ig-sync-status'] });
    },
  });

  function editIgTarget() {
    const current = output?.target_per_week ?? 3;
    const v = window.prompt(
      'how many reels per week do you want to publish?',
      String(current),
    );
    if (!v) return;
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return;
    setIgTarget.mutate(Math.round(n));
  }

  const createIdea = useMutation({
    mutationFn: (title: string) => api.createIgIdea({ title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  const addFromBank = useMutation({
    mutationFn: (bi: BankItem) => api.createIgIdea({
      title: bi.title ?? undefined,
      text: bi.text,
      tag: BANK_KIND_TO_TAG[bi.kind],
      context: bi.context ?? undefined,
      timestamp: bi.source_timestamp ?? undefined,
      source_transcript_filename: bi.source_transcript ?? undefined,
      source_moments: bi.source_moments,
      kind: bi.title ? 'story' : 'quote',
      quote_id: bi.id,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });

  useEffect(() => {
    if (!openId && !pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [openId, pickerOpen]);

  const items = data?.items ?? [];
  // All non-posted reels live in one bucket. The card's stage tracker bar
  // shows whether a reel has been filmed (filled middle dot) regardless of
  // which "lane" - there's no separate filmed lane anymore.
  const queued = items.filter((i) => i.status === 'queued' || i.status === 'filmed');
  const posted = items.filter((i) => i.status === 'posted');
  const counts = data?.counts ?? { queued: 0, filmed: 0, posted: 0, dismissed: 0 };
  const openItem = items.find((i) => i.id === openId) ?? null;

  return (
    <>
      <style>{IG_CSS}</style>

      {/* Content output tracker - 4-month day grid. Visual mirror of the
          YearGrid card on the YouTube tab so both channels feel like the
          same surface: same padding/radius, "publishing months" eyebrow in
          strain blue + "your content output" h3, sync info on the right. */}
      {output && (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span className="eyebrow" style={{ color: 'var(--strain)' }}>publishing months</span>
              <h3 className="h3" style={{ marginTop: 4 }}>your content output</h3>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              {output.source === 'instagram_graph_api' ? (
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  synced · {output.synced_post_count} posts
                </span>
              ) : !syncStatus?.configured ? (
                <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                  manual mode
                </span>
              ) : null}
              {syncStatus?.configured && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => syncIg.mutate()}
                  disabled={syncIg.isPending}
                  style={{ fontSize: 'var(--body-sm)' }}
                >
                  {syncIg.isPending ? 'syncing instagram' : 'sync from instagram'}
                </button>
              )}
            </div>
          </div>
          <MonthGrid
            months={output.months}
            targetPerWeek={output.target_per_week}
            onEditTarget={editIgTarget}
          />
          {syncIg.isError && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              sync failed: {(syncIg.error as Error)?.message}
            </span>
          )}
          {syncIg.data?.error && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              {syncIg.data.error}
            </span>
          )}
          {!syncStatus?.configured && (
            <details style={{ marginTop: 'var(--space-3)' }}>
              <summary style={{ cursor: 'pointer', fontSize: 'var(--body-sm)', color: 'var(--muted)' }}>
                set up auto-sync with instagram (10 min, one-time)
              </summary>
              <ol
                style={{
                  marginTop: 'var(--space-2)',
                  paddingLeft: 'var(--space-5)',
                  fontSize: 'var(--body-sm)',
                  lineHeight: 1.7,
                  color: 'var(--muted)',
                }}
              >
                <li>
                  Make sure your Instagram is a <strong>Business</strong> or <strong>Creator</strong> account
                  (not Personal), connected to a Facebook Page.
                </li>
                <li>
                  Go to{' '}
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
                    developers.facebook.com/apps
                  </a>{' '}
                  → Create App → type <strong>Business</strong>. Skip the verification prompts; you don't need
                  App Review for personal use.
                </li>
                <li>
                  In the new app, add <strong>Instagram Graph API</strong> as a product.
                </li>
                <li>
                  Open the{' '}
                  <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">
                    Graph API Explorer
                  </a>
                  , select your app, grant{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>
                    instagram_basic
                  </code>{' '}
                  +{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>
                    pages_show_list
                  </code>
                  , and copy the generated access token. Then exchange it for a long-lived token (60-day
                  expiry) via{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>
                    /oauth/access_token?grant_type=fb_exchange_token
                  </code>
                  .
                </li>
                <li>
                  Fetch your Instagram Business Account ID:{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>
                    GET /me/accounts
                  </code>
                  , then for your page:{' '}
                  <code style={{ background: 'rgba(255,255,255,0.06)', padding: '0 4px', borderRadius: 3 }}>
                    GET /{'{page-id}'}?fields=instagram_business_account
                  </code>
                  .
                </li>
                <li>
                  Add to <code>server/.env</code>:
                  <pre
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      padding: 'var(--space-2)',
                      borderRadius: 4,
                      fontSize: 11,
                      marginTop: 6,
                      overflow: 'auto',
                    }}
                  >
{`INSTAGRAM_ACCESS_TOKEN=<your-long-lived-token>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<your-ig-business-id>`}
                  </pre>
                </li>
                <li>Restart the dashboard. Hit "sync from instagram". Done.</li>
              </ol>
            </details>
          )}
        </div>
      )}

      {/* Focus CTA - the line description/caption generators pull from.
          Sits right under the output card so the CTA is visually paired
          with "what you're publishing". Avatar lives one level up on the
          Content page so it's shared across YT and IG. Negative top
          margin pulls it tight under the output card; bottom margin
          separates it from the reel queue header below. */}
      <div style={{ marginTop: 'calc(-1 * var(--space-7))', marginBottom: 'var(--space-5)' }}>
        <FocusCtaEditor channel="instagram" />
      </div>

      {/* Queue header + add-row act as one block: header on top, add-row
          directly under it. Outer wrapper keeps the block balanced between
          the CTA above and the "queued · ready to film" lane below. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <header className="ig-page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="h2">your Instagram queue</h1>
            <p className="ig-page-sub">
              stories and quotes from your transcripts, scripted and ready to record.
            </p>
          </div>
          <div className="ig-stat-strip">
            <Stat label="queued" value={counts.queued} color="var(--recovery)" />
            <Stat label="filmed" value={counts.filmed} color="var(--sleep)" />
            <Stat label="posted" value={counts.posted} color="var(--muted-2)" />
          </div>
        </header>

        <div className="ig-add-row" style={{ marginBottom: 0 }}>
          <IdeaInput onAdd={(title) => createIdea.mutate(title)} pending={createIdea.isPending} />
          <button
            type="button"
            className="rep-btn rep-btn--ghost ig-add-row__bank"
            onClick={() => setPickerOpen(true)}
          >
            + add from bank
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty">loading…</div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Lane
            label="queued · ready to film"
            color="var(--ink)"
            items={queued}
            onOpen={setOpenId}
            empty="nothing queued yet. add an idea above, or head to vault and click 'queue to instagram' on a quote."
            targetStatus="queued"
          />
          {/* Posted is a TABLE at the bottom, not a card lane. Drop a card on
              the header strip to mark it posted (defaults to today). */}
          <PostedTable items={posted} onOpen={setOpenId} />
        </>
      )}

      {/* Brainstorm moved to the top of the Content page as a global button.
          Original block kept here, hidden via display:none for one cycle in
          case I need to revert quickly. */}
      <section className="ig-fallback" style={{ display: 'none' }}>
        <header className="ig-fallback__head">
          <h3 className="ig-fallback__title">stuck for ideas? start here</h3>
          <p className="ig-fallback__sub">
            answer one of these prompts to find a story or a hook. use it as raw material for a reel.
          </p>
        </header>
        <details className="ig-fallback__details">
          <summary className="ig-fallback__summary">open the brainstorm prompts</summary>
          <div className="ig-fallback__body">
            <Voice embedded />
          </div>
        </details>
      </section>

      {openItem && <ReelPanel item={openItem} onClose={() => setOpenId(null)} />}
      {pickerOpen && (
        <BankPicker
          existingQuoteIds={new Set(items.map((i) => i.quote_id).filter(Boolean) as string[])}
          onAdd={(bi) => addFromBank.mutate(bi)}
          onClose={() => setPickerOpen(false)}
          pending={addFromBank.isPending}
        />
      )}
    </>
  );
}

function IdeaInput({ onAdd, pending }: { onAdd: (title: string) => void; pending: boolean }) {
  const [value, setValue] = useState('');
  function submit() {
    const t = value.trim();
    if (!t) return;
    onAdd(t);
    setValue('');
  }
  return (
    <div className="ig-idea-input">
      <input
        type="text"
        placeholder="add a reel idea… (e.g. 'why your offer isn't selling and what to test first')"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="ig-idea-input__field"
      />
      <button
        type="button"
        className="rep-btn rep-btn--primary"
        onClick={submit}
        disabled={pending || !value.trim()}
        style={{ '--dim-c': 'var(--recovery)' } as React.CSSProperties}
      >
        {pending ? '...' : 'add idea'}
      </button>
    </div>
  );
}

export function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="ig-stat">
      <span className="ig-stat__num" style={{ color }}>{value}</span>
      <span className="ig-stat__lbl">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="ig-empty">
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.15rem' }}>
        no reels queued yet
      </h3>
      <p className="muted" style={{ fontSize: 'var(--body-sm)', maxWidth: '52ch' }}>
        go to <strong>vault</strong>, click any transcript, extract quotes, and hit{' '}
        <strong>queue to instagram</strong> on the stories and quotes you want to film.
        they'll show up here as filmable reels.
      </p>
    </div>
  );
}

function Lane({
  label,
  color,
  items,
  onOpen,
  empty,
  targetStatus,
}: {
  label: string;
  color: string;
  items: IgQueueItem[];
  onOpen: (id: string) => void;
  empty?: string;
  // Status to assign to a card dropped onto this lane.
  targetStatus: IgItemStatus;
}) {
  const qc = useQueryClient();
  const [hover, setHover] = useState(false);
  const move = useMutation({
    mutationFn: (id: string) => api.updateIgItem(id, { status: targetStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  return (
    <section
      className="ig-lane"
      onDragOver={(e) => {
        // preventDefault is REQUIRED to mark this element as a valid drop target.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id && !items.some((x) => x.id === id)) {
          // Only fire if the card came from a different lane.
          move.mutate(id);
        }
      }}
      style={
        hover
          ? {
              outline: `2px dashed ${color}`,
              outlineOffset: -4,
              background: `color-mix(in srgb, ${color} 4%, transparent)`,
            }
          : undefined
      }
    >
      <header className="ig-lane__head" style={{ borderBottomColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
        <h2 className="ig-lane__title" style={{ color }}>{label}</h2>
        <span className="eyebrow">{items.length}</span>
      </header>
      {items.length === 0 && empty ? (
        <p className="ig-lane__empty">{empty}</p>
      ) : items.length === 0 ? (
        <p className="ig-lane__empty">drop a reel here to mark it {targetStatus}.</p>
      ) : (
        <div className="ig-grid">
          {items.map((it) => (
            <ReelCard key={it.id} item={it} onClick={() => onOpen(it.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReelCard({ item, onClick }: { item: IgQueueItem; onClick: () => void }) {
  const qc = useQueryClient();
  const meta = tagMeta(item.tag);
  const current = stageIndex(item.status);
  const text = item.text ?? '';
  const title = item.title ?? (text.length > 80 ? text.slice(0, 80) + '…' : text);
  const preview = text.length > 240 ? text.slice(0, 240) + '…' : text;
  const [tagOpen, setTagOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tagMutation = useMutation({
    mutationFn: (t: QuoteTag) => api.updateIgItem(item.id, { tag: t }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const markPosted = useMutation({
    mutationFn: (d: Date) => {
      const ts = Math.floor(d.getTime() / 1000);
      return api.updateIgItem(item.id, { status: 'posted', posted_at: ts });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
      setPickerOpen(false);
    },
  });

  useEffect(() => {
    if (!tagOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(`.ig-card__tag-wrap[data-id="${item.id}"]`)) setTagOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setTagOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [tagOpen, item.id]);

  return (
    <article
      className="ig-card"
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{ borderColor: `color-mix(in srgb, ${meta.color} 22%, var(--hairline))`, cursor: 'grab' }}
    >
      <div className="ig-card__head">
        <div className="ig-card__tag-wrap" data-id={item.id} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="ig-card__tag ig-card__tag--btn"
            style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 10%, transparent)`, borderColor: `color-mix(in srgb, ${meta.color} 28%, transparent)` }}
            onClick={() => setTagOpen((v) => !v)}
            title="change tag"
          >
            {meta.label}
            <span className="ig-card__tag-caret" aria-hidden>▾</span>
          </button>
          {tagOpen && (
            <div className="ig-card__tag-pop" role="menu">
              {TAG_ORDER.map((t) => {
                const m = TAG_META[t];
                const active = item.tag === t;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`ig-card__tag-opt${active ? ' is-active' : ''}`}
                    style={{
                      color: active ? 'var(--bg)' : m.color,
                      background: active ? m.color : `color-mix(in srgb, ${m.color} 10%, transparent)`,
                      borderColor: `color-mix(in srgb, ${m.color} 28%, transparent)`,
                    }}
                    onClick={() => { tagMutation.mutate(t); setTagOpen(false); }}
                    disabled={tagMutation.isPending}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <h3 className="ig-card__title">{title}</h3>
      <p className="ig-card__preview">{preview}</p>
      {item.source_transcript_filename && (
        <p className="ig-card__src">
          source: {item.source_transcript_filename.replace(/\.(md|txt)$/, '')}
          {item.source_moments && item.source_moments.length > 0 && ` · ${item.source_moments.length} moments`}
        </p>
      )}
      <div className="ig-card__stages">
        {STAGES.map((s, i) => {
          const filled = current >= i;
          return (
            <span key={s.status} className={`ig-stage ${filled ? 'ig-stage--on' : ''}`} style={filled ? { background: meta.color } : undefined} />
          );
        })}
      </div>
      {(item.status === 'queued' || item.status === 'filmed') && (
        <div
          className="ig-card__quick"
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            gap: 6,
            marginTop: 4,
            alignItems: 'center',
            flexWrap: 'wrap',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="ig-card__quick-btn"
            title="pick the date this went live"
          >
            mark posted
          </button>
          {pickerOpen && (
            <DatePickerPopover
              selected={new Date()}
              onPick={(d) => markPosted.mutate(d)}
              onClose={() => setPickerOpen(false)}
              align="left"
            />
          )}
        </div>
      )}
    </article>
  );
}

// ─── Posted table - mirrors PublishedRow on the YouTube tab ────────────────
// Drop a queued/filmed card on this header to mark it posted (defaults today).
// Click a row to open the panel and edit caption / metrics / posted_url.

function formatIgStat(n?: number | null): string {
  if (n == null) return '-';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PostedTable({ items, onOpen }: { items: IgQueueItem[]; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const [hover, setHover] = useState(false);
  const drop = useMutation({
    mutationFn: (id: string) => {
      const now = Math.floor(Date.now() / 1000);
      return api.updateIgItem(id, { status: 'posted', posted_at: now });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  const sorted = [...items].sort((a, b) => (b.posted_at ?? 0) - (a.posted_at ?? 0));
  // Heading color = white (per Anna). Border still uses an accent to keep
  // the drop-target hint visible.
  const PINK = 'var(--ink)';
  const ACCENT = '#E6A52F';
  return (
    <section
      className="ig-posted"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id && !items.some((x) => x.id === id)) drop.mutate(id);
      }}
      style={{
        marginTop: 'var(--space-4)',
        outline: hover ? `2px dashed ${ACCENT}` : 'none',
        outlineOffset: -4,
        borderRadius: 'var(--radius-lg)',
        padding: hover ? 'var(--space-3)' : 0,
        transition: 'padding 0.12s',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: 'var(--space-3) 0',
          borderBottom: `1px solid var(--hairline)`,
          marginBottom: 'var(--space-2)',
        }}
      >
        <h2 className="ig-lane__title" style={{ color: PINK, margin: 0 }}>
          posted
        </h2>
        <span className="eyebrow">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="ig-lane__empty">drop a reel here to mark it posted (date stamps as today).</p>
      ) : (
        <div className="stack">
          {sorted.map((it) => (
            <PostedRow key={it.id} item={it} onClick={() => onOpen(it.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

function PostedRow({ item, onClick }: { item: IgQueueItem; onClick: () => void }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'view_count' | 'share_count' | 'comment_count'>>) =>
      api.updateIgItem(item.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const dateLabel = item.posted_at
    ? new Date(item.posted_at * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '-';
  const title = item.title ?? (item.text?.length > 80 ? item.text.slice(0, 80) + '…' : item.text);
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--hairline)',
        cursor: 'grab',
      }}
    >
      <div
        className="stack"
        style={{ gap: 2, flex: 1, minWidth: 0, cursor: 'pointer' }}
        onClick={onClick}
      >
        <span style={{ wordBreak: 'break-word' }}>{title}</span>
        <span
          className="muted"
          style={{ fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums' }}
        >
          {dateLabel}
          {item.posted_url && (
            <>
              {' · '}
              <a
                href={item.posted_url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                open on instagram
              </a>
            </>
          )}
        </span>
      </div>
      <div
        style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'baseline', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <EditableStatCol
          label="views"
          value={item.view_count}
          onSave={(n) => update.mutate({ view_count: n })}
        />
        <EditableStatCol
          label="shares"
          value={item.share_count}
          onSave={(n) => update.mutate({ share_count: n })}
        />
        <EditableStatCol
          label="comments"
          value={item.comment_count}
          onSave={(n) => update.mutate({ comment_count: n })}
        />
      </div>
    </div>
  );
}

function EditableStatCol({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number | null | undefined;
  onSave: (n: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  function startEdit() {
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  }
  function commit() {
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n >= 0) onSave(Math.floor(n));
    setEditing(false);
  }
  return (
    <div style={{ textAlign: 'right', minWidth: 64 }}>
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: 64,
            background: 'var(--bg)',
            border: '1px solid var(--hairline)',
            borderRadius: 4,
            color: 'var(--ink)',
            padding: '2px 6px',
            fontSize: '1rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title={`click to edit ${label}`}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.0625rem',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--ink)',
            opacity: 0.85,
          }}
        >
          {formatIgStat(value)}
        </button>
      )}
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--muted-2)',
          fontWeight: 400,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Side panel for a reel (script + edit plan + actions) ──────────────────

function ReelPanel({ item, onClose }: { item: IgQueueItem; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = tagMeta(item.tag);
  const moments = item.source_moments ?? [];

  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'status' | 'posted_url' | 'text' | 'tag' | 'title' | 'posted_at' | 'view_count' | 'share_count' | 'comment_count'>>) => api.updateIgItem(item.id, body),
    onMutate: async (body) => {
      // Optimistic patch into the ig-queue cache so the panel doesn't flash
      // back to the old value while the network round-trip is in flight.
      // Critical for the title editor: when blur fires from a click-outside,
      // the panel may unmount before the refetch lands, and re-opening would
      // otherwise show the stale title for a beat.
      await qc.cancelQueries({ queryKey: ['ig-queue'] });
      const prev = qc.getQueryData<{ items: IgQueueItem[]; counts: any }>(['ig-queue']);
      if (prev) {
        qc.setQueryData(['ig-queue'], {
          ...prev,
          items: prev.items.map((x) => (x.id === item.id ? { ...x, ...body } : x)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['ig-queue'], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      qc.invalidateQueries({ queryKey: ['ig-output'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteIgItem(item.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ig-queue'] });
      onClose();
    },
  });

  function copyScript() {
    const lines = [item.title ?? 'Reel script', '', item.text];
    navigator.clipboard.writeText(lines.join('\n'));
  }

  function copyDescriptPlan() {
    const lines: string[] = [];
    lines.push(`# ${item.title ?? 'Reel from ' + (item.source_transcript_filename ?? 'transcript')}`);
    lines.push('');
    lines.push('## What the reel says (final cut)');
    lines.push('');
    lines.push(item.text);
    lines.push('');
    if (moments.length > 0 && item.source_transcript_filename) {
      lines.push('## Find these clips in Descript (in this order)');
      lines.push('');
      lines.push(`Source: ${item.source_transcript_filename}`);
      lines.push('');
      moments.forEach((m, i) => {
        lines.push(`${i + 1}. [${m.timestamp}] Search Descript for: "${m.text.split(/\s+/).slice(0, 8).join(' ')}…"`);
        lines.push(`   Verbatim: "${m.text}"`);
        lines.push('');
      });
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }

  const [panelPickerOpen, setPanelPickerOpen] = useState(false);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [scriptEditing, setScriptEditing] = useState(false);
  const [scriptDraft, setScriptDraft] = useState(item.text);
  useEffect(() => {
    if (!scriptEditing) setScriptDraft(item.text);
  }, [item.text, scriptEditing]);

  function appendFromBank(bi: BankItem) {
    // Insert a personal story / bank entry into the script. Adds a divider
    // for readability, prefixes with the bank entry's title (if any) so Anna
    // can see what she added at a glance.
    const sep = item.text.trim().length > 0 ? '\n\n---\n\n' : '';
    const titlePart = bi.title ? `**${bi.title}**\n\n` : '';
    const next = `${item.text}${sep}${titlePart}${bi.text}`;
    update.mutate({ text: next });
    setBankPickerOpen(false);
  }

  function setStatus(s: IgItemStatus) {
    if (s === 'posted') {
      // Don't immediately commit posted - open the calendar so the user can
      // pick a date. Clicking a day commits with that posted_at.
      setPanelPickerOpen(true);
      return;
    }
    update.mutate({ status: s });
  }
  function commitPostedWithDate(d: Date) {
    const ts = Math.floor(d.getTime() / 1000);
    update.mutate({ status: 'posted', posted_at: ts });
    setPanelPickerOpen(false);
  }

  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside className="rep-panel" style={{ '--dim-c': meta.color } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <TitleEditor
              value={item.title ?? ''}
              onSave={(v) => update.mutate({ title: v })}
              placeholder="untitled reel"
            />
            {item.source_transcript_filename && (
              <p className="rep-panel__def">from {item.source_transcript_filename.replace(/\.(md|txt)$/, '')}</p>
            )}
          </div>
          <div className="rep-panel__head-r">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>close</button>
          </div>
        </header>

        {/* Stage selector */}
        <section className="rep-section">
          <header className="rep-section__head">
            <h3 className="rep-section__title">stage</h3>
            <p className="rep-section__sub">mark where this reel is in the pipeline.</p>
          </header>
          <div className="ig-stage-buttons" style={{ position: 'relative' }}>
            {STAGES.map((s) => {
              const active = item.status === s.status;
              return (
                <button
                  key={s.status}
                  type="button"
                  className={`rep-btn ${active ? 'rep-btn--primary' : 'rep-btn--ghost'}`}
                  onClick={() => setStatus(s.status)}
                  disabled={update.isPending}
                >
                  {s.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => setStatus('dismissed')}
              disabled={update.isPending}
              style={{ marginLeft: 'auto', color: 'var(--muted-2)' }}
            >
              {item.status === 'dismissed' ? 'dismissed' : 'dismiss'}
            </button>
            {panelPickerOpen && (
              <DatePickerPopover
                selected={item.posted_at ? new Date(item.posted_at * 1000) : new Date()}
                onPick={commitPostedWithDate}
                onClose={() => setPanelPickerOpen(false)}
                align="left"
              />
            )}
          </div>
        </section>

        {/* Tag selector */}
        <section className="rep-section">
          <header className="rep-section__head">
            <h3 className="rep-section__title">tag</h3>
            <p className="rep-section__sub">what kind of moment this is. drives the color on the card.</p>
          </header>
          <div className="ig-tag-buttons">
            {TAG_ORDER.map((t) => {
              const m = TAG_META[t];
              const active = item.tag === t;
              return (
                <button
                  key={t}
                  type="button"
                  className="ig-tag-btn"
                  onClick={() => update.mutate({ tag: t })}
                  disabled={update.isPending}
                  style={{
                    color: active ? 'var(--bg)' : m.color,
                    background: active ? m.color : `color-mix(in srgb, ${m.color} 10%, transparent)`,
                    borderColor: active ? m.color : `color-mix(in srgb, ${m.color} 30%, transparent)`,
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Script */}
        <section className="rep-section">
          <header
            className="rep-section__head"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}
          >
            <div>
              <h3 className="rep-section__title">reel script</h3>
              <p className="rep-section__sub">what you'll say. weave in a personal story to anchor it.</p>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                type="button"
                className="rep-btn rep-btn--ghost"
                onClick={() => setBankPickerOpen(true)}
                title="insert a personal story or framework from your bank"
              >
                + add from bank
              </button>
              {!scriptEditing && (
                <button
                  type="button"
                  className="rep-btn rep-btn--ghost"
                  onClick={() => setScriptEditing(true)}
                  title="edit the script inline"
                >
                  edit
                </button>
              )}
            </div>
          </header>
          <div className="rep-card rep-card--inline">
            {scriptEditing ? (
              <>
                <textarea
                  value={scriptDraft}
                  onChange={(e) => setScriptDraft(e.target.value)}
                  rows={Math.max(8, scriptDraft.split('\n').length + 1)}
                  className="rep-text-input"
                  style={{
                    width: '100%',
                    minHeight: 160,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    fontSize: 'var(--body)',
                    lineHeight: 1.55,
                  }}
                  autoFocus
                />
                <div className="rep-actions">
                  <button
                    type="button"
                    className="rep-btn rep-btn--primary"
                    onClick={() => {
                      update.mutate({ text: scriptDraft });
                      setScriptEditing(false);
                    }}
                    disabled={update.isPending}
                  >
                    {update.isPending ? 'saving' : 'save'}
                  </button>
                  <button
                    type="button"
                    className="rep-btn rep-btn--ghost"
                    onClick={() => {
                      setScriptDraft(item.text);
                      setScriptEditing(false);
                    }}
                  >
                    cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="ig-script" style={{ whiteSpace: 'pre-wrap' }}>{item.text}</p>
                <div className="rep-actions">
                  <button type="button" className="rep-btn rep-btn--ghost" onClick={copyScript}>copy script</button>
                  {moments.length > 0 && (
                    <button type="button" className="rep-btn rep-btn--primary" onClick={copyDescriptPlan}>
                      copy descript edit plan
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Source moments */}
        {moments.length > 0 && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">source moments</h3>
              <p className="rep-section__sub">
                if editing in descript instead of re-filming, search for these verbatim phrases in the original recording.
              </p>
            </header>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {moments.map((m, i) => (
                <div key={i} className="ig-moment">
                  <span className="ig-moment__ts">{m.timestamp}</span>
                  <span className="ig-moment__text">"{m.text}"</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {item.context && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">context</h3>
            </header>
            <p className="rep-section__sub" style={{ fontStyle: 'italic' }}>{item.context}</p>
          </section>
        )}

        {/* Instagram caption */}
        <CaptionSection item={item} />

        {/* Posted URL */}
        {item.status === 'posted' && (
          <section className="rep-section">
            <header className="rep-section__head">
              <h3 className="rep-section__title">posted url</h3>
            </header>
            <input
              type="url"
              className="rep-text-input"
              defaultValue={item.posted_url ?? ''}
              placeholder="https://instagram.com/p/..."
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (item.posted_url ?? '')) update.mutate({ posted_url: v });
              }}
            />
          </section>
        )}

        {/* Danger */}
        <section className="rep-section">
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              style={{ color: '#ff6b6b', borderColor: 'rgba(255,107,107,0.3)' }}
              onClick={() => { if (confirm('Remove this reel from the queue entirely?')) remove.mutate(); }}
              disabled={remove.isPending}
            >
              {remove.isPending ? '...' : 'remove from queue'}
            </button>
          </div>
        </section>
      </aside>
      {bankPickerOpen && (
        <BankPicker
          existingQuoteIds={new Set()}
          onAdd={appendFromBank}
          onClose={() => setBankPickerOpen(false)}
          pending={update.isPending}
        />
      )}
    </div>
  );
}

// ─── Caption section: auto-generated IG caption + 5 hashtags ───────────────

function CaptionSection({ item }: { item: IgQueueItem }) {
  const qc = useQueryClient();
  const generate = useMutation({
    mutationFn: () => api.generateIgCaption(item.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const update = useMutation({
    mutationFn: (body: Partial<Pick<IgQueueItem, 'caption' | 'caption_hashtags'>>) => api.updateIgItem(item.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ig-queue'] }),
  });
  const [draft, setDraft] = useState<string>(item.caption ?? '');
  const [tagsDraft, setTagsDraft] = useState<string>((item.caption_hashtags ?? []).join(' '));
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDraft(item.caption ?? ''); }, [item.caption]);
  useEffect(() => { setTagsDraft((item.caption_hashtags ?? []).join(' ')); }, [item.caption_hashtags]);

  const full = [draft.trim(), tagsDraft.trim()].filter(Boolean).join('\n\n');
  const has = !!(item.caption && item.caption.trim());

  function copy() {
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function saveCaption() {
    const v = draft.trim();
    if (v === (item.caption ?? '').trim()) return;
    update.mutate({ caption: v });
  }
  function saveTags() {
    const next = tagsDraft.trim().split(/\s+/).filter(Boolean).slice(0, 5);
    const prev = item.caption_hashtags ?? [];
    if (next.join(' ') === prev.join(' ')) return;
    update.mutate({ caption_hashtags: next });
  }

  return (
    <section className="rep-section">
      <header className="rep-section__head">
        <h3 className="rep-section__title">instagram caption</h3>
        <p className="rep-section__sub">
          hook + story arc + your CTA + 5 hashtags. paste straight into instagram.
        </p>
      </header>

      {!has && !generate.isPending && (
        <div className="rep-card rep-card--inline">
          <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)', lineHeight: 1.55 }}>
            no caption yet. click generate to draft one based on this reel's title, context, and your voice.
          </p>
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={() => generate.mutate()}
            >
              generate caption
            </button>
          </div>
        </div>
      )}

      {generate.isPending && (
        <div className="rep-card rep-card--inline">
          <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
            drafting caption in your voice… this calls claude and can take 20-40 seconds.
          </p>
        </div>
      )}

      {has && (
        <div className="rep-card rep-card--inline">
          <textarea
            className="rep-text-input ig-caption-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveCaption}
            rows={Math.min(14, Math.max(6, draft.split('\n').length + 1))}
          />
          <input
            type="text"
            className="rep-text-input ig-caption-tags"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            onBlur={saveTags}
            placeholder="#tag1 #tag2 #tag3 #tag4 #tag5"
          />
          <div className="rep-actions">
            <button
              type="button"
              className="rep-btn rep-btn--ghost"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? 'regenerating…' : 'regenerate'}
            </button>
            <button
              type="button"
              className="rep-btn rep-btn--primary"
              onClick={copy}
            >
              {copied ? 'copied ✓' : 'copy for instagram'}
            </button>
          </div>
        </div>
      )}

      {generate.isError && (
        <p className="muted" style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)' }}>
          {(generate.error as Error).message}
        </p>
      )}
    </section>
  );
}

// ─── Inline title editor used in ReelPanel header ──────────────────────────

function TitleEditor({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  function commit(latest: string) {
    const next = latest.trim();
    if (next === value.trim()) return;
    onSave(next);
  }
  return (
    <input
      type="text"
      className="rep-panel__title rep-panel__title--edit"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { setDraft(value); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}

// ─── Bank picker (search approved quotes & stories, add to queue) ──────────

export function BankPicker({
  existingQuoteIds,
  onAdd,
  onClose,
  pending,
}: {
  existingQuoteIds: Set<string>;
  onAdd: (bi: BankItem) => void;
  onClose: () => void;
  pending: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['banks'],
    queryFn: api.listBanks,
  });
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'story' | 'quote'>('all');
  const [tagFilter, setTagFilter] = useState<'all' | BankKind>('all');
  const items = data?.items ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kindFilter === 'story' && !i.title) return false;
      if (kindFilter === 'quote' && i.title) return false;
      if (tagFilter !== 'all' && i.kind !== tagFilter) return false;
      if (!q) return true;
      const hay = `${i.title ?? ''} ${i.text} ${i.context ?? ''} ${(i.topics ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, kindFilter, tagFilter]);

  const KIND_PILLS: Array<{ key: 'all' | 'story' | 'quote'; label: string }> = [
    { key: 'all', label: 'all' },
    { key: 'story', label: 'stories' },
    { key: 'quote', label: 'quotes' },
  ];
  const TAG_PILLS: Array<{ key: 'all' | BankKind; label: string }> = [
    { key: 'all', label: 'all tags' },
    { key: 'pov', label: 'POV' },
    { key: 'framework', label: 'Value' },
    { key: 'proof', label: 'Proof' },
    { key: 'story', label: 'Connection' },
  ];

  return (
    <div className="rep-panel-wrap" onClick={onClose}>
      <aside className="rep-panel ig-picker" onClick={(e) => e.stopPropagation()}>
        <header className="rep-panel__head">
          <div className="rep-panel__head-l">
            <span className="rep-eyebrow">add from bank</span>
            <h2 className="rep-panel__title">search your stories &amp; quotes</h2>
            <p className="rep-panel__def">approved moments from your transcripts. click to add as a reel.</p>
          </div>
          <div className="rep-panel__head-r">
            <button type="button" className="rep-btn rep-btn--ghost" onClick={onClose}>done</button>
          </div>
        </header>

        <div className="ig-picker__controls">
          <input
            type="text"
            className="rep-text-input"
            placeholder="search by text, title, context, topic…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="ig-picker__pills">
            {KIND_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`ig-pill ${kindFilter === p.key ? 'ig-pill--on' : ''}`}
                onClick={() => setKindFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ig-picker__pills">
            {TAG_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`ig-pill ${tagFilter === p.key ? 'ig-pill--on' : ''}`}
                onClick={() => setTagFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ig-picker__list">
          {isLoading && <p className="muted">loading bank…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="muted">no matches. approve quotes from a transcript first (vault → transcript → approve).</p>
          )}
          {filtered.map((bi) => {
            const tag = BANK_KIND_TO_TAG[bi.kind];
            const m = TAG_META[tag];
            const already = existingQuoteIds.has(bi.id);
            const isStory = !!bi.title;
            const preview = bi.text.length > 220 ? bi.text.slice(0, 220) + '…' : bi.text;
            return (
              <article
                key={bi.id}
                className="ig-pick-card"
                style={{ borderColor: `color-mix(in srgb, ${m.color} 22%, var(--hairline))` }}
              >
                <div className="ig-pick-card__head">
                  <span
                    className="ig-card__tag"
                    style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 10%, transparent)` }}
                  >
                    {m.label}
                  </span>
                  <span className="ig-pick-card__kind">{isStory ? 'story' : 'quote'}</span>
                  <button
                    type="button"
                    className="rep-btn rep-btn--primary ig-pick-card__add"
                    style={{ ['--dim-c' as any]: m.color }}
                    onClick={() => onAdd(bi)}
                    disabled={pending || already}
                  >
                    {already ? 'in queue' : pending ? '…' : '+ add'}
                  </button>
                </div>
                {bi.title && <h4 className="ig-pick-card__title">{bi.title}</h4>}
                <p className="ig-pick-card__text">{preview}</p>
                {bi.source_transcript && (
                  <p className="ig-pick-card__src">
                    source: {bi.source_transcript.replace(/\.(md|txt)$/, '')}
                    {bi.source_timestamp && ` · ${bi.source_timestamp}`}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export const IG_CSS = `
.ig-page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-5);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}
.ig-page-sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.5;
  max-width: 56ch;
}

.ig-stat-strip {
  display: flex;
  gap: var(--space-5);
}
.ig-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ig-stat__num {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.5rem, 3vw, 2.2rem);
  letter-spacing: -0.03em;
  line-height: 1;
}
.ig-stat__lbl {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}

.ig-add-row {
  display: flex;
  gap: var(--space-2);
  align-items: stretch;
  margin-bottom: var(--space-5);
  flex-wrap: wrap;
}
.ig-add-row .ig-idea-input { flex: 1; min-width: 280px; margin-bottom: 0; }
.ig-add-row__bank { white-space: nowrap; align-self: stretch; }

.ig-idea-input {
  display: flex;
  gap: var(--space-2);
  align-items: stretch;
  margin-bottom: var(--space-5);
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
}
.ig-idea-input__field {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  padding: 6px 10px;
  outline: none;
}
.ig-idea-input__field::placeholder { color: var(--muted-2); }

.ig-empty {
  padding: var(--space-6);
  background: var(--surface);
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}

.ig-lane { margin-bottom: var(--space-6); }
.ig-lane__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--hairline);
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}
.ig-lane__title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  letter-spacing: -0.025em;
  margin: 0;
  text-transform: lowercase;
}
.ig-lane__empty {
  margin: 0;
  padding: var(--space-4);
  border: 1px dashed var(--hairline);
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.55;
}

.ig-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}

.ig-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: all 0.18s;
  position: relative;
}
.ig-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255,255,255,0.22);
  box-shadow: 0 12px 32px -20px rgba(0,0,0,0.55);
}
.ig-card__head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.ig-card__tag {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
}
.ig-card__tag-wrap { position: relative; }
.ig-card__tag--btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.12s, border-color 0.15s;
}
.ig-card__tag--btn:hover { transform: translateY(-1px); }
.ig-card__tag-caret { font-size: 9px; opacity: 0.7; }
.ig-card__tag-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px -16px rgba(0,0,0,0.6);
  min-width: 130px;
}
.ig-card__tag-opt {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  text-align: left;
  transition: transform 0.12s, background 0.15s;
}
.ig-card__tag-opt:hover:not(:disabled) { transform: translateY(-1px); }
.ig-card__tag-opt:disabled { opacity: 0.5; cursor: not-allowed; }
.ig-card__kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  font-weight: 600;
}
.ig-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
}
.ig-card__preview {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.55;
  color: var(--muted);
  flex: 1;
}
.ig-card__src {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--muted-2);
}
.ig-card__stages { display: flex; gap: 4px; margin-top: auto; }
.ig-stage {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.06);
  transition: background 0.18s;
}
.ig-stage--on { background: var(--recovery); }

.ig-card__quick-btn {
  background: transparent;
  border: 1px solid var(--hairline);
  color: var(--muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  letter-spacing: 0.04em;
  transition: all 0.12s;
  white-space: nowrap;
}
.ig-card__quick-btn:hover {
  color: var(--ink);
  border-color: var(--ink);
}
.ig-card__quick-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ig-stage-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}

.ig-tag-buttons {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.ig-tag-btn {
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s, color 0.15s;
}
.ig-tag-btn:hover:not(:disabled) { transform: translateY(-1px); }
.ig-tag-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.ig-script {
  margin: 0;
  font-size: var(--body);
  line-height: 1.65;
  white-space: pre-wrap;
}

.ig-moment {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
  background: rgba(0,0,0,0.18);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1.55;
}
.ig-moment__ts {
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.ig-moment__text { color: var(--muted); font-style: italic; }

/* Fallback brainstorm section - small at the bottom */
.ig-fallback {
  margin-top: var(--space-8);
  padding-top: var(--space-5);
  border-top: 1px dashed var(--hairline);
}
.ig-fallback__head { margin-bottom: var(--space-3); }
.ig-fallback__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
}
.ig-fallback__sub {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.5;
}
.ig-fallback__details { margin-top: var(--space-3); }
.ig-fallback__summary {
  cursor: pointer;
  font-size: var(--body-sm);
  color: var(--muted);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: inline-block;
  list-style: none;
}
.ig-fallback__summary::-webkit-details-marker { display: none; }
.ig-fallback__summary::before { content: '+ '; }
.ig-fallback__details[open] .ig-fallback__summary::before { content: '− '; }
.ig-fallback__body {
  margin-top: var(--space-4);
  padding: var(--space-4);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
}

/* Bank picker slide-over */
.ig-picker { width: min(760px, 100%); }
.ig-picker__controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--hairline);
}
.ig-picker__pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ig-pill {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all 0.15s;
}
.ig-pill:hover { color: var(--ink); border-color: var(--ink); }
.ig-pill--on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.ig-picker__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: auto;
  flex: 1;
  padding-right: 4px;
}
.ig-pick-card {
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ig-pick-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ig-pick-card__kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  font-weight: 600;
}
.ig-pick-card__add { margin-left: auto; padding: 4px 14px; font-size: 12px; }
.ig-pick-card__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.015em;
  line-height: 1.25;
}
.ig-pick-card__text {
  margin: 0;
  font-size: var(--body-sm);
  line-height: 1.55;
  color: var(--muted);
}
.ig-pick-card__src {
  margin: 0;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--muted-2);
}

/* Shared panel styles (mirrors Reputation slide-over) */
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
  animation: ig-fade 0.18s ease-out;
}
@keyframes ig-fade { from { opacity: 0; } to { opacity: 1; } }
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
  animation: ig-slide 0.22s ease-out;
}
@keyframes ig-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
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
input.rep-panel__title--edit {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ink);
  padding: 4px 8px;
  margin: -4px -8px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
input.rep-panel__title--edit:hover { border-color: var(--hairline); }
input.rep-panel__title--edit:focus { border-color: var(--dim-c); background: rgba(255,255,255,0.03); }
input.rep-panel__title--edit::placeholder { color: var(--muted-2); }
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
.rep-text-input {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  outline: none;
}
.ig-caption-textarea {
  resize: vertical;
  min-height: 160px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.ig-caption-tags {
  font-family: var(--font-mono, monospace);
  font-size: var(--body-sm);
  color: var(--strain);
}

@media (max-width: 640px) {
  .ig-page-head { flex-direction: column; }
  .ig-stat-strip { width: 100%; justify-content: space-between; }
  .rep-panel { padding: var(--space-4); }
}
`;
