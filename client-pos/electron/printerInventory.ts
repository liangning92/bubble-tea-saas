/** PowerShell ConvertTo-Json emits a scalar for a single queue. */
export function parsePrinterNames(stdout: string): string[] {
  const text = stdout.replace(/^\uFEFF/, '').trim()
  if (!text) return []
  const parsed = JSON.parse(text)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.filter((name): name is string => typeof name === 'string' && !!name.trim())
    .map(name => name.trim())
}
