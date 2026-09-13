import { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog } from 'electron'
import path from 'path'
import { setupUpdater, checkForUpdatesOnStart } from './updater'
import fs from 'fs'
import { exec as execChild, fork, spawn } from 'child_process'
import net from 'net'
import log from 'electron-log/main'

// 必须在 electron-log 初始化之前堵住 stdout/stderr
// asar 打包后 Electron 主进程没有控制台，process.stdout/stderr 是无效流
// electron-log 内部和所有 console.* 调用都会触发 EPIPE
process.stdout.write = () => false
process.stderr.write = () => false

// 初始化 electron-log（文件日志）
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = false // 禁用 console transport
log.transports.file.maxSize = 5 * 1024 * 1024

// crash 日志直接写文件，不经过 electron-log（避免 EPIPE）
const crashLogFile = path.join(app.getPath('userData'), 'logs', 'crash.log')
function writeCrash(msg: string) {
  try {
    fs.appendFileSync(crashLogFile, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

process.on('uncaughtException', (error) => {
  writeCrash(`[FATAL] Uncaught exception: ${error.stack || error.message}`)
  setTimeout(() => process.exit(1), 1000)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error
    ? `[FATAL] Unhandled rejection: ${reason.stack || reason.message}`
    : `[FATAL] Unhandled rejection: ${String(reason)}`
  writeCrash(msg)
  setTimeout(() => process.exit(1), 1000)
})

// Odoo-style thermal printer support
let ThermalPrinter: any = null
let ElectronPrinter: any = null
try {
  ThermalPrinter = require('node-thermal-printer')
  ElectronPrinter = require('electron-printer')
} catch (e: any) {
  // 打印机模块不可用，忽略
}

// 检测 WebView2 是否可用（Windows only）
function checkWebView2(): boolean {
  if (process.platform !== 'win32') return true
  try {
    const regKey = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    const { execSync } = require('child_process')
    const result = execSync(
      `reg query "${regKey}" /v pv 2>nul`,
      { encoding: 'utf8', timeout: 5000 }
    )
    const match = result.match(/pv\s+REG_SZ\s+(\d+\.\d+\.\d+)/)
    if (match) return true
    return false
  } catch {
    return false
  }
}

// 获取日志文件路径
function getLogPath(): string {
  return path.join(app.getPath('userData'), 'logs', 'main.log')
}

// 获取日志目录路径
function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

// 显示错误信息页面（同步版本，不依赖窗口加载）
function showErrorPageSync(title: string, message: string, details?: string): void {
  const logPath = getLogPath()
  const logDir = getLogDir()
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; color: #333; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
    .container { width: 100%; max-width: 900px; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h2 { color: #d32f2f; margin-top: 0; font-size: 24px; }
    .message { font-size: 18px; line-height: 1.6; margin: 20px 0; }
    .details { background: #f9f9f9; padding: 20px; border-radius: 4px; margin-top: 20px; font-size: 14px; word-break: break-word; white-space: pre-wrap; overflow-x: auto; max-height: 400px; overflow-y: auto; }
    .log-path { background: #fff3e0; padding: 15px 20px; border-radius: 4px; margin-top: 15px; font-size: 14px; word-break: break-all; font-family: monospace; }
    .btn { background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; margin-right: 10px; font-size: 14px; }
    .btn:hover { background: #1565c0; }
    .btn-log { background: #388e3c; }
    .btn-log:hover { background: #2e7d32; }
  </style>
</head>
<body>
  <div class="container">
    <h2>⚠️ ${title}</h2>
    <p class="message">${message}</p>
    ${details ? `<div class="details"><strong>详细信息：</strong><br>${details}</div>` : ''}
    <div class="log-path"><strong>📋 日志文件位置：</strong><br>${logPath}</div>
    <button class="btn btn-log" onclick="require('electron').shell.openPath('${logDir.replace(/\\/g, '\\\\')}')">📂 打开日志文件夹</button>
    <button class="btn" onclick="window.close()">关闭程序</button>
  </div>
</body>
</html>`
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
  }
}

// Windows DPI awareness - 修复高分屏字体模糊
if (process.platform === 'win32') {
  try {
    app.commandLine.appendSwitch('high-dpi-config', '1.0')
    app.commandLine.appendSwitch('force-device-scale-factor', '1')
  } catch (e) {}
}

if (process.env.ELECTRON_DISABLE_GPU !== '1') {
  // 不禁用硬件加速
}

// 窗口引用
let mainWindow: BrowserWindow | null = null
let customerWindow: BrowserWindow | null = null

// 本地 Express 服务器进程（用于打包后的桌面版本）
let serverProcess: ReturnType<typeof fork> | null = null

function getServerEntryPath(): string {
  const isAsar = app.getAppPath().endsWith('.asar')
  if (isAsar) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js')
  } else {
    return path.join(process.resourcesPath, 'server', 'dist', 'index.js')
  }
}

function getSeedTemplatePath(): string {
  if (app.isPackaged) {
    const asarPath = path.join(app.getAppPath(), 'server', 'prisma', 'seed.db')
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'seed.db')
    return fs.existsSync(asarPath) ? asarPath : (fs.existsSync(unpackedPath) ? unpackedPath : asarPath)
  } else {
    return path.join(process.resourcesPath, 'server', 'prisma', 'seed.db')
  }
}

function getPrismaSchemaPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'schema.prisma')
  } else {
    return path.join(process.resourcesPath, 'server', 'prisma', 'schema.prisma')
  }
}

// Prisma db push 的 Promise 封装
function runPrismaPush(userDbPath: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let nodeBin = process.execPath
    if (process.platform === 'win32') {
      const electronDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules', 'electron', 'dist')
      const electronNodeExe = path.join(electronDir, 'node.exe')
      if (fs.existsSync(electronNodeExe)) nodeBin = electronNodeExe
    }
    const serverModulesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules')
      : path.join(process.resourcesPath, 'server', 'node_modules')
    const prismaCliPath = path.join(serverModulesPath, 'prisma', 'build', 'index.js')
    const schemaPath = getPrismaSchemaPath()

    if (!fs.existsSync(prismaCliPath) || !fs.existsSync(schemaPath)) {
      resolve({ code: -1, stderr: 'CLI or schema not found' })
      return
    }

    let exited = false
    let stderrData = ''
    const child = spawn(nodeBin, [prismaCliPath, 'db', 'push', '--accept-data-loss', '--schema', schemaPath], {
      env: { ...process.env, DATABASE_URL: `file:${userDbPath}`, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe']
    })
    child.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString()
      stderrData += msg
      writeCrash(`[Prisma stderr] ${msg.trim()}`)
    })
    child.on('close', (code: number | null) => {
      if (!exited) { exited = true; resolve({ code, stderr: stderrData }) }
    })
    child.on('error', (err: Error) => {
      if (!exited) { exited = true; resolve({ code: -1, stderr: err.message }) }
    })
    setTimeout(() => {
      if (!exited) { child.kill(); exited = true; resolve({ code: null, stderr: 'timeout' }) }
    }, 60000)
  })
}

async function ensureSchemaUpToDate(userDbPath: string): Promise<void> {
  const result = await runPrismaPush(userDbPath)
  if (result.code === 0 || result.stderr.includes('Your database is now in sync')) {
    writeCrash('[Schema] db push succeeded')
  } else if (result.code === null) {
    writeCrash('[Schema] db push timed out')
  } else {
    writeCrash(`[Schema] db push FAILED code=${result.code} stderr=${result.stderr.slice(-300)}`)
  }
}

async function startLocalServer(): Promise<void> {
  if (!app.isPackaged) {
    return
  }

  // 清理残留进程
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :7072 | findstr LISTENING`, { encoding: 'utf8', windowsHide: true })
      const lines = result.trim().split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const localAddr = parts[1] || ''
        if (!localAddr.includes(':7072')) continue
        const pid = parts[parts.length - 1]
        if (!pid || pid === '0') continue
        try { execSync(`taskkill /F /PID ${pid}`, { windowsHide: true }) } catch {}
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  } catch {}

  const userDataDir = app.getPath('userData')
  const dbDir = path.join(userDataDir, 'data')
  const userDbPath = path.join(dbDir, 'dev.db')
  const seedTemplatePath = getSeedTemplatePath()

  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }
  } catch (e) {
    writeCrash(`[Server] Failed to create data directory: ${e}`)
    return
  }

  // 每次启动都从 seed.db 重新初始化数据库
  // seed.db 包含正确的 schema，复制后 db push 会快速验证一致性
  // 用户数据在首次启动后会由 app 正常创建
  if (fs.existsSync(seedTemplatePath)) {
    try {
      if (fs.existsSync(userDbPath)) {
        fs.unlinkSync(userDbPath)
        writeCrash('[Schema] Removed old database, reinitializing from seed.db')
      }
      fs.copyFileSync(seedTemplatePath, userDbPath)
      writeCrash('[Schema] Seed database copied from template')
    } catch (copyErr) {
      writeCrash(`[Server] Failed to copy seed.db: ${copyErr}`)
      return
    }
  }

  // 同步等待 schema 更新完成
  await ensureSchemaUpToDate(userDbPath)

  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked')
  const serverModulesPath = path.join(unpackedRoot, 'server', 'node_modules')
  const prismaModulesPath = path.join(unpackedRoot, 'node_modules')
  const nodePath = `${serverModulesPath}${path.delimiter}${prismaModulesPath}`

  const serverEntry = getServerEntryPath()
  const uploadsPath = path.join(unpackedRoot, 'server', 'uploads')

  // fork Express 服务器
  let nodeExecPath = process.execPath
  if (process.platform === 'win32') {
    const electronDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules', 'electron', 'dist')
    const electronNodeExe = path.join(electronDir, 'node.exe')
    if (fs.existsSync(electronNodeExe)) {
      nodeExecPath = electronNodeExe
    }
  }

  serverProcess = fork(serverEntry, [], {
    execPath: nodeExecPath,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '7072',
      DATABASE_URL: `file:${userDbPath}`,
      UPLOADS_PATH: uploadsPath,
      NODE_PATH: nodePath,
      CORS_ORIGIN: '*'
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })

  serverProcess.on('message', (msg) => {
    writeCrash(`[Server] ${String(msg)}`)
  })

  serverProcess.stdout?.on('data', (data: Buffer) => {
    writeCrash(`[Server stdout] ${data.toString().trim()}`)
  })

  serverProcess.stderr?.on('data', (data: Buffer) => {
    writeCrash(`[Server stderr] ${data.toString().trim()}`)
  })

  serverProcess.on('error', (err: Error) => {
    writeCrash(`[Server] Failed to start: ${err.message}`)
  })

  serverProcess.on('exit', (code: number, signal: string) => {
    writeCrash(`[Server] Process exited code=${code} signal=${signal}`)
    serverProcess = null
  })
}

function waitForPort(port: number, timeoutMs: number = 30000): Promise<void> {
  const startTime = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const client = new net.Socket()
      client.connect(port, '127.0.0.1', () => {
        client.destroy()
        resolve()
      })
      client.on('error', () => {
        client.destroy()
        if (Date.now() - startTime > timeoutMs) {
          reject(new Error(`Port ${port} did not become available within ${timeoutMs}ms`))
        } else {
          setTimeout(check, 500)
        }
      })
    }
    check()
  })
}

function stopLocalServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    if (relativePath.startsWith('dist-electron')) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'client-pos', relativePath)
    }
    return path.join(app.getAppPath(), 'client-pos', relativePath)
  } else {
    return path.join(__dirname, '..', '..', relativePath)
  }
}

