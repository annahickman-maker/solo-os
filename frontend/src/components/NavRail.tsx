import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';
import { SURFACE_LIFT } from '../lib/ui';
import { features } from '../features/registry';

// Two groups separated by a hairline. Top group = "where I am right now"
// (today, focus). Bottom group = everything else - the systems that move
// slower than the day.
const TOP_ITEMS = [
  { to: '/', label: 'today', end: true },
  { to: '/focus', label: 'focus' },
];

const REST_ITEMS = [
  { to: '/profile', label: 'profile' },
  { to: '/content', label: 'content' },
  { to: '/projects', label: 'projects' },
  { to: '/skills', label: 'skills' },
  { to: '/vault', label: 'vault' },
  { to: '/inbox', label: 'inbox' },
  // { to: '/metrics', label: 'metrics' }, // parked - re-add when she comes back to it
];

// Auto-discovered features (features/* + lab/*) append to the nav. A feature
// with group 'top' joins today/focus; everything else joins REST (and so
// participates in the collapse-into-"more" logic below).
const FEATURE_NAV = features.map((f) => ({ to: f.path, label: f.navLabel, group: f.group ?? 'rest' }));
const TOP = [...TOP_ITEMS, ...FEATURE_NAV.filter((f) => f.group === 'top').map(({ to, label }) => ({ to, label }))];
const REST = [...REST_ITEMS, ...FEATURE_NAV.filter((f) => f.group !== 'top').map(({ to, label }) => ({ to, label }))];

function NavItem({ to, label, end, onClick }: { to: string; label: string; end?: boolean; onClick?: () => void }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) => `nav-rail__link${isActive ? ' nav-rail__link--active' : ''}`}
      >
        <span className="nav-rail__dot" />
        <span className="nav-rail__link-text">{label}</span>
      </NavLink>
    </li>
  );
}

// Recent chats card. Shows the 4 newest chats and a View History link. Renders
// inline above Settings when there's room, or inside the "more" popover when the
// rail is too short. `bare` drops the divider/margins for the popover.
function RecentChats({ bare, onNavigate }: { bare?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['chatThreads'], queryFn: api.chatThreads, staleTime: 10_000 });
  const items = (data?.items ?? []).slice(0, 4);
  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <div
      style={
        bare
          ? undefined
          : { marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--hairline)' }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <span className="eyebrow">chats</span>
        <button
          type="button"
          onClick={() => go('/chat')}
          title="new chat"
          style={{ color: 'var(--muted)', fontSize: 'var(--body-lg)', lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}
        >
          +
        </button>
      </div>

      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.4, margin: '0 0 8px' }}>
          run a skill or start a chat - it'll show up here.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => go(`/chat/${t.id}`)}
              title={t.title}
              style={{
                textAlign: 'left',
                width: '100%',
                color: 'var(--muted)',
                fontSize: 'var(--body-sm)',
                padding: '5px 8px',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fill-subtle)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => go('/history')}
        style={{ color: 'var(--muted)', fontSize: 'var(--body-sm)', cursor: 'pointer', padding: '4px 8px', textDecoration: 'underline' }}
      >
        view history
      </button>
    </div>
  );
}

export function NavRail() {
  const innerRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  // Progressive collapse so the rail never scrolls and Settings always stays
  // visible. 0 = everything inline. >=1 = chats moved into the "more" popover.
  // >1 = chats + the last (collapse-1) REST items moved in too (lowest priority
  // first: inbox, then skills, ...). Settings + the top group never collapse.
  const [collapse, setCollapse] = useState(0);
  const [, setTick] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const MAX = REST.length + 1;

  // Converge: while the footer (chats + more + settings) spills past the bottom
  // of the rail's 100vh box, push one more thing into "more". Runs after every
  // render; stops once it fits or everything collapsible is hidden.
  // useLayoutEffect keeps it paint-synchronous so there's no flicker as it
  // settles. NOTE: we measure the footer's bottom against the content-box bottom
  // rather than scrollHeight - the footer's `margin-top: auto` fools scrollHeight
  // (it reports "fits" even when content is pushed below the fold).
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || collapse >= MAX) return;
    const footer = el.querySelector('.nav-rail__footer') as HTMLElement | null;
    if (!footer) return;
    const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    // Measure against the actual viewport bottom (the rail is a 100vh sticky
    // column, so its own rect can extend below the fold). Settings must stay
    // visible within the viewport, with the padding as breathing room.
    const availableBottom = window.innerHeight - padBottom;
    if (footer.getBoundingClientRect().bottom > availableBottom + 1) {
      setCollapse((c) => c + 1);
    }
  });

  // Re-measure from scratch whenever the rail's box changes height (viewport
  // resize, or the icon-rail width breakpoint): reset to 0 and bump a tick so
  // the effect above re-runs and re-converges - this lets the rail EXPAND again
  // when the window grows, not just collapse when it shrinks.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const remeasure = () => {
      setCollapse(0);
      setTick((t) => t + 1);
      setMoreOpen(false); // close the transient menu while the rail re-settles
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(el);
    window.addEventListener('resize', remeasure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', remeasure);
    };
  }, []);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreWrapRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const hiddenRestCount = Math.max(0, collapse - 1);
  const visibleRest = REST.slice(0, REST.length - hiddenRestCount);
  const hiddenRest = REST.slice(REST.length - hiddenRestCount);
  const chatsInMore = collapse >= 1;
  const hasMore = chatsInMore; // anything collapsed -> show the more button

  return (
    <aside className="nav-rail">
      <div className="nav-rail__inner" ref={innerRef}>
        <div className="nav-rail__brand">
          <span className="nav-rail__brand-text">solo os</span>
          <span className="nav-rail__brand-dot">.</span>
        </div>
        <nav>
          <ul className="nav-rail__list">
            {TOP.map((it) => (
              <NavItem key={it.to} to={it.to} label={it.label} end={(it as { end?: boolean }).end} />
            ))}
          </ul>
          {/* Thin hairline separating "today/focus" from the rest of the nav. */}
          <div aria-hidden="true" style={{ margin: '12px 16px', height: 1, background: 'var(--hairline)' }} />
          <ul className="nav-rail__list">
            {visibleRest.map((it) => (
              <NavItem key={it.to} to={it.to} label={it.label} />
            ))}
          </ul>
        </nav>
        <div className="nav-rail__footer">
          {/* Chats render inline while there's room; otherwise they live in More. */}
          {!chatsInMore && <RecentChats />}

          {hasMore && (
            <div className="nav-rail__more" ref={moreWrapRef}>
              <button
                type="button"
                className={`nav-rail__link nav-rail__more-btn${moreOpen ? ' nav-rail__link--active' : ''}`}
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                title="more"
              >
                <span className="nav-rail__more-glyph" aria-hidden="true">···</span>
                <span className="nav-rail__link-text">more</span>
              </button>
              {moreOpen && (
                <div className="nav-rail__more-pop" style={{ boxShadow: SURFACE_LIFT }}>
                  {hiddenRest.length > 0 && (
                    <ul className="nav-rail__list">
                      {hiddenRest.map((it) => (
                        <NavItem key={it.to} to={it.to} label={it.label} onClick={() => setMoreOpen(false)} />
                      ))}
                    </ul>
                  )}
                  {chatsInMore && (
                    <div style={hiddenRest.length > 0 ? { marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--hairline)' } : undefined}>
                      <RecentChats bare onNavigate={() => setMoreOpen(false)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <ul className="nav-rail__list">
            <NavItem to="/settings" label="settings" />
          </ul>
        </div>
      </div>
    </aside>
  );
}
