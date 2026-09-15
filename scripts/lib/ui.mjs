const color = process.stdout.isTTY && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb';
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const rule = () =>
  paint('2', '-'.repeat(Math.max(20, Math.min(64, (process.stdout.columns || 80) - 4))));
const elapsed = (ms) => `${(ms / 1000).toFixed(1)}s`;
let stepNumber = 0;
export function step(message) {
  console.log(
    `\n  ${paint('36;1', String(++stepNumber).padStart(2, '0'))}  ${paint('1', message)}\n  ${rule()}`,
  );
}
export function section(title, rows) {
  console.log(`\n  ${paint('1', title)}\n  ${rule()}`);
  for (const [label, value] of rows)
    console.log(
      `  ${paint(label === 'PASS' ? '32' : label === 'FAIL' ? '31' : '2', label.padEnd(12))} ${value}`,
    );
  console.log();
}
export function summary(results) {
  section(
    'CHECK RESULTS',
    results.map((result) => [
      result.ok ? 'PASS' : 'FAIL',
      `${result.name}${result.ms === undefined ? '' : paint('2', `  ${elapsed(result.ms)}`)}`,
    ]),
  );
  const passed = results.filter((result) => result.ok).length;
  console.log(
    `  ${paint(passed === results.length ? '32;1' : '31;1', `${passed}/${results.length} passed`)}${passed < results.length ? `  ·  ${results.length - passed} failed` : ''}\n`,
  );
}
export function finish(action, ms, ok = true) {
  console.log(
    `\n  ${paint(ok ? '32;1' : '31;1', ok ? 'DONE' : 'FAILED')}  make ${action}  ${paint('2', elapsed(ms))}\n`,
  );
}
export function failure(message) {
  console.error(`\n  ${paint('31;1', 'ERROR')}  ${message}`);
}
