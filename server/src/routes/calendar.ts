// Google Calendar - read-only events for the active day.
// Auth-protected (under /api/calendar). Returns events from the user's
// primary calendar that intersect [day_start, day_start+24h).

import { Hono } from 'hono';
import { getValidAccessToken, readGoogleEnv } from '../lib/google.js';

const app = new Hono();

type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  hangoutLink?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
};

type NormalizedEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  all_day: boolean;
  location: string | null;
  conference_url: string | null;
  html_link: string | null;
  status: string;
};

const URL_REGEX = /https?:\/\/[^\s<>"]+/i;

function firstUrl(...candidates: (string | undefined | null)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(URL_REGEX);
    if (m) return m[0];
  }
  return null;
}

function normalize(e: GoogleEvent): NormalizedEvent | null {
  const startIso = e.start?.dateTime ?? e.start?.date;
  const endIso = e.end?.dateTime ?? e.end?.date;
  if (!startIso || !endIso) return null;
  const allDay = !e.start?.dateTime;
  // Prefer Google's native hangoutLink, then declared video entry points,
  // then sniff the first URL from location/description (catches Zoom/Teams
  // links that Calendar shoves into the description text).
  const conference =
    e.hangoutLink ??
    e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri ??
    firstUrl(e.location, e.description);
  return {
    id: e.id,
    title: e.summary ?? '(untitled)',
    start: startIso,
    end: endIso,
    all_day: allDay,
    location: e.location ?? null,
    conference_url: conference,
    html_link: e.htmlLink ?? null,
    status: e.status ?? 'confirmed',
  };
}

app.get('/events', async (c) => {
  const env = readGoogleEnv();
  // configured = the OAuth client credentials exist (BYO config or env).
  // The frontend reads this to decide whether to show the "run this prompt
  // in Claude to set up" panel or the native connect-calendar button.
  if (!env) return c.json({ configured: false, connected: false, events: [] });

  const date = c.req.query('date');
  const dayStartParam = c.req.query('day_start');
  const dayStartNum = dayStartParam ? Number(dayStartParam) : NaN;

  let timeMin: string;
  let timeMax: string;
  if (Number.isFinite(dayStartNum) && dayStartNum > 0) {
    timeMin = new Date(Math.floor(dayStartNum) * 1000).toISOString();
    timeMax = new Date((Math.floor(dayStartNum) + 86400) * 1000).toISOString();
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    timeMin = `${date}T00:00:00Z`;
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    timeMax = next.toISOString();
  } else {
    return c.json({ error: 'date or day_start query param required' }, 400);
  }

  const token = await getValidAccessToken(env);
  if (!token) return c.json({ configured: true, connected: false, events: [] });

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '50');

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    console.error('calendar fetch failed:', res.status, body);
    return c.json({ error: 'calendar fetch failed', detail: body }, 502);
  }
  const data = (await res.json()) as { items?: GoogleEvent[] };
  const events = (data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map(normalize)
    .filter((e): e is NormalizedEvent => e !== null);

  return c.json({ configured: true, connected: true, events });
});

export default app;
