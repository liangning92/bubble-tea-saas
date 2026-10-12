/** 203 dpi TSPL cup labels. Keep size, sweetness and ice on separate lines. */
export function cupStickerTspl(item: any, defaultTime: string): string {
  const width = Number(item.stickerWidth) || 40
  const height = Number(item.stickerHeight) || 30
  const gap = item.stickerGap == null ? 2 : Number(item.stickerGap)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 30 || height < 25 || width > 110 || height > 150 || !Number.isFinite(gap) || gap < 0 || gap > 10) {
    throw new Error('Invalid cup label dimensions')
  }
  const units = Math.floor((width * 8 - 24) / 12)
  const safe = (value: unknown) => String(value ?? '').replace(/["\x00-\x1f\x7f]/g, ' ').trim()
  const fit = (value: unknown) => {
    const text = safe(value)
    let count = 0, result = ''
    for (const char of text) {
      count += char.codePointAt(0)! > 255 ? 2 : 1
      if (count > units) return result.slice(0, -1) + '~'
      result += char
    }
    return result
  }
  const displayNo = item.pickupNumber || item.orderNum || ''
  const cupNo = item.cupIndex && item.totalCups ? `[${item.cupIndex}/${item.totalCups}]` : ''
  const addons = (item.addons || []).map((a: any) => '+' + (a.name || a)).join(', ')
  const rows = [
    `#${displayNo} ${cupNo}`,
    item.productName || item.name || '',
    item.specName || '',
    item.sugarLevelName ? `Sugar: ${item.sugarLevelName}` : '',
    item.iceLevelName ? `Ice: ${item.iceLevelName}` : '',
    addons,
    `${item.time || defaultTime} ${item.storeName || 'YOUME'} ${item.promoTag || ''}`
  ].filter(Boolean)
  const step = Math.min(32, Math.floor((height * 8 - 16 - 24) / Math.max(1, rows.length - 1)))
  return [
    `SIZE ${width} mm, ${height} mm`, `GAP ${gap} mm, 0 mm`,
    'DIRECTION 1', 'CLS',
    ...rows.map((row, index) => `TEXT 12,${8 + index * step},"${/[^\x20-\x7e]/.test(safe(row)) ? 'TSS24.BF2' : '2'}",0,1,1,"${fit(row)}"`),
    'PRINT 1,1', ''
  ].join('\r\n')
}
