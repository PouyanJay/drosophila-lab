import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { root, executable, run, installDependencies } from './lib/workspace.mjs';
process.chdir(root);
process.env.NEXT_TELEMETRY_DISABLED = '1';
process.env.SUPABASE_TELEMETRY_DISABLED = '1';
try {
  run('docker', ['info'], { stdio: 'ignore' });
  if (!existsSync(executable('supabase'))) {
    console.log('Installing workspace dependencies for the first launch…');
    installDependencies();
  }
  if (process.argv[2] === 'stop') {
    if (existsSync('.env.local')) loadEnv();
    run('docker', ['compose', '-f', 'compose.local.yaml', 'stop']);
    run(executable('supabase'), ['stop']);
    console.log(
      'Local services stopped. Data and checkpoints are kept. Stop the website terminal with Ctrl+C.',
    );
    process.exit(0);
  }
  console.log('Starting local Supabase…');
  run(executable('supabase'), ['start'], { stdio: ['ignore', 'pipe', 'inherit'] });
  run(executable('supabase'), ['migration', 'up', '--local']);
  const status = JSON.parse(
    run(executable('supabase'), ['status', '-o', 'json'], {
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
    }),
  );
  const old = existsSync('.env.local')
    ? Object.fromEntries(
        readFileSync('.env.local', 'utf8')
          .split(/\r?\n/)
          .filter((x) => /^[A-Z_]+=/.test(x))
          .map((x) => {
            const i = x.indexOf('=');
            return [x.slice(0, i), x.slice(i + 1)];
          }),
      )
    : {};
  const database = status.DB_URL;
  if (!database) throw Error('Supabase did not report a database URL.');
  const trainer = new URL(database);
  trainer.hostname = 'supabase_db_drosophila-local';
  trainer.port = '5432';
  const values = {
    ...old,
    LOCAL_WORKSPACE: '1',
    DATABASE_URL: database,
    TRAINER_DATABASE_URL: trainer.href,
    LAB_SERVICE_URL: 'http://127.0.0.1:8000',
    LAB_ALLOW_LOCAL: '1',
    LAB_SERVICE_TOKEN: old.LAB_SERVICE_TOKEN || randomBytes(32).toString('hex'),
    PROVIDER_ENCRYPTION_KEY: old.PROVIDER_ENCRYPTION_KEY || randomBytes(32).toString('base64'),
  };
  writeFileSync(
    '.env.local',
    Object.entries(values)
      .map(([k, v]) => k + '=' + v)
      .join('\n') + '\n',
    { mode: 0o600 },
  );
  chmodSync('.env.local', 0o600);
  Object.assign(process.env, values);
  console.log('Starting the local training service…');
  run('docker', ['compose', '-f', 'compose.local.yaml', 'up', '-d', '--build']);
  const owner = createHash('sha256').update('local-workspace').digest('hex');
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const r = await fetch(values.LAB_SERVICE_URL + '/health', {
        headers: { Authorization: 'Bearer ' + values.LAB_SERVICE_TOKEN, 'X-Lab-Owner': owner },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.graphSha256 !== '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b')
          throw Error('Graph mismatch');
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready)
    throw Error(
      'Trainer did not become ready. Inspect docker compose -f compose.local.yaml logs trainer. Your saved data is retained.',
    );
  console.log('Local database and full-network trainer are ready.');
  console.log(
    'Open http://localhost:3000. Keep this terminal open for the website; trainer jobs continue after it closes.',
  );
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3000'],
    { stdio: 'inherit' },
  );
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code || 0));
} catch (error) {
  console.error('Local startup: ' + error.message);
  process.exitCode = 1;
}
function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) process.env[line.slice(0, i)] = line.slice(i + 1);
  }
}
