/**
 * Zoom integration for the dashboard.
 *
 * Members connect their own Zoom Server-to-Server OAuth app and the dashboard
 * polls Zoom every 15 minutes for new cloud recordings with completed
 * transcripts. Each new transcript is dropped into the vault at
 *
 *     <VAULT>/05_Assets/Transcripts/zoom-YYYY-MM-DD_<topic-slug>.md
 *
 * with a frontmatter `call_type` auto-detected from the meeting topic (qa /
 * workshop / client / untagged). The Vault page surfaces these grouped by
 * call_type; users can re-classify in the UI which updates the frontmatter.
 *
 * Credentials live OUTSIDE the vault at ~/.solo-os/zoom-config.json so they
 * never get committed by the user's vault git repo.
 *
 * Last-processed end_time lives at ~/.solo-os/zoom-state.json so each sync
 * only fetches NEW recordings. Cold-start cutoff defaults to the creation
 * date of the config file (i.e. don't backfill years of history on connect).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { abs } from '../vault.js';
import { BRIDGE_URL } from './bridge.js';

const CONFIG_FILE = path.join(os.homedir(), '.solo-os', 'zoom-config.json');
const STATE_FILE = path.join(os.homedir(), '.solo-os', 'zoom-state.json');

// One destination folder per call_type. The Vault page (Archive.tsx) reads
// these same folders and groups by category - dropping into the matching
// folder means new zoom transcripts show up in the right section
// automatically. Untagged goes into a holding-bin folder the user can move
// transcripts out of from the UI later.
const TRANSCRIPT_DIRS: Record<CallType, string[]> = {
  qa: ['05_Assets', 'Transcripts', 'QA-Calls'],
  workshop: ['05_Assets', 'Transcripts', 'Live-Workshops'],
  client: ['05_Assets', 'Transcripts', 'Client-Calls'],
  untagged: ['05_Assets', 'Transcripts', 'Untagged'],
};

export interface ZoomConfig {
  account_id: string;
  client_id: string;
  client_secret: string;
  connected_at: number; // unix seconds; used as cold-start floor for sync
}

export interface ZoomState {
  last_processed_end_time: string | null; // ISO 8601
  last_sync_at: number | null; // unix seconds
  last_sync_count: number; // # transcripts saved in the last run
  last_sync_error: string | null;
}

export interface ZoomMeeting {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  end_time?: string;
  duration: number;
  share_url?: string;
  recording_files: ZoomRecordingFile[];
}

export interface ZoomRecordingFile {
  id: string;
  file_type: string;
  file_extension: string;
  download_url: string;
  recording_start: string;
  recording_end: string;
  status: string;
}

// ─── Config + state I/O ──────────────────────────────────────────────────

export function loadConfig(): ZoomConfig | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.account_id === 'string' &&
      typeof parsed?.client_id === 'string' &&
      typeof parsed?.client_secret === 'string'
    ) {
      return {
        account_id: parsed.account_id,
        client_id: parsed.client_id,
        client_secret: parsed.client_secret,
        connected_at: typeof parsed.connected_at === 'number' ? parsed.connected_at : Math.floor(Date.now() / 1000),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConfig(config: Omit<ZoomConfig, 'connected_at'>): ZoomConfig {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  const full: ZoomConfig = { ...config, connected_at: Math.floor(Date.now() / 1000) };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(full, null, 2) + '\n', 'utf8');
  return full;
}

export function clearConfig(): void {
  try {
    fs.unlinkSync(CONFIG_FILE);
  } catch {
    // already gone
  }
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {
    // already gone
  }
}

export function loadState(): ZoomState {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      last_processed_end_time: typeof parsed?.last_processed_end_time === 'string' ? parsed.last_processed_end_time : null,
      last_sync_at: typeof parsed?.last_sync_at === 'number' ? parsed.last_sync_at : null,
      last_sync_count: typeof parsed?.last_sync_count === 'number' ? parsed.last_sync_count : 0,
      last_sync_error: typeof parsed?.last_sync_error === 'string' ? parsed.last_sync_error : null,
    };
  } catch {
    return { last_processed_end_time: null, last_sync_at: null, last_sync_count: 0, last_sync_error: null };
  }
}

function saveState(state: ZoomState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ─── Zoom API ────────────────────────────────────────────────────────────

interface ListResp {
  total_records: number;
  meetings: ZoomMeeting[];
  next_page_token?: string;
}

async function getAccessToken(config: ZoomConfig): Promise<string> {
  const auth = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${config.account_id}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );
  if (!res.ok) {
    throw new Error(`Zoom token fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function listRecordings(config: ZoomConfig, from: string, to: string): Promise<ZoomMeeting[]> {
  const token = await getAccessToken(config);
  const meetings: ZoomMeeting[] = [];
  let nextPageToken: string | undefined;
  do {
    const url = new URL('https://api.zoom.us/v2/users/me/recordings');
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    url.searchParams.set('page_size', '30');
    if (nextPageToken) url.searchParams.set('next_page_token', nextPageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Zoom listRecordings failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as ListResp;
    meetings.push(...(data.meetings ?? []));
    nextPageToken = data.next_page_token || undefined;
  } while (nextPageToken);
  return meetings;
}

export async function fetchTranscript(config: ZoomConfig, meeting: ZoomMeeting): Promise<string | null> {
  const transcriptFile = meeting.recording_files.find(
    (f) => f.file_type === 'TRANSCRIPT' && f.status === 'completed'
  );
  if (!transcriptFile) return null;
  const token = await getAccessToken(config);
  const res = await fetch(transcriptFile.download_url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Zoom transcript download failed: ${res.status}`);
  }
  return await res.text();
}

// ─── VTT conversion ──────────────────────────────────────────────────────

export function vttToTranscript(vtt: string): string {
  const lines: string[] = [];
  const blocks = vtt.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.includes('-->')) continue;
    const blockLines = block.trim().split('\n');
    const timecodeLine = blockLines.find((l) => l.includes('-->'));
    if (!timecodeLine) continue;
    const startTime = timecodeLine.split('-->')[0]!.trim();
    const short = startTime.replace(/^00:/, '').replace(/\.\d+$/, '');
    const textLines = blockLines.filter((l) => l !== timecodeLine && !/^\d+$/.test(l.trim()));
    const text = textLines.join(' ').trim();
    if (text) lines.push(`[${short}] ${text}`);
  }
  return lines.join('\n');
}

export function extractSpeakers(transcript: string): string[] {
  const names = new Set<string>();
  for (const line of transcript.split('\n')) {
    const m = line.match(/^\[[^\]]+\]\s+([^:]+):/);
    if (m) names.add(m[1]!.trim());
  }
  return [...names];
}

// ─── Topic-based auto-classification ─────────────────────────────────────

export type CallType = 'qa' | 'workshop' | 'client' | 'untagged';

const QA_RE = /\b(q\s*&\s*a|q\s*and\s*a|\bqa\b|office\s*hours|community\s*call)\b/i;
const WORKSHOP_RE = /\b(workshop|masterclass|training|live\s*session)\b/i;
const CLIENT_RE = /\b(client|strategy\s*call|coaching|1\s*on\s*1|1:1|onboarding)\b/i;

export function classifyCallType(topic: string): CallType {
  if (QA_RE.test(topic)) return 'qa';
  if (WORKSHOP_RE.test(topic)) return 'workshop';
  if (CLIENT_RE.test(topic)) return 'client';
  return 'untagged';
}

// ─── Filename + frontmatter ──────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

function transcriptFilename(meeting: ZoomMeeting): string {
  const date = ymd(new Date(meeting.start_time));
  const slug = slugify(meeting.topic || `meeting-${meeting.id}`);
  return `zoom-${date}_${slug}.md`;
}

function buildTranscriptDoc(meeting: ZoomMeeting, transcript: string, callType: CallType): string {
  const speakers = extractSpeakers(transcript);
  const date = ymd(new Date(meeting.start_time));
  const fm = [
    '---',
    `type: transcript`,
    `source: zoom`,
    `call_type: ${callType}`,
    `meeting_id: ${meeting.id}`,
    `meeting_uuid: ${JSON.stringify(meeting.uuid)}`,
    `topic: ${JSON.stringify(meeting.topic)}`,
    `recorded_on: ${date}`,
    `start_time: ${meeting.start_time}`,
    meeting.end_time ? `end_time: ${meeting.end_time}` : null,
    `duration_minutes: ${meeting.duration}`,
    speakers.length > 0 ? `speakers:\n${speakers.map((s) => `  - ${JSON.stringify(s)}`).join('\n')}` : null,
    '---',
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');
  const body = `# ${meeting.topic}\n\n${transcript}\n`;
  return `${fm}${body}`;
}

// ─── Summary generation ─────────────────────────────────────────────────

const SUMMARY_SUFFIX = '_summary';

function summaryPathFor(transcriptPath: string): string {
  const dir = path.dirname(transcriptPath);
  const base = path.basename(transcriptPath, '.md');
  return path.join(dir, `${base}${SUMMARY_SUFFIX}.md`);
}

const SUMMARY_SYSTEM_PROMPT = `
You are summarising a Zoom meeting transcript so the user gets the gist
without re-reading the whole thing. The summary lands in their inbox.

Output STRICT JSON, no markdown fences:
{
  "overview": "1-2 sentence prose of what the call was about and what was decided",
  "key_points": ["3-7 short bullets of the meaningful moments - decisions, suggestions, insights"],
  "action_items": ["who: action - one bullet per commitment someone actually made; empty array if none"]
}

Rules:
- Quote specific phrases from the transcript when they punch; never invent claims, numbers, or names.
- Skip filler ("we got started", "thanks everyone").
- Bullets are skimmable - 1-2 sentences each, no paragraphs.
- No em dashes, plain hyphens only.
- If multiple people are speaking, name them when their contribution is meaningful.
- For QA-style calls, frame bullets as "who brought it -> their friction -> what landed". For client/strategy calls, frame as "decision made" or "open question". For workshops, frame as "teaching point + key example".
`.trim();

interface ParsedTranscript {
  topic: string | null;
  call_type: CallType;
  duration_minutes: number | null;
  speakers: string[];
  body: string;
}

function parseTranscriptFile(raw: string): ParsedTranscript {
  let topic: string | null = null;
  let call_type: CallType = 'untagged';
  let duration_minutes: number | null = null;
  const speakers: string[] = [];
  let body = raw;

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fmMatch) {
    body = raw.slice(fmMatch[0].length);
    const fm = fmMatch[1]!;
    const topicMatch = fm.match(/^topic:\s*"?([^"\n]+)"?\s*$/m);
    if (topicMatch) topic = topicMatch[1]!.trim();
    const ctMatch = fm.match(/^call_type:\s*(\w+)\s*$/m);
    if (ctMatch && ['qa', 'workshop', 'client', 'untagged'].includes(ctMatch[1]!)) {
      call_type = ctMatch[1]! as CallType;
    }
    const dMatch = fm.match(/^duration_minutes:\s*(\d+)/m);
    if (dMatch) duration_minutes = Number(dMatch[1]);
    // speakers comes as a YAML list block. Match every `  - "Name"` line under it.
    const speakersBlock = fm.match(/^speakers:\s*\n((?:\s+-\s+.+\n?)+)/m);
    if (speakersBlock) {
      for (const line of speakersBlock[1]!.split('\n')) {
        const m = line.match(/^\s+-\s+"?([^"\n]+?)"?\s*$/);
        if (m) speakers.push(m[1]!.trim());
      }
    }
  }
  return { topic, call_type, duration_minutes, speakers, body };
}

async function callClaudeForSummary(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'zoomSummary',
      system: systemPrompt,
      user: userPrompt,
      maxTokens: 1500,
      expectJson: true,
    }),
  });
  if (!res.ok) throw new Error(`claude-bridge ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text?: string; error?: string };
  if (data.error) throw new Error(`claude-bridge: ${data.error}`);
  if (!data.text) throw new Error('claude-bridge: no text in response');
  return data.text;
}

interface ParsedSummary {
  overview: string;
  key_points: string[];
  action_items: string[];
}

function parseSummaryJson(raw: string): ParsedSummary {
  let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('could not parse summary JSON');
    parsed = JSON.parse(match[0]);
  }
  return {
    overview: typeof parsed?.overview === 'string' ? parsed.overview.trim() : '',
    key_points: Array.isArray(parsed?.key_points)
      ? parsed.key_points.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
    action_items: Array.isArray(parsed?.action_items)
      ? parsed.action_items.map((s: any) => String(s).trim()).filter(Boolean)
      : [],
  };
}

function renderSummaryDoc(transcriptFilename: string, parsedTx: ParsedTranscript, summary: ParsedSummary): string {
  const fm = [
    '---',
    'type: zoom-summary',
    `call_type: ${parsedTx.call_type}`,
    parsedTx.topic ? `topic: ${JSON.stringify(parsedTx.topic)}` : null,
    parsedTx.duration_minutes ? `duration_minutes: ${parsedTx.duration_minutes}` : null,
    parsedTx.speakers.length > 0
      ? `speakers:\n${parsedTx.speakers.map((s) => `  - ${JSON.stringify(s)}`).join('\n')}`
      : null,
    `source_transcript: ${JSON.stringify(transcriptFilename)}`,
    `generated_at: ${Math.floor(Date.now() / 1000)}`,
    '---',
    '',
  ]
    .filter((x) => x !== null)
    .join('\n');
  const lines: string[] = [];
  lines.push(`# ${parsedTx.topic ?? transcriptFilename.replace(/\.md$/, '')}`);
  lines.push('');
  if (summary.overview) {
    lines.push(summary.overview);
    lines.push('');
  }
  if (summary.key_points.length > 0) {
    lines.push('## Key points');
    lines.push('');
    for (const k of summary.key_points) lines.push(`- ${k}`);
    lines.push('');
  }
  if (summary.action_items.length > 0) {
    lines.push('## Action items');
    lines.push('');
    for (const a of summary.action_items) lines.push(`- ${a}`);
    lines.push('');
  }
  lines.push(`> Full transcript: [\`${transcriptFilename}\`](${transcriptFilename})`);
  return `${fm}${lines.join('\n')}\n`;
}

/**
 * Generate a Claude-driven summary of one transcript and write it next to
 * the source file with the `_summary.md` suffix. Returns true if a summary
 * was written, false if it was skipped (already exists) or failed.
 *
 * Failures are logged but never throw - a missing summary doesn't break
 * the sync; the user still has the raw transcript in the vault and can
 * trigger a manual re-summary later.
 */
