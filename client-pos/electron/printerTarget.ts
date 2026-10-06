/** Resolve only the explicitly named device. Never guess a printer by role/name substring. */
export function exactPrinterName(providedName: string | undefined, installed: { name: string }[]): string {
  const name = (providedName || '').trim()
  if (!name) throw new Error('No printer target configured')
  if (/^COM\d+$/i.test(name) || /^\\\\[^\\]+\\[^\\]+$/.test(name)) return name
  const exact = installed.find(p => p.name.toLowerCase() === name.toLowerCase())
  if (!exact) throw new Error('Configured printer is unavailable: ' + name)
  return exact.name
}
