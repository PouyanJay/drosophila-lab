// Optional real-browser chrome regression. Intercept private records; never submit a run.
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/records*', (r) => r.fulfill({ json: { records: [] } }));
  await page.addInitScript(() => {
    if (!localStorage.getItem('drosophila-atlas-theme'))
      localStorage.setItem('drosophila-atlas-theme', 'light');
  });
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.waitForFunction(() => document.documentElement.dataset.workspaceTheme === 'light');
  await page.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  async function contrast(locator, minimum = 4.5) {
    await page.waitForTimeout(250);
    const sample = await locator.first().evaluate((el) => {
      const style = getComputedStyle(el);
      let background = style.backgroundColor;
      let parent = el;
      while (background === 'rgba(0, 0, 0, 0)' && parent.parentElement) {
        parent = parent.parentElement;
        background = getComputedStyle(parent).backgroundColor;
      }
      return {
        color: style.color,
        background,
        label: el.getAttribute('aria-label') || el.className,
      };
    });
    const luminance = (value) => {
      const rgb = value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const a = luminance(sample.color),
      b = luminance(sample.background);
    assert((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= minimum, JSON.stringify(sample));
  }
  async function screenshot(path) {
    // Wait for Radix's entrance animation before recording the actual panel.
    await page.locator('[role=dialog]').evaluateAll((elements) =>
      Promise.all(
        elements
          .flatMap((e) => e.getAnimations())
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {})),
      ),
    );
    await page.screenshot({ path });
  }
  async function close() {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(500);
  await contrast(page.locator('.uw-source-label'));
  await contrast(page.locator('.da-model-trigger'));
  await contrast(page.getByRole('button', { name: 'Explore atlas' }), 3);
  await page.getByRole('button', { name: 'Choose AI model, OpenAI' }).click();
  await contrast(page.locator('.da-model-popover'));
  await contrast(page.locator('.da-offline-option'));
  await screenshot('.validation/workspace-light-model.png');
  await close();
  await page.getByRole('button', { name: 'Choose local compute' }).click();
  await contrast(page.locator('.dc-instant'));
  await screenshot('.validation/workspace-light-compute.png');
  await close();
  await page.getByRole('button', { name: 'Architecture discovery mode', exact: true }).click();
  await contrast(page.locator('.discovery-panel'));
  await contrast(page.locator('.discovery-panel p'));
  await contrast(page.locator('.discovery-panel select'));
  await contrast(page.locator('.discovery-panel .da-primary'));
  await contrast(page.locator('.da-compute-trigger'));
  await screenshot('.validation/workspace-light-discovery.png');
  await page.getByRole('button', { name: 'Saved conversations' }).click();
  await contrast(page.locator('.da-dialog'));
  await close();
  await page.getByRole('button', { name: 'Spending and pricing' }).click();
  await page.locator('.cd-dialog').waitFor();
  await contrast(page.locator('.cd-tile'));
  await contrast(page.locator('.cd-chip'));
  await screenshot('.validation/workspace-light-spending.png');
  await close();
  await page.getByRole('button', { name: 'Display settings' }).click();
  const toggle = page.getByRole('switch', { name: 'Light mode', exact: true });
  assert.equal(await toggle.getAttribute('data-state'), 'checked');
  assert.equal(
    await toggle.evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgb(36, 95, 165)',
  );
  await screenshot('.validation/workspace-light-settings.png');
  await toggle.click();
  assert.equal(await page.locator('html').getAttribute('data-workspace-theme'), 'dark');
  await close();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.workspaceTheme === 'dark');
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.getByRole('switch', { name: 'Light mode', exact: true }).click();
  await close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await contrast(page.locator('.da-model-trigger'));
  await screenshot('.validation/workspace-light-mobile.png');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.getByRole('button', { name: 'Explore atlas' }).click();
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const box = document.querySelector('[role=dialog]')?.getBoundingClientRect();
    return box && box.x >= 0 && box.right <= innerWidth + 1;
  });
  const box = await page.getByRole('dialog').boundingBox();
  assert(box.x >= 0 && box.x + box.width <= 391);
  await screenshot('.validation/workspace-light-mobile-settings.png');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: workspace, portal and discovery contrast; persisted toggle; mobile bounds');
} finally {
  await browser.close();
}
