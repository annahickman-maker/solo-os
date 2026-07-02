/**
 * Solo OS desktop shell.
 *
 * This is the Electron main process: the thing that makes Solo OS a real app
 * instead of a stack of terminal services. It owns:
 *
 *   - the vault (find it, create it, seed it, validate it, let the user move it)
 *   - the two services (dashboard server + claude bridge), run as
 *     utilityProcess children on Electron's own bundled Node - members never
 *     install Node, npm, git, or the claude CLI
 *   - a STABLE local port (persisted per install - the browser origin holds
 *     localStorage, so the port must not change between launches)
 *   - supervision (crash -> restart with backoff -> friendly error screen)
 *   - logs + one-click diagnostics for support
 *   - auto-updates (electron-updater against GitHub releases)
 *   - the claude sign-in hand-holding when no credentials exist yet
 *
 * Design rule: every external thing this file touches can be missing, moved,
 * locked, or broken - and the member should still see words on a screen that
 * tell them what to do, never a blank window or a dead spinner.
 */

'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  clipboard,
  utilityProcess,
  nativeTheme,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');

// ─── constants ──────────────────────────────────────────────────────────────

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const SELF_TEST = process.argv.includes('--self-test');
const DEFAULT_PORT = 45903; // uncommon; scanned upward on conflict, then persisted
const DASHBOARD_PASSWORD = 'dev'; // fixed local token, matches the frontend default
const HEALTH_TIMEOUT_MS = 45_000;
const LOG_MAX_BYTES = 3 * 1024 * 1024;

// ─── paths ──────────────────────────────────────────────────────────────────

function userDataDir() {
  return app.getPath('userData');
}
function configPath() {
  return path.join(userDataDir(), 'config.json');
}
function logsDir() {
  return path.join(userDataDir(), 'logs');
}
function serverHomeDir() {
  // The server's cwd. Writable, survives updates. An optional .env here
  // supplies YouTube/Instagram/Google API keys (same contract as the web
  // install's server/.env).
  return path.join(userDataDir(), 'server-home');
}

// Bundled resources. In a packaged app they live in process.resourcesPath;
// in dev (`electron .` from the repo) they're the repo folders.
function resPath(name) {
  if (app.isPackaged) return path.join(process.resourcesPath, name);
  const repo = app.getAppPath();
  const devMap = {
    'server-bundles': path.join(repo, 'desktop', 'dist'),
    frontend: path.join(repo, 'frontend', 'dist'),
    'sample-vault': path.join(repo, 'sample-vault'),
    'app-skills': path.join(repo, '.claude', 'skills'),
  };
  return devMap[name] ?? path.join(repo, name);
}

function bundledClaudeCli() {
  // The @anthropic-ai/claude-code package installs a NATIVE standalone binary
  // (named claude.exe on every platform - it is a real Mach-O on mac). We ship
  // it as a plain resource: Resources/claude/claude.exe. No Node, no npm, no
  // PATH involved. In dev it comes straight from node_modules.
  const packaged = path.join(process.resourcesPath, 'claude', 'claude.exe');
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  const dev = path.join(app.getAppPath(), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  if (fs.existsSync(dev)) return dev;
  return null;
}

// ─── tiny utils ─────────────────────────────────────────────────────────────

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function loadConfig() {
  return readJson(configPath(), {});
}
function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  writeJson(configPath(), next);
  return next;
}

function log(line) {
  const msg = `[${new Date().toISOString()}] ${line}`;
  console.log(msg);
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
    fs.appendFileSync(path.join(logsDir(), 'app.log'), msg + '\n');
  } catch {
    // never let logging take the app down
  }
}

function rotateLogIfHuge(p) {
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > LOG_MAX_BYTES) {
      fs.renameSync(p, p + '.old');
    }
  } catch {
    // best effort
  }
}

