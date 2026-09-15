import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Each check gets a separate process so provider mocks and worker globals cannot leak.
for (const name of [
  'planner',
  'providers',
  'conversation',
  'lab',
  'compute',
  'atlas-variants',
  'browser-engine',
  'device-compute',
]) {
  const result = spawnSync(process.execPath, [`scripts/research/check-${name}.mjs`], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
