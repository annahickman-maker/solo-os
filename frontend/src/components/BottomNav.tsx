import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'today', end: true },
  { to: '/focus', label: 'focus' },
  { to: '/projects', label: 'projects' },
  { to: '/content', label: 'content' },
  { to: '/inbox', label: 'inbox' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) =>
            `bottom-nav__link${isActive ? ' bottom-nav__link--active' : ''}`
          }
        >
          <span className="bottom-nav__dot" />
          <span>{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
