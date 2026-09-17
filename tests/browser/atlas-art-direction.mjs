// Optional app + real-GPU check. No paid calls; record reads are intercepted.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync('.validation', { recursive: true });
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/records*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"records":[]}' }),
  );
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.waitForFunction(
    () =>
      document
        .querySelector('.atlas-morphology-status')
        ?.textContent.includes('Representative anatomy'),
    {},
    { timeout: 90000 },
  );
  await page.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  async function select(label) {
    await page.getByRole('button', { name: 'Explore atlas' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await select('MN6 · 519667');
  await page.waitForFunction(() =>
    document
      .querySelector('.atlas-morphology-status')
      ?.textContent.includes('Source membrane · LOD 2'),
  );
  await page.getByRole('button', { name: 'Show context', exact: true }).waitFor();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: '.validation/atlas-art-membrane.png' });
  const canvas = page.locator('.atlas-canvas canvas');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: 'side view', exact: true }).click();
  await page.waitForTimeout(350);
  const middle = await canvas.screenshot();
  await page.waitForTimeout(1100);
  const after = await canvas.screenshot();
  assert(!before.equals(middle) && !middle.equals(after), 'View should animate over time');
  await page.screenshot({ path: '.validation/atlas-art-side.png' });
  await page.getByRole('button', { name: 'Reset view' }).click();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('.da-inspect').count(), 0);
  assert(!after.equals(await canvas.screenshot()), 'Reset must leave the close-up');
  await page.screenshot({ path: '.validation/atlas-art-overview.png' });
  await page.route('**/membranes-v1/10001-*.bin.gz', (route) =>
    route.fulfill({ status: 200, body: 'corrupt' }),
  );
  await select('DNp01 · 10001');
  await page.waitForFunction(() =>
    document
      .querySelector('.atlas-morphology-status')
      ?.textContent.includes('Membrane unavailable'),
  );
  assert((await page.locator('.da-inspect').innerText()).includes('10001'));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await select('Dm3b · 935186');
  await page.waitForFunction(() =>
    document
      .querySelector('.atlas-morphology-status')
      ?.textContent.includes('Source membrane · LOD 2'),
  );
  assert((await page.locator('.da-inspect').innerText()).includes('935186'));
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: authentic surface close-ups, auto-isolation, animated view change/reset, corruption fallback, subsequent selection and reduced-motion rendering',
  );
} finally {
  await browser.close();
}
