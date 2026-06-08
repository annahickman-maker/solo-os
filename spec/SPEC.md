# Anna Dashboard - Shared Build Spec

Single source of truth for the 3 parallel build agents (backend, frontend, sync).
Anything not specified here is up to the building agent's judgment.

---

## Architecture

```
[Local vault (markdown)] --sync.js--> [Cloudflare Worker /api]
                                              |
                                              v
                                          [D1 (SQLite)]
                                              ^
                                              |
[Cloudflare Pages (React SPA)] <-- fetch ---/
            ^
            |
[Browser, dashboard.theannahickman.com, password gate]

[Cron Worker, nightly 03:00 UTC] -> reads D1 + calls Anthropic API -> writes opportunities table
```

- **Frontend:** Vite + React + TypeScript SPA. Deployed to Cloudflare Pages. Custom domain `dashboard.theannahickman.com`.
- **Backend:** One Cloudflare Worker with two roles: REST API (fetch handler) and nightly cron (scheduled handler). Backed by D1.
- **Sync:** Node 20 CLI in `sync/`. Reads markdown from the vault, POSTs to API endpoints. Idempotent. Run manually by Anna with `npm run sync`.
- **Auth:** Single password. Sent from frontend as `X-Dashboard-Password` header. Stored as Worker secret `DASHBOARD_PASSWORD`. Frontend caches it in `localStorage` after first prompt. No accounts, no sessions.

---

## D1 Schema

See `SCHEMA.sql` for canonical DDL. Tables:

- `tasks` - master todo items
- `goals` - 90-day focus + sub-goals
- `videos` - YouTube pipeline
- `ss_modules` - Solopreneur Systems modules
- `ss_state` - single-row table for SS member count + MRR
- `products` - Gumroad inventory
- `metrics` - time-series counters (subs, members, revenue) for sparklines
- `transcripts` - raw + processed flag
- `povs` - POV library
- `inbox_items` - Skool replies pending, Zoom transcripts unprocessed, generic inbox
- `opportunities` - AI-generated suggestions, refreshed by cron
- `sync_log` - last sync timestamp per source

All tables have `id TEXT PRIMARY KEY` (use slug/filename when stable, UUID otherwise), `created_at INTEGER`, `updated_at INTEGER` (unix seconds).

---

## REST API

Base URL: `https://api.dashboard.theannahickman.com` OR `https://dashboard.theannahickman.com/api` (backend agent decides which; document choice).

All requests require header `X-Dashboard-Password: <secret>`. Missing/wrong = 401 JSON `{ "error": "unauthorized" }`.
All responses are JSON. Errors: `{ "error": "<message>" }` with appropriate 4xx/5xx code.
All timestamps in responses: unix seconds (integer).

### GET endpoints (read for frontend)

| Endpoint | Returns |
|---|---|
| `GET /api/today` | `{ greeting, date, focus_goal, top_tasks: Task[], rings: { focus_pct, pipeline_pct, week_pct } }` |
| `GET /api/focus` | `{ goal: Goal, sub_goals: Goal[], tasks: Task[] }` |
| `GET /api/pipeline` | `{ videos: Video[], ss_modules: SSModule[] }` |
| `GET /api/metrics` | `{ ss_members, ss_mrr, yt_subs, gumroad_mrr, trend: { subs: number[], members: number[], revenue: number[] }, wins: Win[] }` |
| `GET /api/opportunities` | `{ items: Opportunity[], last_refresh: number }` |
| `GET /api/inbox` | `{ items: InboxItem[] }` |
| `GET /api/products` | `{ items: Product[] }` |

### Mutation endpoints (frontend → backend, for in-UI edits)

| Endpoint | Body | Effect |
|---|---|---|
| `PATCH /api/tasks/:id` | `{ status?, title?, category?, due_date? }` | Update a task. Status enum: `pending`, `in_progress`, `completed`. |
| `POST /api/tasks` | `{ title, category?, due_date?, focus_goal_id? }` | Create a new task. |
| `DELETE /api/tasks/:id` | - | Delete a task. |
| `PATCH /api/videos/:id` | `{ status?, title?, publish_date? }` | Update video. Status enum: `idea`, `scripted`, `filmed`, `editing`, `published`. |
| `PATCH /api/inbox/:id` | `{ status }` | Status enum: `pending`, `done`, `dismissed`. |
| `PATCH /api/opportunities/:id` | `{ status }` | Status enum: `new`, `actioned`, `dismissed`. |
| `POST /api/opportunities/refresh` | - | Force a cron run now. Returns 202. |

### Sync endpoints (sync script → backend)

These are bulk upsert endpoints. The sync script POSTs the entire current state of each source. Backend should: upsert by id, NOT delete missing rows by default (preserves in-UI edits), accept a `?replace=1` query param to do a hard replace (for tasks/videos where the vault is authoritative).

