import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type SkillListItem } from '../api';
import { useSkillRun } from '../components/SkillRunProvider';
import { FilterTabs } from '../components/FilterTabs';
import {
  CATEGORY_ORDER,
  CATEGORY_COLOR,
  Icon,
  PlayIcon,
  skillIconKind,
  skillColor,
  titleCase,
} from '../lib/skillVisuals';

// Shared "thin grey line + soft lift" used across every interactive surface on
// this page (cards, tabs, buttons, filter, category counts) so they all read as
// one family and stand out from the canvas. Tuned to the reference; will be
// promoted to a design token once the look is locked.
const cardLift = '0 1px 3px rgba(15, 15, 15, 0.06), 0 4px 12px -2px rgba(15, 15, 15, 0.07)';

export function Skills() {
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<string>('All');
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({ queryKey: ['skills'], queryFn: () => api.skills() });

  const all = data?.items ?? [];

  const filtered = useMemo(() => {
    if (!filter) return all;
    const q = filter.toLowerCase();
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.title ?? '').toLowerCase().includes(q) ||
        (s.summary ?? '').toLowerCase().includes(q) ||
        (s.trigger_summary ?? '').toLowerCase().includes(q),
    );
  }, [all, filter]);

  const metaItems = useMemo(
    () =>
      filtered
        .filter((s) => s.category === 'Meta')
        // Explicit order for the meta strip: create a skill, then automation,
        // then carousel. Any other meta skills fall after, alphabetically.
        .sort((a, b) => {
          const META_ORDER = ['write-a-skill', 'create-an-automation-skill', 'build-a-carousel-skill'];
          const ia = META_ORDER.indexOf(a.name);
          const ib = META_ORDER.indexOf(b.name);
          if (ia !== -1 && ib !== -1) return ia - ib;
          if (ia !== -1) return -1;
          if (ib !== -1) return 1;
          return (a.title ?? a.name).localeCompare(b.title ?? b.name);
        }),
    [filtered],
  );
  const nonMeta = useMemo(() => filtered.filter((s) => s.category !== 'Meta'), [filtered]);

  const tabCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of nonMeta) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return counts;
  }, [nonMeta]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, SkillListItem[]>();
    for (const s of nonMeta) {
      const arr = byCat.get(s.category) ?? [];
      arr.push(s);
      byCat.set(s.category, arr);
    }
    // Skills that should lead their category, in this order. Everything else
    // falls after, alphabetical. (Strategy: Personal Brand Strategy, then
    // Customer Avatar.)
    const PINNED_FIRST = ['solopreneur-onboarding', 'customer-avatar'];
    return CATEGORY_ORDER.filter((k) => byCat.has(k))
      .filter((k) => tab === 'All' || tab === k)
      .map((k) => [k, byCat.get(k)!.sort((a, b) => {
        const ia = PINNED_FIRST.indexOf(a.name);
        const ib = PINNED_FIRST.indexOf(b.name);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.name.localeCompare(b.name);
      })] as [string, SkillListItem[]]);
  }, [nonMeta, tab]);

  if (error) return <div className="empty">couldn't load skills: {(error as Error).message}</div>;

  return (
    <div className="stack" style={{ gap: 'var(--space-6)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="h2">skills</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 'var(--body-sm)', maxWidth: '52ch', lineHeight: 1.55 }}>
            reusable skills grouped by the work they help with. run any with the run button, on your
            own claude subscription, against your real vault.
          </p>
        </div>
        <button type="button" onClick={() => navigate('/skills/new')} style={createBtn}>
          + create skill
        </button>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <FilterTabs
          value={tab}
          onChange={setTab}
          ariaLabel="skill categories"
          options={[
            { value: 'All', label: 'all', count: nonMeta.length },
            ...CATEGORY_ORDER.filter((c) => tabCounts.has(c)).map((c) => ({
              value: c,
              label: c.toLowerCase(),
              count: tabCounts.get(c)!,
            })),
          ]}
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter..."
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--ink)',
            padding: '8px 16px',
            fontSize: 'var(--body-sm)',
            outline: 'none',
            minWidth: 200,
            boxShadow: cardLift,
          }}
        />
      </div>

      {isLoading ? (
        <div className="empty">loading</div>
      ) : all.length === 0 ? (
        <NoSkillsEmptyState />
      ) : (
        <>
          {tab === 'All' && metaItems.length > 0 && (
            <section className="stack" style={{ gap: 'var(--space-3)' }}>
              <span className="eyebrow" style={{ color: 'var(--muted)' }}>meta skills</span>
              <div className="stack" style={{ gap: 'var(--space-3)' }}>
                {metaItems.map((s) => (
                  <SkillRow key={s.id} skill={s} onOpen={() => navigate(`/skills/${s.id}`)} />
                ))}
              </div>
            </section>
          )}

          {grouped.map(([cat, items]) => {
            const builtIn = items.filter((s) => s.builtIn).length;
            const custom = items.length - builtIn;
            return (
              <section key={cat} className="stack" style={{ gap: 'var(--space-3)' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span className="eyebrow" style={{ color: CATEGORY_COLOR[cat] ?? 'var(--muted)' }}>{cat.toLowerCase()}</span>
                    <div className="muted" style={{ fontSize: 'var(--body-sm)', marginTop: 2 }}>
                      {custom} custom · {builtIn} built-in
                    </div>
                  </div>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 'var(--body-sm)',
                      color: 'var(--muted)',
                      background: 'var(--fill-subtle)',
                      border: '1px solid var(--hairline)',
                      boxShadow: cardLift,
                    }}
                  >
                    {items.length}
                  </span>
                </header>
                <div className="stack" style={{ gap: 'var(--space-3)' }}>
                  {items.map((s) => (
                    <SkillRow key={s.id} skill={s} onOpen={() => navigate(`/skills/${s.id}`)} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

export function SkillRow({ skill, onOpen, hideSchedule }: { skill: SkillListItem; onOpen: () => void; hideSchedule?: boolean }) {
  const color = skillColor(skill);
  const { runSkill, scheduleSkill } = useSkillRun();

  const run = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't also open the editor
    runSkill(skill.id); // opens the input-selection panel if the skill needs it, else runs
  };
  const schedule = (e: React.MouseEvent) => {
    e.stopPropagation();
    scheduleSkill(skill.id); // opens the automate-task setup chat
  };
  const schedLabel = scheduleLabel(skill.schedule);

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: cardLift,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          width: 42,
          height: 42,
          borderRadius: 'var(--radius-md)',
          display: 'grid',
          placeItems: 'center',
          color,
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
      >
        <Icon kind={skillIconKind(skill)} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--body)', fontWeight: 600 }}>{skill.title || titleCase(skill.name)}</span>
          <span style={badge(skill.builtIn)}>{skill.builtIn ? 'built-in' : 'custom'}</span>
        </div>
        <div
          className="muted"
          style={{
            fontSize: 'var(--body-sm)',
            lineHeight: 1.45,
            marginTop: 3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '60ch',
          }}
        >
          {skill.summary || skill.trigger_summary}
        </div>
      </div>

      {!hideSchedule && skill.category !== 'Meta' && (
        <button
          type="button"
          onClick={schedule}
          style={schedLabel ? schedulePillActive : schedulePill}
          title={schedLabel ? 'edit this schedule' : 'set up a schedule or trigger'}
        >
          <ClockIcon /> {schedLabel ?? 'schedule'}
        </button>
      )}

      <button type="button" onClick={run} style={runBtn}>
        <PlayIcon /> run skill
      </button>
    </div>
  );
}

// "weekly · Mon 06:00" / "on new transcript" / null when not scheduled.
function scheduleLabel(sch?: import('../api').SkillSchedule | null): string | null {
  if (!sch || sch.enabled === false) return null;
  if (sch.trigger === 'event' || sch.event) {
    const ev = (sch.event || '').toLowerCase();
    if (ev.includes('transcript')) return 'on new transcript';
    if (ev.includes('zoom') || ev.includes('call') || ev.includes('recording')) return 'on new call';
    return ev ? `on ${ev.replace(/[-_]/g, ' ')}` : 'on trigger';
  }
  const at = (sch.at || '').trim();
  if (sch.cadence === 'daily') return at ? `daily · ${at}` : 'daily';
  if (sch.cadence === 'weekly') return at ? `weekly · ${at}` : 'weekly';
  return at || 'scheduled';
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const createBtn = {
  background: 'var(--surface)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--ink)',
  padding: '8px 16px',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  flex: '0 0 auto',
  boxShadow: cardLift,
} as const;

const runBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  flex: '0 0 auto',
  padding: '8px 16px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  background: '#EDEDE9',
  color: '#16140F',
  border: '1.5px solid #16140F',
  boxShadow: cardLift,
} as const;

// Secondary pill to the left of "run skill". Ghost when unscheduled (a quiet
// "+ schedule"), tinted when a schedule is set (shows the cadence).
const schedulePill = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flex: '0 0 auto',
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--body-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'transparent',
  color: 'var(--muted)',
  border: '1px solid var(--hairline)',
  whiteSpace: 'nowrap',
  boxShadow: cardLift,
} as const;

const schedulePillActive = {
  ...schedulePill,
  color: 'var(--ink)',
  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--hairline))',
} as const;

function badge(builtIn: boolean) {
  return {
    fontSize: 'var(--eyebrow)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: builtIn ? 'var(--accent)' : 'var(--muted)',
    border: `1px solid ${builtIn ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--hairline)'}`,
    borderRadius: 'var(--radius-pill)',
    padding: '1px 8px',
  } as const;
}

function NoSkillsEmptyState() {
  return (
    <section
      className="stack"
      style={{
        gap: 'var(--space-4)',
        padding: 'var(--space-5)',
        border: '1px dashed var(--hairline)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--fill-subtle)',
        maxWidth: '72ch',
      }}
    >
      <div>
        <strong style={{ fontSize: 'var(--body-lg)', fontWeight: 600 }}>no skills installed yet</strong>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--body)', lineHeight: 1.55 }}>
          skills are reusable workflows claude runs against this vault. they live as folders inside{' '}
          <code>&lt;your-vault&gt;/.claude/skills/</code>. this page reads from there.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="eyebrow" style={{ color: 'var(--recovery)' }}>option 1 · ss members</span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.5 }}>
          install the solopreneur os skill pack inside the community. it drops a full pack (onboarding,
          content, youtube, copywriting, design) straight into your vault.
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <span className="eyebrow" style={{ color: 'var(--strain)' }}>option 2 · roll your own</span>
        <span className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.5 }}>
          press <strong>+ create skill</strong>, or drop your own skill folders into{' '}
          <code>.claude/skills/</code>. each needs a <code>SKILL.md</code> with <code>name</code> +{' '}
          <code>description</code>. the page picks them up on refresh.
        </span>
      </div>
    </section>
  );
}
