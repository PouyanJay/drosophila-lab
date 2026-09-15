export const nice = (s: string) => s.replaceAll('_', ' ');
export const num = (n: number | undefined) => (n === undefined ? '—' : n.toLocaleString());
