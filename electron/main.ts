import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import net from 'net'
import http from 'http'

// ============================================================================
// Types
// ============================================================================

interface PrintReceiptData {
  orderNum: string
  header: string
  footer: string
  printerHost: string
  printerPort: number
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
// Constants
// ============================================================================

const isDev = !app.isPackaged
const API_PORT = 7072
const POS_PORT = 6063

// ESC/POS Commands
const ESC = '\x1B'
const ESC_P = '\x1B\x70'  // Cash drawer kick
const CUT = '\x1B\x6D'     // Full cut
const PARTIAL_CUT = '\x1B\x6D' // Partial cut
const ALIGN_CENTER = '\x1B\x61\x31'
const ALIGN_LEFT = '\x1B\x61\x30'
const BOLD_ON = '\x1B\x45\x31'
const BOLD_OFF = '\x1B\x45\x30'
const DOUBLE_SIZE = '\x1B\x21\x30'
const NORMAL_SIZE = '\x1B\x21\x00'
const LINE_FEED = '\n'

// ============================================================================
// Global State
// ============================================================================

let mainWindow: BrowserWindow | null = null
let apiServerProcess: ChildProcess | null = null

// ============================================================================
// Paths
// ============================================================================

function getResourcePath(relative: string): string {
  if (isDev) {
    return path.join(__dirname, '..', relative)
  }
  return path.join(process.resourcesPath, relative)
}

function getServerPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'server')
  }
  return path.join(process.resourcesPath, 'server')
}

function getPosBuildPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'client-pos', 'dist')
  }
  return path.join(process.resourcesPath, 'client-pos')
}

// ============================================================================
// Logging
// ============================================================================

function log(...args: any[]) {
  const ts = new Date().toISOString().substring(11, 19)
  console.log(`[${ts}]`, ...args)
}

function logError(...args: any[]) {
  const ts = new Date().toISOString().substring(11, 19)
  console.error(`[${ts}] ERROR:`, ...args)
}

// ============================================================================
// API Server Management
// ============================================================================

async function waitForServer(port: number, timeout = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          resolve()
        })
        req.on('error', reject as () => void)
        req.setTimeout(1000, () => {
          req.destroy()
          reject(new Error('timeout'))
        })
      })
      return true
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return false
}

async function initDatabase(): Promise<void> {
  const dbPath = path.join(app.getPath('userData'), 'data')
  const dbFile = path.join(dbPath, 'dev.db')

  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true })
  }

  // Check if database exists
  if (!fs.existsSync(dbFile)) {
    log('[DB] First run - copying seed database...')
    try {
      // Try to copy from bundled seed, or initialize via Prisma
      const bundledDb = path.join(getServerPath(), 'prisma', 'seed.db')
      if (fs.existsSync(bundledDb)) {
        fs.copyFileSync(bundledDb, dbFile)
        log('[DB] Seed database copied successfully')
      } else {
        // Run prisma db push to create tables
        log('[DB] Running Prisma db push...')
        const result = spawn('npx', ['prisma', 'db', 'push', '--skip-generate'], {
          cwd: getServerPath(),
          env: {
            ...process.env,
            DATABASE_URL: `file:${dbFile}`
          },
          stdio: 'pipe'
        })

        let output = ''
        result.stdout?.on('data', (d: Buffer) => { output += d.toString() })
        result.stderr?.on('data', (d: Buffer) => { output += d.toString() })

        const code = await new Promise<number>((resolve) => {
          result.on('close', resolve)
        })

        if (code === 0) {
          log('[DB] Database initialized successfully')
        } else {
          logError('[DB] Database init output:', output.substring(0, 200))
          // Create empty database file anyway
          fs.writeFileSync(dbFile, '')
        }
      }
    } catch (err: any) {
      logError('[DB] Database init error:', err.message)
      // Create empty file to prevent repeated attempts
      fs.writeFileSync(dbFile, '')
    }
  } else {
    log('[DB] Database already exists at:', dbFile)
  }
}

