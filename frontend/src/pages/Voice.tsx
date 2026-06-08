import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { BrainstormBucket, BrainstormQuestion, BrainstormResponse } from '../api';

const BUCKET_ORDER: BrainstormBucket[] = ['EDUCATE', 'RELATE', 'INSPIRE', 'SELL'];

const BUCKET_COLOR: Record<BrainstormBucket, string> = {
  EDUCATE: 'var(--recovery)',
  RELATE: 'var(--sleep)',
  INSPIRE: 'var(--strain)',
  SELL: '#E6A52F',
};

export function Voice({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [bucketFilter, setBucketFilter] = useState<BrainstormBucket | 'all'>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['brainstorm'],
    queryFn: api.brainstorm,
  });

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const filtered = bucketFilter === 'all' ? items : items.filter((q) => q.bucket === bucketFilter);
    const byBucket = new Map<BrainstormBucket, Map<string, BrainstormQuestion[]>>();
    for (const q of filtered) {
      let bm = byBucket.get(q.bucket as BrainstormBucket);
      if (!bm) {
        bm = new Map();
        byBucket.set(q.bucket as BrainstormBucket, bm);
      }
      const arr = bm.get(q.sub_category) ?? [];
      arr.push(q);
      bm.set(q.sub_category, arr);
    }
    return { byBucket, totalFiltered: filtered.length };
  }, [data, bucketFilter]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    const c: Record<BrainstormBucket | 'all', { total: number; done: number }> = {
      all: { total: 0, done: 0 },
      EDUCATE: { total: 0, done: 0 },
      RELATE: { total: 0, done: 0 },
      INSPIRE: { total: 0, done: 0 },
      SELL: { total: 0, done: 0 },
    };
    for (const q of items) {
      c.all.total++;
      const b = q.bucket as BrainstormBucket;
      c[b].total++;
      if (q.completed) {
        c.all.done++;
        c[b].done++;
      }
    }
    return c;
  }, [data]);

  if (error) {
    return <div className="empty">couldn't load voice: {(error as Error).message}</div>;
  }

  const overallPct = counts.all.total > 0 ? Math.round((counts.all.done / counts.all.total) * 100) : 0;

  return (
    <div className="stack" style={{ gap: 'var(--space-7)' }}>
      {!embedded && (
        <header className="page-header">
          <span className="eyebrow">voice</span>
          <h1 className="h2">100+ questions to mine your voice</h1>
        </header>
      )}

      <div
        style={{
          padding: 'var(--space-5)',
          background: 'var(--surface)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <span className="eyebrow">progress</span>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 'clamp(1.75rem, 7vw, 2.5rem)',
                letterSpacing: '-0.04em',
                lineHeight: 1,
                marginTop: 4,
              }}
            >
              {counts.all.done}
              <span style={{ color: 'var(--muted)' }}> / {counts.all.total}</span>
            </div>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'clamp(1.75rem, 7vw, 2.5rem)',
              letterSpacing: '-0.04em',
              color: 'var(--recovery)',
            }}
          >
            {overallPct}<span style={{ fontSize: '0.45em', opacity: 0.6, fontWeight: 600 }}>%</span>
          </span>
        </div>
        <div
          style={{
            height: 8,
            background: 'rgba(255,255,255,0.07)',
            borderRadius: 'var(--radius-pill)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${overallPct}%`,
              background: 'var(--recovery)',
              borderRadius: 'var(--radius-pill)',
              transition: 'width var(--duration-base) var(--ease-out)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {(['all', ...BUCKET_ORDER] as const).map((b) => {
            const c = counts[b];
            const active = bucketFilter === b;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBucketFilter(b)}
                className="btn"
                style={{
                  background: active ? 'var(--ink)' : 'transparent',
                  color: active ? 'var(--bg)' : 'var(--muted)',
                  borderColor: active ? 'var(--ink)' : 'var(--hairline)',
                  fontSize: 'var(--body-sm)',
                  gap: 8,
                }}
              >
                {b === 'all' ? 'all' : b.toLowerCase()}
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    opacity: 0.7,
                    fontSize: '0.75rem',
                  }}
                >
                  {c.done}/{c.total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="empty">loading questions</div>
      ) : (
        <>
          {BUCKET_ORDER.filter((b) => bucketFilter === 'all' || bucketFilter === b).map((bucket) => {
            const sub = grouped.byBucket.get(bucket);
            if (!sub || sub.size === 0) return null;
            return (
              <section key={bucket} className="stack" style={{ gap: 'var(--space-5)' }}>
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 'var(--space-3)',
                    paddingBottom: 'var(--space-3)',
                    borderBottom: `1px solid ${BUCKET_COLOR[bucket]}30`,
                  }}
                >
                  <div>
                    <span className="eyebrow" style={{ color: BUCKET_COLOR[bucket] }}>
                      {bucket.toLowerCase()}
                    </span>
                    <h3 className="h3" style={{ marginTop: 4 }}>
                      {bucket === 'EDUCATE' && 'teach what you know'}
                      {bucket === 'RELATE' && 'who you are behind the work'}
                      {bucket === 'INSPIRE' && 'transformations and proof'}
                      {bucket === 'SELL' && 'pitch the offer'}
                    </h3>
                  </div>
                  <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
                    {counts[bucket].done} of {counts[bucket].total} done
                  </span>
                </header>
                {Array.from(sub.entries()).map(([subCat, questions]) => (
                  <div key={subCat} className="stack" style={{ gap: 'var(--space-3)' }}>
                    <span className="eyebrow">{subCat}</span>
                    <div className="stack">
                      {questions.map((q) => (
                        <QuestionRow
                          key={q.id}
                          q={q}
                          onOpen={() => setOpenId(q.id)}
                          accent={BUCKET_COLOR[bucket]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

        </>
      )}

      <QuestionDrawer
        question={data?.items.find((q) => q.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ['brainstorm'] });
        }}
      />
    </div>
  );
}

function QuestionRow({
  q,
  onOpen,
  accent,
  dim,
}: {
  q: BrainstormQuestion;
  onOpen: () => void;
  accent: string;
  dim?: boolean;
}) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.updateBrainstorm(q.id, { completed: !q.completed }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['brainstorm'] });
      const prev = qc.getQueryData<BrainstormResponse>(['brainstorm']);
      if (prev) {
        const next: BrainstormResponse = {
          ...prev,
          items: prev.items.map((x) =>
            x.id === q.id ? { ...x, completed: q.completed ? 0 : 1 } : x
          ),
        };
        qc.setQueryData(['brainstorm'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['brainstorm'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['brainstorm'] }),
  });

  const done = !!q.completed;
  const hasAnswer = q.answer && q.answer.trim().length > 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-3)',
        margin: '0 calc(-1 * var(--space-3))',
        borderBottom: '1px solid var(--hairline)',
        background: done ? 'rgba(22,201,126,0.08)' : 'transparent',
        borderRadius: done ? 'var(--radius-md)' : 0,
        opacity: dim ? 0.55 : 1,
        transition: 'background var(--duration-base) var(--ease-out), opacity var(--duration-base) var(--ease-out)',
      }}
    >
      <button
        type="button"
        onClick={() => toggle.mutate()}
        aria-label={done ? 'mark unanswered' : 'mark answered'}
        style={{
          width: 22,
          height: 22,
          marginTop: 2,
          borderRadius: 'var(--radius-pill)',
          border: `1.5px solid ${done ? accent : 'rgba(255,255,255,0.32)'}`,
          background: done ? accent : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
          transition: 'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
        }}
      >
        {done && (
          <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 6.25 5 8.75 9.5 3.5" fill="none" stroke="var(--bg)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: done ? 'var(--recovery)' : 'var(--ink)',
          cursor: 'pointer',
          fontSize: 'var(--body)',
          lineHeight: 1.5,
          fontWeight: done ? 500 : 400,
        }}
      >
        <span
          style={{
            color: 'var(--muted-2)',
            fontVariantNumeric: 'tabular-nums',
            marginRight: 8,
            fontSize: 'var(--body-sm)',
          }}
        >
          {q.number}.
        </span>
        {q.text}
      </button>
      {hasAnswer && !done && (
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--muted-2)',
            padding: '2px 8px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 'var(--radius-pill)',
            flexShrink: 0,
            marginTop: 4,
          }}
        >
          draft
        </span>
      )}
    </div>
  );
}

