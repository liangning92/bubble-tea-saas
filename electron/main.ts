import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import { printReceipt, printReceiptRaw, openCashDrawerWindows, listPrinters, PrintReceiptData, printKitchenOrder, PrintKitchenData, generateReceiptFromTemplate, PrintReceiptFromTemplate } from './hardware.js'

// ============================================================================
// Constants
// ============================================================================

const isDev = !app.isPackaged
const API_PORT = 7072
const POS_PORT = 6063



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
        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
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
      // Try to copy from bundled seed (may be in asar or asar.unpacked)
      let bundledDb = path.join(getServerPath(), 'prisma', 'seed.db')

      // If not found, check asar.unpacked directory (for unpacked files)
      if (!fs.existsSync(bundledDb)) {
        const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'seed.db')
        if (fs.existsSync(unpackedPath)) {
          bundledDb = unpackedPath
        }
      }

      // Also check if we're running from asar and file exists there
      if (!fs.existsSync(bundledDb)) {
        const asarInternalPath = path.join(process.resourcesPath, 'app.asar', 'server', 'prisma', 'seed.db')
        if (fs.existsSync(asarInternalPath)) {
          bundledDb = asarInternalPath
        }
      }

      if (fs.existsSync(bundledDb)) {
        fs.copyFileSync(bundledDb, dbFile)
        log('[DB] Seed database copied from:', bundledDb)
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
      DATABASE_URL: `file:${dbPath}`,
      // Point to unpacked node_modules where @prisma/client resides
      NODE_PATH: path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    }

    log('[API] Starting server from:', serverPath)

    apiServerProcess = spawn('node', ['dist/index.js'], {
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
// IPC Handlers
// ============================================================================

function setupIpcHandlers() {
  // Print receipt (USB or network printer via Windows/macOS/Linux native API)
  ipcMain.handle('print-receipt', async (_event, data: PrintReceiptData | PrintReceiptFromTemplate) => {
    try {
      log('[PRINT] Receipt:', data.orderNum, 'Printer:', data.printerName || 'default')

      let result: { success: boolean; error?: string }
      if ('blocks' in data && 'data' in data) {
        // Template-based format
        log('[PRINT] Using template-based receipt generation')
        const buffer = generateReceiptFromTemplate(data as PrintReceiptFromTemplate)
        result = await printReceiptRaw(buffer, data.printerName)
      } else {
        // Legacy flat format
        result = await printReceipt(data as PrintReceiptData)
      }

      if (result.success) {
        log('[PRINT] Success')
      } else {
        logError('[PRINT] Failed:', result.error)
      }
      return result
    } catch (err: any) {
      logError('[PRINT] Exception:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Print kitchen order
  ipcMain.handle('print-kitchen', async (_event, data: PrintKitchenData) => {
    try {
      log('[KITCHEN] Order:', data.orderNum, 'Printer:', data.printerName || 'default')
      const result = await printKitchenOrder(data)
      if (result.success) {
        log('[KITCHEN] Success')
      } else {
        logError('[KITCHEN] Failed:', result.error)
      }
      return result
    } catch (err: any) {
      logError('[KITCHEN] Exception:', err.message)
      return { success: false, error: err.message }
    }
  })

  // Open cash drawer (USB connected via printer)
  ipcMain.handle('open-cash-drawer', async (_event, data: { printerName?: string }) => {
    try {
      const printerName = data.printerName || 'XPrinter'
      log('[CASH_DRAWER] Opening via:', printerName)
      const result = await openCashDrawerWindows(printerName)
      if (result.success) {
        log('[CASH_DRAWER] Success')
      } else {
        logError('[CASH_DRAWER] Failed:', result.error)
      }
      return result
    } catch (err: any) {
      logError('[CASH_DRAWER] Exception:', err.message)
      return { success: false, error: err.message }
    }
  })

  // List available printers
  ipcMain.handle('list-printers', async () => {
    try {
      const printers = await listPrinters()
      log('[PRINTER] Found:', printers.join(', '))
      return { printers }
    } catch (err: any) {
      logError('[PRINTER] List failed:', err.message)
      return { printers: [] }
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