function createMainWindow() {
  const allDisplays = screen.getAllDisplays()
  const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
    current.bounds.x < leftmost.bounds.x ? current : leftmost
  )
  const { width, height, x: screenX, y: screenY } = leftmostDisplay.workArea

  mainWindow = new BrowserWindow({
    width: Math.floor(width * 0.6),
    height,
    x: screenX,
    y: screenY,
    fullscreen: false,
    resizable: true,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableBlinkFeatures: 'CSSColorSchemeUARendering'
    },
    titleBarStyle: process.platform === 'win32' ? 'default' : undefined,
    title: 'Bubble Tea POS',
    backgroundColor: '#ffffff'
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:6063')
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = getResourcePath('dist/index.html')
    const preloadPath = getResourcePath('dist-electron/electron/preload.js')

    mainWindow.loadFile(indexPath).catch((err) => {
      writeCrash(`[Electron] Failed to load index: ${err.message}`)
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      writeCrash(`[Electron] Page failed to load: ${errorCode} ${errorDescription}`)
      if (mainWindow) showErrorPageSync('页面加载失败', `错误码: ${errorCode}`, errorDescription)
    })

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      writeCrash(`[Electron] Renderer process gone: ${JSON.stringify(details)}`)
      if (mainWindow) showErrorPageSync('渲染进程异常', '应用程序渲染进程意外退出。', JSON.stringify(details))
    })

    mainWindow.webContents.on('crashed', () => {
      writeCrash('[Electron] Renderer process crashed')
      if (mainWindow) showErrorPageSync('渲染进程崩溃', '应用程序崩溃，请尝试重新安装。')
    })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    if (customerWindow) customerWindow.close()
  })
}

