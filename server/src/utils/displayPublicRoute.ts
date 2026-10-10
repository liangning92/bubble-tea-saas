// These routes still enforce signed, store-scoped TV authorization in tvScreenRouter.
export function isDisplayPublicRoute(method: string, path: string): boolean {
  return method === 'GET' && ['/marketing/tv-screen/config', '/marketing/tv-screen/events'].includes(path)
    || method === 'POST' && path === '/marketing/tv-screen/heartbeat'
}
