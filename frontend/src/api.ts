// ─── Audience quotes (quotes spoken BY audience members in transcripts) ─
export type AudienceQuoteCategory = 'struggle' | 'desire' | 'win';
export type AudienceQuoteStatus = 'pending' | 'dismissed';
export interface AudienceQuote {
  id: string;
  text: string;
  speaker_label: string;
  category: AudienceQuoteCategory;
  // Audience-voice headline summarising the struggle/desire/win itself.
  // Shown prominently above the quote text. Renamed from `context`.
  title: string;
  timestamp: string;
  source_transcript_id: string;
  source_transcript_filename: string;
  avatar_id: string | null;
  status: AudienceQuoteStatus;
  approved_proof_id?: string;
  approved_at?: number;
  created_at: number;
  updated_at: number;
}

export type QuoteTag = 'pov' | 'value' | 'authority' | 'connection';
export type DimKind = QuoteTag;
export type ExtractedQuoteStatus = 'pending' | 'dismissed';
export type ExtractedKind = 'quote' | 'story';
export interface SourceMoment {
  text: string;
  timestamp: string;
}
export interface ExtractedQuote {
  id: string;
  text: string;
  tag: QuoteTag;
  context: string;
  timestamp: string;
  source_transcript_id: string;
  source_transcript_filename: string;
  status: ExtractedQuoteStatus;
  approved_to?: QuoteTag;
  approved_at?: number;
  approved_path?: string;
  approved_bank_id?: string;
  in_ig_queue?: boolean;
  ig_queue_id?: string;
  queued_at?: number;
  created_at: number;
  updated_at: number;
  kind?: ExtractedKind;
  title?: string;
  source_moments?: SourceMoment[];
  topics?: string[];
}

export type BankKind = 'pov' | 'framework' | 'story' | 'proof';
export type StructureMode = 'infer' | 'fixed' | 'hybrid';
export type SectionKind = 'intro' | 'context' | 'value' | 'cta' | 'outro';
export interface ScriptSection {
  id: string;
  label: string;
  kind: SectionKind;
  brief: string;
  anchor_ids: string[];
}
export interface BankItem {
  id: string;
  kind: BankKind;
  text: string;
  title?: string | null;
  context?: string | null;
  source_transcript?: string | null;
  source_timestamp?: string | null;
  source_moments?: SourceMoment[];
  topics?: string[];
}

export type IgItemStatus =
  | 'queued'
  | 'editing'
  | 'ready_to_schedule'
  | 'scheduled'
  | 'filmed'
  | 'posted'
  | 'dismissed'
  | 'failed';
export interface IgQueueItem {
  id: string;
  quote_id?: string;
  text: string;
  tag: QuoteTag;
  context?: string;
  timestamp?: string;
  source_transcript_id?: string;
  source_transcript_filename?: string;
  source_moments?: SourceMoment[];
  kind?: ExtractedKind;
  title?: string;
  status: IgItemStatus;
  queued_at: number;
  editing_at?: number;
  ready_at?: number;
  scheduled_at?: number;
  filmed_at?: number;
  posted_at?: number;
  dismissed_at?: number;
  failed_at?: number;
  failed_reason?: string;
  posted_url?: string;
  view_count?: number;
  share_count?: number;
  comment_count?: number;
  queue_order?: number;
  caption?: string;
  caption_hashtags?: string[];
  caption_generated_at?: number;
  video_path?: string;
  thumbnail_path?: string;
  hook_variants?: string[];
  chosen_hook?: string;
  scheduled_for?: number;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskCategory =
  | 'filming'
  | 'scripting'
  | 'building'
  | 'operations'
  | 'admin'
  | 'other';
export type TaskEnergy = 'high' | 'medium' | 'low' | null;

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  category: TaskCategory;
  energy?: TaskEnergy;
  due_date?: number;
  focus_goal_id?: string;
  project_id?: string;
  project_name?: string;
  project_kind?: 'project' | 'client';
  blockers?: string;
  source_file?: string;
  created_at: number;
  updated_at: number;
  // Day-of-week this task is pinned to in the Focus page's WeekPlanner.
  // One of "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", or null
  // when unscheduled. Persistent (does NOT clear at week-end) - tasks stay
  // in their column until completed or moved. The Today page surfaces
  // tasks whose weekday matches today.
  scheduled_weekday?: string | null;
  // DEPRECATED: legacy ISO date field. Read-only fallback for migration
  // (focus.ts derives a weekday from it if scheduled_weekday is missing).
  // Do not write.
  scheduled_day?: string | null;
  // When true, this task lives in its project's backlog. Hidden from
  // the Focus master todo + WeekPlanner; only visible in the project /
  // client detail. Toggled via drag-and-drop in that panel.
  backlog?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  target_value?: number;
  current_value?: number;
  target_date?: number;
  status: 'active' | 'achieved' | 'parked';
  parent_id?: string;
  mrr_target_usd?: number | null;
}

export interface FocusTargets {
  mrr_target_usd: number | null;
  member_target: number | null;
  avg_member_price_usd: number | null;
  revenue_model: string | null;
  youtube_target_per_weeks: number;
  long_form_per_week: number;
  short_form_per_week: number;
  target_date: string | null;
  current_mrr_usd: number;
  current_members: number;
}

export type VideoStatus = 'idea' | 'scripted' | 'filmed' | 'editing' | 'published';

export interface Video {
  id: string;
  title: string;
  status: VideoStatus;
  script_content?: string;
  publish_date?: number;
  youtube_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  ctr_pct?: number;
  sub_rate_pct?: number;
  conversion_pct?: number;
  avg_view_duration_sec?: number;
  cta?: string;
  // Short one-line description of what this specific video is for. Shown
  // as a subhead on each video card.
  goal?: string | null;
  queue_order?: number;
  source_file?: string;
  suggestions_json?: string;
  suggestions_at?: number;
  description?: string | null;
  description_generated_at?: number | null;
  script_sections?: ScriptSection[] | null;
  duration_sec?: number | null;
  tied_to_transformation?: number;
  queued?: number;
}

export interface VideoSuggestions {
  titles_explicit: Array<{ title: string; formula?: string; liked?: boolean; edited?: boolean }>;
  titles_implied: Array<{ title: string; formula?: string; liked?: boolean; edited?: boolean }>;
  thumbnail_phrases: Array<{ phrase: string; gap?: string; liked?: boolean; edited?: boolean }>;
  generated_at: number;
}

export interface SSModule {
  id: string;
  name: string;
  status: 'planned' | 'in_progress' | 'live';
  progress_pct?: number;
  description?: string;
  kind?: 'project' | 'client';
}

export interface Product {
  id: string;
  name: string;
  price: number;
  type: 'free' | 'paid';
  reviews?: number;
  rating?: number;
  monthly_revenue?: number;
  status: 'active' | 'parked' | 'sunset';
}

export interface InboxItem {
  id: string;
  source: 'skool_reply' | 'zoom_transcript' | 'flagged_review' | 'manual';
  title: string;
  body?: string;
  status: 'pending' | 'done' | 'dismissed';
  link?: string;
  created_at: number;
}

export interface Win {
  id: string;
  title: string;
  date: number;
  source?: string;
}

export interface TodayResponse {
  greeting: string;
  date: string;
  focus_goal: Goal | null;
  top_tasks: Task[];
  rings: {
    strain_score: number;
    strain_max: number;
    tasks_done_today: number;
    deep_work_blocks: number;
    deep_work_seconds: number;
    deep_work_target_seconds: number;
    focus_pct: number;
    focus_current: number;
    focus_target: number;
  };
}

export interface DeepWorkBlock {
  id: string;
  label: string | null;
  started_at: number;
  ended_at: number | null;
  duration_sec: number | null;
  task_id?: string | null;
  category?: string | null;
  task_title?: string | null;
  task_status?: string | null;
  created_at: number;
}

export interface ThisWeekTask {
  id: string;
  title: string;
  status: string;
  category: string | null;
  energy: string | null;
  project_id: string | null;
  pinned_today: number | null;
}

export interface ThisWeekResponse {
  pinned: ThisWeekTask[];
  buckets: {
    filming: ThisWeekTask[];
    scripting: ThisWeekTask[];
    building: ThisWeekTask[];
    admin: ThisWeekTask[];
  };
  total: number;
}

