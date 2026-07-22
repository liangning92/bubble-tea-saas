import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Try to import node-thermal-printer, fallback to manual implementation
let ThermalPrinter: any = null
try {
  ThermalPrinter = require('node-thermal-printer')
} catch (e) {
  // Silent fallback - thermal printer is optional
}

// ============================================================================
// Types
// ============================================================================

export interface PrintReceiptData {
  orderNum: string
  header: string
  footer: string
  printerName: string  // Windows printer name, e.g. "XPrinter"
  items: Array<{
    productName: string
    specName: string
    quantity: number
    unitPrice: number
    addons: Array<{ name: string; price: number }>
  }>
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  cashierName?: string
  orderDate?: string
  customerName?: string
  paymentReceived?: number
  change?: number
}

// Template-based receipt types
export type BlockType =
  | 'logo' | 'header' | 'storeInfo' | 'orderInfo' | 'items'
  | 'subtotal' | 'tax' | 'total' | 'paymentInfo'
  | 'qrCode' | 'barcode' | 'footer' | 'divider' | 'customText'

export interface ReceiptBlock {
  id: string
  type: BlockType
  enabled: boolean
  order: number
  style: {
    bold?: boolean
    fontSize?: 'small' | 'normal' | 'large'
    align?: 'left' | 'center' | 'right'
  }
  config: Record<string, any>
}

export interface PrintReceiptFromTemplate {
  orderNum: string
  printerName: string
  blocks: ReceiptBlock[]
  data: {
    header: string
    footer: string
    storeName: string
    storePhone?: string
    storeAddress?: string
    items: Array<{
      productName: string
      specName: string
      quantity: number
      unitPrice: number
      sugarLevelName?: string
      iceLevelName?: string
      addons: Array<{ name: string; price: number }>
    }>
    subtotal: number
    tax: number
    total: number
    discount?: number
    paymentMethod: string
    cashierName?: string
    customerName?: string
    orderDate?: string
    paidAmount?: number
    change?: number
    qrContent?: string
  }
}

export interface PrintKitchenData {
  orderNum: string
  printerName: string
  items: Array<{
    productName: string
    specName: string
    quantity: number
    sugarLevelName?: string
    iceLevelName?: string
    addons?: Array<{ name: string; price: number }>
    note?: string
  }>
}

// ============================================================================
// ESC/POS Commands
// ============================================================================

const ESC = '\x1B'
const GS = '\x1D'

const INIT = ESC + '@'
const BOLD_ON = ESC + 'E\x01'
const BOLD_OFF = ESC + 'E\x00'
const DOUBLE_HEIGHT = GS + '!\x10'
const NORMAL = GS + '!\x00'
const ALIGN_CENTER = ESC + 'a\x01'
const ALIGN_LEFT = ESC + 'a\x00'
const CUT = GS + 'V\x00'
const FEED_CUT = ESC + 'J\x60'

function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

// ============================================================================
// Receipt Generator
// ============================================================================

export function generateReceipt(data: PrintReceiptData): Buffer {
  const lines: string[] = []
  const now = data.orderDate || new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  lines.push(INIT)
  lines.push(ALIGN_CENTER + DOUBLE_HEIGHT + BOLD_ON + data.header + NORMAL + BOLD_OFF)
  lines.push('================================')
  lines.push(ALIGN_LEFT)
  lines.push('No    : ' + data.orderNum)
  lines.push('Kasir : ' + (data.cashierName || '-'))
  lines.push('Tgl   : ' + now)
  if (data.customerName) lines.push('Pelanggan: ' + data.customerName)
  lines.push('--------------------------------')

  for (const item of data.items) {
    const itemTotal = item.unitPrice * item.quantity
    lines.push(item.productName)
    if (item.specName) lines.push('   ' + item.specName)
    for (const addon of (item.addons || [])) {
      lines.push('   + ' + addon.name)
    }
    lines.push('   ' + item.quantity + ' x ' + formatCurrency(item.unitPrice))
    lines.push(''.padEnd(28) + formatCurrency(itemTotal))
  }

  lines.push('--------------------------------')
  lines.push('Subtotal:'.padEnd(28) + formatCurrency(data.subtotal))
  if (data.tax > 0) {
    lines.push('PPN (11%):'.padEnd(28) + formatCurrency(data.tax))
  }
  lines.push('TOTAL:'.padEnd(28) + BOLD_ON + formatCurrency(data.total) + BOLD_OFF)

  if (data.paymentMethod) {
    lines.push('Metode:'.padEnd(28) + data.paymentMethod)
  }
  if (data.paymentReceived && data.paymentReceived > 0) {
    lines.push('Bayar:'.padEnd(28) + formatCurrency(data.paymentReceived))
    if (data.change !== undefined) {
      lines.push('Kembalian:'.padEnd(28) + BOLD_ON + formatCurrency(data.change) + BOLD_OFF)
    }
  }

  lines.push('--------------------------------')
  lines.push(ALIGN_CENTER + data.footer)
  lines.push('')
  lines.push(FEED_CUT)
  lines.push(CUT)

  return Buffer.from(lines.join('\n'), 'utf8')
}

