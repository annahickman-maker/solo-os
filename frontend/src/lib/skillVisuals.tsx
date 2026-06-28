// Shared visual vocabulary for skills - the icon set, category colours, and the
// maker-type mapping. Used by both the Skills page and the skill editor.

export type IconKind =
  | 'youtube'
  | 'instagram'
  | 'image'
  | 'web'
  | 'copy'
  | 'research'
  | 'ideas'
  | 'strategy'
  | 'clients'
  | 'meta';

// Main groups shown as tabs + sections. Meta is handled separately (its own
// strip at the top, no tab).
export const CATEGORY_ORDER = ['Research', 'Ideas', 'Create', 'Strategy', 'Clients'];

export const CATEGORY_COLOR: Record<string, string> = {
  Meta: 'var(--muted)',
  Research: 'var(--strain)',
  Ideas: '#E6A52F',
  Create: 'var(--recovery)',
  Strategy: 'var(--sleep)',
  Clients: '#C98AE6',
};

const CATEGORY_ICON: Record<string, IconKind> = {
  Meta: 'meta',
  Research: 'research',
  Ideas: 'ideas',
  Create: 'copy',
  Strategy: 'strategy',
  Clients: 'clients',
};

// Per-skill maker type, used to pick the tile icon for Create skills.
const MAKER_ICON: Record<string, IconKind> = {
  'instagram-carousel': 'instagram',
  'reel-scripter': 'instagram',
  'content-extractor': 'instagram',
  'youtube-thumbnail': 'youtube',
  'ai-image-prompting': 'image',
  'nano-banana-integration': 'image',
  'brand-taste': 'web',
  'frontend-design': 'web',
  impeccable: 'web',
  'cta-writing': 'copy',
  'emotion-in-copy': 'copy',
  'headline-writing': 'copy',
  'storytelling-for-conversion': 'copy',
  'sales-page-builder': 'copy',
  'testimonial-selection': 'copy',
};

// Each icon carries a fixed colour, so picking an icon picks the colour too -
// no separate colour control. YouTube is always red, Instagram always pink,
// and so on.
export const ICON_COLOR: Record<IconKind, string> = {
  youtube: '#FF4D4D',
  instagram: '#D672B0',
  image: '#E6A52F',
  web: '#29A4FF',
  copy: '#16C97E',
  research: '#5B8DEF',
  ideas: '#F2C94C',
  strategy: '#9DB7D1',
  clients: '#C98AE6',
  meta: '#8A8A8A',
};

// Resolve the icon for a skill: an explicit editor-chosen icon wins; then the
// maker-type (for Create skills); then the category default.
export function skillIconKind(skill: { name: string; category: string; icon?: string }): IconKind {
  if (skill.icon && ICON_KINDS.includes(skill.icon as IconKind)) return skill.icon as IconKind;
  if (skill.category === 'Create') {
    if (MAKER_ICON[skill.name]) return MAKER_ICON[skill.name];
    if (skill.name.startsWith('youtube-')) return 'youtube';
    return 'copy';
  }
  return CATEGORY_ICON[skill.category] ?? 'meta';
}

// Colour follows the icon. (A stored color is honoured for back-compat.)
export function skillColor(skill: { name: string; category: string; icon?: string; color?: string }): string {
  return skill.color || ICON_COLOR[skillIconKind(skill)] || 'var(--muted)';
}

export function titleCase(name: string): string {
  return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ICON_KINDS: IconKind[] = [
  'youtube',
  'instagram',
  'image',
  'web',
  'copy',
  'research',
  'ideas',
  'strategy',
  'clients',
  'meta',
];

// Palette offered in the appearance picker. Stored as concrete hex.
export const COLOR_OPTIONS = ['#16C97E', '#29A4FF', '#E6A52F', '#C98AE6', '#9DB7D1', '#FF4D4D', '#8A8A8A'];

export function Icon({ kind, size = 20 }: { kind: IconKind; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'youtube':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <circle cx="8.5" cy="9" r="1.6" />
          <path d="M21 15l-5-4-8 7" />
        </svg>
      );
    case 'web':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 9h18" />
          <circle cx="6" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
          <circle cx="8.4" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <path d="M6 3h7l5 5v13H6z" />
          <path d="M13 3v5h5" />
          <path d="M9 13h6M9 16.5h6" />
        </svg>
      );
    case 'research':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.6-4.6" />
        </svg>
      );
    case 'ideas':
      return (
        <svg {...common}>
          <path d="M9.5 18h5" />
          <path d="M10 21h4" />
          <path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5 1.3 1.2 1.3 2.4h5c0-1.2.7-1.9 1.3-2.4A6 6 0 0 0 12 3z" />
        </svg>
      );
    case 'strategy':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'clients':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" />
          <path d="M16 5.6a3 3 0 0 1 0 5.6" />
          <path d="M21 20c0-2.4-1.4-4.5-3.4-5.4" />
        </svg>
      );
    case 'meta':
    default:
      return (
        <svg {...common}>
          <path d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 5l12 7-12 7z" fill="currentColor" />
    </svg>
  );
}
