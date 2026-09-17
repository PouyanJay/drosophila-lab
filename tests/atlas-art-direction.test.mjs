import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createModuleLoader } from './helpers/load-typescript.mjs';
const { AtlasCameraFlight } = await createModuleLoader()('@/features/atlas/atlas-camera-flight');

test('camera flight follows an orbit, reaches its target regardless of frame rate and cancels', () => {
  const flight = new AtlasCameraFlight(),
    position = new THREE.Vector3(0, 0, 100),
    target = new THREE.Vector3();
  const end = new THREE.Vector3(100, 0, 0);
  flight.start(position, target, end, target, 0);
  flight.update(550, position, target);
  assert(Math.abs(position.length() - 100) < 1e-8, 'must not cut through the subject');
  assert(position.x > 0 && position.z > 0);
  const halfway = position.clone();
  flight.cancel();
  flight.update(1000, position, target);
  assert(position.equals(halfway));
  flight.start(position, target, end, target, 1000);
  flight.update(2100, position, target);
  assert(position.distanceTo(end) < 1e-8);
  assert.equal(flight.active, false);
  flight.start(position, target, new THREE.Vector3(0, 100, 0), target, 2200);
  flight.update(2200, position, target, true);
  assert(position.distanceTo(new THREE.Vector3(0, 100, 0)) < 1e-8);
});

test('membrane loader validates integrity, layout, indices and cancellation', async () => {
  const raw = Buffer.alloc(56);
  raw.writeUInt32LE(3, 0);
  raw.writeUInt32LE(1, 4);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => raw.writeFloatLE(v, 8 + i * 4));
  [0, 1, 2].forEach((v, i) => raw.writeUInt32LE(v, 44 + i * 4));
  let packed = gzipSync(raw);
  const entry = {
    bodyId: '1',
    file: '1-000000000000.bin.gz',
    decodedBytes: raw.length,
    vertices: 3,
    faces: 1,
    sha256: createHash('sha256').update(packed).digest('hex'),
  };
  const { loadMembrane } = await createModuleLoader({
    './atlas-membrane-data': { membraneGallery: [entry] },
  })('@/features/atlas/atlas-membrane');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(packed);
  try {
    const geometry = await loadMembrane('1', new AbortController().signal);
    assert.equal(geometry.getAttribute('position').count, 3);
    geometry.dispose();
    const hash = entry.sha256;
    entry.sha256 = '0'.repeat(64);
    await assert.rejects(loadMembrane('1', new AbortController().signal), /checksum/);
    entry.sha256 = hash;
    entry.decodedBytes = 52;
    await assert.rejects(loadMembrane('1', new AbortController().signal), /oversized/);
    entry.decodedBytes = 60;
    await assert.rejects(loadMembrane('1', new AbortController().signal), /Incomplete/);
    entry.decodedBytes = 56;
    raw.writeUInt32LE(3, 52);
    packed = gzipSync(raw);
    entry.sha256 = createHash('sha256').update(packed).digest('hex');
    await assert.rejects(loadMembrane('1', new AbortController().signal), /geometry/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(loadMembrane('1', abort.signal), /cancelled/);
  } finally {
    globalThis.fetch = original;
  }
});

test('published membranes preserve source identity, hashes and the SWC coordinate frame', () => {
  const directory = new URL('../public/malecns/membranes-v1/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory)));
  const skeletons = JSON.parse(
    readFileSync(new URL('../public/malecns/atlas-v1/manifest.json', import.meta.url)),
  ).chunks.flatMap((c) => c.cells);
  for (const cell of manifest.cells) {
    const packed = readFileSync(new URL(cell.file, directory));
    assert.equal(createHash('sha256').update(packed).digest('hex'), cell.sha256);
    const raw = gunzipSync(packed);
    assert.equal(raw.length, cell.decodedBytes);
    assert.equal(raw.readUInt32LE(0), cell.vertices);
    assert.equal(raw.readUInt32LE(4), cell.faces);
    const source = skeletons.find((c) => c.bodyId === cell.bodyId);
    assert.equal(cell.type, source.type);
    const bounds = [
      [Infinity, Infinity, Infinity],
      [-Infinity, -Infinity, -Infinity],
    ];
    for (let i = 0; i < cell.vertices * 3; i++) {
      const v = raw.readFloatLE(8 + i * 4);
      assert(Number.isFinite(v));
      bounds[0][i % 3] = Math.min(bounds[0][i % 3], v);
      bounds[1][i % 3] = Math.max(bounds[1][i % 3], v);
    }
    assert.deepEqual(bounds, cell.bounds);
    for (let i = 0; i < cell.faces * 3; i++)
      assert(raw.readUInt32LE(8 + cell.vertices * 12 + i * 4) < cell.vertices);
    for (let j = 0; j < 2; j++)
      for (let k = 0; k < 3; k++) assert(Math.abs(bounds[j][k] - source.bounds[j][k]) < 30);
  }
});

test('dark atlas palette raises cell luminance while retaining category identity', async () => {
  const { cellColor, cellClasses } = await createModuleLoader()(
    '@/features/atlas/atlas-appearance',
  );
  for (const [cellClass] of cellClasses) {
    const cell = { bodyId: '10001', cellClass, group: 2 };
    const light = new THREE.Color(cellColor(cell, 'class', 'light'));
    const dark = new THREE.Color(cellColor(cell, 'class', 'dark'));
    const luminance = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
    assert(luminance(dark) >= luminance(light));
  }
});
