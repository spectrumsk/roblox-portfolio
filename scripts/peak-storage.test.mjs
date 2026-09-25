import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../api/roblox-stats.js', import.meta.url), 'utf8');
const { savePingPongPeak, default: handler } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
);

test('saved peak integration and failure isolation', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  process.env.KV_REST_API_URL = 'https://peak.example.test';
  process.env.KV_REST_API_TOKEN = 'test-token';
  let saved;
  let storageFails = false;
  globalThis.fetch = async (url, options) => {
    if (url === process.env.KV_REST_API_URL) {
      if (storageFails) throw new Error('Simulated outage');
      const [command, script, keyCount, key, candidate] = JSON.parse(options.body);
      assert.equal(command, 'EVAL');
      assert.equal(keyCount, '1');
      assert.equal(key, 'pingpong:peak-concurrent');
      assert.match(script, /math.max\(4500, saved, tonumber\(ARGV\[1\]\)\)/);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      saved = Math.max(4500, saved || 0, Number(candidate));
      return { ok: true, json: async () => ({ result: saved }) };
    }
    let body = { memberCount: 100 };
    if (url.includes('/games?')) body = { data: [{ id: 10628526114, playing: 2000 }, { id: 9807623580, playing: 90000 }] };
    if (url.includes('/votes?')) body = { data: [] };
    return { ok: true, json: async () => body };
  };
  try {
    assert.equal(await savePingPongPeak(1000), 4500);
    assert.equal(await savePingPongPeak(5200), 5200);
    assert.equal(await savePingPongPeak(2000), 5200);
    for (const invalid of [undefined, -1, NaN, Infinity, '9000', 9000.5]) {
      assert.equal(await savePingPongPeak(invalid), 5200);
    }
    let response;
    const res = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(body) { response = body; } };
    await handler({}, res);
    assert.equal(response.peakConcurrent, 5200);
    assert.equal(response.games[1].playing, 90000);
    storageFails = true;
    await handler({}, res);
    assert.equal(response.peakConcurrent, 4500);
    assert.equal(response.games.length, 2);
    assert.equal(saved, 5200);
    storageFails = false;
    assert.equal(await savePingPongPeak(100), 5200);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ error: 'quota exceeded' }) });
    assert.equal(await savePingPongPeak(8000), 4500);
    delete process.env.KV_REST_API_TOKEN;
    assert.equal(await savePingPongPeak(8000), 4500);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [['KV_REST_API_URL', originalEnv.url], ['KV_REST_API_TOKEN', originalEnv.token]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
