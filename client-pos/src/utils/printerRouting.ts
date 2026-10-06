export type PrinterPurpose = 'receipt' | 'kitchen' | 'label'
export interface ConfiguredPrinter {
  type: string
  enabled?: boolean
  connectionType?: string
  printerName?: string
  printerIp?: string
  stickerWidth?: number
  stickerHeight?: number
  stickerGap?: number
  printerPort?: number
}
export interface PrinterSettings {
  printers?: ConfiguredPrinter[]
  printerName?: string
}
export type PrinterTarget = { printerName?: string; printerHost?: string; printerPort?: number }
export type PrinterSelection = { ok: true; target: PrinterTarget; printer?: ConfiguredPrinter } | { ok: false; reason: 'unconfigured' | 'disabled' | 'invalid' | 'selection' }

/** The configured list is authoritative. Never use an OS default or another purpose. */
export function selectPrinter(settings: PrinterSettings, purpose: PrinterPurpose, explicitName?: string | null): PrinterSelection {
  const explicit = typeof explicitName === 'string' ? explicitName.trim() : undefined
  let printer: ConfiguredPrinter | undefined
  if (settings.printers !== undefined) {
    if (!Array.isArray(settings.printers) || !settings.printers.every(p => p && typeof p.type === 'string')) return { ok: false, reason: 'invalid' }
    const samePurpose = settings.printers.filter(p => p.type === purpose)
    printer = explicit
      ? samePurpose.find(p => p.enabled === true && typeof p.printerName === 'string' && p.printerName.trim() === explicit)
      : samePurpose.find(p => p.enabled === true)
    if (!printer) return { ok: false, reason: explicit ? 'selection' : samePurpose.length ? 'disabled' : 'unconfigured' }
  } else if (purpose === 'receipt' && typeof settings.printerName === 'string' && settings.printerName.trim() && (!explicit || explicit === settings.printerName.trim())) {
    return { ok: true, target: { printerName: settings.printerName.trim() } }
  } else return { ok: false, reason: explicit ? 'selection' : 'unconfigured' }
  if (printer.connectionType === 'network') {
    const host = typeof printer.printerIp === 'string' ? printer.printerIp.trim() : ''
    const port = printer.printerPort ?? 9100
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, reason: 'invalid' }
    return { ok: true, printer, target: { printerHost: host, printerPort: port } }
  }
  const name = typeof printer.printerName === 'string' ? printer.printerName.trim() : ''
  return name ? { ok: true, printer, target: { printerName: name } } : { ok: false, reason: 'invalid' }
}
