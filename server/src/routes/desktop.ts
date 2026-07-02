/**
 * Desktop shell bridge - only alive inside the Solo OS desktop app.
 *
 * The Settings page needs to show and change things only the Electron shell
 * controls (which vault folder the app reads, opening it in Finder/Explorer).
 * The server can't do those itself, so it relays over the utilityProcess
 * message port to the shell, which owns the native dialogs and the restart.
 *
 * On web installs SOLO_OS_DESKTOP is unset: GET reports desktop:false (the
 * frontend hides the whole section) and the actions refuse.
 */

import { Hono } from 'hono';
import { VAULT_ROOT } from '../vault.js';

const app = new Hono();

const IS_DESKTOP = !!process.env.SOLO_OS_DESKTOP;

function tellShell(message: Record<string, unknown>): boolean {
  try {
    const port = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort;
    if (!port) return false;
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

app.get('/', (c) =>
  c.json({
    desktop: IS_DESKTOP,
    vaultPath: IS_DESKTOP ? VAULT_ROOT : null,
  })
);

// Opens the native folder picker in the shell. If the member picks a folder,
// the shell saves it and relaunches the app on the new vault - so this
// request just kicks the flow off and returns.
app.post('/change-vault', (c) => {
  if (!IS_DESKTOP) return c.json({ error: 'only available in the desktop app' }, 400);
  const ok = tellShell({ type: 'change-vault' });
  return c.json({ ok }, ok ? 200 : 500);
});

app.post('/open-vault', (c) => {
  if (!IS_DESKTOP) return c.json({ error: 'only available in the desktop app' }, 400);
  const ok = tellShell({ type: 'open-vault' });
  return c.json({ ok }, ok ? 200 : 500);
});

export default app;
