import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
// Helpers
// ============================================================================

function getTempFile(suffix: string): string {
  return path.join(os.tmpdir(), suffix + Date.now() + '.bin')
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
  const tempFile = getTempFile('receipt')
  fs.writeFileSync(tempFile, data)

  // Escape printer name for PowerShell
  const escapedPrinter = printerName.replace(/'/g, "''")

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "  $bytes = [System.IO.File]::ReadAllBytes('" + tempFile.replace(/\\/g, '\\\\') + "')",
    "  $ms = [System.IO.MemoryStream]::new($bytes)",
    "  $printDoc = New-Object System.Drawing.Printing.PrintDocument",
    "  $printDoc.PrinterSettings.PrinterName = '" + escapedPrinter + "'",
    "  if (-not $printDoc.PrinterSettings.IsValid) { throw 'Printer not found: " + escapedPrinter + "' }",
    "  # Write raw bytes directly to printer spooler",
    "  Add-Type -AssemblyName System.Drawing.Printing",
    "  $printerSettings = New-Object System.Drawing.Printing.PrinterSettings",
    "  $printerSettings.PrinterName = '" + escapedPrinter + "'",
    "  $printerSettings.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Custom', 80, 2000)",
    "  # Use raw print via PrintDocument",
    "  $handler = { param($s, $e) $graphics = $e.Graphics; $bitmap = [System.Drawing.Bitmap]::FromStream($ms); $graphics.DrawImage($bitmap, 0, 0) }",
    "  Register-ObjectEvent -InputObject $printDoc -EventName PrintPage -Action { } | Out-Null",
    "  # Alternative: copy file to printer",
    "  $target = '\\\\.\\" + escapedPrinter.replace(/\\/g, '\\\\') + "'",
    "  # Try notepad /pt approach",
    "  $proc = Start-Process notepad.exe -ArgumentList '/pt','" + tempFile.replace(/\\/g, '\\\\') + "','" + escapedPrinter + "' -PassThru -Wait -NoNewWindow -WindowStyle Hidden",
    "  if ($proc.ExitCode -eq 0) { Write-Output 'OK' } else { throw 'Print failed' }",
    "  Remove-Item '" + tempFile.replace(/\\/g, '\\\\') + "' -Force -EA SilentlyContinue",
    "  $ms.Dispose()",
    "} catch {",
    "  Write-Error $_.Exception.Message",
    "  Remove-Item '" + tempFile.replace(/\\/g, '\\\\') + "' -Force -EA SilentlyContinue",
    "  exit 1",
    "}"
  ].join('; ')

  const result = await runPowerShell(script)
  if (result.code !== 0) {
    throw new Error(result.stderr || 'Print failed')
  }
}

async function openDrawerWindows(printerName: string): Promise<void> {
  const tempFile = getTempFile('drawer')
  const drawerBytes = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA, 0x1B, 0x64, 0x03])
  fs.writeFileSync(tempFile, drawerBytes)

  const escapedPrinter = printerName.replace(/'/g, "''")

  // Method: Use notepad /pt to send raw file to printer
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    "  $proc = Start-Process notepad.exe -ArgumentList '/pt','" + tempFile.replace(/\\/g, '\\\\') + "','" + escapedPrinter + "' -PassThru -Wait -NoNewWindow -WindowStyle Hidden",
    "  if ($proc.ExitCode -eq 0) { Write-Output 'OK' } else { throw 'Drawer open failed' }",
    "  Remove-Item '" + tempFile.replace(/\\/g, '\\\\') + "' -Force -EA SilentlyContinue",
    "} catch {",
    "  Write-Error $_.Exception.Message",
    "  Remove-Item '" + tempFile.replace(/\\/g, '\\\\') + "' -Force -EA SilentlyContinue",
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
  const drawerBytes = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA])
  const tempFile = getTempFile('drawer')
  fs.writeFileSync(tempFile, drawerBytes)

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
