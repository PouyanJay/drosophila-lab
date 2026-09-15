import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { root, run, installDependencies } from './lib/workspace.mjs';
import { step, summary } from './lib/ui.mjs';
import {
  startStack,
  stopStack,
  showStatus,
  checkPorts,
  stopWeb,
  withStackLock,
} from './lib/local-stack.mjs';

process.chdir(root);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const uv = (...args) => ['uv', ['run', '--frozen', ...args]];
export const webTests = [
  ['Node tests', npm, ['test']],
  ['Research/browser checks', npm, ['run', 'test:research']],
];
const pythonTests = [
  [
    'Python trainer/discovery',
    ...uv('python', '-m', 'unittest', 'research.lab.test_lab', 'research.lab.test_discovery'),
  ],
  [
    'Python offline runner',
    ...uv('python', '-m', 'unittest', 'discover', '-s', 'research', '-p', 'test_runner.py'),
  ],
];
const agentCheck = ['Agent compatibility', ...uv('python', 'scripts/check-agents.py')];
const linters = [
  ['Web formatting', npm, ['run', 'format:check']],
  ['TypeScript', npm, ['run', 'typecheck']],
  ['ESLint', npm, ['run', 'lint']],
  ['Python lint', ...uv('ruff', 'check', 'scripts', 'research/export_ancestry.py')],
  [
    'Python formatting',
    ...uv('ruff', 'format', '--check', 'scripts', 'research/export_ancestry.py'),
  ],
  agentCheck,
];
const build = ['Production build', npm, ['run', 'build']];
export function runChecks(checks, execute = run) {
  const results = [];
  for (const [name, command, args] of checks) {
    step(name);
    try {
      execute(command, args);
      results.push({ name, ok: true });
    } catch (error) {
      console.error(error.message);
      results.push({ name, ok: false });
    }
  }
  summary(results);
  return results.every((result) => result.ok);
}
function setup() {
  step('Synchronizing locked web dependencies');
  installDependencies();
  step('Synchronizing uv/Python dependencies');
  run('uv', ['sync', '--frozen']);
}
async function main(action) {
  switch (action) {
    case 'setup':
      setup();
      break;
    case 'run':
      setup();
      await startStack();
      break;
    case 'start':
      if (!existsSync('node_modules/.bin/next') || !existsSync('.venv')) setup();
      await startStack();
      break;
    case 'stop':
      await stopStack();
      break;
    case 'status':
      await showStatus();
      break;
    case 'check-ports':
      await checkPorts();
      break;
    case 'logs':
      run('tail', ['-n', '80', '-f', '.local-data/logs/web.log']);
      break;
    case 'test':
      process.exitCode = runChecks([...webTests, ...pythonTests]) ? 0 : 1;
      break;
    case 'test-web':
      process.exitCode = runChecks(webTests.slice(0, 1)) ? 0 : 1;
      break;
    case 'test-research':
      process.exitCode = runChecks(webTests.slice(1)) ? 0 : 1;
      break;
    case 'test-python':
      process.exitCode = runChecks(pythonTests) ? 0 : 1;
      break;
    case 'lint':
      process.exitCode = runChecks(linters) ? 0 : 1;
      break;
    case 'lint-fix':
      process.exitCode = runChecks([
        ['Format web', npm, ['run', 'format']],
        [
          'Fix Python lint',
          ...uv('ruff', 'check', '--fix', 'scripts', 'research/export_ancestry.py'),
        ],
        ['Format Python', ...uv('ruff', 'format', 'scripts', 'research/export_ancestry.py')],
        ...linters,
      ])
        ? 0
        : 1;
      break;
    case 'build':
      process.exitCode = runChecks([build]) ? 0 : 1;
      break;
    case 'check':
      process.exitCode = runChecks([...linters, ...webTests, ...pythonTests, build]) ? 0 : 1;
      break;
    case 'check-agents':
      process.exitCode = runChecks([agentCheck]) ? 0 : 1;
      break;
    case 'backup':
      await withStackLock(async () => {
        await stopWeb();
        run(process.execPath, ['scripts/local-backup.mjs']);
      });
      break;
    case 'restore':
      if (!process.env.BACKUP) throw Error('Use make restore BACKUP=backups/FOLDER');
      await withStackLock(async () => {
        await stopWeb();
        run(process.execPath, ['scripts/local-restore.mjs', process.env.BACKUP]);
      });
      break;
    default:
      throw Error(`Unknown command: ${action}. Run make help.`);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync('.local-data', { recursive: true });
  try {
    await main(process.argv[2] || 'help');
  } catch (error) {
    console.error('Lab: ' + error.message);
    process.exitCode = 1;
  }
}