function tailFile(p, lines) {
  try {
    const data = fs.readFileSync(p, 'utf8');
    return data.split('\n').slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

function httpGet(url, headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function pickPort(preferred) {
  for (let p = preferred; p < preferred + 50; p++) {
    if (await portFree(p)) return p;
  }
  throw new Error(`no free port found near ${preferred}`);
}

// ─── vault ──────────────────────────────────────────────────────────────────

function defaultVaultPath() {
  return path.join(app.getPath('desktop'), 'Solo OS');
}

function looksLikeVault(p) {
  // Loose on purpose: any folder the member points at is accepted, but a
  // folder with 01_Core or 00_System is definitely one of ours.
  return fs.existsSync(p) && fs.statSync(p).isDirectory();
}

function vaultWritable(p) {
  try {
    const probe = path.join(p, '.solo-os-write-test');
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

function seedVault(target) {
  const src = resPath('sample-vault');
  if (!fs.existsSync(src)) {
    fs.mkdirSync(path.join(target, '01_Core'), { recursive: true });
    return;
  }
  fs.cpSync(src, target, {
    recursive: true,
    filter: (srcPath) => {
      const rel = path.relative(src, srcPath);
      if (rel.split(path.sep).includes('dashboard-chats')) return false;
      if (path.basename(srcPath) === '.DS_Store') return false;
      return true;
    },
  });
}

function isICloudPath(p) {
  return p.includes(path.join('Library', 'Mobile Documents'));
}

async function resolveVault() {
  // Explicit override (self-test, power users) wins.
  if (process.env.SOLO_OS_VAULT) {
    const v = process.env.SOLO_OS_VAULT;
    if (!fs.existsSync(v)) {
      fs.mkdirSync(v, { recursive: true });
      seedVault(v);
    }
    return v;
  }

  const cfg = loadConfig();

  // 1. The configured vault, if it still exists and is writable.
  if (cfg.vaultPath) {
    if (looksLikeVault(cfg.vaultPath) && vaultWritable(cfg.vaultPath)) return cfg.vaultPath;
    if (SELF_TEST) throw new Error(`configured vault missing: ${cfg.vaultPath}`);
    // The vault moved or is unreadable - ask, don't guess.
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Solo OS',
      message: 'Your vault folder cannot be found',
      detail:
        `Solo OS last used:\n${cfg.vaultPath}\n\nIf you moved or renamed the folder, point Solo OS at its new location. ` +
        `Your files are safe - the app just lost track of where they are.`,
      buttons: ['Locate My Vault...', 'Create a Fresh Vault', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 2) return null;
    if (choice === 0) {
      const picked = dialog.showOpenDialogSync({
        title: 'Choose your Solo OS vault folder',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (!picked || !picked[0]) return resolveVault();
      saveConfig({ vaultPath: picked[0] });
      return picked[0];
    }
    // fresh vault falls through to first-run flow below
  }

  // 2. Adoption: an existing vault from the old install layout.
  const legacyDefault = defaultVaultPath();
  if (!cfg.vaultPath && looksLikeVault(legacyDefault) && vaultWritable(legacyDefault)) {
    saveConfig({ vaultPath: legacyDefault });
    log(`adopted existing vault at ${legacyDefault}`);
    return legacyDefault;
  }

  if (SELF_TEST) throw new Error('self-test requires SOLO_OS_VAULT');

  // 3. True first run.
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    title: 'Welcome to Solo OS',
    message: 'Where should your vault live?',
    detail:
      `Your vault is a normal folder of markdown files - it IS your data, and it stays on this computer.\n\n` +
      `Recommended: ${defaultVaultPath()}\n\n` +
      `You can also choose an existing folder (for example, a vault from a previous Solo OS install).`,
    buttons: ['Create My Vault (Recommended)', 'Choose an Existing Folder...'],
    defaultId: 0,
  });

  let vault;
  if (choice === 1) {
    const picked = dialog.showOpenDialogSync({
      title: 'Choose your Solo OS vault folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!picked || !picked[0]) return resolveVault();
    vault = picked[0];
    if (!fs.existsSync(path.join(vault, '01_Core')) && fs.readdirSync(vault).length === 0) {
      seedVault(vault);
    }
  } else {
    vault = defaultVaultPath();
    if (!fs.existsSync(vault)) {
      fs.mkdirSync(vault, { recursive: true });
      seedVault(vault);
    }
  }

  if (!vaultWritable(vault)) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Solo OS',
      message: 'That folder is not writable',
      detail: `Solo OS needs to read and write files in your vault. Pick a folder inside your home folder (Desktop or Documents work well).`,
      buttons: ['Choose Again'],
    });
    return resolveVault();
  }

  if (isICloudPath(vault)) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Solo OS',
      message: 'Heads up: this folder syncs through iCloud Drive',
      detail:
        'That works, but iCloud can "offload" files you have not opened in a while, which makes them slow to read until they re-download. ' +
        'If the dashboard ever feels slow or shows missing content, consider moving your vault to a non-iCloud folder (Solo OS menu -> Change Vault Folder).',
      buttons: ['Got It'],
    });
  }

  saveConfig({ vaultPath: vault });
  return vault;
}

// ─── legacy install cleanup (macOS only) ────────────────────────────────────
// Members who had the old script-stack Solo OS may still have its three
// services running from a bundle this app just replaced, or from the ancient
// ~/Desktop/solo-os layout. They would keep serving a second dashboard on
// :5174 and confuse everyone. Kill exactly those - nothing else.

function cleanupLegacyServices() {
  if (!IS_MAC) return;
  execFile('lsof', ['-nP', '-iTCP:5174,8791,8789', '-sTCP:LISTEN', '-t'], (err, stdout) => {
    if (err || !stdout.trim()) return;
    const pids = [...new Set(stdout.trim().split(/\s+/))];
    for (const pid of pids) {
      execFile('ps', ['-o', 'command=', '-p', pid], (psErr, cmd) => {
        if (psErr || !cmd) return;
        const c = cmd.toString();
        const isOldStack =
          c.includes('/Applications/Solo OS.app/Contents/Resources/app') ||
          c.includes(path.join(os.homedir(), 'Desktop', 'solo-os') + path.sep);
        if (isOldStack) {
          log(`legacy cleanup: killing old Solo OS service pid ${pid}`);
          try {
            process.kill(Number(pid), 'SIGKILL');
          } catch {
            // already gone
          }
        }
      });
    }
  });
}

// ─── services ───────────────────────────────────────────────────────────────

const services = {}; // name -> { proc, restarts: [], stopped }
let quitting = false;
let serverPort = null;
let bridgePort = null;
let vaultRoot = null;

function serviceEnv(extra) {
  const env = {
    ...process.env,
    VAULT_ROOT: vaultRoot,
    SOLO_OS_DESKTOP: '1',
    ...extra,
  };
  // Never leak this into the services themselves - utilityProcess children
  // must run as Electron utility processes, not plain node.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function startService(name, bundleFile, env, cwd) {
  const logFile = path.join(logsDir(), `${name}.log`);
  rotateLogIfHuge(logFile);
  const out = fs.createWriteStream(logFile, { flags: 'a' });

  const modulePath = path.join(resPath('server-bundles'), bundleFile);
  if (!fs.existsSync(modulePath)) {
    throw new Error(`service bundle missing: ${modulePath}`);
  }

  const proc = utilityProcess.fork(modulePath, [], {
    serviceName: `solo-os-${name}`,
    stdio: 'pipe',
    cwd,
    env,
  });

  proc.stdout?.on('data', (d) => out.write(d));
  proc.stderr?.on('data', (d) => out.write(d));

  proc.on('message', (msg) => {
    if (msg && msg.type === 'check-for-updates') {
      log('server asked for an update check');
      checkForUpdates(true);
    }
  });

  proc.on('exit', (code) => {
    out.write(`\n[shell] ${name} exited with code ${code}\n`);
    if (quitting || services[name]?.stopped) return;
    // Crash-loop guard: more than 5 restarts in 60s means something is truly
    // wrong - show the error screen instead of burning CPU forever.
    const now = Date.now();
    const s = services[name];
    s.restarts = (s.restarts || []).filter((t) => now - t < 60_000);
    s.restarts.push(now);
    if (s.restarts.length > 5) {
      log(`${name} is crash-looping - showing error screen`);
      showErrorWindow(
        `The ${name} service keeps stopping`,
        `Solo OS tried to restart it 5 times in the last minute. The log below usually names the cause.\n\n` +
          tailFile(path.join(logsDir(), `${name}.log`), 30)
      );
      return;
    }
    const delay = Math.min(500 * 2 ** s.restarts.length, 5000);
    log(`${name} exited (code ${code}) - restarting in ${delay}ms`);
    setTimeout(() => {
      if (!quitting && !services[name]?.stopped) {
        services[name].proc = startService(name, bundleFile, env, cwd).proc;
      }
    }, delay);
  });

  services[name] = { ...(services[name] || {}), proc, stopped: false };
  return services[name];
}

async function startAllServices() {
  const cfg = loadConfig();
  serverPort = process.env.SOLO_OS_PORT
    ? Number(process.env.SOLO_OS_PORT)
    : await pickPort(cfg.port ?? DEFAULT_PORT);
  bridgePort = await pickPort(serverPort + 1);
  if (cfg.port !== serverPort) saveConfig({ port: serverPort });

  fs.mkdirSync(serverHomeDir(), { recursive: true });
  fs.mkdirSync(logsDir(), { recursive: true });

  const cli = bundledClaudeCli();
  log(`starting services: server :${serverPort}, bridge :${bridgePort}, vault ${vaultRoot}`);
  log(`bundled claude cli: ${cli ?? 'NOT FOUND (will fall back to system claude)'}`);

  startService(
    'bridge',
    'bridge.mjs',
    serviceEnv({
      BRIDGE_PORT: String(bridgePort),
      ...(cli ? { CLAUDE_BUNDLED_CLI: cli } : {}),
    }),
    serverHomeDir()
  );

  startService(
    'server',
    'server.mjs',
    serviceEnv({
      PORT: String(serverPort),
      HOST: '127.0.0.1',
      DASHBOARD_PASSWORD,
      CLAUDE_BRIDGE_URL: `http://127.0.0.1:${bridgePort}/run`,
      FRONTEND_DIST: resPath('frontend'),
      SKILL_ROOTS_JSON: JSON.stringify([
        { path: resPath('app-skills'), pack: 'solo-os' },
        { path: path.join(vaultRoot, '.claude', 'skills'), pack: 'vault' },
      ]),
    }),
    serverHomeDir()
  );
}

function stopAllServices() {
  for (const [name, s] of Object.entries(services)) {
    s.stopped = true;
    try {
      s.proc?.kill();
    } catch {
      // already dead
    }
    log(`stopped ${name}`);
  }
}

async function waitForServer() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastErr = 'no response yet';
  while (Date.now() < deadline) {
    try {
      const res = await httpGet(`http://127.0.0.1:${serverPort}/health`, {}, 2000);
      if (res.status === 200) return true;
      lastErr = `health returned ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not come up within ${HEALTH_TIMEOUT_MS / 1000}s (${lastErr})`);
}

// ─── claude auth ────────────────────────────────────────────────────────────

function checkClaudeAuth() {
  return new Promise((resolve) => {
    const cli = bundledClaudeCli();
    if (!cli) return resolve({ ok: false, reason: 'bundled cli missing' });
    const child = spawn(cli, ['auth', 'status'], {
      env: { ...process.env, DISABLE_AUTOUPDATER: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, reason: 'auth check timed out' });
    }, 15_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, reason: code === 0 ? 'signed in' : `auth status exited ${code}` });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: err.message });
    });
  });
}