function createCustomerWindow() {
  const allDisplays = screen.getAllDisplays()
  const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
    current.bounds.x < leftmost.bounds.x ? current : leftmost
  )
  const rightmostDisplay = allDisplays.reduce((rightmost, current) =>
    current.bounds.x > rightmost.bounds.x ? current : rightmost
  )
  const isSameDisplay = rightmostDisplay.bounds.x === leftmostDisplay.bounds.x &&
    rightmostDisplay.bounds.y === leftmostDisplay.bounds.y
  if (isSameDisplay) return

  const targetDisplay = rightmostDisplay
  const { width, height, x: screenX, y: screenY } = targetDisplay.workArea

  customerWindow = new BrowserWindow({
    width,
    height,
    x: screenX,
    y: screenY,
    fullscreen: true,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'Customer Display',
    alwaysOnTop: true
  })

  if (isDev) {
    customerWindow.loadURL('http://localhost:6063/customer-display')
  } else {
    const indexPath = getResourcePath('dist/index.html')
    const fileUrl = 'file://' + indexPath.replace(/\\/g, '/') + '#/customer-display'
    customerWindow.loadURL(fileUrl).catch((err) => {
      writeCrash(`[Electron] Customer display load failed: ${err.message}`)
    })
  }

  customerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    writeCrash(`[Electron] Customer display failed to load: ${errorCode} ${errorDescription}`)
  })

  customerWindow.webContents.on('crashed', () => {
    writeCrash('[Electron] Customer display renderer crashed')
  })

  customerWindow.on('closed', () => {
    customerWindow = null
  })
}

