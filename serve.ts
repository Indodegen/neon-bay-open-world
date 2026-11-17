// serve.ts — A tiny static file server for playtesting NEON BAY locally.
// Serves game/ on http://localhost:8080 with no dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), 'game');
const port = 8080;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    path = normalize(path).replace(/^(\.\.[/\\])+/, '');
    const file = join(root, path);
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const data = await readFile(file);
    response.writeHead(200, {
      'content-type': mimeTypes.get(extname(file).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(data);
  } catch (error) {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`NEON BAY serving game/ at http://localhost:${port}/`);
});
