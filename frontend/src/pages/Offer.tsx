import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type {
  OfferResponse,
  OfferLever,
  OfferSection,
  OfferStage,
  OfferProfile,
  OfferAvatar,
  OfferFieldStatus,
  OfferValidationPhase,
  OfferPricingRung,
  OfferValueCheckField,
  OfferPricingResult,
  OfferConversionDiagnostic,
  OfferContentAction,
  OfferEmail,
  OfferEmailKind,
  OfferShortFormLink,
} from '../api';
import { Ring } from '../components/Ring';
import { useChat } from '../components/ChatProvider';
import { Icon, PlayIcon, skillIconKind, skillColor } from '../lib/skillVisuals';
import { Markdown } from '../lib/Markdown';
import { PageSkillLink } from '../components/PageSkillLink';

// Offer Strength v2.
// Mirrors the Reputation v4 layout: hero ring + framing, profile card,
// 2x2 lever grid, slide-over panel per lever with OfferCHK 5 questions
// (1-5 self-rate) and the sections that feed signal into that lever.

export function Offer() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['offers'], queryFn: api.offers });
  const [openSection, setOpenSection] = useState<string | null>(null);

  const setSlot = useMutation({
    mutationFn: (v: { slot: string; value: string | null }) => api.setOfferSlot(v.slot, v.value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  if (error) return <div className="empty">couldn't load offer: {(error as Error).message}</div>;
  if (isLoading || !data) return <div className="empty">loading</div>;

  const section = openSection ? data.sections.find((s) => s.id === openSection) ?? null : null;

  // Layout:
  //   Row 1: two dim cards side-by-side - Avatars + Offer Suite. Click each
  //          to open its full panel.
  //   Row 2: each offer (pricing rung) is its own card. Expand any one to
  //          reveal the 5 sub-sections (avatar / pricing / proof / validation
  //          / content-offer) scoped to that offer.
  const avatarSection = data.sections.find((s) => s.id === 'avatar');
  const pricingSection = data.sections.find((s) => s.id === 'pricing');
  const proofSection = data.sections.find((s) => s.id === 'proof');
  const validationSection = data.sections.find((s) => s.id === 'validation');
  const contentSection = data.sections.find((s) => s.id === 'content_offer');
  const rungs = pricingSection?.pricing_rungs ?? [];
  const avatars = pricingSection?.avatars ?? [];

  return (
    <div className="off">
      {/* ─── Row 1: avatars + offer suite as 2-up phase-style cards ───
          Styled like the onboarding phase cards on Profile > Overview.
          No score ring or percent. Gray when empty, green when complete.
          "Complete" = at least one avatar / at least one named pricing rung. */}
      <div className="off-sec-grid">
        {avatarSection && (
          <PhaseStyleCard
            title="avatars"
            description="who you serve. fill in the people your offers speak to so every other surface of the dashboard pulls from a clear persona."
            complete={(avatarSection.avatars ?? []).length > 0}
            stateLabel={
              (avatarSection.avatars ?? []).length === 0
                ? 'empty'
                : `${(avatarSection.avatars ?? []).length} avatar${(avatarSection.avatars ?? []).length === 1 ? '' : 's'}`
            }
            onOpen={() => setOpenSection('avatar')}
          />
        )}
        {pricingSection && (
          <PhaseStyleCard
            title="offer suite"
            description="every offer you sell, organised by tier. drives the offer cards below + every script + every email."
            complete={(pricingSection.pricing_rungs ?? []).some((r) => (r.name?.trim() || r.price_label?.trim()))}
            stateLabel={
              (pricingSection.pricing_rungs ?? []).length === 0
                ? 'empty'
                : `${(pricingSection.pricing_rungs ?? []).filter((r) => (r.name?.trim() || r.price_label?.trim())).length} offer${(pricingSection.pricing_rungs ?? []).filter((r) => (r.name?.trim() || r.price_label?.trim())).length === 1 ? '' : 's'}`
            }
            onOpen={() => setOpenSection('pricing')}
          />
        )}
      </div>

      {/* ─── Row 2: each offer as its own expandable card ────────────── */}
      <OfferCardsList
        rungs={rungs}
        avatars={avatars}
        proofSection={proofSection ?? null}
        validationSection={validationSection ?? null}
        contentSection={contentSection ?? null}
        onOpenSection={(id) => setOpenSection(id)}
      />

      {section && (
        <SectionPanel
          section={section}
          onClose={() => setOpenSection(null)}
          onSaveField={(slot, value) => setSlot.mutate({ slot, value })}
        />
      )}

      <style>{OFF_CSS}</style>
    </div>
  );
}

// =========================================================================
// Per-offer cards list - one card per offer (pricing rung), expandable to
// reveal 5 sub-sections (avatar / pricing / proof / validation / content)
// scoped to that offer.
// =========================================================================
function OfferCardsList({
  rungs,
  avatars,
  proofSection,
  validationSection,
  contentSection,
  onOpenSection,
}: {
  rungs: OfferPricingRung[];
  avatars: OfferAvatar[];
  proofSection: OfferSection | null;
  validationSection: OfferSection | null;
  contentSection: OfferSection | null;
  onOpenSection: (id: string) => void;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<OfferPricingRung> }) => api.updatePricingRung(v.id, v.body),
    // Optimistic patch into the offers cache so rating a question (or any
    // other rung edit) reflects instantly on the sub-card rings instead of
    // waiting ~200ms for the refetch. Without this, the validation ring
    // appeared "not linked" because the new score didn't paint until the
    // network round-trip resolved.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['offers'] });
      const prev = qc.getQueryData<OfferResponse>(['offers']);
      if (prev) {
        qc.setQueryData<OfferResponse>(['offers'], {
          ...prev,
          sections: prev.sections.map((s) => {
            if (s.id !== 'pricing' || !s.pricing_rungs) return s;
            return {
              ...s,
              pricing_rungs: s.pricing_rungs.map((r) =>
                r.id === v.id ? { ...r, ...v.body } : r,
              ),
            };
          }),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['offers'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const setFeatured = useMutation({
    mutationFn: (v: { id: string; featured: boolean }) => api.setFeaturedRung(v.id, v.featured),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deletePricingRung(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const add = useMutation({
    mutationFn: () =>
      api.addPricingRung({
        price_label: '',
        name: '',
        tier: 'custom',
        sort_order: rungs.length > 0 ? Math.max(...rungs.map((r) => r.sort_order)) + 1 : 1,
        status: 'idea',
        avatar_id: null,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      // Auto-expand the new card so the creator lands on the editor.
      if (created?.id) setOpenId(created.id);
    },
  });
  // Default the open card to the focus (featured) offer if there is one, so
  // the creator lands on her current focus expanded. Tracks whether we've already
  // applied the default - any user toggle after that sticks.
  const featured = rungs.find((r) => r.featured) ?? null;
  const [openId, setOpenId] = useState<string | null>(featured?.id ?? null);
  const defaultedRef = useRef<boolean>(featured?.id != null);
  useEffect(() => {
    // If the user lands on the page before rungs have loaded, fall through
    // to defaulting open once the featured offer appears.
    if (!defaultedRef.current && featured?.id) {
      setOpenId(featured.id);
      defaultedRef.current = true;
    }
  }, [featured?.id]);
  const others = rungs
    .filter((r) => !r.featured)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (rungs.length === 0) {
    return (
      <section className="off-section">
        <header className="off-section__head">
          <h3 className="off-section__title">your offers</h3>
          <p className="off-section__sub">no offers yet. open the Offer Suite card above to add one.</p>
        </header>
      </section>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)', marginTop: 'var(--space-7)' }}>
      <header className="stack" style={{ gap: 4 }}>
        <span className="off-eyebrow">your offers</span>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '-0.01em',
          }}
        >
          {featured ? 'one focus, plus the rest' : 'pick one to focus on'}
        </h2>
        <p className="off-section__sub" style={{ margin: 0, maxWidth: '70ch' }}>
          each offer in your suite. click any to expand the full breakdown - avatar, pricing, proof, validation, content-offer. star the one you're focusing on this sprint.
        </p>
      </header>

      {/* Featured drop zone - drop another offer here to promote it. */}
      <FeaturedDropZone
        hasFeatured={!!featured}
        onDropId={(id) => setFeatured.mutate({ id, featured: true })}
      >
        {featured && (
          <OfferCard
            rung={featured}
            isFeatured
            avatars={avatars}
            proofSection={proofSection}
            validationSection={validationSection}
            contentSection={contentSection}
            open={openId === featured.id}
            onToggle={() => setOpenId(openId === featured.id ? null : featured.id)}
            onSave={(body) => update.mutate({ id: featured.id, body })}
            onDelete={() => {
              if (confirm('delete this offer?')) del.mutate(featured.id);
            }}
            onToggleFeatured={() => setFeatured.mutate({ id: featured.id, featured: false })}
            onOpenSection={onOpenSection}
          />
        )}
      </FeaturedDropZone>

      {others.length > 0 && (
        <div className="stack" style={{ gap: 'var(--space-4)' }}>
          {others.map((r) => (
            <OfferCard
              key={r.id}
              rung={r}
              avatars={avatars}
              proofSection={proofSection}
              validationSection={validationSection}
              contentSection={contentSection}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
              onSave={(body) => update.mutate({ id: r.id, body })}
              onDelete={() => {
                if (confirm('delete this offer?')) del.mutate(r.id);
              }}
              onToggleFeatured={() => setFeatured.mutate({ id: r.id, featured: true })}
              onOpenSection={onOpenSection}
            />
          ))}
        </div>
      )}

      {/* + add offer button at the bottom of the list. Creates an empty
          rung; the new card auto-expands so the creator lands on the editor. */}
      <button
        type="button"
        onClick={() => add.mutate()}
        disabled={add.isPending}
        style={{
          background: 'transparent',
          border: '2px dashed var(--hairline)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
          color: 'var(--muted)',
          fontFamily: 'inherit',
          fontSize: 'var(--body-sm)',
          cursor: 'pointer',
          textAlign: 'center',
          fontWeight: 600,
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink)';
          (e.currentTarget as HTMLElement).style.color = 'var(--ink)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
          (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
        }}
      >
        {add.isPending ? 'adding…' : '+ add an offer'}
      </button>
      {add.isError && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
          add failed: {(add.error as Error)?.message}
        </p>
      )}
    </div>
  );
}

// Featured-offer drop zone. Drop any other offer card here to promote it to
// featured (the existing featured offer gets demoted). When empty, renders
// an inviting placeholder.
function FeaturedDropZone({
  children,
  hasFeatured,
  onDropId,
}: {
  children: React.ReactNode;
  hasFeatured: boolean;
  onDropId: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
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
        if (id) onDropId(id);
      }}
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        outline: hover ? '2px dashed var(--recovery)' : 'none',
        outlineOffset: -2,
        background: hover ? 'color-mix(in srgb, var(--recovery) 5%, transparent)' : 'transparent',
        transition: 'background 0.15s',
        minHeight: hasFeatured ? undefined : 140,
      }}
    >
      {hasFeatured ? (
        children
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-6)',
            border: '2px dashed var(--hairline)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--muted)',
            fontSize: 'var(--body-sm)',
            fontStyle: 'italic',
            textAlign: 'center',
          }}
        >
          ★ drag an offer here to make it your focus · this is what you're building this sprint
        </div>
      )}
    </div>
  );
}

function OfferCard({
  rung,
  isFeatured = false,
  avatars,
  // proofSection / validationSection were the global section payloads the
  // sub-cards used to point at. Now that proof + validation are per-rung
  // they read from rung.proof_section / rung.validation_phases directly.
  // Props kept in the signature for API stability but marked unused.
  proofSection: _proofSection,
  validationSection,
  contentSection: _contentSection,
  open,
  onToggle,
  onSave,
  onDelete,
  onToggleFeatured,
  // onOpenSection used to route sub-card clicks to the global section
  // panel. Validation + proof now have per-rung panels (setPerOfferPanel),
  // so onOpenSection is unused. Kept for the same API-stability reason.
  onOpenSection: _onOpenSection,
}: {
  rung: OfferPricingRung;
  isFeatured?: boolean;
  avatars: OfferAvatar[];
  proofSection: OfferSection | null;
  validationSection: OfferSection | null;
  contentSection: OfferSection | null;
  open: boolean;
  onToggle: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
  onDelete: () => void;
  onToggleFeatured: () => void;
  onOpenSection: (id: string) => void;
}) {
  const attachedAvatar = avatars.find((a) => a.id === rung.avatar_id) ?? null;
  // Head ring now reflects the stage-weighted overall score from the
  // 25-question self-rate. Until questions are rated it stays at 0 - that's
  // the honest answer for a brand-new offer.
  const { value: completion, perSection: sectionScores } = overallScore(rung);
  const STRAIN = 'var(--strain)';
  const [perOfferPanel, setPerOfferPanel] = useState<'avatar' | 'pricing' | 'content' | 'score' | 'validation' | 'proof' | 'salespage' | null>(null);

  // Sizing toggles for the bigger featured card.
  const ringSize = isFeatured ? 110 : 72;
  const titleSize = isFeatured ? '1.75rem' : '1.25rem';
  const pad = isFeatured ? 'var(--space-5) var(--space-6)' : 'var(--space-4) var(--space-5)';

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', rung.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      style={{
        background: 'var(--surface)',
        border: `${isFeatured ? '2px' : '1px'} solid ${isFeatured ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: isFeatured ? '0 0 0 1px color-mix(in srgb, var(--recovery) 22%, transparent), 0 12px 32px -22px rgba(0,0,0,0.4)' : 'none',
        overflow: 'hidden',
        cursor: 'grab',
        // Position relative so the unfocus star (absolutely-positioned
        // below) anchors to this card's top-right corner.
        position: 'relative',
      }}
    >
      {/* Unfocus star - sits in the top-right of the featured card so
          the creator can unfocus without opening the card. Uses pointer-events
          + stopPropagation so clicking it doesn't toggle the card open.
          Only renders on the featured card. */}
      {isFeatured && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFeatured(); }}
          // Pull it inside the 2px featured border so it sits flush with
          // the corner instead of clipping into the recovery outline.
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 2,
            background: 'var(--surface)',
            border: '1px solid color-mix(in srgb, var(--recovery) 45%, var(--hairline))',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--recovery)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            lineHeight: 1,
          }}
          title="unfocus this offer (remove the focus-of-this-sprint star)"
        >
          <span>★</span>
          <span>unfocus</span>
        </button>
      )}
      {/* ─── Head row (always visible) ─────────────────────────────── */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: 'transparent',
          border: 'none',
          width: '100%',
          padding: pad,
          display: 'grid',
          gridTemplateColumns: `${ringSize}px 1fr auto`,
          alignItems: 'center',
          gap: 'var(--space-4)',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          color: 'var(--ink)',
        }}
      >
        <div style={{ width: ringSize, height: ringSize, flexShrink: 0 }}>
          <Ring value={completion} label="" bigNumber={`${Math.round(completion * 100)}`} unit="" size="small" color={isFeatured ? 'var(--recovery)' : STRAIN} />
        </div>
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          {isFeatured && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--recovery)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                display: 'block',
                marginBottom: 2,
              }}
            >
              ★ focus of this sprint
            </span>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: titleSize, letterSpacing: '-0.01em' }}>
              {rung.name || <span style={{ color: 'var(--muted-2)', fontStyle: 'italic', fontWeight: 400 }}>untitled offer</span>}
            </span>
            {rung.price_label && (
              <span style={{ color: 'var(--muted)', fontSize: 'var(--body-sm)', fontVariantNumeric: 'tabular-nums' }}>
                · {rung.price_label}
              </span>
            )}
          </div>
          <p className="off-section__sub" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
            {rung.promise || rung.proof_required || 'no promise set. open to add what this offer delivers.'}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 11, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.1em', flexWrap: 'wrap' }}>
            <span>stage: {rung.status}</span>
            <span>tier: {rung.tier}</span>
            <span>{attachedAvatar ? `→ ${attachedAvatar.name ?? 'avatar'}` : 'no avatar'}</span>
          </div>
        </div>
        <span style={{ fontSize: isFeatured ? '2rem' : '1.5rem', color: 'var(--muted)', fontWeight: 300 }}>{open ? '−' : '+'}</span>
      </button>

      {/* ─── Expanded body: promise + 5 sub-section cards ──────────── */}
      {open && (
        <div
          style={{
            padding: '0 var(--space-5) var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            borderTop: '1px solid var(--hairline)',
          }}
        >
          {/* THE PROMISE - one editable sentence at the top */}
          <OfferPromiseEditor
            promise={rung.promise ?? ''}
            isFeatured={isFeatured}
            onSave={(v) => onSave({ promise: v })}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-2) 0',
              flexWrap: 'wrap',
            }}
          >
            <span className="off-section__sub" style={{ margin: 0 }}>
              click any card below to edit that part of this offer.
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="off-btn off-btn--ghost"
                onClick={onToggleFeatured}
                style={{ fontSize: 11 }}
              >
                {isFeatured ? '★ unfocus' : '☆ make focus'}
              </button>
              <button
                type="button"
                className="off-btn off-btn--danger-ghost"
                onClick={onDelete}
                style={{ fontSize: 11 }}
              >
                delete
              </button>
            </div>
          </div>

          <div className="off-sec-grid">
            <AvatarSubCard
              avatar={attachedAvatar}
              onClick={() => setPerOfferPanel('avatar')}
            />
            {/* The six "shape of the offer" sub-cards (avatar / pricing /
                proof / validation / conversions / sales page) all share the
                blue and sit in a 2x3 grid. The Overall Offer Score is
                pulled out below the grid as a full-width recovery-green bar so
                it reads as the rollup of everything above it. */}
            <OfferSubCard
              eyebrow="pricing"
              title={rung.goal_price_label ? `goal: ${rung.goal_price_label}` : 'set a price strategy'}
              definition={pricingCardSummary(rung)}
              color="var(--strain)"
              score={sectionScores.pricing}
              onClick={() => setPerOfferPanel('pricing')}
            />
            <OfferSubCard
              eyebrow="proof"
              title="Proof"
              definition="The one-line promise this offer makes plus the proof that makes it believable."
              color="var(--strain)"
              score={rung.proof_section?.build_completion ?? 0}
              onClick={() => setPerOfferPanel('proof')}
            />
            <OfferSubCard
              eyebrow="validation"
              title={validationSection?.label ?? 'Validation'}
              definition="Where this offer is on the journey from idea to scaling, by tangible signs."
              color="var(--strain)"
              score={(() => {
                const phases = rung.validation_phases ?? [];
                const allChecks = phases.flatMap((p) => p.checks);
                const done = allChecks.filter((c) => c.done).length;
                return allChecks.length > 0 ? done / allChecks.length : 0;
              })()}
              onClick={() => setPerOfferPanel('validation')}
            />
            <OfferSubCard
              eyebrow="conversions"
              title={contentCardTitle(rung)}
              definition="How traffic flows into this offer and converts at every step of the funnel."
              color="var(--strain)"
              score={sectionScores.content}
              onClick={() => setPerOfferPanel('content')}
            />
            {/* ─── 6th sub-card: Sales page (write it with Claude) ─── */}
            <OfferSubCard
              eyebrow="sales page"
              title={(rung.sales_page_words ?? 0) > 0 ? `${rung.sales_page_words} words written` : 'write your sales page'}
              definition="Talk to Claude to write this offer's sales page, then read and edit it right here."
              color="var(--strain)"
              score={(rung.sales_page_words ?? 0) > 0 ? 1 : 0}
              onClick={() => setPerOfferPanel('salespage')}
            />
          </div>

          {/* ─── Overall Offer Score - full-width rollup beneath the grid ─── */}
          <OfferScoreBar score={completion} onClick={() => setPerOfferPanel('score')} />

          {/* Per-offer panels - open over the page when a sub-card is clicked. */}
          {perOfferPanel === 'avatar' && (
            <PerOfferAvatarPanel
              rung={rung}
              avatars={avatars}
              onClose={() => setPerOfferPanel(null)}
              onSave={onSave}
            />
          )}
          {perOfferPanel === 'pricing' && (
            <PerOfferPricingPanel
              rung={rung}
              onClose={() => setPerOfferPanel(null)}
              onSave={onSave}
            />
          )}
          {perOfferPanel === 'content' && (
            <PerOfferContentPanel
              rung={rung}
              onClose={() => setPerOfferPanel(null)}
              onSave={onSave}
            />
          )}
          {perOfferPanel === 'score' && (
            <PerOfferScorePanel
              rung={rung}
              onClose={() => setPerOfferPanel(null)}
              onSave={onSave}
            />
          )}
          {perOfferPanel === 'validation' && (
            <PerOfferValidationPanel
              rung={rung}
              onClose={() => setPerOfferPanel(null)}
            />
          )}
          {perOfferPanel === 'proof' && (
            <PerOfferProofPanel
              rung={rung}
              onClose={() => setPerOfferPanel(null)}
            />
          )}
          {perOfferPanel === 'salespage' && (
            <PerOfferSalesPagePanel
              rung={rung}
              avatars={avatars}
              onClose={() => setPerOfferPanel(null)}
            />
          )}
        </div>
      )}
    </article>
  );
}

// One-line "the promise" editor pinned to the top of an expanded offer card.
function OfferPromiseEditor({
  promise,
  isFeatured,
  onSave,
}: {
  promise: string;
  isFeatured: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(promise);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(promise); }, [promise, editing]);
  function commit() {
    setEditing(false);
    if (draft.trim() !== (promise ?? '').trim()) onSave(draft.trim());
  }
  const ACCENT = isFeatured ? 'var(--recovery)' : 'var(--strain)';
  return (
    <section
      style={{
        border: `1px solid color-mix(in srgb, ${ACCENT} 35%, var(--hairline))`,
        background: `color-mix(in srgb, ${ACCENT} 4%, transparent)`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        marginTop: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <span className="off-eyebrow" style={{ color: ACCENT }}>the promise</span>
      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setEditing(false); setDraft(promise); }
            }}
            rows={2}
            placeholder="e.g. get your first 10 paying members in 30 days without paid ads."
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink)',
              padding: 'var(--space-2)',
              fontSize: '1.05rem',
              lineHeight: 1.4,
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <span className="off-section__sub" style={{ margin: 0, fontSize: 11 }}>
            one sentence: outcome + timeframe. enter to save, esc to cancel.
          </span>
        </>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{ cursor: 'pointer', padding: 2 }}
        >
          {promise ? (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                color: 'var(--ink)',
              }}
            >
              {promise}
            </p>
          ) : (
            <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>
              click to write the promise · one sentence, specific outcome + timeframe.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// Avatar sub-card. Structurally MIRRORS OfferSubCard so it occupies the
// same height in the grid - if the layout drifts, drift here too.
// Shows the avatar image (circular, in the 64px ring slot), the name
// (in the title slot), and a Claude-generated card-sized summary
// (in the definition snippet slot - same place OfferSubCard puts its
// description). No score; the bar slot is kept as an invisible spacer
// so the total card height matches the scored siblings exactly.
function AvatarSubCard({
  avatar,
  onClick,
}: {
  avatar: OfferAvatar | null;
  onClick?: () => void;
}) {
  const qc = useQueryClient();
  // Matches its 4 blue sibling sub-cards (pricing / proof /
  // validation / conversions). Only the Overall Offer Score card uses
  // recovery green so the rollup metric stands apart visually.
  const color = 'var(--strain)';
  const imgUrl = avatar?.image_path
    ? `/api/vault-asset/${encodeURI(avatar.image_path)}`
    : null;

  // Auto-generate the card summary once if an avatar is attached but
  // doesn't have a card_summary yet. Fires exactly once per avatar (the
  // mutation's success persists card_summary, so the condition flips
  // false on next render).
  const generate = useMutation({
    mutationFn: (id: string) => api.generateAvatarCardSummary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  useEffect(() => {
    if (avatar && !avatar.card_summary && !generate.isPending && !generate.isError) {
      generate.mutate(avatar.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatar?.id, avatar?.card_summary]);

  // Display priority: server-generated card_summary → fallback to a
  // brief slice of one_line → placeholder text. card_summary is sized
  // to fit; one_line might overflow the slot (in which case it's
  // truncated to 60 chars to match OfferSubCard's behaviour).
  const displaySummary: string = avatar
    ? avatar.card_summary?.trim() ||
      (generate.isPending ? 'writing a one-sentence summary…' : '') ||
      (avatar.one_line ? avatar.one_line.slice(0, 60) + (avatar.one_line.length > 60 ? '…' : '') : 'open avatar to add a description.')
    : 'attach one of your avatars to this offer.';

  return (
    <button
      type="button"
      className="off-secdim"
      onClick={onClick}
      style={{ '--sec-c': color } as React.CSSProperties}
    >
      <div className="off-secdim__row">
        {/* Circular image in the 64px slot (same dimensions as the
            Ring used by scored sibling cards - keeps row height equal). */}
        <div
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: '50%',
            overflow: 'hidden',
            border: `1px ${imgUrl ? 'solid' : 'dashed'} color-mix(in srgb, ${color} 40%, var(--hairline))`,
            background: imgUrl ? 'rgba(255,255,255,0.04)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={`${avatar?.name ?? 'avatar'} portrait`}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--muted-2)',
                textAlign: 'center',
                lineHeight: 1.2,
                padding: 4,
              }}
            >
              {avatar ? 'no img' : '+ pick'}
            </span>
          )}
        </div>
        <div className="off-secdim__head">
          <span className="off-eyebrow" style={{ color }}>avatar</span>
          <p className="off-secdim__def" style={{ fontWeight: 600 }}>
            {avatar?.name ?? 'pick an avatar'}
          </p>
          {/* Full sentence directly under the name. Wraps as needed -
              card grows; sibling cards in the grid will match height. */}
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--muted)',
              fontStyle: avatar && !avatar.card_summary && generate.isPending ? 'italic' : 'normal',
            }}
          >
            {displaySummary}
          </p>
        </div>
      </div>
      {/* Invisible spacer matches OfferSubCard's progress bar height so
          this card aligns horizontally with scored siblings up to and
          including the meta row. */}
      <div className="off-secdim__bar" style={{ visibility: 'hidden' }} />
      <div className="off-secdim__meta">
        <span style={{ opacity: 0.7 }}>{avatar ? `linked: ${avatar.name}` : 'no avatar linked'}</span>
        <OpenArrow />
      </div>
    </button>
  );
}

// Shared "open →" pill - used by every sub-card so the arrow is
// vertically aligned with the word across cards regardless of font
// baseline differences. inline-flex + align-items: center forces the
// arrow and the text onto the same optical line.
function OpenArrow() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span>open</span>
      <span style={{ fontSize: '0.95em', lineHeight: 1, transform: 'translateY(-0.5px)' }}>→</span>
    </span>
  );
}

// Phase-style card. Mirrors the onboarding phase cards on Profile > Overview:
// gray when empty, green when complete. No score ring, no percent - just a
// state label + "read" affordance. Used for Avatars + Offer Suite at the top
// of the offer page where a numeric score adds noise rather than signal.
function PhaseStyleCard({
  title,
  description,
  complete,
  stateLabel,
  onOpen,
}: {
  title: string;
  description: string;
  complete: boolean;
  stateLabel: string;
  onOpen: () => void;
}) {
  const color = complete ? 'var(--recovery)' : 'rgb(120, 120, 120)';
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        fontFamily: 'inherit',
        color: 'var(--ink)',
        transition: 'transform 0.18s, border-color 0.18s, box-shadow 0.18s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${color} 40%, var(--hairline))`;
        (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 32px -22px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.transform = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <div className="stack" style={{ gap: 6 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color,
            fontWeight: 700,
          }}
        >
          {title}
        </span>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--body-sm)',
            color: 'var(--muted)',
            lineHeight: 1.55,
          }}
        >
          {description}
        </p>
      </div>
      <div
        style={{
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: complete ? '100%' : '12%',
            background: color,
            borderRadius: 999,
            transition: 'width var(--duration-base, 240ms) var(--ease-out, ease-out)',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 600,
        }}
      >
        <span style={{ color: complete ? color : 'var(--muted)' }}>{stateLabel}</span>
        <span>open -&gt;</span>
      </div>
    </button>
  );
}

