# Dashboard - Frontend

React + Vite SPA. Cream Whoop visual style. Talks to the Cloudflare Worker API.

## Local dev

```
npm install
npm run dev
```

Vite serves on `http://localhost:5173`. Requests to `/api` proxy to the worker at `http://localhost:8787` (start it from `../backend`).

Password is prompted on first load and cached in `localStorage` as `dashboard_password`. Clear from Settings or DevTools.

For pointing at a hosted API in dev, set `VITE_API_URL=https://api.dashboard.theannahickman.com` in `.env`.

## Build

```
npm run build
```

Outputs to `dist/`.

## Deploy

Cloudflare Pages:

```
npx wrangler pages deploy dist --project-name dashboard
```

Custom domain: `dashboard.theannahickman.com`. Add it in the Cloudflare Pages dashboard under Custom Domains. Ensure the API worker is reachable at the same origin via `/api/*` (worker route) or set `VITE_API_URL` in the Pages build env to the api subdomain.

## Notes

- No em dashes anywhere (vault rule).
- All design tokens live in `src/styles/tokens.css`. Don't introduce new colors.
- Heavy lifting per page is colocated in `src/pages/*.tsx`. Shared atoms in `src/components/*`.
