import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createModuleLoader } from './helpers/load-typescript.mjs';

const load = createModuleLoader();
const { parseMorphologyManifest, decodeMorphology } = await load(
  '@/features/atlas/atlas-morphology',
);
const directory = new URL('../public/malecns/atlas-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));

test('display manifest rejects duplicate identities, bad offsets and mismatched sizes', () => {
  assert.equal(parseMorphologyManifest(manifest).neuronCount, 768);
  for (const mutate of [
    (m) => {
      m.chunks[0].cells[1].bodyId = m.chunks[0].cells[0].bodyId;
    },
    (m) => {
      m.chunks[0].cells[0].offset = 1;
    },
    (m) => {
      m.chunks[0].decodedByteLength += 4;
    },
    (m) => {
      m.chunks[0].file = '../other.bin.gz';
    },
    (m) => {
      m.segmentCount += 1;
    },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => parseMorphologyManifest(invalid));
  }
});

test('compressed morphology verifies integrity and decoded size before GPU use', async () => {
  const chunk = manifest.chunks[0];
  const raw = await readFile(new URL(chunk.file, directory));
  const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const geometry = await decodeMorphology(bytes, chunk);
  assert.equal(geometry.length, chunk.segments * 8);
  const corrupt = bytes.slice(0);
  new Uint8Array(corrupt)[10] ^= 1;
  await assert.rejects(decodeMorphology(corrupt, chunk), /checksum/);
  await assert.rejects(decodeMorphology(bytes, { ...chunk, decodedByteLength: 32 }), /exceeds/);
});
