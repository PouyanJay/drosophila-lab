import * as THREE from 'three';
import { membraneGallery } from './atlas-membrane-data';
export { membraneGallery } from './atlas-membrane-data';

export async function loadMembrane(bodyId: string, signal: AbortSignal) {
  const entry = membraneGallery.find((cell) => cell.bodyId === bodyId);
  if (!entry) return null;
  if (signal.aborted) throw Error('Membrane loading cancelled');
  if (!/^\d+-[a-f0-9]{12}\.bin\.gz$/.test(entry.file) || entry.decodedBytes > 32_000_000)
    throw Error('Invalid membrane entry');
  const response = await fetch('/malecns/membranes-v1/' + entry.file, { signal });
  if (!response.ok) throw Error('Membrane unavailable');
  const compressed = await response.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', compressed)),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  if (digest !== entry.sha256) throw Error('Membrane checksum mismatch');
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const output = new Uint8Array(entry.decodedBytes);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted || offset + value.length > output.length)
        throw Error('Membrane decoding cancelled or oversized');
      output.set(value, offset);
      offset += value.length;
    }
  } finally {
    await reader.cancel();
  }
  if (offset !== output.length) throw Error('Incomplete membrane');
  const header = new DataView(output.buffer);
  const vertices = header.getUint32(0, true),
    faces = header.getUint32(4, true);
  if (
    vertices !== entry.vertices ||
    faces !== entry.faces ||
    8 + vertices * 12 + faces * 12 !== output.length
  )
    throw Error('Invalid membrane layout');
  const positions = new Float32Array(output.buffer, 8, vertices * 3);
  const indices = new Uint32Array(output.buffer, 8 + vertices * 12, faces * 3);
  if (!positions.every(Number.isFinite) || !indices.every((index) => index < vertices))
    throw Error('Invalid membrane geometry');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