| Endpoint | Body |
|---|---|
| `POST /api/sync/tasks` | `{ items: Task[] }` |
| `POST /api/sync/goals` | `{ items: Goal[] }` |
| `POST /api/sync/videos` | `{ items: Video[] }` |
| `POST /api/sync/products` | `{ items: Product[] }` |
| `POST /api/sync/transcripts` | `{ items: Transcript[] }` |
| `POST /api/sync/povs` | `{ items: POV[] }` |
| `POST /api/sync/ss-modules` | `{ items: SSModule[] }` |
| `POST /api/sync/ss-state` | `{ ss_members, ss_mrr, yt_subs, gumroad_mrr }` |
| `POST /api/sync/inbox` | `{ items: InboxItem[] }` |
| `POST /api/metrics/snapshot` | `{ yt_subs?, ss_members?, ss_mrr?, gumroad_mrr? }` (appends to metrics time-series) |

### TypeScript types (shared)

```ts
type Task = {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  category: 'filming' | 'scripting' | 'building' | 'operations' | 'admin' | 'other';
  due_date?: number;   // unix seconds
  focus_goal_id?: string;
  blockers?: string;
  source_file?: string;
  created_at: number;
  updated_at: number;
};

type Goal = {
  id: string;
  title: string;
  target_value?: number;   // e.g. 25 (members)
  current_value?: number;
  target_date?: number;
  status: 'active' | 'achieved' | 'parked';
  parent_id?: string;
};

type Video = {
  id: string;
  title: string;
  status: 'idea' | 'scripted' | 'filmed' | 'editing' | 'published';
  publish_date?: number;
  youtube_url?: string;
  view_count?: number;
  cta?: string;
  queue_order?: number;
  source_file?: string;
};

type SSModule = {
  id: string;
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct?: number;
  description?: string;
};

type Product = {
  id: string;
  name: string;
  price: number;
  type: 'free' | 'paid';
  reviews?: number;
  rating?: number;
  monthly_revenue?: number;
  status: 'active' | 'parked' | 'sunset';
};

type Transcript = {
  id: string;
  filename: string;
  type: 'workshop' | 'qa' | 'strategy' | 'video';
  date?: number;
  processed: boolean;
  pov_count?: number;
};

type POV = {
  id: string;
  title: string;
  format: 'short' | 'long';
  source_transcript_id?: string;
  usage_count?: number;
};

type InboxItem = {
  id: string;
  source: 'skool_reply' | 'zoom_transcript' | 'flagged_review' | 'manual';
  title: string;
  body?: string;
  status: 'pending' | 'done' | 'dismissed';
  link?: string;
  created_at: number;
};

type Opportunity = {
  id: string;
  category: 'content' | 'product' | 'community' | 'ip_extraction';
  title: string;
  rationale: string;
  source_refs?: string[];  // e.g. ['transcript:workshop-2026-04-15', 'pov:marketer-not-expert']
  effort: 'small' | 'medium' | 'large';
  status: 'new' | 'actioned' | 'dismissed';
  created_at: number;
};

type Win = {
  id: string;
  title: string;
  date: number;
  source?: string;
};
```

---

## Pages (Frontend)

Single SPA with client-side routing. Bottom nav on mobile, left rail on desktop (240px wide). 5 nav items + 1 settings.

1. **Today** (`/`) - landing page. Hero 3-ring (Focus / Pipeline / Week), today's 3 priorities, "one thing" card, today's calendar/calls block, recent win.
2. **Focus** (`/focus`) - 90-day goal big number ("8 / 25 members" with arc), days remaining, list of sub-goals, full master-todo with category filters + status checkboxes (editable).
3. **Pipeline** (`/pipeline`) - YouTube videos as kanban columns by status (idea/scripted/filmed/editing/published) OR vertical lists if columns too tight. SS modules below. Drag or click-to-advance status.
4. **Metrics** (`/metrics`) - big number cards (subs, members, MRR, Gumroad), sparklines for each, weekly bar chart of videos published, recent wins feed.
5. **Opportunities** (`/opportunities`) - AI-generated cards. Each: category tag, title, rationale, source refs, effort estimate, actions (Action / Dismiss). Top of page: "Last refreshed Xh ago" + Refresh button.
6. **Inbox** (`/inbox`) - unified list of pending items (Skool replies, unprocessed transcripts, flagged reviews). Each: source tag, title, link to original, mark-done button.
7. **Settings** (`/settings`) - password change (re-encrypt local), trigger manual sync POST, view sync_log, log out.

---

## Design Tokens (Frontend)

CSS variables. Match Anna's brand-system.md exactly.

