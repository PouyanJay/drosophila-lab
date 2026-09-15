/** Download a text or JSON artifact and release the temporary browser URL. */
export function downloadFile(name: string, data: unknown, type = 'application/json') {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 2));
}
