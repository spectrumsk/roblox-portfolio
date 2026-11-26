import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
let statsCache;
let statsPending;

async function previewStats(req) {
  if (statsCache && Date.now() - statsCache.time < 60000) return statsCache.body;
  if (statsPending) return statsPending;
  statsPending = (async () => {
    const source = await readFile(resolve(root, 'api/roblox-stats.js'), 'utf8');
    const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    let status = 200;
    let body;
    await handler(req, {
      setHeader() {},
      status(code) { status = code; return this; },
      json(value) { body = value; }
    });
    if (status !== 200) {
      // Local Roblox requests may be rate-limited independently of production.
      const fallback = await fetch('https://roblox-portfolio-alpha-one.vercel.app/api/roblox-stats', { signal: AbortSignal.timeout(4000) });
      if (!fallback.ok) throw new Error('Both stats sources are unavailable');
      body = await fallback.json();
      if (!Array.isArray(body.games)) throw new Error('Invalid fallback stats');
      console.info('Local preview using the deployed stats feed after an upstream failure');
    }
    statsCache = { time: Date.now(), body };
    return body;
  })().finally(() => { statsPending = null; });
  return statsPending;
}

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/roblox-stats') {
      const body = await previewStats(req);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
      return;
    }
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = file.slice(root.length);
    if (!file.startsWith(root) || relative.split(sep).some(part => part.startsWith('.')) ||
        !(relative === 'index.html' || relative === 'styles.css' || relative.startsWith('assets' + sep))) {
      res.writeHead(404).end('Not found');
      return;
    }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Preview request failed');
  }
}).listen(3000, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:3000'));
