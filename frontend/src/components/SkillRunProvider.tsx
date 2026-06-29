import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type SkillFull, type SkillInput } from '../api';
import { useChat } from './ChatProvider';
import { OnboardingLauncher } from './OnboardingLauncher';
import { AnalyticsSetupPanel } from './AnalyticsSetupPanel';

// Personal Brand Strategy opens the "bring your context" launcher instead of
// the generic input panel.
const ONBOARDING_SKILL = 'solopreneur-onboarding';

// YouTube Analytics opens a "set up this skill" step (import the Studio CSV)
// before running, instead of the generic input panel.
const ANALYTICS_SKILL = 'youtube-analytics';

// Phase 2: the pre-run selection panel. When you Run a skill that declares
// inputs, this opens first - one picker per input, backed by the dashboard's
// own data (transcripts, videos, clients, POVs, idea banks). The choices + the
// skill's output instructions are composed into the run prompt, then handed to
// the full-page chat. Skills with no inputs run instantly.

interface SkillRunCtx {
  runSkill: (id: string) => void;
  // Open a chat that sets up a schedule/trigger for this skill (automate-task).
  scheduleSkill: (id: string) => void;
}
const Ctx = createContext<SkillRunCtx | null>(null);
export function useSkillRun(): SkillRunCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSkillRun must be used inside SkillRunProvider');
  return ctx;
}

type Option = { id: string; label: string; sub?: string; ref: string; category?: string; body?: string; starred?: boolean };