// ============================================================================
// Template-based Receipt Generator
// ============================================================================

function getEscPosForFontSize(fontSize?: string): string {
  switch (fontSize) {
    case 'small': return ESC + 'M\x01' // Small font
    case 'large': return DOUBLE_HEIGHT
    default: return NORMAL
  }
}

export function generateReceiptFromTemplate(data: PrintReceiptFromTemplate): Buffer {
  const lines: string[] = []
  const now = data.data.orderDate || new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  lines.push(INIT)

  const enabledBlocks = data.blocks
    .filter(b => b.enabled)
    .sort((a, b) => a.order - b.order)

  for (const block of enabledBlocks) {
    const align = block.style.align === 'left' ? ALIGN_LEFT : block.style.align === 'right' ? ALIGN_LEFT : ALIGN_CENTER
    const bold = block.style.bold ? BOLD_ON : BOLD_OFF
    const fontSize = getEscPosForFontSize(block.style.fontSize)

    switch (block.type) {
      case 'logo':
        lines.push(align + 'LOGO_PLACEHOLDER')
        break

      case 'header':
        lines.push(align + fontSize + bold + (block.config.text || data.data.header))
        break

      case 'storeInfo':
        if (block.config.showPhone && data.data.storePhone) {
          lines.push(align + `Tel: ${data.data.storePhone}`)
        }
        if (block.config.showAddress && data.data.storeAddress) {
          lines.push(align + data.data.storeAddress)
        }
        break

      case 'orderInfo':
        lines.push('--------------------------------')
        if (block.config.showDate) lines.push('Tgl   : ' + now.split(',')[0])
        if (block.config.showTime) lines.push('Jam   : ' + now.split(', ')[1])
        if (block.config.showCashier && data.data.cashierName) lines.push('Kasir : ' + data.data.cashierName)
        if (block.config.showCustomer && data.data.customerName) lines.push('Pelanggan: ' + data.data.customerName)
        lines.push('--------------------------------')
        break

      case 'items':
        for (const item of data.data.items) {
          lines.push(fontSize + item.productName)
          if (item.specName) lines.push('   ' + item.specName)
          if (block.config.showSugarIce && (item.iceLevelName || item.sugarLevelName)) {
            lines.push('   ' + [item.iceLevelName, item.sugarLevelName].filter(Boolean).join(' / '))
          }
          if (block.config.showAddon) {
            for (const addon of item.addons) {
              lines.push('   + ' + addon.name)
            }
          }
          lines.push('   ' + item.quantity + ' x ' + formatCurrency(item.unitPrice))
          lines.push(''.padEnd(28) + formatCurrency(item.unitPrice * item.quantity))
        }
        break

      case 'subtotal':
        lines.push('--------------------------------')
        lines.push('Subtotal:'.padEnd(28) + formatCurrency(data.data.subtotal))
        break

      case 'tax':
        const taxLabel = block.config.label || `Tax (${block.config.rate || 11}%)`
        lines.push(taxLabel + ':'.padEnd(28 - taxLabel.length) + formatCurrency(data.data.tax))
        break

      case 'total':
        lines.push('================================')
        lines.push(align + fontSize + BOLD_ON + (block.config.totalLabel || 'TOTAL') + ':'.padEnd(28 - (block.config.totalLabel || 'TOTAL').length) + formatCurrency(data.data.total) + BOLD_OFF)
        break

      case 'paymentInfo':
        lines.push('--------------------------------')
        if (block.config.showMethod) lines.push('Metode:'.padEnd(28) + data.data.paymentMethod)
        if (block.config.showReceived && data.data.paidAmount) {
          lines.push('Bayar:'.padEnd(28) + formatCurrency(data.data.paidAmount))
        }
        if (block.config.showChange && data.data.change !== undefined) {
          lines.push('Kembalian:'.padEnd(28) + BOLD_ON + formatCurrency(data.data.change) + BOLD_OFF)
        }
        break

      case 'qrCode':
        if (data.data.qrContent) {
          lines.push(align + 'QR_CODE_PLACEHOLDER:' + data.data.qrContent)
        }
        break

      case 'barcode':
        lines.push(align + 'BARCODE_PLACEHOLDER:' + data.orderNum)
        break

      case 'footer':
        if (block.config.showDivider) lines.push('--------------------------------')
        lines.push(align + bold + (block.config.footerText || data.data.footer))
        break

      case 'divider':
        if (block.config.dividerStyle === 'space') {
          lines.push('')
        } else if (block.config.dividerStyle === 'dashed') {
          lines.push('- - - - - - - - - - - - - - - - -')
        } else {
          lines.push('================================')
        }
        break

      case 'customText':
        lines.push(align + bold + (block.config.customText || ''))
        break
    }

    // Reset formatting between blocks
    lines.push(NORMAL + BOLD_OFF)
  }

  lines.push('')
  lines.push(FEED_CUT)
  lines.push(CUT)

  return Buffer.from(lines.join('\n'), 'utf8')
}

