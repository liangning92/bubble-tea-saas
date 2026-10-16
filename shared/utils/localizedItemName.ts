type NamedItem = string | { name?: string; nameZh?: string; nameEn?: string; nameId?: string }

/** Display-only legacy parsing. The original name remains the search/save value. */
export function itemDisplayName(item: NamedItem, language = 'id'): string {
  const name = typeof item === 'string' ? item : item.name || ''
  const lang = language.split('-')[0]
  const explicit = typeof item === 'object' ? ({ zh: item.nameZh, en: item.nameEn, id: item.nameId } as Record<string, string | undefined>)[lang] : undefined
  if (explicit?.trim()) {
    const specs = [...name.matchAll(/\b\d+(?:\.\d+)?\s*(?:ml|kg|g|l|pcs|cup)\b/gi)].map(m => m[0])
    const missing = specs.filter(spec => !explicit.toLowerCase().includes(spec.toLowerCase()))
    return [explicit.trim(), ...missing].join(' ')
  }
  if (!name.trim()) return '-'
  const match = name.match(/^(.+?)\s+\/\s+([^()]+?)\s*\(([^()]*[\u4e00-\u9fff][^()]*)\)\s*$/)
  if (lang === 'id') {
    const clean = name.replace(/\s*\([^)]*[\u3400-\u9fff][^)]*\)/g, '').trim()
    const parts = clean.split(/\s+\/\s+/)
    // Legacy imports use both language orders. Select only a recognizable Indonesian
    // segment; ambiguous slashes may identify different products and stay intact.
    const indonesian = /\b(gelas|bubuk|irisan|susu|teh|sirup|selai|sedotan|tutup|kantong|gula|buah|biji|kacang|krim|air|es|plastik|kertas|cokelat|stroberi|mangga|leci|jeruk|kopi|hitam|hijau|merah|sari|sendok|wadah|saus|botol|pipet|remah|remahan|nata)\b/i
    const candidates = parts.filter(part => indonesian.test(part))
    const candidate = candidates.length === 1 ? candidates[0] : clean
    const specs = [...new Set([...name.matchAll(/\b\d+(?:\.\d+)?\s*(?:ml|kg|g|l|pcs|cup)\b/gi)].map(m => m[0]))]
    return [candidate, ...specs.filter(spec => !candidate.toLowerCase().includes(spec.toLowerCase()))].join(' ')
  }
  if (!match) return name
  const [original, , , chinese] = match
  const candidate = lang === 'zh' ? chinese : original
  // Never shorten away identifying numeric specifications in a legacy name.
  const specs = [...name.matchAll(/\b\d+(?:\.\d+)?\s*(?:ml|kg|g|l|pcs|cup)\b/gi)].map(m => m[0])
  if (specs.some(spec => !candidate.toLowerCase().includes(spec.toLowerCase()))) return name
  return candidate.trim()
}

