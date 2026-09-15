import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  cpSync,
  openSync,
  closeSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import { root, executable, run } from './workspace.mjs';
import { step } from './ui.mjs';
import {
  readJSON,
  writeJSON,
  readEnv,
  processIdentity,
  ownsProcess,
  alive,
  choosePort,
  choosePortBlock,
  parsePort,
  waitFor,
  delay,
  acquireLock,
  portAvailable,
  supabaseConfig,
} from './runtime.mjs';

const runtime = path.join(root, '.local-data/runtime');
const stateFile = path.join(runtime, 'web.json');
const configFile = path.join(runtime, 'supabase/config.toml');
const envFile = path.join(root, '.env.local');
const nextBin = path.join(root, 'node_modules/next/dist/bin/next');
const graphSha = '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b';
const composeArgs = ['compose', '--env-file', envFile, '-f', 'compose.local.yaml'];
function capture(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 15000 });
}
function supabase(args, options = {}) {
  return run(executable('supabase'), ['--workdir', runtime, ...args], options);
}
function databaseStatus() {
  if (!existsSync(configFile)) return null;
  const result = capture(executable('supabase'), ['--workdir', runtime, 'status', '-o', 'json']);
  try {
    return result.status === 0 ? JSON.parse(result.stdout) : null;
  } catch {
    return null;
  }
}
async function ensureDocker() {
  if (capture('docker', ['info']).status === 0) return;
  step('Starting Docker');
  if (process.platform === 'darwin') {
    if (!existsSync('/Applications/Docker.app')) {
      if (capture('brew', ['--version']).status !== 0)
        throw Error('Install Docker Desktop (or Homebrew), then rerun make run.');
      run('brew', ['install', '--cask', 'docker']);
    }
    run('open', ['-a', 'Docker']);
  } else if (process.platform === 'linux') {
    capture('systemctl', ['--user', 'start', 'docker']);
    if (capture('docker', ['info']).status !== 0)
      capture('sudo', ['-n', 'systemctl', 'start', 'docker']);
  }
  await waitFor(async () => capture('docker', ['info']).status === 0, 'Docker', {
    timeout: 120000,
  });
}
function configurePublicImageClient() {
  // All stack images are public. Avoid interactive global credential helpers.
  const original = process.env.DOCKER_CONFIG || path.join(homedir(), '.docker');
  const isolated = path.join(runtime, 'docker');
  const settings = readJSON(path.join(original, 'config.json')) || {};
  mkdirSync(isolated, { recursive: true });
  const contexts = path.join(original, 'contexts');
  if (existsSync(contexts) && !existsSync(path.join(isolated, 'contexts')))
    symlinkSync(contexts, path.join(isolated, 'contexts'), 'dir');
  writeJSON(path.join(isolated, 'config.json'), {
    auths: {},
    currentContext: settings.currentContext || 'default',
    cliPluginsExtraDirs: [
      ...(settings.cliPluginsExtraDirs || []),
      path.join(original, 'cli-plugins'),
      '/Applications/Docker.app/Contents/Resources/cli-plugins',
    ],
  });
  process.env.DOCKER_CONFIG = isolated;
}
async function configureSupabase(webPort) {
  const old = readJSON(path.join(runtime, 'ports.json'));
  const preferred = parsePort(process.env.SUPABASE_PORT_BASE, old?.base ?? 54320);
  const base = await choosePortBlock(preferred, {
    explicit: !!process.env.SUPABASE_PORT_BASE,
    available: (port) => port !== webPort && portAvailable(port),
  });
  const config = supabaseConfig(
    readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'),
    base,
    webPort,
  );
  mkdirSync(path.dirname(configFile), { recursive: true });
  writeFileSync(configFile, config);
  writeJSON(path.join(runtime, 'ports.json'), { base });
  return base;
}
export async function stopWeb() {
  const state = readJSON(stateFile);
  if (!state) return;
  if (ownsProcess(state, root)) {
    process.kill(state.pid, 'SIGTERM');
    await waitFor(async () => !ownsProcess(state, root), 'Website shutdown', {
      timeout: 20000,
      interval: 200,
    });
  } else if (alive(state.pid))
    throw Error('Website PID belongs to a different process; refusing to stop it.');
  rmSync(stateFile, { force: true });
}
async function webHealthy(state) {
  if (!ownsProcess(state, root)) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${state.port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    const d = await r.json();
    return r.ok && d.instance === state.instance;
  } catch {
    return false;
  }
}
async function trainerPort(webPort) {
  const current = capture('docker', [...composeArgs, 'port', 'trainer', '8000']);
  const port = Number(current.stdout?.trim().split(':').at(-1));
  const requested = parsePort(process.env.TRAINER_PORT, 8000);
  if (current.status === 0 && port && (!process.env.TRAINER_PORT || port === requested))
    return port;
  return choosePort(requested, { explicit: !!process.env.TRAINER_PORT, excluded: [webPort] });
}
function trainerNeedsNewNetwork() {
  const container = capture('docker', [...composeArgs, 'ps', '-a', '-q', 'trainer']);
  if (container.status !== 0 || !container.stdout.trim()) return false;
  const network = capture('docker', [
    'network',
    'inspect',
    'supabase_network_drosophila-local',
    '--format',
    '{{.Id}}',
  ]);
  const attached = capture('docker', [
    'inspect',
    container.stdout.trim(),
    '--format',
    '{{with index .NetworkSettings.Networks "supabase_network_drosophila-local"}}{{.NetworkID}}{{end}}',
  ]);
  return network.status === 0 && attached.status === 0 && network.stdout !== attached.stdout;
}
export async function startStack() {
  mkdirSync(runtime, { recursive: true });
  const release = await acquireLock(path.join(runtime, 'operation.lock'));
  let newChild;
  try {
    await ensureDocker();
    configurePublicImageClient();
    const previous = readJSON(stateFile);
    const previousHealthy = await webHealthy(previous);
    let webPort = previousHealthy && !process.env.WEB_PORT ? previous.port : null;
    if (previousHealthy && Number(process.env.WEB_PORT) === previous.port) webPort = previous.port;
    if (!webPort)
      webPort = await choosePort(parsePort(process.env.WEB_PORT, 3000), {
        explicit: !!process.env.WEB_PORT,
      });
    let status = databaseStatus();
    if (!status) {
      const base = await configureSupabase(webPort);
      step(`Starting local Supabase (ports ${base}-${base + 6})`);
      cpSync(path.join(root, 'supabase/migrations'), path.join(runtime, 'supabase/migrations'), {
        recursive: true,
      });
      supabase(['start'], { timeout: 900000, stdio: ['ignore', 'pipe', 'inherit'] });
      status = databaseStatus();
    } else step('Reusing local Supabase');
    if (!status?.DB_URL)
      throw Error('Supabase did not report a database URL. See its startup output.');
    cpSync(path.join(root, 'supabase/migrations'), path.join(runtime, 'supabase/migrations'), {
      recursive: true,
    });
    supabase(['migration', 'up', '--local'], { timeout: 120000 });
    const old = readEnv(envFile);
    // Compose interpolates required variables even when querying current container ports.
    Object.assign(process.env, old);
    const port = await trainerPort(webPort);
    const trainerDB = new URL(status.DB_URL);
    trainerDB.hostname = 'supabase_db_drosophila-local';
    trainerDB.port = '5432';
    const values = {
      ...old,
      LOCAL_WORKSPACE: '1',
      LOCAL_WORKSPACE_ID: old.LOCAL_WORKSPACE_ID || randomUUID(),
      DATABASE_URL: status.DB_URL,
      TRAINER_DATABASE_URL: trainerDB.href,
      LAB_SERVICE_URL: `http://127.0.0.1:${port}`,
      LAB_TRAINER_PORT: String(port),
      LAB_ALLOW_LOCAL: '1',
      LAB_SERVICE_TOKEN: old.LAB_SERVICE_TOKEN || randomBytes(32).toString('hex'),
      PROVIDER_ENCRYPTION_KEY: old.PROVIDER_ENCRYPTION_KEY || randomBytes(32).toString('base64'),
    };
    writeFileSync(
      envFile,
      Object.entries(values)
        .map(([key, value]) => key + '=' + value)
        .join('\n') + '\n',
      { mode: 0o600 },
    );
    chmodSync(envFile, 0o600);
    Object.assign(process.env, values);
    step(`Starting trainer (port ${port})`);
    // Timestamped build attestations otherwise recreate unchanged local trainers.
    run(
      'docker',
      [
        ...composeArgs,
        'up',
        '-d',
        '--build',
        ...(trainerNeedsNewNetwork() ? ['--force-recreate'] : []),
      ],
      {
        timeout: 1200000,
        env: { ...process.env, BUILDX_NO_DEFAULT_ATTESTATIONS: '1' },
      },
    );
    const owner = createHash('sha256').update('local-workspace').digest('hex');
    await waitFor(
      async () => {
        try {
          const r = await fetch(values.LAB_SERVICE_URL + '/health', {
            headers: { Authorization: 'Bearer ' + values.LAB_SERVICE_TOKEN, 'X-Lab-Owner': owner },
            signal: AbortSignal.timeout(3000),
          });
          if (!r.ok) return false;
          const d = await r.json();
          return d.graphSha256 === graphSha && d.persistent === true;
        } catch {
          return false;
        }
      },
      'Trainer health (inspect make logs)',
      { timeout: 180000 },
    );
    const configHash = createHash('sha256').update(JSON.stringify(values)).digest('hex');
    if (previousHealthy && previous.port === webPort && previous.configHash === configHash)
      step('Reusing healthy website');
    else {
      await stopWeb();
      const log = path.join(root, '.local-data/logs/web.log');
      mkdirSync(path.dirname(log), { recursive: true });
      const fd = openSync(log, 'a', 0o600);
      try {
        newChild = spawn(
          process.execPath,
          [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)],
          {
            cwd: root,
            env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
            detached: true,
            stdio: ['ignore', fd, fd],
          },
        );
      } finally {
        closeSync(fd);
      }
      newChild.on('error', (error) => console.error(error.message));
      await delay(200);
      const state = {
        pid: newChild.pid,
        identity: processIdentity(newChild.pid),
        port: webPort,
        root,
        instance: values.LOCAL_WORKSPACE_ID,
        configHash,
      };
      writeJSON(stateFile, state);
      await waitFor(() => webHealthy(state), 'Website (inspect .local-data/logs/web.log)', {
        timeout: 120000,
      });
      newChild.unref();
      newChild = null;
    }
    console.log(
      `\nLab:      http://localhost:${webPort}\nTrainer:  ${values.LAB_SERVICE_URL}\nSupabase: ${status.API_URL || 'ready'}\nLogs:     ${path.join(root, '.local-data/logs/web.log')}\nStop:     make stop (data and checkpoints are retained)`,
    );
  } catch (error) {
    if (newChild) {
      newChild.kill('SIGTERM');
      newChild.unref();
      rmSync(stateFile, { force: true });
    }
    throw error;
  } finally {
    await release();
  }
}
export async function stopStack() {
  mkdirSync(runtime, { recursive: true });
  const release = await acquireLock(path.join(runtime, 'operation.lock'));
  const errors = [];
  try {
    try {
      await stopWeb();
    } catch (error) {
      errors.push(error.message);
    }
    if (existsSync(envFile))
      try {
        run('docker', [...composeArgs, 'stop'], { timeout: 180000 });
      } catch (error) {
        errors.push(error.message);
      }
    if (existsSync(configFile))
      try {
        supabase(['stop'], { timeout: 180000 });
      } catch (error) {
        errors.push(error.message);
      }
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Lab stopped. Data, keys, and checkpoints retained.');
  } finally {
    await release();
  }
}
export async function showStatus() {
  const state = readJSON(stateFile);
  console.log(
    (await webHealthy(state))
      ? `Website: http://localhost:${state.port}`
      : 'Website: stopped or unhealthy',
  );
  console.log(databaseStatus() ? 'Supabase: running' : 'Supabase: stopped');
  console.log('Website log: .local-data/logs/web.log');
  if (existsSync(envFile)) run('docker', [...composeArgs, 'ps']);
}
export async function checkPorts() {
  for (const [name, port] of [
    ['web', parsePort(process.env.WEB_PORT, 3000)],
    ['trainer', parsePort(process.env.TRAINER_PORT, 8000)],
    ['Supabase API', parsePort(process.env.SUPABASE_PORT_BASE, 54320) + 1],
  ])
    console.log(
      `${name}: ${port} ${(await portAvailable(port)) ? 'available' : 'occupied (will reuse owned service or select an alternative)'}`,
    );
}

export async function withStackLock(action) {
  mkdirSync(runtime, { recursive: true });
  const release = await acquireLock(path.join(runtime, 'operation.lock'));
  try {
    return await action();
  } finally {
    await release();
  }
}
