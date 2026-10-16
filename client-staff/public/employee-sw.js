// Cache only the public app shell. Never cache APIs, salary, documents or user data.
const SHELL_PREFIX = 'employee-shell-v1:'
let activeCache
async function shellCache() {
  if (!activeCache) activeCache = (await caches.keys()).filter(key => key.startsWith(SHELL_PREFIX)).at(-1)
  return activeCache ? caches.open(activeCache) : null
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch('/employee-shell.json', { cache: 'no-store' })
  if (!response.ok) throw new Error('Shell manifest unavailable')
  const manifest = await response.json()
  if (!/^[a-f0-9]{16}$/.test(manifest.version) || !Array.isArray(manifest.assets) || !manifest.assets.every(path => path === '/' || /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path))) throw new Error('Invalid shell manifest')
  const name = SHELL_PREFIX + manifest.version, cache = await caches.open(name)
  await cache.addAll(manifest.assets)
  activeCache = name
  await self.skipWaiting()
})()))
self.addEventListener('activate', event => event.waitUntil((async () => {
  const cache = await shellCache()
  if (cache && activeCache) await Promise.all((await caches.keys()).filter(key => key.startsWith(SHELL_PREFIX) && key !== activeCache).map(key => caches.delete(key)))
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
    event.respondWith((async () => await (await shellCache())?.match(request) || fetch(request))())
  }
})
self.addEventListener('push',event=>{let data;try{data=event.data.json()}catch{return}event.waitUntil(self.registration.showNotification(data.title||'YOUME',{tag:data.id,body:'Buka aplikasi untuk melihat detail.',data:{url:data.url}}))})
self.addEventListener('notificationclick',event=>{event.notification.close();let path=event.notification.data?.url||'/';if(!path.startsWith('/')||path.startsWith('//'))path='/';const url=new URL(path,self.location.origin).href;event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async list=>{const existing=list.find(c=>new URL(c.url).origin===self.location.origin);if(existing){await existing.navigate(url);await existing.focus()}else await clients.openWindow(url)}))})
