import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const executable = (name) =>
  path.join(root, 'node_modules', '.bin', name + (process.platform === 'win32' ? '.cmd' : ''));

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw Error(
      result.error?.message || `Could not complete ${path.basename(command)} ${args[0] || ''}.`,
    );
  }
  return result.stdout;
}

export function installDependencies() {
  const { packageManager } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  // npx selects the repository's pinned pnpm even without Corepack or a matching global pnpm.
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
    '--yes',
    packageManager,
    'install',
    '--frozen-lockfile',
  ]);
}
