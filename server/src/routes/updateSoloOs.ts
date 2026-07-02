/**
 * Update Solo OS - runs `git pull` in the dashboard repo root so each install
 * can pull the latest code from GitHub straight from the Settings page.
 * No database; reports stdout/stderr back to the UI so the user sees what
 * happened.
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

// Never let the pull hang. Two guards:
//   1. GIT_TERMINAL_PROMPT=0 + GCM_INTERACTIVE=never -> git fails fast instead
//      of blocking on a credential/passphrase prompt. The repo is public, but a
//      stale remote or an https switch could otherwise stall forever waiting on
//      stdin that never arrives from a detached spawn.
//   2. A wall-clock timeout that SIGKILLs the child and resolves with a clear
//      message, so the Settings button can't spin indefinitely.
const PULL_TIMEOUT_MS = 60_000;

function runGitPull(cwd: string): Promise<PullResult> {
  return new Promise((resolve) => {
    const child = spawn('git', ['pull', '--ff-only'], {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (result: PullResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, PULL_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      finish({
        ok: false,
        alreadyUpToDate: false,
        output: `failed to spawn git: ${err.message}`,
        exitCode: -1,
      });
    });
    child.on('close', (code) => {
      if (timedOut) {
        finish({
          ok: false,
          alreadyUpToDate: false,
          output: `update timed out after ${PULL_TIMEOUT_MS / 1000}s and was stopped. check your connection and try again.`,
          exitCode: -1,
        });
        return;
      }
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      const alreadyUpToDate = /Already up to date/i.test(output);
      finish({
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
            ? 'enter your solopreneur systems key in settings to enable updates.'
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
  // Desktop app: there is no git checkout - updates are signed installers
  // handled by the Electron shell (electron-updater). Signal the main process
  // over the utilityProcess message port and let it drive download + restart.
  if (process.env.SOLO_OS_DESKTOP) {
    try {
      (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } })
        .parentPort?.postMessage({ type: 'check-for-updates' });
    } catch {
      // No parent port (shouldn't happen in the app) - the menu item still works.
    }
    return c.json({
      ok: true,
      alreadyUpToDate: false,
      output:
        'checking for updates... the app downloads updates in the background and offers a restart when one is ready. you can also use the Solo OS menu -> Check for Updates.',
      exitCode: 0,
      restarting: false,
      desktop: true,
      membership_state: 'valid',
    });
  }

  const cwd = repoRoot();
  const result = await runGitPull(cwd);
  // Optional one-click restart: when asked and the pull succeeded, fire
  // restart.sh DETACHED so it outlives this server process. The frontend then
  // polls until the stack is back and reloads. Restart on any successful pull
  // (even "already up to date") so the running build is never stale.
  let restarting = false;
  if (result.ok) {
    const body = (await c.req.json().catch(() => ({}))) as { restart?: boolean };
    if (body?.restart) {
      const script = path.join(cwd, 'restart.sh');
      spawn('bash', [script, cwd], { detached: true, stdio: 'ignore' }).unref();
      restarting = true;
    }
  }
  return c.json({ ...result, restarting, membership_state: 'valid' }, result.ok ? 200 : 500);
});

export default app;