// ============================================================================
// Kitchen Order Generator
// ============================================================================

export function generateKitchenOrder(data: PrintKitchenData): Buffer {
  const lines: string[] = []
  const now = new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  lines.push(INIT)
  lines.push(ALIGN_CENTER + DOUBLE_HEIGHT + BOLD_ON + '*** KITCHEN ORDER ***' + NORMAL + BOLD_OFF)
  lines.push(ALIGN_CENTER + '================================')
  lines.push(ALIGN_LEFT)
  lines.push(BOLD_ON + 'Order : ' + data.orderNum + BOLD_OFF)
  lines.push('Time  : ' + now)
  lines.push('--------------------------------')

  for (const item of data.items) {
    lines.push('')
    lines.push(BOLD_ON + DOUBLE_HEIGHT + item.quantity + 'x ' + item.productName + NORMAL + BOLD_OFF)
    if (item.specName) lines.push('    ' + item.specName)
    if (item.sugarLevelName || item.iceLevelName) {
      const mods: string[] = []
      if (item.iceLevelName) mods.push(item.iceLevelName)
      if (item.sugarLevelName) mods.push(item.sugarLevelName)
      lines.push('    ' + mods.join(' / '))
    }
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push('    + ' + addon.name)
      }
    }
    if (item.note) {
      lines.push('    >> ' + item.note + ' <<')
    }
  }

  lines.push('--------------------------------')
  lines.push(ALIGN_CENTER + '*** END OF ORDER ***')
  lines.push('')
  lines.push(FEED_CUT)
  lines.push(CUT)

  return Buffer.from(lines.join('\n'), 'utf8')
}

// ============================================================================
// Helpers
// ============================================================================

function getTempFile(suffix: string): string {
  // Use .esc extension for raw ESC/POS data
  return path.join(os.tmpdir(), suffix + Date.now() + '.esc')
}

function runPowerShell(script: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-Command', script], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => resolve({ code: code || 0, stdout, stderr }))
    child.on('error', (err) => resolve({ code: 1, stdout: '', stderr: err.message }))
  })
}

// ============================================================================
// Windows Print via PowerShell (works with USB printers)
// ============================================================================

