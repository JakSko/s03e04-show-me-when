// A fake incident API for the suite. Fixtures are invented incidents in the shape of the API's replies
// ({ updatedAt, incidents: [{ id, service, region, summary, severity, openedAt }], cursor }); no live data.

export const TEST_API = 'https://api.test/challenges/show-me-when/api';
export const TEST_SESSION = 'test-session';

export function incident(id, openedAt, over = {}) {
  return {
    id,
    service: 'sched-api',
    region: 'eu-west',
    summary: `test incident ${id}`,
    severity: 'sev2',
    openedAt,
    ...over,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * pages: what each /incidents call answers, in order; the last one repeats.
 *   an array of incidents, or { status, body } for an error reply.
 * hold(n): ms to hold the n-th /incidents reply (1-based) before answering.
 * ack: { status, delay } for /ack replies.
 */
export class MockApi {
  constructor(pages, { hold = () => 0, ack = {} } = {}) {
    this.pages = pages;
    this.hold = hold;
    this.ackOpts = { status: 200, delay: 0, ...ack };
    this.requests = []; // { n, t, since, at }
    this.acks = []; // { id, t, cursor, at }
    this.cursors = []; // cursor sent in each successful reply
    this.inFlight = 0;
    this.maxInFlight = 0;
  }

  get lastCursor() {
    return this.cursors.at(-1) ?? null;
  }

  async incidents(route) {
    const url = new URL(route.request().url());
    const n = this.requests.length + 1;
    this.requests.push({ n, t: url.searchParams.get('t'), since: url.searchParams.get('since'), at: Date.now() });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      const wait = this.hold(n);
      if (wait) await sleep(wait);
      const page = this.pages[Math.min(n, this.pages.length) - 1];
      if (!Array.isArray(page)) {
        await route.fulfill({ status: page.status, body: page.body ?? 'test error', headers: cors });
        return;
      }
      const cursor = `cursor-${n}`;
      this.cursors.push(cursor);
      await route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ updatedAt: new Date().toISOString(), incidents: page, cursor }),
      });
    } finally {
      this.inFlight--;
    }
  }

  async ack(route) {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('id');
    this.acks.push({ id, t: url.searchParams.get('t'), cursor: url.searchParams.get('cursor'), at: Date.now() });
    if (this.ackOpts.delay) await sleep(this.ackOpts.delay);
    if (this.ackOpts.status !== 200) {
      await route.fulfill({ status: this.ackOpts.status, body: 'test ack error', headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(fakeAck(id)),
    });
  }
}

export function fakeAck(id) {
  return { id, ackedAt: '2026-01-01T00:00:00.000Z', receipt: `FAKE-RECEIPT-${id}` };
}

const cors = { 'access-control-allow-origin': '*' };

const isAck = (url) => url.pathname.endsWith('/ack');

/** Every test: nothing leaves the machine except what a route below answers. */
export async function installMock(page, api) {
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return route.fallback();
    return route.abort();
  });
  await page.route('**/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export const API = '${TEST_API}';\nexport const SESSION = '${TEST_SESSION}';\n`,
    }),
  );
  await page.route(
    (url) => url.hostname === 'api.test' && url.pathname.endsWith('/incidents'),
    (route) => api.incidents(route),
  );
  await page.route((url) => url.hostname === 'api.test' && isAck(url), (route) => api.ack(route));
}

/** Live smoke: the page's own config and live GETs; every /ack answered here, never sent. */
export async function installLiveAckGuard(page, acks) {
  await page.route(isAck, async (route) => {
    const id = new URL(route.request().url()).searchParams.get('id');
    acks.push(id);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeAck(id)) });
  });
}
