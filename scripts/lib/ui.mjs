const color = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
export function step(message) {
  console.log(color ? `\x1b[36m> ${message}\x1b[0m` : `> ${message}`);
}
export function summary(results) {
  console.log('\nResults');
  for (const result of results) console.log(`  ${result.ok ? '[ok]' : '[FAIL]'} ${result.name}`);
}
