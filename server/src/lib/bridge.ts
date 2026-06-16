/**
 * Single source of truth for the claude-bridge URL.
 *
 * The bridge runs on a different port in live (8788) vs the template (8789).
 * Reading from env makes the same server code work in both. Launcher scripts
 * pass CLAUDE_BRIDGE_URL explicitly. If unset, infer from the server's own
 * PORT: live's server runs on 8790 + bridge on 8788; template's server runs
 * on 8791 + bridge on 8789. Catches the case where the supervisor wasn't
 * restarted after the env-var change landed.
 */

function inferBridgePort(): number {
  const serverPort = Number(process.env.PORT ?? 8791);
  // Live (server 8790) → bridge 8788. Template default (server 8791) → bridge 8789.
  if (serverPort === 8790) return 8788;
  return 8789;
}

export const BRIDGE_URL =
  process.env.CLAUDE_BRIDGE_URL ?? `http://localhost:${inferBridgePort()}/run`;
