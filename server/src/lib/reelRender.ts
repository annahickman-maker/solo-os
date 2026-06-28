/**
 * Bake a hook overlay onto a reel via ffmpeg drawtext.
 *
 * Mirrors the dashboard preview style (ig-prod__hook): SF Pro Heavy black
 * text in a white box per line, lines stacked tight so the boxes overlap and
 * read as one IG/CapCut block. Position comes from hook_pos_x / hook_pos_y
 * (percent of frame, center coords).
 *
 * Output lands in 00_System/instagram-queue/titled/<original-filename>.mp4,
 * overwriting any prior render.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { abs } from '../vault.js';

// ffmpeg is a tool binary, not vault data: resolve it from the environment
// (FFMPEG_BIN), then the conventional ~/.local/bin location, then bare PATH.
const FFMPEG = process.env.FFMPEG_BIN ?? path.join(os.homedir(), '.local', 'bin', 'ffmpeg');
const FONT = process.env.REEL_FONT ?? '/Library/Fonts/SF-Pro-Display-Heavy.otf';

// Style constants are calibrated for a 1080-wide reel. For higher-res inputs
// (4K reels are 2160x3840) every pixel value is scaled by frameW/1080 so the
// rendered text reads at the same size regardless of source resolution.
const BASE_FONTSIZE = 52;
const BASE_BOX_PAD = 12;
const BASE_LINE_SPACING = 62;
const WRAP_WIDTH = 24;

const TITLED_DIR = abs('00_System', 'instagram-queue', 'titled');

function wrapText(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (!words.length || (words.length === 1 && !words[0])) return [text];
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= width || !cur) {
      cur = next;
    } else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export type RenderResult = {
  titled_video_path: string;
  lines: string[];
};

export async function renderReelWithHook(args: {
  inputVideoPath: string;
  hookText: string;
  posXPct: number; // 0-100, center x
  posYPct: number; // 0-100, center y
}): Promise<RenderResult> {
  const { inputVideoPath, hookText } = args;
  if (!fs.existsSync(inputVideoPath)) {
    throw new Error(`input video not found: ${inputVideoPath}`);
  }
  if (!fs.existsSync(FFMPEG)) {
    throw new Error(`ffmpeg not found at ${FFMPEG}`);
  }
  if (!fs.existsSync(FONT)) {
    throw new Error(`font not found at ${FONT}`);
  }
  const hook = hookText.trim();
  if (!hook) throw new Error('hook text required');

  fs.mkdirSync(TITLED_DIR, { recursive: true });
  const outPath = path.join(TITLED_DIR, path.basename(inputVideoPath));
  // Write to a sibling .partial.mp4 first, then atomically rename to outPath.
  // If ffmpeg is killed mid-encode (e.g. server restart), the partial file is
  // orphaned but never replaces any prior good render, and the dashboard keeps
  // serving the last successful version.
  const tmpOutPath = outPath.replace(/\.mp4$/i, '') + `.partial-${Date.now()}.mp4`;

  // Probe actual frame dimensions BEFORE doing any position math. Reels can be
  // 1080x1920 (most), 2160x3840 (4K), or other - position percentages are
  // useless without the real width/height. Earlier versions hardcoded
  // 1080x1920 here, which silently mispositioned everything on 4K inputs.
  const { width: frameW, height: frameH } = await probeDimensions(inputVideoPath);

  // Style values scale with frame width so 4K inputs get proportionally larger
  // text (otherwise the hook would shrink to half the visual size).
  const scale = frameW / 1080;
  const FONTSIZE = Math.round(BASE_FONTSIZE * scale);
  const BOX_PAD = Math.round(BASE_BOX_PAD * scale);
  const LINE_SPACING = Math.round(BASE_LINE_SPACING * scale);

  const lines = wrapText(hook, WRAP_WIDTH);
  const N = lines.length;

  // Pixel center of the stack, using actual frame dimensions.
  const cx = clamp(args.posXPct, 5, 95) / 100 * frameW;
  const cy = clamp(args.posYPct, 5, 95) / 100 * frameH;

  // Line 1 y = stack center y - half-height of stack + half-line offset.
  const line1Y = Math.round(cy - (N - 1) * (LINE_SPACING / 2) - FONTSIZE / 2);

  // Write each line to a temp file so we don't have to escape ffmpeg specials.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-render-'));
  const tmpFiles: string[] = [];
  const drawtexts: string[] = [];
  for (let i = 0; i < N; i++) {
    const tf = path.join(tmpDir, `line-${i}.txt`);
    fs.writeFileSync(tf, lines[i]!);
    tmpFiles.push(tf);
    const y = line1Y + i * LINE_SPACING;
    // x= expression centers text horizontally on cx
    const xExpr = `${Math.round(cx)}-text_w/2`;
    drawtexts.push(
      `drawtext=fontfile=${FONT}:textfile=${tf}:fontcolor=black:fontsize=${FONTSIZE}` +
      `:x=${xExpr}:y=${y}:box=1:boxcolor=white@1:boxborderw=${BOX_PAD}`
    );
  }
  const vf = drawtexts.join(',');

  try {
    await runFfmpeg([
      '-y', '-i', inputVideoPath, '-vf', vf,
      '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      '-pix_fmt', 'yuv420p', tmpOutPath,
    ]);
    // Only commit the rendered file into the final path after ffmpeg exits 0.
    // rename() is atomic on the same filesystem, so an interrupted run can
    // never leave a corrupt half-mp4 sitting at outPath.
    fs.renameSync(tmpOutPath, outPath);
  } catch (err) {
    // Best-effort cleanup of the partial output. If ffmpeg was SIGKILLed by
    // a server restart the file might still be there next time the process
    // boots - see cleanupStalePartials() below.
    try { fs.unlinkSync(tmpOutPath); } catch {}
    throw err;
  } finally {
    for (const f of tmpFiles) { try { fs.unlinkSync(f); } catch {} }
    try { fs.rmdirSync(tmpDir); } catch {}
  }

  if (!fs.existsSync(outPath)) {
    throw new Error('ffmpeg ran but output file missing');
  }
  return { titled_video_path: outPath, lines };
}

// Sweep any leftover .partial-*.mp4 files from prior crashes / restarts.
// Called once at server boot.
export function cleanupStalePartials(): void {
  try {
    if (!fs.existsSync(TITLED_DIR)) return;
    for (const f of fs.readdirSync(TITLED_DIR)) {
      if (/\.partial-\d+\.mp4$/i.test(f)) {
        try { fs.unlinkSync(path.join(TITLED_DIR, f)); } catch {}
      }
    }
  } catch {}
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, n));
}

// Read the first video stream's pixel dimensions by running ffmpeg with no
// output (-f null -) and scraping the stderr banner. Avoids a hard dependency
// on ffprobe (not installed on the creator's machine), which is why we don't use it.
async function probeDimensions(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-i', inputPath, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', () => {
      // ffmpeg writes "Stream #0:0[...]: Video: ... 1080x1920 ..." or similar.
      // Match the first WxH that appears on a Video stream line.
      const lines = stderr.split('\n');
      for (const line of lines) {
        if (!line.includes('Video:')) continue;
        const m = line.match(/\b(\d{2,5})x(\d{2,5})\b/);
        if (m) {
          const width = parseInt(m[1]!, 10);
          const height = parseInt(m[2]!, 10);
          if (width > 0 && height > 0) return resolve({ width, height });
        }
      }
      reject(new Error(`could not parse video dimensions from ffmpeg output: ${stderr.slice(-300)}`));
    });
  });
}

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}
