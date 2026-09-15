export function cutawayPlaneConstant(slice = 0) {
  const normalizedSlice = Math.min(100, Math.max(0, slice));
  return 800 - normalizedSlice * 7.7;
}

export function neuralLayerVisible(
  enabled: boolean,
  isolate: boolean | undefined,
  scope: string,
  selectedGroup: number,
  layerGroup: number,
) {
  return enabled && !isolate && (scope === 'cns' || layerGroup !== 3) && (selectedGroup < 0 || selectedGroup === layerGroup);
}

export function neuralLayerAlpha(inventory: boolean | undefined, explode: number) {
  if (!inventory) return 1;
  const normalizedExplode = Math.min(100, Math.max(0, explode));
  return Math.max(0, 1 - normalizedExplode / 20);
}
