/**
 * Update Solo OS - runs `git pull` in the dashboard repo root so members
 * (and the creator's live install) can pull the latest code from GitHub straight
 * from the Settings page. No database; reports stdout/stderr back to the
 * UI so the user sees what happened.
 */

import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { silentRecheck, getCurrentState } from '../lib/membership.js';

const app = new Hono();

function repoRoot(): string {
  // server/src/routes/updateSoloOs.ts -> server/src/routes -> server/src -> server -> repo root
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..');
}

interface PullResult {
  ok: boolean;
  alreadyUpToDate: boolean;
  output: string;
  exitCode: number;
}

function runGitPull(cwd: string): Promise<PullResult> {
  return new Promise((resolve) => {
    const child = spawn('git', ['pull', '--ff-only'], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      resolve({
        ok: false,
        alreadyUpToDate: false,
        output: `failed to spawn git: ${err.message}`,
        exitCode: -1,
      });
    });
    child.on('close', (code) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      const alreadyUpToDate = /Already up to date/i.test(output);
      resolve({
        ok: code === 0,
        alreadyUpToDate,
        output: output || (code === 0 ? 'pulled' : 'git pull failed'),
        exitCode: code ?? -1,
      });
    });
  });
}

app.post('/pull', async (c) => {
  // Membership-gate the pull. A cached token that needs re-checking gets
  // silently refreshed; an expired or missing token aborts before we touch git.
  let state = getCurrentState();
  if (state.state === 'valid' && state.needs_recheck) {
    state = await silentRecheck();
  }
  if (state.state !== 'valid') {
    return c.json(
      {
        ok: false,
        alreadyUpToDate: false,
        output:
          state.state === 'unverified'
            ? 'enter your the offer key in settings to enable updates.'
            : state.state === 'expired'
            ? 'your ss key has expired. open settings and paste the current key to keep updating.'
            : 'reason' in state
            ? state.reason
            : 'membership check failed',
        exitCode: -1,
        membership_state: state.state,
      },
      403
    );
  }
  const cwd = repoRoot();
  const result = await runGitPull(cwd);
  return c.json({ ...result, membership_state: 'valid' }, result.ok ? 200 : 500);
});

export default app;