function OfferSubCard({
  eyebrow,
  title,
  definition,
  color,
  score,
  onClick,
}: {
  eyebrow: string;
  title: string;
  definition: string;
  color: string;
  score: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="off-secdim"
      onClick={onClick}
      style={{ '--sec-c': color } as React.CSSProperties}
    >
      <div className="off-secdim__row">
        <div style={{ width: 64, height: 64, flexShrink: 0 }}>
          <Ring value={score} label="" bigNumber={`${Math.round(score * 100)}`} unit="" size="tiny" color={color} />
        </div>
        <div className="off-secdim__head">
          <span className="off-eyebrow" style={{ color }}>{eyebrow}</span>
          <p className="off-secdim__def">{title}</p>
        </div>
      </div>
      <div className="off-secdim__bar">
        <div className="off-secdim__bar-fill" style={{ width: `${score * 100}%`, background: color }} />
      </div>
      <div className="off-secdim__meta">
        <span style={{ opacity: 0.7 }}>{definition.slice(0, 60)}{definition.length > 60 ? '…' : ''}</span>
        <OpenArrow />
      </div>
    </button>
  );
}

// The overall offer score, rendered as a full-width thin rollup beneath the
// six sub-section cards (avatar / pricing / proof / validation / conversions /
// sales page). The ring carries the number; the row stays low and wide so the
// grid above reads as a clean 2x3.
function OfferScoreBar({ score, onClick }: { score: number; onClick: () => void }) {
  const color = 'var(--recovery)';
  return (
    <button
      type="button"
      className="off-scorebar"
      onClick={onClick}
      style={{ '--sec-c': color } as React.CSSProperties}
    >
      <div style={{ width: 52, height: 52, flexShrink: 0 }}>
        <Ring value={score} label="" bigNumber={`${Math.round(score * 100)}`} unit="" size="tiny" color={color} />
      </div>
      <div className="off-scorebar__mid">
        <span className="off-eyebrow" style={{ color }}>overall offer score</span>
        <p className="off-secdim__def" style={{ margin: 0 }}>How strong this offer is overall, across 25 self-rated questions.</p>
      </div>
      <OpenArrow />
    </button>
  );
}

// The sales page panel. Two things in one place: a "script it with Claude" card
// (pre-scoped to THIS offer + its attached avatar, saving to the offer's own
// sales page file) and an inline editor of that file so the finished page lives
// right here on the offer - never in a folder you have to go find.
function PerOfferSalesPagePanel({
  rung,
  avatars,
  onClose,
}: {
  rung: OfferPricingRung;
  avatars: OfferAvatar[];
  onClose: () => void;
}) {
  const { openChat } = useChat();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] = useState(false);
  const page = useQuery({ queryKey: ['rung-sales-page', rung.id], queryFn: () => api.getRungSalesPage(rung.id) });
  useEffect(() => {
    if (page.data && draft === null) setDraft(page.data.content);
  }, [page.data, draft]);
  const save = useMutation({
    mutationFn: (content: string) => api.saveRungSalesPage(rung.id, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const attachedAvatar = avatars.find((a) => a.id === rung.avatar_id) ?? null;

  // The skill summary drives the card so it looks exactly like its Skills-page
  // row (icon, color, title, card line, custom/built-in badge).
  const skillsQuery = useQuery({ queryKey: ['skills'], queryFn: api.skills });
  const spSkill = skillsQuery.data?.items.find((s) => s.name === 'sales-page-builder') ?? null;

  // Auto-grow the editor with its content instead of scrolling inside it. The
  // panel itself scrolls, so the textarea always shows the whole page.
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft, page.isLoading, editing]);

  async function scriptIt() {
    if (opening) return;
    setOpening(true);
    try {
      // Resolve the skill id by name (id is location-derived, differs in the template).
      const { items } = await api.skills();
      const summary = items.find((s) => s.name === 'sales-page-builder');
      if (!summary) return;
      const full = await api.getSkill(summary.id);
      const target = page.data?.path || '';

      // Everything filled in for THIS offer on the offer page, auto-attached so
      // there's nothing to re-enter. Only non-empty fields are included.
      const a = attachedAvatar;
      const num = (n: number | null | undefined) => (n == null ? '' : String(n));
      const offer = [
        `the offer "${rung.name || 'this offer'}"${rung.price_label ? ` (${rung.price_label})` : ''}`,
        rung.promise && `promise: ${rung.promise}`,
        rung.proof_required && `what it is: ${rung.proof_required}`,
        rung.status && `stage: ${rung.status}`,
        rung.tier && `tier: ${rung.tier}`,
        rung.goal_price_label && `goal price: ${rung.goal_price_label}`,
        rung.pricing_plan && `pricing plan: ${rung.pricing_plan}`,
        num(rung.target_customers_per_month) && `target: ${num(rung.target_customers_per_month)} customers/mo`,
        num(rung.target_revenue_per_month_usd) && `target revenue: $${num(rung.target_revenue_per_month_usd)}/mo`,
        rung.audience_journey && `audience journey: ${rung.audience_journey}`,
        rung.cta_locations && `CTA locations: ${rung.cta_locations}`,
        rung.cta_frequency && `CTA frequency: ${rung.cta_frequency}`,
        rung.sales_page_url && `current sales page URL: ${rung.sales_page_url}`,
        'full offer detail in 01_Core/core_offer-suite.md',
      ]
        .filter(Boolean)
        .join('. ');
      const avatar = a
        ? [
            `the audience avatar "${a.name || 'this avatar'}"`,
            a.source_file && `read its full profile at ${a.source_file}`,
            a.one_line && `one-line: ${a.one_line}`,
            a.before_state && `before: ${a.before_state}`,
            a.after_state && `after: ${a.after_state}`,
            a.demographics && `who: ${a.demographics}`,
            a.price_point && `price point: ${a.price_point}`,
            a.struggles?.length ? `struggles: ${a.struggles.join('; ')}` : '',
            a.outcomes?.length ? `wants: ${a.outcomes.join('; ')}` : '',
          ]
            .filter(Boolean)
            .join('. ')
        : '';

      const lines = [
        `Run the ${full.name} skill. Read and follow its instructions at ${full.location}.`,
        '',
        'Use these inputs (already filled in on the offer page - use them, do not ask me to re-enter anything):',
        `- Offer: ${offer}`,
      ];
      if (avatar) lines.push(`- Audience avatar: ${avatar}`);
      lines.push(
        `- Proof: use this offer's real proof - read 00_System/proof-points.json and 05_Assets/Proof/ for testimonials, results, and wins relevant to this offer.`,
        '',
        `This is the sales page for the offer "${rung.name || 'this offer'}". Stay on this offer; do not pick a different one.${target ? ` Always save the finished page to ${target}` : ' Save the finished page to this offer'} (the sales page box on this offer reads from there) AND paste the full sales page into the chat.`,
      );
      openChat({ seed: lines.join('\n'), autosend: true, context: `sales page - ${rung.name || 'offer'}` });
    } catch {
      // skill not found - nothing to open
    } finally {
      setOpening(false);
    }
  }

  return (
    <PanelShell
      eyebrow="sales page"
      title={`sales page for ${rung.name || 'this offer'}`}
      subtitle="write it with Claude, then read and edit it right here. it saves to this offer, so your offer score can see it."
      color="var(--strain)"
      onClose={onClose}
    >
      {/* Script-a-sales-page card - styled like its Skills-page row (minus the
          schedule button). One click runs the skill, auto-scoped to this offer
          + avatar, saving back to this offer's sales page. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--hairline)',
          background: 'var(--surface)',
        }}
      >
        {spSkill && (
          <div
            style={{
              flex: '0 0 auto',
              width: 42,
              height: 42,
              borderRadius: 'var(--radius-md)',
              display: 'grid',
              placeItems: 'center',
              color: skillColor(spSkill),
              background: `color-mix(in srgb, ${skillColor(spSkill)} 14%, transparent)`,
            }}
          >
            <Icon kind={skillIconKind(spSkill)} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--body)', fontWeight: 600, color: 'var(--ink)' }}>
              {spSkill?.title || 'Write a Sales Page'}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-pill)',
                padding: '2px 8px',
              }}
            >
              {spSkill && !spSkill.builtIn ? 'custom' : 'built-in'}
            </span>
          </div>
          <div className="off-section__sub" style={{ margin: '3px 0 0' }}>
            {spSkill?.summary || "Write your landing page copy from this offer and audience."}
          </div>
        </div>
        <button
          type="button"
          onClick={scriptIt}
          disabled={opening}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            flex: '0 0 auto',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--body-sm)',
            fontWeight: 600,
            cursor: opening ? 'default' : 'pointer',
            opacity: opening ? 0.6 : 1,
            background: '#EDEDE9',
            color: '#16140F',
            border: '1.5px solid #16140F',
          }}
        >
          <PlayIcon /> {opening ? 'opening…' : 'run skill'}
        </button>
      </div>

      {/* The page lives here on the offer. Rendered as clean markdown by
          default (no raw # or **); click edit to get the raw textbox. */}
      {page.isLoading ? (
        <span className="off-section__sub">loading…</span>
      ) : editing ? (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <textarea
            ref={taRef}
            value={draft ?? ''}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="write your sales page here, or run the skill above."
            style={{
              width: '100%',
              minHeight: 160,
              // Grows with its content (see the auto-grow effect); the panel
              // scrolls, not the box. overflow hidden so no inner scrollbar.
              overflow: 'hidden',
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              padding: 'var(--space-4)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--body)',
              lineHeight: 1.6,
              resize: 'none',
              outline: 'none',
              whiteSpace: 'pre-wrap',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', alignItems: 'center' }}>
            <button
              type="button"
              className="off-btn off-btn--ghost"
              onClick={() => { setDraft(page.data?.content ?? ''); setEditing(false); }}
            >
              cancel
            </button>
            <button
              type="button"
              className="off-btn off-btn--primary"
              onClick={() => save.mutate(draft ?? '', { onSuccess: () => setEditing(false) })}
              disabled={save.isPending}
            >
              {save.isPending ? 'saving…' : 'save'}
            </button>
          </div>
        </div>
      ) : draft && draft.trim() ? (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="off-btn off-btn--ghost" onClick={() => setEditing(true)}>edit</button>
          </div>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4) var(--space-5)',
              fontSize: 'var(--body)',
              lineHeight: 1.6,
            }}
          >
            <Markdown text={draft} />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            border: '1px dashed var(--hairline)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span className="off-section__sub" style={{ margin: 0 }}>no sales page yet. run the skill above, or write one yourself.</span>
          <button type="button" className="off-btn off-btn--ghost" onClick={() => setEditing(true)}>write it here</button>
        </div>
      )}
    </PanelShell>
  );
}

// =========================================================================
// 25-Question Offer Quiz - canonical source of truth
// =========================================================================
//
// Five sub-sections × five questions each. Each question is self-rated 1-5
// (0 = unrated). Per-section score = average × 20. Overall offer score is a
// stage-weighted average across the five sections (see STAGE_WEIGHTS).
//
// `hint` is what the creator sees under the question - what data Claude will look
// at when she clicks "analyze with Claude" in a future iteration. Marked as
// `xref` when the question requires cross-referencing two sources (e.g.
// AVATAR + SALES PAGE).

type SectionKey = 'avatar' | 'pricing' | 'proof' | 'validation' | 'content';

interface QuizQuestion {
  text: string;
  hint: string;
  xref?: string[];
}

const OFFER_QUIZ: Record<SectionKey, QuizQuestion[]> = {
  avatar: [
    { text: 'Could I describe their before state in vivid emotional detail?', hint: 'Checks the attached avatar\'s before_state is filled in deeply.', xref: ['AVATAR'] },
    { text: 'Could I describe their dream outcomes in vivid emotional detail?', hint: 'Checks the avatar\'s after_state / dream outcomes are richly captured.', xref: ['AVATAR'] },
    { text: 'Are their pain points captured specifically?', hint: 'Checks the avatar\'s pain_points / struggles are named with specificity.', xref: ['AVATAR'] },
    { text: 'Would my avatar feel the sales page was written just for them?', hint: 'Cross-reference the avatar against the actual sales page copy.', xref: ['AVATAR', 'SALES PAGE'] },
    { text: 'My dream customer immediately recognises this offer is for them', hint: 'Cross-reference avatar with the offer promise + pain points.', xref: ['AVATAR', 'PROMISE'] },
  ],
  pricing: [
    { text: 'Is this price calibrated to the results (10x value rule, monetary or clarity/confidence)?', hint: 'Cross-reference pricing with the actual proven results in your proof bank.', xref: ['PRICING', 'PROOF'] },
    { text: 'Is the offer priced as a no-brainer tradeoff?', hint: 'Judgment: small ask vs. big gain. Considers promise + proof.', xref: ['PROMISE', 'PROOF'] },
    { text: 'Have I defined a price ladder with criteria to raise each rung?', hint: 'Checks pricing_plan field is filled with specific triggers.' },
    { text: 'Have I set revenue + customer targets for this offer?', hint: 'Checks target_revenue_per_month + target_customers_per_month are set.' },
    { text: 'Does the current price match the offer\'s stage (idea → scaling)?', hint: 'Judgment: idea-stage offers should be priced low to validate; signature/scaling can charge premium.' },
  ],
  proof: [
    { text: 'I have achieved this result for myself or someone else', hint: 'Checks pinned proof has at least one own win or client win.', xref: ['PROOF'] },
    { text: 'I have case studies, testimonials, or data showing real results', hint: 'Checks pinned proof has customer-result entries with specifics.', xref: ['PROOF'] },
    { text: 'My proof is specific to my target avatar', hint: 'Cross-reference pinned proof against the attached avatar profile.', xref: ['PROOF', 'AVATAR'] },
    { text: 'I have examples of customers getting results quickly', hint: 'Checks pinned proof for entries that name a time-to-result.', xref: ['PROOF'] },
    { text: 'Proof shows up across all my content (social, sales page, emails)', hint: 'Cross-reference pinned proof against the sales page / VSL.', xref: ['PROOF', 'CONTENT'] },
  ],
  validation: [
    { text: 'Have I had 1:1 conversations with at least 10 ideal customers?', hint: 'Tracks customer-research conversations done.' },
    { text: 'At least 1 real customer has paid for this offer', hint: 'Validates the offer exists in the market, not just on paper.' },
    { text: 'At least 1 customer has actually achieved the promised result', hint: 'Validates the promise is deliverable.' },
    { text: 'The offer has been launched publicly at least once', hint: 'Validates the sales motion has run end-to-end.' },
    { text: 'I have customer-reported satisfaction (testimonial / review / repurchase)', hint: 'Validates the offer delivers experienced value.' },
  ],
  content: [
    { text: 'Have I recorded a VSL? (yes / no)', hint: 'Binary check: is vsl_url filled in with a working link?', xref: ['CONTENT'] },
    { text: 'Have I created a sales page? (yes / no)', hint: 'Binary check: separate from VSL. Sales page link captured.', xref: ['CONTENT'] },
    { text: 'Are common objections addressed inside the sales page?', hint: 'Claude reads the sales page and checks for objection-handling.', xref: ['SALES PAGE'] },
    { text: 'Does the content remove roadblocks (clarity / tech / overwhelm)?', hint: 'Claude reads the sales page + VSL for friction-removal language.', xref: ['SALES PAGE', 'VSL'] },
    { text: 'Would a friend understand this offer from the sales page in 10 seconds?', hint: 'Claude reads the sales page hero / promise section and judges clarity.', xref: ['SALES PAGE'] },
  ],
};

const SECTION_LABEL: Record<SectionKey, string> = {
  avatar: 'Avatar',
  pricing: 'Pricing',
  proof: 'Proof',
  validation: 'Validation',
  content: 'Content',
};
const SECTION_COLOR: Record<SectionKey, string> = {
  avatar: 'var(--hrv)',
  pricing: 'var(--strain)',
  proof: 'var(--strain)',
  validation: 'var(--strain)',
  content: 'var(--recovery)',
};

// Stage-weighted overall: score grows with the offer's maturity rather than
// demanding everything at once.
const STAGE_WEIGHTS: Record<OfferPricingRung['status'], Record<SectionKey, number>> = {
  idea:       { avatar: 0.30, content: 0.20, proof: 0.20, validation: 0.15, pricing: 0.15 },
  validated:  { avatar: 0.25, content: 0.25, proof: 0.20, validation: 0.15, pricing: 0.15 },
  iterating:  { avatar: 0.20, content: 0.20, proof: 0.20, validation: 0.20, pricing: 0.20 },
  signature:  { avatar: 0.15, content: 0.25, proof: 0.20, validation: 0.20, pricing: 0.20 },
  scaling:    { avatar: 0.15, content: 0.30, proof: 0.15, validation: 0.15, pricing: 0.25 },
};

function sectionScore(scores: number[] | undefined): number {
  // Average of rated entries (treat 0 = unrated, don't include in denominator).
  // Guards against undefined arrays (e.g. a rung created before scores existed).
  if (!Array.isArray(scores)) return 0;
  const rated = scores.filter((n) => n > 0);
  if (rated.length === 0) return 0;
  const avg = rated.reduce((a, b) => a + b, 0) / rated.length;
  return avg / 5; // normalise to 0-1
}

function sectionAnswered(scores: number[] | undefined): number {
  if (!Array.isArray(scores)) return 0;
  return scores.filter((n) => n > 0).length;
}

function overallScore(rung: OfferPricingRung): { value: number; perSection: Record<SectionKey, number> } {
  const w = STAGE_WEIGHTS[rung.status];
  // Defensive: an old rung might have an undefined scores object entirely.
  const s = rung.scores ?? { avatar: [], pricing: [], proof: [], validation: [], content: [] };
  const perSection: Record<SectionKey, number> = {
    avatar: sectionScore(s.avatar),
    pricing: sectionScore(s.pricing),
    proof: sectionScore(s.proof),
    validation: sectionScore(s.validation),
    content: sectionScore(s.content),
  };
  const v =
    perSection.avatar * w.avatar +
    perSection.pricing * w.pricing +
    perSection.proof * w.proof +
    perSection.validation * w.validation +
    perSection.content * w.content;
  return { value: v, perSection };
}

// =========================================================================
// Per-offer sub-card helpers + panels
// =========================================================================

