// Compatibility entrypoint for npm and the platform-specific Start scripts.
import { spawn } from 'node:child_process';
const action = process.argv[2] === 'stop' ? 'stop' : 'run';
const child = spawn('bash', ['scripts/dev.sh', action], { stdio: 'inherit' });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