function signInCommand() {
  const cli = bundledClaudeCli();
  if (!cli) return null;
  if (IS_WIN) {
    return `set DISABLE_AUTOUPDATER=1 && "${cli}" auth login`;
  }
  return `DISABLE_AUTOUPDATER=1 "${cli}" auth login`;
}

function openSignInTerminal() {
  const cmd = signInCommand();
  if (!cmd) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Solo OS',
      message: 'Bundled Claude CLI not found',
      detail: 'Reinstall Solo OS - this build looks incomplete.',
      buttons: ['OK'],
    });
    return;
  }
  try {
    if (IS_MAC) {
      const script = path.join(os.tmpdir(), 'solo-os-claude-signin.command');
      fs.writeFileSync(script, `#!/bin/bash\nclear\necho "Signing in to Claude for Solo OS..."\necho\n${cmd}\necho\necho "Done. You can close this window and go back to Solo OS."\n`, { mode: 0o755 });
      spawn('open', ['-a', 'Terminal', script], { detached: true, stdio: 'ignore' }).unref();
    } else if (IS_WIN) {
      const script = path.join(os.tmpdir(), 'solo-os-claude-signin.cmd');
      fs.writeFileSync(script, `@echo off\r\necho Signing in to Claude for Solo OS...\r\n${cmd}\r\necho.\r\necho Done. You can close this window and go back to Solo OS.\r\npause\r\n`);
      spawn('cmd', ['/c', 'start', 'Solo OS - Sign in to Claude', script], { detached: true, stdio: 'ignore', shell: false }).unref();
    } else {
      clipboard.writeText(cmd);
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'Solo OS',
        message: 'Sign-in command copied',
        detail: 'Paste it into a terminal and press Enter.',
        buttons: ['OK'],
      });
    }
  } catch (err) {
    clipboard.writeText(cmd);
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Solo OS',
      message: 'Could not open a terminal automatically',
      detail: `The sign-in command has been copied to your clipboard instead - paste it into Terminal and press Enter.\n\n(${err.message})`,
      buttons: ['OK'],
    });
  }
}

