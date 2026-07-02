/**
 * electron-builder afterPack hook: make sure the packed app carries the
 * claude binary for the TARGET platform + arch, not the build machine's.
 *
 * The @anthropic-ai/claude-code wrapper installs a native binary matching the
 * machine that ran `npm install`. When we cross-build (an arm64 mac building
 * the x64 dmg), the packed app would ship the wrong binary and every AI
 * feature would die with a cryptic exec error on members' machines. This hook
 * downloads the right platform package and swaps the binary in.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

module.exports = async function afterPack(context) {
  const platform = context.electronPlatformName; // darwin | win32 | linux
  const arch = ARCH_NAMES[context.arch] ?? String(context.arch);

  const resourcesDir =
    platform === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : path.join(context.appOutDir, 'resources');

  // The binary ships as an extraResource: Resources/claude/claude.exe (the
  // package names it claude.exe on every platform, including mac).
  const packedBin = path.join(resourcesDir, 'claude', 'claude.exe');

  if (!fs.existsSync(packedBin)) {
    console.warn(`[afterPack] bundled claude binary not found at ${packedBin} - skipping arch check`);
    return;
  }

  if (platform === os.platform() && arch === os.arch()) {
    console.log(`[afterPack] claude binary already matches ${platform}-${arch}`);
    return;
  }

  const version = require('@anthropic-ai/claude-code/package.json').version;
  const pkg = `@anthropic-ai/claude-code-${platform}-${arch}`;
  console.log(`[afterPack] cross-build detected - fetching ${pkg}@${version} for the target`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-arch-'));
  try {
    // --cpu/--os override npm's platform check (the package declares a cpu
    // field, and by definition we are fetching one that does NOT match this
    // machine); --force covers older npm versions that ignore --cpu.
    execFileSync(
      'npm',
      ['install', `${pkg}@${version}`, '--prefix', tmp, '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--cpu', arch, '--os', platform, '--force'],
      {
        stdio: 'inherit',
        shell: process.platform === 'win32',
      }
    );
    const srcBin = path.join(
      tmp,
      'node_modules',
      pkg,
      platform === 'win32' ? 'claude.exe' : 'claude'
    );
    if (!fs.existsSync(srcBin)) {
      throw new Error(`downloaded package has no binary at ${srcBin}`);
    }
    fs.copyFileSync(srcBin, packedBin);
    fs.chmodSync(packedBin, 0o755);
    console.log(`[afterPack] swapped in ${pkg} binary`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