// =========================================================================
// Per-offer Overall Score side panel
// =========================================================================
// Opens from the 6th sub-card on the expanded offer. Shows the overall
// stage-weighted score at the top, the 5 sections (each with its score next
// to the title), and all 25 questions with 1-5 self-rate buttons.
// Per-rung proof panel. Per-rung promise text + per-rung pinned proofs.
// Picks from the global reputation banks (wins + authority entries) but
// the pin set is independent per rung.
function PerOfferProofPanel({
  rung,
  onClose,
}: {
  rung: OfferPricingRung;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const proof = rung.proof_section ?? { promise_text: null, pinned_proof_ids: [], build_completion: 0 };
  // Load reputation so we can show pinnable bank entries (wins + authority).
  const repQuery = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const authority = repQuery.data?.dimensions.find((d) => d.id === 'authority');
  // The candidate pool = own wins + customer wins + authority bank entries.
  // Each has {id, title, body?} - we normalise to a uniform shape for the
  // list below.
  type Pinnable = { id: string; kind: 'own' | 'student' | 'authority'; title: string; body?: string };
  const pinnable: Pinnable[] = [
    ...((authority?.wins_bank ?? []).filter((w) => w.status === 'confirmed').map((w) => ({
      id: w.id, kind: w.kind === 'own' ? ('own' as const) : ('student' as const), title: w.title, body: w.body,
    } as Pinnable))),
    ...((authority?.proof_bank ?? []).map((p) => ({
      id: p.id, kind: 'authority' as const, title: (p as any).title ?? (p as any).text ?? '(no title)', body: (p as any).body ?? (p as any).text,
    } as Pinnable))),
  ];
  const pinnedSet = new Set(proof.pinned_proof_ids);
  const pinnedItems = pinnable.filter((p) => pinnedSet.has(p.id));
  const unpinnedItems = pinnable.filter((p) => !pinnedSet.has(p.id));

  const togglePromise = useMutation({
    mutationFn: (text: string | null) =>
      api.setRungSlot(rung.id, 'promise_text', text && text.trim() ? text : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const togglePin = useMutation({
    mutationFn: (v: { proofId: string; pinned: boolean }) =>
      api.toggleRungProofPin(rung.id, v.proofId, v.pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  const [editingPromise, setEditingPromise] = useState(false);
  const [draftPromise, setDraftPromise] = useState(proof.promise_text ?? '');
  useEffect(() => { if (!editingPromise) setDraftPromise(proof.promise_text ?? ''); }, [proof.promise_text, editingPromise]);

  const [showPicker, setShowPicker] = useState(false);

  return (
    <PanelShell
      eyebrow="proof"
      title={`proof for ${rung.name || 'this offer'}`}
      subtitle="write THIS offer's specific promise, then pin the proof that makes it believable. independent of every other offer in the suite."
      color="var(--strain)"
      onClose={onClose}
    >
      {/* ─── The Promise (per-rung text) ─── */}
      <div className="stack" style={{ gap: 6 }}>
        <span className="off-eyebrow" style={{ color: 'var(--strain)' }}>the promise (this offer specifically)</span>
        <p className="muted" style={{ fontSize: 11, margin: 0, maxWidth: '64ch' }}>
          one sentence: what THIS offer helps people do, in what time frame. the proof you pin below has to make this believable.
        </p>
        {editingPromise ? (
          <>
            <textarea
              autoFocus
              value={draftPromise}
              onChange={(e) => setDraftPromise(e.target.value)}
              rows={3}
              className="off-textarea"
              placeholder="e.g. get your first 10 paying members of your Skool community in 30 days without paid ads."
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--strain)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text)',
                fontSize: 'var(--body)',
                lineHeight: 1.5,
              }}
            />
            <div className="off-actions">
              <button className="off-btn off-btn--ghost" onClick={() => { setEditingPromise(false); setDraftPromise(proof.promise_text ?? ''); }}>cancel</button>
              <button className="off-btn off-btn--primary" onClick={() => { togglePromise.mutate(draftPromise.trim() || null); setEditingPromise(false); }}>save</button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditingPromise(true)}
            style={{
              padding: 'var(--space-3)',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${proof.promise_text ? 'color-mix(in srgb, var(--strain) 35%, var(--hairline))' : 'var(--hairline)'}`,
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
              color: proof.promise_text ? 'var(--text)' : 'var(--muted-2)',
              fontSize: proof.promise_text ? 'var(--body-lg)' : 'var(--body-sm)',
              fontStyle: proof.promise_text ? 'normal' : 'italic',
              lineHeight: 1.45,
              font: 'inherit',
            }}
          >
            {proof.promise_text || 'click to write this offer\'s promise.'}
          </button>
        )}
      </div>

      {/* ─── Pinned proof (per-rung set) ─── */}
      <div className="stack" style={{ gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <span className="off-eyebrow" style={{ color: 'var(--strain)' }}>pinned proof · {pinnedItems.length}</span>
          <button
            type="button"
            className="off-btn off-btn--ghost"
            style={{ fontSize: 11 }}
            onClick={() => setShowPicker((v) => !v)}
          >
            {showPicker ? 'done picking' : '+ pin from your bank'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 11, margin: 0, maxWidth: '64ch' }}>
          wins + authority bank entries that prove the promise above is real. these are pinned only to this offer.
        </p>

        {pinnedItems.length === 0 && !showPicker && (
          <p className="muted" style={{ fontSize: 12, fontStyle: 'italic', margin: 0, padding: 'var(--space-2) 0' }}>
            nothing pinned yet. click "+ pin from your bank" to add proof.
          </p>
        )}

        <div className="stack" style={{ gap: 6 }}>
          {pinnedItems.map((p) => (
            <ProofPinRow
              key={p.id}
              proof={p}
              pinned
              onToggle={() => togglePin.mutate({ proofId: p.id, pinned: false })}
            />
          ))}
        </div>

        {showPicker && (
          <div
            style={{
              border: '1px dashed var(--hairline)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              background: 'rgba(255,255,255,0.02)',
              maxHeight: 360,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div className="muted" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '0 0 var(--space-2)' }}>
              click an entry to pin · {unpinnedItems.length} available
            </div>
            {unpinnedItems.length === 0 ? (
              <p className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>
                no more bank entries to pin. add wins / authority entries on the Reputation page.
              </p>
            ) : (
              unpinnedItems.map((p) => (
                <ProofPinRow
                  key={p.id}
                  proof={p}
                  pinned={false}
                  onToggle={() => togglePin.mutate({ proofId: p.id, pinned: true })}
                />
              ))
            )}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

function ProofPinRow({ proof, pinned, onToggle }: { proof: { id: string; kind: 'own' | 'student' | 'authority'; title: string; body?: string }; pinned: boolean; onToggle: () => void }) {
  const kindLabel = proof.kind === 'own' ? 'brag' : proof.kind === 'student' ? 'customer win' : 'authority';
  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: '10px 12px',
        background: pinned ? 'color-mix(in srgb, var(--strain) 6%, transparent)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${pinned ? 'var(--strain)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        color: 'var(--text)',
        font: 'inherit',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{proof.title}</strong>
          <span style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 6px', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--muted)' }}>
            {kindLabel}
          </span>
        </span>
        {proof.body && (
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {proof.body}
          </p>
        )}
      </span>
      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: pinned ? 'var(--strain)' : 'var(--muted)' }}>
        {pinned ? '✕ unpin' : '+ pin'}
      </span>
    </button>
  );
}

// Per-rung validation panel. Reads validation_phases off the rung
// (server already namespaces them to offer_rung_<rungId>_vcheck_<id>)
// and writes back through setRungSlot. What's ticked here is fully
// independent of every other rung in the suite.
function PerOfferValidationPanel({
  rung,
  onClose,
}: {
  rung: OfferPricingRung;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toggleCheck = useMutation({
    mutationFn: (v: { checkId: string; done: boolean }) =>
      api.setRungSlot(rung.id, `vcheck_${v.checkId}`, v.done ? '1' : null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const phases = rung.validation_phases ?? [];
  const currentPhase = rung.current_validation_phase;
  return (
    <PanelShell
      eyebrow="validation"
      title={`has ${rung.name || 'this offer'} been validated?`}
      subtitle="5 stages from idea to scaling. each stage has tangible yes/no checks - tick what's actually true for this specific offer. independent of every other offer in the suite."
      color="var(--strain)"
      onClose={onClose}
    >
      <ValidationPhases
        phases={phases}
        currentPhase={currentPhase}
        color="var(--strain)"
        onToggle={(checkId, done) => toggleCheck.mutate({ checkId, done })}
      />
    </PanelShell>
  );
}

function PerOfferScorePanel({
  rung,
  onClose,
  onSave,
}: {
  rung: OfferPricingRung;
  onClose: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  const qc = useQueryClient();
  const { value, perSection } = overallScore(rung);
  const overallPct = Math.round(value * 100);
  // Claude's per-question reasoning lives on the rung itself (persisted
  // server-side in offer-pricing-rungs.json). Reading from the prop means
  // it survives panel close - the rung re-hydrates from the API on every
  // mount and we just project its reasoning field. Empty arrays for any
  // section never analyzed so QuestionRow always gets a string.
  const reasoning: Record<SectionKey, string[]> = {
    avatar: rung.reasoning?.avatar ?? ['', '', '', '', ''],
    pricing: rung.reasoning?.pricing ?? ['', '', '', '', ''],
    proof: rung.reasoning?.proof ?? ['', '', '', '', ''],
    validation: rung.reasoning?.validation ?? ['', '', '', '', ''],
    content: rung.reasoning?.content ?? ['', '', '', '', ''],
  };
  const analyze = useMutation({
    mutationFn: (section: SectionKey) => api.analyzeRungSection(rung.id, section),
    onSuccess: (data, section) => {
      // Apply suggested scores AND reasoning to the rung in a single
      // PATCH. The rung now carries both, so reopening the panel later
      // re-renders Claude's notes alongside the scores.
      const nextScores = { ...rung.scores };
      nextScores[section] = data.scores.map((n, i) => (n > 0 ? n : nextScores[section][i] ?? 0));
      const nextReasoning = {
        avatar: rung.reasoning?.avatar ?? ['', '', '', '', ''],
        pricing: rung.reasoning?.pricing ?? ['', '', '', '', ''],
        proof: rung.reasoning?.proof ?? ['', '', '', '', ''],
        validation: rung.reasoning?.validation ?? ['', '', '', '', ''],
        content: rung.reasoning?.content ?? ['', '', '', '', ''],
      };
      nextReasoning[section] = data.reasoning;
      onSave({ scores: nextScores, reasoning: nextReasoning });
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });
  const analyzingSection = (analyze.isPending && (analyze.variables as SectionKey)) || null;

  function setScore(section: SectionKey, idx: number, n: number) {
    // Defensive copy: scores object or a section array might be undefined
    // on a rung created before the scores field existed.
    const cur = rung.scores ?? { avatar: [], pricing: [], proof: [], validation: [], content: [] };
    const next = { ...cur };
    const arr = Array.isArray(cur[section]) ? cur[section] : [0, 0, 0, 0, 0];
    next[section] = [...arr];
    while (next[section].length < 5) next[section].push(0);
    next[section][idx] = n;
    onSave({ scores: next });
  }

  return (
    <PanelShell
      eyebrow="overall offer score"
      title={`${overallPct} / 100 · ${rung.name || 'this offer'}`}
      subtitle={`25 questions across 5 sections, weighted by stage (currently ${rung.status}). self-rate each question 1-5. analyze with claude (coming soon) reads your avatar, sales page, vsl, and pinned proof to suggest a score per question.`}
      color="var(--recovery)"
      onClose={onClose}
    >
      {/* Big overall ring + the 5 sub-section roll-ups in a tight row */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-4)', alignItems: 'center' }}>
        <div style={{ width: 120, height: 120 }}>
          <Ring value={value} label="" bigNumber={`${overallPct}`} unit="" size="small" color="var(--recovery)" />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {(['avatar', 'pricing', 'proof', 'validation', 'content'] as SectionKey[]).map((sec) => {
            const pct = Math.round(perSection[sec] * 100);
            const answered = sectionAnswered(rung.scores[sec]);
            return (
              <div
                key={sec}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 60px 1fr',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  fontSize: 'var(--body-sm)',
                }}
              >
                <span style={{ color: SECTION_COLOR[sec], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10 }}>
                  {SECTION_LABEL[sec]}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {pct}
                  <span style={{ color: 'var(--muted-2)', fontSize: 10, marginLeft: 4 }}>/100</span>
                </span>
                <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: SECTION_COLOR[sec], transition: 'width var(--duration-base) var(--ease-out)' }} />
                  <span style={{ position: 'absolute', right: 8, top: -1, fontSize: 9, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {answered}/5 rated
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {analyze.isError && (
        <div
          style={{
            padding: 'var(--space-3)',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: 'var(--body-sm)',
          }}
        >
          analysis failed: {(analyze.error as Error)?.message}
        </div>
      )}

      {/* All 25 questions, grouped by section with the score in the header. */}
      <div className="stack" style={{ gap: 'var(--space-5)' }}>
        {(['avatar', 'pricing', 'proof', 'validation', 'content'] as SectionKey[]).map((sec) => {
          const pct = Math.round(perSection[sec] * 100);
          return (
            <div key={sec} className="stack" style={{ gap: 'var(--space-3)' }}>
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  borderBottom: `1px solid color-mix(in srgb, ${SECTION_COLOR[sec]} 25%, var(--hairline))`,
                  paddingBottom: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                  <span className="off-eyebrow" style={{ color: SECTION_COLOR[sec], fontSize: 11 }}>
                    {SECTION_LABEL[sec]}
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: SECTION_COLOR[sec], fontVariantNumeric: 'tabular-nums' }}>
                    {pct}<span style={{ color: 'var(--muted-2)', fontSize: 10, marginLeft: 2 }}>/100</span>
                  </span>
                </div>
                {(() => {
                  // Has this section ever been analyzed? Any non-empty
                  // reasoning string counts. Shifts the button label to
                  // "re-analyze" so the creator knows the previous notes will
                  // be overwritten (and that they're still visible below).
                  const hasReasoning = reasoning[sec].some((s) => s.trim().length > 0);
                  return (
                    <button
                      type="button"
                      className="off-btn off-btn--primary"
                      onClick={() => analyze.mutate(sec)}
                      disabled={analyze.isPending}
                      title={
                        hasReasoning
                          ? 'overwrite claude\'s current notes with a fresh analysis'
                          : 'claude reads your inputs and suggests a score per question'
                      }
                      style={{
                        fontSize: 11,
                        background: SECTION_COLOR[sec],
                        color: 'var(--bg)',
                        borderColor: SECTION_COLOR[sec],
                      }}
                    >
                      {analyzingSection === sec
                        ? 'analyzing…'
                        : hasReasoning
                        ? '✨ re-analyze'
                        : '✨ analyze with claude'}
                    </button>
                  );
                })()}
              </header>
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                {OFFER_QUIZ[sec].map((q, i) => (
                  <QuestionRow
                    key={`${sec}-${i}`}
                    question={q}
                    score={rung.scores[sec][i] ?? 0}
                    color={SECTION_COLOR[sec]}
                    onScore={(n) => setScore(sec, i, n)}
                    reasoning={reasoning[sec][i] || ''}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function QuestionRow({
  question,
  score,
  color,
  onScore,
  reasoning,
}: {
  question: QuizQuestion;
  score: number;
  color: string;
  onScore: (n: number) => void;
  reasoning?: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: score > 0 ? `color-mix(in srgb, ${color} 4%, transparent)` : 'rgba(255,255,255,0.02)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        alignItems: 'center',
      }}
    >
      <div className="stack" style={{ gap: 4, minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{question.text}</span>
        <span className="off-section__sub" style={{ margin: 0, fontSize: 11 }}>
          {question.hint}
          {question.xref && question.xref.length > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--muted-2)' }}>
              · xref: {question.xref.join(' × ')}
            </span>
          )}
        </span>
        {reasoning && (
          <div
            style={{
              marginTop: 4,
              padding: 'var(--space-2)',
              background: `color-mix(in srgb, ${color} 6%, rgba(0,0,0,0.2))`,
              borderLeft: `2px solid ${color}`,
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
              fontSize: 12,
              color: 'var(--ink)',
              lineHeight: 1.45,
            }}
          >
            <span style={{ fontWeight: 700, color, marginRight: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              ✨ claude
            </span>
            {reasoning}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = score === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onScore(active ? 0 : n)}
              title={active ? 'click again to unrate' : `rate ${n}/5`}
              style={{
                width: 32,
                height: 32,
                border: `1px solid ${active ? color : 'var(--hairline)'}`,
                background: active ? color : 'transparent',
                color: active ? 'var(--bg)' : 'var(--muted)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                fontVariantNumeric: 'tabular-nums',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)';
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pricingCompleteness(rung: OfferPricingRung): number {
  const fields = [
    !!rung.price_label,
    !!rung.goal_price_label,
    !!rung.target_revenue_per_month_usd,
    !!rung.target_customers_per_month,
    !!rung.pricing_plan,
  ];
  return fields.filter(Boolean).length / fields.length;
}
function contentCompleteness(rung: OfferPricingRung): number {
  const fields = [
    !!rung.vsl_url,
    !!rung.content_mentions_per_month,
    !!rung.cta_count_per_video,
    !!rung.cta_locations,
    !!rung.audience_journey,
    !!rung.cta_frequency,
  ];
  return fields.filter(Boolean).length / fields.length;
}
function pricingCardSummary(rung: OfferPricingRung): string {
  if (rung.target_revenue_per_month_usd && rung.target_customers_per_month) {
    return `target: $${rung.target_revenue_per_month_usd.toLocaleString()}/mo · ${rung.target_customers_per_month} customers`;
  }
  if (rung.goal_price_label) return `current: ${rung.price_label || '-'} → goal: ${rung.goal_price_label}`;
  if (rung.price_label) return `${rung.price_label} · how do we raise it from here?`;
  return 'price ladder + revenue goal for this specific offer.';
}
function contentCardTitle(rung: OfferPricingRung): string {
  if (rung.vsl_url) return 'vsl + content cadence';
  if (rung.cta_count_per_video) return `${rung.cta_count_per_video} ctas / video`;
  return 'content path to this offer';
}

// ─── Shared panel scaffolding ─────────────────────────────────────────────

function PanelShell({
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
  color = 'var(--strain)',
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  color?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  // Mirrors the .off-panel-wrap + .off-panel styling used by the SectionPanel
  // (Avatar / Proof / Validation) - slides in from the right, left border
  // tinted with the panel's accent color via --lev-c.
  return (
    <div className="off-panel-wrap" onClick={onClose}>
      <aside
        className="off-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ '--lev-c': color } as React.CSSProperties}
      >
        <header className="off-panel__head">
          <div className="off-panel__head-l">
            <span className="off-eyebrow" style={{ color }}>{eyebrow}</span>
            <h2 className="off-panel__title">{title}</h2>
            {subtitle && (
              <p className="off-panel__sub" style={{ maxWidth: '60ch' }}>{subtitle}</p>
            )}
          </div>
          <div className="off-panel__head-r">
            <button type="button" className="off-btn off-btn--ghost" onClick={onClose}>close</button>
          </div>
        </header>
        {children}
      </aside>
    </div>
  );
}

// ─── Avatar panel: edits the SPECIFIC attached avatar ────────────────────

// Per-rung avatar panel. Reuses the same card-grid look as AvatarBank
// (top of the Offer page) so picking an avatar for an offer feels like
// browsing the bank. Clicking a card attaches that avatar to the rung;
// the attached card is highlighted + can be expanded to edit inline.
function PerOfferAvatarPanel({
  rung,
  avatars,
  onClose,
  onSave,
}: {
  rung: OfferPricingRung;
  avatars: OfferAvatar[];
  onClose: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  // Sleep blue to match the other per-rung section panels. Only the
  // Overall Offer Score panel keeps the recovery-green standout.
  const color = 'var(--strain)';
  const attachedId = rung.avatar_id;
  const attached = avatars.find((a) => a.id === attachedId) ?? null;
  // When attached, default-open its editor underneath. Otherwise leave
  // the panel as just the grid until the creator picks one.
  const [openId, setOpenId] = useState<string | null>(attachedId);
  useEffect(() => { setOpenId(attachedId); }, [attachedId]);

  // Short preview blurb under each name. Prefers the generated card
  // summary (the tight one), then one_line, then before_state, then a
  // friendly empty hint. Truncated for card layout consistency.
  function previewBlurb(a: OfferAvatar): string {
    const raw = (a.card_summary || a.one_line || a.before_state || '').trim();
    if (!raw) return 'not filled out yet - click to start';
    const flat = raw.replace(/\s+/g, ' ');
    return flat.length > 180 ? `${flat.slice(0, 180).trimEnd()}…` : flat;
  }

  return (
    <PanelShell
      eyebrow="avatar for this offer"
      title={attached ? `linked: ${attached.name ?? 'unnamed'}` : 'pick an avatar to attach'}
      subtitle="every offer talks to one specific person. click a card below to attach (or switch). the attached avatar's profile opens underneath for editing."
      color={color}
      onClose={onClose}
    >
      <div className="av-bank" style={{ ['--av-card-accent' as any]: color }}>
        {avatars.length === 0 ? (
          <p className="muted" style={{ fontSize: 12, fontStyle: 'italic', margin: 0 }}>
            no avatars in your library yet. add one in the Avatars card at the top of the Offer page.
          </p>
        ) : (
          <div className="av-cards">
            {avatars.map((a) => {
              const isAttached = a.id === attachedId;
              const isOpen = openId === a.id;
              const imgUrl = a.image_path
                ? `/api/vault-asset/${encodeURI(a.image_path)}`
                : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`av-card ${isOpen || isAttached ? 'av-card--open' : ''}`}
                  onClick={() => {
                    // Click semantics:
                    //   - card not attached → attach it (and open editor)
                    //   - card already attached → toggle open/closed
                    if (!isAttached) {
                      onSave({ avatar_id: a.id });
                      setOpenId(a.id);
                    } else {
                      setOpenId(isOpen ? null : a.id);
                    }
                  }}
                  style={{ ['--av-card-accent' as any]: color, position: 'relative' }}
                >
                  {isAttached && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        fontSize: 9,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        background: color,
                        color: 'var(--bg)',
                        borderRadius: 999,
                        fontWeight: 700,
                      }}
                    >
                      ✓ linked
                    </span>
                  )}
                  <div className={`av-card__img ${imgUrl ? '' : 'av-card__img--empty'}`}>
                    {imgUrl ? (
                      <img src={imgUrl} alt={`${a.name ?? 'avatar'} portrait`} />
                    ) : (
                      <span className="av-card__img-empty-label">no image</span>
                    )}
                  </div>
                  <div className="av-card__body">
                    <span className="av-card__name">{a.name ?? '(unnamed)'}</span>
                    <p className="av-card__desc">{previewBlurb(a)}</p>
                  </div>
                  <span className="av-card__caret">{isOpen ? '−' : isAttached ? '+' : '→'}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Expanded editor for the open card. Same component the main
            Avatars bank uses, so edits stay consistent. */}
        {openId && avatars.find((a) => a.id === openId) && (
          <div className="av-expanded">
            <AvatarEditor
              avatar={avatars.find((a) => a.id === openId)!}
              color={color}
              onDelete={() => { /* deletes happen in the main Avatars bank */ }}
            />
            {openId === attachedId && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="off-btn off-btn--ghost"
                  style={{ fontSize: 11 }}
                  onClick={() => { onSave({ avatar_id: null }); setOpenId(null); }}
                >detach this avatar from this offer</button>
              </div>
            )}
          </div>
        )}
        {/* Re-inject the bank styles here. The AvatarBank component on
            the main offer page injects AV_BANK_CSS via its own <style>
            block; when this picker opens without that page in view
            (i.e. you click into a rung's avatar card directly), those
            styles never load and .av-card__img has no size constraint -
            so the <img> renders at its native AI-generated resolution
            (1024px+), blowing up the panel. Injecting the same block
            here makes the picker self-sufficient. */}
        <style>{AV_BANK_CSS}</style>
      </div>
    </PanelShell>
  );
}

// ─── Pricing strategy panel ───────────────────────────────────────────────

function PerOfferPricingPanel({
  rung,
  onClose,
  onSave,
}: {
  rung: OfferPricingRung;
  onClose: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  return (
    <PanelShell
      eyebrow="pricing · proof ladder"
      title={`how do we raise the price of ${rung.name || 'this offer'}?`}
      subtitle="track the current price, where you want it to go, the revenue + customer goals for this offer, and the plan to climb the ladder."
      color="var(--strain)"
      onClose={onClose}
    >
      <FieldGroup label="current price" hint="what you charge today.">
        <TextInput value={rung.price_label} onSave={(v) => onSave({ price_label: v })} placeholder="$47/mo" />
      </FieldGroup>
      <FieldGroup label="goal price" hint="where you're aiming this offer to land at scale.">
        <TextInput value={rung.goal_price_label} onSave={(v) => onSave({ goal_price_label: v })} placeholder="$197/mo" />
      </FieldGroup>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <FieldGroup label="target monthly revenue (USD)" hint="how much this offer is meant to bring in.">
          <NumberInput value={rung.target_revenue_per_month_usd} onSave={(v) => onSave({ target_revenue_per_month_usd: v })} placeholder="5000" />
        </FieldGroup>
        <DerivedCustomersPerMonth rung={rung} onSave={onSave} />
      </div>
      <FieldGroup label="plan to raise the price" hint="the strategic ladder. what triggers each step up - number of customers? proof level? feature added?">
        <TextareaInput value={rung.pricing_plan} onSave={(v) => onSave({ pricing_plan: v })} rows={6} placeholder={'e.g.\n$47 → first 30 paying members\n$97 → 5 case studies showing retention > 3 months\n$197 → signature framework named + 100 members'} />
      </FieldGroup>
    </PanelShell>
  );
}

// Pull the first numeric value out of a price label like "$47/mo", "$1,500",
// "199", "USD 97". Returns null if no recognisable number is present.
function parsePriceLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = label.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Target customers / month is now derived from
//   target_revenue_per_month_usd  /  parsed(goal_price_label || price_label)
// the creator sets the revenue she wants and the price she's aiming for; this
// reads back the implied customer count and writes it to the rung so
// downstream code (score panels, completion checks) still sees a value
// in target_customers_per_month. Re-saves whenever the inputs change.
function DerivedCustomersPerMonth({
  rung,
  onSave,
}: {
  rung: OfferPricingRung;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  // Prefer the goal price (that's what the customer target is for - hitting
  // target revenue once you've raised the price). Falls back to current
  // price when no goal is set yet.
  const priceUsed = parsePriceLabel(rung.goal_price_label) ?? parsePriceLabel(rung.price_label);
  const revenue = rung.target_revenue_per_month_usd;
  const derived = priceUsed && revenue ? Math.ceil(revenue / priceUsed) : null;

  // Auto-write the derived value to the rung so other components that
  // read target_customers_per_month see the new number. Only PATCHes when
  // it actually changes - prevents an infinite invalidate loop.
  useEffect(() => {
    if (derived !== null && derived !== rung.target_customers_per_month) {
      onSave({ target_customers_per_month: derived });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derived]);

  const priceSourceLabel = parsePriceLabel(rung.goal_price_label)
    ? `goal price ${rung.goal_price_label}`
    : parsePriceLabel(rung.price_label)
    ? `current price ${rung.price_label}`
    : null;

  const hint = derived !== null && priceSourceLabel && revenue
    ? `auto-calculated: $${revenue.toLocaleString()} ÷ ${priceSourceLabel} = ${derived}`
    : 'fill in target revenue + a price (current or goal) and this fills in automatically.';

  return (
    <FieldGroup label="target customers / month" hint={hint}>
      <div
        style={{
          padding: 'var(--space-3)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--display-sm, 24px)',
          fontWeight: 600,
          color: derived !== null ? 'var(--text)' : 'var(--muted-2)',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
        }}
        title="derived from target revenue ÷ price"
      >
        {derived !== null ? derived.toLocaleString() : '-'}
      </div>
    </FieldGroup>
  );
}

// ─── Content panel ────────────────────────────────────────────────────────

function PerOfferContentPanel({
  rung,
  onClose,
  onSave,
}: {
  rung: OfferPricingRung;
  onClose: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  // Hits the same tracking-setup-status endpoint the per-block setup prompt
  // uses. Banner is shown until ok=true (manifest + worker both exist). Hides
  // itself permanently after that.
  const setupStatus = useQuery({
    queryKey: ['tracking-setup-status'],
    queryFn: api.getTrackingSetupStatus,
  });
  const trackingReady = !!setupStatus.data?.ok;
  return (
    <PanelShell
      eyebrow="conversions"
      title={`the funnel into ${rung.name || 'this offer'}`}
      subtitle="sales page is the destination. vsl + youtube videos drive viewers to it via /go/<slug> tracking links. conversion = link clicks ÷ video views for upstream pieces, buyers ÷ visitors on the sales page."
      color="var(--recovery)"
      onClose={onClose}
    >
      {/* ─── 0. Setup banner (shown until tracking is configured) ─── */}
      {!setupStatus.isLoading && !trackingReady && (
        <ConversionsSetupBanner
          prompt={setupStatus.data?.setup_prompt ?? '/setup-conversion-tracking'}
        />
      )}

      {/* ─── 1. Sales page (the destination, top of the stack) ─── */}
      <SalesPageBlock
        url={rung.sales_page_url}
        visitors={rung.sales_page_visitors_30d}
        buyers={rung.sales_page_buyers_30d}
        onSave={onSave}
      />

      {/* ─── 2. VSL (upstream link to the sales page) ─── */}
      <UpstreamLinkBlock
        rungId={rung.id}
        title="VSL"
        subtitle="the video sales letter (long-form youtube video that does the selling). its /go/ tracking link redirects viewers to the sales page above."
        salesPageUrlSet={!!rung.sales_page_url.trim()}
        videoUrl={rung.vsl_url}
        slug={rung.vsl_tracking_slug}
        views={rung.vsl_views_30d}
        linkClicks={rung.vsl_link_clicks_30d}
        onSave={onSave}
        videoUrlField="vsl_url"
        viewsField="vsl_views_30d"
        linkClicksField="vsl_link_clicks_30d"
      />

      {/* ─── 3. YouTube content (placeholder for auto-populated list) ─── */}
      <YouTubeContentPlaceholder rungId={rung.id} salesPageUrlSet={!!rung.sales_page_url.trim()} />

      {/* ─── 4. Short-form (one tracking link per platform) ─── */}
      <ShortFormBlock rungId={rung.id} salesPageUrlSet={!!rung.sales_page_url.trim()} />

      {/* ─── 5. Emails ─── */}
      <EmailsBlock rungId={rung.id} />
    </PanelShell>
  );
}

// Sales page block - the DESTINATION. No tracking link (it IS the
// destination of every /go/ link in this offer's funnel). Conversion
// is manual since checkout lives off-platform.
function SalesPageBlock({
  url,
  visitors,
  buyers,
  onSave,
}: {
  url: string;
  visitors: number | null;
  buyers: number | null;
  onSave: (body: Partial<OfferPricingRung>) => void;
}) {
  const convPct = visitors && visitors > 0 && buyers !== null
    ? (buyers / visitors) * 100
    : null;
  const convDisplay = convPct !== null ? `${convPct.toFixed(2)}%` : '-';
  return (
    <div
      style={{
        border: `1px solid color-mix(in srgb, var(--recovery) 35%, var(--hairline))`,
        background: 'color-mix(in srgb, var(--recovery) 4%, transparent)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--recovery)', fontWeight: 700 }}>
            step 1 · destination
          </div>
          <h4 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Sales page
          </h4>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, maxWidth: '64ch' }}>
            the page where the visitor decides to buy. every tracking link in this offer's funnel ends here. build this first.
          </p>
        </div>
        <ConvBanner label="conversion (30d)" pct={convDisplay} active={convPct !== null} hint="buyers ÷ visitors over the last 30 days" />
      </div>
      <FieldGroup label="sales page URL" hint="public link to the page itself.">
        <TextInput
          value={url}
          onSave={(v) => onSave({ sales_page_url: v })}
          placeholder="https://..."
        />
      </FieldGroup>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <FieldGroup label="visitors (last 30d)" hint="total visits to the sales page in the last 30 days. manual for now.">
          <NumberInput
            value={visitors}
            onSave={(v) => onSave({ sales_page_visitors_30d: v })}
            placeholder="500"
          />
        </FieldGroup>
        <FieldGroup label="buyers (last 30d)" hint="how many of those visitors checked out. manual - checkout lives off-platform.">
          <NumberInput
            value={buyers}
            onSave={(v) => onSave({ sales_page_buyers_30d: v })}
            placeholder="12"
          />
        </FieldGroup>
      </div>
    </div>
  );
}

// Upstream link block (VSL today, YouTube-content videos later). The
// /go/<slug> tracking link points at the sales page above - the
// upstream's job is to drive viewers to it. Requires the sales page
// URL to be set first. Conversion = link_clicks / views = CTR.
function UpstreamLinkBlock({
  rungId,
  title,
  subtitle,
  salesPageUrlSet,
  videoUrl,
  slug,
  views,
  linkClicks,
  onSave,
  videoUrlField,
  viewsField,
  linkClicksField,
}: {
  rungId: string;
  title: string;
  subtitle: string;
  salesPageUrlSet: boolean;
  videoUrl: string;
  slug: string;
  views: number | null;
  linkClicks: number | null;
  onSave: (body: Partial<OfferPricingRung>) => void;
  videoUrlField: keyof OfferPricingRung;
  viewsField: keyof OfferPricingRung;
  linkClicksField: keyof OfferPricingRung;
}) {
  const qc = useQueryClient();
  // Cache the tracking-system status across all funnel blocks so we don't
  // re-fetch per page. Component-level: cheap & rare.
  const setupStatus = useQuery({
    queryKey: ['tracking-setup-status'],
    queryFn: api.getTrackingSetupStatus,
  });
  const generate = useMutation({
    mutationFn: () => api.generateRungTrackingLink(rungId, 'vsl'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const isNotSetUp =
    setupStatus.data && !setupStatus.data.ok && setupStatus.data.setup_prompt;
  const generateBlockedBySetup =
    generate.isError &&
    (generate.error as any)?.message?.toLowerCase().includes('tracking system not set up');
  // Conversion = link_clicks / views = CTR. What % of viewers actually
  // clicked through to the sales page.
  const convPct = views && views > 0 && linkClicks !== null
    ? (linkClicks / views) * 100
    : null;
  const convDisplay = convPct !== null ? `${convPct.toFixed(2)}%` : '-';
  const trackingHref = slug ? `https://yourdomain.com/go/${slug}` : null;
  // Button is disabled until BOTH the sales page URL (set in
  // SalesPageBlock above) and this video's URL are filled - the
  // tracking link points at the sales page from this video, so both
  // sides of that connection need to exist first.
  const buttonDisabled = !salesPageUrlSet || !videoUrl.trim() || generate.isPending;
  const buttonTitle = !salesPageUrlSet
    ? 'fill in the sales page URL above first'
    : !videoUrl.trim()
    ? 'fill in the video URL above first'
    : '';
  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
            step 2 · upstream link
          </div>
          <h4 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {title}
          </h4>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, maxWidth: '64ch' }}>
            {subtitle}
          </p>
        </div>
        <ConvBanner label="CTR" pct={convDisplay} active={convPct !== null} hint="link clicks ÷ lifetime views" />
      </div>

      <FieldGroup label={`${title.toLowerCase()} URL`} hint="the YouTube link to the video itself.">
        <TextInput
          value={videoUrl}
          onSave={(v) => onSave({ [videoUrlField]: v } as Partial<OfferPricingRung>)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
      </FieldGroup>

      {/* Tracking link → sales page. */}
      <div className="stack" style={{ gap: 6 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 700 }}>
          tracking link → sales page
        </span>
        {slug ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <code style={{ flex: 1, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 12, color: 'var(--text)' }}>
              {trackingHref}
            </code>
            <button
              type="button"
              className="off-btn off-btn--ghost"
              style={{ fontSize: 11 }}
              onClick={() => navigator.clipboard.writeText(trackingHref!)}
              title="copy short URL"
            >copy</button>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 11 }}>
            {salesPageUrlSet
              ? `no tracking link yet. fill in the ${title} URL above, then click generate.`
              : `set the sales page URL above first - this link will redirect viewers to it.`}
          </p>
        )}

        {(isNotSetUp || generateBlockedBySetup) ? (
          <TrackingSetupPrompt
            prompt={
              setupStatus.data?.setup_prompt ??
              'Set up the Cloudflare worker tracking-link system (worker at 03_Projects/agents/worker/, manifest at scripts/link_manifest.json). The worker should handle yourdomain.com/go/<slug>, read the manifest at deploy time, log clicks to LINK_CLICKS KV, and 302 redirect to the destination.'
            }
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="off-btn off-btn--primary"
              disabled={buttonDisabled}
              onClick={() => generate.mutate()}
              title={buttonTitle}
              style={{ fontSize: 12 }}
            >
              {generate.isPending
                ? 'generating…'
                : slug
                ? '↻ regenerate tracking link'
                : '+ generate tracking link'}
            </button>
            {generate.data?.needs_deploy && (
              <span className="muted" style={{ fontSize: 11 }}>
                slug created. run <code style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>{generate.data.deploy_command}</code> in your terminal to activate.
              </span>
            )}
            {generate.isError && !generateBlockedBySetup && (
              <span style={{ color: '#ff6b6b', fontSize: 11 }}>
                {(generate.error as Error).message}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <FieldGroup
          label="lifetime views"
          hint="total YouTube views since publish. click ↻ to pull fresh from the API."
        >
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <div style={{ flex: 1 }}>
              <NumberInput
                value={views}
                onSave={(v) => onSave({ [viewsField]: v } as Partial<OfferPricingRung>)}
                placeholder="2000"
              />
            </div>
            <YouTubeViewsPullButton
              videoUrl={videoUrl}
              onPulled={(n) => onSave({ [viewsField]: n } as Partial<OfferPricingRung>)}
            />
          </div>
        </FieldGroup>
        <FieldGroup
          label="lifetime link clicks"
          hint="total clicks on /go/<slug>. manual for now - auto-pull from worker click logs coming."
        >
          <NumberInput
            value={linkClicks}
            onSave={(v) => onSave({ [linkClicksField]: v } as Partial<OfferPricingRung>)}
            placeholder="80"
          />
        </FieldGroup>
      </div>
    </div>
  );
}

// Tiny inline button that fetches lifetime YouTube views for the given
// video URL and hands them back to the caller's onSave. Sits next to the
// views NumberInput. Greyed out if there's no URL yet.
function YouTubeViewsPullButton({ videoUrl, onPulled }: { videoUrl: string; onPulled: (views: number) => void }) {
  const pull = useMutation({
    mutationFn: () => api.getYouTubeVideoStats(videoUrl),
    onSuccess: (data) => onPulled(data.views),
  });
  const disabled = !videoUrl.trim() || pull.isPending;
  return (
    <button
      type="button"
      title={
        !videoUrl.trim()
          ? 'fill in the video URL first'
          : pull.isError
          ? (pull.error as Error).message
          : 'pull lifetime views from YouTube'
      }
      disabled={disabled}
      onClick={() => pull.mutate()}
      style={{
        padding: '0 12px',
        background: pull.isError ? 'color-mix(in srgb, #ff6b6b 12%, transparent)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${pull.isError ? '#ff6b6b' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        color: pull.isError ? '#ff6b6b' : 'var(--text)',
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {pull.isPending ? '…' : pull.isError ? '!' : '↻'}
    </button>
  );
}

// Small reusable conversion-banner card used by SalesPageBlock and
// UpstreamLinkBlock. Same visual, different numbers + hint.
function ConvBanner({
  label,
  pct,
  active,
  hint,
}: {
  label: string;
  pct: string;
  active: boolean;
  hint: string;
}) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: '10px 14px',
        border: `1px solid color-mix(in srgb, var(--recovery) 35%, var(--hairline))`,
        background: 'color-mix(in srgb, var(--recovery) 6%, transparent)',
        borderRadius: 'var(--radius-md)',
        textAlign: 'right',
        minWidth: 120,
      }}
      title={hint}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 26,
          fontWeight: 700,
          color: active ? 'var(--recovery)' : 'var(--muted-2)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {pct}
      </div>
    </div>
  );
}

// Placeholder section for the per-video tracking links. Pass 2 will
// populate this with the videos that have CTA → this offer's sales
// page, auto-managed by the YouTube description generator.
function YouTubeContentPlaceholder({ rungId, salesPageUrlSet }: { rungId: string; salesPageUrlSet: boolean }) {
  void rungId; // used in Pass 2 when we fetch the list
  return (
    <div
      style={{
        border: '1px dashed var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
        step 3 · youtube content
      </div>
      <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
        Videos pointing here
      </h4>
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.5, maxWidth: '70ch' }}>
        {salesPageUrlSet
          ? 'when you film a new video and drop the transcript into the dashboard, the description generator will mint a per-video tracking link pointing at this offer\'s sales page (if its CTA is set to this offer). each video will be listed here with its views, link clicks, and conversion (CTR). '
          : 'set the sales page URL above first. once it\'s set, every video that CTAs to this offer\'s sales page will land here with its own tracking link and conversion rate.'}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 11, fontStyle: 'italic' }}>
        coming next: wiring the description generator to auto-create the slugs and listing the videos here.
      </p>
    </div>
  );
}

// ─── EmailsBlock ──────────────────────────────────────────────────────────
// Lists every email driving traffic to this offer's sales page. Each row
// is just subject + kind + one manual conversion rate (whatever the creator's
// email platform reports). No tracking links - emails track themselves.
function EmailsBlock({ rungId }: { rungId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['offer-emails', rungId],
    queryFn: () => api.listOfferEmails(rungId),
  });
  const add = useMutation({
    mutationFn: (body: Partial<OfferEmail>) => api.addOfferEmail(rungId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-emails', rungId] }),
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ subject: string; kind: OfferEmailKind }>({ subject: '', kind: 'one_time' });

  const items = data?.items ?? [];
  // Aggregate = simple mean of the per-email conversion rates that have
  // a value. Skips emails the creator hasn't filled in yet.
  const ratesWithValues = items.map((e) => e.conversion_rate_pct).filter((v): v is number => typeof v === 'number');
  const avgPct = ratesWithValues.length > 0
    ? ratesWithValues.reduce((s, v) => s + v, 0) / ratesWithValues.length
    : null;

  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
            step 5 · emails
          </div>
          <h4 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Emails pointing here
          </h4>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, maxWidth: '64ch' }}>
            every email that drives traffic to this offer - one-time, launch, automated. type in whatever conversion rate your email platform reports.
          </p>
        </div>
        <ConvBanner label="avg conversion" pct={avgPct !== null ? `${avgPct.toFixed(2)}%` : '-'} active={avgPct !== null} hint="mean of per-email conversion rates that you've filled in" />
      </div>

      {isLoading && <p className="muted" style={{ margin: 0, fontSize: 11 }}>loading…</p>}

      {!isLoading && items.length === 0 && !adding && (
        <p className="muted" style={{ margin: 0, fontSize: 12, fontStyle: 'italic' }}>
          no emails yet. add the first one below.
        </p>
      )}

      {items.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {items.map((e) => (
            <EmailRow key={e.id} email={e} rungId={rungId} />
          ))}
        </div>
      )}

      {adding ? (
        <div
          style={{
            padding: 'var(--space-3)',
            border: '1px dashed var(--hairline)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <input
            className="off-text-input"
            placeholder="email subject (e.g. 'Last 24h: SS doors close tonight')"
            value={draft.subject}
            autoFocus
            onChange={(ev) => setDraft({ ...draft, subject: ev.target.value })}
          />
          <select
            value={draft.kind}
            onChange={(ev) => setDraft({ ...draft, kind: ev.target.value as OfferEmailKind })}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text)',
              fontSize: 13,
            }}
          >
            <option value="one_time">one-time</option>
            <option value="launch">launch (part of a sequence)</option>
            <option value="automated">automated (evergreen)</option>
          </select>
          <div className="off-actions">
            <button type="button" className="off-btn off-btn--ghost" onClick={() => { setAdding(false); setDraft({ subject: '', kind: 'one_time' }); }}>cancel</button>
            <button
              type="button"
              className="off-btn off-btn--primary"
              disabled={!draft.subject.trim()}
              onClick={() => {
                add.mutate({ subject: draft.subject.trim(), kind: draft.kind });
                setAdding(false);
                setDraft({ subject: '', kind: 'one_time' });
              }}
            >add email</button>
          </div>
        </div>
      ) : (
        <button type="button" className="off-add" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>+ add email</button>
      )}
    </div>
  );
}

