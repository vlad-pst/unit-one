// Real-browser E2E + a11y. Run on your machine: npm run test:e2e
// (cannot run in the build sandbox — npm registry is blocked there.)
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test.beforeEach(async ({ page }) => {
  await page.goto('/tracker.html');
  // tables are drawn after the intro motion settles
  await expect(page.locator('#h-body tr')).not.toHaveCount(0);
});

test('renders all three tables', async ({ page }) => {
  await expect(page.locator('#se-body tr').first()).toBeVisible();
  await expect(page.locator('#h-body tr').first()).toBeVisible();
  await expect(page.locator('#p-body tr').first()).toBeVisible();
});

test('the Amsterdam wordmark is present in the hero', async ({ page }) => {
  await expect(page.locator('.v2-wordmark')).toHaveText('Amsterdam');
});

test('status selection persists across reload (localStorage oa_h_st)', async ({ page }) => {
  const firstSelect = page.locator('#h-body select.sel').first();
  await firstSelect.selectOption('starred');
  const saved = await page.evaluate(() => localStorage.getItem('oa_h_st'));
  expect(saved).toContain('starred');
  await page.reload();
  await expect(page.locator('#h-body tr')).not.toHaveCount(0);
  const stillSaved = await page.evaluate(() => localStorage.getItem('oa_h_st'));
  expect(stillSaved).toContain('starred');
});

test('the "new" filter narrows the Hausing table', async ({ page }) => {
  const allCount = await page.locator('#h-body tr').count();
  await page.locator('.fb[data-src="h"][data-f="new"]').click();
  const newCount = await page.locator('#h-body tr').count();
  expect(newCount).toBeLessThanOrEqual(allCount);
  await expect(page.locator('.fb[data-src="h"][data-f="new"]')).toHaveClass(/on/);
});

test('clicking the price header re-sorts (arrow activates)', async ({ page }) => {
  await page.locator('#h-price-th').click();
  await expect(page.locator('#h-price-th')).toHaveClass(/sort-/);
});

test('scrolling sinks the wordmark (animation wired)', async ({ page }) => {
  const before = await page.locator('.v2-wordmark').evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  const after = await page.locator('.v2-wordmark').evaluate((el) => getComputedStyle(el).transform);
  expect(after).not.toBe(before);
});

test('no serious or critical accessibility violations', async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  expect(serious, JSON.stringify(serious.map((v) => v.id), null, 2)).toEqual([]);
});
