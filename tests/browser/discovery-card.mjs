// UI fixture: saved-run reads mocked, no messages or campaigns submitted.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync('.validation', { recursive: true });
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const jobs = [
    {
      id: 'fixture-complete',
      config: { task: 'cue-memory' },
      status: 'completed',
      result: {
        outcome: 'budget_exhausted',
        improved: false,
        candidates: Array.from({ length: 20 }, (_, i) => ({
          id: 'candidate-' + i,
          parent: 'source',
          pilot: 0.5,
          promoted: false,
        })),
        best: { id: 'candidate-1' },
        variantId: 'fixture-variant',
      },
      created: 1700000000,
      progress: { elapsed: 600, budgetSeconds: 600, phase: 'full' },
    },
    {
      id: 'fixture-running',
      config: { task: 'sequence-recall' },
      status: 'running',
      created: 1700000300,
      progress: { elapsed: 30, budgetSeconds: 600, phase: 'pilot', candidate: 'candidate-1' },
    },
  ];
  let writes = 0;
  await page.route('**/api/records*', (r) => r.fulfill({ json: { records: [] } }));
  await page.route('**/api/discovery/campaigns**', (r) => {
    if (r.request().method() !== 'GET') {
      writes++;
      return r.fulfill({ status: 403, json: { error: 'Test forbids writes' } });
    }
    const id = new URL(r.request().url()).pathname.split('/').at(-1);
    return r.fulfill({ json: id === 'campaigns' ? { jobs } : jobs.find((j) => j.id === id) });
  });
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  await page.getByRole('button', { name: 'Architecture discovery mode', exact: true }).click();
  const card = page.locator('.discovery-panel');
  assert.equal(await card.locator('select').count(), 0);
  assert.equal(await page.locator('.da-suggestions button').count(), 3);
  await page.getByRole('button', { name: 'Discover sequence recall', exact: true }).click();
  assert.match(await page.locator('.discovery-task h3').textContent(), /sequence/i);
  assert.equal(
    await page
      .getByRole('button', { name: 'Discover sequence recall', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await card.locator('summary').filter({ hasText: 'Saved discoveries' }).click();
  await card.locator('.discovery-history-list button').first().click();
  await page.waitForFunction(() =>
    document.querySelector('.discovery-run-status')?.textContent.includes('completed'),
  );
  assert.equal(await card.locator('progress').count(), 0);
  await card.getByRole('button', { name: 'View evidence' }).click();
  const exportLink = page.getByRole('link', { name: 'Export experimental variant bundle' });
  assert.equal(await exportLink.textContent(), 'Export');
  assert.equal(
    await exportLink.getAttribute('href'),
    '/api/discovery/campaigns/fixture-complete/artifacts/variant-bundle.zip',
  );
  assert.equal(await page.locator('.discovery-evidence .da-primary').count(), 0);
  const top = await exportLink.boundingBox();
  await page
    .locator('.uw-evidence-body:not([hidden])')
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForTimeout(300);
  const after = await exportLink.boundingBox();
  assert(Math.abs(top.y - after.y) < 2, 'Export stays in sticky evidence header');
  await page.screenshot({ path: '.validation/evidence-export-header.png' });
  await page.getByRole('button', { name: 'Close evidence' }).click();

  await card.locator('.discovery-history-list button').nth(1).click();
  await page.waitForFunction(() =>
    document.querySelector('.discovery-run-status')?.textContent.includes('running'),
  );
  assert.equal(await card.getByRole('progressbar', { name: 'Discovery time budget' }).count(), 1);
  await card.locator('.discovery-history-list button').first().click();
  await card.locator('summary').filter({ hasText: 'Saved discoveries' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.validation/discovery-compact-dark.png' });
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.screenshot({ path: '.validation/discovery-compact-light.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await card.locator('summary').filter({ hasText: 'Saved discoveries' }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await card.evaluate((e) => e.scrollWidth <= e.clientWidth));
  await page.screenshot({ path: '.validation/discovery-compact-mobile.png' });
  assert.equal(writes, 0);
  console.log(
    'PASS: sole task choices, selected task, inline history, completed/running states, mobile bounds',
  );
} finally {
  await browser.close();
}
