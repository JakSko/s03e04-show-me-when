// Smoke run against the deployed board: BOARD_URL=<https url> EXPECT_SHA=<sha> npx playwright test tests/live.spec.mjs
// Live GETs only. Every /ack is answered here and never reaches the API.
import { test, expect } from 'playwright/test';
import { installLiveAckGuard } from './mock-api.mjs';

test.skip(!process.env.BOARD_URL, 'live smoke runs only with BOARD_URL');

test('live: loader, list, local times, build sha; Ack answered locally', async ({ page }) => {
  const acks = [];
  await installLiveAckGuard(page, acks);
  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  expect(page.url()).toMatch(/^https:\/\//);
  expect(await res.text()).toContain('data-testid="loader"');
  await expect(page.getByTestId('incident-row').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('loader')).toBeHidden();
  const time = page.getByTestId('incident-row').first().locator('time');
  expect(await time.getAttribute('datetime')).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/);
  expect(await time.innerText()).not.toMatch(/T\d\d:\d\d/);
  if (process.env.EXPECT_SHA) {
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', process.env.EXPECT_SHA);
    await expect(page.getByTestId('build-sha')).toHaveText(process.env.EXPECT_SHA);
  }
  const first = page.getByTestId('incident-row').first();
  const id = await first.getAttribute('data-id');
  await first.getByTestId('ack').click();
  await expect(first.getByTestId('acked')).toBeVisible();
  expect(acks).toEqual([id]);
});