// IPC
ipcMain.handle('list-printers', async () => {
  if (process.platform !== 'win32') return { printers: [], error: 'Only supported on Windows' }
  return new Promise((resolve) => {
    const { exec } = require('child_process')
    exec(`Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`, (error: any, stdout: string) => {
      if (error) { resolve({ printers: [], error: error.message }); return }
      try {
        const trimmed = stdout.trim()
        if (!trimmed) { resolve({ printers: [], error: null }); return }
        let printers: string[]
        if (trimmed.startsWith('[')) printers = JSON.parse(trimmed)
        else if (trimmed.startsWith('{')) printers = [JSON.parse(trimmed).Name]
        else printers = trimmed.split('\n').map((s: string) => s.trim()).filter(Boolean)
        resolve({ printers, error: null })
      } catch { resolve({ printers: [], error: 'Parse error' }) }
    })
  })
})

ipcMain.on('order-update', (_event, orderData) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('order-update', orderData)
  }
})

ipcMain.handle('get-api-url', () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'api-config.json')
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return data.apiUrl || '/api'
    }
  } catch {}
  return '/api'
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('get-log-entries', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'logs', 'main.log')
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8')
      const entries = content.split('\n').filter(Boolean).slice(-100).map((line: string) => {
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]\s*\[(\w+)\]\s*(.*)$/)
        if (match) return { timestamp: match[1], level: match[2].toLowerCase(), message: match[3] }
        return { timestamp: '', level: 'info', message: line }
      })
      return JSON.stringify(entries)
    }
  } catch {}
  return '[]'
})

