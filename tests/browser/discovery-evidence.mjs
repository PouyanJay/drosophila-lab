// Synthetic UI fixtures only; no paid calls, training or record writes.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
mkdirSync('.validation', { recursive: true });
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-gpu'] : [],
});
try {
  const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const atlasMap = JSON.parse(readFileSync('public/research/atlas-variants.json', 'utf8'));
  const sourceIds = Object.keys(atlasMap.positions).slice(0, 6);
  const candidates = Array.from({ length: 5 }, (_, i) => ({
    id: 'candidate-' + i,
    parent: i ? 'candidate-0' : 'original',
    pilot: 0.21 + i * 0.01,
    promoted: i % 2 === 0,
    ...(i % 2 === 0
      ? {
          validationAccuracy: 0.24 + i * 0.005,
          topology: {
            neurons: 165122 + i,
            edges: 6235682 + i * 40,
            ancestors: sourceIds.slice(0, i + 1),
            edits: [
              { kind: 'rewired-edge' },
              ...sourceIds.slice(0, i + 1).map((sourceBody, index) => ({
                kind: 'added-neuron',
                sourceBody,
                index: 165122 + index,
                operator: 'recurrent-loop',
              })),
            ],
          },
        }
      : {}),
  }));
  const progress = {
    candidate: 'candidate-4',
    seed: 43,
    phase: 'full',
    candidates,
    best: candidates[4],
    trainingCurve: Array.from({ length: 16 }, (_, i) => ({
      step: i + 1,
      trainLoss: 1.5 + Math.sin(i) * 0.1,
      validationLoss: 1.4 + Math.cos(i * 0.6) * 0.04,
    })),
  };
  const confirmation = {
    delta: 0.03,
    slowdown: 1.2,
    interval: [-0.02, 0.08],
    scenarios: [{ delay: 2, noise: 0.1 }],
    runs: [{ original: { scenarios: [0.5] }, candidate: { scenarios: [0.53] } }],
    caveat: 'Small-seed exploratory evidence; not a biological or universal intelligence claim.',
  };
  const base = { config: { task: 'cue-memory' }, created: 1700000000, progress };
  const result = {
    improved: false,
    outcome: 'no_improvement',
    candidates,
    best: candidates[4],
    confirmation,
    variantId: 'fixture-variant',
  };
  const jobs = [
    { ...base, id: 'unconfirmed', status: 'completed', result },
    {
      ...base,
      id: 'confirmed',
      status: 'completed',
      result: {
        ...result,
        improved: true,
        confirmation: { ...confirmation, interval: [0.01, 0.05] },
      },
    },
    { ...base, id: 'running', status: 'running' },
    {
      ...base,
      id: 'failed',
      status: 'failed',
      progress: undefined,
      error: 'Fixture trainer unavailable',
    },
  ];
  await page.route('**/api/records*', (r) => r.fulfill({ json: { records: [] } }));
  await page.route('**/api/discovery/campaigns**', (r) => {
    assert.equal(r.request().method(), 'GET');
    const pathname = new URL(r.request().url()).pathname;
    if (pathname.endsWith('/curves')) {
      const candidateId = pathname.split('/').at(-2);
      const index = Number(candidateId.split('-')[1]);
      return r.fulfill({
        json: {
          candidateId,
          topology: {
            neurons: 165123,
            edges: 6235682,
            ancestors: [sourceIds[0]],
            edits: [
              {
                kind: 'added-neuron',
                sourceBody: sourceIds[0],
                index: 165122,
                operator: 'recurrent-loop',
              },
            ],
          },
          runs: [
            {
              phase: 'pilot',
              seed: 42,
              complete: true,
              curve: [
                { step: 1, trainLoss: 1 + index * 0.1, validationLoss: 1.2 },
                { step: 2, trainLoss: 0.9, validationLoss: 1.1 },
              ],
            },
            { phase: 'full', seed: 43, complete: true, curve: progress.trainingCurve },
          ],
        },
      });
    }
    const id = new URL(r.request().url()).pathname.split('/').at(-1);
    return r.fulfill({ json: id === 'campaigns' ? { jobs } : jobs.find((j) => j.id === id) });
  });
  await page.goto(process.env.ATLAS_TEST_URL || 'http://localhost:3000');
  await page.addStyleTag({ content: 'nextjs-portal{visibility:hidden}' });
  await page.getByRole('button', { name: 'Architecture discovery mode', exact: true }).click();
  await page.locator('.discovery-history summary').click();
  async function select(index, heading) {
    await page.locator('.discovery-history-list button').nth(index).click();
    await page.waitForFunction(
      (text) => document.querySelector('.de-evidence-outcome h3')?.textContent === text,
      heading,
    );
  }
  await select(0, 'No confirmed improvement');
  await page.getByRole('button', { name: 'View evidence' }).click();
  const evidence = page.getByRole('region', { name: 'Discovery evidence' });
  assert.equal(await evidence.getByText('Confirmed gain', { exact: true }).count(), 0);
  assert(await evidence.getByText('Held-out gain', { exact: true }).isVisible());
  const columns = await evidence
    .locator('.de-evidence-panel')
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().y));
  assert(Math.abs(columns[0] - columns[1]) < 2, 'Wide evidence uses side-by-side panels');
  assert(await evidence.getByRole('columnheader', { name: 'Pilot', exact: true }).isVisible());
  assert(await evidence.getByRole('columnheader', { name: 'Validation', exact: true }).isVisible());
  assert.equal(
    await evidence.locator('tr').filter({ hasText: 'candidate-1' }).locator('button').count(),
    0,
    'Unavailable geometry does not dim the entire result row',
  );
  await evidence.getByRole('row', { name: 'Select candidate-0', exact: true }).click();
  assert.equal(await evidence.locator('tr[data-selected="true"]').count(), 1);
  await evidence.getByRole('combobox', { name: 'Training phase and seed' }).click();
  await page.getByRole('option', { name: 'Pilot · seed 42', exact: true }).click();
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert(await evidence.getByRole('img', { name: /Training and validation loss/ }).isVisible());
  const inspection = page.getByRole('complementary', { name: 'Candidate inspection' });
  await page.waitForFunction(() =>
    document
      .querySelector('.atlas-candidate-inspection')
      ?.textContent.includes('1 of 1 source locations'),
  );
  assert(await inspection.getByText('candidate-0', { exact: true }).isVisible());
  const marker = page.getByRole('button', {
    name: `Source 1, body ${sourceIds[0]}, 1 copy`,
    exact: true,
  });
  await marker.click();
  assert.equal(await marker.getAttribute('aria-pressed'), 'true');
  assert(await inspection.getByRole('region', { name: 'Source modifications' }).isVisible());
  await inspection.locator('summary').filter({ hasText: 'Recorded edits' }).click();
  assert(await inspection.getByText('Node 165122', { exact: true }).isVisible());
  const diagram = page.getByRole('region', { name: `Change at source ${sourceIds[0]}` });
  await diagram.waitFor({ state: 'visible' });
  await diagram.getByRole('button', { name: 'Before', exact: true }).click();
  assert.equal(await diagram.getAttribute('data-after'), 'false');
  await diagram.getByRole('button', { name: 'After · +1', exact: true }).click();
  assert.equal(await diagram.getAttribute('data-after'), 'true');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '.validation/source-change-diagram.png' });
  assert(
    await inspection
      .getByText('Inherited wiring + recurrent self-loop', { exact: true })
      .isVisible(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.atlas-candidate-inspection .atlas-change-diagram').count(), 1);
  const calloutBounds = await inspection.boundingBox();
  const atlasBounds = await page.locator('.atlas-canvas').boundingBox();
  assert(calloutBounds.y + calloutBounds.height <= atlasBounds.y + atlasBounds.height);
  assert(calloutBounds.x + calloutBounds.width <= atlasBounds.x + atlasBounds.width);
  await page.screenshot({ path: '.validation/source-change-diagram-mobile.png' });
  await page.setViewportSize({ width: 1720, height: 1080 });
  await diagram.getByRole('button', { name: 'Close change diagram' }).click();
  assert.equal(await diagram.count(), 0);

  await evidence.getByRole('button', { name: 'Inspect candidate-4', exact: true }).click();
  assert.equal(
    await evidence.locator('tr[data-selected="true"]').getAttribute('aria-label'),
    'Select candidate-4',
  );
  assert(await evidence.getByRole('img', { name: /Training and validation loss/ }).isVisible());
  await inspection.getByRole('combobox', { name: 'Inspect a source neuron' }).click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: '.validation/source-picker-dark.png' });
  await page.getByRole('option').nth(1).click();
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  assert(await inspection.getByRole('region', { name: 'Source modifications' }).isVisible());
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await inspection.getByRole('combobox', { name: 'Inspect a source neuron' }).click();
  await page.getByRole('listbox').waitFor({ state: 'visible' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: '.validation/source-picker-light.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await evidence.getByRole('row', { name: 'Select candidate-1', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('.atlas-candidate-inspection')
      ?.textContent.includes('1 of 1 source locations'),
  );
  assert.equal(await inspection.getByText('No topology recorded for this candidate.').count(), 0);
  const firstRow = evidence.getByRole('row', { name: 'Select candidate-0', exact: true });
  await firstRow.focus();
  await page.keyboard.press('Enter');
  assert(await inspection.getByText('candidate-0', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Anatomical structures', exact: true }).click();
  await page
    .locator('.da-structure-list')
    .getByRole('button', { name: 'GNG', exact: true })
    .click();
  if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape');
  const assertStack = async () => {
    const boxes = await page.locator('.atlas-inspection-stack > *').evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width };
      }),
    );
    assert.equal(boxes.length, 2);
    assert(boxes[1].top >= boxes[0].bottom + 9, 'Inspection cards must never overlap');
    assert.equal(boxes[0].left, boxes[1].left);
    assert.equal(boxes[0].width, boxes[1].width);
    const stack = await page.locator('.atlas-inspection-stack').boundingBox();
    assert(
      boxes[1].bottom <= stack.y + stack.height + 1,
      'Bottom card frame stays inside the available height',
    );
  };
  await assertStack();
  await inspection.locator('summary').click();
  await assertStack();
  await inspection.locator('summary').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '.validation/candidate-inspection.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Atlas', exact: true }).click();
  await assertStack();
  await page.screenshot({ path: '.validation/candidate-inspection-mobile.png' });
  await page.setViewportSize({ width: 1720, height: 1080 });
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await inspection.getByRole('button', { name: 'Exit inspection' }).click();
  assert.equal(await inspection.count(), 0);
  await page.waitForTimeout(500);
  await page.screenshot({ path: '.validation/evidence-redesign-dark.png' });
  await evidence.locator('summary').filter({ hasText: 'Confirmation details' }).click();
  assert(await evidence.getByText('Paired seed interval: -2.0 to 8.0 pp.').isVisible());
  assert(await evidence.getByText('53.0%', { exact: true }).isVisible());
  await evidence.locator('summary').filter({ hasText: 'Confirmation details' }).click();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.screenshot({ path: '.validation/evidence-redesign-light.png' });
  await select(1, 'Improvement confirmed');
  await select(2, 'Discovery in progress');
  assert(await evidence.getByText('Inspect current best', { exact: false }).isVisible());
  await select(3, 'Discovery failed');
  assert(await evidence.getByRole('alert').isVisible());
  assert(await evidence.getByText('No training curve recorded').isVisible());
  await select(0, 'No confirmed improvement');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert(await evidence.evaluate((e) => e.scrollWidth <= e.clientWidth));
  await page.locator('.uw-evidence-drawer').evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: '.validation/evidence-redesign-mobile.png' });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(
    'PASS: outcome semantics, separate search metrics, confirmation, empty/error/live states, themes and responsive layout',
  );
} finally {
  await browser.close();
}
