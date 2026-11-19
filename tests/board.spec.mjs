// The board against a mocked incident API (plan.md R1-R6 and the pinned hooks).
// Skipped when BOARD_URL is set: tests/live.spec.mjs covers the live board.
import { test as base, expect } from 'playwright/test';
import { MockApi, incident, installMock, TEST_SESSION } from './mock-api.mjs';

const test = base.extend({
  // board(pages, opts) installs the mock, opens the board and returns the MockApi.
  board: async ({ page }, use) => {
    await use(async (pages, opts = {}) => {
      const api = new MockApi(pages, opts);
      await installMock(page, api);
      api.response = await page.goto('/', { waitUntil: opts.waitUntil || 'load' });
      return api;
    });
  },
});

test.skip(!!process.env.BOARD_URL, 'mocked suite runs only on a local build');

const A = incident('INC-1001', '2026-11-18T03:11:00.000Z');
const B = incident('INC-1002', '2026-11-18T04:20:00.000Z');
const C = incident('INC-1003', '2026-11-18T05:30:00.000Z');
const row = (page, id) => page.locator(`[data-testid="incident-row"][data-id="${id}"]`);
const rowIds = (page) =>
  page.getByTestId('incident-row').evaluateAll((rows) => rows.map((r) => r.dataset.id));

test.describe('hooks', () => {
  test('hooks: board, incident-list, incident-row with data-id, ack per row, build-sha, new-bar', async ({ page, board }) => {
    await board([[A, B]]);
    await expect(page.getByTestId('board')).toHaveCount(1);
    await expect(page.getByTestId('incident-list')).toHaveCount(1);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    expect((await rowIds(page)).sort()).toEqual(['INC-1001', 'INC-1002']);
    for (const id of ['INC-1001', 'INC-1002']) {
      await expect(row(page, id).getByTestId('ack')).toHaveCount(1);
    }
    await expect(page.getByTestId('build-sha')).toHaveCount(1);
    await expect(page.getByTestId('new-bar')).toHaveCount(1);
  });
});

