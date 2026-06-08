const STEPS = [
  { name: 'Positioning', summary: 'Transformation > topic. Personal brand around one specific thing.' },
  { name: 'Offer', summary: 'Offer > product. Validate before you build. Implementation, not info.' },
  { name: 'Content', summary: 'Long-form sales engine. Insight > information. Build with the audience watching.' },
  { name: 'Launch', summary: 'Sequence and stack. Pre-validate the offer. Sell the result first.' },
  { name: 'Scaling', summary: 'Lean systems carry the business. AI in service, not at the wheel.' },
];

export function IpTimeline() {
  return (
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <span className="eyebrow" style={{ color: 'var(--recovery)' }}>core IP</span>
          <h3 className="h3" style={{ marginTop: 4 }}>scattered freelancer to lean two-hour day</h3>
        </div>
        <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>
          5-step method from Solopreneur Systems
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 'var(--space-2)',
        }}
      >
        {STEPS.map((s, i) => (
          <div
            key={s.name}
            style={{
              padding: 'var(--space-3)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              position: 'relative',
            }}
          >
            <span
              style={{
                fontSize: 'var(--eyebrow)',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--muted-2)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              step {i + 1}
            </span>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--body-lg)',
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}>{s.name}</span>
            <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.45 }}>{s.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
