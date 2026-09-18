import type { MorphologyCell } from './atlas-morphology';

export const cellClasses = [
  ['cb_intrinsic', 'Central brain', '#4779ef'],
  ['ol_intrinsic', 'Optic lobes', '#36b8c6'],
  ['visual_projection', 'Visual projection', '#9762e0'],
  ['visual_centrifugal', 'Visual feedback', '#c963cb'],
  ['descending_neuron', 'Descending', '#ff974a'],
  ['ascending_neuron', 'Ascending', '#c6d764'],
  ['vnc_intrinsic', 'Nerve cord', '#65c49b'],
  ['vnc_motor', 'Motor · body', '#df75a5'],
  ['vnc_sensory', 'Sensory · body', '#c4dd57'],
  ['cb_sensory', 'Sensory · head', '#edba85'],
  ['cb_motor', 'Motor · head', '#ec91a7'],
  ['other', 'Other / unclassified', '#93a4b8'],
] as const;
export type ColorMode = 'class' | 'cell' | 'anatomy' | 'mono';
const palette = [
  '#4779ef',
  '#ff974a',
  '#36b8c6',
  '#c963cb',
  '#c6d764',
  '#9762e0',
  '#65c49b',
  '#df75a5',
];
const darkColors: Record<string, string> = {
  '#4779ef': '#538ae8',
  '#36b8c6': '#32b3bf',
  '#9762e0': '#9864d5',
  '#c963cb': '#c561bb',
  '#ff974a': '#e79845',
  '#c6d764': '#aebd52',
  '#65c49b': '#54b58d',
  '#df75a5': '#d7759f',
  '#93a4b8': '#8597ad',
  '#c4dd57': '#acc24c',
  '#edba85': '#d4a06b',
  '#ec91a7': '#d87f94',
  '#ffba66': '#e5a450',
  '#9dc6e0': '#80abc7',
};
export function themeColor(color: string, theme: 'dark' | 'light') {
  return theme === 'dark' ? (darkColors[color] ?? color) : color;
}
export function cellColor(
  cell: MorphologyCell,
  mode: ColorMode,
  theme: 'dark' | 'light' = 'light',
): string {
  return themeColor(baseCellColor(cell, mode), theme);
}
function baseCellColor(cell: MorphologyCell, mode: ColorMode): string {
  if (mode === 'mono') return '#9dc6e0';
  if (mode === 'anatomy') return ['#36b8c6', '#9762e0', '#ffba66', '#65c49b'][cell.group];
  if (mode === 'class')
    return (cellClasses.find(([id]) => id === cell.cellClass) ?? cellClasses[11])[2];
  let hash = 0;
  for (const char of cell.bodyId) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return palette[(hash >>> 0) % palette.length];
}
export function normalizedClass(value: string) {
  return cellClasses.some(([id]) => id === value) ? value : 'other';
}
