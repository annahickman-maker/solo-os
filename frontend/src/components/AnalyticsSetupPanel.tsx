import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SkillFull } from '../api';
import { solidButtonStyle, ghostButtonStyle, createButtonStyle } from '../lib/ui';

/**
 * AnalyticsSetupPanel - the "set up this skill" step for youtube-analytics.
 *
 * CTR + impressions are exclusive to YouTube Studio (no API exposes them), so
 * before the skill can analyse anything it needs the Studio "Table data.csv"
 * export imported into the dashboard. This panel is that setup: instructions on
 * where to get the CSV, a drop/upload to import it, then "run analysis" which
 * launches the skill. Shown both from the Skills page (Run skill) and the
 * Content page Analytics section (Run analysis) - same flow either way.
 */
export function AnalyticsSetupPanel({
  skill,
  onClose,
  onRun,
}: {
  skill: SkillFull;
  onClose: () => void;
  onRun: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const importCsv = useMutation({
    mutationFn: (csv: string) => api.importYoutubeAnalyticsCsv(csv),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  // Body-scroll lock + Escape-to-close (same pattern as OnboardingLauncher).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [busy, onClose]);

  const result = importCsv.data;
  const imported = importCsv.isSuccess;

  return (
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,10,10,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--bg)', border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-lg)', boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
        }}
      >
        <div>
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>set up this skill</span>
          <h2 className="h2" style={{ marginTop: 4 }}>{skill.title || 'YouTube Analytics'}</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: 'var(--body)', lineHeight: 1.5 }}>
            Click-through rate and impressions live only in YouTube Studio - no API can pull them. Import your Studio export so the analysis has the metrics that matter.
          </p>
        </div>

        {/* Where to get the CSV */}
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--body)' }}>1. Export from YouTube Studio</span>
          <ol className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--body-sm)', lineHeight: 1.6 }}>
            <li>Open YouTube Studio &rarr; Analytics &rarr; Content</li>
            <li>Top-right: Export &rarr; choose <strong>Google Sheets</strong> or <strong>CSV</strong></li>
            <li>From the download, use the <strong>&ldquo;Table data.csv&rdquo;</strong> file</li>
          </ol>
        </div>

        {/* Upload */}
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--body)' }}>2. Import it</span>
          <label
            style={{
              ...createButtonStyle,
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'importing...' : imported ? 'import a different csv' : 'choose Table data.csv'}
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try {
                  await importCsv.mutateAsync(await file.text());
                } catch {
                  /* error surfaced below */
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {importCsv.isError && (
            <span style={{ color: 'var(--danger)', fontSize: 'var(--body-sm)' }}>
              import failed: {(importCsv.error as Error).message}
            </span>
          )}
          {imported && result && (
            <span style={{ color: 'var(--recovery)', fontSize: 'var(--body-sm)' }}>
              ✓ updated {result.updated} video{result.updated === 1 ? '' : 's'}
              {result.unmatched_count > 0 ? ` · ${result.unmatched_count} not matched` : ''}
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <button type="button" onClick={onRun} disabled={busy} style={solidButtonStyle}>
            run analysis
          </button>
          <button type="button" onClick={onClose} disabled={busy} style={ghostButtonStyle}>
            cancel
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--body-sm)' }}>
          already imported recently? you can run the analysis without re-importing.
        </p>
      </div>
    </div>
  );
}
