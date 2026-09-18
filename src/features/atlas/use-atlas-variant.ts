'use client';
import { useEffect, useState } from 'react';
type AtlasMap = {
  graphSha256: string;
  lab: Record<string, string[]>;
  browser: Record<string, string[]>;
  positions: Record<string, number[]>;
};
const GRAPH = '729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b';
let cached: Promise<AtlasMap> | null = null;
function loadMap() {
  return (cached ??= (async () => {
    const r = await fetch('/research/atlas-variants.json');
    if (!r.ok) throw Error();
    const d = (await r.json()) as AtlasMap;
    if (d.graphSha256 !== GRAPH) throw Error();
    return d as AtlasMap;
  })().catch((e) => {
    cached = null;
    throw e;
  }));
}
export function useAtlasVariant(
  execution: 'lab' | 'browser',
  config: { duplicates: number; population: string },
  recorded: string[] | undefined,
  available: boolean,
) {
  const [map, setMap] = useState<AtlasMap | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!available) return;
    let alive = true;
    loadMap()
      .then((d) => {
        if (alive) {
          setMap(d);
          setError('');
        }
      })
      .catch(() => {
        if (alive) setError('Source-copy preview could not load. Training settings are preserved.');
      });
    return () => {
      alive = false;
    };
  }, [available]);
  const ids = available
    ? (recorded ?? map?.[execution][config.population]?.slice(0, config.duplicates) ?? [])
    : [];
  const positions = ids.flatMap((id) =>
    map?.positions[String(id)] ? [map.positions[String(id)]] : [],
  );
  const locatedIds = ids.filter((id) => map?.positions[String(id)]);
  const sources = [...new Set(locatedIds)].map((bodyId) => ({
    bodyId,
    position: map!.positions[String(bodyId)],
    copies: ids.filter((id) => id === bodyId).length,
  }));
  return {
    positions,
    ids,
    locatedIds,
    sources,
    available,
    loading: available && !map && !error,
    error,
  };
}
