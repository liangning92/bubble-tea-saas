import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import os from 'os'
import { printReceipt, printReceiptRaw, openCashDrawerWindows, listPrinters, PrintReceiptData, printKitchenOrder, PrintKitchenData, generateReceiptFromTemplate, PrintReceiptFromTemplate } from './hardware.js'

// Electron auto-updater for online updates
let autoUpdater: any = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch (e) {
  log('[UPDATER] electron-updater not available, auto-update disabled')
}

// ============================================================================
// Constants - MUST be defined early for logging
// ============================================================================
const isDev = !app.isPackaged

// ============================================================================
// HIGH DPI FIX: Enable per-monitor-v2 DPI awareness for sharp text
// ============================================================================
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('dpi-awareness', 'per-monitor-v2')
  if (isDev) console.log('[DPI] Per-monitor-v2 DPI awareness enabled')
}

// ============================================================================
// DEBUG: Module load marker
// ============================================================================
if (isDev) console.log('[MAIN] Module starting, isDev:', isDev)

// ============================================================================
// Global Error Handlers - MUST be at the top
// ============================================================================

// Get crash log directory - use safe fallback before app is ready
function getCrashLogPath(): string {
  const logName = `crash-${Date.now()}.log`
  try {
    if (app.isReady()) {
      return path.join(app.getPath('userData'), 'logs', logName)
    }
  } catch {}
  // Fallback to temp directory before app is ready
  // Use os.tmpdir() for cross-platform compatibility
  const tmpDir = os.tmpdir()
  const logDir = path.join(tmpDir, 'bubble-tea-pos-logs')
  return path.join(logDir, logName)
}

// Catch unhandled exceptions
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error.message)
  console.error('[FATAL] Stack:', error.stack)
  try {
    const crashLog = getCrashLogPath()
    const logDir = path.dirname(crashLog)
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    fs.writeFileSync(crashLog, `[FATAL] ${new Date().toISOString()}\n${error.message}\n${error.stack}\n`)
  } catch (e) {}
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason)
  try {
    const crashLog = getCrashLogPath()
    const logDir = path.dirname(crashLog)
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
    fs.writeFileSync(crashLog, `[FATAL] ${new Date().toISOString()}\nUnhandled rejection: ${reason}\n`)
  } catch (e) {}
})

// ============================================================================
// Constants
// ============================================================================

const API_PORT = 7072
const POS_PORT = 6063

// ============================================================================
// Handle command line arguments (for debugging)
// ============================================================================

const args = process.argv.slice(2)
if (args.includes('--disable-gpu')) {
  app.disableHardwareAcceleration()
  if (isDev) console.log('[ARGS] GPU disabled')
}
if (args.includes('--no-sandbox')) {
  app.commandLine.appendSwitch('no-sandbox')
  if (isDev) console.log('[ARGS] Sandbox disabled')
}
if (args.includes('--enable-logging')) {
  app.commandLine.appendSwitch('enable-logging')
  if (isDev) console.log('[ARGS] Logging enabled')
}



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
  // In production, use app.asar path
  return path.join(app.getAppPath(), relative)
}

function getServerPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'server')
  }
  // In production, app is inside app.asar
  return path.join(app.getAppPath(), 'server')
}

function getPosBuildPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', 'client-pos', 'dist')
  }
  // In production, client-pos/dist is inside app.asar
  return path.join(app.getAppPath(), 'client-pos', 'dist')
}

// ============================================================================
// Logging
// ============================================================================

function getLogPath(): string {
  return path.join(app.getPath('userData'), 'logs', `pos-${new Date().toISOString().split('T')[0]}.log`)
}

