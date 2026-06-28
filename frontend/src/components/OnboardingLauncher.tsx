import { useEffect, useState } from 'react';
import { api, type SkillFull } from '../api';
import { solidButtonStyle, ghostButtonStyle, createButtonStyle } from '../lib/ui';

// The "bring your context" step in front of Personal Brand Strategy. Optional -
// the user can paste YouTube links, a website, and drop documents, or skip and
// just talk it through. Whatever they give gets read first to inform the
// conversation (and draft an initial read of positioning / audience / voice).
//
// onLaunch receives the vault-relative paths of every context file gathered, so
// the caller can seed the onboarding chat with them.
export function OnboardingLauncher({
  skill,
  onClose,
  onLaunch,
}: {
  skill: SkillFull;
  onClose: () => void;
  onLaunch: (contextPaths: string[]) => void;
}) {
  const [youtube, setYoutube] = useState('');
  const [website, setWebsite] = useState('');
  const [docs, setDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [busy, onClose]);

  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

  async function handleDrop(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        try {
          const r = await api.uploadTranscript(f);
          setDocs((d) => [...d, { name: f.name, path: r.rel_path }]);
        } catch {
          /* skip a failed file, keep going */
        }
      }
    } finally {
      setUploading(false);
    }
  }

  async function start() {
    setBusy(true);
    const yt = lines(youtube);
    const sites = lines(website);
    const paths: string[] = docs.map((d) => d.path);
    try {
      if (yt.length || sites.length) {
        setStatus('reading your content...');
        const res = await api.onboardingIngest({ youtube: yt, websites: sites });
        paths.push(...res.paths);
      }
    } catch {
      /* if ingest fails, still launch with whatever docs we have */
    }
    setStatus('');
    setBusy(false);
    onLaunch(paths);
  }

  const hasAnything = lines(youtube).length > 0 || lines(website).length > 0 || docs.length > 0;
  const label = skill.title || skill.name;

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
          <span className="eyebrow" style={{ color: 'var(--muted)' }}>first - the foundation</span>
          <h2 className="h2" style={{ marginTop: 4 }}>{label}</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: 'var(--body)', lineHeight: 1.5 }}>
            Bring anything that already shows who you are and I'll read it before we talk - so we start from a draft, not a blank page.
          </p>
        </div>

        {/* YouTube */}
        <label className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--body)' }}>Your YouTube</span>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>Paste your channel link, or a few video links (one per line).</span>
          <textarea
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder={'https://www.youtube.com/@yourchannel\nhttps://youtu.be/...'}
            rows={3}
            style={textStyle}
          />
        </label>

        {/* Website */}
        <label className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--body)' }}>Your website or about page</span>
          <textarea
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={'https://yoursite.com/about'}
            rows={2}
            style={textStyle}
          />
        </label>

        {/* Documents */}
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 'var(--body)' }}>Documents</span>
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>Drop in a transcript, an about doc, sales pages - anything about you.</span>
          <label style={{ ...createButtonStyle, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: uploading ? 'default' : 'pointer' }}>
            {uploading ? 'uploading...' : '+ add documents'}
            <input
              type="file"
              multiple
              accept=".md,.txt,.vtt,.srt,.pdf,.docx"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={(e) => { handleDrop(e.target.files); e.target.value = ''; }}
            />
          </label>
          {docs.length > 0 && (
            <div className="stack" style={{ gap: 4, marginTop: 2 }}>
              {docs.map((d, i) => (
                <span key={i} className="muted" style={{ fontSize: 'var(--body-sm)' }}>• {d.name}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <button type="button" onClick={start} disabled={busy} style={solidButtonStyle}>
            {busy ? (status || 'starting...') : hasAnything ? 'read these + start' : 'start'}
          </button>
          <button type="button" onClick={() => onLaunch([])} disabled={busy} style={ghostButtonStyle}>
            skip, just talk it through
          </button>
        </div>
      </div>
    </div>
  );
}

const textStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink)',
  padding: '10px 12px',
  fontSize: 'var(--body)',
  resize: 'vertical',
  outline: 'none',
  fontFamily: 'inherit',
  lineHeight: 1.5,
} as const;