// One row per email. Just subject + kind pill + one manual conversion
// rate input. Email platforms already surface conversion rates so we
// just let the creator type it in - no /go/ link minting, no sends/clicks
// math, no auto-pull. Smallest viable shape.
function EmailRow({ email, rungId }: { email: OfferEmail; rungId: string }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<OfferEmail>) => api.updateOfferEmail(email.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-emails', rungId] }),
  });
  const del = useMutation({
    mutationFn: () => api.deleteOfferEmail(email.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-emails', rungId] }),
  });
  const kindLabel = email.kind === 'one_time' ? 'one-time' : email.kind === 'launch' ? 'launch' : 'automated';
  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        background: 'rgba(255,255,255,0.03)',
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      {/* Subject + kind pill. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
        <strong style={{ fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.subject}</strong>
        <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--muted)', flexShrink: 0 }}>
          {kindLabel}
        </span>
      </div>

      {/* Manual conversion rate input. Whatever the email platform
          reports - the creator types it here. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>
          conversion
        </span>
        <div style={{ width: 90 }}>
          <NumberInput
            value={email.conversion_rate_pct}
            onSave={(v) => update.mutate({ conversion_rate_pct: v })}
            placeholder="2.5"
          />
        </div>
        <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>%</span>
      </div>

      <button
        type="button"
        className="off-btn off-btn--danger-ghost"
        style={{ fontSize: 11 }}
        onClick={() => { if (confirm(`delete email "${email.subject}"?`)) del.mutate(); }}
      >×</button>
    </div>
  );
}

// ─── ShortFormBlock ───────────────────────────────────────────────────────
// One tracking link per platform the creator posts on. Add more platforms as
// needed. Conversion = clicks ÷ impressions per month.
function ShortFormBlock({ rungId, salesPageUrlSet }: { rungId: string; salesPageUrlSet: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['offer-short-form', rungId],
    queryFn: () => api.listShortFormLinks(rungId),
  });
  const add = useMutation({
    mutationFn: (body: Partial<OfferShortFormLink>) => api.addShortFormLink(rungId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-short-form', rungId] }),
  });
  const [adding, setAdding] = useState(false);
  const [draftPlatform, setDraftPlatform] = useState('');

  const items = data?.items ?? [];
  const totalViews = items.reduce((s, l) => s + (l.views_30d ?? 0), 0);
  const totalClicks = items.reduce((s, l) => s + (l.clicks_30d ?? 0), 0);
  const aggPct = totalViews > 0 ? (totalClicks / totalViews) * 100 : null;

  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
            step 4 · short-form content
          </div>
          <h4 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>
            Short-form pointing here
          </h4>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, maxWidth: '64ch' }}>
            one tracking link per platform you post on (Instagram, LinkedIn, TikTok, etc.). conversion = clicks ÷ impressions per month.
          </p>
        </div>
        <ConvBanner label="aggregate CTR" pct={aggPct !== null ? `${aggPct.toFixed(2)}%` : '-'} active={aggPct !== null} hint="total clicks ÷ total views across platforms (last 30d)" />
      </div>

      {isLoading && <p className="muted" style={{ margin: 0, fontSize: 11 }}>loading…</p>}

      {!isLoading && items.length === 0 && !adding && (
        <p className="muted" style={{ margin: 0, fontSize: 12, fontStyle: 'italic' }}>
          no platforms yet. add the first one below.
        </p>
      )}

      {items.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          {items.map((l) => (
            <ShortFormRow key={l.id} link={l} salesPageUrlSet={salesPageUrlSet} rungId={rungId} />
          ))}
        </div>
      )}

      {adding ? (
        <div
          style={{
            padding: 'var(--space-3)',
            border: '1px dashed var(--hairline)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <input
            className="off-text-input"
            placeholder="platform name (Instagram, LinkedIn, TikTok, YouTube Shorts, Threads...)"
            value={draftPlatform}
            autoFocus
            onChange={(ev) => setDraftPlatform(ev.target.value)}
          />
          <div className="off-actions">
            <button type="button" className="off-btn off-btn--ghost" onClick={() => { setAdding(false); setDraftPlatform(''); }}>cancel</button>
            <button
              type="button"
              className="off-btn off-btn--primary"
              disabled={!draftPlatform.trim()}
              onClick={() => {
                add.mutate({ platform: draftPlatform.trim() });
                setAdding(false);
                setDraftPlatform('');
              }}
            >add platform</button>
          </div>
        </div>
      ) : (
        <button type="button" className="off-add" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>+ add platform</button>
      )}
    </div>
  );
}

function ShortFormRow({ link, salesPageUrlSet, rungId }: { link: OfferShortFormLink; salesPageUrlSet: boolean; rungId: string }) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<OfferShortFormLink>) => api.updateShortFormLink(link.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-short-form', rungId] }),
  });
  const del = useMutation({
    mutationFn: () => api.deleteShortFormLink(link.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-short-form', rungId] }),
  });
  const generate = useMutation({
    mutationFn: () => api.generateShortFormTrackingLink(link.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offer-short-form', rungId] }),
  });
  // Auto-pull click count from the Cloudflare worker. Runs once the
  // tracking slug exists; refetches every 60s so the row stays fresh
  // while the panel is open. Silent on failure (e.g. worker not yet
  // deployed with /link-stats) - falls back to "-".
  const linkStats = useQuery({
    queryKey: ['link-stats', link.tracking_slug, 30],
    queryFn: () => api.getLinkStats(link.tracking_slug, 30),
    enabled: !!link.tracking_slug,
    refetchInterval: 60_000,
    retry: false,
  });
  const autoClicks = linkStats.data?.clicks ?? null;
  // Per-row conversion = clicks ÷ views = CTR.
  const ctr = link.views_30d && link.views_30d > 0 && autoClicks !== null
    ? (autoClicks / link.views_30d) * 100
    : null;
  return (
    <div
      style={{
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        background: 'rgba(255,255,255,0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 14, lineHeight: 1.3 }}>{link.platform}</strong>
        </div>
        {/* Per-platform conversion rate (clicks ÷ views). */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted-2)' }}>
            CTR (30d)
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 700,
              color: ctr !== null ? 'var(--recovery)' : 'var(--muted-2)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
            title="clicks ÷ views over the last 30 days"
          >
            {ctr !== null ? `${ctr.toFixed(2)}%` : '-'}
          </div>
        </div>
      </div>

      {/* Copyable tracking link row - prominent one-click copy. */}
      {link.tracking_slug && (
        <CopyableTrackingLink slug={link.tracking_slug} />
      )}

      {/* 3 metrics: views (manual) / sales page clicks (auto from worker)
          / CTAs made (manual). Actions field removed per the creator's feedback. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
        <FieldGroup label="views (last 30d)" hint="manual - platform-specific API integration would auto-pull this">
          <NumberInput
            value={link.views_30d}
            onSave={(v) => update.mutate({ views_30d: v })}
            placeholder="10000"
          />
        </FieldGroup>
        <FieldGroup label="sales page clicks (last 30d)" hint={link.tracking_slug ? 'auto-pulled from worker every 60s' : 'generate a tracking link to enable auto-pull'}>
          <div
            style={{
              padding: '8px 12px',
              background: link.tracking_slug ? 'color-mix(in srgb, var(--recovery) 8%, transparent)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${link.tracking_slug ? 'color-mix(in srgb, var(--recovery) 30%, var(--hairline))' : 'var(--hairline)'}`,
              borderRadius: 'var(--radius-md)',
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: autoClicks !== null ? 'var(--recovery)' : 'var(--muted-2)',
              textAlign: 'center',
              minHeight: 38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={
              !link.tracking_slug
                ? 'generate a tracking link first'
                : linkStats.isError
                ? `worker not reachable: ${(linkStats.error as Error).message}. deploy with 'cd 03_Projects/agents/worker && npm run deploy' to enable.`
                : 'auto-pulled from the Cloudflare worker'
            }
          >
            {!link.tracking_slug
              ? '-'
              : linkStats.isLoading
              ? '…'
              : linkStats.isError
              ? '⚠'
              : autoClicks !== null
              ? autoClicks.toLocaleString()
              : '-'}
          </div>
        </FieldGroup>
        <FieldGroup label="CTAs made (last 30d)" hint="how many posts you made with a CTA for this offer">
          <NumberInput
            value={link.ctas_made_30d}
            onSave={(v) => update.mutate({ ctas_made_30d: v })}
            placeholder="12"
          />
        </FieldGroup>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
        {!salesPageUrlSet ? (
          // Visible inline message instead of a disabled button - the
          // disabled state was easy to miss / made the button look broken.
          <span style={{ color: 'var(--strain)', fontSize: 11, fontStyle: 'italic' }}>
            set the sales page URL above first to generate this platform's tracking link.
          </span>
        ) : (
          <button
            type="button"
            className="off-btn off-btn--ghost"
            style={{ fontSize: 11 }}
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? 'generating…' : link.tracking_slug ? '↻ regenerate link' : '+ generate tracking link'}
          </button>
        )}
        {generate.data?.needs_deploy && (
          <span className="muted" style={{ fontSize: 11 }}>
            run <code style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>{generate.data.deploy_command}</code> to activate.
          </span>
        )}
        {generate.isError && (
          <span style={{ color: '#ff6b6b', fontSize: 11 }}>{(generate.error as Error).message}</span>
        )}
        <button
          type="button"
          className="off-btn off-btn--danger-ghost"
          style={{ fontSize: 11, marginLeft: 'auto' }}
          onClick={() => { if (confirm(`delete ${link.platform} link?`)) del.mutate(); }}
        >delete</button>
      </div>
    </div>
  );
}

// Setup-prompt block. Shown in place of the "Generate tracking link"
// button when the Cloudflare-worker link manifest isn't set up yet.
// the creator copies the prompt and pastes it into a Claude chat to set it
// up - then comes back and the button works.
// Prominent copyable display for a /go/<slug> tracking link. Used by
// both EmailRow and ShortFormRow under the title. Click to copy, button
// flashes "copied" for 2s. Whole strip is also click-to-copy for big
// hit area.
function CopyableTrackingLink({ slug }: { slug: string }) {
  const fullUrl = `https://yourdomain.com/go/${slug}`;
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'copied!' : 'click to copy the full URL'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '8px 12px',
        background: copied
          ? 'color-mix(in srgb, var(--recovery) 15%, transparent)'
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${copied ? 'var(--recovery)' : 'var(--hairline)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--text)',
        transition: 'all 0.15s',
      }}
    >
      <code style={{
        flex: 1,
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
        fontSize: 12,
        color: 'var(--text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {fullUrl}
      </code>
      <span
        style={{
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: copied ? 'var(--recovery)' : 'var(--muted)',
          padding: '2px 8px',
          border: `1px solid ${copied ? 'var(--recovery)' : 'var(--hairline)'}`,
          borderRadius: 4,
        }}
      >
        {copied ? '✓ copied' : 'copy'}
      </span>
    </button>
  );
}

function TrackingSetupPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        border: '1px dashed color-mix(in srgb, var(--strain) 50%, var(--hairline))',
        background: 'color-mix(in srgb, var(--strain) 4%, transparent)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--strain)', fontWeight: 700 }}>
          tracking system not set up
        </span>
        <button
          type="button"
          className="off-btn off-btn--primary"
          style={{ fontSize: 11 }}
          onClick={copy}
        >
          {copied ? '✓ copied' : 'copy prompt'}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
        Paste the prompt below into a Claude chat to set up the Cloudflare worker tracking system. Once it's set up, come back and click "Generate tracking link" again.
      </p>
      <pre
        style={{
          margin: 0,
          padding: 'var(--space-2)',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          fontSize: 11,
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          color: 'var(--text)',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          maxHeight: 200,
          overflow: 'auto',
        }}
      >
        {prompt}
      </pre>
    </div>
  );
}

// Top-of-panel banner shown on the Conversions view until the user has set
// up the Cloudflare worker tracking system. Reuses the same setup_prompt the
// per-block fallback uses. Auto-hides once tracking-setup-status.ok = true.
function ConversionsSetupBanner({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  const promptLabel = prompt.split('\n')[0]!.slice(0, 90);
  return (
    <div
      style={{
        padding: 'var(--space-4)',
        border: '1px dashed color-mix(in srgb, var(--strain) 50%, var(--hairline))',
        background: 'color-mix(in srgb, var(--strain) 5%, transparent)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <div>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--strain)', fontWeight: 700 }}>
          one-time setup · tracking system not configured
        </span>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--body-sm)', lineHeight: 1.5 }}>
          conversion data on this page is wired up by a tiny cloudflare worker that handles
          your <code>/go/&lt;slug&gt;</code> tracking links and counts clicks. paste the prompt
          below into claude inside this vault - it deploys the worker, wires up the manifest,
          and unlocks the "generate tracking link" buttons throughout this panel. this banner
          disappears once setup completes.
        </p>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'rgba(0,0,0,0.18)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          fontSize: 'var(--body-sm)',
        }}
      >
        <span style={{ flex: 1, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {promptLabel}
        </span>
        <button
          type="button"
          className="off-btn off-btn--primary"
          style={{ fontSize: 11 }}
          onClick={copy}
        >
          {copied ? '✓ copied full prompt' : 'copy prompt'}
        </button>
      </div>
    </div>
  );
}

// ─── Tiny field primitives used by the per-offer panels ─────────────────

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 700 }}>{label}</span>
      {hint && <span className="off-section__sub" style={{ margin: 0, fontSize: 11 }}>{hint}</span>}
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function TextInput({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); }}
      className="off-text-input"
      style={{ width: '100%' }}
    />
  );
}

function NumberInput({ value, onSave, placeholder }: { value: number | null; onSave: (v: number | null) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value != null ? String(value) : '');
  useEffect(() => { setDraft(value != null ? String(value) : ''); }, [value]);
  function commit() {
    if (draft === '') {
      if (value !== null) onSave(null);
      return;
    }
    const n = parseFloat(draft);
    if (Number.isFinite(n) && n !== value) onSave(n);
  }
  return (
    <input
      type="number"
      min={0}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className="off-text-input"
      style={{ width: '100%', fontVariantNumeric: 'tabular-nums' }}
    />
  );
}

function TextareaInput({ value, onSave, rows = 3, placeholder }: { value: string; onSave: (v: string) => void; rows?: number; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <textarea
      value={draft}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft); }}
      className="off-textarea"
      style={{ width: '100%' }}
    />
  );
}

// Checkbox helper was used by the now-removed "extra content strategy
// fields" details block. Dropped entirely - if a future block needs a
// styled checkbox it can be reinstated from git history.

/**
 * Suite-level block wrapper. Used for the Avatars and Offer Suite sections
 * that are now pinned to the top of the Offer page.
 */
function SuiteBlock({
  eyebrow,
  title,
  subtitle,
  color,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <header className="stack" style={{ gap: 4 }}>
        <span className="off-eyebrow" style={{ color }}>{eyebrow}</span>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.5rem',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
        <p className="off-section__sub" style={{ margin: 0, maxWidth: '70ch' }}>{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function ScoreHero({
  score,
  stage,
  framing,
  onSetStage,
}: {
  score: number;
  stage: OfferStage;
  framing: string;
  onSetStage: (s: string) => void;
}) {
  const stages: OfferStage['id'][] = ['idea', 'validated', 'iterating', 'signature', 'scaling'];
  return (
    <section className="off-hero">
      <div className="off-hero__top">
        <div className="off-hero__ring">
          <Ring value={score / 100} label="" bigNumber={`${score}`} unit="" size="hero" color="var(--recovery)" />
        </div>
        <div className="off-hero__copy">
          <span className="off-eyebrow off-eyebrow--accent">stage · {stage.label.toLowerCase()}</span>
          <h1 className="off-hero__title">how strong is your offer?</h1>
          <p className="off-hero__framing">{framing}</p>
        </div>
      </div>

      <div className="off-stages">
        {stages.map((s) => (
          <button
            key={s}
            type="button"
            className={`off-stage ${s === stage.id ? 'off-stage--active' : ''}`}
            onClick={() => onSetStage(s)}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
    </section>
  );
}

function OfferProfileCard({
  profile,
  onSave,
}: {
  profile: OfferProfile;
  onSave: (slot: string, value: string | null) => void;
}) {
  return (
    <section className="off-card">
      <header className="off-card__head">
        <span className="off-eyebrow off-eyebrow--accent">the offer · what you're selling</span>
      </header>

      <InlineField
        slot="offer_name"
        value={profile.name}
        placeholder="The offer name. the offer / OS Builds / etc."
        large
        onSave={onSave}
      />
      <InlineField
        slot="offer_transformation"
        value={profile.transformation}
        placeholder="The transformation this offer takes someone through. From X to Y."
        onSave={onSave}
      />
      <InlineField
        slot="offer_big_promise"
        value={profile.big_promise}
        placeholder="The specific outcome. Result + timeframe + measurable."
        onSave={onSave}
      />
      <InlineField
        slot="offer_mechanism"
        value={profile.mechanism}
        placeholder="How it's delivered. Course / community / DFY / DWY / 1:1."
        onSave={onSave}
      />
    </section>
  );
}

// ============================================================================
// Compact Offer Strength calculator. Sits beside the offer profile.
// Small dial, prominent score number, single "rate" button. Folds all 25
// OfferCHK Qs into one combined score (Hormozi math behind the scenes).
// ============================================================================
function OfferStrengthPanel({
  levers,
  overallScore,
  onClose,
  onRate,
}: {
  levers: OfferLever[];
  overallScore: number;
  onClose: () => void;
  onRate: (slot: string, score: number) => void;
}) {
  return (
    <div className="off-panel-wrap" onClick={onClose}>
      <aside
        className="off-panel"
        style={{ '--lev-c': 'var(--recovery)' } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="off-panel__head">
          <div className="off-panel__head-l">
            <span className="off-eyebrow off-eyebrow--accent">offer strength</span>
            <h2 className="off-panel__title">rate every question</h2>
            <p className="off-panel__sub">
              Self-rate each question 1 to 5. All 25 feed the offer strength score on the right.
              The score at the top of the page combines this with avatar, pricing, proof, validation
              and content. The 4 sub-headings below show how the math weights different parts (clarity
              and proof lift the score, time delay and effort drag it down).
            </p>
          </div>
          <div className="off-panel__head-r">
            <div className="off-panel__score">
              <span>{overallScore}</span>
              <span className="off-panel__score-sub">/ 100</span>
            </div>
            <button type="button" className="off-btn off-btn--ghost" onClick={onClose}>close</button>
          </div>
        </header>

        {levers.map((lever) => (
          <div key={lever.id} className="off-lever-group">
            <header className="off-lever-group__head">
              <span className="off-eyebrow" style={{ color: lever.color }}>
                {lever.label.toLowerCase()}
              </span>
              <span className="off-lever-group__avg">avg {lever.self_rate_avg.toFixed(1)} / 5</span>
            </header>
            <div className="off-qlist">
              {lever.offercheck_qs.map((q) => (
                <RatingRow key={q.id} q={q} color={lever.color} onRate={(score) => onRate(q.id, score)} />
              ))}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}

// ============================================================================
// Section preview: one-sentence summary of what's in the section, drawn from
// the build fields or the bank. Returns null when there's nothing to show yet.
// ============================================================================
function sectionSummary(section: OfferSection): string | null {
  const get = (id: string) => section.build.find((f) => f.id === id)?.value?.trim() || null;
  const trim = (s: string, n = 110) => (s.length <= n ? s : s.slice(0, n).trim() + '…');

  if (section.id === 'avatar') {
    const list = section.avatars ?? [];
    if (list.length === 0) return null;
    const first = list[0];
    // Don't surface demographics in the headline preview - the creator doesn't
    // want avatars framed by demo, she wants them framed by who-they-are
    // + before/after.
    const oneLiner = first.one_line || first.before_state || first.after_state;
    const label = first.name || '(unnamed avatar)';
    return list.length > 1
      ? `${label}${oneLiner ? ' · ' + trim(oneLiner, 70) : ''} (+${list.length - 1} more)`
      : `${label}${oneLiner ? ' · ' + trim(oneLiner, 80) : ''}`;
  }
  if (section.id === 'pricing') {
    const rungs = section.pricing_rungs ?? [];
    // Summary mirrors the new stage taxonomy: prioritise the most advanced
    // stage that has a price label so the dim card shows real progress.
    const stageOrder = ['scaling', 'signature', 'iterating', 'validated', 'idea'] as const;
    for (const stage of stageOrder) {
      const r = rungs.find((x) => x.status === stage && x.price_label);
      if (r) return `${stage}: ${r.price_label}${r.name ? ' · ' + r.name : ''}`;
    }
    const price = get('pricing_current_price');
    const tgt = get('pricing_target_price');
    if (price) return tgt ? `${price} → ${tgt}` : trim(price, 110);
    return null;
  }
  if (section.id === 'proof') {
    const results = (section.pricing_results ?? []).filter((r) => r.status === 'confirmed');
    if (results.length > 0) {
      const ownN = results.filter((r) => r.kind === 'own').length;
      const custN = results.filter((r) => r.kind === 'customer').length;
      return `${results.length} result${results.length === 1 ? '' : 's'} · ${ownN} own + ${custN} customer`;
    }
    return null;
  }
  if (section.id === 'validation') {
    const phases = section.validation_phases ?? [];
    const current = phases.find((p) => p.id === section.current_validation_phase);
    if (!current) return null;
    const doneTotal = phases.reduce((n, p) => n + p.checks.filter((c) => c.done).length, 0);
    const totalChecks = phases.reduce((n, p) => n + p.checks.length, 0);
    return `${current.label} · ${doneTotal} / ${totalChecks} actions ticked`;
  }
  if (section.id === 'content_offer') {
    const actions = section.content_actions ?? [];
    const done = actions.filter((a) => a.done).length;
    if (actions.length > 0) return `${done} / ${actions.length} content tasks ticked`;
    return null;
  }
  return null;
}

function sectionFallback(section: OfferSection): string {
  switch (section.id) {
    case 'avatar': return 'No avatars yet. Add one to anchor the offer.';
    case 'pricing': return 'Current price not set. Open to define pricing.';
    case 'proof': return 'No proof yet. Add your own results and client testimonials.';
    case 'validation': return 'No problem hypothesis yet. Open to validate.';
    case 'content_offer': return 'No content-offer plan yet. Set the VSL + CTA cadence.';
    default: return 'Open to fill this section in.';
  }
}

function SectionsGrid({
  sections,
  offerStrengthScore,
  levers,
  onOpenSection,
  onOpenStrength,
}: {
  sections: OfferSection[];
  offerStrengthScore: number;
  levers: OfferLever[];
  onOpenSection: (id: string) => void;
  onOpenStrength: () => void;
}) {
  // Offer Strength is rendered as the first card so it sits with the other
  // section cards in the same 2-column grid, same hover, same shape.
  const ratedCount = levers.reduce(
    (n, l) => n + l.offercheck_qs.filter((q) => q.self_rate !== 3).length,
    0
  );
  return (
    <div className="off-sec-grid">
      <OfferStrengthCard score={offerStrengthScore} ratedCount={ratedCount} onOpen={onOpenStrength} />
      {sections.map((s) => (
        <SectionDimCard key={s.id} section={s} onOpen={() => onOpenSection(s.id)} />
      ))}
    </div>
  );
}

function OfferStrengthCard({
  score,
  ratedCount,
  onOpen,
}: {
  score: number;
  ratedCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="off-secdim"
      style={{ '--sec-c': 'var(--recovery)' } as React.CSSProperties}
      onClick={onOpen}
    >
      <div className="off-secdim__row">
        <Ring
          value={score / 100}
          label=""
          bigNumber={`${score}`}
          unit=""
          size="small"
          color="var(--recovery)"
        />
        <div className="off-secdim__head">
          <span className="off-eyebrow off-eyebrow--accent">offer strength</span>
          <p className="off-secdim__def">
            {ratedCount > 0
              ? `${ratedCount} of 25 questions rated. tap to keep going.`
              : 'one quick check across 25 questions. tap to rate every question 1 to 5.'}
          </p>
        </div>
      </div>
      <div className="off-secdim__bar">
        <div className="off-secdim__bar-fill" style={{ width: `${score}%` }} />
      </div>
      <div className="off-secdim__meta">
        <span>{ratedCount} / 25 rated</span>
        <span>open →</span>
      </div>
    </button>
  );
}

export function SectionDimCard({
  section,
  onOpen,
}: {
  section: OfferSection;
  onOpen: () => void;
}) {
  const summary = sectionSummary(section);
  const fallback = sectionFallback(section);
  const pct = Math.round(section.build_completion * 100);
  return (
    <button
      type="button"
      className="off-secdim"
      style={{ '--sec-c': section.color } as React.CSSProperties}
      onClick={onOpen}
    >
      <div className="off-secdim__row">
        <Ring
          value={Math.min(1, section.build_completion)}
          label=""
          bigNumber={`${pct}`}
          unit=""
          size="small"
          color={section.color}
        />
        <div className="off-secdim__head">
          <span className="off-eyebrow" style={{ color: section.color }}>
            {section.label.toLowerCase()}
          </span>
          <p className={`off-secdim__def ${summary ? '' : 'off-secdim__def--empty'}`}>
            {summary ?? fallback}
          </p>
        </div>
      </div>
      <div className="off-secdim__bar">
        <div className="off-secdim__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="off-secdim__meta">
        <span>{pct}% built</span>
        <span>open →</span>
      </div>
    </button>
  );
}

function RatingRow({
  q,
  color,
  onRate,
}: {
  q: { id: string; question: string; self_rate: number };
  color: string;
  onRate: (score: number) => void;
}) {
  return (
    <div className="off-q">
      <p className="off-q__text">{q.question}</p>
      <div className="off-q__rates">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`off-q__btn ${q.self_rate === n ? 'off-q__btn--on' : ''}`}
            style={q.self_rate === n ? { background: color, color: 'var(--bg)', borderColor: color } : undefined}
            onClick={() => onRate(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SectionPanel({
  section,
  onClose,
  onSaveField,
}: {
  section: OfferSection;
  onClose: () => void;
  onSaveField: (slot: string, value: string | null) => void;
}) {
  return (
    <div className="off-panel-wrap" onClick={onClose}>
      <aside
        className="off-panel"
        style={{ '--lev-c': section.color } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="off-panel__head">
          <div className="off-panel__head-l">
            <span className="off-eyebrow" style={{ color: section.color }}>section</span>
            <h2 className="off-panel__title">{section.label.toLowerCase()}</h2>
            <p className="off-panel__sub">feeds: {section.feeds_levers.join(', ')}</p>
          </div>
          <div className="off-panel__head-r">
            {/* Legacy "X% built" indicator removed - it was driven by the old
                slot-completeness heuristic that doesn't match the new
                25-question self-rate system. The real per-section score
                lives on each offer card's sub-cards. */}
            <button type="button" className="off-btn off-btn--ghost" onClick={onClose}>close</button>
          </div>
        </header>

        {/* Run the skill that builds this section, right where it's relevant -
            offer-blueprint for the offer suite, customer-avatar for avatars. */}
        {section.id === 'pricing' && <PageSkillLink name="offer-blueprint" />}
        {section.id === 'avatar' && <PageSkillLink name="customer-avatar" />}

        {/* Proof, Avatar, Pricing, and Validation all have their own custom
            blocks (Promise+proof / avatar bank / proof ladder / tangible
            checklist) - everyone else falls through to the generic
            text-field foundations. */}
        {section.build.length > 0 && section.id !== 'proof' && section.id !== 'avatar' && section.id !== 'pricing' && section.id !== 'validation' && (
          <Section title="foundations" subtitle="fill these out to give Claude the raw material it needs.">
            <div className="off-stack">
              {section.build.map((f) => (
                <FoundationRow key={f.id} field={f} color={section.color} onSave={(v) => onSaveField(f.id, v)} />
              ))}
            </div>
          </Section>
        )}

        {section.id === 'validation' && section.validation_phases && (
          <Section
            title="validation stages"
            subtitle="5 phases from idea to scaling. tick each tangible step as you do it. the highlighted phase is where you currently are."
          >
            <ValidationPhases
              phases={section.validation_phases}
              currentPhase={section.current_validation_phase}
              color={section.color}
              onToggle={(checkId, done) => onSaveField(`vcheck_${checkId}`, done ? '1' : null)}
            />
          </Section>
        )}

        {section.id === 'pricing' && (
          <>
            {section.pricing_rungs !== undefined && (
              <Section
                title="offer suite"
                subtitle="the full set of offers you sell - low / mid / high tickets, each with its own price, promise, and avatar. star one as the featured offer to focus on this sprint."
              >
                <PricingLadder
                  rungs={section.pricing_rungs}
                  color={section.color}
                  avatars={section.avatars ?? []}
                />
              </Section>
            )}
            {section.value_check_fields && section.value_check_fields.length > 0 && (
              <Section
                title="10x value check"
                subtitle="the rule: deliver 10x the value vs the price. answer three questions about the price you're currently charging."
              >
                <ValueCheckFields
                  fields={section.value_check_fields}
                  color={section.color}
                  onSave={(id, value) => onSaveField(id, value)}
                />
              </Section>
            )}
            {section.pricing_results !== undefined && (
              <Section
                title="results that justify this price"
                subtitle="always deliver 10x more value than you charge. if you're charging $99, you want to be delivering at least $1,000 worth of results to your customers. log the specific results - yours and theirs - that prove you are."
              >
                <PricingResultsBank results={section.pricing_results} color={section.color} />
              </Section>
            )}
            {section.conversion_diagnostic && (
              <Section
                title="conversion rate"
                subtitle="page-view-to-paid percentage. the diagnostic uses the current rung's price as the band. high = price too low. low = something off in the offer."
              >
                <ConversionRateCheck
                  diagnostic={section.conversion_diagnostic}
                  color={section.color}
                  onSave={(value) => onSaveField('pricing_conversion_rate', value)}
                />
              </Section>
            )}
          </>
        )}

        {section.id === 'avatar' && section.avatars && (
          <Section
            title="avatar bank"
            subtitle="the people you build the offer for. click an avatar to see and edit their whole profile."
          >
            <AvatarBank avatars={section.avatars} color={section.color} />
          </Section>
        )}

        {section.id === 'content_offer' && section.content_actions && (
          <ContentActions
            actions={section.content_actions}
            urgencyText={section.urgency_text ?? null}
            color={section.color}
            onToggle={(id, done) => onSaveField(id, done ? '1' : null)}
            onSaveUrgency={(value) => onSaveField('content_urgency_text', value)}
          />
        )}

        {section.id === 'proof' && (
          <>
            <ProofPromiseBlock color={section.color} />
            {section.pricing_results !== undefined && (
              <Section
                title="results bank"
                subtitle="your own results and customer results. this is the same bank that powers the pricing section - whatever you add here shows up there too."
              >
                <PricingResultsBank results={section.pricing_results} color={section.color} />
              </Section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="off-section">
      <header className="off-section__head">
        <h3 className="off-section__title">{title}</h3>
        {subtitle && <p className="off-section__sub">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

// 5-phase validation checklist. Each phase is a collapsible group with
// its own checkboxes. The "current phase" (first not-100%-complete) gets
// a highlighted ring and opens by default. Each check toggles a
// state.md slot (offer_vcheck_<id>) via the parent's onToggle prop.
function ValidationPhases({
  phases,
  currentPhase,
  color,
  onToggle,
}: {
  phases: OfferValidationPhase[];
  currentPhase?: OfferValidationPhase['id'];
  color: string;
  onToggle: (id: string, done: boolean) => void;
}) {
  // Open the current phase by default; user can collapse/expand any.
  const [openPhase, setOpenPhase] = useState<string | null>(currentPhase ?? phases[0]?.id ?? null);

  const totalChecks = phases.reduce((sum, p) => sum + p.total, 0);
  const totalDone = phases.reduce((sum, p) => sum + p.done_count, 0);
  const overallPct = totalChecks > 0 ? Math.round((totalDone / totalChecks) * 100) : 0;
  const currentLabel = phases.find((p) => p.id === currentPhase)?.label ?? phases[0]?.label;

  return (
    <div className="vphz">
      {/* Header strip: current phase + total progress across all phases. */}
      <div className="vphz__head">
        <div className="vphz__current">
          <span className="vphz__current-label">currently in</span>
          <span className="vphz__current-name" style={{ color }}>{currentLabel}</span>
        </div>
        <div className="vphz__overall">
          <div className="vphz__overall-count">
            <span className="vphz__overall-big" style={{ color }}>{totalDone}</span>
            <span className="vphz__overall-total">/ {totalChecks}</span>
          </div>
          <div className="vphz__bar">
            <div className="vphz__bar-fill" style={{ width: `${overallPct}%`, background: color }} />
          </div>
        </div>
      </div>

      <div className="vphz__list">
        {phases.map((p, idx) => {
          const isOpen = openPhase === p.id;
          const isCurrent = currentPhase === p.id;
          const pct = Math.round(p.pct_complete * 100);
          const isComplete = pct === 100;
          return (
            <div
              key={p.id}
              className={`vphz__phase ${isOpen ? 'vphz__phase--open' : ''} ${isCurrent ? 'vphz__phase--current' : ''} ${isComplete ? 'vphz__phase--done' : ''}`}
              style={isCurrent ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
            >
              <button
                type="button"
                className="vphz__phase-head"
                onClick={() => setOpenPhase(isOpen ? null : p.id)}
              >
                <span
                  className="vphz__phase-num"
                  style={{
                    borderColor: color,
                    background: isComplete ? color : 'transparent',
                    color: isComplete ? 'var(--bg)' : color,
                  }}
                >
                  {isComplete ? '✓' : idx + 1}
                </span>
                <div className="vphz__phase-title">
                  <div className="vphz__phase-title-row">
                    <span className="vphz__phase-name">{p.label}</span>
                    {isCurrent && !isComplete && (
                      <span className="vphz__current-badge" style={{ color, borderColor: color }}>
                        current
                      </span>
                    )}
                  </div>
                  <span className="vphz__phase-desc">{p.description}</span>
                </div>
                <span
                  className="vphz__phase-count"
                  style={{ color: isComplete ? color : 'var(--muted-2)' }}
                >
                  {p.done_count}/{p.total}
                </span>
                <span className="vphz__phase-caret">{isOpen ? '−' : '+'}</span>
              </button>
              <div className="vphz__phase-bar">
                <div className="vphz__phase-bar-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
              {isOpen && (
                <ul className="vphz__checks">
                  {p.checks.map((c) => (
                    <li key={c.id} className={`vphz__check ${c.done ? 'vphz__check--done' : ''}`}>
                      <button
                        type="button"
                        className="vphz__check-btn"
                        onClick={() => onToggle(c.id, !c.done)}
                        aria-pressed={c.done}
                      >
                        <span
                          className="vphz__check-box"
                          style={{
                            borderColor: c.done ? color : 'var(--hairline)',
                            background: c.done ? color : 'transparent',
                          }}
                        >
                          {c.done && <span className="vphz__check-tick">✓</span>}
                        </span>
                        <span className="vphz__check-text">
                          <span className="vphz__check-label">{c.label}</span>
                          {c.hint && <span className="vphz__check-hint">{c.hint}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <style>{VPHZ_CSS}</style>
    </div>
  );
}

const VPHZ_CSS = `
.vphz { display: flex; flex-direction: column; gap: var(--space-4); }
.vphz__head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.02);
}
.vphz__current { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.vphz__current-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted-2);
}
.vphz__current-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  letter-spacing: -0.01em;
  line-height: 1.1;
}
.vphz__overall { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.vphz__overall-count { display: flex; align-items: baseline; gap: 4px; justify-content: flex-end; }
.vphz__overall-big {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.vphz__overall-total {
  font-size: 12px;
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
}
.vphz__bar {
  height: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 999px;
  overflow: hidden;
}
.vphz__bar-fill {
  height: 100%;
  border-radius: inherit;
  transition: width var(--duration-base) var(--ease-out);
}
.vphz__list { display: flex; flex-direction: column; gap: var(--space-2); }
.vphz__phase {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
  transition: all 0.15s;
}
.vphz__phase--done { background: rgba(255,255,255,0.04); }
.vphz__phase-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: var(--space-3);
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
}
.vphz__phase-head:hover { background: rgba(255,255,255,0.02); }
.vphz__phase-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 1.5px solid;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.vphz__phase-title { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vphz__phase-title-row { display: flex; align-items: center; gap: 8px; }
.vphz__phase-name {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 18px;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.vphz__current-badge {
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  border: 1px solid;
  padding: 2px 6px;
  border-radius: 999px;
  font-weight: 600;
}
.vphz__phase-desc { font-size: 12px; color: var(--muted-2); line-height: 1.4; }
.vphz__phase-count {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.vphz__phase-caret {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--muted-2);
  width: 16px;
  text-align: center;
}
.vphz__phase-bar {
  height: 3px;
  background: rgba(255,255,255,0.06);
  overflow: hidden;
}
.vphz__phase-bar-fill {
  height: 100%;
  transition: width var(--duration-base) var(--ease-out);
}
.vphz__checks { list-style: none; padding: var(--space-2); margin: 0; display: flex; flex-direction: column; gap: 4px; }
.vphz__check {
  border-radius: var(--radius-md);
  transition: all 0.15s;
}
.vphz__check-btn {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 12px;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
  border-radius: var(--radius-md);
}
.vphz__check-btn:hover { background: rgba(255,255,255,0.03); }
.vphz__check-box {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: 1.5px solid;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  transition: all 0.15s;
}
.vphz__check-tick { color: var(--bg); font-size: 12px; line-height: 1; font-weight: 700; }
.vphz__check-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.vphz__check-label {
  font-size: var(--body);
  line-height: 1.45;
}
.vphz__check--done .vphz__check-label { text-decoration: line-through; color: var(--muted); text-decoration-thickness: 1px; }
.vphz__check-hint { font-size: 11px; color: var(--muted-2); line-height: 1.4; }
`;

// (the flat .vchk__ CSS block was retired with the flat-checklist UI -
// see VPHZ_CSS in the ValidationPhases component for the new styles)

function FoundationRow({
  field,
  color,
  onSave,
}: {
  field: OfferFieldStatus;
  color: string;
  onSave: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(!field.filled);
  return (
    <div className={`off-found ${field.filled ? 'off-found--done' : ''}`}>
      <button type="button" className="off-found__head" onClick={() => setOpen(!open)}>
        <span
          className="off-found__dot"
          style={{ background: field.filled ? color : 'transparent', borderColor: color }}
        />
        <span className="off-found__label">{field.label}</span>
        <span className="off-found__caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="off-found__body">
          {field.prompt && !field.filled && <p className="off-found__prompt">{field.prompt}</p>}
          <FieldEditable value={field.value ?? null} onSave={onSave} />
        </div>
      )}
    </div>
  );
}

function FieldEditable({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  if (editing) {
    return (
      <div className="off-inline off-inline--editing">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(4, Math.ceil((draft.length || 80) / 80))}
          className="off-textarea"
        />
        <div className="off-actions">
          <button type="button" className="off-btn off-btn--ghost" onClick={() => setEditing(false)}>cancel</button>
          <button
            type="button"
            className="off-btn off-btn--primary"
            onClick={() => {
              onSave(draft.trim() || null);
              setEditing(false);
            }}
          >save</button>
        </div>
      </div>
    );
  }
  return value ? (
    <div className="off-inline off-inline--view" onClick={() => setEditing(true)}>
      <p className="off-inline__value">{value}</p>
    </div>
  ) : (
    <button type="button" className="off-btn off-btn--primary" onClick={() => setEditing(true)}>fill this in</button>
  );
}

function InlineField({
  slot,
  value,
  placeholder,
  large,
  onSave,
}: {
  slot: string;
  value: string | null;
  placeholder: string;
  large?: boolean;
  onSave: (slot: string, value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  const hasValue = !!value?.trim();
  if (editing) {
    return (
      <div className="off-inline off-inline--editing">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, Math.ceil((draft.length || 80) / 90))}
          className={`off-textarea ${large ? 'off-textarea--large' : ''}`}
          placeholder={placeholder}
        />
        <div className="off-actions">
          <button type="button" className="off-btn off-btn--ghost" onClick={() => setEditing(false)}>cancel</button>
          <button
            type="button"
            className="off-btn off-btn--primary"
            onClick={() => {
              onSave(slot, draft.trim() || null);
              setEditing(false);
            }}
          >save</button>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`off-inline ${hasValue ? 'off-inline--view' : 'off-inline--empty'}`}
      onClick={() => setEditing(true)}
    >
      {hasValue ? (
        <p className={`off-inline__value ${large ? 'off-inline__value--lg' : ''}`}>{value}</p>
      ) : (
        <p className="off-inline__placeholder">{placeholder}</p>
      )}
    </div>
  );
}

// =========================================================================
// ContentActions: tickbox checklist of recurring content-offer integration
// tasks plus a free-text field for the urgency mechanic. Auto-tracks progress.
// =========================================================================
function ContentActions({
  actions,
  urgencyText,
  color,
  onToggle,
  onSaveUrgency,
}: {
  actions: OfferContentAction[];
  urgencyText: string | null;
  color: string;
  onToggle: (id: string, done: boolean) => void;
  onSaveUrgency: (value: string | null) => void;
}) {
  return (
    <>
      <Section
        title="content tasks"
        subtitle="tick the things you've actually done. progress on this card auto-updates as you tick."
      >
        <div className="off-stack">
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`off-check ${a.done ? 'off-check--on' : ''}`}
              onClick={() => onToggle(a.id, !a.done)}
            >
              <span
                className={`off-check__box ${a.done ? 'off-check__box--on' : ''}`}
                style={a.done ? { background: color, borderColor: color } : undefined}
              >
                {a.done ? '✓' : ''}
              </span>
              <span className="off-check__copy">
                <span className="off-check__label">{a.label}</span>
                {a.hint && <span className="off-check__hint">{a.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="what is the urgency?"
        subtitle="if you ticked the urgency box, describe the mechanic. limited spots / beta pricing / cohort start / member-count rise. real, not fake."
      >
        <UrgencyTextField value={urgencyText} onSave={onSaveUrgency} />
      </Section>
    </>
  );
}

function UrgencyTextField({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);
  if (editing) {
    return (
      <div className="off-inline off-inline--editing">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, Math.ceil((draft.length || 80) / 80))}
          className="off-textarea"
          placeholder="The specific urgency mechanic that's live right now."
        />
        <div className="off-actions">
          <button type="button" className="off-btn off-btn--ghost" onClick={() => setEditing(false)}>cancel</button>
          <button
            type="button"
            className="off-btn off-btn--primary"
            onClick={() => {
              onSave(draft.trim() || null);
              setEditing(false);
            }}
          >save</button>
        </div>
      </div>
    );
  }
  return value ? (
    <div className="off-inline off-inline--view" onClick={() => setEditing(true)}>
      <p className="off-inline__value">{value}</p>
    </div>
  ) : (
    <button type="button" className="off-btn off-btn--primary" onClick={() => setEditing(true)}>describe the urgency</button>
  );
}

// =========================================================================
// PricingResultsBank: mirrors the Reputation brag/customer-wins UX.
// Split into own + customer lists, each with add / edit / delete.
// =========================================================================
function PricingResultsBank({ results, color }: { results: OfferPricingResult[]; color: string }) {
  const ownResults = results.filter((r) => r.kind === 'own');
  const customerResults = results.filter((r) => r.kind === 'customer');
  return (
    <div className="off-stack" style={{ gap: 'var(--space-4)' }}>
      <PricingResultsList kind="own" results={ownResults} color={color} />
      <PricingResultsList kind="customer" results={customerResults} color={color} />
    </div>
  );
}

function PricingResultsList({
  kind,
  results,
  color,
}: {
  kind: 'own' | 'customer';
  results: OfferPricingResult[];
  color: string;
}) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: { title: string; body?: string; metric?: string }) =>
      api.addPricingResult({ ...body, kind, status: 'confirmed' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deletePricingResult(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', metric: '' });
  const [openId, setOpenId] = useState<string | null>(null);

  const label = kind === 'own' ? 'your own results' : 'customer results';
  const placeholder =
    kind === 'own'
      ? "Headline result (e.g. '$50K month after 5-video series')"
      : "Client headline (e.g. 'the avatar - $10K cap broken in 90 days')";

  return (
    <div className="off-stack">
      <span className="off-eyebrow" style={{ color }}>
        {label}
      </span>

      {results.map((r) => (
        <div key={r.id} className={`off-row ${openId === r.id ? 'off-row--open' : ''}`}>
          <button
            type="button"
            className="off-row__head"
            onClick={() => setOpenId(openId === r.id ? null : r.id)}
          >
            <span className="off-row__bullet" style={{ color }}>•</span>
            <span className="off-row__title">
              {r.title}
              {r.metric ? ` · ${r.metric}` : ''}
            </span>
            <span className="off-row__caret">{openId === r.id ? '−' : '+'}</span>
          </button>
          {openId === r.id && (
            <div className="off-row__body">
              {r.body && <p className="off-row__copy">{r.body}</p>}
              <div className="off-actions">
                <button
                  type="button"
                  className="off-btn off-btn--danger-ghost"
                  onClick={() => {
                    if (confirm(`delete "${r.title}"?`)) del.mutate(r.id);
                  }}
                >
                  delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="off-card-inline">
          <input
            className="off-text-input"
            placeholder={placeholder}
            value={draft.title}
            autoFocus
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <textarea
            className="off-textarea"
            rows={3}
            placeholder="Specifics: numbers, dates, what was done. (optional)"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <input
            className="off-text-input"
            placeholder="Metric (e.g. '$10K month' or '+2000 subs in 90 days')"
            value={draft.metric}
            onChange={(e) => setDraft({ ...draft, metric: e.target.value })}
          />
          <div className="off-actions">
            <button
              type="button"
              className="off-btn off-btn--ghost"
              onClick={() => {
                setAdding(false);
                setDraft({ title: '', body: '', metric: '' });
              }}
            >
              cancel
            </button>
            <button
              type="button"
              className="off-btn off-btn--primary"
              disabled={!draft.title.trim()}
              onClick={() => {
                add.mutate({
                  title: draft.title.trim(),
                  body: draft.body.trim() || undefined,
                  metric: draft.metric.trim() || undefined,
                });
                setAdding(false);
                setDraft({ title: '', body: '', metric: '' });
              }}
            >
              add result
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="off-add" onClick={() => setAdding(true)}>
          + add a {kind === 'own' ? 'result of your own' : 'customer result'}
        </button>
      )}
    </div>
  );
}

// =========================================================================
// ConversionRateCheck: input + diagnostic chip. Rate is persisted as a slot,
// the diagnostic comes from the server (price-bracket-aware).
// =========================================================================
function ConversionRateCheck({
  diagnostic,
  color,
  onSave,
}: {
  diagnostic: OfferConversionDiagnostic;
  color: string;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(diagnostic.rate_pct?.toString() ?? '');
  useEffect(() => {
    setDraft(diagnostic.rate_pct?.toString() ?? '');
  }, [diagnostic.rate_pct]);

  const verdictColor: Record<OfferConversionDiagnostic['verdict'], string> = {
    healthy: 'var(--recovery)',
    too_high: '#f5a524',
    too_low: '#ff6b6b',
    unknown: 'var(--muted)',
  };
  const verdictLabel: Record<OfferConversionDiagnostic['verdict'], string> = {
    healthy: 'healthy',
    too_high: 'too high · raise the price',
    too_low: 'too low · fix the offer',
    unknown: 'enter a rate',
  };

  return (
    <div className="off-conv">
      <div className="off-conv__inputrow">
        <label className="off-conv__label">
          <span>conversion rate</span>
          <div className="off-conv__inputwrap">
            <input
              type="text"
              inputMode="decimal"
              className="off-text-input off-conv__input"
              placeholder="e.g. 3.2"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const trimmed = draft.trim();
                if (!trimmed) {
                  onSave(null);
                  return;
                }
                onSave(trimmed);
              }}
            />
            <span className="off-conv__pct">%</span>
          </div>
        </label>
        {diagnostic.current_price_label && (
          <div className="off-conv__current">
            <span className="off-eyebrow">current price</span>
            <span className="off-conv__price">{diagnostic.current_price_label}</span>
          </div>
        )}
      </div>

      <div
        className="off-conv__verdict"
        style={{ borderColor: verdictColor[diagnostic.verdict], color: verdictColor[diagnostic.verdict] }}
      >
        <span className="off-conv__verdict-chip" style={{ background: verdictColor[diagnostic.verdict], color: 'var(--bg)' }}>
          {verdictLabel[diagnostic.verdict]}
        </span>
        <p className="off-conv__verdict-msg">{diagnostic.message}</p>
        {diagnostic.healthy_range && diagnostic.bracket && (
          <p className="off-conv__band">
            guideline band for {diagnostic.bracket}: {diagnostic.healthy_range.low}% to {diagnostic.healthy_range.high}%
          </p>
        )}
      </div>

      {/* unused color prop reserved for future visual tint */}
      <span style={{ display: 'none' }}>{color}</span>
    </div>
  );
}

// =========================================================================
// PricingLadder: ordered list of price rungs with status badges. Each rung
// can be edited inline. Setting one to "current" knocks others off current
// automatically (handled server-side).
// =========================================================================
const TIER_META: Record<OfferPricingRung['tier'], { label: string; sub: string; order: number }> = {
  low:    { label: 'Low ticket',  sub: 'entry point. easy yes.',                  order: 0 },
  mid:    { label: 'Mid ticket',  sub: 'the next step up. more support.',         order: 1 },
  high:   { label: 'High ticket', sub: 'premium tier. deep transformation.',      order: 2 },
  custom: { label: 'More offers', sub: 'anything outside the standard 3 tiers.',  order: 3 },
};

function PricingLadder({
  rungs,
  color,
  avatars,
}: {
  rungs: OfferPricingRung[];
  color: string;
  // Avatars from the same offer response - lets each rung attach one.
  avatars: OfferAvatar[];
}) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: Partial<OfferPricingRung> & { price_label: string; sort_order: number }) =>
      api.addPricingRung(body as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<OfferPricingRung> }) => api.updatePricingRung(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deletePricingRung(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const setFeatured = useMutation({
    mutationFn: (v: { id: string; featured: boolean }) => api.setFeaturedRung(v.id, v.featured),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const featured = rungs.find((r) => r.featured) ?? null;

  // Group rungs by tier so the creator sees a "Low ticket / Mid ticket / High ticket"
  // frame even when she hasn't added all three yet. The featured marker
  // shows as a ★ chip on the row but the rung still appears in its tier.
  const byTier: Record<OfferPricingRung['tier'], OfferPricingRung[]> = {
    low: [], mid: [], high: [], custom: [],
  };
  for (const r of rungs) {
    const tier = (r.tier ?? 'custom') as OfferPricingRung['tier'];
    byTier[tier].push(r);
  }
  for (const k of Object.keys(byTier) as Array<keyof typeof byTier>) {
    byTier[k].sort((a, b) => a.sort_order - b.sort_order);
  }

  const tierKeys: OfferPricingRung['tier'][] = ['low', 'mid', 'high', 'custom'];
  const nextOrder = rungs.length > 0 ? Math.max(...rungs.map((r) => r.sort_order)) + 1 : 1;

  function addToTier(tier: OfferPricingRung['tier']) {
    add.mutate({
      price_label: '',
      name: '',
      sort_order: nextOrder + TIER_META[tier].order,
      tier,
      avatar_id: null,
      status: 'idea',
    });
  }

  // The "featured" notion is surfaced by the OfferCardsList on the main
  // page, not inside the Offer Suite panel. Reference featured/setFeatured
  // so TS doesn't error - they're still used elsewhere on this component
  // when the row is rendered with a featuredButton.
  void featured;
  return (
    <div className="off-stack" style={{ gap: 'var(--space-5)' }}>
      {tierKeys.map((tier) => {
        const rows = byTier[tier];
        // Skip 'custom' if no rungs - only render the section when she adds one.
        // For the three default tiers always render even if empty so she sees
        // the full suite.
        if (tier === 'custom' && rows.length === 0) return null;
        return (
          <div key={tier} className="off-stack" style={{ gap: 'var(--space-2)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
              <div className="stack" style={{ gap: 2 }}>
                <span className="off-eyebrow" style={{ color }}>{TIER_META[tier].label}</span>
                <span className="off-section__sub" style={{ margin: 0 }}>{TIER_META[tier].sub}</span>
              </div>
              <button
                type="button"
                className="off-btn off-btn--ghost"
                onClick={() => addToTier(tier)}
                style={{ fontSize: 11 }}
              >
                + add offer
              </button>
            </header>
            {rows.length === 0 ? (
              <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>
                no {TIER_META[tier].label.toLowerCase()} offer yet. click + add offer.
              </p>
            ) : (
              <div className="off-stack">
                {rows.map((r) => (
                  <PricingRungRow
                    key={r.id}
                    rung={r}
                    color={color}
                    avatars={avatars}
                    open={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                    onSave={(body) => update.mutate({ id: r.id, body })}
                    onDelete={() => {
                      if (confirm(`delete this offer?`)) del.mutate(r.id);
                    }}
                    featuredButton={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFeatured.mutate({ id: r.id, featured: true });
                        }}
                        title="pin this as the featured offer"
                        style={{
                          background: 'transparent',
                          border: `1px solid ${color}`,
                          color,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-pill)',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        ☆ feature
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Always-visible "add custom" button so she can spin up tiers outside
          the standard three without manually picking a tier dropdown. */}
      {byTier.custom.length === 0 && (
        <button
          type="button"
          className="off-add"
          onClick={() => addToTier('custom')}
        >
          + add another offer tier
        </button>
      )}
    </div>
  );
}

function PricingRungRow({
  rung,
  color,
  avatars,
  open,
  onToggle,
  onSave,
  onDelete,
  // Right-aligned button shown in the row head. Used to surface "feature"
  // in tier groups; null when the rung is already the featured offer at the
  // top of the suite (it has its own unfeature control on the section head).
  featuredButton,
}: {
  rung: OfferPricingRung;
  color: string;
  avatars: OfferAvatar[];
  open: boolean;
  onToggle: () => void;
  onSave: (body: Partial<OfferPricingRung>) => void;
  onDelete: () => void;
  featuredButton?: React.ReactNode;
}) {
  const [draftPrice, setDraftPrice] = useState(rung.price_label);
  const [draftName, setDraftName] = useState(rung.name ?? '');
  const [draftProof, setDraftProof] = useState(rung.proof_required ?? '');
  const attachedAvatar = avatars.find((a) => a.id === rung.avatar_id) ?? null;
  useEffect(() => {
    if (!open) {
      setDraftPrice(rung.price_label);
      setDraftName(rung.name ?? '');
      setDraftProof(rung.proof_required ?? '');
    }
  }, [rung.price_label, rung.name, rung.proof_required, open]);

  // Offer stage (replaces old achieved/current/target/future ladder).
  const statusLabel: Record<OfferPricingRung['status'], string> = {
    idea: 'idea',
    validated: 'validated',
    iterating: 'iterating',
    signature: 'signature',
    scaling: 'scaling',
  };
  const statusColor: Record<OfferPricingRung['status'], string> = {
    idea: 'var(--muted-2)',
    validated: 'var(--strain)',
    iterating: color,
    signature: 'var(--recovery)',
    scaling: 'var(--hrv)',
  };
  const statuses: OfferPricingRung['status'][] = ['idea', 'validated', 'iterating', 'signature', 'scaling'];

  return (
    <div className={`off-rung off-rung--${rung.status} ${open ? 'off-rung--open' : ''}`} style={{ '--rung-c': statusColor[rung.status] } as React.CSSProperties}>
      <button type="button" className="off-rung__head" onClick={onToggle}>
        <span className="off-rung__price">
          {rung.price_label || <span style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>price</span>}
        </span>
        <span
          style={{
            fontWeight: 600,
            color: 'var(--ink)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rung.name || <span style={{ color: 'var(--muted-2)', fontStyle: 'italic', fontWeight: 400 }}>untitled offer</span>}
        </span>
        {attachedAvatar ? (
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--hrv)',
              fontWeight: 700,
            }}
          >
            → {attachedAvatar.name ?? 'unnamed avatar'}
          </span>
        ) : (
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--muted-2)',
              fontWeight: 600,
              fontStyle: 'italic',
            }}
          >
            no avatar
          </span>
        )}
        <span className="off-rung__status" style={{ color: statusColor[rung.status] }}>
          {statusLabel[rung.status]}
        </span>
        {featuredButton}
        <span className="off-rung__caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="off-rung__body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
            <label className="off-rung__label">
              <span>price</span>
              <input
                className="off-text-input"
                value={draftPrice}
                onChange={(e) => setDraftPrice(e.target.value)}
                onBlur={() => {
                  if (draftPrice !== rung.price_label) {
                    onSave({ price_label: draftPrice.trim() });
                  }
                }}
                placeholder="$47/mo"
              />
            </label>
            <label className="off-rung__label">
              <span>name</span>
              <input
                className="off-text-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => {
                  if (draftName !== (rung.name ?? '')) {
                    onSave({ name: draftName.trim() });
                  }
                }}
                placeholder="the offer"
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <label className="off-rung__label">
              <span>tier</span>
              <select
                className="off-text-input"
                value={rung.tier ?? 'custom'}
                onChange={(e) => onSave({ tier: e.target.value as OfferPricingRung['tier'] })}
              >
                <option value="low">Low ticket</option>
                <option value="mid">Mid ticket</option>
                <option value="high">High ticket</option>
                <option value="custom">Custom / other</option>
              </select>
            </label>
            <label className="off-rung__label">
              <span>avatar</span>
              <select
                className="off-text-input"
                value={rung.avatar_id ?? ''}
                onChange={(e) => onSave({ avatar_id: e.target.value || null })}
              >
                <option value="">-- no avatar --</option>
                {avatars.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? '(unnamed)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="off-rung__label">
            <span>description</span>
            <textarea
              className="off-textarea"
              rows={3}
              value={draftProof}
              onChange={(e) => setDraftProof(e.target.value)}
              onBlur={() => {
                if (draftProof !== (rung.proof_required ?? '')) {
                  onSave({ proof_required: draftProof.trim() || null });
                }
              }}
              placeholder="What this offer is. What it delivers. Who it's for."
            />
          </label>
          <div>
            <span
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--muted)',
                fontWeight: 700,
                display: 'block',
                marginBottom: 6,
              }}
            >
              stage
            </span>
            <div className="off-rung__statuses">
              {statuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`off-rung__statbtn ${rung.status === s ? 'off-rung__statbtn--on' : ''}`}
                  style={rung.status === s ? { background: statusColor[s], color: 'var(--bg)', borderColor: statusColor[s] } : { borderColor: statusColor[s], color: statusColor[s] }}
                  onClick={() => onSave({ status: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="off-actions">
            <button type="button" className="off-btn off-btn--danger-ghost" onClick={onDelete}>delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// =========================================================================
// ValueCheckFields: structured text prompts capturing the evidence for the
// current price. Replaces the old tickbox 10x checklist.
// =========================================================================
function ValueCheckFields({
  fields,
  color,
  onSave,
}: {
  fields: OfferValueCheckField[];
  color: string;
  onSave: (id: string, value: string | null) => void;
}) {
  return (
    <div className="off-stack">
      {fields.map((f) => (
        <ValueCheckFieldRow key={f.id} field={f} color={color} onSave={(v) => onSave(f.id, v)} />
      ))}
    </div>
  );
}

function ValueCheckFieldRow({
  field,
  color,
  onSave,
}: {
  field: OfferValueCheckField;
  color: string;
  onSave: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(!field.filled);
  return (
    <div className={`off-found ${field.filled ? 'off-found--done' : ''}`}>
      <button type="button" className="off-found__head" onClick={() => setOpen(!open)}>
        <span
          className="off-found__dot"
          style={{ background: field.filled ? color : 'transparent', borderColor: color }}
        />
        <span className="off-found__label">{field.label}</span>
        <span className="off-found__caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="off-found__body">
          {!field.filled && <p className="off-found__prompt">{field.prompt}</p>}
          <FieldEditable value={field.value ?? null} onSave={onSave} />
        </div>
      )}
    </div>
  );
}

// (validation rendering is in the ValidationPhases component above)

function AvatarBank({ avatars, color }: { avatars: OfferAvatar[]; color: string }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: { name: string }) => api.addOfferAvatar(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteOfferAvatar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Short preview blurb under the name on each card. Prefers one_line,
  // falls back to before_state, then a friendly empty hint. Truncated so
  // the cards stay one consistent height.
  function previewBlurb(a: OfferAvatar): string {
    const raw = (a.one_line || a.before_state || '').trim();
    if (!raw) return 'not filled out yet - click to start';
    const flat = raw.replace(/\s+/g, ' ');
    return flat.length > 180 ? `${flat.slice(0, 180).trimEnd()}…` : flat;
  }

  return (
    <div className="av-bank" style={{ ['--av-card-accent' as any]: color }}>
      {/* Card grid - each avatar's image + name + short description.
          Click to expand the full editor inline below the card row. */}
      <div className="av-cards">
        {avatars.map((a) => {
          const isOpen = openId === a.id;
          const imgUrl = a.image_path
            ? `/api/vault-asset/${encodeURI(a.image_path)}`
            : null;
          return (
            <button
              key={a.id}
              type="button"
              className={`av-card ${isOpen ? 'av-card--open' : ''}`}
              onClick={() => setOpenId(isOpen ? null : a.id)}
              style={{ ['--av-card-accent' as any]: color }}
            >
              <div className={`av-card__img ${imgUrl ? '' : 'av-card__img--empty'}`}>
                {imgUrl ? (
                  <img src={imgUrl} alt={`${a.name ?? 'avatar'} portrait`} />
                ) : (
                  <span className="av-card__img-empty-label">no image</span>
                )}
              </div>
              <div className="av-card__body">
                <span className="av-card__name">{a.name ?? '(unnamed)'}</span>
                <p className="av-card__desc">{previewBlurb(a)}</p>
              </div>
              <span className="av-card__caret">{isOpen ? '−' : '+'}</span>
            </button>
          );
        })}
        {adding ? (
          <div className="av-card av-card--adding">
            <input
              className="off-text-input"
              placeholder="avatar name (e.g. 'the-avatar')"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="off-actions" style={{ marginTop: 'var(--space-2)' }}>
              <button type="button" className="off-btn off-btn--ghost" onClick={() => { setAdding(false); setDraft(''); }}>cancel</button>
              <button
                type="button"
                className="off-btn off-btn--primary"
                disabled={!draft.trim()}
                onClick={() => { add.mutate({ name: draft.trim() }); setAdding(false); setDraft(''); }}
              >add</button>
            </div>
          </div>
        ) : (
          <button type="button" className="av-card av-card--add" onClick={() => setAdding(true)}>
            <span className="av-card__plus">+</span>
            <span className="av-card__add-label">add avatar</span>
          </button>
        )}
      </div>

      {/* Expanded editor for the open card - rendered below the grid
          so it has room to breathe at full width. */}
      {openId && avatars.find((a) => a.id === openId) && (
        <div className="av-expanded">
          <AvatarEditor
            avatar={avatars.find((a) => a.id === openId)!}
            color={color}
            onDelete={() => { del.mutate(openId); setOpenId(null); }}
          />
        </div>
      )}

      <style>{AV_BANK_CSS}</style>
    </div>
  );
}

// Exported so other pages that reuse the .av-card grid (e.g. the
// Content page's bottom avatar toggle) can re-inject these styles
// without depending on the Offer page being mounted.
export const AV_BANK_CSS = `
.av-bank { display: flex; flex-direction: column; gap: var(--space-4); }
.av-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}
.av-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--text);
  font: inherit;
  position: relative;
}
.av-card:hover {
  background: rgba(255,255,255,0.04);
  border-color: color-mix(in srgb, var(--av-card-accent, var(--strain)) 35%, var(--hairline));
}
.av-card--open {
  /* No background tint - the border-color alone marks the active card.
     The earlier accent-tinted bg read as a "haze" against the dark UI. */
  border-color: var(--av-card-accent, var(--strain));
}
.av-card__img {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--hairline);
  display: flex;
  align-items: center;
  justify-content: center;
}
.av-card__img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.av-card__img--empty { border-style: dashed; }
.av-card__img-empty-label {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-2);
  text-align: center;
  padding: 4px;
  line-height: 1.2;
}
.av-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.av-card__name {
  font-family: 'Fraunces', serif;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.15;
  color: var(--text);
}
.av-card__desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.av-card__caret {
  align-self: flex-start;
  font-size: 18px;
  color: var(--muted-2);
  flex-shrink: 0;
}
.av-card--add,
.av-card--adding {
  cursor: pointer;
  border-style: dashed;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  color: var(--muted);
  flex-direction: column;
  text-align: center;
}
.av-card--adding { cursor: default; padding: var(--space-3); }
.av-card--add:hover { color: var(--av-card-accent, var(--strain)); }
.av-card__plus { font-size: 28px; line-height: 1; font-weight: 200; }
.av-card__add-label { font-size: var(--body-sm); letter-spacing: 0.02em; }
.av-expanded {
  /* Same "no haze" treatment as .av-card--open: border alone defines
     the container, no accent-tinted background washing over the editor. */
  border: 1px solid var(--av-card-accent, var(--strain));
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}
`;

// ─── Editable expansion for a single avatar ───────────────────────────────
// Every field is an always-visible large textarea controlled directly off
// the prop. Edits debounce-save via PATCH (450ms after last keystroke) so
// the creator sees what she has and can edit it in place without a click-to-edit
// dance. Demographics is intentionally NOT rendered - the creator doesn't want
// avatars driven by demo. Profile image sits at the top with a generate
// button that calls Gemini (nano banana) and saves the PNG.
function AvatarEditor({
  avatar,
  onDelete,
}: {
  avatar: OfferAvatar;
  color: string;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (body: Partial<OfferAvatar>) => api.updateOfferAvatar(avatar.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  const generateImage = useMutation({
    mutationFn: () => api.generateAvatarImage(avatar.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  // Upload-your-own-image: opens a native file picker, posts the file
  // to /upload-image, server saves it next to the AI-generated ones.
  const uploadImage = useMutation({
    mutationFn: (file: File) => api.uploadAvatarImage(avatar.id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  // Remove-image: PATCH image_path to null. The image file itself
  // stays on disk (so timestamped history is preserved) but the avatar
  // no longer references it.
  const removeImage = useMutation({
    mutationFn: () => api.updateOfferAvatar(avatar.id, { image_path: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  });
  // Hidden file input for the upload flow.
  const fileInputRef = useState<{ el: HTMLInputElement | null }>({ el: null })[0];
  const synthesise = useMutation({
    mutationFn: () => api.synthesiseAvatar(avatar.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['audience-quotes-avatar', avatar.id] });
    },
  });

  // Debounced save helper. Every editable field stores its draft locally
  // and pushes the patch ~450ms after the last keystroke. Prevents a
  // PATCH per character without losing in-flight edits when the creator pauses.
  function useDebouncedField(initial: string, key: keyof OfferAvatar) {
    const [draft, setDraft] = useState(initial);
    useEffect(() => { setDraft(initial); }, [initial]);
    useEffect(() => {
      if (draft === (initial ?? '')) return;
      const t = setTimeout(() => {
        update.mutate({ [key]: draft || null } as Partial<OfferAvatar>);
      }, 450);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft]);
    return [draft, setDraft] as const;
  }

  const [name, setName] = useDebouncedField(avatar.name ?? '', 'name');
  const [oneLine, setOneLine] = useDebouncedField(avatar.one_line ?? '', 'one_line');
  const [before, setBefore] = useDebouncedField(avatar.before_state ?? '', 'before_state');
  const [after, setAfter] = useDebouncedField(avatar.after_state ?? '', 'after_state');

  const imageUrl = avatar.image_path
    ? `/api/vault-asset/${encodeURI(avatar.image_path)}`
    : null;

  return (
    <div className="off-row__body off-row__body--editor">
      {/* Top strip: image on the left, name + generate button stacked
          to the right. No descriptive text - the button is self-explanatory. */}
      <div className="av-top">
        <div className={`av-image ${imageUrl ? '' : 'av-image--empty'}`}>
          {imageUrl ? (
            <img src={imageUrl} alt={`${avatar.name ?? 'avatar'} portrait`} />
          ) : (
            <span className="av-image__placeholder">no image yet</span>
          )}
        </div>
        <div className="av-top__right">
          <input
            type="text"
            className="av-name"
            value={name}
            placeholder="the-avatar"
            onChange={(e) => setName(e.target.value)}
            aria-label="avatar name"
          />
          {/* Three image actions in one row. Generate uses Gemini /
              nano banana; Upload accepts a local file (e.g. a real photo);
              Remove clears the avatar's image reference. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="off-btn off-btn--primary av-gen-btn"
              onClick={() => generateImage.mutate()}
              disabled={generateImage.isPending || uploadImage.isPending}
            >
              {generateImage.isPending
                ? 'generating…'
                : imageUrl
                ? 'regenerate image'
                : 'auto-generate image'}
            </button>
            <button
              type="button"
              className="off-btn off-btn--ghost"
              onClick={() => fileInputRef.el?.click()}
              disabled={generateImage.isPending || uploadImage.isPending}
            >
              {uploadImage.isPending ? 'uploading…' : '↑ upload your own'}
            </button>
            {imageUrl && (
              <button
                type="button"
                className="off-btn off-btn--danger-ghost"
                onClick={() => { if (confirm('remove this image?')) removeImage.mutate(); }}
                disabled={removeImage.isPending}
                title="clear this avatar's image (the file stays on disk)"
              >
                × remove image
              </button>
            )}
            {/* Hidden file input - native picker for the upload flow. */}
            <input
              ref={(el) => { fileInputRef.el = el; }}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage.mutate(f);
                e.target.value = '';
              }}
            />
          </div>
          {generateImage.isError && (
            <p style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)', margin: 0 }}>
              generate failed: {(generateImage.error as Error).message}
            </p>
          )}
          {uploadImage.isError && (
            <p style={{ color: '#ff6b6b', fontSize: 'var(--body-sm)', margin: 0 }}>
              upload failed: {(uploadImage.error as Error).message}
            </p>
          )}
        </div>
      </div>

      <AvField
        label="who they are"
        value={oneLine}
        placeholder="one or two sentences on who this person is. e.g. an experienced freelancer with 14 years on Fiverr who wants to move from client work into teaching."
        onChange={setOneLine}
        large
      />

      {/* Before and after are now full-width, stacked. The red/green dot
          treatment stays so the semantic is unmissable. */}
      <AvSideAlways
        label="before"
        dotColor="#ff6b6b"
        value={before}
        placeholder="the treadmill. the stuck place. the recurring frustration she lives in right now."
        onChange={setBefore}
      />
      <AvSideAlways
        label="after"
        dotColor="var(--recovery)"
        value={after}
        placeholder="the lifestyle. the cadence. the day-to-day after working with you."
        onChange={setAfter}
      />

      {/* Struggles and Desires section header + the "generate from quotes"
          button. Matches the look of the "regenerate image" button at the
          top of the avatar editor - same classes, same accent. Extra top
          and bottom margins so the section breathes from the fields above
          and the bullet lists below. */}
      <div
        className="stack"
        style={{
          gap: 8,
          marginTop: 'var(--space-5)',
          marginBottom: 'var(--space-3)',
          paddingTop: 'var(--space-3)',
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1.15rem',
            letterSpacing: '-0.01em',
          }}
        >
          Struggles and Desires
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--body-sm)',
            color: 'var(--muted)',
            lineHeight: 1.5,
            maxWidth: '64ch',
          }}
        >
          punchy bullets in her own voice - what she's stuck on and what she wants. add audience quotes from your transcripts and click <em>generate from quotes</em> to rewrite these. verbatim quotes show as references below.
        </p>
        <button
          type="button"
          className="off-btn off-btn--primary av-gen-btn"
          onClick={() => {
            if (confirm('rewrite this avatar\'s before/after/struggles/desires bullets from the attached audience quotes? existing bullets will be replaced.')) {
              synthesise.mutate();
            }
          }}
          disabled={synthesise.isPending}
        >
          {synthesise.isPending ? 'generating…' : 'generate from quotes'}
        </button>
        {synthesise.isError && (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)', margin: 0 }}>
            {(synthesise.error as Error)?.message}
          </p>
        )}
      </div>

      {/* Struggles + outcomes rendered as brag-bank-style row lists -
          each bullet collapses, expands to edit, "+ add" at the bottom. */}
      <AvBragList
        label="what they struggle with (in their own words)"
        accent="#ff6b6b"
        items={avatar.struggles ?? []}
        onChange={(items) => update.mutate({ struggles: items })}
        placeholder="e.g. AI will destroy the illustration market before I can build something else"
      />
      <AvBragList
        label="what they want (in their own words)"
        accent="var(--recovery)"
        items={avatar.outcomes ?? []}
        onChange={(items) => update.mutate({ outcomes: items })}
        placeholder="e.g. deep conversations with the few people who are really engaged - these energise me immediately"
      />

      {/* Audience-quote references pulled from transcripts. Title (the
          summary headline) on top, verbatim quote below in small muted text. */}
      <AvatarAudienceQuotes avatarId={avatar.id} />

      {avatar.source_file && (
        <p className="muted" style={{ fontSize: 11, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace' }}>
          source: {avatar.source_file}
        </p>
      )}

      <div className="off-actions" style={{ marginTop: 'var(--space-3)' }}>
        <button
          type="button"
          className="off-btn off-btn--danger-ghost"
          onClick={() => { if (confirm(`delete avatar "${avatar.name}"?`)) onDelete(); }}
        >delete avatar</button>
      </div>

      <style>{AV_EDITOR_CSS}</style>
    </div>
  );
}

// Always-visible large textarea (or single-line input for short fields).
function AvField({
  label,
  value,
  placeholder,
  onChange,
  large,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  large?: boolean;
}) {
  // Accurate row count: count the actual line breaks AND wrap. This makes the
  // before/after textareas show all the text without scrolling. Real wrap
  // accuracy comes from `field-sizing: content` in CSS - this rows attr is
  // just the floor for browsers that don't support that.
  const lineBreaks = (value.match(/\n/g)?.length ?? 0) + 1;
  const wrapEstimate = Math.ceil((value.length || 80) / 70);
  const rows = large ? Math.max(3, lineBreaks, wrapEstimate) : Math.max(2, lineBreaks);
  return (
    <div className="av-field">
      <span className="av-field__label">{label}</span>
      {large || value.length > 60 ? (
        <textarea
          className="av-textarea"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
        />
      ) : (
        <input
          type="text"
          className="av-textarea"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ minHeight: 0 }}
        />
      )}
    </div>
  );
}

function AvSideAlways({
  label,
  dotColor,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  dotColor: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="av-side">
      <div className="av-side__head">
        <span className="av-side__dot" style={{ background: dotColor }} />
        <span className="av-side__label">{label}</span>
      </div>
      <textarea
        className="av-textarea"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(
          3,
          (value.match(/\n/g)?.length ?? 0) + 1,
          Math.ceil((value.length || 80) / 70),
        )}
      />
    </div>
  );
}

// AvBlock and AvSide (the previous click-to-edit components) were dropped
// in favour of always-visible AvField + AvSideAlways above. Keeping this
// note as a breadcrumb in case anyone wonders why those helpers vanished.

// Brag-bank-style list of strings. Mirrors the WinRow look on the
// Reputation page: each item is a • bulleted row, click to expand and
// edit, accent border on the left, "+ add" at the bottom. Used for
// Reference list of audience quotes attached to this avatar, grouped by
// category (struggle / desire / win). Renders the summary headline (title)
// as the main heading, the verbatim quote below in smaller faded text.
function AvatarAudienceQuotes({ avatarId }: { avatarId: string }) {
  const { data } = useQuery({
    queryKey: ['audience-quotes-avatar', avatarId],
    queryFn: () => api.listAudienceQuotes({ avatar_id: avatarId }),
  });
  const quotes = (data?.quotes ?? []).filter((q) => q.status !== 'dismissed');
  if (quotes.length === 0) return null;

  const groups: { key: 'struggle' | 'desire' | 'win'; label: string; color: string }[] = [
    { key: 'struggle', label: 'struggles · from transcripts', color: '#ff6b6b' },
    { key: 'desire', label: 'desires · from transcripts', color: 'var(--recovery)' },
    { key: 'win', label: 'wins · from transcripts', color: 'var(--hrv)' },
  ];

  return (
    <div className="stack" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
      {groups.map(({ key, label, color }) => {
        const items = quotes.filter((q) => q.category === key);
        if (items.length === 0) return null;
        return (
          <section key={key} className="stack" style={{ gap: 'var(--space-2)' }}>
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderBottom: `1px solid color-mix(in srgb, ${color} 25%, var(--hairline))`,
                paddingBottom: 4,
              }}
            >
              <span
                style={{
                  color,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  fontSize: 10,
                }}
              >
                {label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted-2)' }}>{items.length}</span>
            </header>
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              {items.map((q) => (
                <article
                  key={q.id}
                  style={{
                    padding: 'var(--space-3)',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--hairline)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: '1.05rem',
                      lineHeight: 1.35,
                      letterSpacing: '-0.01em',
                      color: 'var(--ink)',
                    }}
                  >
                    {q.title || <span style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>untitled - open the transcript to write a headline</span>}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: 'var(--muted)',
                      fontStyle: 'italic',
                      lineHeight: 1.5,
                      opacity: 0.75,
                    }}
                  >
                    "{q.text}"
                  </p>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--muted-2)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      fontWeight: 600,
                    }}
                  >
                    {q.speaker_label}
                    {q.timestamp && <span style={{ marginLeft: 6 }}>{q.timestamp}</span>}
                    {q.source_transcript_filename && (
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>
                        · {q.source_transcript_filename.replace(/\.(md|txt)$/, '')}
                      </span>
                    )}
                  </span>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// struggles and outcomes - replaces the old chip-array UI which the creator
// felt looked too tag-like.
function AvBragList({
  label,
  accent,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  accent: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  function update(i: number, text: string) {
    const next = [...items];
    next[i] = text;
    onChange(next);
  }
  function remove(i: number) {
    onChange(items.filter((_, j) => j !== i));
    if (openIdx === i) setOpenIdx(null);
  }
  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
    setAdding(false);
  }

  return (
    <div className="av-brag" style={{ ['--av-accent' as any]: accent }}>
      <span className="av-field__label">{label}</span>
      <div className="av-brag__list">
        {items.length === 0 && !adding && (
          <p className="av-brag__empty muted">
            nothing yet. click "+ add" to capture how they actually phrase this.
          </p>
        )}
        {items.map((text, i) => (
          <BragRow
            key={i}
            text={text}
            open={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? null : i)}
            onSave={(v) => update(i, v)}
            onDelete={() => remove(i)}
          />
        ))}
        {adding ? (
          <div className="av-brag__row av-brag__row--editing">
            <textarea
              autoFocus
              className="av-textarea"
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(2, Math.ceil((draft.length || 60) / 80))}
            />
            <div className="av-brag__actions">
              <button
                type="button"
                className="off-btn off-btn--ghost"
                onClick={() => { setAdding(false); setDraft(''); }}
              >cancel</button>
              <button
                type="button"
                className="off-btn off-btn--primary"
                disabled={!draft.trim()}
                onClick={add}
              >add</button>
            </div>
          </div>
        ) : (
          <button type="button" className="av-brag__add" onClick={() => setAdding(true)}>
            + add
          </button>
        )}
      </div>
    </div>
  );
}

function BragRow({
  text,
  open,
  onToggle,
  onSave,
  onDelete,
}: {
  text: string;
  open: boolean;
  onToggle: () => void;
  onSave: (v: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);
  function commit() {
    if (draft.trim() && draft !== text) onSave(draft.trim());
  }
  return (
    <div className={`av-brag__row ${open ? 'av-brag__row--open' : ''}`}>
      <button type="button" className="av-brag__head" onClick={onToggle}>
        <span className="av-brag__bullet">•</span>
        <span className="av-brag__text">{text || '(empty - click to edit)'}</span>
        <span className="av-brag__caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="av-brag__body">
          <textarea
            className="av-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            rows={Math.max(2, Math.ceil((draft.length || 60) / 80))}
          />
          <div className="av-brag__actions">
            <button
              type="button"
              className="off-btn off-btn--danger-ghost"
              onClick={() => { if (confirm('delete this line?')) onDelete(); }}
            >delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

// AvTags (chip array for struggles/outcomes) was replaced by AvBragList
// above - the creator preferred the brag-bank row treatment over the tag chips.

const AV_EDITOR_CSS = `
.off-row__fill-hint {
  margin-left: auto;
  margin-right: var(--space-2);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--muted-2);
  font-variant-numeric: tabular-nums;
}
.off-row__body--editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.av-field { display: flex; flex-direction: column; gap: 6px; }
.av-field__label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
/* Top strip: image + name + generate button. Image on the left,
   name and button stacked on the right. */
.av-top {
  display: flex;
  gap: var(--space-4);
  align-items: flex-start;
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--space-2);
}
.av-top__right {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  justify-content: center;
  align-self: stretch;
}
.av-name {
  font-family: 'Fraunces', serif;
  font-size: var(--display-sm, 28px);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.15;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 4px 8px;
  color: var(--text);
  width: 100%;
}
.av-name:hover { border-color: var(--hairline); background: rgba(255,255,255,0.02); }
.av-name:focus { outline: none; border-color: var(--strain); background: rgba(255,255,255,0.04); }
.av-gen-btn { align-self: flex-start; }
/* AvatarEditor header image. Sized to feel proportional to the card
   thumbnails it sits below (72×72) - 96px is a touch larger so the
   editor's image reads as "the active one" without dominating. Was
   140px back when the editor was the standalone panel content. */
.av-image {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--hairline);
  display: flex;
  align-items: center;
  justify-content: center;
}
.av-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
.av-image--empty { border-style: dashed; }
.av-image__placeholder {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted-2);
  text-align: center;
  padding: var(--space-2);
}

/* Brag-bank-style list (matches WinRow on Reputation page). */
.av-brag { display: flex; flex-direction: column; gap: var(--space-2); }
.av-brag__list { display: flex; flex-direction: column; gap: 6px; }
.av-brag__empty { margin: 0; font-size: var(--body-sm); font-style: italic; padding: var(--space-2) 0; }
.av-brag__row {
  border: 1px solid var(--hairline);
  border-left: 3px solid color-mix(in srgb, var(--av-accent) 60%, transparent);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
}
.av-brag__row--open { background: rgba(255,255,255,0.04); }
.av-brag__row--editing {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.av-brag__head {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: transparent;
  border: 0;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  font: inherit;
}
.av-brag__head:hover { background: rgba(255,255,255,0.02); }
.av-brag__bullet {
  color: var(--av-accent);
  font-weight: 700;
  line-height: 1.5;
  flex-shrink: 0;
}
.av-brag__text {
  flex: 1;
  line-height: 1.5;
  font-size: var(--body);
  word-break: break-word;
}
.av-brag__caret {
  color: var(--muted-2);
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1.5;
}
.av-brag__body {
  padding: 0 12px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.av-brag__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
.av-brag__add {
  align-self: flex-start;
  background: transparent;
  border: 1px dashed var(--hairline);
  color: var(--muted);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--body-sm);
  letter-spacing: 0.02em;
  transition: all 0.15s;
}
.av-brag__add:hover { border-color: var(--av-accent); color: var(--av-accent); background: color-mix(in srgb, var(--av-accent) 6%, transparent); }

.av-textarea {
  width: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.04);
  color: var(--ink);
  font-family: inherit;
  font-size: var(--body);
  line-height: 1.55;
  resize: none;
  /* Auto-grow with content (Chrome 123+, Firefox 124+). Falls back to the
     row-based JS calc in AvField/AvSideAlways for older browsers. */
  field-sizing: content;
  min-height: 60px;
  outline: none;
  overflow: hidden;
}
.av-textarea:focus {
  border-color: var(--recovery);
  background: rgba(255,255,255,0.06);
  /* On focus, allow scrolling fallback while typing very long content. */
  overflow: auto;
}
.av-actions { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-2); }
.off-row__pair {
  display: grid;
  grid-template-columns: 1fr 28px 1fr;
  gap: var(--space-3);
  align-items: stretch;
}
.off-row__arrow { align-self: center; color: var(--muted); font-size: 1.2rem; text-align: center; opacity: 0.55; }
@media (max-width: 640px) {
  .off-row__pair { grid-template-columns: 1fr; }
  .off-row__arrow { transform: rotate(90deg); }
}
.av-side {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.av-side__head { display: flex; align-items: center; gap: 6px; }
.av-side__dot { width: 6px; height: 6px; border-radius: 50%; }
.av-side__label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--muted);
}
.off-row__tagcols { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
@media (max-width: 640px) { .off-row__tagcols { grid-template-columns: 1fr; } }
.av-tagcol { display: flex; flex-direction: column; gap: 6px; }
.av-tagrow { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.av-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
}
.av-chip__x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.55;
}
.av-chip__x:hover { opacity: 1; }
.av-chip-input {
  background: transparent;
  border: 1px dashed var(--hairline);
  color: var(--ink);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-family: inherit;
  width: 110px;
  outline: none;
}
.av-chip-input:focus { background: rgba(255,255,255,0.04); }
`;

// Keep the OfferResponse type referenced so it isn't tree-shaken from the import.
const _T: OfferResponse | null = null;
void _T;

// Components removed from the active render in Phase 1 but kept in source
// for Phase 2 when per-offer detail view is built out:
//   ScoreHero, OfferStrengthPanel, SectionsGrid
// Reference them here so TS doesn't error on unused declarations.
void ScoreHero;
void OfferStrengthPanel;
void SectionsGrid;
void SuiteBlock;
void OfferProfileCard;
// Kept for potential reuse in the Claude-analysis step.
void pricingCompleteness;
void contentCompleteness;

// =========================================================================
// PROOF section: The Promise + pinned proof picked from the reputation banks
// =========================================================================
function ProofPromiseBlock({ color }: { color: string }) {
  const { data } = useQuery({ queryKey: ['reputation'], queryFn: api.reputation });
  const auth = data?.dimensions.find((d) => d.id === 'authority');
  if (!auth) return null;
  const wins = auth.wins_bank ?? [];
  const bank = auth.proof_bank ?? [];
  const pinnedSet = new Set(auth.pinned_proof_ids ?? []);
  const pinnedWins = wins.filter((w) => pinnedSet.has(w.id));
  const pinnedBank = bank.filter((b) => pinnedSet.has(b.id));
  // Hide pinned items from the source lists below - they live at the top now.
  // the creator unpins from there to move them back into the pickable lists.
  const ownWins = wins.filter((w) => w.kind === 'own' && w.status === 'confirmed' && !pinnedSet.has(w.id));
  const customerWins = wins.filter((w) => (w.kind === 'student' || w.kind === 'client') && w.status === 'confirmed' && !pinnedSet.has(w.id));
  const unpinnedBank = bank.filter((e) => !pinnedSet.has(e.id));

  return (
    <>
      <ProofPromiseEditor promise={auth.promise ?? ''} color={color} />

      <Section
        title="selected proof for this promise"
        subtitle="the specific wins and authority moments that demonstrate the promise above is possible. pin items from the lists below."
      >
        {pinnedWins.length === 0 && pinnedBank.length === 0 ? (
          <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>
            nothing pinned yet. click pin on a brag, customer win, or authority bank entry below.
          </p>
        ) : (
          <div className="off-stack">
            {pinnedWins.map((w) => (
              <PinnedProofItem
                key={`w-${w.id}`}
                id={w.id}
                title={w.title}
                body={w.body ?? null}
                meta={w.kind === 'own' ? 'own win' : w.kind === 'student' ? 'student win' : 'client win'}
                color={color}
              />
            ))}
            {pinnedBank.map((e) => (
              <PinnedProofItem
                key={`b-${e.id}`}
                id={e.id}
                title={e.title}
                body={e.text}
                meta="authority bank"
                color={color}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="brag bank"
        subtitle="your own evidence. pin the ones that back the promise above."
      >
        <PickableWinList wins={ownWins} pinnedSet={pinnedSet} color={color} emptyHint="no brag entries yet. add wins on the reputation page." />
      </Section>

      <Section
        title="customer + client wins"
        subtitle="results others got. pin the ones that prove the promise is replicable."
      >
        <PickableWinList wins={customerWins} pinnedSet={pinnedSet} color={color} emptyHint="no customer wins yet. add them on the reputation page." />
      </Section>

      <Section
        title="authority bank"
        subtitle="verbatim proof moments approved from your transcripts."
      >
        {unpinnedBank.length === 0 ? (
          <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>
            {bank.length === 0
              ? "approve a quote tagged 'authority' on the vault page to bank one here."
              : 'all authority bank entries are pinned above. unpin one to bring it back here.'}
          </p>
        ) : (
          <div className="off-stack">
            {unpinnedBank.map((e) => (
              <PickableBankItem key={e.id} entry={e} pinned={false} color={color} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function ProofPromiseEditor({ promise, color }: { promise: string; color: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(promise);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(promise); }, [promise, editing]);
  const save = useMutation({
    mutationFn: (text: string) => api.setReputationSlot('promise_text', text || null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  function commit() {
    setEditing(false);
    if (draft.trim() !== (promise ?? '').trim()) save.mutate(draft.trim());
  }
  return (
    <section
      style={{
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--hairline))`,
        background: `color-mix(in srgb, ${color} 4%, transparent)`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <div>
        <span className="off-eyebrow" style={{ color }}>the promise</span>
        <p className="off-section__sub" style={{ marginTop: 4, maxWidth: '64ch' }}>
          one sentence. very specific: what this offer helps people do, and in what time frame. the proof you pick below has to demonstrate this is possible.
        </p>
      </div>
      {editing ? (
        <>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setEditing(false); setDraft(promise); }
            }}
            placeholder="e.g. get your first 10 paying members of your Skool community in 30 days without paid ads."
            rows={2}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--ink)',
              padding: 'var(--space-3)',
              fontSize: '1.15rem',
              lineHeight: 1.4,
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              outline: 'none',
              resize: 'vertical',
            }}
          />
          <span className="off-section__sub" style={{ fontSize: 11 }}>enter to save, esc to cancel</span>
        </>
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{ cursor: 'pointer', padding: 'var(--space-3)', border: '1px dashed transparent', borderRadius: 'var(--radius-md)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--hairline)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}
        >
          {promise ? (
            <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3, color: 'var(--ink)' }}>
              {promise}
            </p>
          ) : (
            <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>
              click to write the promise. one sentence, specific outcome, specific timeframe.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PinnedProofItem({
  id,
  title,
  body,
  meta,
  // color kept in the signature for API stability; visual now uses the
  // recovery green so pinned items read as "approved / selected".
}: {
  id: string;
  title: string | null;
  body: string | null;
  meta: string;
  color: string;
}) {
  const qc = useQueryClient();
  const unpin = useMutation({
    mutationFn: () => api.toggleProofPin(id, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  const GREEN = 'var(--recovery)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        border: `1px solid ${GREEN}`,
        borderRadius: 'var(--radius-md)',
        background: `color-mix(in srgb, ${GREEN} 6%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${GREEN} 18%, transparent)`,
      }}
    >
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--muted)', fontWeight: 700, minWidth: 90, marginTop: 4 }}>
        {meta}
      </span>
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        {title && <span style={{ fontWeight: 600 }}>{title}</span>}
        {body && <p className="off-section__sub" style={{ margin: 0, lineHeight: 1.5 }}>{body}</p>}
      </div>
      <button
        type="button"
        onClick={() => unpin.mutate()}
        disabled={unpin.isPending}
        title="unpin from promise"
        className="off-btn off-btn--ghost"
        style={{ fontSize: 11, padding: '2px 10px' }}
      >
        unpin
      </button>
    </div>
  );
}

function PickableWinList({
  wins,
  pinnedSet,
  color,
  emptyHint,
}: {
  wins: OfferReputationWin[];
  pinnedSet: Set<string>;
  color: string;
  emptyHint: string;
}) {
  if (wins.length === 0) {
    return <p className="off-section__sub" style={{ margin: 0, fontStyle: 'italic' }}>{emptyHint}</p>;
  }
  return (
    <div className="off-stack">
      {wins.map((w) => (
        <PickableWinItem key={w.id} win={w} pinned={pinnedSet.has(w.id)} color={color} />
      ))}
    </div>
  );
}

// Local alias to avoid importing the full ReputationWin from api.ts at the top.
type OfferReputationWin = {
  id: string;
  title: string;
  body?: string | null;
  kind: 'own' | 'student' | 'client';
  status: 'candidate' | 'confirmed' | 'rejected';
};

function PickableWinItem({ win, pinned, color }: { win: OfferReputationWin; pinned: boolean; color: string }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.toggleProofPin(win.id, !pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        borderBottom: '1px solid var(--hairline)',
        background: pinned ? `color-mix(in srgb, ${color} 4%, transparent)` : 'transparent',
      }}
    >
      <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{win.title}</span>
        {win.body && <p className="off-section__sub" style={{ margin: 0, lineHeight: 1.5 }}>{win.body}</p>}
      </div>
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        title={pinned ? 'unpin from promise' : 'pin as proof for the promise'}
        style={{
          background: pinned ? color : 'transparent',
          color: pinned ? 'var(--bg)' : color,
          border: `1px solid ${color}`,
          borderRadius: 'var(--radius-pill)',
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          alignSelf: 'center',
        }}
      >
        {pinned ? '★ pinned' : '☆ pin'}
      </button>
    </div>
  );
}

type OfferBankEntry = {
  id: string;
  title: string | null;
  text: string;
  context: string | null;
  source_transcript: string | null;
  source_timestamp: string | null;
};

function PickableBankItem({ entry, pinned, color }: { entry: OfferBankEntry; pinned: boolean; color: string }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api.toggleProofPin(entry.id, !pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reputation'] }),
  });
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        border: pinned ? `1px solid ${color}` : '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        background: pinned ? `color-mix(in srgb, ${color} 5%, transparent)` : 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          {entry.title && (
            <h5 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem', color }}>
              {entry.title}
            </h5>
          )}
          <p style={{ margin: 0, fontSize: 'var(--body)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.text}</p>
          {entry.context && (
            <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, fontStyle: 'italic' }}>{entry.context}</p>
          )}
          {entry.source_transcript && (
            <span style={{ fontSize: 10, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
              source: {entry.source_transcript.replace(/\.(md|txt)$/, '')}
              {entry.source_timestamp ? ` @ ${entry.source_timestamp}` : ''}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          title={pinned ? 'unpin from promise' : 'pin as proof for the promise'}
          style={{
            background: pinned ? color : 'transparent',
            color: pinned ? 'var(--bg)' : color,
            border: `1px solid ${color}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}
        >
          {pinned ? '★ pinned' : '☆ pin'}
        </button>
      </div>
    </div>
  );
}

// Exported so other pages (e.g. ProfileOverview, which now hosts the
// Avatars + Offer Suite SectionDimCards + SectionPanel) can re-inject
// these styles. Without that, the .off-secdim / .off-section / .off-panel
// rules are missing on those pages and you get unstyled raw HTML below
// the cards.
export const OFF_CSS = `
.off { display: flex; flex-direction: column; gap: var(--space-5); }

.off-eyebrow {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.off-eyebrow--accent { color: var(--recovery); }

.off-hero {
  padding: var(--space-5);
  background: linear-gradient(180deg, color-mix(in srgb, var(--recovery) 6%, transparent), var(--surface));
  border: 1px solid color-mix(in srgb, var(--recovery) 18%, transparent);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.off-hero__top { display: grid; grid-template-columns: minmax(0, 180px) 1fr; gap: var(--space-5); align-items: center; }
.off-hero__ring { display: flex; justify-content: center; }
.off-hero__copy { display: flex; flex-direction: column; gap: var(--space-2); }
.off-hero__title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: clamp(1.3rem, 2.2vw, 1.65rem); letter-spacing: -0.025em; }
.off-hero__framing { margin: 0; font-size: var(--body); line-height: 1.55; color: var(--muted); max-width: 64ch; }
@media (max-width: 640px) {
  .off-hero__top { grid-template-columns: 140px 1fr; gap: var(--space-4); }
}

.off-stages { display: flex; gap: var(--space-2); flex-wrap: wrap; padding-top: var(--space-3); border-top: 1px solid var(--hairline); }
.off-stage {
  background: none;
  border: 1px solid var(--hairline);
  color: var(--muted);
  padding: 5px 14px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  text-transform: capitalize;
}
.off-stage--active { background: var(--recovery); color: var(--bg); border-color: var(--recovery); }

.off-card {
  padding: var(--space-5);
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.off-card__head { display: flex; justify-content: space-between; align-items: baseline; }

.off-inline { border-radius: var(--radius-md); transition: background 0.15s; }
.off-inline--view, .off-inline--empty { padding: var(--space-2); cursor: text; border: 1px solid transparent; }
.off-inline--view:hover, .off-inline--empty:hover { background: rgba(255,255,255,0.03); border-color: var(--hairline); }
.off-inline--editing { display: flex; flex-direction: column; gap: var(--space-2); }
.off-inline__value { margin: 0; line-height: 1.55; font-size: var(--body); white-space: pre-wrap; }
.off-inline__value--lg { font-size: var(--body-lg); font-weight: 500; letter-spacing: -0.005em; }
.off-inline__placeholder { margin: 0; line-height: 1.55; font-size: var(--body-sm); color: var(--muted-2); font-style: italic; }

.off-textarea {
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
  min-height: 80px;
  outline: none;
}
.off-textarea:focus { border-color: var(--recovery); background: rgba(255,255,255,0.06); }
.off-textarea--large { min-height: 120px; }
.off-text-input {
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
.off-text-input:focus { border-color: var(--recovery); }

.off-btn { padding: 6px 14px; border-radius: var(--radius-md); border: 1px solid transparent; font-family: inherit; font-size: var(--body-sm); font-weight: 600; cursor: pointer; }
.off-btn--primary { background: #EDEDE9; color: #16140F; border: 1.5px solid #16140F; box-shadow: 0 1px 3px rgba(15,15,15,0.06), 0 4px 12px -2px rgba(15,15,15,0.07); }
.off-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.off-btn--ghost { background: transparent; color: var(--muted); border-color: var(--hairline); }
.off-btn--ghost:hover { color: var(--ink); border-color: var(--ink); }
.off-btn--danger-ghost { background: transparent; color: #ff6b6b; border-color: rgba(255,107,107,0.3); }
.off-btn--danger-ghost:hover { background: rgba(255,107,107,0.08); }
.off-actions { display: flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }

/* TOP ROW: offer profile + calculator side-by-side */
.off-top-row {
  display: grid;
  grid-template-columns: 3fr 1fr;
  gap: var(--space-4);
  align-items: stretch;
}
.off-top-row > .off-card { margin: 0; }
@media (max-width: 880px) {
  .off-top-row { grid-template-columns: 1fr; }
}

/* COMPACT CALCULATOR */
.off-calc {
  text-align: left;
  background: linear-gradient(180deg, color-mix(in srgb, var(--recovery) 10%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in srgb, var(--recovery) 26%, var(--hairline));
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  color: inherit;
  font-family: var(--font-mono, ui-monospace, monospace);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: all 0.18s;
}
.off-calc:hover {
  border-color: var(--recovery);
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -16px var(--recovery);
}
.off-calc__ringrow {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) 0;
  border-top: 1px solid color-mix(in srgb, var(--recovery) 20%, var(--hairline));
  border-bottom: 1px solid color-mix(in srgb, var(--recovery) 20%, var(--hairline));
}
.off-calc__ring { transform: scale(0.7); transform-origin: left center; }
.off-calc__numcol { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; }
.off-calc__num {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 2.4rem;
  letter-spacing: -0.04em;
  color: var(--recovery);
}
.off-calc__numsub {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.06em;
  margin-top: 4px;
}
.off-calc__keys {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--body-sm);
  color: var(--muted);
}
.off-calc__keyval { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.off-calc__cta {
  margin-top: var(--space-2);
  text-align: center;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.04);
  font-size: var(--body-sm);
  font-weight: 600;
  color: var(--recovery);
  letter-spacing: 0.04em;
}

/* PANEL: grouped levers inside the unified offer-strength panel */
.off-lever-group {
  padding-top: var(--space-3);
  border-top: 1px solid var(--hairline);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.off-lever-group:first-of-type { padding-top: 0; border-top: none; }
.off-lever-group__head { display: flex; justify-content: space-between; align-items: baseline; }
.off-lever-group__avg { font-size: var(--body-sm); color: var(--muted); }

/* SECTION CARDS - mirror Reputation dimension cards */
.off-sec-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}
@media (max-width: 720px) { .off-sec-grid { grid-template-columns: 1fr; } }
.off-secdim {
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  transition: all 0.18s;
  color: inherit;
  font-family: inherit;
}
.off-secdim:hover {
  border-color: var(--sec-c);
  transform: translateY(-2px);
  box-shadow: 0 10px 28px -16px var(--sec-c);
}
.off-secdim__row { display: grid; grid-template-columns: 76px 1fr; gap: var(--space-4); align-items: center; }
.off-secdim__head { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.off-secdim__def { margin: 0; font-size: var(--body-sm); color: var(--ink); line-height: 1.45; }
.off-secdim__def--empty { color: var(--muted-2); font-style: italic; }
.off-secdim__bar { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.off-secdim__bar-fill { height: 100%; background: var(--sec-c); border-radius: 2px; transition: width 0.3s; }
.off-secdim__meta {
  display: flex;
  justify-content: space-between;
  align-items: center; /* keeps "open →" centered with the left label even if the left wraps */
  gap: var(--space-3);
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* Full-width thin rollup card for the overall offer score, below the grid. */
.off-scorebar {
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  transition: all 0.18s;
  color: inherit;
  font-family: inherit;
}
.off-scorebar:hover {
  border-color: var(--sec-c);
  transform: translateY(-2px);
  box-shadow: 0 10px 28px -16px var(--sec-c);
}
.off-scorebar__mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

.off-panel-wrap {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
  animation: off-fade 0.18s ease-out;
}
@keyframes off-fade { from { opacity: 0; } to { opacity: 1; } }
.off-panel {
  width: min(680px, 100%);
  background: var(--bg);
  border-left: 1px solid var(--lev-c);
  height: 100%;
  overflow-y: auto;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  animation: off-slide 0.22s ease-out;
}
@keyframes off-slide { from { transform: translateX(40px); } to { transform: translateX(0); } }
.off-panel__head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: flex-start; }
.off-panel__head-l { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.off-panel__head-r { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.off-panel__title { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: 1.65rem; letter-spacing: -0.025em; }
.off-panel__sub { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }
.off-panel__score { font-family: var(--font-display); font-size: 2.1rem; font-weight: 700; letter-spacing: -0.04em; color: var(--lev-c); line-height: 1; display: flex; align-items: baseline; gap: 4px; }
.off-panel__score-sub { font-size: 0.9rem; color: var(--muted); font-weight: 500; }

.off-qlist { display: flex; flex-direction: column; gap: var(--space-3); }
.off-q {
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.off-q__text { margin: 0; font-size: var(--body); line-height: 1.55; }
.off-q__rates { display: flex; gap: var(--space-2); }
.off-q__btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid var(--hairline);
  background: transparent;
  color: var(--muted);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--body);
  cursor: pointer;
}
.off-q__btn:hover { color: var(--ink); border-color: var(--ink); }
.off-q__btn--on { color: var(--bg); }

.off-section { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--hairline); }
.off-section:first-of-type { padding-top: 0; border-top: none; }
.off-section__head { display: flex; flex-direction: column; gap: 4px; }
.off-section__title { margin: 0; font-family: var(--font-display); font-weight: 600; font-size: 1.15rem; letter-spacing: -0.015em; }
.off-section__sub { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.5; }

.off-stack { display: flex; flex-direction: column; gap: var(--space-2); }

.off-found {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
}
.off-found--done { border-color: color-mix(in srgb, var(--lev-c) 30%, var(--hairline)); }
.off-found__head {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  font-size: var(--body);
}
.off-found__dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid; flex-shrink: 0; }
.off-found__label { flex: 1; font-weight: 500; }
.off-found__caret { color: var(--muted); font-size: 1.2rem; }
.off-found__body { padding: 0 var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.off-found__prompt { margin: 0; color: var(--muted); font-size: var(--body-sm); line-height: 1.55; font-style: italic; }

.off-row {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
}
.off-row--open { border-color: color-mix(in srgb, var(--lev-c) 30%, var(--hairline)); }
.off-row__head {
  width: 100%;
  background: none;
  border: none;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  font-size: var(--body);
  text-align: left;
}
.off-row__bullet { flex-shrink: 0; }
.off-row__title { flex: 1; font-weight: 500; }
.off-row__pill {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: rgba(255,255,255,0.06);
  color: var(--muted);
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.off-row__caret { color: var(--muted); font-size: 1.2rem; }
.off-row__body { padding: 0 var(--space-4) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.off-row__copy { margin: 0; line-height: 1.55; font-size: var(--body); }
.off-row__copy strong { color: var(--muted); font-weight: 600; font-size: var(--body-sm); text-transform: uppercase; letter-spacing: 0.06em; margin-right: 8px; }

.off-card-inline {
  background: rgba(255,255,255,0.03);
  padding: var(--space-4);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.off-add {
  background: none;
  border: 1px dashed var(--hairline);
  color: var(--muted);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--body-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
}
.off-add:hover { border-color: var(--lev-c); color: var(--ink); }

/* VALIDATION PHASES */
.off-vp-current {
  padding: var(--space-2) var(--space-3);
  border: 1px solid;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--lev-c) 6%, transparent);
  font-size: var(--body-sm);
  font-weight: 600;
  text-transform: lowercase;
  letter-spacing: 0.02em;
}
.off-vp-current strong { font-weight: 700; }

.off-vp {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.off-vp--current { border-color: color-mix(in srgb, var(--lev-c) 35%, var(--hairline)); background: color-mix(in srgb, var(--lev-c) 4%, transparent); }
.off-vp__head {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  display: grid;
  grid-template-columns: 16px 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}
.off-vp__dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid; }
.off-vp__title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.off-vp__label { font-weight: 600; font-size: var(--body); }
.off-vp__desc { color: var(--muted); font-size: var(--body-sm); line-height: 1.4; }
.off-vp__count { font-size: var(--body-sm); font-weight: 600; font-variant-numeric: tabular-nums; }
.off-vp__caret { color: var(--muted); font-size: 1.2rem; }
.off-vp__bar { height: 3px; background: rgba(255,255,255,0.06); border-radius: 0; }
.off-vp__bar-fill { height: 100%; transition: width 0.3s; }
.off-vp__body {
  padding: var(--space-2) var(--space-3) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px dashed var(--hairline);
}

.off-check {
  background: none;
  border: none;
  padding: var(--space-2);
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
  text-align: left;
  border-radius: var(--radius-md);
  transition: background 0.15s;
}
.off-check:hover { background: rgba(255,255,255,0.03); }
.off-check__box {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  margin-top: 2px;
}
.off-check__box--on { color: var(--bg); }
.off-check__copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.off-check__label { font-size: var(--body-sm); line-height: 1.5; color: var(--ink); }
.off-check__hint { font-size: 11px; line-height: 1.45; color: var(--muted); }
.off-check--on .off-check__label { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--muted-2); }

/* PRICING LADDER */
.off-rung {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  overflow: hidden;
  border-left: 3px solid var(--rung-c);
}
.off-rung--current { background: color-mix(in srgb, var(--rung-c) 5%, transparent); border-color: color-mix(in srgb, var(--rung-c) 35%, var(--hairline)); }
.off-rung--target { background: color-mix(in srgb, var(--rung-c) 4%, transparent); border-color: color-mix(in srgb, var(--rung-c) 25%, var(--hairline)); }
.off-rung--achieved { opacity: 0.7; }
.off-rung__head {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}
.off-rung__price {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
  min-width: 70px;
}
.off-rung__status {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,0.06);
  white-space: nowrap;
}
.off-rung__proof-preview {
  color: var(--muted);
  font-size: var(--body-sm);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.off-rung__caret { color: var(--muted); font-size: 1.2rem; }
.off-rung__body {
  padding: 0 var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  border-top: 1px dashed var(--hairline);
  padding-top: var(--space-3);
  margin-top: -1px;
}
.off-rung__label { display: flex; flex-direction: column; gap: 4px; }
.off-rung__label > span {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.off-rung__statuses { display: flex; gap: 6px; flex-wrap: wrap; }
.off-rung__statbtn {
  padding: 4px 12px;
  border: 1px solid;
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

/* CONVERSION RATE check */
.off-conv { display: flex; flex-direction: column; gap: var(--space-3); }
.off-conv__inputrow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  align-items: end;
}
@media (max-width: 640px) { .off-conv__inputrow { grid-template-columns: 1fr; } }
.off-conv__label { display: flex; flex-direction: column; gap: 4px; }
.off-conv__label > span {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 700;
}
.off-conv__inputwrap { position: relative; }
.off-conv__input { padding-right: 32px; font-family: var(--font-display); font-weight: 600; font-size: 1.1rem; }
.off-conv__pct {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-weight: 600;
}
.off-conv__current {
  padding: var(--space-3);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.off-conv__price { font-family: var(--font-display); font-weight: 700; font-size: 1.25rem; letter-spacing: -0.02em; }
.off-conv__verdict {
  padding: var(--space-3) var(--space-4);
  border: 1px solid;
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.off-conv__verdict-chip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  align-self: flex-start;
}
.off-conv__verdict-msg { margin: 0; line-height: 1.55; font-size: var(--body); color: var(--ink); }
.off-conv__band { margin: 0; font-size: var(--body-sm); color: var(--muted); }
`;
