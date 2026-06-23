import type { Context, Next } from 'hono';

const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'dev';

// Accept either the header (used by fetch from the dashboard SPA) OR a `?pw=`
// query param (used by media tags like <video src> and <img src> that can't
// send custom headers). The query-param path is the same trade-off the deck
// route already makes - the password ends up in the URL, but for a localhost
// dashboard that's acceptable.
export async function auth(c: Context, next: Next) {
  const header = c.req.header('X-Dashboard-Password');
  const query = c.req.query('pw');
  const provided = header || query;
  if (!provided || provided !== PASSWORD) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
