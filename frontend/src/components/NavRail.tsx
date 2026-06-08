import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'today', end: true },
  { to: '/focus', label: 'focus' },
  { to: '/projects', label: 'projects' },
  { to: '/content', label: 'content' },
  { to: '/profile', label: 'profile' },
  // { to: '/metrics', label: 'metrics' }, // parked - re-add when she comes back to it
  { to: '/skills', label: 'skills' },
  { to: '/vault', label: 'vault' },
  { to: '/inbox', label: 'inbox' },
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
          {ITEMS.map((it) => (
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