export async function generateTranscriptSummary(transcriptPath: string): Promise<boolean> {
  const summaryPath = summaryPathFor(transcriptPath);
  if (fs.existsSync(summaryPath)) return false;
  let raw: string;
  try {
    raw = fs.readFileSync(transcriptPath, 'utf8');
  } catch (err) {
    console.error(`zoom-summary: could not read transcript ${transcriptPath}:`, (err as Error).message);
    return false;
  }
  const parsedTx = parseTranscriptFile(raw);
  // Truncate the transcript body to fit a reasonable budget. The summary
  // doesn't need the full call - the opening + closing carry most of the
  // structural signal. 60KB front + 8KB back is a good split for long calls.
  const bodyForPrompt =
    parsedTx.body.length > 70_000
      ? parsedTx.body.slice(0, 60_000) + '\n\n[...truncated middle...]\n\n' + parsedTx.body.slice(-8_000)
      : parsedTx.body;

  const userPrompt = `
## Meeting metadata
- topic: ${parsedTx.topic ?? '(not in frontmatter)'}
- call_type: ${parsedTx.call_type}
- duration: ${parsedTx.duration_minutes ?? '?'} min
- speakers: ${parsedTx.speakers.length > 0 ? parsedTx.speakers.join(', ') : '(unknown)'}

## Transcript
${bodyForPrompt}
`.trim();

  let summary: ParsedSummary;
  try {
    const text = await callClaudeForSummary(SUMMARY_SYSTEM_PROMPT, userPrompt);
    summary = parseSummaryJson(text);
  } catch (err) {
    console.error(`zoom-summary: claude call failed for ${path.basename(transcriptPath)}:`, (err as Error).message);
    return false;
  }
  const transcriptFilename = path.basename(transcriptPath);
  const doc = renderSummaryDoc(transcriptFilename, parsedTx, summary);
  fs.writeFileSync(summaryPath, doc, 'utf8');
  return true;
}

