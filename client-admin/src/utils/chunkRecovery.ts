const RELOAD_QUERY = '__btps_reload'
let recoveryStarted = false

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script|error loading dynamically imported module/i.test(message)
}

export function reloadFreshPage(): void {
  const url = new URL(window.location.href)
  url.searchParams.set(RELOAD_QUERY, Date.now().toString())
  window.location.replace(url.href)
}

export function recoverChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error) || recoveryStarted) return false
  const message = error instanceof Error ? error.message : String(error)
  const asset = message.match(/(?:https?:\/\/[^\s]+)?\/assets\/[^\s]+\.(?:js|css)/i)?.[0] ?? message
  const key = `btps:chunk-reload:${asset}`
  try {
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Without a persistent per-tab guard, an automatic refresh could loop.
    return false
  }
  recoveryStarted = true
  reloadFreshPage()
  return true
}

export function removeRecoveryQuery(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(RELOAD_QUERY)) return
  url.searchParams.delete(RELOAD_QUERY)
  window.history.replaceState(window.history.state, '', url.href)
}
