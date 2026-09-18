// Requires local app; verifies rotation/UI synchronization without paid calls.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  await page.route('**/api/records*', (r) => r.fulfill({ json: { records: [] } }));
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.waitForFunction(
    () =>
      document
        .querySelector('.atlas-morphology-status')
        ?.textContent.includes('Representative anatomy'),
    {},
    { timeout: 90000 },
  );
  const rotate = page.getByRole('button', { name: 'Auto-rotate', exact: true });
  const stopped = () =>
    page.waitForFunction(
      () =>
        document.querySelector('[aria-label="Auto-rotate"]').getAttribute('aria-pressed') ===
        'false',
    );
  await rotate.click();
  assert.equal(await rotate.getAttribute('aria-pressed'), 'true');
  const canvas = page.locator('.atlas-canvas canvas');
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4 + 50, bounds.y + bounds.height * 0.4 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await stopped();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  await page.locator('summary').filter({ hasText: 'Depth & motion' }).click();
  assert.equal(
    await page.getByRole('switch', { name: 'Slow orbit' }).getAttribute('aria-checked'),
    'false',
  );
  await page.keyboard.press('Escape');
  await rotate.click();
  assert.equal(await rotate.getAttribute('aria-pressed'), 'true', 'One click restarts rotation');
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4);
  await page.mouse.wheel(0, 100);
  await stopped();
  await rotate.click();
  await page.getByRole('button', { name: 'side view', exact: true }).click();
  await stopped();
  await page.waitForTimeout(1600);
  await rotate.click();
  await page.waitForTimeout(300);
  assert.equal(
    await rotate.getAttribute('aria-pressed'),
    'true',
    'Rotation starts from side view with one click',
  );
  await rotate.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rotate.click();
  await stopped();
  console.log(
    'PASS: drag, zoom, side view and reduced motion clear rotation UI; one-click restart',
  );
} finally {
  await browser.close();
}