export interface PickableTask {
  id: string;
  title: string;
  category: string | null;
  energy: string | null;
  project_id: string | null;
}

export interface TickedTask {
  id: string;
  title: string;
  category: string | null;
  energy: string | null;
  completed_at: number;
}

export interface DeepWorkTodayResponse {
  items: DeepWorkBlock[];
  completed: number;
  active: DeepWorkBlock | null;
  total_seconds: number;
  ticked_tasks?: TickedTask[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  all_day: boolean;
  location: string | null;
  conference_url: string | null;
  html_link: string | null;
  status: string;
}

export type BrainstormBucket = 'EDUCATE' | 'RELATE' | 'INSPIRE' | 'SELL';

export interface BrainstormQuestion {
  id: string;
  number: number;
  bucket: BrainstormBucket;
  sub_category: string;
  text: string;
  answer: string | null;
  completed: number;
  deleted: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface BrainstormResponse {
  items: BrainstormQuestion[];
  total_active: number;
  completed_count: number;
}

export interface FocusResponse {
  goal: Goal | null;
  sub_goals: Goal[];
  tasks: Task[];
  weekly_publish_year?: (number | null)[];
  targets?: FocusTargets;
}

export interface PipelineResponse {
  videos: Video[];
  ss_modules: SSModule[];
  clients?: SSModule[];
  weekly_publish_year?: (number | null)[];
  youtube_last_sync?: number | null;
}

export interface MetricsResponse {
  ss_members: number;
  ss_mrr: number;
  yt_subs: number;
  gumroad_mrr: number;
  tiktok_followers: number;
  total_gumroad_sales: number;
  students_count: number;
  lifetime_income: number;
  total_audience: number;
  videos_published_this_year: number;
  trend: { subs: number[]; members: number[]; revenue: number[] };
  wins: Win[];
  student_wins: Win[];
  videos_per_week?: number[];
}


export interface InboxResponse {
  items: InboxItem[];
}

export interface ProductsResponse {
  items: Product[];
}

export interface SyncLogEntry {
  source: string;
  last_sync: number;
  status?: string;
  message?: string;
}

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const PASSWORD_KEY = 'dashboard_password';

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function getStoredPassword(): string | null {
  return localStorage.getItem(PASSWORD_KEY);
}

export function setStoredPassword(value: string): void {
  localStorage.setItem(PASSWORD_KEY, value);
}

export function clearStoredPassword(): void {
  localStorage.removeItem(PASSWORD_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const password = getStoredPassword() ?? '';
  const headers = new Headers(init.headers);
  headers.set('X-Dashboard-Password', password);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearStoredPassword();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let message = `request failed: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Day-scoped reads now send `day_start` = the Unix-seconds timestamp of local
  // midnight for the day being viewed. The backend filters by [day_start,
  // day_start + 86400) with no timezone interpretation needed server-side, so
  // it's correct in any TZ, on any backend (worker or file-based), at any
  // time of day. `date` is still sent for display/cache-key purposes.
  today: (q?: { date?: string; day_start?: number }) => {
    const params = new URLSearchParams();
    if (q?.date) params.set('date', q.date);
    if (q?.day_start) params.set('day_start', String(q.day_start));
    const qs = params.toString();
    return request<TodayResponse>(`/api/today${qs ? `?${qs}` : ''}`);
  },
  focus: () => request<FocusResponse>('/api/focus'),
  updateGoal: (
    id: string,
    patch: {
      title?: string;
      target_value?: number | null;
      target_date?: string | null;
      mrr_target_usd?: number | null;
      avg_member_price_usd?: number | null;
      revenue_model?: string | null;
    }
  ) =>
    request<Goal>(`/api/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  pipeline: (archived?: boolean) =>
    request<PipelineResponse>(`/api/pipeline${archived ? '?archived=1' : ''}`),
  metrics: () => request<MetricsResponse>('/api/metrics'),
  inbox: () => request<InboxResponse>('/api/inbox'),
  products: () => request<ProductsResponse>('/api/products'),

  updateTask: (id: string, body: Partial<Pick<Task, 'status' | 'title' | 'category' | 'due_date' | 'energy'>>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Pin / unpin a task to a weekday column. value is "mon"|"tue"|"wed"|
  // "thu"|"fri"|"sat"|"sun" or null to clear. Persistent across weeks -
  // tasks stay in the column until completed or moved.
  setTaskScheduledWeekday: (id: string, scheduled_weekday: string | null) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduled_weekday }),
    }),
  // Move a task between PRIORITY and BACKLOG within its project.
  // When backlog=true the task disappears from the Focus master todo
  // and WeekPlanner; only the project / client detail panel surfaces
  // it. Setting backlog=true also clears any scheduled_day so the
  // task doesn't ghost-live on a calendar day it can't surface from.
  setTaskBacklog: (id: string, backlog: boolean) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ backlog }),
    }),
  createTask: (body: { title: string; category?: TaskCategory; due_date?: number; focus_goal_id?: string; project_id?: string }) =>
    request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: (id: string) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  getVideo: (id: string) => request<Video>(`/api/videos/${id}`),
  createVideo: (body: { title: string; status?: Video['status'] }) =>
    request<Video>('/api/videos', { method: 'POST', body: JSON.stringify(body) }),
  updateVideo: (
    id: string,
    body: Partial<Pick<Video, 'status' | 'title' | 'publish_date' | 'script_content' | 'goal'>> & {
      archived?: boolean;
      queued?: boolean | number;
    }
  ) => request<Video>(`/api/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteVideo: (id: string) =>
    request<{ ok: true }>(`/api/videos/${id}`, { method: 'DELETE' }),

  getSSModule: (id: string) => request<SSModule & { tasks_json?: string; linked_tasks?: Task[]; linked_transcripts?: Array<{ id: string; filename: string; type: string; date?: number; processed: number; summary?: string }> }>(`/api/ss-modules/${id}`),
  createSSModule: (body: { name: string; kind: 'project' | 'client'; description?: string; status?: SSModule['status'] }) =>
    request<SSModule>('/api/ss-modules', { method: 'POST', body: JSON.stringify(body) }),
  updateSSModule: (id: string, body: Partial<Pick<SSModule, 'name' | 'description' | 'status' | 'progress_pct'>> & { tasks_json?: string; archived?: boolean }) =>
    request<SSModule>(`/api/ss-modules/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSSModule: (id: string) =>
    request<{ ok: true }>(`/api/ss-modules/${id}`, { method: 'DELETE' }),
  syncYouTube: () => request<{ ok: true; total: number; inserted: number; updated: number; handle: string }>('/api/youtube/sync', { method: 'POST' }),
  generateTitles: (videoId: string, preserve = false) =>
    request<VideoSuggestions>(`/api/videos/${videoId}/generate-titles${preserve ? '?preserve=1' : ''}`, { method: 'POST' }),
  saveSuggestions: (videoId: string, suggestions: VideoSuggestions) =>
    request<{ ok: true }>(`/api/videos/${videoId}/suggestions`, { method: 'PATCH', body: JSON.stringify({ suggestions }) }),

  // ─── YouTube script builder ──────────────────────────────────────────
  listBanks: () =>
    request<{ items: BankItem[]; grouped: Record<BankKind, BankItem[]> }>('/api/videos/banks'),
  suggestAnchors: (videoId: string, transformation?: string) =>
    request<{ suggestions: Array<{ id: string; why: string }> }>(`/api/videos/${videoId}/script/suggest-anchors`, {
      method: 'POST',
      body: JSON.stringify({ transformation }),
    }),
  draftScript: (
    videoId: string,
    body: { anchor_ids: string[]; mode: StructureMode; transformation?: string; save?: boolean }
  ) =>
    request<{
      title_suggestion: string | null;
      script: string;
      outline: Array<{ section: string; anchor_ids_used: string[]; summary: string }>;
      unused_anchors: string[];
    }>(`/api/videos/${videoId}/script/draft`, { method: 'POST', body: JSON.stringify(body) }),

  suggestAnchorsBySection: (
    videoId: string,
    body: {
      transformation?: string;
      sections: Array<
        Pick<ScriptSection, 'id' | 'label' | 'kind' | 'brief'> & {
          // Already-picked anchor IDs that Claude must treat as locked.
          // Used by the additive re-suggest flow so existing picks survive
          // and Claude only suggests complements.
          locked_anchor_ids?: string[];
        }
      >;
    }
  ) =>
    request<{ assignments: Array<{ section_id: string; picks: Array<{ anchor_id: string; why: string }> }> }>(
      `/api/videos/${videoId}/script/suggest-by-section`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  draftSectionedScript: (
    videoId: string,
    body: { transformation?: string; sections: ScriptSection[]; save?: boolean }
  ) =>
    request<{
      sections: Array<{ section_id: string; label: string; text: string; anchor_ids: string[] }>;
      script: string;
    }>(`/api/videos/${videoId}/script/draft-sectioned`, { method: 'POST', body: JSON.stringify(body) }),

  saveScriptSections: (videoId: string, sections: ScriptSection[]) =>
    request<{ ok: true }>(`/api/videos/${videoId}/script/sections`, {
      method: 'PATCH',
      body: JSON.stringify({ sections }),
    }),

  brainstorm: () => request<BrainstormResponse>('/api/brainstorm'),

  skills: () => request<{ items: Array<{ id: string; name: string; summary: string; trigger_summary: string; pack: string; category: string }> }>('/api/skills'),
  getSkill: (id: string) => request<{ id: string; name: string; trigger_summary: string; full_md: string; pack: string; location: string }>(`/api/skills/${id}`),

  archivePovs: () => request<{ items: Array<{ id: string; title: string; format: string; category: string; opinion: string }> }>('/api/archive/povs'),

  profile: () => request<{ items: Array<{ id: string; title: string; summary: string; phase: string; sort_order: number; completion: number; updated_at: number }>; overall_completion: number; slots_populated?: number; slots_total?: number; extraction_status?: 'idle' | 'running' | 'completed' | 'error'; extraction_error?: string | null; extraction_result?: Record<string, unknown> | null }>('/api/profile'),
  getProfileSection: (id: string) => request<{ id: string; title: string; content: string; summary: string; phase: string; completion: number; updated_at: number }>(`/api/profile/${id}`),
  bridgeHealth: () => request<{ ok: boolean; claude_bin: string | null; error: string | null }>('/api/profile/bridge-health'),

  getPov: (id: string) => request<{ id: string; title: string; format: string; content?: string }>(`/api/archive/povs/${id}`),
  archiveTranscripts: () => request<{ items: Array<{ id: string; filename: string; title?: string; type: string; date?: number; processed: number; summary?: string; client?: string | null; youtube_url?: string | null; has_raw?: boolean }> }>('/api/archive/transcripts'),
  // Upload a transcript file. The server auto-detects category from
  // filename (yt-* → video, workshop* → workshop, client*/coaching*
  // → client, anything else → qa) and saves to the right
  // 05_Assets/Transcripts/<folder>/. Returns the new transcript's id
  // so the caller can immediately kick off extraction.
  uploadTranscript: async (file: File, type?: 'qa' | 'workshop' | 'video' | 'client') => {
    const form = new FormData();
    form.append('file', file);
    if (type) form.append('type', type);
    // Manually call fetch here because the shared request() helper sets
    // a JSON Content-Type; for multipart the browser needs to set its
    // own boundary header. Still go through /api so the Vite proxy +
    // X-Dashboard-Password header apply.
    const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
    const res = await fetch(`${API_URL}/api/archive/transcripts/upload`, {
      method: 'POST',
      headers: { 'X-Dashboard-Password': 'dev' },
      body: form,
    });
    if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
    return (await res.json()) as {
      ok: true;
      id: string | null;
      type: string;
      filename: string;
      rel_path: string;
      auto_detected_type: boolean;
    };
  },
  runExtraction: (transcriptId: string) =>
    request<{ quotes: ExtractedQuote[]; total: number }>(
      `/api/extracts/${transcriptId}/run`,
      { method: 'POST' },
    ),
  getTranscript: (id: string) => request<{ id: string; filename: string; title?: string; type: string; date?: number; processed: number; summary?: string; summary_content?: string; pov_count?: number; content?: string; youtube_url?: string | null; has_raw?: boolean }>(`/api/archive/transcripts/${id}`),
  archiveVideos: () => request<{ items: Array<{ id: string; title: string; publish_date?: number; view_count?: number; ctr_pct?: number; youtube_url?: string }> }>('/api/archive/videos'),
  getArchiveVideo: (id: string) => request<{ id: string; title: string; script_content?: string; youtube_url?: string; publish_date?: number; view_count?: number }>(`/api/archive/videos/${id}`),

  // ─── Audience quotes (verbatim quotes BY audience members) ─────────────
  listAudienceQuotes: (params?: { transcript_id?: string; avatar_id?: string; category?: AudienceQuoteCategory }) => {
    const q = new URLSearchParams();
    if (params?.transcript_id) q.set('transcript_id', params.transcript_id);
    if (params?.avatar_id) q.set('avatar_id', params.avatar_id);
    if (params?.category) q.set('category', params.category);
    const qs = q.toString();
    return request<{ quotes: AudienceQuote[] }>(`/api/audience-quotes${qs ? '?' + qs : ''}`);
  },
  runAudienceExtract: (transcriptId: string) =>
    request<{ quotes: AudienceQuote[]; total: number }>(`/api/audience-quotes/${transcriptId}/extract`, { method: 'POST' }),
  updateAudienceQuote: (id: string, body: Partial<Pick<AudienceQuote, 'text' | 'speaker_label' | 'category' | 'avatar_id' | 'status' | 'title'>>) =>
    request<{ ok: true; quote: AudienceQuote }>(`/api/audience-quotes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  audienceQuoteToProofBank: (id: string) =>
    request<{ ok: true; proof_id: string; alreadyExisted?: boolean }>(`/api/audience-quotes/${id}/to-proof-bank`, { method: 'POST' }),
  deleteAudienceQuote: (id: string) =>
    request<{ ok: true }>(`/api/audience-quotes/${id}`, { method: 'DELETE' }),

  // ─── Extracts (verbatim quote extraction from transcripts) ────────────
  listExtracts: (transcriptId: string) =>
    request<{ quotes: ExtractedQuote[] }>(`/api/extracts/${transcriptId}`),
  runExtract: (transcriptId: string) =>
    request<{ quotes: ExtractedQuote[]; total: number }>(`/api/extracts/${transcriptId}/run`, { method: 'POST' }),
  patchExtract: (transcriptId: string, quoteId: string, body: { text?: string; tag?: QuoteTag; context?: string; title?: string; topics?: string[] }) =>
    request<{ quote: ExtractedQuote }>(`/api/extracts/${transcriptId}/${quoteId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  dismissExtract: (transcriptId: string, quoteId: string) =>
    request<{ ok: true }>(`/api/extracts/${transcriptId}/${quoteId}`, { method: 'DELETE' }),
  approveExtract: (transcriptId: string, quoteId: string) =>
    request<{ ok: true; destination: string }>(`/api/extracts/${transcriptId}/${quoteId}/approve`, { method: 'POST' }),
  unapproveExtract: (transcriptId: string, quoteId: string) =>
    request<{ ok: true; quote: ExtractedQuote }>(`/api/extracts/${transcriptId}/${quoteId}/unapprove`, { method: 'POST' }),
  queueExtractToIg: (transcriptId: string, quoteId: string) =>
    request<{ ok: true; queue_id: string }>(`/api/extracts/${transcriptId}/${quoteId}/queue-ig`, { method: 'POST' }),
  unqueueExtractFromIg: (transcriptId: string, quoteId: string) =>
    request<{ ok: true; quote: ExtractedQuote }>(`/api/extracts/${transcriptId}/${quoteId}/unqueue-ig`, { method: 'POST' }),
  combineExtracts: (transcriptId: string, quoteIds: string[]) =>
    request<{ story: ExtractedQuote }>(`/api/extracts/${transcriptId}/combine`, {
      method: 'POST',
      body: JSON.stringify({ quote_ids: quoteIds }),
    }),

  // ─── Instagram queue ─────────────────────────────────────────────────
  igQueue: () =>
    request<{ items: IgQueueItem[]; counts: { queued: number; filmed: number; posted: number; dismissed: number } }>(
      '/api/instagram/queue'
    ),
  createIgIdea: (body: {
    title?: string;
    text?: string;
    tag?: QuoteTag;
    context?: string;
    timestamp?: string;
    source_transcript_id?: string;
    source_transcript_filename?: string;
    source_moments?: SourceMoment[];
    kind?: ExtractedKind;
    quote_id?: string;
  }) =>
    request<{ ok: true; item: IgQueueItem }>('/api/instagram/queue', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateIgItem: (id: string, body: Partial<Pick<IgQueueItem, 'status' | 'text' | 'title' | 'posted_url' | 'queue_order' | 'tag' | 'caption' | 'caption_hashtags' | 'posted_at' | 'view_count' | 'share_count' | 'comment_count' | 'chosen_hook'>>) =>
    request<{ ok: true; item: IgQueueItem }>(`/api/instagram/queue/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteIgItem: (id: string) =>
    request<{ ok: true }>(`/api/instagram/queue/${id}`, { method: 'DELETE' }),
  generateIgCaption: (id: string) =>
    request<{ ok: true; item: IgQueueItem }>(`/api/instagram/queue/${id}/caption`, { method: 'POST' }),
  generateIgHooks: (id: string) =>
    request<{ ok: true; hooks: string[] }>(`/api/instagram/queue/${id}/hooks`, { method: 'POST' }),
  markIgEditing: (id: string) =>
    request<{ ok: true; expected_filename: string; dropbox_path: string; item: IgQueueItem }>(
      `/api/instagram/queue/${id}/mark-editing`,
      { method: 'POST' }
    ),
  igNextFreeSlot: () =>
    request<{ scheduled_for: number; post_time_local: string; tz: string }>('/api/instagram/next-free-slot'),
  scheduleIgPost: (id: string, body: { chosen_hook: string; caption?: string; scheduled_for?: number }) =>
    request<{ ok: true; item: IgQueueItem }>(`/api/instagram/queue/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reorderIgQueue: (order: string[]) =>
    request<{ ok: true }>(`/api/instagram/queue/reorder`, {
      method: 'POST',
      body: JSON.stringify({ order }),
    }),
  igOutput: () =>
    request<{
      months: Array<{
        year: number;
        month: number;
        label: string;
        days_in_month: number;
        days: Array<{ day: number; count: number }>;
      }>;
      target_per_week: number;
      source: 'instagram_graph_api' | 'manual_posted_status';
      synced_post_count: number;
    }>('/api/instagram/output'),
  setIgTarget: (target_per_week: number) =>
    request<{ ok: true }>('/api/instagram/output/target', {
      method: 'PATCH',
      body: JSON.stringify({ target_per_week }),
    }),
  igAccount: () =>
    request<{ handle: string | null; profile_url: string | null }>('/api/instagram/account'),
  igSyncStatus: () =>
    request<{ configured: boolean; post_count: number; latest_post_at: number | null; handle: string | null }>(
      '/api/instagram/sync/status'
    ),
  syncInstagram: () =>
    request<{ ok: boolean; synced: number; new: number; error?: string; last_synced_at: number }>(
      '/api/instagram/sync',
      { method: 'POST' }
    ),


  updateBrainstorm: (id: string, body: { answer?: string; completed?: boolean; deleted?: boolean }) =>
    request<BrainstormQuestion>(`/api/brainstorm/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBrainstorm: (id: string) =>
    request<{ ok: true }>(`/api/brainstorm/${id}`, { method: 'DELETE' }),
  brainstormToBank: (id: string, dim: 'pov' | 'value' | 'authority' | 'connection') =>
    request<{ ok: true; dim: string; path: string; bank_id?: string }>(
      `/api/brainstorm/${id}/to-bank`,
      { method: 'POST', body: JSON.stringify({ dim }) }
    ),

  thisWeek: () => request<ThisWeekResponse>('/api/today/this-week'),
  setPinned: (id: string, pinned: boolean) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned_today: pinned }),
    }),

  deepWorkToday: (q?: { date?: string; day_start?: number }) => {
    const params = new URLSearchParams();
    if (q?.date) params.set('date', q.date);
    if (q?.day_start) params.set('day_start', String(q.day_start));
    const qs = params.toString();
    return request<DeepWorkTodayResponse>(`/api/deep-work/today${qs ? `?${qs}` : ''}`);
  },
  calendarEvents: (q: { date: string; day_start: number }) => {
    const params = new URLSearchParams({
      date: q.date,
      day_start: String(q.day_start),
    });
    return request<{ configured: boolean; connected: boolean; events: CalendarEvent[] }>(
      `/api/calendar/events?${params.toString()}`
    );
  },
  googleStatus: () => request<{ configured: boolean; connected: boolean; email: string | null }>('/api/google/status'),
  googleConnectUrl: () => request<{ url: string }>('/api/google/connect-url'),
  googleDisconnect: () => request<{ ok: true }>('/api/google/disconnect', { method: 'POST' }),
  pickableTasks: () => request<{ items: PickableTask[] }>('/api/deep-work/pickable-tasks'),
  startDeepWork: (input?: string | { label?: string; task_id?: string; category?: string }) => {
    const body =
      typeof input === 'string' || input === undefined
        ? { label: input ?? undefined }
        : input;
    return request<DeepWorkBlock>('/api/deep-work/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  finishDeepWork: (id: string) =>
    request<DeepWorkBlock>(`/api/deep-work/${id}/finish`, { method: 'POST' }),
  updateDeepWork: (
    id: string,
    patch: { started_at?: number; ended_at?: number | null; category?: string }
  ) =>
    request<DeepWorkBlock>(`/api/deep-work/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  logDeepWork: (input: {
    label?: string;
    task_id?: string;
    category?: string;
    started_at: number;
    ended_at: number;
  }) =>
    request<DeepWorkBlock>('/api/deep-work/log', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteDeepWork: (id: string) =>
    request<{ ok: true }>(`/api/deep-work/${id}`, { method: 'DELETE' }),
  setDeepWorkTarget: (seconds: number) =>
    request<{ ok: true; seconds: number }>('/api/deep-work/target', { method: 'PATCH', body: JSON.stringify({ seconds }) }),

  getSettings: () =>
    request<{
      youtube_target_per_weeks: number;
      deep_work_target_seconds: number;
      instagram_cta_text: string;
      instagram_cta_url: string;
      youtube_cta_text: string;
      youtube_cta_url: string;
      // Legacy aliases - both point at the Instagram pair.
      focus_cta_text: string;
      focus_cta_url: string;
      ig_cta_text: string;
      ig_cta_url: string;
    }>('/api/settings'),
  updateSettings: (body: Partial<{
    youtube_target_per_weeks: number;
    deep_work_target_seconds: number;
    long_form_per_week: number;
    short_form_per_week: number;
    instagram_cta_text: string;
    instagram_cta_url: string;
    youtube_cta_text: string;
    youtube_cta_url: string;
    // Live SS metrics - settable inline from the Focus page big number.
    ss_members: number;
    ss_mrr_usd: number;
    // Still accepted for backward compat - writes through to Instagram pair.
    focus_cta_text: string;
    focus_cta_url: string;
  }>) =>
    request<{ ok: true }>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }),

  stripeStatus: () =>
    request<{ total_usd: number; last_sync_at: number | null; charge_count: number | null; configured: boolean }>('/api/stripe/status'),
  stripeSync: () =>
    request<{ ok: true; total_usd: number; charge_count: number; last_sync_at: number }>('/api/stripe/sync', { method: 'POST' }),

  updateInboxItem: (id: string, body: { status: InboxItem['status'] }) =>
    request<InboxItem>(`/api/inbox/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  syncLog: () => request<{ items: SyncLogEntry[] }>('/api/sync/log'),
  triggerSync: () => request<{ ok: true }>('/api/sync/trigger', { method: 'POST' }),

  brand: () =>
    request<{
      overall_score: number;
      value: BrandDimension;
      authority: BrandDimension;
      pov: BrandDimension;
      connection: BrandDimension;
      sections: BrandSection[];
    }>('/api/brand'),

  reputation: () => request<ReputationResponse>('/api/reputation'),
  setVideoTransformation: (id: string, tied: boolean) =>
    request<{ ok: true; tied_to_transformation: boolean }>(`/api/videos/${id}/transformation`, {
      method: 'PATCH',
      body: JSON.stringify({ tied }),
    }),
  generateVideoDescription: (id: string, transcript?: string) =>
    request<{ ok: true; description: string; generated_at: number }>(
      `/api/videos/${id}/description`,
      {
        method: 'POST',
        body: transcript ? JSON.stringify({ transcript }) : undefined,
      },
    ),
  updateVideoDescription: (id: string, description: string) =>
    request<{ ok: true }>(`/api/videos/${id}/description`, {
      method: 'PATCH',
      body: JSON.stringify({ description }),
    }),
  suggestIntroFromScript: (id: string) =>
    request<{
      ok: true;
      parts: { clarity: string; belief: string; contrarian: string; proof: string; outcome: string };
    }>(`/api/videos/${id}/intro/from-script`, { method: 'POST' }),
  // Transcript vault wiring per video.
  getVideoTranscript: (id: string) =>
    request<{
      match: {
        rel_path: string;
        filename: string;
        title: string;
        youtube_id: string | null;
        youtube_url: string | null;
      } | null;
      source: 'linked' | 'detected' | null;
    }>(`/api/videos/${id}/transcript`),
  uploadVideoTranscript: (id: string, filename: string, text: string) =>
    request<{ ok: true; rel_path: string; created: boolean }>(
      `/api/videos/${id}/transcript/upload`,
      { method: 'POST', body: JSON.stringify({ filename, text }) },
    ),
  linkVideoTranscript: (id: string, rel_path: string) =>
    request<{ ok: true; rel_path: string }>(`/api/videos/${id}/transcript/link`, {
      method: 'POST',
      body: JSON.stringify({ rel_path }),
    }),
  unlinkVideoTranscript: (id: string) =>
    request<{ ok: true }>(`/api/videos/${id}/transcript`, { method: 'DELETE' }),
  listYoutubeTranscripts: () =>
    request<{
      items: Array<{
        rel_path: string;
        filename: string;
        slug: string;
        title: string;
        youtube_id: string | null;
        youtube_url: string | null;
        mtime: number;
      }>;
    }>('/api/videos/transcripts/youtube'),
  setReputationSlot: (slot: string, value: string | null) =>
    request<{ ok: true }>('/api/reputation/slots', {
      method: 'PATCH',
      body: JSON.stringify({ slot, value }),
    }),
  setReputationRating: (slot: string, score: number) =>
    request<{ ok: true }>('/api/reputation/ratings', {
      method: 'PATCH',
      body: JSON.stringify({ slot, score }),
    }),
  toggleProofPin: (id: string, pinned: boolean) =>
    request<{ ok: true; pinned_proof_ids: string[] }>('/api/reputation/proof-pin', {
      method: 'PATCH',
      body: JSON.stringify({ id, pinned }),
    }),
  addReputationPov: (body: {
    title: string;
    category?: string;
    common_belief?: string;
    my_pov?: string;
    story_behind?: string;
    how_i_use?: string;
  }) =>
    request<{ ok: true; id: string }>('/api/reputation/povs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateReputationPov: (
    id: string,
    body: {
      title?: string;
      common_belief?: string | null;
      my_pov?: string | null;
      story_behind?: string | null;
      how_i_use?: string | null;
    }
  ) =>
    request<{ ok: true }>(`/api/reputation/povs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteReputationPov: (id: string) =>
    request<{ ok: true }>(`/api/reputation/povs/${id}`, { method: 'DELETE' }),
  addMicroStory: (body: {
    text: string;
    source_episode?: string;
    status?: 'candidate' | 'confirmed' | 'rejected';
    tags?: string[];
  }) =>
    request<{ ok: true; id: string }>('/api/reputation/micro-stories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMicroStory: (
    id: string,
    body: { text?: string; status?: 'candidate' | 'confirmed' | 'rejected'; tags?: string[] }
  ) =>
    request<{ ok: true }>(`/api/reputation/micro-stories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteMicroStory: (id: string) =>
    request<{ ok: true }>(`/api/reputation/micro-stories/${id}`, { method: 'DELETE' }),

  // Move an approved bank entry between dimensions (Value / Authority /
  // Connection / POV). Reads from source bank, removes, writes to target.
  moveBankEntry: (body: { entry_id: string; from: DimKind; to: DimKind }) =>
    request<{ ok: true; new_id?: string; new_path?: string; note?: string }>(
      '/api/reputation/banks/move',
      { method: 'POST', body: JSON.stringify(body) }
    ),
  setBankEntryTags: (kind: DimKind, entryId: string, tags: string[]) =>
    request<{ ok: true }>(`/api/reputation/banks/${kind}/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ tags }),
    }),
  setStoryAction: (id: string, done: boolean) =>
    request<{ ok: true }>(`/api/reputation/story-actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    }),
  addReputationWin: (body: {
    title: string;
    body?: string;
    date?: number;
    kind?: 'own' | 'student' | 'client';
    status?: 'candidate' | 'confirmed' | 'rejected';
    tags?: string[];
  }) =>
    request<{ ok: true; id: string }>('/api/reputation/wins', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateReputationWin: (
    id: string,
    body: {
      title?: string;
      body?: string;
      kind?: 'own' | 'student' | 'client';
      status?: 'candidate' | 'confirmed' | 'rejected';
      tags?: string[];
    }
  ) =>
    request<{ ok: true }>(`/api/reputation/wins/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteReputationWin: (id: string) =>
    request<{ ok: true }>(`/api/reputation/wins/${id}`, { method: 'DELETE' }),
  getContentAnalysis: () =>
    request<{ analysis: ContentAnalysisResult | null }>('/api/reputation/content-analysis'),
  refreshContentAnalysis: () =>
    request<{ analysis: ContentAnalysisResult }>('/api/reputation/content-analysis/refresh', {
      method: 'POST',
    }),

  offers: () => request<OfferResponse>('/api/offers'),
  setOfferSlot: (slot: string, value: string | null) =>
    request<{ ok: true }>('/api/offers/slots', {
      method: 'PATCH',
      body: JSON.stringify({ slot, value }),
    }),
  // Per-rung slot writer. Each rung's validation/proof state lives at
  // offer_rung_<rungId>_<slot> so what's ticked on one offer doesn't
  // bleed into another.
  setRungSlot: (rungId: string, slot: string, value: string | null) =>
    request<{ ok: true }>(`/api/offers/pricing-rungs/${rungId}/slots`, {
      method: 'PATCH',
      body: JSON.stringify({ slot, value }),
    }),
  // Toggle a proof bank entry's pin for this specific rung. Each rung
  // has its own pin set so pinning the same bank entry on rung A
  // doesn't pin it on rung B.
  toggleRungProofPin: (rungId: string, proofId: string, pinned: boolean) =>
    request<{ ok: true; pinned_proof_ids: string[] }>(
      `/api/offers/pricing-rungs/${rungId}/proof-pin`,
      { method: 'PATCH', body: JSON.stringify({ id: proofId, pinned }) },
    ),
  setOfferRating: (slot: string, score: number) =>
    request<{ ok: true }>('/api/offers/ratings', {
      method: 'PATCH',
      body: JSON.stringify({ slot, score }),
    }),
  setOfferStage: (stage: string) =>
    request<{ ok: true }>('/api/offers/stage', { method: 'PATCH', body: JSON.stringify({ stage }) }),
  addOfferAvatar: (body: {
    name: string;
    one_line?: string;
    price_point?: string;
    before_state?: string;
    after_state?: string;
    demographics?: string;
    struggles?: string[];
    outcomes?: string[];
  }) =>
    request<{ ok: true; id: string }>('/api/offers/avatars', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateOfferAvatar: (id: string, body: Partial<OfferAvatar>) =>
    request<{ ok: true }>(`/api/offers/avatars/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOfferAvatar: (id: string) =>
    request<{ ok: true }>(`/api/offers/avatars/${id}`, { method: 'DELETE' }),
  generateAvatarImage: (id: string) =>
    request<{ ok: true; image_path: string; prompt: string }>(
      `/api/offers/avatars/${id}/generate-image`,
      { method: 'POST' },
    ),
  // Upload your own image for the avatar (skips Gemini generation).
  // Multipart upload; server saves the file into the same images dir
  // the AI generator uses and PATCHes image_path on the avatar.
  uploadAvatarImage: async (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
    const res = await fetch(`${API_URL}/api/offers/avatars/${id}/upload-image`, {
      method: 'POST',
      headers: { 'X-Dashboard-Password': 'dev' },
      body: form,
    });
    if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
    return (await res.json()) as { ok: true; image_path: string; size_bytes: number };
  },
  // Generate a one-sentence card-sized summary for the avatar sub-card.
  // Persists on the avatar as `card_summary`. Fires once per avatar
  // automatically (via AvatarSubCard's useEffect) but can be re-run
  // manually from the avatar editor.
  generateAvatarCardSummary: (id: string) =>
    request<{ ok: true; card_summary: string }>(
      `/api/offers/avatars/${id}/generate-card-summary`,
      { method: 'POST' },
    ),
  addPricingResult: (body: { title: string; body?: string; kind?: 'own' | 'customer'; metric?: string; status?: OfferPricingResult['status'] }) =>
    request<{ ok: true; id: string }>('/api/offers/pricing-results', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePricingResult: (id: string, body: Partial<OfferPricingResult>) =>
    request<{ ok: true }>(`/api/offers/pricing-results/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePricingResult: (id: string) =>
    request<{ ok: true }>(`/api/offers/pricing-results/${id}`, { method: 'DELETE' }),
  addPricingRung: (body: {
    price_label: string;
    name?: string;
    proof_required?: string | null;
    status?: OfferPricingRung['status'];
    sort_order?: number;
    tier?: OfferPricingRung['tier'];
    avatar_id?: string | null;
  }) =>
    request<{ ok: true; id: string }>('/api/offers/pricing-rungs', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePricingRung: (id: string, body: Partial<OfferPricingRung>) =>
    request<{ ok: true }>(`/api/offers/pricing-rungs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePricingRung: (id: string) =>
    request<{ ok: true }>(`/api/offers/pricing-rungs/${id}`, { method: 'DELETE' }),
  setFeaturedRung: (id: string, featured: boolean) =>
    request<{ ok: true }>('/api/offers/pricing-rungs/featured', {
      method: 'PATCH',
      body: JSON.stringify({ id, featured }),
    }),
  analyzeRungSection: (id: string, section: 'avatar' | 'pricing' | 'proof' | 'validation' | 'content') =>
    request<{ ok: true; scores: number[]; reasoning: string[] }>(
      `/api/offers/pricing-rungs/${id}/analyze`,
      { method: 'POST', body: JSON.stringify({ section }) }
    ),
  synthesiseAvatar: (id: string) =>
    request<{
      ok: true;
      before_state: string;
      struggles: string[];
      after_state: string;
      outcomes: string[];
    }>(`/api/offers/avatars/${id}/synthesise`, { method: 'POST' }),
  // Check whether the Cloudflare-worker link manifest exists. If not, the
  // setup_prompt comes back so the UI can show "paste this into Claude".
  getTrackingSetupStatus: () =>
    request<{
      ok: boolean;
      manifest_exists: boolean;
      worker_exists: boolean;
      manifest_path: string;
      worker_path: string;
      deploy_command: string;
      setup_prompt: string | null;
    }>('/api/offers/tracking-setup-status'),
  // Generate the VSL's /go/<slug> short link. Destination = the rung's
  // sales_page_url (the VSL drives viewers to the sales page). Both
  // urls must be set first. Server adds the entry to link_manifest.json
  // and patches the rung's vsl_tracking_slug. Returns the deploy
  // command the creator runs in her terminal to push the new slug live.
  // Pull lifetime stats from YouTube Data API v3 for any video URL.
  // Used by the offer Conversions panel to auto-fill VSL view counts.
  // Returns ok+views or error (no key, bad URL, video not found, etc).
  // Fetch aggregated click counts for a /go/<slug> short link via the
  // dashboard's worker-proxy endpoint. Returns the worker's response or
  // an error if the worker isn't deployed / slug not in manifest.
  getLinkStats: (slug: string, days = 30) =>
    request<{
      ok: true;
      slug: string;
      days: number;
      clicks: number;
      total_lifetime: number;
    }>(`/api/offers/link-stats?slug=${encodeURIComponent(slug)}&days=${days}`),
  getYouTubeVideoStats: (url: string) =>
    request<{
      ok: true;
      video_id: string;
      views: number;
      likes: number;
      comments: number;
      duration_sec: number;
    }>(`/api/youtube/video-stats?url=${encodeURIComponent(url)}`),
  generateRungTrackingLink: (id: string, kind: 'vsl') =>
    request<{
      ok: true;
      slug: string;
      short_url: string;
      deploy_command: string;
      needs_deploy: true;
    }>(`/api/offers/pricing-rungs/${id}/generate-tracking-link`, {
      method: 'POST',
      body: JSON.stringify({ kind }),
    }),
  // ─── Emails (per-offer upstream-link list) ────────────────────────────
  listOfferEmails: (rungId: string) =>
    request<{ items: OfferEmail[] }>(`/api/offers/pricing-rungs/${rungId}/emails`),
  addOfferEmail: (rungId: string, body: Partial<OfferEmail>) =>
    request<{ ok: true; id: string }>(`/api/offers/pricing-rungs/${rungId}/emails`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateOfferEmail: (id: string, body: Partial<OfferEmail>) =>
    request<{ ok: true }>(`/api/offers/emails/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteOfferEmail: (id: string) =>
    request<{ ok: true }>(`/api/offers/emails/${id}`, { method: 'DELETE' }),
  // (generateEmailTrackingLink removed - emails track conversion rate
  // manually now, no /go/ link per email)
  // ─── Short-form per-platform tracking links ───────────────────────────
  listShortFormLinks: (rungId: string) =>
    request<{ items: OfferShortFormLink[] }>(`/api/offers/pricing-rungs/${rungId}/short-form-links`),
  addShortFormLink: (rungId: string, body: Partial<OfferShortFormLink>) =>
    request<{ ok: true; id: string }>(`/api/offers/pricing-rungs/${rungId}/short-form-links`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateShortFormLink: (id: string, body: Partial<OfferShortFormLink>) =>
    request<{ ok: true }>(`/api/offers/short-form-links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteShortFormLink: (id: string) =>
    request<{ ok: true }>(`/api/offers/short-form-links/${id}`, { method: 'DELETE' }),
  generateShortFormTrackingLink: (id: string) =>
    request<{ ok: true; slug: string; short_url: string; deploy_command: string; needs_deploy: true }>(
      `/api/offers/short-form-links/${id}/generate-tracking-link`,
      { method: 'POST' },
    ),
  addOfferTestimonial: (body: Partial<OfferTestimonial>) =>
    request<{ ok: true; id: string }>('/api/offers/testimonials', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateOfferTestimonial: (id: string, body: Partial<OfferTestimonial>) =>
    request<{ ok: true }>(`/api/offers/testimonials/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteOfferTestimonial: (id: string) =>
    request<{ ok: true }>(`/api/offers/testimonials/${id}`, { method: 'DELETE' }),

  // ─── Journey timeline ────────────────────────────────────────────────
  journey: () => request<JourneyTimeline>('/api/journey'),
  setJourneyStart: (start_date: string) =>
    request<JourneyTimeline>('/api/journey', {
      method: 'PATCH',
      body: JSON.stringify({ start_date }),
    }),
  addJourneyEntry: (body: {
    date: string;
    type: JourneyEntryType;
    title: string;
    body?: string;
    tags?: string[];
    image_url?: string;
  }) =>
    request<{ ok: true; entry: JourneyEntry }>('/api/journey/entries', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateJourneyEntry: (
    id: string,
    body: Partial<{
      date: string;
      type: JourneyEntryType;
      title: string;
      body: string | null;
      tags: string[];
      side: 'top' | 'bottom';
      lane: number;
      vertical_offset: number | null;
      image_url: string | null;
    }>,
  ) =>
    request<{ ok: true; entry: JourneyEntry }>(`/api/journey/entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteJourneyEntry: (id: string) =>
    request<{ ok: true }>(`/api/journey/entries/${id}`, { method: 'DELETE' }),
  uploadJourneyImage: (filename: string, data_b64: string) =>
    request<{ ok: true; url: string }>('/api/journey/upload-image', {
      method: 'POST',
      body: JSON.stringify({ filename, data_b64 }),
    }),

  // ─── Client decks ─────────────────────────────────────────────────────
  decks: () => request<{ decks: DeckEntry[] }>('/api/decks'),
  publishDeck: (deckPath: string) =>
    request<{
      ok: true;
      url: string;
      deployment_url: string | null;
      published_at: number;
      deck_count: number;
    }>('/api/decks/publish', {
      method: 'POST',
      body: JSON.stringify({ path: deckPath }),
    }),
  createDeckFromTemplate: (body: { template: string; client_folder: string; name: string }) =>
    request<{ ok: true; path: string }>('/api/decks/from-template', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export type DeckType = 'strategy-deck' | 'content-world';

export interface DeckEntry {
  path: string;
  client: string;
  client_slug: string;
  filename: string;
  type: DeckType;
  mtime: number;
  published_url: string | null;
  last_published_at: number | null;
}

// Build the URL that opens a deck in a new tab via the dashboard server. The
// pw is in the URL because <a target="_blank"> can't send a custom header.
// In dev API_URL is '' (Vite proxies /api/*). new URL needs an absolute base,
// so we anchor against window.location.origin.
export function deckEditorUrl(deckPath: string): string {
  const pw = getStoredPassword() ?? '';
  const base = API_URL || window.location.origin;
  const u = new URL('/api/decks/file', base);
  u.searchParams.set('path', deckPath);
  u.searchParams.set('pw', pw);
  return u.toString();
}

export type JourneyEntryType = 'win' | 'failure' | 'lesson' | 'avatar';
export interface JourneyEntry {
  id: string;
  date: string;
  type: JourneyEntryType;
  title: string;
  body?: string;
  tags?: string[];
  side?: 'top' | 'bottom';
  lane?: number;
  vertical_offset?: number;
  image_url?: string;
  created_at: number;
  updated_at: number;
}
export interface JourneyTimeline {
  start_date: string;
  entries: JourneyEntry[];
}

export interface OfferProfile {
  name: string | null;
  transformation: string | null;
  big_promise: string | null;
  mechanism: string | null;
  who_youre_selling_to: string | null;
}

export interface OfferCheckQ {
  id: string;
  question: string;
  self_rate: number;
}

export interface OfferLever {
  id: 'clarity' | 'likelihood' | 'time_delay' | 'effort_sacrifice';
  label: string;
  hormozi_role: 'numerator' | 'denominator';
  color: string;
  score: number;
  self_rate_avg: number;
  section_signal: number;
  offercheck_qs: OfferCheckQ[];
  feeds_from_sections: string[];
}

export interface OfferAvatar {
  id: string;
  name: string | null;
  one_line: string | null;
  price_point: string | null;
  before_state: string | null;
  after_state: string | null;
  demographics: string | null;
  struggles: string[];
  outcomes: string[];
  // Path to a generated portrait under 05_Assets/Avatars/images/, served
  // via /api/vault-asset/<image_path>. Null when no image has been
  // generated yet.
  image_path?: string | null;
  // One-sentence card-sized description (~12-20 words), generated by
  // Claude specifically to fit the per-rung avatar sub-card. Distinct
  // from one_line (which can be a long paragraph from the parsed .md).
  card_summary?: string | null;
  // Read-only source-of-truth markdown file path (e.g. 05_Assets/Avatars/
  // avatar-the-avatar.md). Server fills this when the avatar matches a file.
  source_file?: string | null;
}

export interface OfferTestimonial {
  id: string;
  client_name: string | null;
  body: string | null;
  before_state: string | null;
  after_state: string | null;
  metric: string | null;
  timeline: string | null;
  avatar_match: string | null;
  status: 'candidate' | 'confirmed' | 'rejected';
}

export interface OfferFieldStatus {
  id: string;
  label: string;
  filled: boolean;
  source: string;
  value?: string | null;
  prompt?: string;
}

export interface OfferPricingRung {
  id: string;
  // the creator-facing label for the offer's price (e.g. "$47/mo", "$10K+").
  price_label: string;
  // Short name for the offer (e.g. "the offer", "OS Builds").
  // Sits next to the price in the row head.
  name: string;
  // What the offer is - one paragraph. Used to surface what's actually being
  // sold at this tier. Renamed from `proof_required` (the field name on disk
  // is kept the same for back-compat so saved data isn't lost).
  proof_required: string | null;
  // One-sentence specific outcome + timeframe this offer delivers. Shown at
  // the top of the expanded offer card.
  promise: string;
  // Offer-stage equivalent: where this offer is in its lifecycle. Replaces
  // the old achieved/current/target/future ladder.
  status: 'idea' | 'validated' | 'iterating' | 'signature' | 'scaling';
  sort_order: number;
  tier: 'low' | 'mid' | 'high' | 'custom';
  // Optional avatar attached to this rung. Links to an OfferAvatar.id from
  // the avatar section. Null = no avatar assigned yet.
  avatar_id: string | null;
  // Exactly one rung is featured at a time. The featured offer is the creator's
  // current focus - shown big at the top of the suite, and its score flows
  // into Today + Focus pages under the 90-day sprint (Phase 2).
  featured: boolean;
  // ─── Pricing strategy (per offer) ──────────────────────────────────
  goal_price_label: string;
  target_revenue_per_month_usd: number | null;
  target_customers_per_month: number | null;
  pricing_plan: string;
  // ─── Content strategy (per offer) ──────────────────────────────────
  // Per-offer funnel:
  //   Sales Page = the destination. Visitors → buyers (manual, since
  //   checkout lives off-platform). Conversion = buyers / visitors.
  //   VSL = upstream video. Its /go/<vsl-tracking-slug> redirects to the
  //   sales page. Conversion = link_clicks / views = CTR.
  // YouTube content videos (Pass 2) work the same as the VSL - each has
  // its own /go/<slug> pointing at this offer's sales page, managed by
  // the description generator.
  sales_page_url: string;
  sales_page_visitors_30d: number | null;
  sales_page_buyers_30d: number | null;
  vsl_url: string;
  vsl_tracking_slug: string;
  vsl_views_30d: number | null;       // YouTube views in the last 30 days
  vsl_link_clicks_30d: number | null; // clicks on /go/<vsl-tracking-slug>
  content_mentions_per_month: number | null;
  cta_count_per_video: number | null;
  has_email_funnel: boolean;
  direct_from_content: boolean;
  cta_locations: string;
  audience_journey: string;
  cta_frequency: string;
  // 25-question self-rate scores. Five sub-sections × five questions each.
  // 0 = unrated, 1-5 = self-score. See OFFER_QUIZ in Offer.tsx for the
  // canonical question text per index.
  scores: {
    avatar: number[];
    pricing: number[];
    proof: number[];
    validation: number[];
    content: number[];
  };
  // Claude's per-question reasoning from the last analyze call. Same
  // 5-strings-per-section shape as scores. Persists on the rung so it
  // survives panel close; only overwritten when the user re-analyzes.
  reasoning?: {
    avatar: string[];
    pricing: string[];
    proof: string[];
    validation: string[];
    content: string[];
  };
  // Per-rung validation state. Each rung has its own independent
  // ticked checks - what's ticked on the offer doesn't
  // apply to OS Builds. Slots live at offer_rung_<rungId>_vcheck_<id>.
  validation_phases?: OfferValidationPhase[];
  current_validation_phase?: OfferValidationPhase['id'];
  // Per-rung proof state. Promise text + pinned proof IDs per rung
  // (offer_rung_<rungId>_promise_text + offer_rung_<rungId>_pinned_proof_ids).
  // build_completion: 3-field score (promise written / 1+ pinned / 3+ pinned).
  proof_section?: {
    promise_text: string | null;
    pinned_proof_ids: string[];
    build_completion: number;
  };
}

// Per-offer email - one row per email that drives traffic to this
// offer's sales page. Most email platforms surface click + conversion
// rates already, so we just let the creator type the conversion rate in
// manually rather than minting tracking links per email.
export type OfferEmailKind = 'one_time' | 'launch' | 'automated';
export interface OfferEmail {
  id: string;
  rung_id: string;
  subject: string;
  kind: OfferEmailKind;
  // Conversion rate as a percentage (e.g. 2.5 = 2.5%). Manual entry -
  // pulled from whatever your email platform reports.
  conversion_rate_pct: number | null;
  created_at: number;
  updated_at: number;
}

// Per-offer per-platform short-form link - one row per platform the creator
// posts on (Instagram, LinkedIn, TikTok, etc.). tracking_slug is
// server-set via generateShortFormTrackingLink.
//
// Three rolling 30-day metrics per platform:
//   views_30d      - total reach on this platform's posts (manual)
//   clicks_30d     - clicks on /go/<slug> (auto from worker, manual fallback)
//   ctas_made_30d  - count of posts/videos with a CTA (manual)
// Conversion rate (shown per-row) = clicks ÷ views_30d = CTR.
export interface OfferShortFormLink {
  id: string;
  rung_id: string;
  platform: string;
  tracking_slug: string;
  views_30d: number | null;
  clicks_30d: number | null;
  ctas_made_30d: number | null;
  created_at: number;
  updated_at: number;
}

export interface OfferValueCheckField {
  id: string;
  label: string;
  prompt: string;
  value: string | null;
  filled: boolean;
}

export interface OfferPricingResult {
  id: string;
  title: string;
  body: string | null;
  kind: 'own' | 'customer';
  metric: string | null;
  status: 'candidate' | 'confirmed' | 'rejected';
}

export interface OfferContentAction {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
}

export interface OfferConversionDiagnostic {
  rate_pct: number | null;
  current_price_label: string | null;
  parsed_price_usd: number | null;
  bracket: string | null;
  healthy_range: { low: number; high: number } | null;
  verdict: 'too_high' | 'too_low' | 'healthy' | 'unknown';
  message: string;
}

export interface OfferValidationCheck {
  id: string;
  label: string;
  // One-line nudge under the check telling the creator what counts.
  hint?: string | null;
  done: boolean;
}
export interface OfferValidationPhase {
  id: 'idea' | 'validating' | 'iterating' | 'signature' | 'scaling';
  label: string;
  description: string;
  checks: OfferValidationCheck[];
  done_count: number;
  total: number;
  pct_complete: number;
}

export interface OfferSection {
  id: string;
  label: string;
  color: string;
  feeds_levers: string[];
  build: OfferFieldStatus[];
  build_completion: number;
  avatars?: OfferAvatar[];
  testimonials?: OfferTestimonial[];
  // Phased validation checklist - 5 stages from Idea → Scaling, each
  // with its own checkboxes. Done state persists per check in state.md
  // as offer_vcheck_<check_id>. current_validation_phase is the first
  // phase that isn't 100% complete (or "scaling" if everything's done).
  validation_phases?: OfferValidationPhase[];
  current_validation_phase?: OfferValidationPhase['id'];
  pricing_rungs?: OfferPricingRung[];
  value_check_fields?: OfferValueCheckField[];
  pricing_results?: OfferPricingResult[];
  conversion_diagnostic?: OfferConversionDiagnostic;
  content_actions?: OfferContentAction[];
  urgency_text?: string | null;
}

export interface OfferStage {
  id: 'idea' | 'validated' | 'iterating' | 'signature' | 'scaling';
  label: string;
  description: string;
}

export interface OfferResponse {
  offer_id: string;
  offer_profile: OfferProfile;
  stage: OfferStage;
  framing: string;
  levers: OfferLever[];
  sections: OfferSection[];
  overall_score: number;
  offer_strength_score: number;
  hormozi_breakdown: {
    clarity: number;
    likelihood: number;
    time_delay: number;
    effort_sacrifice: number;
    raw: number;
    normalized: number;
  };
}

export interface BrandDimension {
  score: number;
  signals: Record<string, number | string>;
  targets: Record<string, number>;
}

export interface BrandSection {
  id: string;
  title: string;
  detail: string;
  done: boolean;
}

// Reputation Score v2 - full Final Spec shape
export interface ReputationFieldStatus {
  id: string;
  label: string;
  filled: boolean;
  source: string;
  value?: string | null;
  example?: string;
  stale?: boolean;
  prompt?: string;
}

export interface ReputationActivationSignal {
  id: string;
  label: string;
  score: number;
  detail: string;
  computed: 'auto' | 'self-rate';
  raw?: string | number;
}

export interface ReputationAntiPattern {
  flag: string;
  triggered: boolean;
  suggested_fix: string;
  source?: string;
}

export interface ReputationDimension {
  id: string;
  label: string;
  color: string;
  weight: number;
  definition: string;
  build_completion: number;
  activation_score: number;
  output_multiplier_applied: number;
  score: number;
  build: ReputationFieldStatus[];
  activate: ReputationActivationSignal[];
  anti_patterns: ReputationAntiPattern[];
  pov_bank?: ReputationPovEntry[];
  wins_bank?: ReputationWin[];
  proof_bank?: ApprovedBankEntry[];
  // Authority-only. One-sentence promise (what the offer delivers + timeframe)
  // and the ids of wins / authority bank entries pinned as proof for it.
  promise?: string | null;
  pinned_proof_ids?: string[];
  frameworks_bank?: ApprovedBankEntry[];
  pov_transcript_bank?: ApprovedBankEntry[];
  story_core?: string | null;
  story_compressed?: string | null;
  story_actions?: ReputationStoryAction[];
  micro_stories?: ReputationMicroStory[];
}

export interface ApprovedBankEntry {
  id: string;
  text: string;
  title: string | null;
  context: string | null;
  source_transcript: string | null;
  source_timestamp: string | null;
  source_moments: SourceMoment[];
  tags?: string[];
  created_at: number | null;
}

export interface ReputationTransformationAnchor {
  positioning_statement: string | null;
  who_you_help: string | null;
  before_state: string | null;
  after_state: string | null;
  transformation_result: string | null;
  value_share_tags: string[];
  value_dont_share_tags: string[];
}

export interface ReputationPovEntry {
  id: string;
  title: string;
  category?: string | null;
  common_belief?: string | null;
  my_pov?: string | null;
  story_behind?: string | null;
  how_i_use?: string | null;
}

export interface ReputationWin {
  id: string;
  title: string;
  body?: string | null;
  date?: number | null;
  kind: 'own' | 'student' | 'client';
  status: 'candidate' | 'confirmed' | 'rejected';
  source_episode?: string | null;
  tags?: string[];
}

export interface ReputationStoryAction {
  id: string;
  label: string;
  done: boolean;
  hint?: string;
}

export interface ReputationMicroStory {
  id: string;
  text: string;
  source_episode?: string | null;
  source_transcript?: string | null;
  source_timestamp?: string | null;
  title?: string | null;
  source_moments?: SourceMoment[];
  status: 'candidate' | 'confirmed' | 'rejected';
  tags?: string[];
}

export interface ContentAnalysisDimension {
  id: 'value' | 'authority' | 'point_of_view' | 'connection';
  label: string;
  consistency_pct: number;
  what_claude_noticed: string;
  opportunities: string[];
}

export interface ContentAnalysisResult {
  generated_at: number;
  sample_size: number;
  model: string;
  dimensions: ContentAnalysisDimension[];
}

export interface ReputationResponse {
  overall_score: number;
  framing: string;
  transformation_anchor: ReputationTransformationAnchor;
  brand_profile: {
    fields: ReputationFieldStatus[];
    completion: number;
  };
  output_baseline: {
    total_long_form_hours: number;
    hours_on_transformation: number;
    posting_consistency_90d: number;
    current_streak_weeks: number;
    multiplier: number;
    tagged_count: number;
    untagged_count: number;
    missing_duration_count: number;
  };
  dimensions: ReputationDimension[];
  suggestions: Array<{
    dimension: string;
    what_i_noticed: string;
    why_it_matters: string;
    do_this: string;
  }>;
  maturity_stage: {
    id: string;
    label: string;
    description: string;
  };
}

export async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch(`${API_URL}/api/today`, {
    headers: { 'X-Dashboard-Password': password },
  });
  return res.status !== 401;
}