function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = getServerPath()
    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'data', 'dev.db')

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(API_PORT),
      // Use app data directory for database
      DATABASE_URL: `file:${dbPath}`
    }

    log('[API] Starting server from:', serverPath)

    apiServerProcess = spawn('node', ['src/index.js'], {
      cwd: serverPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    apiServerProcess.stdout?.on('data', (d: Buffer) => {
      process.stdout.write(`[API] ${d.toString()}`)
    })

    apiServerProcess.stderr?.on('data', (d: Buffer) => {
      process.stderr.write(`[API ERR] ${d.toString()}`)
    })

    apiServerProcess.on('error', (err) => {
      logError('[API] Failed to start:', err.message)
      reject(err)
    })

    apiServerProcess.on('exit', (code) => {
      if (code !== 0) {
        logError('[API] Exited with code:', code)
      }
    })

    // Wait for server to be ready
    waitForServer(API_PORT)
      .then((ok) => {
        if (ok) {
          log('[API] Server ready on port', API_PORT)
          resolve()
        } else {
          reject(new Error('Server failed to start'))
        }
      })
      .catch(reject)
  })
}

function stopApiServer() {
  if (apiServerProcess) {
    apiServerProcess.kill()
    apiServerProcess = null
  }
}

// ============================================================================
// ESC/POS Hardware Communication
// ============================================================================

function sendToPrinter(host: string, port: number, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    
    socket.setTimeout(5000)

    socket.connect(port, host, () => {
      socket.write(Buffer.from(data, 'utf8'), () => {
        socket.end()
        resolve()
      })
    })

    socket.on('error', (err) => {
      logError('[PRINTER] Connection error:', err.message)
      reject(err)
    })

    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Printer connection timeout'))
    })
  })
}

function openCashDrawer(host: string, port: number): Promise<void> {
  // ESC p m t1 t2 - Cash drawer kick
  // m=0 (pin 2), t1=25 (pulse 25*2ms=50ms), t2=25 (2nd pulse)
  const command = `${ESC_P}\x00\x19\x1E`
  return sendToPrinter(host, port, command)
}

// ============================================================================
// Receipt Generation (ESC/POS)
// ============================================================================

function formatCurrency(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

function generateReceipt(data: PrintReceiptData): string {
  const lines: string[] = []
  const now = data.orderDate || new Date().toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

  // Header
  lines.push(ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON + data.header + NORMAL_SIZE + BOLD_OFF)
  lines.push(ALIGN_CENTER + '--------------------------------')
  lines.push(ALIGN_LEFT + `No: ${data.orderNum}`)
  lines.push(ALIGN_LEFT + `Kasir: ${data.cashierName || '-'}`)
  lines.push(ALIGN_LEFT + now)
  if (data.customerName) {
    lines.push(ALIGN_LEFT + `Pelanggan: ${data.customerName}`)
  }
  lines.push(ALIGN_CENTER + '--------------------------------')

  // Items
  for (const item of data.items) {
    const itemTotal = item.unitPrice * item.quantity
    lines.push(ALIGN_LEFT + `${item.productName}`)
    if (item.specName) {
      lines.push(ALIGN_LEFT + `   ${item.specName}`)
    }
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        lines.push(ALIGN_LEFT + `   + ${addon.name}`)
      }
    }
    lines.push(ALIGN_LEFT + `   ${item.quantity} x ${formatCurrency(item.unitPrice)}`)
    lines.push(ALIGN_LEFT + `${''.padEnd(22)}${formatCurrency(itemTotal)}`)
  }

  lines.push(ALIGN_CENTER + '--------------------------------')

  // Totals
  const subtotalLine = `${'Subtotal:'.padEnd(24)}${formatCurrency(data.subtotal)}`
  lines.push(ALIGN_LEFT + subtotalLine)
  
  if (data.tax > 0) {
    const taxLine = `${'PPN (11%):'.padEnd(24)}${formatCurrency(data.tax)}`
    lines.push(ALIGN_LEFT + taxLine)
  }

  const totalLine = `${'TOTAL:'.padEnd(24)}${BOLD_ON + formatCurrency(data.total) + BOLD_OFF}`
  lines.push(ALIGN_LEFT + totalLine)
  lines.push('')

  // Payment
  if (data.paymentMethod) {
    lines.push(ALIGN_LEFT + `${'Metode Bayar:'.padEnd(24)}${data.paymentMethod}`)
  }
  if (data.paymentReceived && data.paymentReceived > 0) {
    lines.push(ALIGN_LEFT + `${'Bayar:'.padEnd(24)}${formatCurrency(data.paymentReceived)}`)
    if (data.change !== undefined) {
      lines.push(ALIGN_LEFT + BOLD_ON + `${'Kembalian:'.padEnd(24)}${formatCurrency(data.change)}` + BOLD_OFF)
    }
  }

  lines.push(ALIGN_CENTER + '--------------------------------')
  lines.push(ALIGN_CENTER + NORMAL_SIZE + data.footer)
  lines.push('')
  lines.push('')

  return lines.join(LINE_FEED)
}