// Compact view-count formatting for Instagram performance (12345 -> "12.3k").
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// Per-type option loaders. Return null for free-text types (no picker).
async function loadOptions(inp: SkillInput): Promise<Option[] | null> {
  try {
    switch (inp.type) {
      case 'transcript': {
        const { items } = await api.archiveTranscripts();
        return [...items]
          .sort((a, b) => (b.date ?? 0) - (a.date ?? 0))
          .map((t) => ({
            id: t.id,
            label: t.title || t.filename.replace(/\.md$/, ''),
            sub: [t.type, t.client || undefined, t.date ? new Date(t.date * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : undefined].filter(Boolean).join(' · '),
            ref: `05_Assets/Transcripts/${t.filename}`,
          }));
      }
      case 'video': {
        const { videos } = await api.pipeline();
        // Videos are pre-existing - no "+ new video" option. To start a fresh
        // idea, the user types into the "Or a video idea" text box instead.
        let list = (videos ?? []) as any[];
        if (inp.scope === 'transcribed') {
          // Description et al: videos you actually have a transcript for (or
          // that are published), most recent first.
          list = list
            .filter((v) => v.has_transcript || v.status === 'published')
            .sort((a, b) => (b.publish_date ?? b.updated_at ?? 0) - (a.publish_date ?? a.updated_at ?? 0));
        } else {
          // Script/Title: drafts only - published videos are already done.
          list = list.filter((v) => v.status !== 'published');
        }
        return list.map((v: any) => ({
          id: v.id,
          label: v.title || v.id,
          sub: v.status,
          body: [v.title, v.goal].filter(Boolean).join('\n\n') || undefined,
          // Pass the project file path so the skill reads the user's actual
          // outline / transcript / existing content - not just the title.
          ref: v.source_file
            ? `the video "${v.title || v.id}" - read its full project file at ${v.source_file} (outline, teaching points, transcript, existing script - whatever's there) and work from THAT, not just the title`
            : `the video "${v.title || v.id}"`,
        }));
      }
      case 'client': {
        const { clients } = await api.clientsList();
        return (clients ?? []).map((c) => ({ id: c.id, label: c.name, sub: c.status, ref: `client "${c.name}"` }));
      }
      case 'pov': {
        const { items } = await api.archivePovs();
        return items.map((p) => ({ id: p.id, label: p.title, sub: p.category, ref: `POV "${p.title}"` }));
      }
      case 'idea': {
        // Pull from three places and group into five readable buckets:
        // POVs / Frameworks / Stories (from the banks) + YouTube drafts (the
        // video queue) + Instagram drafts (the IG queue). Proof is excluded on
        // purpose - it's not an idea you'd build a video from.
        const BANK_CAT: Record<string, string> = { pov: 'POVs', framework: 'Frameworks', story: 'Stories' };
        const [banks, pipe, ig] = await Promise.all([
          api.listBanks().catch(() => ({ items: [] as any[] })),
          api.pipeline().catch(() => ({ videos: [] as any[] })),
          api.igQueue().catch(() => ({ items: [] as any[] })),
        ]);
        const out: Option[] = [];
        for (const b of (banks as any).items ?? []) {
          const category = BANK_CAT[b.kind];
          if (!category) continue; // skips proof + anything unmapped
          const body = [b.title, b.context, b.text].filter(Boolean).join('\n\n');
          out.push({
            id: `bank-${b.id}`,
            label: b.title || (b.text || '').slice(0, 80) || '(untitled)',
            sub: category,
            category,
            body: body || (b.text || ''),
            ref: (b.title ? `${b.title} - ` : '') + (b.text || ''),
          });
        }
        for (const v of (pipe as any).videos ?? []) {
          if (v.status === 'published') continue; // drafts only
          out.push({
            id: `yt-${v.id}`,
            label: v.title || v.id,
            sub: `YouTube drafts · ${v.status}`,
            category: 'YouTube drafts',
            body: [v.title, v.goal].filter(Boolean).join('\n\n') || (v.title || v.id),
            ref: `the video "${v.title || v.id}"`,
          });
        }
        for (const it of (ig as any).items ?? []) {
          if (it.status === 'posted' || it.status === 'dismissed') continue; // drafts only
          out.push({
            id: `ig-${it.id}`,
            label: it.title || (it.text || '').slice(0, 80) || '(untitled)',
            sub: `Instagram drafts · ${it.status}`,
            category: 'Instagram drafts',
            body: [it.title, it.caption, it.text].filter(Boolean).join('\n\n') || (it.text || ''),
            ref: `the Instagram draft "${it.title || (it.text || '').slice(0, 40)}"`,
          });
        }
        return out;
      }
      case 'offer': {
        // The real offer ladder (pricing rungs) from the Offer page. Rungs can
        // appear under more than one section, so flatten + de-dupe by id.
        const data = await api.offers();
        const seen = new Set<string>();
        const rungs = (data.sections ?? [])
          .flatMap((s) => s.pricing_rungs ?? [])
          .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return rungs.map((r) => {
          const name = r.name || 'offer';
          const price = r.price_label ? ` (${r.price_label})` : '';
          const what = r.proof_required || '';
          const promise = r.promise || '';
          const body = [name + price, promise, what].filter(Boolean).join('\n\n');
          const refParts = [`the offer "${name}"${price}`];
          if (promise) refParts.push(`promise: ${promise}`);
          if (what) refParts.push(`what it is: ${what}`);
          refParts.push('full detail in 01_Core/core_offer-suite.md');
          return {
            id: `offer-${r.id}`,
            label: name + price,
            sub: [r.status, r.tier].filter(Boolean).join(' · ') || undefined,
            body: body || undefined,
            ref: refParts.join('. '),
          };
        });
      }
      case 'avatar': {
        // The real audience avatars from the Offer/Reputation page. Each is
        // backed by a 05_Assets/Avatars/*.md file - point the skill at that
        // file so it reads the full profile, not just the name.
        const data = await api.offers();
        const seen = new Set<string>();
        const avatars = (data.sections ?? [])
          .flatMap((s) => s.avatars ?? [])
          .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
        return avatars.map((a) => {
          const name = a.name || (a.one_line || '').slice(0, 40) || 'avatar';
          const body = [
            a.one_line,
            a.before_state && `Before: ${a.before_state}`,
            a.after_state && `After: ${a.after_state}`,
            a.demographics && `Who: ${a.demographics}`,
            a.struggles?.length ? `Struggles: ${a.struggles.join('; ')}` : '',
            a.outcomes?.length ? `Wants: ${a.outcomes.join('; ')}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');
          const ref = a.source_file
            ? `the audience avatar "${name}" - read its full profile at ${a.source_file}`
            : [`the audience avatar "${name}"`, a.one_line].filter(Boolean).join(': ');
          return {
            id: `avatar-${a.id}`,
            label: name,
            sub: a.price_point || (a.one_line || '').slice(0, 60) || undefined,
            body: body || undefined,
            ref,
          };
        });
      }
      case 'carousel-source': {
        // What to turn into a carousel: your Instagram content (drafts AND
        // already-posted) plus your story bank. High-performing posted reels
        // get a star to suggest them as carousel candidates. Stories come from
        // the bank (kind 'story'); IG content from the queue (every status
        // except dismissed/failed).
        const [ig, banks] = await Promise.all([
          api.igQueue().catch(() => ({ items: [] as any[] })),
          api.listBanks().catch(() => ({ items: [] as any[] })),
        ]);
        const igItems = ((ig as any).items ?? []).filter(
          (it: any) => it.status !== 'dismissed' && it.status !== 'failed',
        );
        // Star the top performers among posted reels: top ~25% by views (at
        // least one) when there are 4+, the single best when there are 2-3,
        // none below that (can't judge "popular" off one data point).
        const posted = igItems
          .filter((it: any) => it.status === 'posted' && (it.view_count ?? 0) > 0)
          .sort((a: any, b: any) => (b.view_count ?? 0) - (a.view_count ?? 0));
        const starCount = posted.length >= 4 ? Math.max(1, Math.round(posted.length * 0.25)) : posted.length >= 2 ? 1 : 0;
        const starIds = new Set(posted.slice(0, starCount).map((it: any) => it.id));

        const out: Option[] = [];
        for (const it of igItems) {
          const isPosted = it.status === 'posted';
          const label = it.title || it.chosen_hook || (it.text || '').slice(0, 80) || '(untitled)';
          const content = [it.caption, it.script, it.text].filter(Boolean).join('\n\n') || it.text || '';
          const views = it.view_count ?? 0;
          const sub = isPosted
            ? `Instagram posts${views > 0 ? ` · ${fmtCount(views)} views` : ''}`
            : `Instagram drafts · ${it.status}`;
          const refContent = content ? ` - turn its content into a carousel: ${content}` : '';
          const where = it.posted_url ? ` (${it.posted_url})` : '';
          out.push({
            id: `ig-${it.id}`,
            label,
            sub,
            category: isPosted ? 'Instagram posts' : 'Instagram drafts',
            body: [it.title, it.caption, it.script, it.text].filter(Boolean).join('\n\n') || content,
            ref: `the Instagram ${isPosted ? 'post' : 'draft'} "${label}"${where}${refContent}`,
            starred: starIds.has(it.id),
          });
        }
        for (const b of (banks as any).items ?? []) {
          if (b.kind !== 'story') continue;
          const body = [b.title, b.context, b.text].filter(Boolean).join('\n\n');
          out.push({
            id: `story-${b.id}`,
            label: b.title || (b.text || '').slice(0, 80) || '(untitled story)',
            sub: 'Stories',
            category: 'Stories',
            body: body || (b.text || ''),
            ref: `the story "${b.title || (b.text || '').slice(0, 40)}"${b.text ? ` - turn it into a carousel: ${b.text}` : ''}`,
          });
        }
        return out;
      }
      default:
        // project / text and anything unknown → free text
        return null;
    }
  } catch {
    return null; // fall back to free text if a source fails to load
  }
}

// Opening line of a run prompt. Names the skill AND points at its file, so the
// chat can read+follow it even when the skill lives in a pack it doesn't
// auto-discover (e.g. the product pack).
function runHeader(name: string, location: string): string {
  return `Run the ${name} skill. Read and follow its instructions at ${location}.`;
}

function inputLabel(inp: SkillInput): string {
  if (inp.label) return inp.label;
  const map: Record<string, string> = {
    transcript: 'Transcript',
    video: 'Video',
    client: 'Client',
    pov: 'POV',
    idea: 'Idea',
    offer: 'Offer',
    avatar: 'Audience avatar',
    project: 'Project',
    text: 'Detail',
    'carousel-source': 'Turn into a carousel',
  };
  return map[inp.type] || inp.type;
}

export function SkillRunProvider({ children }: { children: ReactNode }) {
  const { openChat } = useChat();
  const [skill, setSkill] = useState<SkillFull | null>(null);
  const [onboarding, setOnboarding] = useState<SkillFull | null>(null);
  const [analyticsSetup, setAnalyticsSetup] = useState<SkillFull | null>(null);

  // Launch the onboarding chat, seeding it with any context the user gathered.
  const launchOnboarding = useCallback(
    (full: SkillFull, contextPaths: string[]) => {
      const lines: string[] = [runHeader(full.name, full.location)];
      if (contextPaths.length) {
        // Pass only the data (which files). The behaviour - draft from context,
        // confirm, then go deeper - lives in the skill's "If the user brought
        // context" step, so it's not duplicated here.
        lines.push(
          '',
          "The user attached these context files about themselves before starting - read them and follow the skill's \"If the user brought context\" step:",
          ...contextPaths.map((p) => `- ${p}`),
        );
      }
      openChat({ seed: lines.join('\n'), autosend: true, context: full.title || full.name });
      setOnboarding(null);
    },
    [openChat],
  );

  const runSkill = useCallback(
    async (id: string) => {
      let full: SkillFull;
      try {
        full = await api.getSkill(id);
      } catch {
        return;
      }
      if (full.name === ONBOARDING_SKILL) {
        setOnboarding(full);
        return;
      }
      if (full.name === ANALYTICS_SKILL) {
        setAnalyticsSetup(full);
        return;
      }
      if (!full.inputs || full.inputs.length === 0) {
        // Nothing to select - run straight away. Reference the skill's file path
        // directly (not just its name) so the chat works even for skills that
        // live in a pack it doesn't auto-discover.
        openChat({ seed: runHeader(full.name, full.location), autosend: true, context: full.title || full.name });
        return;
      }
      setSkill(full);
    },
    [openChat],
  );

  const run = useCallback(
    (chosen: string[][], texts: string[]) => {
      if (!skill) return;
      const lines: string[] = [runHeader(skill.name, skill.location)];

      const inputLines: string[] = [];
      skill.inputs.forEach((inp, i) => {
        const refs = chosen[i] ?? [];
        const text = (texts[i] ?? '').trim();
        // Typed free text wins when present (e.g. "a different offer not in my
        // list"); otherwise use the picked option(s). Only offer/avatar inputs
        // ever show both a picker and a text box, so this is a no-op elsewhere.
        const value = text ? text : refs.length ? refs.join('; ') : '';
        if (value) inputLines.push(`- ${inputLabel(inp)}: ${value}`);
      });
      if (inputLines.length) lines.push('', 'Use these inputs:', ...inputLines);

      if (skill.outputs && skill.outputs.length) {
        lines.push('', 'When you finish, save the outputs exactly as described:');
        skill.outputs.forEach((o) => lines.push(`- ${o.type}: ${o.description || `save to ${o.type}`}`));
      }

      openChat({ seed: lines.join('\n'), autosend: true, context: skill.title || skill.name });
      setSkill(null);
    },
    [skill, openChat],
  );

  // Open a setup chat (the automate-task skill) to schedule/trigger this skill.
  const scheduleSkill = useCallback(
    async (id: string) => {
      let full: SkillFull;
      try {
        full = await api.getSkill(id);
      } catch {
        return;
      }
      const current = full.schedule
        ? ` It already has a schedule (${JSON.stringify(full.schedule)}) - the user may want to change it or turn it off.`
        : '';
      const seed =
        `Run the automate-task skill. It lives in your skills folder under automate-task/SKILL.md - find and follow it.\n\n` +
        `You're setting up automation for the "${full.title || full.name}" skill. Its name is ${full.name} and its file is at ${full.location}.${current}`;
      openChat({ seed, autosend: true, context: `schedule ${full.title || full.name}` });
    },
    [openChat],
  );

  const value = useMemo<SkillRunCtx>(() => ({ runSkill, scheduleSkill }), [runSkill, scheduleSkill]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {skill && <RunPanel skill={skill} onClose={() => setSkill(null)} onRun={run} />}
      {onboarding && (
        <OnboardingLauncher
          onClose={() => setOnboarding(null)}
          onLaunch={(paths) => launchOnboarding(onboarding, paths)}
        />
      )}
      {analyticsSetup && (
        <AnalyticsSetupPanel
          skill={analyticsSetup}
          onClose={() => setAnalyticsSetup(null)}
          onRun={() => {
            openChat({
              seed: runHeader(analyticsSetup.name, analyticsSetup.location),
              autosend: true,
              context: analyticsSetup.title || analyticsSetup.name,
            });
            setAnalyticsSetup(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

function RunPanel({ skill, onClose, onRun }: { skill: SkillFull; onClose: () => void; onRun: (chosen: string[][], texts: string[]) => void }) {
  // selections[i] = array of chosen refs; texts[i] = free-text for text inputs.
  const [optionsByIdx, setOptionsByIdx] = useState<Record<number, Option[] | null>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState<Record<number, boolean>>({});

  // Drop a brand-new transcript into the run: it saves to the vault like any
  // other transcript, then gets added to the picker and auto-selected.
  async function uploadTranscriptFor(i: number, inp: SkillInput, file: File) {
    setUploading((p) => ({ ...p, [i]: true }));
    try {
      const res = await api.uploadTranscript(file);
      const opts = await loadOptions(inp);
      setOptionsByIdx((p) => ({ ...p, [i]: opts }));
      const added =
        (opts ?? []).find((o) => res.id && o.id === res.id) ??
        (opts ?? []).find((o) => o.ref.includes(res.filename));
      if (added) {
        setSelected((p) => ({ ...p, [i]: inp.multiple ? [...(p[i] ?? []), added.ref] : [added.ref] }));
      }
    } catch {
      // upload failed - leave the picker as-is
    } finally {
      setUploading((p) => ({ ...p, [i]: false }));
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      const entries = await Promise.all(skill.inputs.map((inp) => loadOptions(inp)));
      if (!live) return;
      const map: Record<number, Option[] | null> = {};
      entries.forEach((opts, i) => (map[i] = opts));
      setOptionsByIdx(map);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [skill]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (i: number, ref: string, multiple: boolean) => {
    setSelected((prev) => {
      const cur = prev[i] ?? [];
      if (cur.includes(ref)) return { ...prev, [i]: cur.filter((r) => r !== ref) };
      return { ...prev, [i]: multiple ? [...cur, ref] : [ref] };
    });
  };

  // Required (non-optional) inputs must have a value before running.
  const canRun = skill.inputs.every((inp, i) => {
    if (inp.optional) return true;
    return (selected[i]?.length ?? 0) > 0 || (texts[i] ?? '').trim().length > 0;
  });

  const submit = () => {
    const chosen = skill.inputs.map((_, i) => selected[i] ?? []);
    const t = skill.inputs.map((_, i) => texts[i] ?? '');
    onRun(chosen, t);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 120 }} />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(560px, 94vw)',
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          zIndex: 121,
        }}
      >
        <header style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--hairline)', flex: '0 0 auto' }}>
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>set up this run</span>
          <div style={{ fontSize: 'var(--body-lg)', fontWeight: 600, marginTop: 2 }}>{skill.title || skill.name}</div>
        </header>

        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {loading ? (
            <div className="muted">loading your options…</div>
          ) : (
            skill.inputs.map((inp, i) => {
              const opts = optionsByIdx[i];
              // offer + avatar show a real picker AND a "different one" text box
              // so you can either pick from your list or describe one that isn't
              // in it yet. The text box is also the fallback if you have none set up.
              const freeTextAlt = inp.type === 'offer' || inp.type === 'avatar' || inp.type === 'carousel-source';
              const textStyle = { background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', color: 'var(--ink)', padding: '10px 12px', fontSize: 'var(--body)', minHeight: 64, resize: 'vertical', outline: 'none' } as const;
              return (
                <div key={i} className="stack" style={{ gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <strong style={{ fontSize: 'var(--body)', fontWeight: 600 }}>{inputLabel(inp)}</strong>
                    {inp.multiple && <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>· choose any</span>}
                    {inp.optional && <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>· optional</span>}
                  </div>
                  {opts === null ? (
                    <textarea
                      value={texts[i] ?? ''}
                      onChange={(e) => setTexts((p) => ({ ...p, [i]: e.target.value }))}
                      placeholder={`type the ${inp.type}…`}
                      style={textStyle}
                    />
                  ) : (
                    <>
                      {inp.type === 'transcript' && (
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            alignSelf: 'flex-start',
                            padding: '8px 14px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px dashed var(--hairline)',
                            color: 'var(--muted)',
                            fontSize: 'var(--body-sm)',
                            fontWeight: 600,
                            cursor: uploading[i] ? 'default' : 'pointer',
                          }}
                        >
                          {uploading[i] ? 'uploading…' : '+ drop a new transcript'}
                          <input
                            type="file"
                            accept=".md,.txt,.vtt,.srt"
                            style={{ display: 'none' }}
                            disabled={!!uploading[i]}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadTranscriptFor(i, inp, f);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      )}
                      {opts.length === 0 ? (
                        freeTextAlt ? null : inp.type === 'transcript' ? (
                          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>no transcripts yet - drop one above.</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>nothing to pick yet.</span>
                        )
                      ) : (
                        <OptionPicker
                          options={opts}
                          selectedRefs={selected[i] ?? []}
                          multiple={!!inp.multiple}
                          onToggle={(ref) => toggle(i, ref, !!inp.multiple)}
                        />
                      )}
                      {freeTextAlt && (
                        <textarea
                          value={texts[i] ?? ''}
                          onChange={(e) => setTexts((p) => ({ ...p, [i]: e.target.value }))}
                          placeholder={(() => {
                            const noun = inp.type === 'carousel-source' ? 'carousel idea' : inp.type;
                            return opts.length === 0 ? `describe your ${noun}…` : `not one of these? describe a different ${noun}…`;
                          })()}
                          style={{ ...textStyle, minHeight: 52 }}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}

          {!loading && skill.outputs && skill.outputs.length > 0 && (
            <div style={{ paddingTop: 'var(--space-3)', borderTop: '1px solid var(--hairline)' }}>
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>when it's done</span>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: 'var(--body-sm)', lineHeight: 1.5 }}>
                {skill.outputs.map((o, k) => (
                  <li key={k}>
                    <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{o.type}</strong>
                    {o.description ? ` - ${o.description}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer style={{ padding: 'var(--space-4) var(--space-5)', borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flex: '0 0 auto' }}>
          <button type="button" onClick={onClose} style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', color: 'var(--muted)', padding: '9px 16px', fontSize: 'var(--body-sm)', cursor: 'pointer' }}>
            cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canRun}
            style={{ background: canRun ? 'var(--accent)' : 'var(--surface-2)', color: canRun ? '#06281b' : 'var(--muted)', borderRadius: 'var(--radius-md)', padding: '9px 20px', fontSize: 'var(--body-sm)', fontWeight: 600, cursor: canRun ? 'pointer' : 'default' }}
          >
            run skill
          </button>
        </footer>
      </div>
    </>
  );
}

// A short content preview for a row - the body with the title stripped off
// the front (so we don't repeat it), trimmed to a glanceable snippet. Falls
// back to the sub-label when there's no body.
function optionPreview(o: Option): string {
  const body = (o.body || '').replace(/\s+/g, ' ').trim();
  if (!body) return o.sub ?? '';
  const label = (o.label || '').replace(/\s+/g, ' ').trim();
  let p = body;
  if (label && p.toLowerCase().startsWith(label.toLowerCase())) p = p.slice(label.length).replace(/^[\s\-–:]+/, '').trim();
  return p.slice(0, 200);
}

// One input's option list, made browsable: a search box, category tabs (when
// the options carry categories), and rows you can expand to READ the full
// thing before picking it. Selecting (the checkbox / "select this" button) is
// deliberately separate from reading (clicking the row body), so opening an
// item to see what it is never accidentally selects it.
function OptionPicker({
  options,
  selectedRefs,
  multiple,
  onToggle,
}: {
  options: Option[];
  selectedRefs: string[];
  multiple: boolean;
  onToggle: (ref: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState('All');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const o of options) if (o.category && !seen.includes(o.category)) seen.push(o.category);
    return seen;
  }, [options]);
  const hasCats = categories.length > 0;

  const q = query.trim().toLowerCase();
  const filtered = options
    .filter((o) => {
      if (activeCat !== 'All' && o.category !== activeCat) return false;
      if (!q) return true;
      return `${o.label} ${o.sub ?? ''} ${o.body ?? ''}`.toLowerCase().includes(q);
    })
    // Starred (suggested) options float to the top; stable otherwise.
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
  const showSearch = options.length > 6 || hasCats;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {showSearch && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search…"
          style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', color: 'var(--ink)', padding: '11px 14px', fontSize: 'var(--body)', outline: 'none' }}
        />
      )}
      {hasCats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['All', ...categories].map((c) => {
            const n = c === 'All' ? options.length : options.filter((o) => o.category === c).length;
            const on = activeCat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(c)}
                style={{ padding: '7px 14px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--body-sm)', fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`, background: on ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface)', color: on ? 'var(--ink)' : 'var(--muted)' }}
              >
                {c.toLowerCase()} {n}
              </button>
            );
          })}
        </div>
      )}
      <div className="stack" style={{ gap: 6, maxHeight: 300, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <span className="muted" style={{ fontSize: 'var(--body-sm)' }}>nothing matches.</span>
        ) : (
          filtered.map((o) => {
            const on = selectedRefs.includes(o.ref);
            const isOpen = !!expanded[o.id];
            const canExpand = !!o.body;
            return (
              <div key={o.id} style={{ flexShrink: 0, border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`, borderRadius: 'var(--radius-md)', background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--surface)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px' }}>
                  <button
                    type="button"
                    aria-label={on ? 'deselect' : 'select'}
                    onClick={() => onToggle(o.ref)}
                    style={{ width: 20, height: 20, marginTop: 1, borderRadius: multiple ? 5 : '50%', border: `1px solid ${on ? 'var(--accent)' : 'var(--muted)'}`, background: on ? 'var(--accent)' : 'transparent', flex: '0 0 auto', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#06281b', fontSize: 12, lineHeight: 1 }}
                  >
                    {on ? '✓' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => (canExpand ? setExpanded((p) => ({ ...p, [o.id]: !p[o.id] })) : onToggle(o.ref))}
                    style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', alignItems: 'flex-start', gap: 10 }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 'var(--body)', fontWeight: 600, color: 'var(--ink)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.starred && (
                          <span title="High-performing - a great carousel candidate" style={{ color: 'var(--accent)' }}>★ </span>
                        )}
                        {o.label}
                      </span>
                      {(() => {
                        const preview = optionPreview(o);
                        return preview ? (
                          <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.45, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{preview}</span>
                        ) : null;
                      })()}
                    </span>
                    {canExpand && <span className="muted" style={{ fontSize: 'var(--body-sm)', fontWeight: 600, flex: '0 0 auto', marginTop: 1 }}>{isOpen ? '▾ close' : '▸ read'}</span>}
                  </button>
                </div>
                {isOpen && o.body && (
                  <div style={{ padding: '0 12px 12px 40px', fontSize: 'var(--body-sm)', lineHeight: 1.55, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>{o.body}</div>
                    <button
                      type="button"
                      onClick={() => onToggle(o.ref)}
                      style={{ marginTop: 10, padding: '5px 12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--eyebrow)', fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`, background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#06281b' : 'var(--ink)' }}
                    >
                      {on ? '✓ selected' : 'select this'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