async function promptClaudeSignInIfNeeded() {
  const auth = await checkClaudeAuth();
  log(`claude auth: ${auth.ok ? 'ok' : auth.reason}`);
  if (auth.ok) return;
  const choice = dialog.showMessageBoxSync({
    type: 'info',
    title: 'Solo OS',
    message: 'Connect Claude to unlock the AI features',
    detail:
      'Solo OS uses your Claude subscription (Pro or Max) for chat, skills, and every AI feature - no API key, no extra billing.\n\n' +
      'Signing in opens a terminal window for a one-time browser sign-in. Everything else in the dashboard works without it.',
    buttons: ['Sign In to Claude...', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (choice === 0) openSignInTerminal();
}

// ─── diagnostics ────────────────────────────────────────────────────────────

async function diagnostics() {
  let bridgeHealth = '(unreachable)';
  try {
    const res = await httpGet(`http://127.0.0.1:${bridgePort}/health`, {}, 2000);
    bridgeHealth = res.body;
  } catch (err) {
    bridgeHealth = `error: ${err.message}`;
  }
  let serverHealth = '(unreachable)';
  try {
    const res = await httpGet(`http://127.0.0.1:${serverPort}/health`, {}, 2000);
    serverHealth = `${res.status} ${res.body}`;
  } catch (err) {
    serverHealth = `error: ${err.message}`;
  }
  const auth = await checkClaudeAuth();
  return [
    `Solo OS ${app.getVersion()} (electron ${process.versions.electron}, node ${process.versions.node})`,
    `platform: ${process.platform} ${os.release()} (${process.arch})`,
    `vault: ${vaultRoot}`,
    `server: http://127.0.0.1:${serverPort} -> ${serverHealth}`,
    `bridge: http://127.0.0.1:${bridgePort} -> ${bridgeHealth}`,
    `claude auth: ${auth.ok ? 'signed in' : auth.reason}`,
    `bundled cli: ${bundledClaudeCli() ?? 'missing'}`,
    `logs: ${logsDir()}`,
    ``,
    `--- server.log (last 25 lines) ---`,
    tailFile(path.join(logsDir(), 'server.log'), 25),
    ``,
    `--- bridge.log (last 15 lines) ---`,
    tailFile(path.join(logsDir(), 'bridge.log'), 15),
  ].join('\n');
}

// ─── windows ────────────────────────────────────────────────────────────────

let mainWindow = null;

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    title: 'Solo OS',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16140F' : '#F5F4F0',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Anything that isn't our local dashboard opens in the system browser -
  // Skool, YouTube, sign-in pages, all of it.
  const isLocal = (url) => url.startsWith(`http://127.0.0.1:${serverPort}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // A renderer crash should heal itself, not strand a white window.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`renderer gone (${details.reason}) - reloading`);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
  });

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function showErrorWindow(title, detail) {
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Solo OS',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, system-ui, sans-serif; background:#F5F4F0; color:#16140F; padding: 32px; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { line-height: 1.5; }
    pre { background:#16140F; color:#EDEDE9; padding:16px; border-radius:8px; font-size:11px; overflow:auto; max-height:280px; white-space:pre-wrap; }
    .hint { color:#6b685f; font-size: 13px; }
  </style></head><body>
    <h1>Solo OS hit a problem</h1>
    <p><strong>${escapeHtml(title)}</strong></p>
    <pre>${escapeHtml(detail)}</pre>
    <p class="hint">Quit and reopen Solo OS to try again. If it keeps happening, use the menu: Help -&gt; Copy Diagnostics, and paste that in the Solopreneur Systems community - that is everything needed to fix it.</p>
  </body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

// ─── auto-update ────────────────────────────────────────────────────────────

let updater = null;
let updateCheckInFlight = false;

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    updater = autoUpdater;
    updater.autoDownload = true;
    updater.logger = { info: log, warn: log, error: log, debug: () => {} };
    updater.on('update-downloaded', (info) => {
      const choice = dialog.showMessageBoxSync({
        type: 'info',
        title: 'Solo OS',
        message: `Solo OS ${info.version} is ready`,
        detail: 'The update downloaded in the background. Restart to use it - takes a few seconds, your vault is untouched.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice === 0) {
        quitting = true;
        stopAllServices();
        updater.quitAndInstall();
      }
    });
    updater.on('error', (err) => log(`updater: ${err.message}`));
    // First check shortly after boot, then every 6 hours.
    setTimeout(() => checkForUpdates(false), 30_000);
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
  } catch (err) {
    log(`updater unavailable: ${err.message}`);
  }
}

async function checkForUpdates(interactive) {
  if (!updater) {
    if (interactive && !app.isPackaged) {
      dialog.showMessageBoxSync({ type: 'info', title: 'Solo OS', message: 'Updates only run in the packaged app.', buttons: ['OK'] });
    }
    return;
  }
  if (updateCheckInFlight) return;
  updateCheckInFlight = true;
  try {
    const result = await updater.checkForUpdates();
    const latest = result?.updateInfo?.version;
    if (interactive && latest && latest === app.getVersion()) {
      dialog.showMessageBoxSync({
        type: 'info',
        title: 'Solo OS',
        message: `You're on the latest version (${latest}).`,
        buttons: ['OK'],
      });
    }
  } catch (err) {
    log(`update check failed: ${err.message}`);
    if (interactive) {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Solo OS',
        message: 'Could not check for updates',
        detail: `${err.message}\n\nCheck your internet connection and try again.`,
        buttons: ['OK'],
      });
    }
  } finally {
    updateCheckInFlight = false;
  }
}