function QuestionDrawer({
  question,
  onClose,
  onChanged,
}: {
  question: BrainstormQuestion | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [answer, setAnswer] = useState('');
  const [dirty, setDirty] = useState(false);
  const [category, setCategory] = useState<'pov' | 'value' | 'authority' | 'connection' | null>(null);
  const [savedToBank, setSavedToBank] = useState<string | null>(null); // dim label after success

  useEffect(() => {
    if (question) {
      setAnswer(question.answer ?? '');
      setDirty(false);
      setCategory(null);
      setSavedToBank(null);
    }
  }, [question]);

  const save = useMutation({
    mutationFn: async (body: { answer?: string; completed?: boolean }) => {
      const updated = await api.updateBrainstorm(question!.id, body);
      // If a category is picked AND the answer has content, also write to the
      // matching bank in one flow. The backend's to-bank endpoint reads the
      // freshly-saved answer from disk so we always send after the PATCH.
      if (category && (body.answer ?? answer).trim()) {
        await api.brainstormToBank(question!.id, category);
      }
      return updated;
    },
    onSuccess: () => {
      setDirty(false);
      if (category) {
        setSavedToBank(category);
        setCategory(null);
      }
      onChanged();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteBrainstorm(question!.id),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (question) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, onClose]);

  if (!question) return null;

  const done = !!question.completed;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 90,
          backdropFilter: 'blur(2px)',
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(720px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--hairline)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.4)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span className="eyebrow">
            {question.bucket.toLowerCase()} · {question.sub_category} · #{question.number}
          </span>
          <button type="button" onClick={onClose} className="btn" style={{ color: 'var(--muted)' }}>
            close
          </button>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.75rem',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.25,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {question.text}
          </h2>

          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
            tip: hit Fn twice on your keyboard to dictate your answer
          </span>

          <textarea
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value);
              setDirty(true);
            }}
            placeholder="start typing or dictating your answer..."
            autoFocus
            style={{
              width: '100%',
              minHeight: 360,
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              padding: 'var(--space-5)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--body)',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
              flexWrap: 'wrap',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--hairline)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (confirm('delete this question? it will disappear from your list.')) {
                  remove.mutate();
                }
              }}
              className="btn"
              style={{ color: 'var(--muted)', marginRight: 'auto' }}
            >
              {remove.isPending ? 'deleting' : 'delete question'}
            </button>

            {/* Category picker - which bank this answer feeds. Optional: if
                left unselected, save only persists the answer + marks done. */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginRight: 'auto',
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--muted)',
                  fontWeight: 600,
                }}
              >
                save to:
              </span>
              {([
                { value: 'pov', label: 'POV', color: 'var(--sleep)' },
                { value: 'value', label: 'Value', color: 'var(--recovery)' },
                { value: 'authority', label: 'Proof', color: 'var(--strain)' },
                { value: 'connection', label: 'Connection', color: 'var(--hrv)' },
              ] as const).map((c) => {
                const active = category === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(active ? null : c.value)}
                    className="btn"
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      background: active ? c.color : 'transparent',
                      color: active ? 'var(--bg)' : c.color,
                      borderColor: active ? c.color : `color-mix(in srgb, ${c.color} 28%, transparent)`,
                      fontWeight: 600,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {savedToBank && (
              <span style={{ color: 'var(--recovery)', fontSize: 'var(--body-sm)', fontWeight: 600 }}>
                ✓ saved to {savedToBank} bank
              </span>
            )}

            {/* Single primary SAVE. Green when there's something to save. */}
            <button
              type="button"
              onClick={() => {
                const body: { answer?: string; completed?: boolean } = { completed: true };
                if (dirty) body.answer = answer;
                save.mutate(body);
              }}
              disabled={save.isPending || (!dirty && !category && done)}
              className="btn"
              style={{
                background: 'var(--recovery)',
                color: 'var(--bg)',
                borderColor: 'var(--recovery)',
                fontWeight: 700,
                opacity: save.isPending || (!dirty && !category && done) ? 0.5 : 1,
              }}
            >
              {save.isPending ? 'saving' : 'save'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
