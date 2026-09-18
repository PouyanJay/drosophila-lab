// Requires the local app. No submissions, paid calls or saved-record mutations.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync('.validation', { recursive: true });
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  page.setDefaultTimeout(15000);
  await page.route('**/api/records*', (r) => r.fulfill({ json: { records: [] } }));
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.locator('.da-composer').waitFor();
  await page.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  assert.equal(
    await page.getByRole('button', { name: 'Display settings', exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole('link', { name: 'GitHub repository (opens in a new tab)' })
      .getAttribute('href'),
    'https://github.com/PouyanJay/drosophila-lab',
  );

  const fullSystem = page.getByRole('button', { name: 'Full system', exact: true });
  await fullSystem.click();
  assert.equal(await fullSystem.getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Auto-rotate', exact: true }).click();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  await page.locator('summary').filter({ hasText: 'Layers & geometry' }).click();
  assert.equal(
    await page
      .getByRole('switch', { name: 'Whole central nervous system' })
      .getAttribute('aria-checked'),
    'true',
  );
  await page.locator('summary').filter({ hasText: 'Depth & motion' }).click();
  assert.equal(
    await page.getByRole('switch', { name: 'Slow orbit' }).getAttribute('aria-checked'),
    'true',
  );
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Auto-rotate', exact: true }).click();
  await fullSystem.click();
  assert.equal(await fullSystem.getAttribute('aria-pressed'), 'false');
  const input = page.getByRole('textbox', {
    name: 'Tell the research guide what you want to test',
  });
  assert.equal(
    await input.getAttribute('placeholder'),
    'Describe how you’d like this brain to improve…',
  );
  async function resize(x) {
    const bar = await page
      .getByRole('separator', { name: 'Resize conversation panel' })
      .boundingBox();
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, bar.y + bar.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  await resize(650);
  assert(
    await page.locator('.da-model-trigger > span').isVisible(),
    'Wide composer shows model name',
  );
  await resize(335);
  assert(
    !(await page.locator('.da-model-trigger > span').isVisible()),
    'Narrow sidebar uses icons despite wide browser',
  );
  assert(!(await page.locator('.da-compute-trigger > span').isVisible()));
  assert(await page.locator('.da-composer').evaluate((e) => e.scrollWidth <= e.clientWidth));

  await page.getByRole('button', { name: 'Architecture discovery mode', exact: true }).click();
  const suggestions = page.locator('.da-suggestions button');
  assert.equal(await suggestions.count(), 3);
  const pills = await suggestions.evaluateAll((elements) =>
    elements.map((e) => {
      const r = e.getBoundingClientRect(),
        parent = e.parentElement.getBoundingClientRect();
      const label = e.querySelector('span');
      return {
        top: r.top,
        left: r.left,
        right: r.right,
        parentLeft: parent.left,
        parentRight: parent.right,
        title: e.title,
        text: label.textContent,
        ellipsis: getComputedStyle(label).textOverflow,
      };
    }),
  );
  assert(
    pills.every(
      (p) =>
        p.left >= p.parentLeft &&
        p.right <= p.parentRight + 1 &&
        Math.abs(p.top - pills[0].top) < 1 &&
        p.title === p.text &&
        p.ellipsis === 'ellipsis',
    ),
  );
  await page.screenshot({ path: '.validation/suggestions-narrow.png' });
  await page.getByRole('button', { name: 'Architecture discovery mode', exact: true }).click();
  await page.getByRole('button', { name: 'Choose AI model, OpenAI' }).click();
  await page.locator('.da-model-popover').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  const dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByRole('switch', { name: 'Light mode' }).count(), 0);
  await dialog.locator('summary').filter({ hasText: 'Cell classes' }).click();
  await dialog.getByLabel('Central brain', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Show all classes' }).click();
  assert(await dialog.getByLabel('Central brain', { exact: true }).isChecked());
  await dialog.locator('summary').filter({ hasText: 'Cell classes' }).click();
  await dialog.locator('summary').filter({ hasText: 'Depth & motion' }).click();
  await dialog.getByRole('switch', { name: 'Compartment outlines' }).click();
  assert.equal(
    await dialog.getByRole('switch', { name: 'Compartment outlines' }).getAttribute('aria-checked'),
    'true',
  );
  await dialog.locator('summary').filter({ hasText: 'Depth & motion' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.validation/compact-display-dark.png' });
  await dialog.locator('summary').filter({ hasText: 'Layers & geometry' }).click();
  const thickness = dialog.getByRole('slider', { name: 'Branch thickness' });
  await thickness.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await thickness.getAttribute('aria-valuenow'), '1.1');
  for (const name of ['Surface opacity', 'Cutaway']) {
    const slider = dialog.getByRole('slider', { name });
    await slider.focus();
    await page.keyboard.press('Home');
    assert.equal(await slider.getAttribute('aria-valuenow'), '0');
    await page.keyboard.press('ArrowRight');
    assert.equal(await slider.getAttribute('aria-valuenow'), '1');
  }
  const rows = await dialog.locator('.atlas-slider-control').evaluateAll((elements) =>
    elements.map((e) => {
      const label = e.querySelector('label').getBoundingClientRect();
      const slider = e.querySelector('[data-slot=slider]').getBoundingClientRect();
      return { gap: slider.top - label.bottom, height: slider.height };
    }),
  );
  assert(rows.every((row) => row.gap >= 2 && row.height >= 32));
  await page.screenshot({ path: '.validation/compact-sliders-dark.png' });
  await dialog.locator('summary').filter({ hasText: 'Layers & geometry' }).click();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.validation/compact-display-light.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.validation/compact-workspace.png' });
  const status = await page.locator('.atlas-morphology-status').boundingBox();
  const footer = await page.locator('.da-atlas-caption').boundingBox();
  assert(
    status.y >= footer.y && status.y + status.height <= footer.y + footer.height + 1,
    'Sample count stays inside the source footer',
  );
  assert.equal(await page.locator('.atlas-morphology-status').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  assert(!(await page.locator('.da-model-trigger > span').isVisible()));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: '.validation/compact-composer-mobile.png' });
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.screenshot({ path: '.validation/atlas-footer-mobile.png' });
  const mobileFooter = await page.locator('.da-atlas-caption').boundingBox();
  assert(mobileFooter.x >= 0 && mobileFooter.x + mobileFooter.width <= 390);
  assert(await page.getByRole('button', { name: 'Source & method' }).isVisible());
  console.log(
    'PASS: responsive sidebar, icon menus, toolbar, compact settings, filters and alignment',
  );
} finally {
  await browser.close();
}
