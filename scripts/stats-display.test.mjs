import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('  async function fetchLiveRobloxStats()'), html.indexOf("  window.addEventListener('DOMContentLoaded', fetchLiveRobloxStats)"));

async function render(data, hostname = '127.0.0.1', ok = true) {
  const elements = new Map();
  let requestedUrl;
  const context = vm.createContext({
    AbortController, setTimeout, clearTimeout,
    location: { hostname },
    console: { warn() {} },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerText: id === 'hero-playing' ? '--' : '', textContent: '-- Total Plays' });
      return elements.get(id);
    } },
    fetch: async url => {
      requestedUrl = url;
      return { ok, json: async () => data };
    }
  });
  await vm.runInContext(source + '\nfetchLiveRobloxStats()', context);
  return { elements, requestedUrl };
}

test('new games and group contribute to totals; zero players and ratings render correctly', async () => {
  const { elements, requestedUrl } = await render({
    games: [
      { id: 9807623580, visits: 100, playing: 1, favoritedCount: 1, rating: 90 },
      { id: 10774449334, visits: 200, playing: 0, favoritedCount: 0, rating: 0 },
      { id: 10776235123, visits: 300, playing: 2, favoritedCount: 14, rating: null }
    ],
    groupMembers: 100, trainingGroupMembers: 200,
    shadowstarGroupMembers: 300, sillybilliesGroupMembers: 1000,
    peakConcurrent: 4500
  });
  assert.equal(requestedUrl, '/api/roblox-stats');
  assert.equal(elements.get('hero-visits').innerText, '600');
  assert.equal(elements.get('hero-members').innerText, '10K');
  assert.equal(elements.get('football-playing').innerText, '0');
  assert.equal(elements.get('football-rating').innerText, '0%');
  assert.equal(elements.get('paradox-rating').innerText, '--');
  assert.equal(elements.get('sillybillies-group-pill-members').innerText, '1K Members');
  assert.equal(elements.get('hero-playing').innerText, '3', 'current players are summed independently of the historical peak');
});

test('production uses the deployed API and reports an unavailable feed', async () => {
  const { elements, requestedUrl } = await render({}, 'shadowstarstudios.com', false);
  assert.equal(requestedUrl, 'https://roblox-portfolio-alpha-one.vercel.app/api/roblox-stats');
  assert.equal(elements.get('football-visits').textContent, 'Stats unavailable');
  assert.equal(elements.get('paradox-visits').textContent, 'Stats unavailable');
});

 test('current player total handles zero and does not present incomplete data as a total', async () => {
  const zero = await render({ games: [{ id: 9807623580, playing: 0 }], peakConcurrent: 15900 });
  assert.equal(zero.elements.get('hero-playing').innerText, '0');
  const missing = await render({ games: [{ id: 9807623580, playing: 4 }, { id: 10774449334 }] });
  assert.equal(missing.elements.has('hero-playing'), false);
});
