import type { Context, Next } from 'hono';

const PASSWORD = process.env.DASHBOARD_PASSWORD ?? 'dev';

export async function auth(c: Context, next: Next) {
  const provided = c.req.header('X-Dashboard-Password');
  if (!provided || provided !== PASSWORD) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
}
