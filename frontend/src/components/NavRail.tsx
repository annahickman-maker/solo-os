import { NavLink } from 'react-router-dom';

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
  { to: '/vault', label: 'vault' },
  { to: '/skills', label: 'skills' },
  { to: '/inbox', label: 'inbox' },
  // { to: '/metrics', label: 'metrics' }, // parked - re-add when she comes back to it
];

export function NavRail() {
  return (
    <aside className="nav-rail">
      <div className="nav-rail__brand">
        <span className="nav-rail__brand-text">solo os</span>
        <span className="nav-rail__brand-dot">.</span>
      </div>
      <nav>
        <ul className="nav-rail__list">
          {TOP_ITEMS.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  `nav-rail__link${isActive ? ' nav-rail__link--active' : ''}`
                }
              >
                <span className="nav-rail__dot" />
                <span className="nav-rail__link-text">{it.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Thin hairline + extra spacing separating "today/focus" from the
            rest of the nav. Makes the top pair feel like the active surface
            and the bottom group feel like the system underneath. */}
        <div
          aria-hidden="true"
          style={{
            margin: '12px 16px',
            height: 1,
            background: 'var(--hairline)',
          }}
        />
        <ul className="nav-rail__list">
          {REST_ITEMS.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to}
                className={({ isActive }) =>
                  `nav-rail__link${isActive ? ' nav-rail__link--active' : ''}`
                }
              >
                <span className="nav-rail__dot" />
                <span className="nav-rail__link-text">{it.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="nav-rail__footer">
        <ul className="nav-rail__list">
          <li>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `nav-rail__link${isActive ? ' nav-rail__link--active' : ''}`
              }
            >
              <span className="nav-rail__dot" />
              <span className="nav-rail__link-text">settings</span>
            </NavLink>
          </li>
        </ul>
      </div>
    </aside>
  );
}