```css
:root {
  /* Color */
  --bg: #F2EDE4;
  --surface: #E8E1D3;
  --surface-2: #DDD4C2;   /* slightly deeper for nested cards */
  --ink: #1C1B17;
  --muted: #5A554C;
  --hairline: rgba(28, 27, 23, 0.12);
  --accent: #3F4F3F;       /* moss - primary metric ring */
  --success: #5C6E4A;
  --warning: #B8884A;
  --danger: #9A4A3A;

  /* Type */
  --font-display: 'Fraunces', 'Times New Roman', serif;
  --font-body: 'Inter', system-ui, sans-serif;

  --eyebrow: 0.75rem;      /* uppercase, +0.14em tracking, weight 500 */
  --body-sm: 0.875rem;
  --body: 1.0625rem;
  --body-lg: 1.25rem;
  --h3: 1.75rem;
  --h2: clamp(2rem, 4.2vw, 3.25rem);
  --h1: clamp(3rem, 7.5vw, 8rem);

  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;

  /* Motion */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --duration-fast: 180ms;
  --duration-base: 320ms;
}
```

### Style rules (non-negotiable)

- **Cream Whoop**, not dark. Light bg, dark text. The Whoop *information architecture* (rings, hero numbers, semantic-only color, restraint) on Anna's cream palette.
- Cards = `--surface` background on `--bg`, no shadow, hairline border `1px solid var(--hairline)` only when needed for separation.
- Hero numbers in Fraunces (display), opsz 144 if variable, weight 300-400, tracking -0.02em, line-height 0.95.
- Labels in Inter uppercase, tracking +0.14em, weight 500, muted color.
- Eyebrow tag above each section. Section heading in Fraunces h3.
- Rings: solid color (NOT gradient), 8-10px stroke, rounded caps, track at `rgba(28,27,23,0.08)`. Center number = Fraunces huge.
- 95% of pixels neutral. Moss `--accent` only on primary metric rings. Status colors only on tiny pills/dots.
- No glass, no frosted blur, no SaaS gradients, no big drop shadows.
- Generous space. Mobile: 16px gutters. Desktop: 96px+ side padding on main area.
- One signature interaction: when a task is checked off, the ring animates +1 increment.

### Layout

- Desktop (≥1024px): left rail nav 240px, main content max-width 960px centered with 96px side padding.
- Tablet (≥640px): same as desktop but rail collapses to icon-only 72px.
- Mobile (<640px): bottom nav 5 items, full-width content with 16px gutters.

---

## Cron / Opportunities

Cron Worker runs daily at 03:00 UTC. Steps:

1. Query D1: pull recent transcripts (`processed = 0`), all POVs, unpublished videos, master-todo recent items, products.
2. Call Anthropic API (Sonnet 4.6 for quality; Haiku 4.5 acceptable for cost) with a structured prompt that asks: "Given this snapshot of Anna's vault, identify 5-12 high-leverage opportunities Claude could action. Return JSON array."
3. Each opportunity has: `category`, `title`, `rationale` (1-2 sentences), `source_refs`, `effort`.
4. Replace prior `opportunities` rows where `status = 'new'` (preserve `actioned` and `dismissed`).
5. Update `sync_log` with last cron timestamp.

Anthropic API key stored as Worker secret `ANTHROPIC_API_KEY`.
Use prompt caching for the system prompt and vault snapshot section.

---

## Build agent responsibilities

| Agent | Folder | Builds |
|---|---|---|
| Backend | `backend/` | `wrangler.toml`, `src/worker.ts` (fetch + scheduled handlers), `src/routes/*`, `src/auth.ts`, `src/db.ts`, `src/opportunities.ts`, `migrations/0001_init.sql` (use SCHEMA.sql) |
| Frontend | `frontend/` | Vite app: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/api.ts`, `src/pages/{Today,Focus,Pipeline,Metrics,Opportunities,Inbox,Settings}.tsx`, `src/components/{Ring,Card,TaskRow,...}.tsx`, `src/styles/tokens.css`, `vite.config.ts`. Use TanStack Query for fetching. React Router for routing. |
| Sync | `sync/` | `package.json`, `src/index.ts` (CLI entry), `src/parsers/*.ts` (one per source: master-todo, videos, products, transcripts, povs, ss-modules, skool-replies), `.env.example` (API_URL, DASHBOARD_PASSWORD), `README.md` with run instructions |

### Hard rules for all agents

- **No em dashes anywhere.** Use hyphens. Anna's vault rule.
- Use TypeScript everywhere except sync's parsers can use loose typing for markdown wrangling.
- Use the exact types in this spec for API payloads.
- Use the exact CSS tokens for the frontend. Do not introduce new color variables.
- Do NOT install heavy deps you don't need. Frontend: react, react-dom, react-router-dom, @tanstack/react-query. Backend: hono (for the worker router), @anthropic-ai/sdk. Sync: gray-matter, marked, glob, dotenv, node-fetch (or native fetch on Node 20).
- Write minimal, no commentary code. No code comments unless absolutely necessary.
- Each folder must have a README with: how to dev locally, how to deploy.

---

## Local dev assumptions

- Worker dev: `wrangler dev` exposes `http://localhost:8787`. Migrations applied to local D1.
- Frontend dev: `vite` on `http://localhost:5173`. `.env` points `VITE_API_URL=http://localhost:8787`.
- Sync dev: `.env` points `API_URL=http://localhost:8787`, `DASHBOARD_PASSWORD=dev`.
