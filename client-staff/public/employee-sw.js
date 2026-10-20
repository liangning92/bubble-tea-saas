// Cache only the public app shell. Never cache APIs, salary, documents or user data.
const SHELL_PREFIX = 'employee-shell-v1:'
let activeCache
async function shellCache() {
  if (activeCache) return caches.open(activeCache)
  const names = (await caches.keys()).filter(key => key.startsWith(SHELL_PREFIX)).reverse()
  for (const name of names) { const cache = await caches.open(name); if (await cache.match('/')) { activeCache = name; return cache } }
  return null
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch('/employee-shell.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Shell manifest unavailable')
  const manifest = await response.json()
  if ((self.__EMPLOYEE_SHELL_VERSION && manifest.version !== self.__EMPLOYEE_SHELL_VERSION) || !/^[a-f0-9]{16}$/.test(manifest.version) || !Array.isArray(manifest.assets) || !manifest.assets.every(path => path === '/' || /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path))) throw new Error('Invalid shell manifest')
  const name = SHELL_PREFIX + manifest.version, cache = await caches.open(name)
  const existed = (await caches.keys()).includes(name) && !!(await cache.match('/'))
  try { await cache.addAll(manifest.assets) } catch(error) { if (!existed) await caches.delete(name); throw error }
  activeCache = name
  await self.skipWaiting()
})()))
self.addEventListener('activate', event => event.waitUntil((async () => {
  const cache = await shellCache()
  if (cache && activeCache) {
    const previous = (await caches.keys()).filter(key => key.startsWith(SHELL_PREFIX) && key !== activeCache)
    let retain
    for (const name of [...previous].reverse()) { if (await (await caches.open(name)).match('/')) { retain = name; break } }
    await Promise.all(previous.filter(key => key !== retain).map(key => caches.delete(key)))
  }
  await self.clients.claim()
})()))
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || request.headers.has('Authorization')) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok || response.status < 500) return response
      return await (await shellCache())?.match('/') || response
    }).catch(async () => await (await shellCache())?.match('/') || Response.error()))
  } else if (/^\/assets\/.*\.(js|css)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await (await shellCache())?.match(request)
      if (cached) return cached
      for (const name of (await caches.keys()).filter(key => key.startsWith(SHELL_PREFIX) && key !== activeCache)) { const previous = await (await caches.open(name)).match(request); if (previous) return previous }
      return fetch(request)
    })())
  }
})

// Only synthetic self-test receipt metadata is kept here, never tokens, message bodies or subscription keys.
const TEST_RECEIPT_DB = 'employee-push-test-receipts-v1'
function testReceipts(id, phase) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(TEST_RECEIPT_DB, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore('receipts', { keyPath: 'id' })
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction('receipts', phase ? 'readwrite' : 'readonly'), store = tx.objectStore('receipts')
      let result = null
      const read = store.get(id)
      read.onsuccess = () => {
        const previous = read.result
        if (phase) {
          result = { ...previous, id, updatedAt: new Date().toISOString(), [phase + 'At']: previous?.[phase + 'At'] || new Date().toISOString() }
          store.put(result)
          const all = store.getAll()
          all.onsuccess = () => all.result.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).forEach((r, index) => {
            if (index >= 20 || Date.now() - Date.parse(r.updatedAt) > 86400000) store.delete(r.id)
          })
        } else if (previous && Date.now() - Date.parse(previous.updatedAt) <= 86400000) result = previous
      }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
}
self.addEventListener('message', event => {
  if (event.data?.type !== 'EMPLOYEE_PUSH_TEST_RECEIPT' || !/^[a-f0-9]{64}$/.test(event.data.id) || !event.ports[0]) return
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return
  event.waitUntil(testReceipts(event.data.id).then(receipt => event.ports[0].postMessage(receipt)).catch(() => event.ports[0].postMessage(null)))
})
self.addEventListener('push', event => {
  let data; try { data = event.data.json() } catch { return }
  const testId = /^[a-f0-9]{64}$/.test(data.testId) ? data.testId : null
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'YOUME', { tag: data.id, body: 'Buka aplikasi untuk melihat detail.', data: { url: data.url, testId } })
    if (testId) await testReceipts(testId, 'displayed').catch(() => {})
  })())
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let path = event.notification.data?.url || '/'
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\u0000-\u001f]/.test(path)) path = '/'
  const url = new URL(path, self.location.origin).href, testId = event.notification.data?.testId
  event.waitUntil((async () => {
    if (/^[a-f0-9]{64}$/.test(testId)) await testReceipts(testId, 'opened').catch(() => {})
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = list.find(c => new URL(c.url).origin === self.location.origin)
    if (existing) { await existing.navigate(url); await existing.focus() } else await self.clients.openWindow(url)
  })())
})
