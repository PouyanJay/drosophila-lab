import { createServer, createConnection } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function readJSON(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
export function writeJSON(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
}
export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function processIdentity(pid) {
  if (!alive(pid)) return null;
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}
export function ownsProcess(state, root, identity = processIdentity) {
  return (
    !!state &&
    state.root === root &&
    state.identity &&
    state.identity === identity(state.pid) &&
    state.identity.includes(path.join(root, 'node_modules/next/dist/bin/next'))
  );
}
export async function portAvailable(port) {
  // Docker Desktop can forward a live port without making bind() fail on macOS.
  const connected = await new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(300, () => finish(true));
  });
  if (connected) return false;
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => {
      if (['EADDRINUSE', 'EACCES'].includes(error.code)) resolve(false);
      else reject(error);
    });
    server.listen({ host: '127.0.0.1', port }, () => server.close(() => resolve(true)));
  });
}
export function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1024 || Number(value) > 65535)
    throw Error('Ports must be integers from 1024 to 65535.');
  return Number(value);
}
export async function choosePort(
  preferred,
  { explicit = false, available = portAvailable, excluded = [] } = {},
) {
  for (let port = preferred; port <= Math.min(preferred + 100, 65535); port++) {
    if (!excluded.includes(port) && (await available(port))) return port;
    if (explicit)
      throw Error(
        `Port ${preferred} is occupied. Choose another port; no existing process was stopped.`,
      );
  }
  throw Error(`No free port near ${preferred}.`);
}
export async function choosePortBlock(
  preferred,
  { explicit = false, available = portAvailable } = {},
) {
  for (let base = preferred; base <= Math.min(preferred + 1000, 65526); base += 10) {
    const ports = Array.from({ length: 10 }, (_, i) => base + i);
    if ((await Promise.all(ports.map(available))).every(Boolean)) return base;
    if (explicit)
      throw Error(
        `Supabase ports ${preferred}-${preferred + 9} are occupied. Choose SUPABASE_PORT_BASE.`,
      );
  }
  throw Error('No available Supabase port block.');
}
export function readEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1)];
        }),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}
export async function acquireLock(directory) {
  const helper = fileURLToPath(new URL('./lifecycle-lock.py', import.meta.url));
  const child = spawn(
    'uv',
    [
      'run',
      '--no-project',
      '--python',
      '3.11',
      'python',
      helper,
      path.join(directory, 'process.lock'),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let diagnostic = '';
  child.stderr.on('data', (chunk) => {
    diagnostic += chunk.toString();
  });
  await new Promise((resolve, reject) => {
    let output = '';
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) reject(Error(diagnostic || 'Another lab lifecycle operation is active.'));
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('locked\n')) resolve();
      else if (output.includes('busy\n'))
        reject(Error('Another lab lifecycle operation is active.'));
    });
  });
  return async () => {
    if (child.exitCode !== null) return;
    const finished = new Promise((resolve) => child.once('exit', resolve));
    child.stdin.end();
    await finished;
  };
}

export function supabaseConfig(template, base, webPort) {
  // One pass over original values avoids cascaded remapping for overlapping blocks.
  const mapped = template.replace(
    /(port = )(5432[0-3])\b/g,
    (_, prefix, original) => prefix + (base + Number(original) - 54320),
  );
  return (
    mapped.replace('http://localhost:3000', `http://localhost:${webPort}`) +
    `\n[inbucket]\nenabled = true\nport = ${base + 4}\nsmtp_port = ${base + 5}\npop3_port = ${base + 6}\n`
  );
}

export async function waitFor(check, label, { timeout = 120000, interval = 1000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(interval);
  }
  throw Error(`${label} did not become ready within ${Math.round(timeout / 1000)} seconds.`);
}
