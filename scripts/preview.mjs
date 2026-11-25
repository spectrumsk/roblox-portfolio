import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/api/roblox-stats') {
      const source = await readFile(resolve(root, 'api/roblox-stats.js'), 'utf8');
      const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
      res.status = code => { res.statusCode = code; return res; };
      res.json = body => res.end(JSON.stringify(body));
      await handler(req, res);
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
