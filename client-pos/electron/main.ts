import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import { setupUpdater, checkForUpdatesOnStart } from './updater'

// 窗口引用
let mainWindow: BrowserWindow | null = null
let customerWindow: BrowserWindow | null = null

// 开发模式检测
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

/**
 * 获取资源文件路径（兼容打包和开发模式）
 * asar: false 时，app.getAppPath() 返回 resources/app
 */
function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), relativePath)
  } else {
    return path.join(__dirname, '..', '..', relativePath)
  }
}

/**
 * 创建主窗口（收银界面）
 */
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.6),
    height,
    x: 0,
    y: 0,
    fullscreen: false,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Bubble Tea POS'
  })

  // 加载主界面
  if (isDev) {
    mainWindow.loadURL('http://localhost:6063')
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = getResourcePath('dist/index.html')
    console.log('[Electron] Loading index from:', indexPath)
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error('[Electron] Failed to load index:', err)
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (customerWindow) {
      customerWindow.close()
    }
  })

  // 监听页面加载错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('crashed', () => {
    console.error('[Electron] Renderer process crashed')
  })

  console.log('[Electron] Main window created')
}

/**
 * 创建副屏窗口（顾客展示）
 */
function createCustomerWindow() {
  const displays = screen.getAllDisplays()
  const externalDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0)

  const targetDisplay = externalDisplay || displays[0]
  const { width, height } = targetDisplay.bounds

  customerWindow = new BrowserWindow({
    width,
    height,
    x: externalDisplay ? targetDisplay.bounds.x : width,
    y: externalDisplay ? targetDisplay.bounds.y : 0,
    fullscreen: true,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Customer Display',
    alwaysOnTop: true
  })

  // 加载副屏界面
  if (isDev) {
    customerWindow.loadURL('http://localhost:6063/customer-display')
  } else {
    customerWindow.loadFile(getResourcePath('dist/index.html'), {
      hash: '/customer-display'
    }).catch((err) => {
      console.error('[Electron] Customer display load failed:', err)
    })
  }

  customerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Electron] Customer display failed to load:', errorCode, errorDescription)
  })

  customerWindow.webContents.on('crashed', () => {
    console.error('[Electron] Customer display renderer crashed')
  })

  customerWindow.on('closed', () => {
    customerWindow = null
  })

  console.log('[Electron] Customer window created')
}

// IPC 通信 - 订单状态同步到副屏
ipcMain.on('order-update', (_event, orderData) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('order-update', orderData)
  }
})

// IPC 通信 - API URL 配置（持久化到文件系统）
ipcMain.handle('get-api-url', () => {
  const fs = require('fs')
  const configPath = path.join(app.getPath('userData'), 'api-config.json')
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return data.apiUrl || '/api'
    }
  } catch (e) {}
  return '/api'
})

ipcMain.handle('set-api-url', (_event, url: string) => {
  const fs = require('fs')
  const configPath = path.join(app.getPath('userData'), 'api-config.json')
  try {
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: url }, null, 2))
    return true
  } catch (e) {
    console.error('[API URL] Failed to save:', e)
    return false
  }
})

ipcMain.on('order-clear', () => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('order-clear')
  }
})

ipcMain.on('order-complete', (_event, orderNumber) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('order-complete', orderNumber)
  }
})

/**
 * 打印小票 - Windows原生打印 或 网络打印
 */
ipcMain.on('print-receipt', async (_event, data) => {
  try {
    const text = generateReceiptText(data)
    console.log('[PRINT] Preparing to print receipt')

    // Windows 原生打印（使用 PowerShell，不需要网络或驱动）
    if (process.platform === 'win32') {
      try {
        await printViaWindows(text, data.printerName)
        console.log('[PRINT] Windows native print successful')
        return
      } catch (winError: any) {
        console.log('[PRINT] Windows native print failed:', winError.message)
      }
    }

    // 网络打印作为备选
    const printerHost = data.printerHost || process.env.PRINTER_HOST || '192.168.1.100'
    const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100')
    printViaNetwork(text, printerHost, printerPort)
  } catch (error) {
    console.error('[PRINT ERROR]', error)
  }
})

/**
 * Windows 原生打印（使用 PowerShell Out-Printer）
 * 不需要网络，不需要驱动，只需要打印机在 Windows 中已添加
 */
