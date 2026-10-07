export function isNewerUpdate(latest: unknown, current: unknown): boolean {
  if (typeof latest !== 'string' || typeof current !== 'string' || !/^\d+(\.\d+){1,3}$/.test(latest) || !/^\d+(\.\d+){1,3}$/.test(current)) return false
  const a = latest.split('.').map(Number), b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}
