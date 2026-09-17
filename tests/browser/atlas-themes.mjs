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
  const canvas = page.locator('.atlas-canvas canvas');
  await page.screenshot({ path: '.validation/atlas-theme-dark.png' });
  const isolated = await canvas.screenshot();
  await page.getByRole('button', { name: 'Show context', exact: true }).click();
  await page.waitForTimeout(200);
  assert(
    !isolated.equals(await canvas.screenshot()),
    'Show context must restore surrounding neurons',
  );
  await page.getByRole('button', { name: 'Isolate neuron', exact: true }).click();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  assert.equal(
    await page
      .getByRole('slider', { name: 'Selected neuron context' })
      .evaluate((element) => element.closest('[data-slot=slider]').hasAttribute('data-disabled')),
    true,
  );
  await page.getByRole('switch', { name: 'Light mode', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.validation/atlas-theme-light.png' });
  assert.equal(await page.locator('.uw-atlas').getAttribute('data-atlas-theme'), 'light');
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save atlas image' }).click();
  await (await download).saveAs('.validation/atlas-light-export.png');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(
    () => document.querySelector('.uw-atlas')?.getAttribute('data-atlas-theme') === 'light',
  );
  await page.getByRole('button', { name: 'Reset view' }).click();
  assert.equal(await page.locator('.uw-atlas').getAttribute('data-atlas-theme'), 'light');
  await page.setViewportSize({ width: 390, height: 844 });
  const atlasTab = page.getByRole('button', { name: 'Atlas', exact: true });
  if (await atlasTab.count()) await atlasTab.click();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  await page.getByRole('switch', { name: 'Light mode', exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.waitForTimeout(400);
  const drawer = await page.getByRole('dialog').boundingBox();
  assert(drawer.x >= 0 && drawer.x + drawer.width <= 391, 'Mobile settings must fit the viewport');
  await page.screenshot({ path: '.validation/atlas-theme-mobile.png' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: dark/light close-up, theme toggle, reload persistence and reset preservation');
} finally {
  await browser.close();
}