async function printReceiptWindows(printerName: string, data: Buffer): Promise<void> {
  // Method 1: Use node-thermal-printer (Odoo-style approach for Windows)
  // This sends raw ESC/POS data through Windows Print Spooler
  if (ThermalPrinter) {
    return new Promise((resolve, reject) => {
      try {
        const Printer = ThermalPrinter.printer
        const isElectron = typeof process !== 'undefined' &&
          process.versions && !!process.versions.electron

        const printer = new Printer({
          type: ThermalPrinter.PrinterTypes.EPSON,
          interface: 'printer:' + printerName,
          driver: require(isElectron ? 'electron-printer' : 'printer')
        })

        printer.raw(data).then(() => resolve()).catch(reject)
      } catch (err) {
        reject(err)
      }
    })
  }

  // Method 2 (Fallback): Direct raw file printing via PowerShell
  // Write raw data to a file and use Windows start command with /o flag to send to default printer
  const tempFile = getTempFile('receipt')
  fs.writeFileSync(tempFile, data)

  const escapedPath = tempFile.replace(/\\/g, '\\\\')
  const escapedPrinter = printerName.replace(/'/g, "''")

  // Use Windows Print Spooler API via PowerShell
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "  # Get the printer object",
    "  $printer = Get-Printer | Where-Object { $_.Name -eq '" + escapedPrinter + "' } | Select-Object -First 1",
    "  if (-not $printer) { throw 'Printer not found' }",
    "  ",
    "  # Use Start-Process with /o flag to send raw file to specific printer",
    "  # /o flag suppresses the print dialog",
    "  Start-Process -FilePath '" + escapedPath + "' -Verb Print -ArgumentList '/o' -WindowStyle Hidden",
    "  Start-Sleep -Milliseconds 500",
    "  Remove-Item '" + escapedPath + "' -Force -EA SilentlyContinue",
    "  Write-Output 'OK'",
    "} catch {",
    "  Remove-Item '" + escapedPath + "' -Force -EA SilentlyContinue",
    "  Write-Error $_.Exception.Message",
    "  exit 1",
    "}"
  ].join('; ')

  const result = await runPowerShell(script)
  if (result.code !== 0) {
    throw new Error(result.stderr || 'Print failed')
  }
}

async function openDrawerWindows(printerName: string): Promise<void> {
  // Odoo-style cash drawer control via ESC/POS
  // Use node-thermal-printer's openCashDrawer() method which sends ESC p command
  // This is the same approach Odoo uses through python-escpos library

  if (ThermalPrinter) {
    return new Promise((resolve, reject) => {
      try {
        const Printer = ThermalPrinter.printer
        const isElectron = typeof process !== 'undefined' &&
          process.versions && !!process.versions.electron

        const printer = new Printer({
          type: ThermalPrinter.PrinterTypes.EPSON,
          interface: 'printer:' + printerName,
          driver: require(isElectron ? 'electron-printer' : 'printer')
        })

        // openCashDrawer() sends ESC p m t1 t2 command (Odoo standard)
        printer.openCashDrawer().then(() => resolve()).catch(reject)
      } catch (err) {
        reject(err)
      }
    })
  }

  // Fallback: Send drawer kick command via raw file
  // ESC p command: ESC=0x1B, 'p'=0x70, pin=0x00 (pin 2), t1=50, t2=50 (100ms)
  // Odoo default from python-escpos: CD_KICK_2 = '\x1b\x70\x00' + chr(50) + chr(50)
  const CD_KICK = Buffer.from([0x1B, 0x70, 0x00, 50, 50])
  const tempFile = getTempFile('drawer')
  fs.writeFileSync(tempFile, CD_KICK)

  const escapedPath = tempFile.replace(/\\/g, '\\\\')
  const escapedPrinter = printerName.replace(/'/g, "''")

  // Odoo-style: retry mechanism with up to 5 attempts
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "function Send-DrawerPulse {",
    "  param($printerName, $filePath)",
    "  try {",
    "    # Use Start-Process to send raw data to printer",
    "    Start-Process -FilePath $filePath -Verb Print -WindowStyle Hidden",
    "    return 'OK'",
    "  } catch {",
    "    return 'RETRY'",
    "  }",
    "}",
    "try {",
    "  $maxTries = 5",
    "  $delayMs = 100",
    "  for ($i = 0; $i -lt $maxTries; $i++) {",
    "    $result = Send-DrawerPulse '" + escapedPrinter + "' '" + escapedPath + "'",
    "    if ($result -eq 'OK') { break }",
    "    if ($i -lt ($maxTries - 1)) { Start-Sleep -Milliseconds $delayMs }",
    "  }",
    "  Remove-Item '" + escapedPath + "' -Force -EA SilentlyContinue",
    "  Write-Output 'OK'",
    "} catch {",
    "  Remove-Item '" + escapedPath + "' -Force -EA SilentlyContinue",
    "  Write-Error $_.Exception.Message",
    "  exit 1",
    "}"
  ].join('; ')

  const result = await runPowerShell(script)
  if (result.code !== 0) {
    throw new Error(result.stderr || 'Drawer open failed')
  }
}

// ============================================================================
// macOS/Linux printing via CUPS lp
// ============================================================================

