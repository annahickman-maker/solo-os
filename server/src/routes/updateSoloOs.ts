/**
 * Update Solo OS - runs `git pull` in the dashboard repo root so members
 * (and Anna's live install) can pull the latest code from GitHub straight
 * from the Settings page. No database; reports stdout/stderr back to the
 * UI so the user sees what happened.
 */

import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

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
  const cwd = repoRoot();
  const result = await runGitPull(cwd);
  return c.json(result, result.ok ? 200 : 500);
});

export default app;
