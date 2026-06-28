import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useSkillRun } from './SkillRunProvider';
import { useChat } from './ChatProvider';
import { PlayIcon } from '../lib/skillVisuals';
import { solidButtonStyle, SURFACE_LIFT } from '../lib/ui';

/**
 * ConnectAppCard - a Skills-page-style row that prompts the user to connect an
 * integration that isn't live yet. Self-contained: it runs the relevant status
 * query and renders NOTHING once the app is connected, so a page can drop
 * `<ConnectAppCard app="google" />` and it appears only while disconnected and
 * disappears the moment it goes live.
 *
 * Placement (each auto-hides when connected):
 *   google   -> Today page
 *   zoom     -> Vault page
 *   youtube  -> Content page (YouTube tab)
 *   tracking -> Offer page (conversions panel)
 * and all four on Settings until connected + live.
 *
 * The box matches the Skills page row (surface + hairline + soft lift, colored
 * icon tile, title + sub, solid run button). Running the action runs the pack
 * setup skill (zoom / youtube / tracking) or, for Google, grants OAuth access
 * (when credentials are already set) or opens the connect-calendar skill chat.
 */
export type ConnectAppKey = 'google' | 'zoom' | 'youtube' | 'tracking' | 'nanobanana';

// Palette colors only (see skillVisuals ICON_COLOR) - no new tokens.
const CalendarIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
  </svg>
);
const CameraIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.5" y="6" width="13" height="12" rx="2" />
    <path d="M15.5 10l6-3.5v11l-6-3.5z" />
  </svg>
);
const YouTubeGlyph = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 4.8 12 4.8 12 4.8s-7 0-8.9.6A3 3 0 0 0 1 7.5 31 31 0 0 0 .5 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1c1.9.6 8.9.6 8.9.6s7 0 8.9-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.5 12 31 31 0 0 0 23 7.5zM9.8 15.3V8.7l5.7 3.3z" />
  </svg>
);
const LinkIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 15l6-6M10.5 6.5l1-1a4 4 0 0 1 6 6l-1 1M13.5 17.5l-1 1a4 4 0 0 1-6-6l1-1" />
  </svg>
);
const ImageIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

interface Meta {
  title: string;
  sub: string;
  color: string;
  icon: ReactNode;
}

const META: Record<ConnectAppKey, Meta> = {
  google: {
    title: 'Connect Google Calendar',
    sub: 'see your meetings on the Today page',
    color: '#29A4FF',
    icon: CalendarIcon,
  },
  zoom: {
    title: 'Connect Zoom',
    sub: 'cloud recording transcripts auto-sync into your vault',
    color: '#5B8DEF',
    icon: CameraIcon,
  },
  youtube: {
    title: 'Connect YouTube Analytics',
    sub: 'channel stats, title radar, and analytics review',
    color: '#FF4D4D',
    icon: YouTubeGlyph,
  },
  tracking: {
    title: 'Set up conversion tracking',
    sub: '/go/ short links + click counts feeding this page',
    color: '#16C97E',
    icon: LinkIcon,
  },
  nanobanana: {
    title: 'Connect Nano Banana',
    sub: 'generate avatar + thumbnail images with Google Gemini',
    color: '#E8B53D',
    icon: ImageIcon,
  },
};

// Pack setup skills (resolved dashboard ids). Google has no pack skill - it uses
// OAuth (grant access) once configured, or the connect-calendar skill chat.
const SETUP_SKILL: Record<Exclude<ConnectAppKey, 'google'>, string> = {
  zoom: 'skill-business-connect-zoom-transcripts',
  youtube: 'skill-solopreneur-os-youtube-setup-api',
  tracking: 'skill-solopreneur-os-setup-conversion-tracking',
  nanobanana: 'skill-solopreneur-os-connect-nano-banana',
};

const GOOGLE_CONNECT_PROMPT = 'Connect my Google Calendar to the dashboard';

// One hook per app, picked by key. React Query dedupes by key so multiple
// instances + Settings share a single request.
function useStatus(app: ConnectAppKey) {
  const google = useQuery({ queryKey: ['google-status'], queryFn: api.googleStatus, enabled: app === 'google' });
  const zoom = useQuery({ queryKey: ['zoom-status'], queryFn: api.zoomStatus, enabled: app === 'zoom' });
  const youtube = useQuery({ queryKey: ['youtube-status'], queryFn: api.youtubeStatus, enabled: app === 'youtube' });
  const tracking = useQuery({ queryKey: ['tracking-setup-status'], queryFn: api.getTrackingSetupStatus, enabled: app === 'tracking' });
  const nanobanana = useQuery({ queryKey: ['nano-banana-status'], queryFn: api.nanoBananaStatus, enabled: app === 'nanobanana' });

  if (app === 'google') {
    return { loading: google.isLoading, connected: !!google.data?.connected, configured: !!google.data?.configured };
  }
  if (app === 'zoom') {
    return { loading: zoom.isLoading, connected: !!zoom.data?.connected, configured: false };
  }
  if (app === 'youtube') {
    return { loading: youtube.isLoading, connected: !!youtube.data?.configured, configured: false };
  }
  if (app === 'nanobanana') {
    return { loading: nanobanana.isLoading, connected: !!nanobanana.data?.connected, configured: false };
  }
  return {
    loading: tracking.isLoading,
    connected: !!(tracking.data?.ok || (tracking.data?.manifest_exists && tracking.data?.worker_exists)),
    configured: false,
  };
}

export function ConnectAppCard({ app }: { app: ConnectAppKey }) {
  const meta = META[app];
  const { runSkill } = useSkillRun();
  const { openChat } = useChat();
  const { loading, connected, configured } = useStatus(app);
  const [busy, setBusy] = useState(false);

  // Don't flash while loading, and disappear entirely once live.
  if (loading || connected) return null;

  let label = 'run setup';
  let onClick: () => void = () => {
    if (app !== 'google') runSkill(SETUP_SKILL[app]);
  };
  let sub = meta.sub;

  if (app === 'google') {
    if (configured) {
      // Credentials already set - the remaining step is the one-click OAuth grant.
      label = 'grant access';
      sub = 'credentials set - grant access to finish connecting';
      onClick = async () => {
        setBusy(true);
        try {
          const { url } = await api.googleConnectUrl();
          window.location.href = url;
        } catch (err) {
          setBusy(false);
          window.alert(`could not start connect flow: ${(err as Error).message}`);
        }
      };
    } else {
      // No credentials yet - run the connect-calendar skill in a chat.
      onClick = () => openChat({ seed: GOOGLE_CONNECT_PROMPT, autosend: true, context: meta.title });
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: SURFACE_LIFT,
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
          color: meta.color,
          background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        }}
      >
        {meta.icon}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--body)', fontWeight: 600 }}>{meta.title}</span>
          <span
            style={{
              fontSize: 'var(--eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              fontWeight: 600,
              color: 'var(--muted-2)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-pill)',
              padding: '1px 8px',
            }}
          >
            not connected
          </span>
        </div>
        <div className="muted" style={{ fontSize: 'var(--body-sm)', lineHeight: 1.45, marginTop: 3 }}>
          {sub}
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        style={{ ...solidButtonStyle, flex: '0 0 auto', ...(busy ? { opacity: 0.6, cursor: 'wait' } : {}) }}
      >
        <PlayIcon /> {busy ? 'opening' : label}
      </button>
    </div>
  );
}