function ensureLogDir() {
  const logDir = path.join(app.getPath('userData'), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

function log(...args: any[]) {
  const ts = new Date().toISOString().substring(11, 19)
  const msg = `[${ts}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
  console.log(msg)
  try {
    ensureLogDir()
    fs.appendFileSync(getLogPath(), msg + '\n')
  } catch {}
}

function logError(...args: any[]) {
  const ts = new Date().toISOString().substring(11, 19)
  const msg = `[${ts}] ERROR: ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`
  console.error(msg)
  try {
    ensureLogDir()
    fs.appendFileSync(getLogPath(), msg + '\n')
  } catch {}
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
      // Seed database is in server/prisma/seed.db inside asar
      const bundledDb = path.join(getServerPath(), 'prisma', 'seed.db')

      if (fs.existsSync(bundledDb)) {
        fs.copyFileSync(bundledDb, dbFile)
        log('[DB] Seed database copied from:', bundledDb)
      } else {
        logError('[DB] Seed database not found at:', bundledDb)
        // Create empty file to prevent repeated attempts
        fs.writeFileSync(dbFile, '')
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

// Extract server from asar to temp directory for execution
function extractServerFromAsar(): string {
  const serverSrc = getServerPath() // app.asar/server
  const serverUnpackedSrc = path.join(process.resourcesPath, 'app.asar.unpacked', 'server')
  const serverDest = path.join(os.tmpdir(), 'bubble-tea-pos-server')

  // Check if already extracted
  if (fs.existsSync(path.join(serverDest, 'dist', 'index.js'))) {
    log('[API] Using existing extracted server at:', serverDest)
    return serverDest
  }

  log('[API] Extracting server from asar to:', serverDest)

  // Remove existing directory if present
  if (fs.existsSync(serverDest)) {
    fs.rmSync(serverDest, { recursive: true })
  }

  // Copy server from asar to temp directory (with error handling)
  function copyDir(src: string, dest: string): boolean {
    try {
      if (!fs.existsSync(src)) {
        logError('[API] Source does not exist:', src)
        return false
      }
      fs.mkdirSync(dest, { recursive: true })
      const entries = fs.readdirSync(src, { withFileTypes: true })
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        try {
          if (entry.isDirectory()) {
            copyDir(srcPath, destPath)
          } else {
            fs.copyFileSync(srcPath, destPath)
          }
        } catch (err: any) {
          logError('[API] Failed to copy:', srcPath, err.message)
        }
      }
      return true
    } catch (err: any) {
      logError('[API] copyDir failed:', src, err.message)
      return false
    }
  }

  // Copy main server files from asar
  if (!copyDir(serverSrc, serverDest)) {
    logError('[API] Failed to extract server from:', serverSrc)
    throw new Error('Server extraction failed - source not found')
  }

  // Copy unpacked node_modules (which contains .prisma and @prisma/client)
  if (fs.existsSync(serverUnpackedSrc)) {
    log('[API] Copying unpacked modules from:', serverUnpackedSrc)
    if (!copyDir(serverUnpackedSrc, serverDest)) {
      logError('[API] Failed to copy unpacked modules')
    }
  }

  // Copy ALL root node_modules (hoisted dependencies like express, cors, bcryptjs, etc.)
  // server/node_modules only has non-hoisted packages, but npm workspaces hoists most to root
  const rootModulesSrc = path.join(app.getAppPath(), 'node_modules')
  const destModulesDest = path.join(serverDest, 'node_modules')
  if (fs.existsSync(rootModulesSrc)) {
    log('[API] Copying all root node_modules to server directory')
    if (!copyDir(rootModulesSrc, destModulesDest)) {
      logError('[API] Failed to copy root node_modules')
    }
  }

  // Fix npm workspaces path issue: .prisma is hoisted to root but @prisma/client expects it inside
  // Copy node_modules/.prisma to node_modules/@prisma/client/.prisma
  const srcPrismaClient = path.join(destModulesDest, '@prisma', 'client')
  const destPrismaInClient = path.join(srcPrismaClient, '.prisma')
  if (fs.existsSync(path.join(destModulesDest, '.prisma', 'client'))) {
    log('[API] Fixing .prisma path for @prisma/client compatibility')
    fs.mkdirSync(path.join(srcPrismaClient, '.prisma'), { recursive: true })
    if (!copyDir(path.join(destModulesDest, '.prisma', 'client'), destPrismaInClient)) {
      logError('[API] Failed to copy .prisma to @prisma/client')
    }
  }

  log('[API] Server extracted successfully')
  return serverDest
}

function startApiServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[API] Starting server extraction...')
    let serverPath: string
    try {
      serverPath = extractServerFromAsar()
      console.log('[API] Server extraction returned:', serverPath)
    } catch (err) {
      console.error('[API] extractServerFromAsar FAILED:', err)
      reject(err)
      return
    }
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

    // In packaged Electron app, add app directory to PATH so node can be found
    const fullEnv = {
      ...env,
      PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}`
    }

    apiServerProcess = spawn('node', ['dist/index.js'], {
      cwd: serverPath,
      env: fullEnv,
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

  // Auto-updater handlers (electron-updater integration)
  if (autoUpdater && !isDev) {
    autoUpdater.autoUpdater.autoDownload = false

    autoUpdater.on('checking-for-update', () => {
      log('[UPDATER] Checking for updates...')
    })

    autoUpdater.on('update-available', (info: any) => {
      log('[UPDATER] Update available:', info.version)
      mainWindow?.webContents.send('update-status', 'available', info)
    })

    autoUpdater.on('update-not-available', (info: any) => {
      log('[UPDATER] No update available, current:', info.version)
      mainWindow?.webContents.send('update-status', 'up-to-date', info)
    })

    autoUpdater.on('download-progress', (progress: any) => {
      mainWindow?.webContents.send('update-progress', progress.percent)
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      log('[UPDATER] Update downloaded:', info.version)
      mainWindow?.webContents.send('update-status', 'downloaded', info)
    })

    autoUpdater.on('error', (err: any) => {
      logError('[UPDATER] Error:', err.message)
      mainWindow?.webContents.send('update-error', err.message)
    })

    ipcMain.handle('check-for-updates', async () => {
      try {
        const result = await autoUpdater.checkForUpdates()
        return { updateAvailable: !!result?.updateInfo }
      } catch (err: any) {
        logError('[UPDATER] Check failed:', err.message)
        return { updateAvailable: false, error: err.message }
      }
    })

    ipcMain.handle('download-update', async () => {
      try {
        autoUpdater.downloadUpdate()
        return { success: true }
      } catch (err: any) {
        logError('[UPDATER] Download failed:', err.message)
        return { success: false, error: err.message }
      }
    })

    ipcMain.handle('install-update', async () => {
      autoUpdater.quitAndInstall()
    })
  } else {
    // Dev mode or no auto-updater - stub handlers
    ipcMain.handle('check-for-updates', async () => {
      return { updateAvailable: false }
    })
    ipcMain.handle('download-update', async () => {
      return { success: false, error: 'Auto-update not available in dev mode' }
    })
    ipcMain.handle('install-update', async () => {
      app.quit()
    })
  }

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

  // Get screen info for proper DPI handling
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
  const scaleFactor = primaryDisplay.scaleFactor

  log('[WINDOW] Screen work area:', screenWidth, 'x', screenHeight)
  log('[WINDOW] Scale factor:', scaleFactor)

  // POS window size - use base resolution
  // BrowserWindow uses DIP, Chromium will handle DPI scaling
  // This should render at native resolution without blur IF system DPI is set correctly
  const windowWidth = 1024
  const windowHeight = 768

  log('[WINDOW] Window size:', windowWidth, 'x', windowHeight)

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    title: 'Bubble Tea POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Only disable webSecurity in dev mode for local file loading
      webSecurity: isDev ? false : true,
    },
    autoHideMenuBar: true,
    fullscreen: false,
    resizable: false,
  })

  // Center window on screen
  mainWindow.center()

  // Remove menu bar
  mainWindow.setMenu(null)

  if (isDev) {
    // In dev, load from Vite dev server
    await mainWindow.loadURL('http://localhost:6063')
    mainWindow.webContents.openDevTools()
  } else {
    // In production, load from built files
    const indexPath = path.join(posBuildPath, 'index.html')
    log('[WINDOW] Loading index from:', indexPath)
    log('[WINDOW] File exists:', fs.existsSync(indexPath))

    try {
      await mainWindow.loadFile(indexPath)
      log('[WINDOW] loadFile succeeded')
    } catch (err: any) {
      logError('[WINDOW] loadFile failed:', err.message)
      // Show error page with details
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bubble Tea POS - Load Error</title>
  <style>
    body { background: #1a1a1a; color: #eee; font-family: 'Consolas', monospace; padding: 40px; margin: 0; }
    h2 { color: #ff6b6b; margin: 0 0 20px 0; }
    .error { background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 10px 0; }
    .label { color: #888; display: inline-block; width: 100px; }
    .value { color: #4ecdc4; }
    pre { background: #000; padding: 15px; border-radius: 4px; overflow-x: auto; margin: 10px 0; }
  </style>
</head>
<body>
  <h2>❌ Bubble Tea POS - Load Error</h2>
  <div class="error">
    <div><span class="label">Path:</span><span class="value">${indexPath.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
    <div><span class="label">Exists:</span><span class="value">${fs.existsSync(indexPath)}</span></div>
    <div><span class="label">Error:</span><span class="value">${err.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></div>
  </div>
  <div class="error">
    <h3>Possible causes:</h3>
    <ul>
      <li>Missing or corrupted installation</li>
      <li>Antivirus blocking file access</li>
      <li>Installation in read-only directory</li>
    </ul>
  </div>
  <div class="error">
    <h3>Try:</h3>
    <ul>
      <li>Run as Administrator</li>
      <li>Reinstall the application</li>
      <li>Check Windows Event Viewer for errors</li>
    </ul>
  </div>
</body>
</html>`
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`)
    }
  }

  // Allow opening DevTools with F12 in production (for debugging)
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Log page errors
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logError('[WINDOW] Renderer process gone:', details.reason)
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    logError('[WINDOW] Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) { // Error level
      logError('[CONSOLE ERROR]', message, 'at', sourceId, 'line', line)
    }
  })

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
    log('[APP] ====================')
    log('[APP] Starting...')
    log('[APP] isDev:', isDev)
    log('[APP] User data:', app.getPath('userData'))
    log('[APP] Version:', app.getVersion())
    log('[APP] App path:', app.getAppPath())
    log('[APP] ====================')

    // Ensure data directory exists
    const dataDir = path.join(app.getPath('userData'), 'data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Initialize database (create tables if needed)
    try {
      await initDatabase()
    } catch (err) {
      logError('[APP] Database init failed:', err)
      // Continue anyway - app can still run without database
    }

    // Start API server first
    try {
      await startApiServer()
    } catch (err) {
      logError('[APP] API server failed, continuing anyway')
    }

    // Setup IPC then create window
    setupIpcHandlers()
    try {
      await createWindow()
    } catch (err) {
      logError('[APP] Create window failed:', err)
      // Show error and exit
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[FATAL] Failed to create window:', errorMsg)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    stopApiServer()
    app.quit()
  })

  app.on('before-quit', () => {
    stopApiServer()
  })
}
