import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^\d{1,12}$/.test(id))
    return Response.json({ error: 'Invalid body ID' }, { status: 400 });
  try {
    const raw = await readFile(path.join(process.cwd(), 'public/malecns/skeletons', id + '.bin'));
    if (raw.length % 4 || raw.length > 8000000) throw Error('Invalid local morphology');
    const segments = Array.from(
      new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)),
    );
    return Response.json(
      { bodyId: id, segments, source: 'bundled MaleCNS morphology', units: 'micrometres' },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch {
    return Response.json(
      { error: 'This neuron’s detailed morphology is not bundled in this local atlas.' },
      { status: 404 },
    );
  }
}