// ─── menu ───────────────────────────────────────────────────────────────────

function buildMenu() {
  const vaultItems = [
    {
      label: 'Open Vault Folder',
      click: () => shell.openPath(vaultRoot),
    },
    {
      label: 'Change Vault Folder...',
      click: async () => {
        const picked = dialog.showOpenDialogSync({
          title: 'Choose your Solo OS vault folder',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (!picked || !picked[0] || picked[0] === vaultRoot) return;
        saveConfig({ vaultPath: picked[0] });
        dialog.showMessageBoxSync({
          type: 'info',
          title: 'Solo OS',
          message: 'Vault changed',
          detail: `Solo OS will now restart and use:\n${picked[0]}`,
          buttons: ['Restart'],
        });
        app.relaunch();
        quitting = true;
        stopAllServices();
        app.quit();
      },
    },
    { type: 'separator' },
    {
      label: 'Sign In to Claude...',
      click: () => openSignInTerminal(),
    },
  ];

  const helpItems = [
    {
      label: 'Copy Diagnostics',
      click: async () => {
        clipboard.writeText(await diagnostics());
        dialog.showMessageBoxSync({
          type: 'info',
          title: 'Solo OS',
          message: 'Diagnostics copied',
          detail: 'Paste it in the Solopreneur Systems community - it contains everything needed to help you (and nothing personal beyond file paths).',
          buttons: ['OK'],
        });
      },
    },
    { label: 'Open Logs Folder', click: () => shell.openPath(logsDir()) },
    { label: 'Open Server Config Folder', click: () => shell.openPath(serverHomeDir()) },
    { type: 'separator' },
    {
      label: 'Solopreneur Systems Community',
      click: () => shell.openExternal('https://www.skool.com/mastermind-5724/about'),
    },
  ];

  const template = [
    ...(IS_MAC
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { label: 'Check for Updates...', click: () => checkForUpdates(true) },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        ...(IS_MAC ? [] : [{ label: 'Check for Updates...', click: () => checkForUpdates(true) }, { type: 'separator' }]),
        ...(IS_MAC ? [{ role: 'close' }] : [{ role: 'quit' }]),
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Vault', submenu: vaultItems },
    { role: 'windowMenu' },
    { label: 'Help', submenu: helpItems },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── self-test ──────────────────────────────────────────────────────────────
// `Solo OS --self-test` with SOLO_OS_VAULT set boots the full stack headless,
// proves the API + skills + bridge respond, prints a JSON verdict, exits.
// This is what CI (and Claude) use to verify a build actually works.

async function runSelfTest() {
  const verdict = { ok: false, server: false, skills: 0, bridge: false, claudeFound: false };
  try {
    await startAllServices();
    await waitForServer();
    verdict.server = true;
    const skills = await httpGet(`http://127.0.0.1:${serverPort}/api/skills`, { 'X-Dashboard-Password': DASHBOARD_PASSWORD }, 10_000);
    verdict.skills = JSON.parse(skills.body).items?.length ?? 0;
    const frontend = await httpGet(`http://127.0.0.1:${serverPort}/skills`, {}, 5_000);
    verdict.frontendServed = frontend.status === 200 && frontend.body.includes('<div id="root">');
    const bridge = await httpGet(`http://127.0.0.1:${bridgePort}/health`, {}, 5_000);
    verdict.bridge = bridge.status === 200;
    const bridgeInfo = JSON.parse(bridge.body);
    verdict.claudeFound = bridgeInfo.claude_found ?? bridgeInfo.found ?? bridgeInfo.ok ?? false;
    verdict.bridgeHealth = bridge.body;
    // In a packaged app the bridge MUST be using the binary we ship - a pass
    // that leans on a claude the build machine happens to have is a fail.
    verdict.usingBundledClaude = app.isPackaged
      ? String(bridgeInfo.claude_bin ?? '').startsWith(process.resourcesPath)
      : true;
    verdict.ok =
      verdict.server && verdict.skills > 0 && verdict.bridge && !!verdict.frontendServed && verdict.usingBundledClaude;
  } catch (err) {
    verdict.error = err.message;
  }
  console.log('SELF_TEST_RESULT ' + JSON.stringify(verdict));
  quitting = true;
  stopAllServices();
  // Give the kill signals a beat to land before exiting.
  setTimeout(() => app.exit(verdict.ok ? 0 : 1), 500);
}

// ─── app lifecycle ──────────────────────────────────────────────────────────

// Self-test runs bypass the single-instance lock: they use their own vault +
// ports and must never silently no-op because a real instance is open (that
// would read as a passing test in CI).
const gotLock = SELF_TEST ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('solo-os: already running - focusing the existing window');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setAppUserModelId('com.solo-os.dashboard');

  app.whenReady().then(async () => {
    try {
      vaultRoot = await resolveVault();
      if (!vaultRoot) {
        app.quit();
        return;
      }

      if (SELF_TEST) {
        await runSelfTest();
        return;
      }

      cleanupLegacyServices();
      buildMenu();
      setupAutoUpdater();

      await startAllServices();
      await waitForServer();
      createMainWindow();

      // Non-blocking: offer the Claude sign-in AFTER the window is up, so the
      // member sees the dashboard first and the AI hookup second.
      setTimeout(() => promptClaudeSignInIfNeeded().catch((e) => log(`auth prompt failed: ${e.message}`)), 1500);
    } catch (err) {
      log(`boot failed: ${err.stack || err.message}`);
      showErrorWindow('Solo OS could not start', `${err.message}\n\n--- server.log ---\n${tailFile(path.join(logsDir(), 'server.log'), 30)}`);
    }
  });

  app.on('activate', () => {
    // macOS dock click with no window: bring the dashboard back.
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) createMainWindow();
  });

  app.on('window-all-closed', () => {
    // Single-purpose app: closing the dashboard quits and stops the services.
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopAllServices();
  });

  process.on('uncaughtException', (err) => {
    log(`uncaught: ${err.stack || err.message}`);
  });
}
