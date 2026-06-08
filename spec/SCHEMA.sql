-- Anna Dashboard - D1 Schema
-- Apply as Wrangler migration 0001_init.sql

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
  category TEXT NOT NULL DEFAULT 'other',  -- filming | scripting | building | operations | admin | other
  due_date INTEGER,
  focus_goal_id TEXT,
  blockers TEXT,
  source_file TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  target_value REAL,
  current_value REAL,
  target_date INTEGER,
  status TEXT NOT NULL DEFAULT 'active',   -- active | achieved | parked
  parent_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idea',     -- idea | scripted | filmed | editing | published
  publish_date INTEGER,
  youtube_url TEXT,
  view_count INTEGER,
  cta TEXT,
  queue_order INTEGER,
  source_file TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);

CREATE TABLE IF NOT EXISTS ss_modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',  -- planned | in_progress | live
  progress_pct REAL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Single-row table (id = 'current'). Holds latest known counters.
CREATE TABLE IF NOT EXISTS ss_state (
  id TEXT PRIMARY KEY DEFAULT 'current',
  ss_members INTEGER DEFAULT 0,
  ss_mrr REAL DEFAULT 0,
  yt_subs INTEGER DEFAULT 0,
  gumroad_mrr REAL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'paid',       -- free | paid
  reviews INTEGER,
  rating REAL,
  monthly_revenue REAL,
  status TEXT NOT NULL DEFAULT 'active',   -- active | parked | sunset
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Time series of counters. Sync script appends a snapshot, frontend reads last 30 for sparklines.
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at INTEGER NOT NULL,
  yt_subs INTEGER,
  ss_members INTEGER,
  ss_mrr REAL,
  gumroad_mrr REAL
);
CREATE INDEX IF NOT EXISTS idx_metrics_taken_at ON metrics(taken_at);

CREATE TABLE IF NOT EXISTS transcripts (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  type TEXT NOT NULL,                      -- workshop | qa | strategy | video
  date INTEGER,
  processed INTEGER NOT NULL DEFAULT 0,    -- bool 0/1
  pov_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS povs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'short',    -- short | long
  source_transcript_id TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                    -- skool_reply | zoom_transcript | flagged_review | manual
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | dismissed
  link TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_status ON inbox_items(status);

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,                  -- content | product | community | ip_extraction
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source_refs TEXT,                        -- JSON array as TEXT
  effort TEXT NOT NULL DEFAULT 'medium',   -- small | medium | large
  status TEXT NOT NULL DEFAULT 'new',      -- new | actioned | dismissed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);

CREATE TABLE IF NOT EXISTS wins (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date INTEGER NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_log (
  source TEXT PRIMARY KEY,                 -- 'tasks', 'videos', 'cron', etc
  last_run_at INTEGER NOT NULL,
  items_count INTEGER,
  notes TEXT
);
