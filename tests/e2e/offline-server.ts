import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { AddressInfo } from 'node:net';

// Stop the real origin for outage tests. Playwright 1.63 WebKit's setOffline kills
// even synthetic service-worker responses: https://github.com/microsoft/playwright/issues/42775
export async function startOfflineServer(scope = '/') {
  const dist = resolve('dist');
  const types: Record<string, string> = {
    '.html': 'text/html;charset=utf-8',
    '.js': 'text/javascript;charset=utf-8',
    '.css': 'text/css;charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  const server = createServer((req, res) => {
    void (async () => {
      const pathname = decodeURIComponent(
        new URL(req.url!, 'http://localhost').pathname,
      );
      const file = resolve(
        dist,
        pathname.startsWith(scope)
          ? pathname.slice(scope.length) || 'index.html'
          : '../outside',
      );
      if (!file.startsWith(dist + sep)) {
        res.writeHead(404);
        res.end();
        return;
      }
      try {
        const bytes = await readFile(file);
        res.writeHead(200, {
          'Content-Type': types[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(bytes);
      } catch {
        res.writeHead(404);
        res.end();
      }
    })().catch(() => {
      res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: origin + scope,
    async stop() {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
      // This Node request has no browser cache or service worker. Verify the origin is unreachable.
      let reachable = false;
      try {
        await fetch(origin);
        reachable = true;
      } catch {
        /* Expected connection refusal. */
      }
      if (reachable)
        throw new Error('Offline test origin is unexpectedly still reachable');
    },
  };
}
