import { fetchIncidents } from './api.js';

const board = document.querySelector('[data-testid="board"]');
const list = board.querySelector('[data-testid="incident-list"]');
const loader = board.querySelector('[data-testid="loader"]');
const empty = board.querySelector('[data-testid="empty"]');
const boardError = board.querySelector('.board-error');

let incidents = [];
let loaded = false;
let loadError = null;

function render() {
  loader.hidden = loaded || loadError !== null;
  boardError.hidden = loadError === null;
  boardError.textContent = loadError ? `Could not load incidents (${loadError}). Retrying…` : '';
  empty.hidden = !loaded || incidents.length > 0;
  list.innerHTML = incidents
    .map(
      (i) => `<li data-testid="incident-row" data-id="${i.id}" class="row ${i.severity}">
        <span class="id">${i.id}</span>
        <span class="sev">${i.severity}</span>
        <span class="what">${i.service} · ${i.region} · ${i.summary}</span>
        <time datetime="${i.openedAt}">${i.openedAt}</time>
      </li>`,
    )
    .join('');
}

async function load() {
  try {
    const page = await fetchIncidents();
    incidents = page.incidents;
    loaded = true;
    loadError = null;
  } catch (err) {
    loadError = err.message;
  }
  render();
}

await load();
