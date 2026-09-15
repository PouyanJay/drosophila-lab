import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  choosePort,
  choosePortBlock,
  parsePort,
  ownsProcess,
  acquireLock,
  supabaseConfig,
  readEnv,
  waitFor,
} from '../../scripts/lib/runtime.mjs';
import { runChecks } from '../../scripts/dev.mjs';

test('an occupied real socket selects an alternative without disturbing its owner', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    if (port > 65400) return;
    assert.notEqual(await choosePort(port), port);
    assert.equal(server.listening, true);
    await assert.rejects(choosePort(port, { explicit: true }), /occupied/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
test('Supabase skips whole colliding blocks and explicit requests fail', async () => {
  const available = async (port) => port !== 54322;
  assert.equal(await choosePortBlock(54320, { available }), 54330);
  await assert.rejects(choosePortBlock(54320, { available, explicit: true }), /occupied/);
  assert.equal(await choosePort(3000, { available: async () => true, excluded: [3000] }), 3001);
});
test('ports reject privileged, invalid and out-of-range values', () => {
  for (const value of ['bad', '0', '1023', '65536', '3000.5'])
    assert.throws(() => parsePort(value, 3000));
  assert.equal(parsePort('', 3000), 3000);
  assert.equal(parsePort('3100', 3000), 3100);
});
test('PID reuse or another checkout never grants process ownership', () => {
  const root = '/tmp/lab';
  const identity = 'started /tmp/lab/node_modules/next/dist/bin/next dev';
  const state = { root, pid: 123, identity };
  assert(ownsProcess(state, root, () => identity));
  assert(!ownsProcess(state, root, () => 'different process'));
  assert(!ownsProcess(state, '/tmp/another', () => identity));
  assert(
    !ownsProcess({ root, pid: 123, identity: 'started database' }, root, () => 'started database'),
  );
});
test('kernel lifecycle lock rejects a live owner and permits acquisition after release', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-lock-'));
  try {
    const release = await acquireLock(dir);
    await assert.rejects(acquireLock(dir), /active/);
    await release();
    const next = await acquireLock(dir);
    await next();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('a killed lifecycle owner releases its kernel lock automatically', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-lock-crash-'));
  const moduleUrl = new URL('../../scripts/lib/runtime.mjs', import.meta.url).href;
  const code = `import { acquireLock } from ${JSON.stringify(moduleUrl)}; await acquireLock(${JSON.stringify(dir)}); console.log('ready');`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    assert.match(String((await once(child.stdout, 'data'))[0]), /ready/);
    const exited = once(child, 'exit');
    child.kill('SIGKILL');
    await exited;
    await waitFor(
      async () => {
        try {
          const release = await acquireLock(dir);
          await release();
          return true;
        } catch (error) {
          if (!error.message.includes('active')) throw error;
          return false;
        }
      },
      'Lock recovery',
      { timeout: 5000, interval: 50 },
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
});
test('overlapping Supabase port overrides keep service ports distinct', () => {
  const template =
    '[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\n[studio]\nport = 54323\n';
  const config = supabaseConfig(template, 54321, 3100);
  assert(config.includes('[api]\nport = 54322'));
  assert(config.includes('[db]\nport = 54323'));
  assert(config.includes('shadow_port = 54321'));
  assert(config.includes('[studio]\nport = 54324'));
});
test('all selected checks execute even when the first check fails', () => {
  const seen = [];
  assert.equal(
    runChecks(
      [
        ['first', 'one', []],
        ['second', 'two', []],
      ],
      (command) => {
        seen.push(command);
        if (command === 'one') throw Error('expected test failure');
      },
    ),
    false,
  );
  assert.deepEqual(seen, ['one', 'two']);
});
test('generated environment preserves values containing equals and digits in names', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'lab-env-'));
  const file = path.join(dir, 'env');
  try {
    writeFileSync(file, 'KEY2=abc==\n# comment\n');
    assert.deepEqual(readEnv(file), { KEY2: 'abc==' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
