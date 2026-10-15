import { createHash } from 'node:crypto'
import type { Plugin } from 'vite'

export function workerSource(assets: string[], version: string): string {
  return `
const CACHE = 'youme-pos-shell-${version}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('youme-pos-shell-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('/index.html'))));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
`
}

/** Version the worker with the bundle; installation succeeds only after every chunk is cached. */
export function offlineShell(): Plugin {
  return {
    name: 'pos-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = ['/index.html', ...Object.keys(bundle).filter(name => /\.(js|css|woff2?|png|svg)$/.test(name)).map(name => '/' + name)]
      const version = createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0, 16)
      this.emitFile({type: 'asset', fileName: 'pos-sw.js', source: workerSource(assets, version)})
    }
  }
}
