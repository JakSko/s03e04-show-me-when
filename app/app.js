import { fetchIncidents, ack } from './api.js';

const board = document.querySelector('[data-testid="board"]');
const list = board.querySelector('[data-testid="incident-list"]');
const loader = board.querySelector('[data-testid="loader"]');
const empty = board.querySelector('[data-testid="empty"]');
const boardError = board.querySelector('.board-error');

const SEVERITIES = new Set(['sev1', 'sev2', 'sev3', 'sev4']);

const incidents = new Map(); // id -> incident, merged across every page
const rows = new Map(); // id -> <li>, kept so a row is updated in place, not rebuilt
const acked = new Map(); // id -> ack reply; the API has no acked state, so this lives only in this page
const acking = new Set(); // ids with an ack in flight
const ackErrors = new Map(); // id -> message of the last failed ack
let loaded = false;
let loadError = null;

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function newestFirst(a, b) {
  const t = Date.parse(b.openedAt) - Date.parse(a.openedAt);
  if (t) return t;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

// The viewer's own locale and time zone (undefined = the browser's, not the page's lang):
// en-NZ 18/11/2026, 4:11 pm · de-DE 18.11.26, 04:11 · en-US 11/17/26, 10:11 PM.
const localTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });

function timeText(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? iso : localTime.format(ms);
}

function renderRow(i) {
  let li = rows.get(i.id);
  if (!li) {
    li = el('li', { 'data-testid': 'incident-row' });
    li.dataset.id = i.id;
    li.append(
      el('span', { class: 'id' }),
      el('span', { class: 'sev' }),
      el('span', { class: 'what' }),
      el('time'),
      el('span', { class: 'act' }),
      el('span', { class: 'row-error', role: 'alert', hidden: '' }),
    );
    rows.set(i.id, li);
  }
  li.className = `row ${SEVERITIES.has(i.severity) ? i.severity : 'sev-other'}`;
  const [id, sev, what, time, act, err] = li.children;
  id.textContent = i.id;
  sev.textContent = i.severity;
  what.textContent = `${i.service} · ${i.region} · ${i.summary}`;
  time.dateTime = i.openedAt;
  time.textContent = timeText(i.openedAt);

  const reply = acked.get(i.id);
  const state = reply ? 'acked' : acking.has(i.id) ? 'acking' : 'open';
  if (act.dataset.state !== state) {
    act.dataset.state = state;
    if (reply) {
      act.replaceChildren(el('span', { 'data-testid': 'acked', class: 'acked' }, '✓ acked'));
    } else {
      const button = el('button', { type: 'button', 'data-testid': 'ack' }, state === 'acking' ? 'Acking…' : 'Ack');
      button.disabled = state === 'acking';
      act.replaceChildren(button);
    }
  }
  const message = ackErrors.get(i.id);
  err.hidden = !message;
  err.textContent = message ? `Ack failed: ${message}` : '';
  return li;
}

function render() {
  loader.hidden = loaded || loadError !== null;
  boardError.hidden = loadError === null;
  boardError.textContent = loadError ? `Could not load incidents (${loadError}). Retrying…` : '';
  empty.hidden = !loaded || incidents.size > 0;
  const ordered = [...incidents.values()].sort(newestFirst).map(renderRow);
  ordered.forEach((li, n) => {
    if (list.children[n] !== li) list.insertBefore(li, list.children[n] ?? null);
  });
}

async function onAck(id) {
  if (!loaded || acking.has(id) || acked.has(id)) return;
  acking.add(id);
  ackErrors.delete(id);
  render();
  try {
    acked.set(id, await ack(id));
  } catch (err) {
    ackErrors.set(id, err.message);
  } finally {
    acking.delete(id);
    render();
  }
}

list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-testid="ack"]');
  if (!button || button.disabled) return;
  button.disabled = true; // a second click before the next render sends nothing
  onAck(button.closest('[data-testid="incident-row"]').dataset.id);
});

const REFRESH_MS = 2000;
let inFlight = false;

async function load() {
  if (inFlight) return; // never a second request while one is open
  inFlight = true;
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) incidents.set(i.id, i);
    loaded = true;
    loadError = null;
  } catch (err) {
    loadError = err.message;
  } finally {
    inFlight = false;
  }
  render();
}

await load();
setInterval(load, REFRESH_MS);