async function printReceiptMacLinux(printerName: string, data: Buffer): Promise<void> {
  // getTempFile already uses .esc extension for raw ESC/POS data
  const tempFile = getTempFile('receipt')
  fs.writeFileSync(tempFile, data)

  return new Promise((resolve, reject) => {
    const result = spawn('lp', ['-d', printerName, '-o', 'raw', tempFile], { stdio: 'ignore' })
    result.on('close', (code) => {
      try { fs.unlinkSync(tempFile) } catch {}
      if (code === 0) resolve()
      else reject(new Error('lp failed with code ' + code))
    })
    result.on('error', (err) => {
      try { fs.unlinkSync(tempFile) } catch {}
      reject(err)
    })
  })
}

async function openDrawerMacLinux(printerName: string): Promise<void> {
  // Odoo-style: send drawer kick via CUPS with raw mode
  // ESC p command with 50,50 timing (100ms pulse) - same as Odoo
  const CD_KICK_2 = Buffer.from([0x1B, 0x70, 0x00, 50, 50])  // 50*2ms = 100ms pulse
  const tempFile = getTempFile('drawer')
  fs.writeFileSync(tempFile, CD_KICK_2)

  return new Promise((resolve, reject) => {
    const result = spawn('lp', ['-d', printerName, '-o', 'raw', tempFile], { stdio: 'ignore' })
    result.on('close', (code) => {
      try { fs.unlinkSync(tempFile) } catch {}
      if (code === 0) resolve()
      else reject(new Error('lp failed with code ' + code))
    })
    result.on('error', (err) => {
      try { fs.unlinkSync(tempFile) } catch {}
      reject(err)
    })
  })
}

// ============================================================================
// Public API
// ============================================================================

export async function printReceipt(data: PrintReceiptData): Promise<{ success: boolean; error?: string }> {
  const printerName = data.printerName || 'XPrinter'
  try {
    const receipt = generateReceipt(data)
    if (process.platform === 'win32') {
      await printReceiptWindows(printerName, receipt)
    } else {
      await printReceiptMacLinux(printerName, receipt)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Odoo-style: Print receipt + open cash drawer in correct order
// Odoo sends print first, then drawer kick after a short delay to ensure printer is ready
export async function printReceiptAndOpenDrawer(
  data: PrintReceiptData,
  drawerDelayMs: number = 500
): Promise<{ success: boolean; error?: string }> {
  const printerName = data.printerName || 'XPrinter'
  try {
    const receipt = generateReceipt(data)
    if (process.platform === 'win32') {
      await printReceiptWindows(printerName, receipt)
      // Odoo adds delay between print and drawer to ensure printer spooler is ready
      await new Promise(resolve => setTimeout(resolve, drawerDelayMs))
      await openDrawerWindows(printerName)
    } else {
      await printReceiptMacLinux(printerName, receipt)
      await new Promise(resolve => setTimeout(resolve, drawerDelayMs))
      await openDrawerMacLinux(printerName)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function printReceiptRaw(data: Buffer, printerName?: string): Promise<{ success: boolean; error?: string }> {
  const printer = printerName || 'XPrinter'
  try {
    if (process.platform === 'win32') {
      await printReceiptWindows(printer, data)
    } else {
      await printReceiptMacLinux(printer, data)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function openCashDrawerWindows(printerName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'win32') {
      await openDrawerWindows(printerName)
    } else {
      await openDrawerMacLinux(printerName)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function printKitchenOrder(data: PrintKitchenData): Promise<{ success: boolean; error?: string }> {
  const printerName = data.printerName || 'XPrinter'
  try {
    const order = generateKitchenOrder(data)
    if (process.platform === 'win32') {
      await printReceiptWindows(printerName, order)
    } else {
      await printReceiptMacLinux(printerName, order)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function listPrinters(): Promise<string[]> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      runPowerShell('Get-Printer | Select-Object -ExpandProperty Name').then((result) => {
        if (result.code === 0) {
          const printers = result.stdout.split('\n').map((p: string) => p.trim()).filter(Boolean)
          resolve(printers)
        } else {
          resolve([])
        }
      }).catch(() => resolve([]))
    } else {
      const result = spawn('lpstat', ['-a'], { stdio: ['ignore', 'pipe', 'ignore'] })
      let output = ''
      result.stdout.on('data', (d: Buffer) => { output += d.toString() })
      result.on('close', () => {
        const printers = output.split('\n').map((p: string) => p.trim().split(' ')[0]).filter(Boolean)
        resolve(printers)
      })
      result.on('error', () => { resolve([]) })
    }
  })
}
