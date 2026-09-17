import { z } from 'zod';

const cellSchema = z.object({
  bodyId: z.string().regex(/^\d{1,12}$/),
  type: z.string(),
  cellClass: z.string().default('other'),
  side: z.string().default(''),
  neurotransmitter: z.string().default('unclear'),
  group: z.number().int().min(0).max(3),
  offset: z.number().int().nonnegative(),
  segments: z.number().int().nonnegative(),
  bounds: z.tuple([
    z.tuple([z.number(), z.number(), z.number()]),
    z.tuple([z.number(), z.number(), z.number()]),
  ]),
});
const chunkSchema = z.object({
  file: z.string().regex(/^group-[0-3]-\d+-[a-f0-9]{12}\.bin\.gz$/),
  group: z.number().int().min(0).max(3),
  segments: z.number().int().min(1).max(4_000_000),
  decodedByteLength: z.number().int().max(64_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  cells: z.array(cellSchema).min(1).max(32),
});
const manifestSchema = z.object({
  schema: z.literal('malecns-atlas/1'),
  neuronCount: z.number().int().min(1).max(4096),
  segmentCount: z.number().int().min(1).max(4_000_000),
  chunks: z.array(chunkSchema).min(1).max(131),
});
export type MorphologyCell = z.infer<typeof cellSchema>;
export type MorphologyChunk = z.infer<typeof chunkSchema>;

export function parseMorphologyManifest(input: unknown) {
  const manifest = manifestSchema.parse(input);
  const ids = new Set<string>();
  let segments = 0;
  for (const chunk of manifest.chunks) {
    let offset = 0;
    for (const cell of chunk.cells) {
      if (
        ids.has(cell.bodyId) ||
        cell.offset !== offset ||
        cell.group !== chunk.group ||
        cell.bounds[0].some((v, i) => v > cell.bounds[1][i])
      )
        throw Error('Invalid atlas cell index');
      ids.add(cell.bodyId);
      offset += cell.segments;
    }
    if (offset !== chunk.segments || chunk.decodedByteLength !== offset * 32)
      throw Error('Invalid atlas chunk size');
    segments += offset;
  }
  if (ids.size !== manifest.neuronCount || segments !== manifest.segmentCount)
    throw Error('Invalid atlas totals');
  return manifest;
}

export async function decodeMorphology(bytes: ArrayBuffer, chunk: MorphologyChunk) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== chunk.sha256) throw Error('Atlas geometry checksum mismatch');
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const output = new Uint8Array(chunk.decodedByteLength);
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > output.byteLength)
        throw Error('Atlas geometry exceeds declared size');
      output.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    await reader.cancel();
  }
  if (offset !== output.byteLength) throw Error('Incomplete atlas geometry');
  const floats = new Float32Array(output.buffer);
  for (let i = 0; i < floats.length; i++) {
    if (!Number.isFinite(floats[i]) || (i % 4 === 3 && floats[i] < 0))
      throw Error('Invalid atlas coordinate or radius');
  }
  return floats;
}