// ============================================================================
// IPC Handlers
// ============================================================================

function setupIpcHandlers() {
  // Print receipt
  ipcMain.handle('print-receipt', async (_event, data: PrintReceiptData) => {
    try {
      log('[PRINT] Receipt:', data.orderNum)
      const receipt = generateReceipt(data)
      await sendToPrinter(data.printerHost, data.printerPort, receipt)
      log('[PRINT] Success:', data.printerHost)
      return { success: true }
    } catch (err: any) {
      logError('[PRINT] Failed:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Open cash drawer
  ipcMain.handle('open-cash-drawer', async (_event, data: { printerHost?: string; printerPort?: number }) => {
    try {
      const host = data.printerHost || '192.168.1.100'
      const port = data.printerPort || 9100
      log('[CASH_DRAWER] Opening:', host, port)
      await openCashDrawer(host, port)
      log('[CASH_DRAWER] Success')
      return { success: true }
    } catch (err: any) {
      logError('[CASH_DRAWER] Failed:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Set API URL (persisted to file)
  ipcMain.handle('set-api-url', async (_event, url: string) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'api-url.json')
      fs.writeFileSync(configPath, JSON.stringify({ url }), 'utf8')
      log('[CONFIG] API URL saved:', url)
      return { success: true }
    } catch (err: any) {
      logError('[CONFIG] Failed to save API URL:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Get API URL
  ipcMain.handle('get-api-url', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'api-url.json')
      if (fs.existsSync(configPath)) {
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'))
        return { url: data.url }
      }
    } catch {}
    return { url: '/api' }
  })

  // App version
  ipcMain.handle('get-app-version', async () => {
    return app.getVersion()
  })

  // Update handlers (stub - real implementation would use electron-updater)
  ipcMain.handle('check-for-updates', async () => {
    return { updateAvailable: false }
  })

  ipcMain.handle('download-update', async () => {})
  ipcMain.handle('install-update', async () => {
    app.quit()
  })

  ipcMain.on('update-status', () => {})
  ipcMain.on('update-progress', () => {})
  ipcMain.on('update-error', () => {})

  log('[IPC] Handlers registered')
}

// ============================================================================
// Window Management
// ============================================================================

async function createWindow() {
  const posBuildPath = getPosBuildPath()
  
  // In production, serve from built files
  const indexPath = isDev
    ? 'http://localhost:6063'
    : `file://${path.join(posBuildPath, 'index.html')}`

  log('[WINDOW] Creating with index:', indexPath)
  log('[WINDOW] Dev mode:', isDev)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Bubble Tea POS',
    icon: path.join(__dirname, '..', 'shared', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true,
    fullscreen: false,
    resizable: true
  })

  // Remove menu bar
  mainWindow.setMenu(null)

  if (isDev) {
    // In dev, load from Vite dev server
    await mainWindow.loadURL('http://localhost:6063')
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from built files
    await mainWindow.loadFile(path.join(posBuildPath, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  log('[WINDOW] Ready')
}

// ============================================================================
// App Lifecycle
// ============================================================================

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    log('[APP] Starting...')
    log('[APP] User data:', app.getPath('userData'))
    log('[APP] Version:', app.getVersion())

    // Ensure data directory exists
    const dataDir = path.join(app.getPath('userData'), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Initialize database (create tables if needed)
    await initDatabase()

    // Start API server first
    try {
      await startApiServer()
    } catch (err) {
      logError('[APP] API server failed, continuing anyway')
    }

    // Setup IPC then create window
    setupIpcHandlers()
    await createWindow()
  })

  app.on('window-all-closed', () => {
    stopApiServer()
    app.quit()
  })

  app.on('before-quit', () => {
    stopApiServer()
  })
}