ipcMain.handle('set-api-url', (_event, url: string) => {
  const isValidUrl = typeof url === 'string' && (
    url === '/api' || url.startsWith('/api?') || url.startsWith('/api/') || /^https?:\/\/[^/]+\/api\/?/.test(url)
  )
  if (!isValidUrl) return false
  try {
    const configPath = path.join(app.getPath('userData'), 'api-config.json')
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: url }, null, 2))
    return true
  } catch { return false }
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

// 打印小票
ipcMain.handle('print-receipt', async (_event, data) => {
  try {
    if (process.platform === 'win32') {
      try {
        await printViaWindowsRaw(data)
        return { success: true }
      } catch (winError: any) {
        const printerHost = data.printerHost || process.env.PRINTER_HOST
        if (printerHost) {
          try {
            const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100')
            await printViaNetwork(generateReceiptText(data), printerHost, printerPort)
            return { success: true }
          } catch {}
        }
        return { success: false, error: winError.message }
      }
    }
    const printerHost = data.printerHost || process.env.PRINTER_HOST || '192.168.1.100'
    const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100')
    await printViaNetwork(generateReceiptText(data), printerHost, printerPort)
    return { success: true }
  } catch (error: any) {
    writeCrash(`[PRINT ERROR] ${error.message}`)
    return { success: false, error: error.message }
  }
})

function printViaNetwork(text: string, host: string, port: number): Promise<void> {
  const net = require('net')
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Network print timeout')) }, 10000)
    client.connect(port, host, () => {
      clearTimeout(timeout)
      const buffer = Buffer.from(text, 'latin1')
      client.write(buffer, 'latin1', (err: any) => {
        if (err) { client.end(); reject(err) } else { client.end(); resolve() }
      })
    })
    client.on('error', (err: any) => { clearTimeout(timeout); reject(err) })
  })
}