// ─── Sync pass ───────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  saved: Array<{ filename: string; topic: string; call_type: CallType }>;
  skipped_no_transcript: number;
  skipped_already_processed: number;
  error: string | null;
}

/**
 * Run one sync pass: list recordings since last-processed, filter to those
 * with completed transcripts, fetch + save each one. Advances last-processed
 * end_time monotonically. Safe to call concurrently - the caller is expected
 * to debounce; this function does no internal locking.
 */
export async function runZoomSync(): Promise<SyncResult> {
  const config = loadConfig();
  if (!config) {
    return {
      ok: false,
      saved: [],
      skipped_no_transcript: 0,
      skipped_already_processed: 0,
      error: 'not connected',
    };
  }
  const state = loadState();
  // Floor: last-processed end_time. Cold start: 7 days back from connect time
  // (so brand-new connections catch the last week of meetings, not years).
  const cutoff = state.last_processed_end_time
    ? new Date(state.last_processed_end_time)
    : new Date(config.connected_at * 1000 - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const to = ymd(now);

  let recordings: ZoomMeeting[];
  try {
    recordings = await listRecordings(config, from, to);
  } catch (err) {
    const msg = (err as Error).message || 'listRecordings failed';
    saveState({ ...state, last_sync_at: Math.floor(Date.now() / 1000), last_sync_error: msg });
    return { ok: false, saved: [], skipped_no_transcript: 0, skipped_already_processed: 0, error: msg };
  }

  const candidates = recordings
    .filter((m) => new Date(m.end_time ?? m.start_time) > cutoff)
    .filter((m) => m.recording_files.some((f) => f.file_type === 'TRANSCRIPT' && f.status === 'completed'))
    .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));

  const result: SyncResult = {
    ok: true,
    saved: [],
    skipped_no_transcript: recordings.length - candidates.length,
    skipped_already_processed: 0,
    error: null,
  };

  let newLatestEnd = state.last_processed_end_time;
  // Pre-create the four destination folders so even an empty category folder
  // shows up in the file tree and the Vault page can render the section.
  for (const dir of Object.values(TRANSCRIPT_DIRS)) {
    fs.mkdirSync(abs(...dir), { recursive: true });
  }

  for (const meeting of candidates) {
    const callType = classifyCallType(meeting.topic);
    const filename = transcriptFilename(meeting);
    const destDir = abs(...TRANSCRIPT_DIRS[callType]);
    const fullPath = path.join(destDir, filename);
    // Existence check against ALL category folders, not just the destination:
    // if the user re-categorized a previous run's transcript by moving it,
    // we shouldn't re-create it in the auto-classified folder.
    const alreadyExists = Object.values(TRANSCRIPT_DIRS).some((dir) =>
      fs.existsSync(path.join(abs(...dir), filename))
    );
    if (alreadyExists) {
      result.skipped_already_processed += 1;
      const end = meeting.end_time ?? meeting.start_time;
      if (!newLatestEnd || end > newLatestEnd) newLatestEnd = end;
      continue;
    }
    let vtt: string | null;
    try {
      vtt = await fetchTranscript(config, meeting);
    } catch (err) {
      console.error(`zoom: fetchTranscript failed for ${meeting.topic}:`, (err as Error).message);
      continue;
    }
    if (!vtt) continue;
    const transcript = vttToTranscript(vtt);
    const doc = buildTranscriptDoc(meeting, transcript, callType);
    fs.writeFileSync(fullPath, doc, 'utf8');
    result.saved.push({ filename, topic: meeting.topic, call_type: callType });
    // Fire-and-forget: generate the summary in the background so the sync
    // returns promptly. The summary lands as a `_summary.md` sibling file
    // which the inbox route picks up on its next read.
    generateTranscriptSummary(fullPath).catch((err) =>
      console.error('zoom-summary: background generation failed:', err)
    );
    const end = meeting.end_time ?? meeting.start_time;
    if (!newLatestEnd || end > newLatestEnd) newLatestEnd = end;
  }

  saveState({
    last_processed_end_time: newLatestEnd,
    last_sync_at: Math.floor(Date.now() / 1000),
    last_sync_count: result.saved.length,
    last_sync_error: null,
  });
  return result;
}

// Lightweight credential test: just hits the token endpoint. Used during
// onboarding to confirm the user pasted valid credentials before we wire up
// the background sync.
export async function testCredentials(config: Omit<ZoomConfig, 'connected_at'>): Promise<{ ok: boolean; error: string | null }> {
  try {
    await getAccessToken({ ...config, connected_at: Math.floor(Date.now() / 1000) });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message || 'token test failed' };
  }
}
