export function printerNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new Error('Invalid printer inventory')
  return [...new Set(raw.map(p => typeof p === 'string' ? p : p?.name)
    .filter((name): name is string => typeof name === 'string' && !!name.trim())
    .map(name => name.trim()))].sort()
}

/** Prefer the bridge actually exposed by Electron preload. Do not guess device roles. */
export async function discoverPrinters(api: any): Promise<string[]> {
  if (api?.listPrinters) {
    const result = await api.listPrinters()
    const names = printerNames(result?.printers)
    if (!names.length && result?.error) throw new Error(result.error)
    return names
  }
  if (api?.getPrinters) return printerNames(await api.getPrinters())
  throw new Error('Printer discovery is unavailable')
}