async function printViaWindowsRaw(data: any): Promise<void> {
  const os = require('os')
  const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`)
  fs.writeFileSync(tempFile, generateReceiptText(data), { encoding: 'utf8' })
  const printerName = data.printerName || ''
  let cmd: string
  if (printerName) cmd = `print /D:"${printerName}" "${tempFile}"`
  else cmd = `print "${tempFile}"`
  const { exec } = require('child_process')
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30000 }, (error: any) => {
      try { fs.unlinkSync(tempFile) } catch {}
      if (error) reject(error)
      else resolve()
    })
  })
}

ipcMain.handle('open-cash-drawer', async (_event, data) => {
  try {
    if (process.platform === 'win32') {
      try {
        await openCashDrawerViaWindows(data.printerName)
        return { success: true }
      } catch (winError: any) {
        const printerHost = data?.printerHost || process.env.PRINTER_HOST
        if (printerHost) {
          try {
            await openCashDrawerViaNetwork(printerHost, data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100'))
            return { success: true }
          } catch {}
        }
        return { success: false, error: winError.message }
      }
    }
    const printerHost = data?.printerHost || process.env.PRINTER_HOST || '192.168.1.100'
    await openCashDrawerViaNetwork(printerHost, data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100'))
    return { success: true }
  } catch (error: any) {
    writeCrash(`[CASH DRAWER ERROR] ${error.message}`)
    return { success: false, error: error.message }
  }
}

function openCashDrawerViaNetwork(host: string, port: number): Promise<void> {
  const net = require('net')
  const cashDrawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32])
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Cash drawer timeout')) }, 5000)
    client.connect(port, host, () => {
      clearTimeout(timeout)
      client.write(cashDrawerCommand)
      client.end()
      resolve()
    })
    client.on('error', (err: any) => { clearTimeout(timeout); reject(err) })
  })
}

async function openCashDrawerViaWindows(printerName?: string): Promise<void> {
  const os = require('os')
  const fs = require('fs')
  const cashDrawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32])
  const tempFile = path.join(os.tmpdir(), `drawer_${Date.now()}.bin`)
  fs.writeFileSync(tempFile, cashDrawerCmd)
  const { exec } = require('child_process')
  return new Promise((resolve, reject) => {
    exec(`copy /b "${tempFile}" "\\\\${require('os').hostname()}\\${printerName || 'default'}"`, { timeout: 10000 }, (error: any) => {
      try { fs.unlinkSync(tempFile) } catch {}
      if (error) reject(error)
      else resolve()
    })
  })
}

function generateReceiptText(data: any): string {
  const lines: string[] = []
  const width = 32
  if (data.header) { lines.push(centerText(data.header, width)); lines.push(repeatChar('=', width)) }
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
        item.addons.forEach((addon: any) => lines.push(`  + ${truncate(addon.name, 20)}`))
      }
      const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
      if (mods) lines.push(`  [${mods}]`)
    })
  }
  lines.push(repeatChar('-', width))
  lines.push(`${'Subtotal:'.padEnd(20)}${formatRp(data.subtotal || 0).padStart(10)}`)
  lines.push(`${'Pajak:'.padEnd(20)}${formatRp(data.tax || 0).padStart(10)}`)
  if (data.discount && data.discount > 0) lines.push(`${'Diskon:'.padEnd(20)}-${formatRp(data.discount).padStart(10)}`)
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
    if (data.pointsRedeemed && data.pointsRedeemed > 0) lines.push(`Points: -${data.pointsRedeemed}`)
  }
  lines.push('')
  if (data.footer) lines.push(centerText(data.footer, width))
  lines.push(centerText('=== TERIMA KASIH ===', width))
  return lines.join('\n') + '\n\n\n\n\n'
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(padding) + text
}
function repeatChar(char: string, count: number): string { return char.repeat(count) }
function truncate(str: string, len: number): string { return str.length > len ? str.slice(0, len) : str }
function formatRp(amount: number): string { return 'Rp ' + amount.toLocaleString('id-ID') }
function formatDateTime(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

// 单例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  setTimeout(() => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const win = wins[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  }, 1000)
})

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    const webview2Available = checkWebView2()
    if (!webview2Available) {
      dialog.showErrorBox('缺少 WebView2 运行时', '请先安装 Microsoft Edge WebView2 运行时。')
      app.quit()
      return
    }
  }

  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`window.location.hash = '#/diagnostics'`)
    }
  })

  if (app.isPackaged) {
    try {
      await startLocalServer()
    } catch (err: any) {
      writeCrash(`[Electron] startLocalServer() threw: ${err.message} ${err.stack || ''}`)
    }

    try {
      await waitForPort(7072, 60000)
      try { createMainWindow() } catch (e) { writeCrash(`[Electron] Failed to create main window: ${e}`) }
      try { createCustomerWindow() } catch (e) {}
      if (mainWindow) {
        setupUpdater(mainWindow)
        setTimeout(() => checkForUpdatesOnStart(), 10000)
      }
    } catch (err: any) {
      writeCrash(`[Electron] Server failed to start: ${err.message}`)
      createMainWindow()
      if (mainWindow) {
        showErrorPageSync('服务器启动失败', '本地 API 服务器未能成功启动。', `错误：${err.message}`)
      }
    }
  } else {
    createMainWindow()
    createCustomerWindow()
    if (mainWindow) {
      setupUpdater(mainWindow)
      setTimeout(() => checkForUpdatesOnStart(), 10000)
    }
  }
})

app.on('window-all-closed', () => {
  stopLocalServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
    createCustomerWindow()
  }
})

app.on('before-quit', () => {
  stopLocalServer()
})