test.describe('R1 the list holds still; an "N new" bar brings new incidents in (product decision)', () => {
  const boxes = (page) =>
    page.getByTestId('incident-row').evaluateAll((rows) => rows.map((r) => [r.dataset.id, Math.round(r.getBoundingClientRect().top)]));

  test('R1 a new incident waits in the new-bar; no row moves, no reload', async ({ page, board }) => {
    await board([[B, A], [C, B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    await expect(page.getByTestId('new-bar')).toBeHidden();
    const before = await boxes(page);
    await page.evaluate(() => (window.__noReload = true));
    await expect(page.getByTestId('new-bar')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('new-bar')).toContainText('1 new');
    expect(await boxes(page)).toEqual(before);
    expect(await page.evaluate(() => window.__noReload)).toBe(true);
  });

  test('R1 clicking the new-bar brings the waiting incidents in at the top, newest first', async ({ page, board }) => {
    await board([[A], [B, A], [C, B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(1);
    await expect(page.getByTestId('new-bar')).toContainText('2 new', { timeout: 7000 });
    await page.getByTestId('new-bar').click();
    expect(await rowIds(page)).toEqual(['INC-1003', 'INC-1002', 'INC-1001']);
    await expect(page.getByTestId('new-bar')).toBeHidden();
  });

  test('R1 rows are merged by id: a partial page loses no row, a full page adds no duplicate', async ({ page, board }) => {
    await board([[B, A], [C], [C, B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    await page.waitForTimeout(4500);
    await expect(page.getByTestId('new-bar')).toContainText('1 new');
    await page.getByTestId('new-bar').click();
    expect(await rowIds(page)).toEqual(['INC-1003', 'INC-1002', 'INC-1001']);
  });

  test('R1 ack-race: a click as a new incident lands acks the row aimed at', async ({ page, board }) => {
    const api = await board([[B, A], [C, B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    const aim = await row(page, 'INC-1001').getByTestId('ack').boundingBox();
    const x = aim.x + aim.width / 2;
    const y = aim.y + aim.height / 2;
    await page.mouse.move(x, y);
    await expect.poll(() => api.requests.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(50);
    await page.mouse.down();
    await page.mouse.up();
    await expect(row(page, 'INC-1001').getByTestId('acked')).toBeVisible();
    expect(api.acks.map((a) => a.id)).toEqual(['INC-1001']);
  });

  test('R1 the acked mark stays on its row when new incidents come in', async ({ page, board }) => {
    await board([[B, A], [C, B, A]]);
    await row(page, 'INC-1001').getByTestId('ack').click();
    await expect(row(page, 'INC-1001').getByTestId('acked')).toBeVisible();
    await expect(page.getByTestId('new-bar')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('new-bar').click();
    expect(await rowIds(page)).toEqual(['INC-1003', 'INC-1002', 'INC-1001']);
    await expect(row(page, 'INC-1001').getByTestId('acked')).toBeVisible();
    await expect(page.getByTestId('acked')).toHaveCount(1);
  });

  test('R1 sorted by openedAt descending whatever order the API sends, id descending on a tie', async ({ page, board }) => {
    const tie = incident('INC-1009', B.openedAt);
    await board([[A, C, B, tie]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(4);
    expect(await rowIds(page)).toEqual(['INC-1003', 'INC-1009', 'INC-1002', 'INC-1001']);
  });

  test('R1 incident text is rendered as text, never as HTML or a class name', async ({ page, board }) => {
    const evil = incident('INC-1066', C.openedAt, {
      summary: '<img src=x onerror="window.__pwned=1">bold',
      severity: 'sev1 injected',
    });
    await board([[evil]]);
    const r = row(page, 'INC-1066');
    await expect(r).toHaveCount(1);
    await expect(r.locator('img')).toHaveCount(0);
    await expect(r).toContainText('<img src=x');
    expect(await r.evaluate((el) => [...el.classList])).not.toContain('injected');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  });
});

test.describe('R2 Ack per row', () => {
  test('R2 Ack calls api.ack for that row, marks it acked, and logs the receipt', async ({ page, board }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    const api = await board([[B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    const cursorBefore = api.lastCursor;
    await row(page, 'INC-1002').getByTestId('ack').click();
    await expect(row(page, 'INC-1002').getByTestId('acked')).toBeVisible();
    await expect(row(page, 'INC-1001').getByTestId('acked')).toHaveCount(0);
    expect(api.acks).toHaveLength(1);
    expect(api.acks[0].id).toBe('INC-1002');
    expect(api.acks[0].t).toBe(TEST_SESSION);
    expect(api.acks[0].cursor).toBe(cursorBefore);
    expect(logs.some((l) => l.startsWith('ack INC-1002') && l.includes('FAKE-RECEIPT-INC-1002'))).toBe(true);
  });

  test('R2 the acked mark stays through refreshes', async ({ page, board }) => {
    const api = await board([[B, A]]);
    await row(page, 'INC-1001').getByTestId('ack').click();
    await expect(row(page, 'INC-1001').getByTestId('acked')).toBeVisible();
    const seen = api.requests.length;
    await page.waitForTimeout(4500);
    expect(api.requests.length).toBeGreaterThanOrEqual(seen + 2);
    await expect(row(page, 'INC-1001').getByTestId('acked')).toBeVisible();
    expect(api.acks).toHaveLength(1);
  });

  test('R2 a double click sends one ack', async ({ page, board }) => {
    const api = await board([[B, A]], { ack: { delay: 800 } });
    await row(page, 'INC-1002').getByTestId('ack').dblclick();
    await expect(row(page, 'INC-1002').getByTestId('acked')).toBeVisible();
    await page.waitForTimeout(500);
    expect(api.acks).toHaveLength(1);
  });

  test('R2 a failed ack does not mark the row and shows an error in it', async ({ page, board }) => {
    await board([[B, A]], { ack: { status: 500 } });
    await row(page, 'INC-1002').getByTestId('ack').click();
    await expect(row(page, 'INC-1002').getByRole('alert')).toBeVisible();
    await expect(row(page, 'INC-1002').getByTestId('acked')).toHaveCount(0);
  });

  test('R2 no row overflows at 1280 px with a local date, time and the Ack button', async ({ page, board }) => {
    const long = incident('INC-1077', C.openedAt, {
      service: 'sched-notifications',
      region: 'ap-southeast-2',
      summary: 'reminder queue backlog over threshold for several tenants',
    });
    await board([[long, B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(3);
    const bad = await page.getByTestId('incident-row').evaluateAll((rows) =>
      rows.flatMap((r) => {
        const box = r.getBoundingClientRect();
        const out = [];
        if (r.scrollWidth > r.clientWidth + 1) out.push(`${r.dataset.id}: scrollWidth ${r.scrollWidth} > ${r.clientWidth}`);
        for (const el of r.querySelectorAll('*')) {
          const b = el.getBoundingClientRect();
          if (b.width && (b.right > box.right + 1 || b.left < box.left - 1)) out.push(`${r.dataset.id}: ${el.tagName} outside`);
        }
        return out;
      }),
    );
    expect(bad).toEqual([]);
    for (const id of ['INC-1077', 'INC-1002', 'INC-1001']) {
      await expect(row(page, id).getByTestId('ack')).toBeInViewport();
    }
  });
});

test.describe('R3 loader and empty state', () => {
  test('R3 the loader is in the first HTML and gone once incidents are on screen', async ({ page, board }) => {
    const api = await board([[B, A]], { hold: (n) => (n === 1 ? 1500 : 0), waitUntil: 'domcontentloaded' });
    expect(await api.response.text()).toContain('data-testid="loader"');
    await expect(page.getByTestId('loader')).toBeVisible();
    await expect(page.getByTestId('incident-row')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByTestId('loader')).toBeHidden();
  });

  test('R3 empty shows only while the list is empty', async ({ page, board }) => {
    await board([[], [], [A]]);
    await expect(page.getByTestId('empty')).toBeVisible();
    await expect(page.getByTestId('loader')).toBeHidden();
    await expect(page.getByTestId('incident-row')).toHaveCount(1, { timeout: 7000 });
    await expect(page.getByTestId('empty')).toBeHidden();
  });

  test('R3 a failed first load shows an error instead of the loader and recovers on the next refresh', async ({ page, board }) => {
    await board([{ status: 503 }, [B, A]]);
    await expect(page.getByTestId('board').getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('loader')).toBeHidden();
    await expect(page.getByTestId('incident-row')).toHaveCount(2, { timeout: 5000 });
    await expect(page.getByTestId('board').getByRole('alert')).toBeHidden();
  });
});

test.describe('R4 refresh every 2 s', () => {
  test('R4 the board asks fetchIncidents every 2 s, sending since=<cursor> after the first call', async ({ page, board }) => {
    const api = await board([[B, A]]);
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    const start = api.requests.length;
    await page.waitForTimeout(4300);
    const more = api.requests.length - start;
    expect(more).toBeGreaterThanOrEqual(2);
    expect(more).toBeLessThanOrEqual(3);
    expect(api.requests[0].since).toBeNull();
    for (const r of api.requests.slice(1)) {
      expect(r.since).toBe(`cursor-${r.n - 1}`);
      expect(r.t).toBe(TEST_SESSION);
    }
  });

  test('R4 no second request while one is in flight', async ({ page, board }) => {
    const api = await board([[B, A]], { hold: (n) => (n === 2 ? 5000 : 0) });
    await expect(page.getByTestId('incident-row')).toHaveCount(2);
    await page.waitForTimeout(6500);
    expect(api.maxInFlight).toBe(1);
    expect(api.requests.length).toBeGreaterThanOrEqual(2);
    const second = api.requests[1].at;
    const third = api.requests[2]?.at;
    if (third) expect(third - second).toBeGreaterThanOrEqual(4900);
  });
});

const T = incident('INC-1100', '2026-11-18T03:11:00.000Z');
for (const [locale, timezoneId, date, time] of [
  ['en-NZ', 'Pacific/Auckland', /\b18\/11\/(20)?26\b/, /\b4:11\b/],
  ['de-DE', 'Europe/Berlin', /\b18\.11\.(20)?26\b/, /\b04:11\b/],
  ['en-US', 'America/New_York', /\b11\/17\/(20)?26\b/, /\b10:11\b/],
]) {
  test.describe(`R5 local time ${locale}`, () => {
    test.use({ locale, timezoneId });
    test(`R5 ${locale} in ${timezoneId} sees its own zone and order; <time datetime> keeps UTC`, async ({ page, board }) => {
      await board([[T]]);
      const t = row(page, 'INC-1100').locator('time');
      await expect(t).toHaveCount(1);
      await expect(t).toHaveAttribute('datetime', '2026-11-18T03:11:00.000Z');
      const text = await t.innerText();
      expect(text).not.toContain('2026-11-18T03:11');
      expect(text).toMatch(date);
      expect(text).toMatch(time);
    });
  });
}

test.describe('R6 build sha', () => {
  test('R6 <meta name=build> and the footer build-sha name the same build', async ({ page, board }) => {
    await board([[A]]);
    const meta = await page.locator('meta[name="build"]').getAttribute('content', { timeout: 2000 }).catch(() => null);
    expect(meta).toBeTruthy();
    await expect(page.locator('footer').getByTestId('build-sha')).toHaveText(meta);
  });

  test('R6 the stamped build names the full git sha (EXPECT_SHA)', async ({ page, board }) => {
    test.skip(!process.env.EXPECT_SHA, 'only on a stamped build (deploy gate)');
    await board([[A]]);
    await expect(page.locator('meta[name="build"]')).toHaveAttribute('content', process.env.EXPECT_SHA);
    expect(process.env.EXPECT_SHA).toMatch(/^[0-9a-f]{40}$/);
    await expect(page.getByTestId('build-sha')).toHaveText(process.env.EXPECT_SHA);
  });
});