async function printViaWindows(text: string, printerName?: string): Promise<void> {
  const { exec } = require('child_process')
  const fs = require('fs')
  const path = require('path')
  const os = require('os')

  return new Promise((resolve, reject) => {
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`)

    // 使用 latin1 编码（ESC/POS 打印机常用）
    fs.writeFileSync(tempFile, text, { encoding: 'latin1' })

    let psCommand: string
    if (printerName) {
      // 发送到指定打印机
      psCommand = `Out-Printer -Name "${printerName}" -FilePath "${tempFile}"`
    } else {
      // 使用默认打印机
      psCommand = `Get-Content "${tempFile}" | Out-Printer`
    }

    exec(`powershell -Command "${psCommand}"`, (error: any) => {
      try {
        fs.unlinkSync(tempFile)
      } catch (e) {
        // 忽略删除错误
      }

      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

/**
 * 网络打印
 */
function printViaNetwork(text: string, host: string, port: number): void {
  const net = require('net')
  const client = new net.Socket()
  client.connect(port, host, () => {
    client.write(Buffer.from(text, 'latin1'))
    client.end()
    console.log('[PRINT] Network print sent to', host + ':' + port)
  })
  client.on('error', (err: any) => {
    console.error('[PRINT ERROR]', err.message)
  })
}

/**
 * 打开钱箱 - Windows原生 或 网络
 * 钱箱通常连接到打印机，命令发送到打印机
 */
ipcMain.on('open-cash-drawer', async (_event, data) => {
  try {
    console.log('[CASH DRAWER] Opening drawer')

    // Windows 原生打印钱箱命令
    if (process.platform === 'win32') {
      try {
        await openCashDrawerViaWindows(data.printerName)
        console.log('[CASH DRAWER] Windows native drawer opened')
        return
      } catch (winError: any) {
        console.log('[CASH DRAWER] Windows native failed:', winError.message)
      }
    }

    // 网络作为备选
    const printerHost = data?.printerHost || process.env.PRINTER_HOST || '192.168.1.100'
    const printerPort = data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100')
    openCashDrawerViaNetwork(printerHost, printerPort)
  } catch (error) {
    console.error('[CASH DRAWER ERROR]', error)
  }
})

/**
 * Windows 原生打开钱箱
 */
async function openCashDrawerViaWindows(printerName?: string): Promise<void> {
  const { exec } = require('child_process')
  const os = require('os')

  return new Promise((resolve, reject) => {
    // ESC/POS 钱箱弹出命令: ESC p 0 50 50
    // m=0(钱箱1), t1=50(100ms脉冲), t2=50(100ms间隔)
    const cashDrawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32])
    const tempFile = path.join(os.tmpdir(), `drawer_${Date.now()}.bin`)
    require('fs').writeFileSync(tempFile, cashDrawerCmd)

    // 使用默认打印机或指定打印机
    let psCommand: string
    if (printerName) {
      psCommand = `Out-Printer -Name "${printerName}" -FilePath "${tempFile}"`
    } else {
      psCommand = `Get-Content "${tempFile}" | Out-Printer`
    }

    exec(`powershell -Command "${psCommand}"`, (error: any) => {
      try {
        require('fs').unlinkSync(tempFile)
      } catch (e) {}
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

/**
 * 网络打开钱箱
 */
function openCashDrawerViaNetwork(host: string, port: number): void {
  const net = require('net')
  // ESC/POS 钱箱命令
  const cashDrawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32])
  const client = new net.Socket()
  client.connect(port, host, () => {
    client.write(cashDrawerCommand)
    client.end()
    console.log('[CASH DRAWER] Network drawer command sent to', host + ':' + port)
  })
  client.on('error', (err: any) => {
    console.error('[CASH DRAWER ERROR]', err.message)
  })
}

/**
 * 生成小票文本 (58mm打印机, 32字符宽)
 */
function generateReceiptText(data: any): string {
  const lines: string[] = []
  const width = 32

  if (data.header) {
    lines.push(centerText(data.header, width))
    lines.push(repeatChar('=', width))
  }

  lines.push(`No   : ${data.orderNum || ''}`)
  lines.push(`Tgl   : ${formatDateTime()}`)
  lines.push(repeatChar('-', width))
  lines.push('ITEM              QTY     HARGA')
  lines.push(repeatChar('-', width))

  if (data.items && data.items.length > 0) {
    data.items.forEach((item: any) => {
      const name = truncate(`${item.productName} ${item.specName}`, 16).padEnd(16)
      const qty = String(item.quantity).padStart(3)
      const price = formatRp(item.unitPrice * item.quantity).padStart(10)
      lines.push(`${name}${qty}${price}`)

      if (item.addons && item.addons.length > 0) {
        item.addons.forEach((addon: any) => {
          lines.push(`  + ${truncate(addon.name, 20)}`)
        })
      }

      if (item.sugarLevelName || item.iceLevelName) {
        const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
        lines.push(`  [${mods}]`)
      }
    })
  }

  lines.push(repeatChar('-', width))
  lines.push(`${'Subtotal:'.padEnd(20)}${formatRp(data.subtotal || 0).padStart(10)}`)
  lines.push(`${'Pajak:'.padEnd(20)}${formatRp(data.tax || 0).padStart(10)}`)
  if (data.discount && data.discount > 0) {
    lines.push(`${'Diskon:'.padEnd(20)}-${formatRp(data.discount).padStart(10)}`)
  }
  lines.push(repeatChar('-', width))
  lines.push(`${'TOTAL:'.padEnd(20)}${formatRp(data.total || 0).padStart(10)}`)

  if (data.paidAmount) {
    lines.push(repeatChar('-', width))
    lines.push(`${'Bayar:'.padEnd(20)}${formatRp(data.paidAmount).padStart(10)}`)
    lines.push(`${'Kembalian:'.padEnd(20)}${formatRp(data.change || 0).padStart(10)}`)
  }

  if (data.memberName) {
    lines.push(repeatChar('-', width))
    lines.push(`Member: ${data.memberName}`)
    if (data.pointsRedeemed && data.pointsRedeemed > 0) {
      lines.push(`Points: -${data.pointsRedeemed}`)
    }
  }

  lines.push('')
  if (data.footer) {
    lines.push(centerText(data.footer, width))
  }
  lines.push(centerText('=== TERIMA KASIH ===', width))

  return lines.join('\n') + '\n\n\n\n\n'
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(padding) + text
}

function repeatChar(char: string, count: number): string {
  return char.repeat(count)
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) : str
}

function formatRp(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

function formatDateTime(): string {
  const now = new Date()
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = now.getFullYear()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

// 应用启动
app.whenReady().then(() => {
  createMainWindow()
  createCustomerWindow()

  if (mainWindow) {
    setupUpdater(mainWindow)
    checkForUpdatesOnStart()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
    createCustomerWindow()
  }
})
