// Requires a running local app; intercepts records and makes no paid calls.
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync('.validation', { recursive: true });
import assert from 'node:assert/strict';
(async () => {
  const browser = await chromium.launch({
    args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/api/records*', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"records":[]}' }),
  );
  await p.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await p.waitForFunction(
    () =>
      document
        .querySelector('.atlas-morphology-status')
        ?.textContent.includes('Representative anatomy'),
    {},
    { timeout: 90000 },
  );
  await p.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  await p.screenshot({ path: '.validation/atlas-exploration-desktop.png' });
  // Click actual geometry before ever opening search.
  const canvas = await p.locator('.atlas-canvas canvas').boundingBox();
  for (const [x, y] of [
    [0.5, 0.5],
    [0.55, 0.55],
    [0.4, 0.5],
    [0.6, 0.6],
  ]) {
    await p.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y);
    await p.waitForTimeout(900);
    if (await p.locator('.da-inspect').count()) break;
  }
  assert(await p.locator('.da-inspect').count(), 'Fresh-page geometry click should select');
  await p.getByRole('button', { name: 'Same type · sample', exact: true }).click();
  assert.equal(
    await p.getByRole('button', { name: 'Show all types' }).getAttribute('aria-pressed'),
    'true',
  );
  await p.getByRole('button', { name: 'Show all types' }).click();
  await p.getByRole('button', { name: 'Isolate neuron', exact: true }).click();
  await p.screenshot({ path: '.validation/atlas-exploration-isolated.png' });
  await p.getByRole('button', { name: 'Explore atlas' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Brain', exact: true }).click();
  await p.keyboard.press('Escape');
  assert.equal(await p.locator('.da-inspect').count(), 0, 'Preset must clear the inspector');
  await p.getByRole('button', { name: 'Reset view' }).click();
  await p.getByRole('button', { name: 'Explore atlas' }).click();
  const d = p.getByRole('dialog');
  await d.getByRole('button', { name: 'Individual cell', exact: true }).click();
  assert.equal(
    await d
      .getByRole('button', { name: 'Individual cell', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await d.getByRole('button', { name: 'Cell class', exact: true }).click();
  await d.getByLabel('Central brain', { exact: true }).uncheck();
  await d.getByRole('button', { name: 'Show all classes' }).click();
  await d.evaluate((el) => (el.scrollTop = 0));
  await p.screenshot({ path: '.validation/atlas-exploration-controls.png' });
  await d.getByRole('button', { name: 'Nerve cord', exact: true }).click();
  await p.keyboard.press('Escape');
  await d.waitFor({ state: 'hidden' });
  await p.screenshot({ path: '.validation/atlas-exploration-cord.png' });
  await p.getByRole('button', { name: 'Explore atlas' }).click();
  await d
    .locator('label')
    .filter({ hasText: 'Whole central nervous system' })
    .getByRole('switch')
    .click();
  let downloads = 0;
  p.on('download', () => downloads++);
  const download = p.waitForEvent('download');
  await d.getByRole('button', { name: 'Save atlas image' }).click();
  await (await download).saveAs('.validation/atlas-export.png');
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: 'Reset view' }).click();
  await p.waitForTimeout(400);
  assert.equal(downloads, 1, 'Reset must not export');
  await p.setViewportSize({ width: 390, height: 844 });
  const tab = p.getByRole('button', { name: 'Atlas', exact: true });
  if (await tab.count()) await tab.click();
  await p.getByRole('button', { name: 'Explore atlas' }).click();
  await d.getByRole('button', { name: 'Neck pathways', exact: true }).scrollIntoViewIfNeeded();
  await d.getByRole('button', { name: 'Neck pathways', exact: true }).click();
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: '.validation/atlas-exploration-mobile.png' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: fresh geometry selection, isolation, modes, class filters, named views, export/reset, mobile controls; no page errors',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
