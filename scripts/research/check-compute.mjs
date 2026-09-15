import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createModuleLoader } from '../../tests/helpers/load-typescript.mjs';
const db = await PGlite.create();
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await db.exec(readFileSync('supabase/migrations/20260915000000_local_workspace.sql', 'utf8'));
await db.exec('SET search_path=lab,public');
process.env.DATABASE_URL = 'postgresql://local-test';
process.env.PROVIDER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
let user = null;
const setUser = (value) => {
  user = value;
};
const load = createModuleLoader({
  pg: {
    Pool: class {
      on() {}
      query(sql, values) {
        return db.query(sql, values);
      }
    },
  },
  '@/server/auth/local-user': { getLocalUser: async () => user },
});
const { publicTrainerURL, publicAddress, ownerHash } = await load('@/server/compute-connections');
const { defaultLabConfig } = await load('@/lib/contracts/lab-contract');
const route = await load('@/app/api/compute/route');
const proxy = await load('@/app/api/lab/[...path]/route');
for (const u of [
  'http://trainer.test.com',
  'https://127.0.0.1',
  'https://localhost',
  'https://metadata.internal',
  'https://a.local',
  'https://user:secret@valid.com',
  'https://valid.com/path',
  'https://valid.com:8000',
  'https://valid.com?token=a',
])
  assert.throws(() => publicTrainerURL(u));
for (const ip of [
  '127.0.0.1',
  '169.254.169.254',
  '10.1.2.3',
  '172.16.1.2',
  '192.168.1.1',
  '100.64.1.1',
  '::1',
  'fd00::1',
  'fe80::1',
  '2001:db8::1',
])
  assert.equal(publicAddress(ip), false);
assert(publicAddress('104.16.1.2'));
assert(publicAddress('2606:4700::1'));
const request = (method, body, origin = 'https://studio.example', id) =>
  new Request('https://studio.example/api/compute', {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(id ? { 'X-Compute-ID': id } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
assert.equal((await route.GET()).status, 401);
setUser({ userId: 'alice' });
assert.equal((await route.POST(request('POST', {}, 'https://other.example'))).status, 403);
const original = globalThis.fetch,
  calls = [];
let privateDNS = false,
  badGraph = false;
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('cloudflare-dns'))
    return Response.json({ Answer: [{ type: 1, data: privateDNS ? '127.0.0.1' : '104.16.1.2' }] });
  if (String(url).endsWith('/health'))
    return Response.json({
      engine: 'malecns-synaptic-lab/1.0',
      graphSha256: badGraph
        ? 'bad'
        : '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b',
      neurons: 165122,
      edges: 6235682,
      persistent: true,
      device: 'cpu',
      status: 'ready',
    });
  return Response.json({ id: 'test-run', config: defaultLabConfig, status: 'queued' });
};
try {
  const input = {
    name: 'My workstation',
    url: 'https://trainer.research.net',
    token: 'test-only-trainer-token-012345678901234567890',
  };
  const response = await route.POST(request('POST', input));
  assert.equal(response.status, 200);
  const saved = (await response.json()).connection;
  const listed = await (await route.GET()).json();
  assert.equal(listed.connections.length, 1);
  assert(!JSON.stringify(listed).includes(input.token));
  const row = (await db.query('select * from compute_connections')).rows[0];
  assert(!row.sealed_token.includes(input.token));
  const health = await proxy.GET(
    new Request('https://studio.example/api/lab/health', { headers: { 'X-Compute-ID': saved.id } }),
  );
  assert.equal((await health.json()).connected, true);
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer ' + input.token);
  assert.equal(calls.at(-1).options.headers['X-Lab-Owner'], await ownerHash('alice'));
  setUser({ userId: 'bob' });
  assert.equal((await (await route.GET()).json()).connections.length, 0);
  assert.equal((await route.DELETE(request('DELETE', { id: saved.id }))).status, 404);
  assert.equal(
    (
      await proxy.GET(
        new Request('https://studio.example/api/lab/health', {
          headers: { 'X-Compute-ID': saved.id },
        }),
      )
    ).status,
    404,
  );
  assert.equal((await route.POST(request('POST', { ...input, id: saved.id }))).status, 400);
  setUser({ userId: 'alice' });
  privateDNS = true;
  assert.equal(
    (await route.POST(request('POST', { ...input, url: 'https://private.research.net' }))).status,
    400,
  );
  privateDNS = false;
  badGraph = true;
  assert.equal((await route.POST(request('POST', input))).status, 400);
  badGraph = false;
  const changed = await route.POST(
    request('POST', {
      ...input,
      id: saved.id,
      name: 'Renamed machine',
      url: 'https://new.research.net',
    }),
  );
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).connection.id, saved.id);
  const result = await proxy.POST(
    new Request('https://studio.example/api/lab/jobs', {
      method: 'POST',
      headers: { Origin: 'https://studio.example', 'X-Compute-ID': saved.id },
      body: JSON.stringify({ requestKey: 'reproducible-key', config: defaultLabConfig }),
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(calls.at(-1).url, 'https://new.research.net/jobs');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).config, defaultLabConfig);
  const artifact = await proxy.GET(
    new Request(
      'https://studio.example/api/lab/jobs/11111111-1111-4111-8111-111111111111/artifacts/checkpoint.pt?compute=' +
        saved.id,
    ),
  );
  assert.equal(artifact.status, 200);
  assert.equal(
    calls.at(-1).url,
    'https://new.research.net/jobs/11111111-1111-4111-8111-111111111111/artifacts/checkpoint.pt',
  );
  assert.equal((await route.DELETE(request('DELETE', { id: saved.id }))).status, 200);
  assert.equal((await (await route.GET()).json()).connections.length, 0);
  assert.equal(
    (
      await proxy.GET(
        new Request('https://studio.example/api/lab/health', {
          headers: { 'X-Compute-ID': saved.id },
        }),
      )
    ).status,
    404,
  );
} finally {
  globalThis.fetch = original;
  await db.close();
}
console.log(
  'Passed: real Postgres migration/storage, encrypted secrets, per-user isolation, invalid/private HTTPS rejection, graph verification, connection replace/revoke, and exact selected-machine job routing. DNS and trainer HTTP mocked.',
);
