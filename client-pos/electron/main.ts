import { fetchReceiptLogo } from './receiptLogo'
import { exactPrinterName } from './printerTarget'
import { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog, Menu, nativeImage, safeStorage } from 'electron'
import { randomBytes } from 'crypto'
import path from 'path'
import { setupUpdater, checkForUpdatesOnStart } from './updater'

// 彻底禁用并隐藏 Windows / Linux 默认顶部菜单栏（File, Edit, View, Window, Help）
Menu.setApplicationMenu(null)
import fs from 'fs'
import {resolvePosDataProfile} from './dataProfile'

// Select the old profile before log initialization, encryption or browser creation.
// Do not copy databases or create a fresh Chromium profile during an upgrade.
if (process.platform === 'win32') {
  try {
    const currentProfile = app.getPath('userData')
    const selectedProfile = resolvePosDataProfile(currentProfile,app.getPath('appData'),process.env.LOCALAPPDATA)
    if (selectedProfile !== currentProfile) app.setPath('userData',selectedProfile)
  } catch {
    dialog.showErrorBox('POS data requires verification', 'Multiple historical POS data directories were found. Keep the data and contact the manager.\n发现多个旧收银数据目录，请保留数据并联系负责人核验。')
    app.exit(73)
  }
}

function getOrCreateLocalJwtSecret(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable; cannot start the local API securely')
  }
  const secretPath = path.join(app.getPath('userData'), 'jwt-secret.bin')
  try {
    return safeStorage.decryptString(fs.readFileSync(secretPath))
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
  const secret = randomBytes(32).toString('hex')
  fs.mkdirSync(path.dirname(secretPath), { recursive: true })
  try {
    fs.writeFileSync(secretPath, safeStorage.encryptString(secret), { flag: 'wx', mode: 0o600 })
    return secret
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error
    return safeStorage.decryptString(fs.readFileSync(secretPath))
  }
}
import { exec as execChild, fork, spawn } from 'child_process'
import net from 'net'
import log from 'electron-log/main'
// asar 打包后 stdout/stderr 无效，electron-log 内部调用会抛 EPIPE
process.stdout.write = () => false
process.stderr.write = () => false
// crash 日志直接写文件，不经过 electron-log
const crashLogFile = path.join(app.getPath('userData'), 'logs', 'crash.log')
function writeCrash(msg: string) {
  try { fs.appendFileSync(crashLogFile, `[${new Date().toISOString()}] ${msg}\n`) } catch {}
}
// 初始化 electron-log（文件日志）
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = false
log.transports.file.maxSize = 5 * 1024 * 1024
// 全局未捕获异常处理器
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

// electron-pos-printer for Windows USB/network thermal printers
let PosPrinter: any = null
let printerLoadFailed = false
try {
  PosPrinter = require('electron-pos-printer').PosPrinter
  console.log('[PRINTER] electron-pos-printer loaded via standard require')
} catch (e: any) {
  console.warn('[PRINTER] Standard require failed, trying unpacked path:', e?.message)
  try {
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron-pos-printer')
    PosPrinter = require(unpackedPath).PosPrinter
    console.log('[PRINTER] electron-pos-printer loaded via unpacked path:', unpackedPath)
  } catch (e2: any) {
    try {
      const unpackedClientPosPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'client-pos', 'node_modules', 'electron-pos-printer')
      PosPrinter = require(unpackedClientPosPath).PosPrinter
      console.log('[PRINTER] electron-pos-printer loaded via unpacked client-pos path:', unpackedClientPosPath)
    } catch (e3: any) {
      printerLoadFailed = true
      console.log('[PRINTER] electron-pos-printer load failed:', e?.message, e2?.message, e3?.message)
      log.error('[PRINTER] electron-pos-printer load failed:', e?.message, e2?.message, e3?.message)
    }
  }
}

// 检测 WebView2 是否可用（Windows only）
function checkWebView2(): boolean {
  if (process.platform !== 'win32') return true
  try {
    // 检查注册表键：Everett 存储（WebView2 安装后写入）
    const regKey = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    const { execSync } = require('child_process')
    const result = execSync(
      `reg query "${regKey}" /v pv 2>nul`,
      { encoding: 'utf8', timeout: 5000 }
    )
    const match = result.match(/pv\s+REG_SZ\s+(\d+\.\d+\.\d+)/)
    if (match) {
      console.log('[WebView2] Runtime version:', match[1])
      return true
    }
    return false
  } catch {
    // 注册表键不存在 = WebView2 未安装
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

// 显示错误信息页面
function showErrorPage(mainWindow: BrowserWindow, title: string, message: string, details?: string) {
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
    <p>${message}</p>
    ${details ? `<div class="details"><strong>详细信息：</strong><br>${details}</div>` : ''}
    <div class="log-path"><strong>📋 日志文件位置：</strong><br>${logPath}</div>
    <button class="btn btn-log" onclick="require('electron').shell.openPath('${logDir.replace(/\\\\/g, '\\\\\\\\')}')">📂 打开日志文件夹</button>
    <button class="btn" onclick="window.close()">关闭程序</button>
  </div>
</body>
</html>`
  mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
}

// Windows DPI awareness - 修复高分屏字体模糊
// Process DPI awareness before app.ready()
if (process.platform === 'win32') {
  // 尝试设置 Per-Monitor DPI v2 (需要 Windows 10 1703+)
  try {
    // SetProcessDpiAwarenessContext for Per-Monitor v2
    // Falls back gracefully on older Windows
    app.commandLine.appendSwitch('high-dpi-config', '1.0')
    app.commandLine.appendSwitch('force-device-scale-factor', '1')
  } catch (e) {
    // Ignore if not supported
  }
}

// 启用硬件加速（禁用会导致字体模糊）
// 如果某些特定电脑需要禁用 GPU，可以设置环境变量 ELECTRON_DISABLE_GPU=1
if (process.env.ELECTRON_DISABLE_GPU !== '1') {
  // 不禁用硬件加速，保持清晰渲染
  // 仅在必要时通过命令行禁用：electron --disable-gpu
}

// 窗口引用
let mainWindow: BrowserWindow | null = null
let customerWindow: BrowserWindow | null = null

// 本地 Express 服务器进程（用于打包后的桌面版本）
let serverProcess: ReturnType<typeof fork> | null = null

/**
 * 获取服务器入口文件的真实路径
 *
 * asar:true  -> server 在 app.asar.unpacked/server/dist/index.js
 * asar:false -> server 在 server/dist/index.js（extraResources 直接在 resources/ 下）
 *
 * 检测方法：app.getAppPath() 末尾是 .asar 则为 asar 模式
 */
function getServerEntryPath(): string {
  const isAsar = app.getAppPath().endsWith('.asar')
  if (isAsar) {
    // asar: true — server 在 app.asar.unpacked 下
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js')
  } else {
    // asar: false — server 直接在 resources/server/dist 下（extraResources）
    return path.join(process.resourcesPath, 'server', 'dist', 'index.js')
  }
}

/**
 * 获取 seed 数据库模板路径
 */
function getSeedTemplatePath(): string {
  // seed.db 位于 asar 内部 app.getAppPath()/server/prisma/seed.db
  // extraResources 已将 server/uploads 复制到 asar.unpacked，但 prisma 文件由 asarUnpack 提取
  // 为确保兼容性，优先使用 app.getAppPath()（asar 内部），备用 asar.unpacked
  if (app.isPackaged) {
    const asarPath = path.join(app.getAppPath(), 'server', 'prisma', 'seed.db')
    const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'seed.db')
    return fs.existsSync(asarPath) ? asarPath : (fs.existsSync(unpackedPath) ? unpackedPath : asarPath)
  } else {
    return path.join(process.resourcesPath, 'server', 'prisma', 'seed.db')
  }
}

/**
 * 获取 Prisma schema 路径（asar/unpack 兼容）
 */
function getPrismaSchemaPath(): string {
  // schema.prisma 由 asarUnpack 提取到 asar.unpacked/server/prisma/schema.prisma
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'schema.prisma')
  } else {
    return path.join(process.resourcesPath, 'server', 'prisma', 'schema.prisma')
  }
}

/**
 * 同步检查并修复用户数据库 schema
 * 等待 prisma db push 完成后再继续（同步阻塞）
 * 这确保数据库 schema 在服务器启动前就已更新
 */
async function ensureSchemaUpToDate(userDbPath: string): Promise<void> {
  // 获取 server/node_modules 的基础路径（不含 .bin）
  const serverModulesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules')
    : path.join(process.resourcesPath, 'server', 'node_modules')

  // 定位 node 可执行文件（跨平台）
  // 注意：Electron 打包后 process.execPath 是 Electron/BTPS.exe，不是独立的 node.exe
  // 不能用 Electron 主程序来执行 node 脚本，必须找正确的 node 路径
  // Windows 打包后 node.exe 位于 resources/app.asar.unpacked/server/node_modules/electron/dist/node.exe
  let nodeBin = process.execPath
  if (process.platform === 'win32') {
    // electron 的 node.exe 在 server/node_modules/electron/dist/node.exe
    const electronDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules', 'electron', 'dist')
    const electronNodeExe = path.join(electronDir, 'node.exe')
    if (fs.existsSync(electronNodeExe)) {
      nodeBin = electronNodeExe
      log.log('[Schema] Using electron bundled node:', nodeBin)
    } else {
      // 备用：直接用 process.execPath（Electron 本身包含 Node.js）
      log.log('[Schema] electron node.exe not found, using process.execPath as fallback')
    }
  }

  // prisma CLI 入口脚本（避免使用 .bin/prisma shell 脚本，它包含硬编码的开发机路径）
  // npm 安装时路径: server/node_modules/prisma/build/index.js
  const prismaCliPath = path.join(serverModulesPath, 'prisma', 'build', 'index.js')
  const schemaPath = getPrismaSchemaPath()

  if (!fs.existsSync(schemaPath)) {
    log.warn('[Schema] schema.prisma not found, skipping db sync')
    return
  }

  if (!fs.existsSync(prismaCliPath)) {
    log.warn('[Schema] prisma CLI not found at', prismaCliPath, '- skipping db sync')
    return
  }

  log.log('[Schema] Checking database schema...')
  log.log('[Schema] Prisma CLI:', prismaCliPath)
  log.log('[Schema] Database:', userDbPath)
  log.log('[Schema] Node binary:', nodeBin)

  return new Promise((resolve) => {
    let childExited = false

    // 直接用 node 执行 prisma CLI 脚本，避免 shell 脚本在 Windows 上的路径问题
    // 注意：stdout 设为 'ignore' 避免 Prisma 退出后 pipe 断开导致 EPIPE 错误
    const child = spawn(nodeBin, [prismaCliPath, 'db', 'push', '--accept-data-loss', '--schema', schemaPath], {
      env: { ...process.env, DATABASE_URL: `file:${userDbPath}`, NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe', 'pipe']
    })

    let stdoutData = ''
    let stderrData = ''

    child.stdout?.on('data', (d: Buffer) => {
      const msg = d.toString()
      stdoutData += msg
      log.log('[Prisma stdout]', msg.trim())
    })

    child.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString()
      stderrData += msg
      log.log('[Prisma stderr]', msg.trim())
    })

    child.on('close', (code: number | null, signal: string | null) => {
      childExited = true
      log.log('[Schema] db push finished with code:', code, 'signal:', signal)
      if (code === 0 || stderrData.includes('Your database is now in sync')) {
        log.log('[Schema] Database schema is up to date')
      } else if (code === null && signal === 'SIGTERM') {
        // 超时被杀，不算错
        log.warn('[Schema] db push timed out (SIGTERM), continuing anyway')
      } else {
        log.error('[Schema] db push FAILED with code', code, '- continuing anyway')
        log.error('[Schema] Last stderr:', stderrData.slice(-500))
      }
      resolve()
    })

    child.on('error', (err: Error) => {
      log.error('[Schema] Could not run prisma db push:', err.message, '- continuing anyway')
      resolve()
    })

    // 超时保护：60秒
    setTimeout(() => {
      if (!childExited) {
        log.warn('[Schema] db push timed out after 60s, killing...')
        child.kill('SIGTERM')
      }
    }, 60000)
  })
}

/**
 * 启动本地 Express API 服务器（fork child process）
 *
 * 数据库初始化策略（单门店离线安装）：
 * 1. 用户数据库路径：{userData}/data/dev.db（用户可写）
 * 2. 如果不存在，从打包资源复制 seed.db（包含完整表结构）
 * 3. fork Express 服务器，DATABASE_URL 指向用户目录
 *
 * seed.db 打包位置（asarUnpack）：
 *   {resourcesPath}/app.asar.unpacked/server/prisma/seed.db
 *
 * 多门店支持：
 * 数据库里 Tenant → Store 表已存在，但默认创建单门店实例。
 * Admin UI 通过切换 storeId 支持多门店管理（同一数据库内）。
 */
async function startLocalServer(): Promise<void> {
  if (!app.isPackaged) {
    console.log('[Server] Dev mode - skipping local server start')
    return
  }

  // ─── 关键修复：启动前清理残留进程 ───────────────────────────────
  // 场景：上次应用被强制 kill，或 SIGTERM 未能干净杀死 serverProcess
  // 导致端口 7072 被僵尸进程占用，新实例卡在 waitForPort 超时
  try {
    const { execSync } = require('child_process')
    if (process.platform === 'win32') {
      // Windows: 查找占用 7072 端口的进程并强制结束
      const result = execSync(
        `netstat -ano | findstr :7072 | findstr LISTENING`,
        { encoding: 'utf8', windowsHide: true }
      )
      const lines = result.trim().split('\n')
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const localAddr = parts[1] || ''
        if (!localAddr.includes(':7072')) continue
        const pid = parts[parts.length - 1]
        if (!pid || pid === '0') continue
        console.log(`[Server] Killing residual process PID=${pid} holding port 7072`)
        try {
          execSync(`taskkill /F /PID ${pid}`, { windowsHide: true })
          console.log(`[Server] Residual process ${pid} killed`)
        } catch (killErr: any) {
          console.warn(`[Server] Failed to kill PID ${pid}:`, killErr.message)
        }
      }
    } else {
      // macOS/Linux: 用 lsof 找到占用 7072 的进程
      const result = execSync(
        `lsof -ti:7072 2>/dev/null || true`,
        { encoding: 'utf8' }
      )
      const pids = result.trim().split('\n').filter(Boolean)
      for (const pid of pids) {
        console.log(`[Server] Killing residual process PID=${pid} holding port 7072`)
        try {
          process.kill(parseInt(pid), 'SIGKILL')
          console.log(`[Server] Residual process ${pid} killed`)
        } catch (killErr: any) {
          console.warn(`[Server] Failed to kill PID ${pid}:`, killErr.message)
        }
      }
    }
    // 等待系统释放端口
    await new Promise(r => setTimeout(r, 1000))
  } catch (cleanupErr) {
    // 端口未被占用 → 忽略错误
    console.log('[Server] No residual process on port 7072, proceeding...')
  }
  // ─── 清理完毕 ────────────────────────────────────────────────

  const userDataDir = app.getPath('userData')
  const dbDir = path.join(userDataDir, 'data')
  const userDbPath = path.join(dbDir, 'dev.db')

  // seed 模板路径（asar 模式自适应）
  const seedTemplatePath = getSeedTemplatePath()

  log.log(`[Server] App version: ${app.getVersion()}, userData: ${userDataDir}`)

  // 确保数据库目录存在
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
      log.log('[Server] Created data directory:', dbDir)
    }
  } catch (e) {
    log.error('[Server] Failed to create data directory:', e)
    return
  }

  // 仅在用户数据库完全不存在时，才从 seed.db 复制初始化（保护用户数据）
  if (fs.existsSync(seedTemplatePath)) {
    try {
      if (!fs.existsSync(userDbPath)) {
        // 用户数据库不存在时才从 seed.db 复制（首次安装时）
        fs.copyFileSync(seedTemplatePath, userDbPath)
        writeCrash('[Schema] User database created from seed template')
      }
      // 注意：已存在的用户数据库不再被覆盖，以保护用户数据
    } catch (copyErr) {
      writeCrash(`[Server] Failed to copy seed.db: ${copyErr}`)
      return
    }
  }

  // Express performs explicit versioned SQLite upgrades, with a verified snapshot
  // and transactional rollback, before listening. Never call destructive db push here.

  // unpackedRoot = resources/app.asar.unpacked/（Node 模块实际位置）
  const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked')
  // server 模块在 app.asar.unpacked/server/node_modules
  // @prisma/client 和 .prisma 在 app.asar.unpacked/node_modules
  // NODE_PATH 需要包含两者才能让 prisma 和服务器正确加载模块
  const serverModulesPath = path.join(unpackedRoot, 'server', 'node_modules')
  const prismaModulesPath = path.join(unpackedRoot, 'node_modules')
  const nodePath = `${serverModulesPath}${path.delimiter}${prismaModulesPath}`
  log.log('[Server] NODE_PATH:', nodePath)

  // 获取服务器入口文件路径（asarUnpack 后的真实文件系统路径）
  const serverEntry = getServerEntryPath()
  log.log('[Server] Server path:', serverEntry)
  log.log('[Server] Database path:', userDbPath)
  log.log('[Server] Starting local API server...')

  // asar 模式下 uploads 在 app.asar.unpacked/server/uploads
  const uploadsPath = path.join(unpackedRoot, 'server', 'uploads')
  log.log('[Server] Uploads path:', uploadsPath)

  // fork Express 服务器
  // 注意：必须显式指定 node 可执行文件路径，不能依赖 fork() 默认行为
  // Windows 上 process.execPath 是 BTPS.exe（Electron 主程序），不是 node.exe
  // 修复：electron 在根 node_modules（打包进 asar），不在 server/node_modules
  // 因此 asar.unpacked 下可能没有 electron/dist/node.exe
  // 尝试多个可能路径，都找不到则用系统 node（最后手段）
  let nodeExecPath = process.execPath
  if (process.platform === 'win32') {
    // 可能的 node.exe 位置（按优先级）
    const possiblePaths = [
      // 1. app.asar.unpacked/node_modules/electron/dist/（electron 在根 node_modules）
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist', 'node.exe'),
      // 2. app.asar.unpacked/server/node_modules/electron/dist/（旧路径，可能不存在）
      path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules', 'electron', 'dist', 'node.exe'),
      // 3. 系统级 node（作为最后的 fallback）
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
    ]
    for (const possibleNode of possiblePaths) {
      if (fs.existsSync(possibleNode)) {
        nodeExecPath = possibleNode
        log.log('[Server] Using found node:', nodeExecPath)
        break
      }
    }
    if (!possiblePaths.some(p => p === nodeExecPath) || !fs.existsSync(nodeExecPath)) {
      log.log('[Server] No working node.exe found - using process.execPath as fallback:', nodeExecPath)
    }
  }
  // ── FORK DEBUG（按 ChatGPT 建议添加）──────────────────────────────
  // 关键诊断信息：在 fork 之前打印，帮助定位子进程静默崩溃的根因
  writeCrash(`[FORK DEBUG] serverEntry = ${serverEntry}`)
  writeCrash(`[FORK DEBUG] serverEntry exists = ${fs.existsSync(serverEntry)}`)
  writeCrash(`[FORK DEBUG] nodeExecPath = ${nodeExecPath}`)
  writeCrash(`[FORK DEBUG] nodeExecPath exists = ${fs.existsSync(nodeExecPath)}`)
  writeCrash(`[FORK DEBUG] NODE_PATH = ${nodePath}`)
  writeCrash(`[FORK DEBUG] cwd = ${process.cwd()}`)
  writeCrash(`[FORK DEBUG] resourcesPath = ${process.resourcesPath}`)
  writeCrash(`[FORK DEBUG] appPath = ${app.getAppPath()}`)
  // 检查 electronDir 和 node.exe
  if (process.platform === 'win32') {
    const electronDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules', 'electron', 'dist')
    writeCrash(`[FORK DEBUG] electronDir = ${electronDir}`)
    writeCrash(`[FORK DEBUG] electronDir exists = ${fs.existsSync(electronDir)}`)
    const nodeExeInElectron = path.join(electronDir, 'node.exe')
    writeCrash(`[FORK DEBUG] node.exe in electron dir exists = ${fs.existsSync(nodeExeInElectron)}`)
  }
  // 检查 server/dist/index.js 是否存在
  const serverDistIndex = path.join(unpackedRoot, 'server', 'dist', 'index.js')
  writeCrash(`[FORK DEBUG] serverDistIndex = ${serverDistIndex}`)
  writeCrash(`[FORK DEBUG] serverDistIndex exists = ${fs.existsSync(serverDistIndex)}`)
  // 检查 prisma client
  const prismaClientIndex = path.join(prismaModulesPath, '@prisma', 'client', 'index.js')
  writeCrash(`[FORK DEBUG] prismaClientIndex = ${prismaClientIndex}`)
  writeCrash(`[FORK DEBUG] prismaClientIndex exists = ${fs.existsSync(prismaClientIndex)}`)
  const prismaClient = path.join(unpackedRoot, 'node_modules', '@prisma', 'client')
  writeCrash(`[FORK DEBUG] prismaClient dir exists = ${fs.existsSync(prismaClient)}`)
  // 检查 seed.db
  writeCrash(`[FORK DEBUG] seedTemplatePath = ${seedTemplatePath}`)
  writeCrash(`[FORK DEBUG] seedTemplatePath exists = ${fs.existsSync(seedTemplatePath)}`)
  writeCrash(`[FORK DEBUG] userDbPath = ${userDbPath}`)
  writeCrash(`[FORK DEBUG] userDbPath exists = ${fs.existsSync(userDbPath)}`)
  // ── FORK DEBUG 结束 ───────────────────────────────────────────────

  log.log('[Server] Node exec path:', nodeExecPath)
  log.log('[Server] Server entry:', serverEntry)
  log.log('[Server] Exists:', fs.existsSync(serverEntry))
  serverProcess = fork(serverEntry, [], {
    execPath: nodeExecPath,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '7072',
      JWT_SECRET: getOrCreateLocalJwtSecret(),
      ELECTRON_RUN_AS_NODE: '1',
      // 覆盖数据库路径为用户可写目录
      // 使用 file:${path} 格式，Prisma 会正确处理带引号的路径
      DATABASE_URL: `file:${userDbPath}`,
      // uploads 目录路径（asar 模式下在 asar.unpacked 下）
      UPLOADS_PATH: uploadsPath,
      // 关键：设置 NODE_PATH 让 fork() 的子进程能找到 express/cors 等模块
      // 需要同时包含 server/node_modules 和根目录的 node_modules（prisma 相关）
      NODE_PATH: nodePath,
      // CORS: 允许所有来源，因为 Electron app 从 file:// 加载
      CORS_ORIGIN: 'null,file://,http://localhost:6063,http://localhost:5173'
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  })

  serverProcess.on('message', (msg) => {
    log.log('[Server]', msg)
  })

  serverProcess.stdout?.on('data', (data: Buffer) => {
    log.log('[Server stdout]', data.toString().trim())
  })

  serverProcess.stderr?.on('data', (data: Buffer) => {
    log.error('[Server stderr]', data.toString().trim())
  })

  // ChatGPT 建议：加 spawn 事件，确认子进程真的启动了
  serverProcess.on('spawn', () => {
    writeCrash('[Server] child spawn event - PID: ' + serverProcess?.pid)
    console.log('[Server] child spawn event - PID:', serverProcess?.pid)
  })

  serverProcess.on('error', (err: Error) => {
    writeCrash('[Server] CHILD ERROR: ' + err.message)
    log.error('[Server] Failed to start:', err.message)
  })

  serverProcess.on('exit', (code: number | null, signal: string | null) => {
    writeCrash(`[Server] CHILD EXIT code=${code} signal=${signal} pid=${serverProcess?.pid}`)
    console.log(`[Server] Process exited with code ${code}, signal ${signal}, pid ${serverProcess?.pid}`)
    serverProcess = null
  })

  serverProcess.on('close', (code: number | null, signal: string | null) => {
    writeCrash(`[Server] CHILD CLOSE code=${code} signal=${signal}`)
    console.log(`[Server] Process closed with code ${code}, signal ${signal}`)
  })

  console.log('[Server] Local API server started (PID:', serverProcess.pid, ')')
}

/**
 * 等待端口可用（轮询检测）
 */
function waitForPort(port: number, timeoutMs: number = 30000): Promise<void> {
  const startTime = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const client = new net.Socket()
      client.connect(port, '127.0.0.1', () => {
        client.destroy()
        log.log(`[Server] Port ${port} is ready`)
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

/**
 * 关闭本地服务器（应用退出时）
 */
function stopLocalServer(): void {
  if (serverProcess) {
    console.log('[Server] Shutting down local server...')
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

async function prepareOnlineInstallation(): Promise<void> {
  await mainWindow?.webContents.session.flushStorageData()
  const child = serverProcess
  if (!child || child.exitCode !== null) return
  await new Promise<void>((resolve,reject)=>{
    const timer = setTimeout(()=>{child.removeListener('exit',done);reject(Error('UPDATE_LOCAL_SERVER_STILL_RUNNING'))},10000)
    const done = ()=>{clearTimeout(timer);resolve()}
    child.once('exit',done)
    if (!child.kill('SIGTERM')) {clearTimeout(timer);child.removeListener('exit',done);reject(Error('UPDATE_LOCAL_SERVER_SHUTDOWN_FAILED'))}
  })
}

const onlineInstallationHooks = {
  prepare: prepareOnlineInstallation,
  resume: ()=>{if (!serverProcess) startLocalServer()}
}

// 开发模式检测
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

/**
 * 获取资源文件路径（兼容打包和开发模式）
 * 优先使用 app.getAppPath()，因为 __dirname 在某些打包情况下不可靠
 */
function getResourcePath(relativePath: string): string {
  if (app.isPackaged) {
    // 打包后：app.getAppPath() 返回包含 resources/app 的目录
    // 结构: resources/app/client-pos/dist/index.html
    // electron-builder.json 的 files 配置把 client-pos/ 目录内容打包进去
    // 但 dist-electron 在 asarUnpack 中，所以实际在 app.asar.unpacked 下
    // sandbox: true 时 preload 必须使用 unpacked 路径
    if (relativePath.startsWith('dist-electron')) {
      // dist-electron 在 asarUnpack 中，使用 unpacked 路径
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'client-pos', relativePath)
    }
    return path.join(app.getAppPath(), 'client-pos', relativePath)
  } else {
    // 开发模式：使用 __dirname
    // __dirname = 项目根目录/dist-electron/electron
    return path.join(__dirname, '..', '..', relativePath)
  }
}

/**
 * 创建主窗口（收银界面）
 */
function createMainWindow() {
  // 双屏兼容：显式找最左边的屏幕作为主屏（点单系统）
  // 不依赖 getPrimaryDisplay()（用户可能把外接屏设为主屏）
  const allDisplays = screen.getAllDisplays()
  const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
    current.bounds.x < leftmost.bounds.x ? current : leftmost
  )
  const { width, height, x: screenX, y: screenY } = leftmostDisplay.workArea

  mainWindow = new BrowserWindow({
    width,
    height,
    x: screenX,
    y: screenY,
    frame: false,
    fullscreen: true,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 高 DPI 支持
      enableBlinkFeatures: 'CSSColorSchemeUARendering'
    },
    title: 'YOUME POS',
    backgroundColor: '#EC6D88'
  })

  // 彻底移除 Windows 默认菜单栏（File, Edit, View, Window, Help）
  mainWindow.setMenu(null)
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  // 允许 F11 键切换全屏（方便运维调试）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown' && mainWindow && !mainWindow.isDestroyed()) {
      const isFull = mainWindow.isFullScreen()
      mainWindow.setFullScreen(!isFull)
    }
  })

  // 加载主界面（服务器启动后才加载，确保 API 可用）
  if (isDev) {
    mainWindow.loadURL('http://localhost:6063')
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = getResourcePath('dist/index.html')
    const preloadPath = getResourcePath('dist-electron/electron/preload.js')
    const fs = require('fs')

    console.log('[Electron] App path:', app.getAppPath())
    console.log('[Electron] __dirname:', __dirname)
    console.log('[Electron] Loading index from:', indexPath)
    console.log('[Electron] Preload path:', preloadPath)

    // 检查文件是否存在
    const indexExists = fs.existsSync(indexPath)
    const preloadExists = fs.existsSync(preloadPath)
    console.log('[Electron] Index exists:', indexExists)
    console.log('[Electron] Preload exists:', preloadExists)

    // 诊断信息
    const diagnosticInfo = {
      'app.getAppPath()': app.getAppPath(),
      '__dirname': __dirname,
      'indexPath': indexPath,
      'preloadPath': preloadPath,
      'indexPath 存在': indexExists,
      'preloadPath 存在': preloadExists,
      'indexPath 目录': fs.existsSync(path.dirname(indexPath)) ? '存在' : '不存在',
      'isDev': isDev,
      'isPackaged': app.isPackaged,
      'NODE_ENV': process.env.NODE_ENV || 'undefined'
    }
    // 函数：显示诊断窗口（仅在加载失败时弹出）
    const showDiagnosticWindow = () => {
      const diagWindow = new BrowserWindow({
        width: 900,
        height: 650,
        title: '诊断信息 - YOUME POS',
        alwaysOnTop: true
      })
      const dir = path.dirname(indexPath)
      let dirContents = '无法读取'
      try {
        if (fs.existsSync(dir)) {
          dirContents = fs.readdirSync(dir).slice(0, 30).join('\n')
        }
      } catch (e) {}

      const logPath = path.join(app.getPath('userData'), 'logs', 'main.log')
      let recentLogs = '无日志文件'
      try {
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf-8')
          const logLines = logContent.split('\n').filter(Boolean).slice(-30)
          recentLogs = logLines.map((line: string) => {
            if (line.includes('[error]') || line.includes('[FATAL]')) {
              return '<span style="color:#f44747">' + line.replace(/</g, '&lt;') + '</span>'
            } else if (line.includes('[warn]')) {
              return '<span style="color:#dcdcaa">' + line.replace(/</g, '&lt;') + '</span>'
            }
            return '<span style="color:#9cdcfe">' + line.replace(/</g, '&lt;') + '</span>'
          }).join('\n')
        }
      } catch (e) { recentLogs = '读取失败: ' + String(e) }

      const logPathDisplay = logPath.replace(/</g, '&lt;')
      const diagnosticText = Object.entries(diagnosticInfo)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')

      diagWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>诊断信息 - YOUME POS</title>
<style>
body{font-family:Consolas,monospace;background:#1e1e1e;color:#d4d4d4;padding:16px}
pre{background:#2d2d2d;padding:10px;border-radius:5px;overflow-x:auto;word-wrap:break-word;white-space:pre-wrap}
.key{color:#9cdcfe}
.status-ok{color:#4ec9b0}
.status-error{color:#f44747}
h3{margin-top:16px;color:#569cd6}
.log-section{max-height:500px;overflow-y:scroll;background:#1e1e1e;border:1px solid #333;border-radius:5px}
</style>
</head>
<body>
<h2 style="color:#569cd6">🚨 启动诊断 - 白屏时必看</h2>
<pre>${diagnosticText.replace(/</g, '&lt;')}</pre>
<h3>${dir.replace(/</g, '&lt;')} 目录内容</h3>
<pre>${dirContents.replace(/</g, '&lt;')}</pre>
<h3>📋 最近运行日志 (${logPathDisplay})</h3>
<div class="log-section"><pre>${recentLogs}</pre></div>
<p style="color:#808080;margin-top:16px">如果主窗口加载失败，请截图发给技术支持分析。</p>
</body>
</html>`)}`)
    }

    if (!indexExists) {
      showDiagnosticWindow()
    } else {
      mainWindow.loadFile(indexPath).then(() => {
        console.log('[Electron] Successfully loaded index.html')
      }).catch((err) => {
        console.error('[Electron] Failed to load index:', err)
        showDiagnosticWindow()
      })
    }

    // 监听页面加载成功
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('[Electron] Page finished loading')
      // 页面加载成功，但可能是白屏（React渲染失败）
      // 等待2秒后检查窗口是否还是空白
      const win = mainWindow
      setTimeout(() => {
        if (win && !win.isDestroyed()) {
          win.webContents.executeJavaScript(`
            document.body.innerHTML.length < 100 ||
            document.querySelector('#root')?.innerHTML === '' ||
            document.querySelector('#root')?.children.length === 0
          `).then(isBlank => {
            if (isBlank) {
              console.error('[Electron] Page appears blank - React may have failed to render')
            }
          }).catch(() => {})
        }
      }, 2000)
    })

    // 监听页面加载失败
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[Electron] Page failed to load:', errorCode, errorDescription)
      if (mainWindow) showErrorPage(mainWindow, '页面加载失败', '无法加载主界面，可能缺少必要的运行时组件。', `错误码: ${errorCode}\n描述: ${errorDescription}`)
    })

    // 监听渲染进程错误
    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('[Electron] Renderer process gone:', details)
      if (mainWindow) showErrorPage(mainWindow, '渲染进程异常', '应用程序渲染进程意外退出。', `详情: ${JSON.stringify(details)}`)
    })

    // 监听控制台消息（来自渲染进程）- 捕获所有级别
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      const levelNames = ['debug', 'info', 'warn', 'error']
      const levelName = levelNames[level] || `level${level}`
      console.log(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`)

      // React 常见错误关键字
      const errorPatterns = [
        'Error:', 'Cannot', 'undefined', 'null is not',
        'is not a function', 'is not defined', 'Failed to',
        'SyntaxError', 'TypeError', 'ReferenceError'
      ]
      const isLikelyError = level >= 2 ||
        errorPatterns.some(p => message.includes(p))

      if (isLikelyError && mainWindow && !mainWindow.isDestroyed()) {
        // 显示渲染错误
        console.error(`[Renderer Error Detected] ${message}`)
      }
    })

    // 监听渲染进程崩溃
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Electron] Renderer process exited:', details.reason)
      if (mainWindow) showErrorPage(mainWindow, '渲染进程崩溃', '应用程序崩溃，请尝试重新安装。', `reason: ${details.reason}`)
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

  mainWindow.webContents.on('render-process-gone', () => {
    console.error('[Electron] Renderer process crashed')
  })

  console.log('[Electron] Main window created')
}

/**
 * 创建副屏窗口（顾客展示）
 * 双屏兼容：使用最右边的屏幕（排除主窗口所在屏）
 */
function createCustomerWindow() {
  const allDisplays = screen.getAllDisplays()

  // 找最左边的屏幕（主窗口所在屏）
  const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
    current.bounds.x < leftmost.bounds.x ? current : leftmost
  )

  // 副屏：用最右边的屏幕（通常是外接的顾客展示屏）
  const rightmostDisplay = allDisplays.reduce((rightmost, current) =>
    current.bounds.x > rightmost.bounds.x ? current : rightmost
  )

  // 如果最右边的屏幕就是主屏（只有一个屏幕），则跳过副屏创建
  const isSameDisplay = rightmostDisplay.bounds.x === leftmostDisplay.bounds.x &&
    rightmostDisplay.bounds.y === leftmostDisplay.bounds.y
  if (isSameDisplay) {
    console.log('[Electron] Only one display found, skipping customer window')
    return
  }

  const targetDisplay = rightmostDisplay

  const { width, height, x: screenX, y: screenY } = targetDisplay.workArea

  customerWindow = new BrowserWindow({
    width,
    height,
    x: screenX,
    y: screenY,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: getResourcePath('dist-electron/electron/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: 'Customer Display',
    alwaysOnTop: true
  })

  // 彻底移除副屏的 Windows 菜单栏
  customerWindow.setMenu(null)
  customerWindow.setMenuBarVisibility(false)
  customerWindow.setAutoHideMenuBar(true)

  // 加载副屏界面
  if (isDev) {
    customerWindow.loadURL('http://localhost:6063/customer-display')
  } else {
    // 注意：loadFile 的 hash 参数不生效，必须用 loadURL + file:// + hash
    const indexPath = getResourcePath('dist/index.html')
    const fileUrl = 'file://' + indexPath.replace(/\\/g, '/') + '#/customer-display'
    console.log('[Electron] Customer display loading:', fileUrl)
    customerWindow.loadURL(fileUrl).catch((err) => {
      console.error('[Electron] Customer display load failed:', err)
    })
  }

  customerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Electron] Customer display failed to load:', errorCode, errorDescription)
  })

  customerWindow.webContents.on('render-process-gone', () => {
    console.error('[Electron] Customer display renderer crashed')
  })

  customerWindow.on('closed', () => {
    customerWindow = null
  })

  console.log('[Electron] Customer window created')
}

// IPC 通信 - 订单状态同步到副屏
// ========== Printer Listing (Windows) ==========

ipcMain.handle('list-printers', async () => {
  if (process.platform !== 'win32') {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const sysPrinters = await mainWindow.webContents.getPrintersAsync()
        const names = (sysPrinters || []).map(p => p.name).filter(Boolean)
        return { printers: names, error: null }
      } catch (err: any) {
        return { printers: [], error: err?.message || 'Failed to get printers on macOS/Linux' }
      }
    }
    return { printers: [], error: 'Window not available to query printers' }
  }

  return new Promise((resolve) => {
    const { exec } = require('child_process')
    const allPrinters = new Set<string>()
    let hasError = false
    let methodsChecked = 0

    const checkDone = () => {
      methodsChecked++
      if (methodsChecked >= 3) {
        const result = Array.from(allPrinters)
        console.log('[LIST-PRINTERS] Total found:', result.length, '->', result)
        resolve({ printers: result, error: hasError ? 'Some methods failed' : null })
      }
    }

    // Method 1: Get-Printer (standard Windows printers)
    const cmd1 = 'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"'
    exec(cmd1, (error: any, stdout: string, stderr: string) => {
      if (!error && stdout.trim()) {
        try {
          const trimmed = stdout.trim()
          let parsed: string[]
          if (trimmed.startsWith('[')) {
            parsed = JSON.parse(trimmed)
          } else if (trimmed.startsWith('{')) {
            parsed = [JSON.parse(trimmed).Name]
          } else {
            parsed = trimmed.split('\n').map((s: string) => s.trim()).filter(Boolean)
          }
          parsed.forEach((p: string) => allPrinters.add(p))
          console.log('[LIST-PRINTERS] Get-Printer found:', parsed.length)
        } catch (e: any) {
          console.error('[LIST-PRINTERS] Get-Printer parse error:', e.message)
          hasError = true
        }
      } else if (error) {
        console.error('[LIST-PRINTERS] Get-Printer error:', error.message)
        hasError = true
      }
      checkDone()
    })

    // Method 2: WMI Win32_Printer (finds printers that Get-Printer misses)
    const cmd2 = 'powershell -Command "Get-WmiObject Win32_Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"'
    exec(cmd2, (error: any, stdout: string, stderr: string) => {
      if (!error && stdout.trim()) {
        try {
          const trimmed = stdout.trim()
          let parsed: string[]
          if (trimmed.startsWith('[')) {
            parsed = JSON.parse(trimmed)
          } else if (trimmed.startsWith('{')) {
            parsed = [JSON.parse(trimmed).Name]
          } else {
            parsed = trimmed.split('\n').map((s: string) => s.trim()).filter(Boolean)
          }
          parsed.forEach((p: string) => allPrinters.add(p))
          console.log('[LIST-PRINTERS] WMI found:', parsed.length)
        } catch (e: any) {
          console.error('[LIST-PRINTERS] WMI parse error:', e.message)
          hasError = true
        }
      } else if (error) {
        console.error('[LIST-PRINTERS] WMI error:', error.message)
        hasError = true
      }
      checkDone()
    })

    // Method 3: USB enumerate (find thermal printers connected as USB devices)
    const cmd3 = 'powershell -Command "Get-PnpDevice -Class Printer -Status OK | Select-Object -ExpandProperty FriendlyName | ConvertTo-Json -Compress"'
    exec(cmd3, (error: any, stdout: string, stderr: string) => {
      if (!error && stdout.trim()) {
        try {
          const trimmed = stdout.trim()
          let parsed: string[]
          if (trimmed.startsWith('[')) {
            parsed = JSON.parse(trimmed)
          } else if (trimmed.startsWith('{')) {
            parsed = [JSON.parse(trimmed).FriendlyName]
          } else {
            parsed = trimmed.split('\n').map((s: string) => s.trim()).filter(Boolean)
          }
          parsed.forEach((p: string) => allPrinters.add(p))
          console.log('[LIST-PRINTERS] USB PnP found:', parsed.length)
        } catch (e: any) {
          console.error('[LIST-PRINTERS] USB PnP parse error:', e.message)
          hasError = true
        }
      } else if (error) {
        console.error('[LIST-PRINTERS] USB PnP error:', error.message)
        hasError = true
      }
      checkDone()
    })

    // Method 4: Enumerate COM ports (USB virtual serial ports used by most thermal receipt printers)
    const cmd4 = 'powershell -Command "Get-WmiObject Win32_SerialPort | Select-Object Name,DeviceID,Description | ConvertTo-Json -Compress"'
    exec(cmd4, (error: any, stdout: string, stderr: string) => {
      if (!error && stdout.trim()) {
        try {
          const trimmed = stdout.trim()
          let ports: any[]
          if (trimmed.startsWith('[')) {
            ports = JSON.parse(trimmed)
          } else if (trimmed.startsWith('{')) {
            ports = [JSON.parse(trimmed)]
          } else {
            checkDone()
            return
          }
          ports.forEach((port: any) => {
            // Add both DeviceID (COMx) and Description as printer name
            if (port.DeviceID) {
              allPrinters.add(port.DeviceID)
            }
            if (port.Name && port.Name !== port.DeviceID) {
              allPrinters.add(port.Name)
            }
          })
          console.log('[LIST-PRINTERS] COM ports found:', ports.length)
        } catch (e: any) {
          console.error('[LIST-PRINTERS] COM port parse error:', e.message)
          hasError = true
        }
      } else {
        console.error('[LIST-PRINTERS] COM port enum error:', error?.message)
      }
      checkDone()
    })
  })
})

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

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

ipcMain.handle('get-log-entries', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'logs', 'main.log')
    const fs = require('fs')
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf-8')
      const entries = content.split('\n').filter(Boolean).slice(-100).map((line: string) => {
        const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]\s*\[(\w+)\]\s*(.*)$/)
        if (match) {
          return { timestamp: match[1], level: match[2].toLowerCase(), message: match[3] }
        }
        return { timestamp: '', level: 'info', message: line }
      })
      return JSON.stringify(entries)
    }
  } catch (e) {}
  return '[]'
})

ipcMain.handle('set-api-url', (_event, url: string) => {
  const fs = require('fs')
  // 验证 URL 格式：只允许 /api 相对路径或明确的 http/https URL
  const isValidUrl = typeof url === 'string' && (
    url === '/api' ||
    url.startsWith('/api?') ||
    url.startsWith('/api/') ||
    /^https?:\/\/[^/]+\/api\/?/.test(url)
  )
  if (!isValidUrl) {
    console.error('[API URL] Invalid URL rejected:', url)
    return false
  }
  const configPath = path.join(app.getPath('userData'), 'api-config.json')
  try {
    fs.writeFileSync(configPath, JSON.stringify({ apiUrl: url }, null, 2))
    return true
  } catch (e) {
    console.error('[API URL] Failed to save:', e)
    return false
  }
})

// 窗口控制 IPC
ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize()
    return true
  }
  return false
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
    return mainWindow.isMaximized()
  }
  return false
})

ipcMain.handle('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
    return true
  }
  return false
})

ipcMain.handle('window-is-maximized', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isMaximized()
  }
  return false
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

ipcMain.on('payment-qr', (_event, qrData) => {
  if (customerWindow && !customerWindow.isDestroyed()) {
    customerWindow.webContents.send('payment-qr', qrData)
  }
})

/** Resolve the exact configured device; no system/fuzzy/default fallback. */
async function resolvePrinterName(providedName?: string): Promise<string> {
  const direct = (providedName || '').trim()
  if (!direct) throw new Error('No printer target configured')
  if (/^COM\d+$/i.test(direct) || /^\\\\[^\\]+\\[^\\]+$/.test(direct)) return exactPrinterName(direct, [])
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Printer inventory unavailable')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Printer inventory timeout')), 1500)
    })
    const installed = await Promise.race([mainWindow.webContents.getPrintersAsync(), timeout])
    return exactPrinterName(direct, installed)
  } finally { if (timer) clearTimeout(timer) }
}

/**
 * 原生 Windows winspool.drv RAW 方式发送二进制指令（钱箱脉冲、ESC/POS 小票）
 * 100% 适用于 Windows 所有 USB 热敏小票打印机驱动，不走 GDI 文本转换
 */
function sendRawBytesToWindowsPrinter(printerName: string, rawBytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const os = require('os')
    const path = require('path')
    const tempFile = path.join(os.tmpdir(), `pos_raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.bin`)

    try {
      fs.writeFileSync(tempFile, rawBytes)
    } catch (err: any) {
      writeCrash(`[WIN-RAW] Failed to write temp binary file: ${err.message}`)
      reject(err)
      return
    }

    const cleanup = () => {
      try { fs.unlinkSync(tempFile) } catch (e) {}
    }

    if (process.platform !== 'win32') {
      const cmd = printerName ? `lp -d "${printerName}" -o raw "${tempFile}"` : `lp -o raw "${tempFile}"`
      execChild(cmd, { timeout: 15000 }, (error) => {
        cleanup()
        if (error) {
          writeCrash(`[WIN-RAW] macOS/Linux lp error: ${error.message}`)
          reject(error)
        } else {
          writeCrash(`[WIN-RAW] macOS/Linux lp success`)
          resolve()
        }
      })
      return
    }

    // Windows P/Invoke 调用 winspool.drv 的 OpenPrinterW + StartDocPrinterW + WritePrinter (Unicode 原生版)
    const safePrinterName = printerName.replace(/'/g, "''")
    const safeTempFile = tempFile.replace(/'/g, "''")

    const psScript = `
$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class WinSpoolRaw {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendFile(string szPrinter, string szFile) {
        if (!File.Exists(szFile)) return false;
        byte[] bytes = File.ReadAllBytes(szFile);
        if (bytes.Length == 0) return false;

        IntPtr hPrinter = IntPtr.Zero;
        DOCINFOW di = new DOCINFOW();
        di.pDocName = "POS_RAW_JOB";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinter, out hPrinter, IntPtr.Zero)) {
            return false;
        }

        bool ok = false;
        if (StartDocPrinter(hPrinter, 1, di)) {
            IntPtr pBuf = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pBuf, bytes.Length);
            Int32 written = 0;
            bool pageStarted = StartPagePrinter(hPrinter);
            ok = WritePrinter(hPrinter, pBuf, bytes.Length, out written);
            if (pageStarted) {
                EndPagePrinter(hPrinter);
            }
            Marshal.FreeCoTaskMem(pBuf);
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        return ok;
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp
} catch {}

$res = [WinSpoolRaw]::SendFile('${safePrinterName}', '${safeTempFile}')
if ($res) {
    Write-Output "SUCCESS"
    exit 0
} else {
    Write-Error "WinSpool OpenPrinter or WritePrinter failed for printer: ${safePrinterName}"
    exit 1
}
`
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { shell: false })
    let stderr = ''
    let stdout = ''
    let settled = false

    const watchdog = setTimeout(() => {
      if (!settled) {
        settled = true
        try { proc.kill() } catch {}
        cleanup()
        writeCrash(`[WIN-RAW] PowerShell timed out (15s) for printer '${printerName}'`)
        reject(new Error(`PowerShell print timeout for '${printerName}'`))
      }
    }, 15000)

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      cleanup()
      if (code === 0 && stdout.includes('SUCCESS')) {
        writeCrash(`[WIN-RAW] Successfully sent ${rawBytes.length} bytes to printer '${printerName}'`)
        resolve()
      } else {
        const errMsg = stderr.trim() || `Exit code ${code}`
        writeCrash(`[WIN-RAW] Failed to send to '${printerName}': ${errMsg}`)
        reject(new Error(errMsg))
      }
    })

    proc.on('error', (err: Error) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      cleanup()
      writeCrash(`[WIN-RAW] Spawn error: ${err.message}`)
      reject(err)
    })
  })
}

/**
 * 打印小票 - 优先使用 winspool.drv RAW 原生打印，支持内嵌弹钱箱脉冲
 */
let receiptPrintBusy = false
ipcMain.handle('print-receipt', async (_event, data) => {
  if (receiptPrintBusy) return { success: false, error: 'Receipt handover is still in progress' }
  receiptPrintBusy = true
  let copiesSubmitted = 0
  try {
    const printerName = data.printerHost ? '' : await resolvePrinterName(data.printerName)
    const { printerHost, printerPort, blocks, openCashDrawer: shouldOpenDrawer } = data

    writeCrash(`[PRINT] ====== print-receipt called ======`)
    writeCrash(`[PRINT] resolved printerName='${printerName}' (original: '${data.printerName}')`)
    writeCrash(`[PRINT] printerHost='${printerHost}' port=${printerPort}`)
    writeCrash(`[PRINT] hasBlocks=${!!(blocks && blocks.length > 0)}`)
    writeCrash(`[PRINT] openCashDrawer=${!!shouldOpenDrawer}`)
    writeCrash(`[PRINT] orderNum=${data.orderNum} total=${data.total}`)

    // 钱箱开锁脉冲指令：根据后台配置的 cashDrawerPulse 毫秒数动态计算脉冲 (Pin 2 + Pin 5 + DLE DC4 + BEL)
    const pulseMs = Math.max(20, Math.min(500, data.cashDrawerPulse || 100))
    const onTime = Math.round(pulseMs / 2)
    const offTime = Math.round(pulseMs / 2)
    const drawerCmd = shouldOpenDrawer ? Buffer.from([
      0x1B, 0x70, 0x00, onTime, offTime,
      0x1B, 0x70, 0x01, onTime, offTime,
      0x10, 0x14, 0x01, 0x00, 0x05,
      0x07
    ]) : Buffer.alloc(0)

    // 生成 ESC/POS 原始打印指令 (支持多联打印 printCopies)
    data.printWarnings = []
    const requestedCopies = Number(data.printCopies)
    const printCopies = Number.isFinite(requestedCopies) ? Math.max(1, Math.min(5, Math.floor(requestedCopies))) : 1
    const initCmd = Buffer.from([0x1B, 0x40])  // ESC @ 初始化
    const is80mm = data.paperSize === '80mm'

    // 58mm 与 80mm 切纸与走纸隔离：
    // 58mm 热敏机均为手动锯齿撕纸机，无自动切刀，坚决不发送 GS V 切刀指令（否则固件报 Cutter Error 并锁定出纸电机）
    // 80mm 热敏机采用 LF*3 + GS V 1 (0x1D 0x56 0x01) 弹性半切，避免纸张滑落或卡刀
    const cutCmd = is80mm
      ? Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x01])
      : Buffer.from([0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A])

    if (!printerHost && !printerName) return { success: false, error: 'No printer available on system' }
    const lang = (data.language || 'id').toLowerCase()
    const handover = lang === 'zh' ? {
      title: '小票交接',
      message: '请等待出纸，撕下顾客联并交给顾客。',
      later: '请等待出纸并撕下上一联。',
      button: '已撕下，打印操作员联',
      next: '已撕下，打印下一联'
    } : lang === 'en' ? {
      title: 'Receipt handover',
      message: 'Wait for printing, tear off the customer copy and hand it to the customer.',
      later: 'Wait for printing and tear off the previous copy.',
      button: 'Torn off — print operator copy',
      next: 'Torn off — print next copy'
    } : {
      title: 'Penyerahan struk',
      message: 'Tunggu struk keluar, sobek salinan pelanggan dan berikan kepada pelanggan.',
      later: 'Tunggu struk keluar dan sobek salinan sebelumnya.',
      button: 'Sudah disobek — cetak salinan operator',
      next: 'Sudah disobek — cetak salinan berikutnya'
    }
    for (let c = 0; c < printCopies; c++) {
      if (c > 0) {
        const options = {
          type: 'info' as const,
          title: handover.title,
          message: c === 1 ? handover.message : handover.later,
          detail: `${data.orderNum || ''} · ${c}/${printCopies}`,
          buttons: [c === 1 ? handover.button : handover.next],
          defaultId: 0,
          cancelId: -1,
          noLink: true
        }
        const confirmation = mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showMessageBox(mainWindow, options)
          : await dialog.showMessageBox(options)
        if (confirmation.response !== 0) {
          return { success: false, copiesSubmitted, error: 'Receipt handover interrupted; remaining copies were not sent' }
        }
      }
      const copyData = printCopies > 1 ? {
        ...data,
        copyLabel: c === 0 ? '(Customer Copy)' : '(Merchant Copy)'
      } : data
      let receiptBuf: Buffer
      try {
        receiptBuf = await buildReceiptEscPosBuffer(copyData)
      } catch (err: any) {
        writeCrash(`[PRINT] buildReceiptEscPosBuffer call failed: ${err?.message}`)
        receiptBuf = Buffer.concat([encodeEscPosText(generateReceiptText(copyData)), Buffer.from([0x0A, 0x0A])])
      }
      // 只有第一联出纸前触发弹钱箱
      const firstDrawerCmd = (c === 0 && shouldOpenDrawer) ? drawerCmd : Buffer.alloc(0)
      // 指令顺序安全化：ESC @ 初始化置于作业首部，钱箱脉冲紧随其后，接着输出全格式化 ESC/POS 数据，切纸
      const rawBytes = Buffer.concat([initCmd, firstDrawerCmd, receiptBuf, cutCmd])
      writeCrash(`[PRINT] copy=${c + 1}/${printCopies} rawBytes length=${rawBytes.length}`)
      if (printerHost && printerPort) {
        await printViaNetworkRaw(rawBytes, printerHost, printerPort)
      } else if (/^COM\d+/i.test(printerName)) {
        await printViaComPort(printerName, rawBytes)
      } else {
        // A transport error may occur after acceptance. Never resend automatically.
        try {
          await sendRawBytesToWindowsPrinter(printerName, rawBytes)
        } catch (error: any) {
          return { success: false, copiesSubmitted, deliveryStatus: 'unconfirmed', error: 'Print delivery unconfirmed: ' + error.message }
        }
      }
      copiesSubmitted++
    }
    return { success: true, copiesSubmitted, warnings: [...new Set(data.printWarnings)] }

  } catch (error: any) {
    writeCrash(`[PRINT] print-receipt error: ${error.message}`)
    return { success: false, copiesSubmitted, error: error.message }
  } finally {
    receiptPrintBusy = false
  }
})

/**
 * 串口打印 - 直接发送 ESC/POS 命令到 COM 口
 */
function printViaComPort(comPort: string, rawBytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process')
    const ps = `
      Add-Type -AssemblyName System
      $port = New-Object System.IO.Ports.SerialPort '${comPort}',9600,None,8,One
      $port.Open()
      Start-Sleep -Milliseconds 150
      $bytes = [byte[]]@(${Array.from(rawBytes).join(',')})
      $port.Write($bytes, 0, $bytes.Length)
      Start-Sleep -Milliseconds 100
      $port.Close()
      Write-Output 'OK'
    `
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { shell: false })
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number) => {
      if (code === 0) {
        writeCrash(`[COM] ${comPort} write success`)
        resolve()
      } else {
        writeCrash(`[COM] ${comPort} failed: ${stderr.trim()}`)
        reject(new Error(`COM port write failed: ${stderr.trim()}`))
      }
    })
    proc.on('error', (err: Error) => {
      writeCrash(`[COM] ${comPort} spawn error: ${err.message}`)
      reject(err)
    })
  })
}

/**
 * 网络打印 - 直接发送 ESC/POS 命令或二进制流到网口热敏打印机
 */
function printViaNetworkRaw(data: Buffer | string, host: string, port: number): Promise<void> {
  const net = require('net')
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    const buffer = Buffer.isBuffer(data) ? data : encodeEscPosText(data)
    const timeout = setTimeout(() => {
      client.destroy()
      reject(new Error(`Network print timeout (${host}:${port})`))
    }, 10000)

    client.connect(port, host, () => {
      clearTimeout(timeout)
      client.write(buffer, (err: any) => {
        if (err) {
          client.end()
          reject(err)
        } else {
          client.end()
          writeCrash(`[PRINT] Network raw data sent to ${host}:${port}`)
          resolve()
        }
      })
    })

    client.on('error', (err: any) => {
      clearTimeout(timeout)
      writeCrash(`[PRINT] Network socket error (${host}:${port}): ${err.message}`)
      reject(err)
    })
  })
}

function printViaNetwork(text: string, host: string, port: number): Promise<void> {
  return printViaNetworkRaw(text, host, port)
}

/**
 * 原生打印回退
 */
async function printViaWindowsRaw(data: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const text = data.text || generateReceiptText(data)
    const printerName = (data.printerName || '').trim()
    const os = require('os')
    const path = require('path')
    const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`)

    try {
      fs.writeFileSync(tempFile, text, { encoding: 'utf8' })
    } catch (err: any) {
      reject(err)
      return
    }

    const cleanup = () => {
      try { fs.unlinkSync(tempFile) } catch (e) {}
    }

    if (process.platform === 'darwin' || process.platform === 'linux') {
      const cmd = printerName ? `lp -d "${printerName}" "${tempFile}"` : `lp "${tempFile}"`
      execChild(cmd, { timeout: 15000 }, (error) => {
        cleanup()
        if (error) reject(error)
        else resolve()
      })
      return
    }

    const safePrinterName = printerName.replace(/'/g, "''")
    const safeTempFile = tempFile.replace(/'/g, "''")
    const psCmd = printerName
      ? `Get-Content -LiteralPath '${safeTempFile}' | Out-Printer -Name '${safePrinterName}'`
      : `Get-Content -LiteralPath '${safeTempFile}' | Out-Printer`

    execChild(`powershell -NoProfile -NonInteractive -Command "${psCmd}"`, { timeout: 15000 }, (psErr) => {
      cleanup()
      if (!psErr) {
        resolve()
      } else {
        reject(psErr)
      }
    })
  })
}

/**
 * 打开钱箱 - 自动识别打印机 + 多协议钱箱开锁脉冲 (Pin 2 + Pin 5 + DLE DC4 + BEL)
 */
ipcMain.handle('open-cash-drawer', async (_event, data) => {
  try {
    const printerName = data?.printerHost ? '' : await resolvePrinterName(data?.printerName)
    const pulseMs = Math.max(20, Math.min(500, data?.cashDrawerPulse || 100))

    writeCrash(`[CASH DRAWER] ====== open-cash-drawer called ======`)
    writeCrash(`[CASH DRAWER] resolved printerName='${printerName}' (original: '${data?.printerName}')`)
    writeCrash(`[CASH DRAWER] cashDrawerPulse=${pulseMs}ms`)

    // 多重兼容 ESC/POS 钱箱开锁脉冲命令：
    // 1. Pin 2 脉冲: ESC p 0 on off (0x1B, 0x70, 0x00, on, off)
    // 2. Pin 5 脉冲: ESC p 1 on off (0x1B, 0x70, 0x01, on, off)
    // 3. DLE DC4 脉冲: 0x10, 0x14, 0x01, 0x00, 0x05 (Epson/Star 机型专用)
    // 4. ASCII BEL 响铃触发: 0x07
    const onTime = Math.round(pulseMs / 2)
    const offTime = Math.round(pulseMs / 2)
    const drawerCmd = Buffer.from([
      0x1B, 0x70, 0x00, onTime, offTime, // Pin 2
      0x1B, 0x70, 0x01, onTime, offTime, // Pin 5
      0x10, 0x14, 0x01, 0x00, 0x05,       // DLE DC4
      0x07                               // BEL
    ])
    writeCrash(`[CASH DRAWER] cmd bytes: ${drawerCmd.toString('hex')}`)

    // 0. 网络打印机钱箱
    if (data?.printerHost && data?.printerPort) {
      try {
        await printViaNetworkRaw(drawerCmd, data.printerHost, data.printerPort)
        writeCrash('[CASH DRAWER] printViaNetworkRaw cash drawer success')
        return { success: true }
      } catch (netErr: any) {
        writeCrash(`[CASH DRAWER] printViaNetworkRaw cash drawer failed: ${netErr.message}`)
        return { success: false, error: netErr.message }
      }
    }

    if (!printerName) {
      writeCrash('[CASH DRAWER] ERROR: No printer available on Windows system')
      return { success: false, error: 'No printer available on system' }
    }

    // 1. COM 口（虚拟串口）
    const isComPort = /^COM\d+/i.test(printerName)
    if (isComPort) {
      try {
        await printViaComPort(printerName, drawerCmd)
        writeCrash('[CASH DRAWER] printViaComPort success')
        return { success: true }
      } catch (comErr: any) {
        writeCrash(`[CASH DRAWER] printViaComPort failed: ${comErr.message}`)
        return { success: false, error: comErr.message }
      }
    }

    // A failed send may already have pulsed the drawer. Never pulse automatically again.
    try {
      await sendRawBytesToWindowsPrinter(printerName, drawerCmd)
      return { success: true }
    } catch (error: any) {
      return { success: false, deliveryStatus: 'unconfirmed', error: 'Drawer delivery unconfirmed: ' + error.message }
    }

  } catch (error: any) {
    writeCrash(`[CASH DRAWER] error: ${error.message}`)
    return { success: false, error: error.message }
  }
})

/**
 * 发送厨房小票 - 支持网络打印机和本地打印机
 */
ipcMain.handle('send-kitchen-order', async (_event, data) => {
  try {
    const { orderNum, pickupNumber, printerHost, printerPort, items } = data
    const printerName = printerHost ? '' : await resolvePrinterName(data.printerName)

    writeCrash(`[KITCHEN] ====== send-kitchen-order called ======`)
    writeCrash(`[KITCHEN] orderNum='${orderNum}' pickupNumber='${pickupNumber || ''}' printerName='${printerName}'`)
    writeCrash(`[KITCHEN] printerHost='${printerHost}' port=${printerPort}`)

    if (!orderNum) {
      writeCrash('[KITCHEN] ERROR: orderNum is empty')
      return { success: false, error: 'No order number provided' }
    }

    // 生成厨房小票文本
    const kitchenText = generateKitchenText({ orderNum, pickupNumber, items, language: data.language })
    writeCrash(`[KITCHEN] text length=${kitchenText.length}`)

    // 网络打印机（优先）
    if (printerHost && printerPort) {
      try {
        await printViaNetwork(kitchenText, printerHost, printerPort)
        writeCrash('[KITCHEN] Network print success')
        return { success: true }
      } catch (netErr: any) {
        writeCrash(`[KITCHEN] Network print failed: ${netErr.message}`)
        return { success: false, error: netErr.message }
      }
    }

    // 本地打印机（COM 口或 Windows 打印机名）
    if (printerName) {
      const isComPort = /^COM\d+/i.test(printerName)
      const initCmd = Buffer.from([0x1B, 0x40])  // ESC @
      const is80mm = data.paperSize === '80mm'
      const cutCmd = is80mm
        ? Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x01])
        : Buffer.from([0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A])
      const rawBytes = Buffer.concat([initCmd, encodeEscPosText(kitchenText), cutCmd])

      if (isComPort) {
        try {
          await printViaComPort(printerName, rawBytes)
          writeCrash('[KITCHEN] COM port print success')
          return { success: true }
        } catch (comErr: any) {
          writeCrash(`[KITCHEN] COM port print failed: ${comErr.message}`)
          return { success: false, error: comErr.message }
        }
      } else {
        // Windows 打印机名：优先尝试 winspool.drv RAW 原生打印
        try {
          await sendRawBytesToWindowsPrinter(printerName, rawBytes)
          writeCrash('[KITCHEN] sendRawBytesToWindowsPrinter success')
          return { success: true }
        } catch (winRawErr: any) {
          writeCrash(`[KITCHEN] Delivery unconfirmed: ${winRawErr.message}`)
          return { success: false, deliveryStatus: 'unconfirmed', error: 'Print delivery unconfirmed: ' + winRawErr.message }
        }
      }
    }

    writeCrash('[KITCHEN] ERROR: no printer configured')
    return { success: false, error: 'No printer configured' }
  } catch (error: any) {
    writeCrash(`[KITCHEN] error: ${error.message}`)
    return { success: false, error: error.message }
  }
})

/**
 * 打印交接班对账小票 (Z-Report)
 */
ipcMain.handle('print-shift-report', async (_event, data) => {
  try {
    writeCrash(`[SHIFT-REPORT] ====== print-shift-report called ======`)
    const resolvedName = data.printerHost ? '' : await resolvePrinterName(data.printerName)
    const text = generateShiftReportText(data)

    if (data.printerHost && data.printerPort) {
      try {
        await printViaNetwork(text, data.printerHost, data.printerPort)
        writeCrash('[SHIFT-REPORT] Network print success')
        return { success: true }
      } catch (netErr: any) {
        writeCrash(`[SHIFT-REPORT] Network print failed: ${netErr.message}`)
        return { success: false, error: netErr.message }
      }
    }

    if (resolvedName) {
      const isComPort = /^COM\d+/i.test(resolvedName)
      const initCmd = Buffer.from([0x1B, 0x40])  // ESC @
      const is80mm = data.paperSize === '80mm'
      const cutCmd = is80mm
        ? Buffer.from([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x01])
        : Buffer.from([0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A, 0x0D, 0x0A])
      const rawBytes = Buffer.concat([initCmd, encodeEscPosText(text), cutCmd])

      if (isComPort) {
        try {
          await printViaComPort(resolvedName, rawBytes)
          writeCrash('[SHIFT-REPORT] COM port print success')
          return { success: true }
        } catch (comErr: any) {
          writeCrash(`[SHIFT-REPORT] COM port print failed: ${comErr.message}`)
          return { success: false, error: comErr.message }
        }
      } else {
        try {
          await sendRawBytesToWindowsPrinter(resolvedName, rawBytes)
          writeCrash('[SHIFT-REPORT] sendRawBytesToWindowsPrinter success')
          return { success: true }
        } catch (winRawErr: any) {
          writeCrash(`[SHIFT-REPORT] Delivery unconfirmed: ${winRawErr.message}`)
          return { success: false, deliveryStatus: 'unconfirmed', error: 'Print delivery unconfirmed: ' + winRawErr.message }
        }
      }
    }

    writeCrash('[SHIFT-REPORT] ERROR: no receipt printer found')
    return { success: false, error: 'No receipt printer found for shift report' }
  } catch (err: any) {
    writeCrash(`[SHIFT-REPORT] error: ${err.message}`)
    return { success: false, error: err.message }
  }
})

/**
 * 打印茶饮单杯杯贴/不干胶标签 (TSPL / ESC-POS)
 */
ipcMain.handle('print-cup-stickers', async (_event, data) => {
  try {
    const { printerName, printerHost, printerPort, stickers, isTspl = true } = data
    if (!stickers || stickers.length === 0) return { success: true }

    writeCrash(`[STICKER] ====== print-cup-stickers called, count=${stickers.length} ======`)
    const resolvedName = printerHost ? '' : await resolvePrinterName(printerName)
    const chunks: Buffer[] = []

    for (const item of stickers) {
      if (isTspl) {
        const tsplStr = generateCupStickerTspl(item)
        chunks.push(encodeEscPosText(tsplStr))
      } else {
        const escStr = generateCupStickerEscPos(item)
        const initCmd = Buffer.from([0x1B, 0x40])
        const cutCmd = Buffer.from([0x1D, 0x56, 0x00, 0x0A])
        chunks.push(Buffer.concat([initCmd, encodeEscPosText(escStr), cutCmd]))
      }
    }
    const rawBytes = Buffer.concat(chunks)

    if (printerHost && printerPort) {
      try {
        await printViaNetworkRaw(rawBytes, printerHost, printerPort)
        writeCrash('[STICKER] Network print success')
        return { success: true }
      } catch (netErr: any) {
        writeCrash(`[STICKER] Network print failed: ${netErr.message}`)
        return { success: false, error: netErr.message }
      }
    }

    if (resolvedName) {
      const isComPort = /^COM\d+/i.test(resolvedName)
      if (isComPort) {
        try {
          await printViaComPort(resolvedName, rawBytes)
          writeCrash('[STICKER] COM port print success')
          return { success: true }
        } catch (comErr: any) {
          writeCrash(`[STICKER] COM port print failed: ${comErr.message}`)
          return { success: false, error: comErr.message }
        }
      } else {
        // 1. 优先使用 Windows WinSpool RAW 原生方式（直接写入打印后台，兼容所有主流 USB 标签机）
        try {
          await sendRawBytesToWindowsPrinter(resolvedName, rawBytes)
          writeCrash('[STICKER] sendRawBytesToWindowsPrinter success')
          return { success: true }
        } catch (winRawErr: any) {
          writeCrash(`[STICKER] Delivery unconfirmed: ${winRawErr.message}`)
          return { success: false, deliveryStatus: 'unconfirmed', error: 'Print delivery unconfirmed: ' + winRawErr.message }
        }
      }
    }

    writeCrash('[STICKER] ERROR: no label printer configured')
    return { success: false, error: 'No label printer configured' }
  } catch (err: any) {
    writeCrash(`[STICKER] error: ${err.message}`)
    return { success: false, error: err.message }
  }
})

/**
 * 生成交接班对账单文本
 */
function generateShiftReportText(data: any): string {
  const width = data.paperSize === '80mm' ? 48 : 32
  const lang = (data.language || 'id').toLowerCase()
  const label = (zh: string, en: string, id: string) => lang === 'zh' ? zh : lang === 'en' ? en : id
  const unknown = label('待核对', 'Unverified', 'Perlu diperiksa')
  const lines: string[] = []
  const number = (value: unknown): value is number => Number.isSafeInteger(value)
  const wrap = (text: string) => {
    let row = ''
    for (const ch of text) {
      if (getVisualWidth(row + ch) > width) { lines.push(row); row = '' }
      row += ch
    }
    lines.push(row)
  }
  const row = (name: string, value: string) => {
    const gap = width - getVisualWidth(name) - getVisualWidth(value)
    if (gap < 1) { wrap(name); if (getVisualWidth(value) > width) wrap(value); else lines.push(padStartVisual(value, width)) }
    else lines.push(name + ' '.repeat(gap) + value)
  }
  const money = (name: string, value: unknown) => row(name, number(value) ? formatRp(value) : unknown)
  const time = (name: string, value: unknown) => {
    wrap(name)
    const date = value instanceof Date ? value : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? new Date(value) : null
    if (!date || !Number.isFinite(date.getTime())) { wrap(unknown); return }
    const local = new Date(date.getTime() + 7 * 3600000).toISOString()
    row(`${local.slice(8,10)}/${local.slice(5,7)}/${local.slice(0,4)}`, local.slice(11,19))
  }
  const separator = () => lines.push(repeatChar('-', width))
  wrap(data.storeName || 'YOUME')
  wrap(label('交接班记录', 'SHIFT HANDOVER', 'SERAH TERIMA SHIFT'))
  if (data.sessionId) { wrap(label('班次凭据', 'Session reference', 'Referensi shift')); wrap(String(data.sessionId)) }
  separator()
  row(label('交班员工', 'Cashier', 'Kasir'), data.cashierName || unknown)
  const names = data.shiftNames || {}
  const shiftName = (lang === 'zh' ? names.nameZh : lang === 'id' ? names.nameId : names.name) || names.name
  const fallback: Record<string,string> = {morning:label('早班','Morning','Pagi'),afternoon:label('午班','Afternoon','Siang'),evening:label('晚班','Evening','Sore'),night:label('夜班','Night','Malam')}
  row(label('班次', 'Shift', 'Shift'), shiftName || fallback[data.shiftType] || data.shiftType || unknown)
  time(label('开班时间', 'Opened', 'Mulai'), data.openedAt)
  time(label('交班时间', 'Closed', 'Selesai'), data.closedAt)
  time(label('打印时间', 'Printed', 'Dicetak'), new Date())
  separator()
  const evidence = data.summaryEvidence || {}
  const verified = evidence.verified === true
  wrap(label('销售及现金记录', 'SALES / CASH RECORDS', 'CATATAN PENJUALAN / KAS'))
  if (!verified) wrap(label('按开班至交班时间统计，待核对', 'Opening-to-close records; unverified', 'Catatan waktu shift; perlu diperiksa'))
  const si = data.summaryItems || {}
  if (si.openFloat !== false) money(label('开班备用金', 'Opening float', 'Kas awal'), data.openFloat)
  if (si.cashSales !== false) money(label('现金销售记录', 'Recorded cash sales', 'Penjualan tunai'), evidence.cashSales)
  if (si.qrisSales !== false) money(label('QRIS销售记录', 'Recorded QRIS', 'Penjualan QRIS'), evidence.qrisReceipts)
  if (si.cashIn !== false) money(label('现金存入记录', 'Recorded cash in', 'Kas masuk'), evidence.cashIns)
  if (si.cashOut !== false) money(label('现金支出记录', 'Recorded cash out', 'Kas keluar'), evidence.cashOuts)
  const amounts = [data.openFloat,evidence.cashSales,evidence.cashIns,evidence.cashOuts]
  const recordedBalance = amounts.every(number) ? data.openFloat + evidence.cashSales + evidence.cashIns - evidence.cashOuts : null
  money(label('记录推算现金', 'Recorded cash balance', 'Saldo kas tercatat'), recordedBalance)
  if (si.closeCash !== false) money(label('实际盘点现金', 'Counted cash', 'Kas dihitung'), data.actualCash)
  const expected = verified && number(data.expectedCash) && data.expectedCash === recordedBalance ? data.expectedCash : null
  money(label('钱箱应有现金', 'Expected cash', 'Kas seharusnya'), expected)
  money(label('现金差额', 'Variance', 'Selisih'), number(expected) && number(data.actualCash) ? data.actualCash - expected : null)
  separator()
  if (si.orderCount !== false) row(label('完成订单记录', 'Completed orders', 'Pesanan selesai'), number(evidence.orderCount) ? String(evidence.orderCount) : unknown)
  row(label('商品杯数记录', 'Item quantity', 'Jumlah minuman'), number(evidence.cupCount) ? String(evidence.cupCount) : unknown)
  if (si.expenses !== false) {
    separator()
    wrap(label('本班采购报销', 'SHIFT PURCHASE EXPENSES', 'BELANJA SHIFT'))
    const purchases = data.purchaseExpenses
    if (purchases && number(purchases.total) && Array.isArray(purchases.items)) {
      for (const item of purchases.items) { money(`${item.category} x${item.quantity ?? '-'}`, item.amount); if (item.description) wrap(String(item.description)) }
      money(label('采购合计', 'Purchase total', 'Total belanja'), purchases.total)
    } else wrap(unknown)
    wrap(label('采购记账，不等于钱箱已付款', 'Expense recorded; cash payout separate', 'Biaya dicatat; kas dibayar terpisah'))
  }
  if (!verified) { separator(); wrap(label('销售归属、离线上传及退款需核对', 'Review sales attribution, uploads and refunds', 'Periksa penjualan, unggahan dan refund')) }
  separator()
  wrap(label('收银员签字:', 'Cashier sign:', 'Ttd Kasir:'))
  lines.push('________________________', '')
  wrap(label('主管签字:', 'Supervisor sign:', 'Ttd Supervisor:'))
  lines.push('________________________')
  return lines.join('\n') + '\n\n\n'
}

/**
 * 生成 TSPL 茶饮杯贴指令 (40mm x 30mm / 50mm x 30mm)
 */
function generateCupStickerTspl(item: any): string {
  const store = item.storeName || 'YOUME'
  const displayNo = item.pickupNumber || item.orderNum || ''
  const cupNo = item.cupIndex && item.totalCups ? `[${item.cupIndex}/${item.totalCups}]` : ''
  const promoBadge = item.promoTag ? ` [${item.promoTag}]` : ''
  const name = (item.productName || item.name || '').slice(0, 24)
  const spec = item.specName || ''
  const sugar = item.sugarLevelName ? `Sugar: ${item.sugarLevelName}` : ''
  const ice = item.iceLevelName ? `Ice: ${item.iceLevelName}` : ''
  const mods = [sugar, ice].filter(Boolean).join(' | ')
  const addons = (item.addons || []).map((a: any) => `+${a.name || a}`).join(', ').slice(0, 30)
  const time = item.time || formatDateTime().slice(11, 19)
  const channel = item.channelName ? `(${item.channelName})` : ''

  const widthMm = Number(item.stickerWidth) || 40
  const heightMm = Number(item.stickerHeight) || 30
  const gapMm = Number(item.stickerGap) || 2

  const tspl = [
    `SIZE ${widthMm} mm, ${heightMm} mm`,
    `GAP ${gapMm} mm, 0 mm`,
    'DIRECTION 1',
    'CLS',
    `TEXT 15,15,"TSS24.BF2",0,1,1,"${store} #${displayNo} ${cupNo}${promoBadge}"`,
    `TEXT 15,48,"TSS24.BF2",0,1,1,"${name}"`,
    spec ? `TEXT 15,80,"TSS24.BF2",0,1,1,"${spec}  ${mods}"` : (mods ? `TEXT 15,80,"TSS24.BF2",0,1,1,"${mods}"` : ''),
    addons ? `TEXT 15,112,"TSS24.BF2",0,1,1,"${addons}"` : '',
    `TEXT 15,150,"2",0,1,1,"${time} ${channel}"`,
    'PRINT 1,1',
    ''
  ].filter(Boolean).join('\r\n')

  return tspl
}

/**
 * 生成 ESC/POS 单杯杯贴降级文本
 */
function generateCupStickerEscPos(item: any): string {
  const lines: string[] = []
  const width = 32
  const store = item.storeName || 'YOUME'
  const orderNum = item.orderNum || ''
  const cupNo = item.cupIndex && item.totalCups ? `[${item.cupIndex}/${item.totalCups}]` : ''
  const promoBadge = item.promoTag ? ` [${item.promoTag}]` : ''
  lines.push(centerText(`${store} #${orderNum} ${cupNo}${promoBadge}`, width))
  lines.push(repeatChar('-', width))
  lines.push(`${item.productName || item.name || ''} (${item.specName || 'Reg'})`)
  const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(' / ')
  if (mods) lines.push(`* ${mods}`)
  if (item.addons && item.addons.length > 0) {
    lines.push(`+ ${item.addons.map((a: any) => a.name || a).join(', ')}`)
  }
  lines.push(repeatChar('-', width))
  lines.push(`${formatTime()} ${item.channelName || ''}`)
  return lines.join('\n') + '\n\n\n'
}

/**
 * 生成厨房小票文本
 */
function generateKitchenText(data: any): string {
  const lines: string[] = []
  const width = 32
  const lang = (data.language || 'id').toLowerCase()

  const kitchenI18n: Record<string, Record<string, string>> = {
    zh: {
      title: '======== 厨房订单 ========',
      order: '桌号/单号',
      time: '时间',
      spec: '规格',
      sugarIce: '甜度/冰度',
      note: '备注'
    },
    en: {
      title: '====== KITCHEN ORDER ======',
      order: 'Table/Order',
      time: 'Time',
      spec: 'Size/Spec',
      sugarIce: 'Sugar/Ice',
      note: 'Note'
    },
    id: {
      title: '===== PESANAN DAPUR =====',
      order: 'Meja/Order',
      time: 'Waktu',
      spec: 'Varian',
      sugarIce: 'Gula/Es',
      note: 'Catatan'
    }
  }

  const L = kitchenI18n[lang] || kitchenI18n.id

  lines.push(centerText(L.title, width))
  if (data.pickupNumber) {
    lines.push(centerText(`*** ${data.pickupNumber} ***`, width))
  }
  lines.push(`${L.order}: ${data.orderNum || ''}`)
  lines.push(`${L.time}: ${formatTime()}`)
  lines.push(repeatChar('-', width))

  if (data.items && data.items.length > 0) {
    data.items.forEach((item: any) => {
      lines.push(`${item.quantity || 1} x ${item.productName || item.name || 'item'}`)
      if (item.specName) {
        lines.push(`  ${L.spec}: ${item.specName}`)
      }
      if (item.sugarLevelName || item.iceLevelName) {
        const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
        lines.push(`  ${L.sugarIce}: ${mods}`)
      }
      if (item.addons && item.addons.length > 0) {
        item.addons.forEach((addon: any) => {
          lines.push(`  + ${addon.name || addon}`)
        })
      }
      if (item.notes || item.note || item.remark) {
        lines.push(`  ${L.note}: ${item.notes || item.note || item.remark}`)
      }
    })
  }

  lines.push(repeatChar('-', width))
  lines.push('')

  return lines.join('\n') + '\n\n\n\n'
}

function formatTime(): string {
  const now = new Date()
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * ESC/POS 文本编码转换：
 * 绝大多数热敏小票机内置 GBK / GB18030 / CP437 字库，严禁使用 UTF-8 裸字节发送多字节字符。
 * 优先采用 gb18030 编码，确保 ASCII、印尼语及中文字符均能被硬件字库准确识别，杜绝错位乱码。
 */
function encodeEscPosText(text: string): Buffer {
  try {
    const iconv = require('iconv-lite')
    if (iconv?.encode) {
      return iconv.encode(text, 'gb18030')
    }
  } catch (e) {
    try {
      const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'iconv-lite')
      const iconv = require(unpacked)
      if (iconv?.encode) {
        return iconv.encode(text, 'gb18030')
      }
    } catch {}
  }
  // 降级使用 latin1 / ascii，避免 3 字节 UTF-8 导致热敏打印机配对乱码
  return Buffer.from(text, 'latin1')
}

/**
 * 将图片 Buffer 转换为 ESC/POS 点阵位图指令 (GS v 0)
 * 58mm 热敏纸有效点宽约为 384 dots，80mm 有效点宽约为 576 dots
 */
const logoMemoryCache = new Map<string, Buffer>()

function imageBufferToEscPosRaster(imageBuf: Buffer, targetWidthDots = 384, align = 'center'): Buffer | null {
  try {
    if (!imageBuf || imageBuf.length < 8) return null
    // 基础图片魔数校验（PNG: 89 50 4E 47, JPEG: FF D8, BMP: 42 4D, GIF: 47 49 46），严禁将 HTML 404 文本喂给 nativeImage
    const isImageMagic = (
      (imageBuf[0] === 0x89 && imageBuf[1] === 0x50 && imageBuf[2] === 0x4E && imageBuf[3] === 0x47) ||
      (imageBuf[0] === 0xFF && imageBuf[1] === 0xD8) ||
      (imageBuf[0] === 0x42 && imageBuf[1] === 0x4D) ||
      (imageBuf[0] === 0x47 && imageBuf[1] === 0x49)
    )
    if (!isImageMagic) {
      writeCrash(`[ESC/POS RASTER] Buffer is not a valid image format (magic: ${imageBuf.slice(0, 4).toString('hex')})`)
      return null
    }

    const nImg = nativeImage.createFromBuffer(imageBuf)
    if (nImg.isEmpty()) return null
    const size = nImg.getSize()
    if (!size.width || !size.height) return null

    // 确保宽度为 8 的倍数（ESC/POS 字节对齐要求）
    const targetW = Math.max(64, Math.min(targetWidthDots, Math.floor(targetWidthDots / 8) * 8))
    const targetH = Math.round((size.height / size.width) * targetW)
    if (targetH <= 0) return null

    const resized = nImg.resize({ width: targetW, height: targetH, quality: 'best' })
    const bitmap = resized.toBitmap() // BGRA 缓冲区，长度 = targetW * targetH * 4
    if (!bitmap || bitmap.length < targetW * targetH * 4) return null

    const byteWidth = Math.ceil(targetW / 8)
    const rasterData = Buffer.alloc(byteWidth * targetH, 0)

    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        const idx = (y * targetW + x) * 4
        const b = bitmap[idx]
        const g = bitmap[idx + 1]
        const r = bitmap[idx + 2]
        const a = bitmap[idx + 3]

        // 透明通道判定：若透明度 < 128 则视为纯白背景（不打点）
        // 灰度亮度加权判定：亮度阈值 170，低于此值视为黑色（打点）
        const isBlack = (a >= 128) && ((0.299 * r + 0.587 * g + 0.114 * b) < 170)
        if (isBlack) {
          const byteIdx = y * byteWidth + Math.floor(x / 8)
          const bitIdx = 7 - (x % 8)
          rasterData[byteIdx] |= (1 << bitIdx)
        }
      }
    }

    const xL = byteWidth & 0xff
    const xH = (byteWidth >> 8) & 0xff
    const yL = targetH & 0xff
    const yH = (targetH >> 8) & 0xff

    // ESC a 1 (居中) + GS v 0 0 xL xH yL yH + rasterData + \n + ESC a 0 (重置居左)
    return Buffer.concat([
      Buffer.from([0x1B, 0x61, align === 'left' ? 0 : align === 'right' ? 2 : 1]),
      Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
      rasterData,
      Buffer.from([0x0A, 0x1B, 0x61, 0x00])
    ])
  } catch (err: any) {
    writeCrash(`[ESC/POS RASTER] Failed to convert image to raster: ${err?.message}`)
    return null
  }
}

/**
 * 加载 Logo 图片字节
 * 远端图片异步下载，使用总时限避免打印无限等待。
 * 1. Base64 Data URL 优先（0ms 内存转换）
 * 2. 内存缓存优先（0ms）
 * 3. 本地文件系统直接读取（< 1ms）
 * 4. 首次打印等待有总时限和大小上限的远端下载，成功后缓存图片。
 */
async function loadLogoBuffer(logoUrlOrPath: string): Promise<Buffer | null> {
  if (!logoUrlOrPath) return null
  try {
    // 1. Data URL
    if (logoUrlOrPath.startsWith('data:image/')) {
      const parts = logoUrlOrPath.split(',')
      if (parts[1]) {
        return Buffer.from(parts[1], 'base64')
      }
    }

    // 2. 内存缓存
    if (logoMemoryCache.has(logoUrlOrPath)) {
      return logoMemoryCache.get(logoUrlOrPath) || null
    }

    // 3. Local File Path
    if (fs.existsSync(logoUrlOrPath)) {
      const buf = fs.readFileSync(logoUrlOrPath)
      logoMemoryCache.set(logoUrlOrPath, buf)
      return buf
    }

    // 4. Relative to resources / app
    const relativePaths = [
      getResourcePath(logoUrlOrPath.replace(/^\//, '')),
      getResourcePath(path.join('dist', logoUrlOrPath.replace(/^\//, ''))),
      path.join(app.getAppPath(), logoUrlOrPath.replace(/^\//, '')),
      path.join(app.getAppPath(), 'dist', logoUrlOrPath.replace(/^\//, ''))
    ]
    for (const p of relativePaths) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p)
        logoMemoryCache.set(logoUrlOrPath, buf)
        return buf
      }
    }

    const remote = /^https?:\/\//.test(logoUrlOrPath) ? logoUrlOrPath
      : logoUrlOrPath.startsWith('/') && !logoUrlOrPath.startsWith('//') ? `https://api.aicube.online${logoUrlOrPath}` : ''
    if (remote) {
      const buffer = await fetchReceiptLogo(remote)
      if (buffer) { logoMemoryCache.set(logoUrlOrPath, buffer); return buffer }
    }
  } catch (e: any) {
    writeCrash(`[LOGO LOAD] Failed to load logo from '${logoUrlOrPath}': ${e?.message}`)
  }
  return null
}

/**
 * ESC/POS 硬件原生格式化渲染引擎
 * 完整支持后台 ReceiptTemplate 配置的所有样式：
 * - 文字字号大小：GS ! 0x11 (大号倍宽倍高) / ESC M 1 (小号 Font B) / GS ! 0x00 (标准)
 * - 粗细：ESC E 1 (加粗) / ESC E 0 (普通)
 * - 对齐：ESC a 0 (居左) / ESC a 1 (居中) / ESC a 2 (居右)
 * - Logo 点阵位图：GS v 0 原生光栅位图输出
 * - 分割线：虚线 (dashed: - - -) / 实线 (line: ------) / 空行 (space) / 星号 (stars: ******)
 * - 条码与二维码：按模板排布位置内联渲染
 */
async function buildReceiptEscPosBuffer(data: any): Promise<Buffer> {
  try {
    const is80mm = data.paperSize === '80mm'
  const width = is80mm ? 48 : 32
  const targetDots = is80mm ? 576 : 384

  const lang = (data.language || 'id').toLowerCase()
  const i18nMap: Record<string, Record<string, string>> = {
    zh: {
      orderNo: 'NO.', queueNo: '取餐号', date: '日期', time: '时间', channel: '渠道', table: '桌号', cashier: '收银员',
      customer: '顾客', item: '商品名称', qty: '数量', price: '金额', subtotal: '小计:',
      tax: '税费:', discount: '优惠:', total: '总计:', pay: '实付:', change: '找零:',
      member: '会员:', points: '积分抵扣:', thanks: '=== 谢谢惠顾 欢迎光临 ==='
    },
    en: {
      orderNo: 'NO.', queueNo: 'QUEUE NO', date: 'Date', time: 'Time', channel: 'Channel', table: 'Table', cashier: 'Cashier',
      customer: 'Customer', item: 'ITEM', qty: 'QTY', price: 'PRICE', subtotal: 'Subtotal:',
      tax: 'Tax:', discount: 'Discount:', total: 'TOTAL:', pay: 'Paid:', change: 'Change:',
      member: 'Member:', points: 'Points:', thanks: '=== THANK YOU ==='
    },
    id: {
      orderNo: 'NO.', queueNo: 'NO. ANTREAN', date: 'Tgl', time: 'Jam', channel: 'Kanal', table: 'Meja', cashier: 'Kasir',
      customer: 'Pelanggan', item: 'ITEM', qty: 'QTY', price: 'HARGA', subtotal: 'Subtotal:',
      tax: 'Pajak:', discount: 'Diskon:', total: 'TOTAL:', pay: 'Bayar:', change: 'Kembalian:',
      member: 'Member:', points: 'Poin:', thanks: '=== TERIMA KASIH ==='
    }
  }
  const L = i18nMap[lang] || i18nMap.id

  const nameWidth = is80mm ? 28 : 16
  const qtyWidth = is80mm ? 6 : 4
  const priceWidth = is80mm ? 14 : 12
  const labelWidth = is80mm ? 30 : 18
  const valWidth = is80mm ? 18 : 14

  // ESC/POS 控制码常量
  const CMD_BOLD_ON = Buffer.from([0x1B, 0x45, 0x01])
  const CMD_BOLD_OFF = Buffer.from([0x1B, 0x45, 0x00])
  const CMD_ALIGN_LEFT = Buffer.from([0x1B, 0x61, 0x00])
  const CMD_ALIGN_CENTER = Buffer.from([0x1B, 0x61, 0x01])
  const CMD_ALIGN_RIGHT = Buffer.from([0x1B, 0x61, 0x02])
  const CMD_FONT_NORMAL = Buffer.from([0x1D, 0x21, 0x00, 0x1B, 0x4D, 0x00])
  const CMD_FONT_LARGE = Buffer.from([0x1D, 0x21, 0x11]) // 倍宽倍高
  const CMD_FONT_SMALL = Buffer.from([0x1D, 0x21, 0x00, 0x1B, 0x4D, 0x01]) // Font B
  const CMD_CRLF = Buffer.from([0x0D, 0x0A])

  function formatStyledLine(text: string, style?: { bold?: boolean; fontSize?: string; align?: string }): Buffer {
    const lineChunks: Buffer[] = []

    if (style?.align === 'center') lineChunks.push(CMD_ALIGN_CENTER)
    else if (style?.align === 'right') lineChunks.push(CMD_ALIGN_RIGHT)
    else lineChunks.push(CMD_ALIGN_LEFT)

    if (style?.fontSize === 'large') lineChunks.push(CMD_FONT_LARGE)
    else if (style?.fontSize === 'small') lineChunks.push(CMD_FONT_SMALL)
    else lineChunks.push(CMD_FONT_NORMAL)

    if (style?.bold) lineChunks.push(CMD_BOLD_ON)

    lineChunks.push(encodeEscPosText(text))

    if (style?.bold) lineChunks.push(CMD_BOLD_OFF)
    if (style?.fontSize === 'large' || style?.fontSize === 'small') lineChunks.push(CMD_FONT_NORMAL)
    lineChunks.push(CMD_CRLF)

    if (style?.align === 'center' || style?.align === 'right') lineChunks.push(CMD_ALIGN_LEFT)

    return Buffer.concat(lineChunks)
  }

  function formatAmountLine(label: string, value: string, style: any): Buffer {
    const columns = style.fontSize === 'large' ? width / 2 : style.fontSize === 'small' ? (is80mm ? 64 : 42) : width
    const gap = columns - getVisualWidth(label) - getVisualWidth(value)
    if (gap < 1) return Buffer.concat([formatStyledLine(label, style), formatStyledLine(value, {...style, align:'right'})])
    return formatStyledLine(`${label}${' '.repeat(gap)}${value}`, style)
  }

  const rawBlocks = Array.isArray(data.blocks) ? data.blocks : (data.template?.blocks || null)
  const chunks: Buffer[] = []

  // 联号标记（如 Customer Copy / Merchant Copy，仅在设置中开启多联且明确有联号标记时输出）
  if (data.copyLabel && data.printCopies && data.printCopies > 1) {
    chunks.push(formatStyledLine(`*** ${data.copyLabel} ***`, { align: 'center', bold: true, fontSize: 'small' }))
    chunks.push(CMD_CRLF)
  }

  let hasBarcodeRendered = false
  let hasQrRendered = false

  if (Array.isArray(rawBlocks)) {
    const enabledBlocks = [...rawBlocks]
      .filter((b: any) => b && b.enabled !== false)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))

    for (const block of enabledBlocks) {
      const cfg = block.config || {}
      const st = {align:'center',fontSize:'normal',bold:false,...block.style}

      switch (block.type) {
        case 'logo': {
          let logoBuf: Buffer | null = null
          const logoSource = cfg.url || data.storeLogo || ''
          if (logoSource) {
            const rawImg = await loadLogoBuffer(logoSource)
            if (rawImg) {
              const customWidth = cfg.width ? Math.min(targetDots, cfg.width * 2) : targetDots
              logoBuf = imageBufferToEscPosRaster(rawImg, customWidth, st.align || 'center')
            }
          }
          if (logoBuf) {
            chunks.push(logoBuf)
          } else if (logoSource) {
            data.printWarnings?.push('LOGO_UNAVAILABLE')
          }

          break
        }

        case 'header': {
          const headerText = typeof cfg.text === 'string' ? cfg.text : data.header || data.storeName || 'YOUME'
          if (headerText) {
            chunks.push(formatStyledLine(headerText, {
              align: st.align || 'center',
              bold: st.bold,
              fontSize: st.fontSize || 'large'
            }))
          }
          break
        }

        case 'storeInfo': {
          const phone = cfg.phone || data.storePhone
          const address = cfg.address || data.storeAddress
          if (cfg.showPhone === true && phone) {
            chunks.push(formatStyledLine(`Tel: ${phone}`, { align: st.align || 'center', bold: st.bold, fontSize: st.fontSize }))
          }
          if (cfg.showAddress === true && address) {
            chunks.push(formatStyledLine(address, { align: st.align || 'center', bold: st.bold, fontSize: st.fontSize }))
          }
          break
        }

        case 'divider': {
          const style = cfg.dividerStyle || 'line'
          const safeW = Math.max(20, width - 2)
          if (style === 'dashed') {
            chunks.push(formatStyledLine(repeatChar('- ', Math.floor(safeW / 2)), { align: 'center' }))
          } else if (style === 'space') {
            chunks.push(CMD_CRLF)
          } else if (style === 'stars') {
            chunks.push(formatStyledLine(repeatChar('*', safeW), { align: 'center' }))
          } else {
            chunks.push(formatStyledLine(repeatChar('-', safeW), { align: 'center' }))
          }
          break
        }

        case 'orderInfo': {
          if (cfg.showPickupNumber !== false && data.pickupNumber) {
            chunks.push(formatStyledLine(`*** ${L.queueNo}: ${data.pickupNumber} ***`, { ...st, align: st.align || 'center' }))
          }
          const infoLines: string[] = []
          // 仅在未显式禁用单号时才输出单号
          if (cfg.showOrderNo !== false && data.orderNum) {
            infoLines.push(`NO. ${data.orderNum}`)
          }
          const showDate = cfg.showDate === true
          const showTime = cfg.showTime === true
          if (showDate) infoLines.push(`${padEndVisual(L.date, is80mm ? 10 : 7)}: ${formatDateTime(data.orderDate || data.createdAt, true, false)}`)
          if (showTime) infoLines.push(`${padEndVisual(L.time, is80mm ? 10 : 7)}: ${formatDateTime(data.orderDate || data.createdAt, false, true)}`)
          if (cfg.showChannel && data.channelName) {
            const tableText = data.tableNumber ? ` (${L.table} ${data.tableNumber})` : ''
            infoLines.push(`${padEndVisual(L.channel, is80mm ? 10 : 7)}: ${data.channelName}${tableText}`)
          }
          const showCashier = cfg.showCashier === true
          if (showCashier && data.cashierName) {
            infoLines.push(`${padEndVisual(L.cashier, is80mm ? 10 : 7)}: ${data.cashierName}`)
          }
          const showCustomer = cfg.showCustomer === true
          if (showCustomer && data.customerName) {
            infoLines.push(`${padEndVisual(L.customer, is80mm ? 10 : 7)}: ${data.customerName}`)
          }
          for (const line of infoLines) {
            chunks.push(formatStyledLine(line, st))
          }
          break
        }

        case 'items': {
          const width = st.fontSize === 'large' ? (is80mm ? 24 : 16) : st.fontSize === 'small' ? (is80mm ? 64 : 42) : (is80mm ? 48 : 32)
          const nameWidth = Math.floor(width * 0.5), qtyWidth = Math.floor(width * 0.125), priceWidth = width - nameWidth - qtyWidth
          const isCompact = (cfg.itemFormat || data.itemDetailFormat) === 'compact'
          const isSimple = cfg.itemFormat === 'simple' || (!is80mm && !cfg.showQtyPriceHeader)

          // 仅在明确开启三列表头时才打印表头，且强制使用标准正常小字，绝不使用突兀大字
          if (cfg.showQtyPriceHeader === true) {
            const tableHeader = `${padEndVisual(L.item, nameWidth)}${padStartVisual(L.qty, qtyWidth)}${padStartVisual(L.price, priceWidth)}`
            chunks.push(formatStyledLine(tableHeader, st))
            chunks.push(formatStyledLine(repeatChar('-', Math.max(20, width - 2)), { align: 'center' }))
          } else if (cfg.showHeader !== false) {
            // 默认打印纯净商品标题行（与设计器保持 100% 一致）
            chunks.push(formatStyledLine(L.item, st))
          }

          if (data.items && data.items.length > 0) {
            data.items.forEach((item: any) => {
              const spec = item.specName ? ` ${item.specName}` : ''
              const qtyPrefix = item.quantity > 1 ? `x${item.quantity} ` : ''
              const rawName = `${item.productName}${spec}`

              if (isSimple || cfg.showQtyPriceHeader !== true) {
                // 双列优雅排版（长品名自适应换行，永不截断）
                const priceStr = formatRp(item.unitPrice * item.quantity)
                const priceW = Math.max(10, priceStr.length + 1)
                const maxNameW = Math.max(8, width - priceW)
                const fullName = `${qtyPrefix}${rawName}`
                if (getVisualWidth(fullName) <= maxNameW) {
                  const namePadded = padEndVisual(fullName, width - priceW)
                  const pricePadded = padStartVisual(priceStr, priceW)
                  chunks.push(formatStyledLine(`${namePadded}${pricePadded}`, st))
                } else {
                  // 长商品名：首行完整输出商品名称，次行右对齐金额
                  chunks.push(formatStyledLine(fullName, st))
                  chunks.push(formatStyledLine(padStartVisual(priceStr, width - 2), { bold: st.bold, fontSize: st.fontSize, align: 'right' }))
                }
              } else {
                // 标准三列排版
                const name = padEndVisual(truncate(`${item.productName}${spec}`, nameWidth), nameWidth)
                const qty = padStartVisual(String(item.quantity), qtyWidth)
                const price = padStartVisual(formatRp(item.unitPrice * item.quantity), priceWidth)
                chunks.push(formatStyledLine(`${name}${qty}${price}`, st))
              }

              if (isCompact) {
                const parts: string[] = []
                if (cfg.showSugarIce === true && (item.sugarLevelName || item.iceLevelName)) {
                  const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
                  if (mods) parts.push(`[${mods}]`)
                }
                if (cfg.showAddon === true && item.addons && item.addons.length > 0) {
                  const addonNames = item.addons.map((a: any) => a.name || a).join(', ')
                  if (addonNames) parts.push(`+${addonNames}`)
                }
                if (parts.length > 0) {
                  chunks.push(formatStyledLine(`  ${truncate(parts.join(' '), width - 2)}`, st))
                }
              } else {
                if (cfg.showAddon === true && item.addons && item.addons.length > 0) {
                  item.addons.forEach((addon: any) => {
                    chunks.push(formatStyledLine(`  + ${truncate(addon.name || addon, width - 4)}`, st))
                  })
                }
                if (cfg.showSugarIce === true && (item.sugarLevelName || item.iceLevelName)) {
                  const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
                  chunks.push(formatStyledLine(`  [${mods}]`, st))
                }
              }
              if (cfg.showNote && item.note) chunks.push(formatStyledLine(`  ${item.note}`, st))
            })
          }
          break
        }

        case 'subtotal': {
          chunks.push(formatAmountLine(cfg.subtotalLabel || L.subtotal, formatRp(data.subtotal || 0), st))
          break
        }

        case 'tax': {
          const taxName = cfg.label || (cfg.rate && cfg.showRate !== false ? `${L.tax} (${cfg.rate}%)` : L.tax)
          chunks.push(formatAmountLine(taxName, formatRp(data.tax || 0), st))
          break
        }

        case 'total': {
          if (data.discount && data.discount > 0) {
            const promoName = data.promotionName || data.discountNote || ''
            chunks.push(formatAmountLine(cfg.discountLabel || L.discount, `-${formatRp(data.discount)}`, st))
            if (cfg.showDiscountDetail !== false && promoName) chunks.push(formatStyledLine(`  [${promoName}]`, st))
          }
          chunks.push(formatAmountLine(cfg.totalLabel || L.total, formatRp(data.total || 0), st))
          break
        }

        case 'paymentInfo': {
          if (cfg.showMethod === true) chunks.push(formatAmountLine('Metode:', data.paymentMethod || 'Cash', st))
          if (cfg.showReceived === true && data.paidAmount > 0) chunks.push(formatAmountLine(L.pay, formatRp(data.paidAmount), st))
          if (cfg.showChange === true && data.paidAmount > 0) chunks.push(formatAmountLine(L.change, formatRp(data.change || 0), st))
          break
        }

        case 'barcode': {
          // Enabled template blocks are authoritative; legacy POS switches apply only without a template.
          if (data.orderNum) {
            chunks.push(buildEscPosBarcode(String(data.orderNum), cfg.height ? cfg.height * 2 : 80, st.align, cfg.barcodeType))
            hasBarcodeRendered = true
          }
          break
        }

        case 'qrCode': {
          const qrUrl = cfg.url || cfg.qrContent || data.qrCodeUrl || ''
          if (qrUrl) {
            const modSize = cfg.size ? Math.max(3, Math.min(8, Math.round(cfg.size / 20))) : (is80mm ? 6 : 4)
            chunks.push(buildEscPosQRCode(String(qrUrl), modSize, st.align))
            hasQrRendered = true
          }
          break
        }

        case 'footer': {
          if (cfg.showDivider) {
            chunks.push(formatStyledLine(repeatChar('-', width)))
          }
          const footerMsg = typeof cfg.footerText === 'string' ? cfg.footerText : data.footer
          if (footerMsg) {
            chunks.push(formatStyledLine(footerMsg, {
              align: st.align || 'center',
              bold: st.bold,
              fontSize: st.fontSize
            }))
          }
          break
        }

        case 'customText': {
          const customMsg = cfg.customText || cfg.text
          if (customMsg) {
            chunks.push(formatStyledLine(customMsg, {
              align: st.align || 'center',
              bold: st.bold,
              fontSize: st.fontSize
            }))
          }
          break
        }
      }
    }
  } else {
    // 默认结构（当完全没有配置任何 blocks 时）
    if (data.storeLogo && data.showLogo !== false) {
      const rawImg = await loadLogoBuffer(data.storeLogo)
      const logoBuf = rawImg ? imageBufferToEscPosRaster(rawImg, targetDots) : null
      if (logoBuf) chunks.push(logoBuf)
      else data.printWarnings?.push('LOGO_UNAVAILABLE')
    }
    const storeTitle = data.storeName || data.header || 'YOUME'
    chunks.push(formatStyledLine(storeTitle, { align: 'center', bold: true, fontSize: 'large' }))
    if (data.storePhone) chunks.push(formatStyledLine(`Tel: ${data.storePhone}`, { align: 'center' }))
    if (data.storeAddress) chunks.push(formatStyledLine(data.storeAddress, { align: 'center' }))
    chunks.push(formatStyledLine(repeatChar('=', width)))

    if (data.pickupNumber) {
      chunks.push(CMD_CRLF)
      chunks.push(formatStyledLine(`*** ${L.queueNo}: ${data.pickupNumber} ***`, { align: 'center', bold: true, fontSize: 'large' }))
      chunks.push(CMD_CRLF)
    }

    chunks.push(formatStyledLine(`NO. ${data.orderNum || ''}`))
    if (data.orderDate || data.createdAt) {
      chunks.push(formatStyledLine(`${padEndVisual(L.date, is80mm ? 10 : 7)}: ${formatDateTime(data.orderDate || data.createdAt, true, true)}`))
    }
    if (data.channelName) {
      chunks.push(formatStyledLine(`${padEndVisual(L.channel, is80mm ? 10 : 7)}: ${data.channelName}`))
    }
    if (data.cashierName && data.showStaffName !== false) {
      chunks.push(formatStyledLine(`${padEndVisual(L.cashier, is80mm ? 10 : 7)}: ${data.cashierName}`))
    }
    chunks.push(formatStyledLine(repeatChar('-', width)))

    const tableHeader = `${padEndVisual(L.item, nameWidth)}${padStartVisual(L.qty, qtyWidth)}${padStartVisual(L.price, priceWidth)}`
    chunks.push(formatStyledLine(tableHeader, {bold:true}))
    chunks.push(formatStyledLine(repeatChar('-', width)))
    if (data.items && data.items.length > 0) {
      data.items.forEach((item: any) => {
        const spec = item.specName ? ` ${item.specName}` : ''
        const name = padEndVisual(truncate(`${item.productName}${spec}`, nameWidth), nameWidth)
        const qty = padStartVisual(String(item.quantity), qtyWidth)
        const price = padStartVisual(formatRp(item.unitPrice * item.quantity), priceWidth)
        chunks.push(formatStyledLine(`${name}${qty}${price}`))
        if (item.addons && item.addons.length > 0) {
          item.addons.forEach((a: any) => {
            chunks.push(formatStyledLine(`  + ${truncate(a.name || a, width - 4)}`, {fontSize:'small'}))
          })
        }
      })
    }
    chunks.push(formatStyledLine(repeatChar('-', width)))
    chunks.push(formatStyledLine(`${padEndVisual(L.subtotal, labelWidth)}${padStartVisual(formatRp(data.subtotal || 0), valWidth)}`))
    if (data.tax) {
      chunks.push(formatStyledLine(`${padEndVisual(L.tax, labelWidth)}${padStartVisual(formatRp(data.tax), valWidth)}`))
    }
    if (data.discount) {
      chunks.push(formatStyledLine(`${padEndVisual(L.discount, labelWidth)}-${padStartVisual(formatRp(data.discount), valWidth)}`, {bold:true}))
    }
    chunks.push(formatStyledLine(`${padEndVisual(L.total, labelWidth)}${padStartVisual(formatRp(data.total || 0), valWidth)}`, {bold:true}))
    if (data.paidAmount) {
      chunks.push(formatStyledLine(repeatChar('-', width)))
      chunks.push(formatStyledLine(`${padEndVisual(L.pay, labelWidth)}${padStartVisual(formatRp(data.paidAmount), valWidth)}`))
      chunks.push(formatStyledLine(`${padEndVisual(L.change, labelWidth)}${padStartVisual(formatRp(data.change || 0), valWidth)}`))
    }
    if (data.footer && data.footer !== data.storeName) {
      chunks.push(CMD_CRLF)
      chunks.push(formatStyledLine(data.footer, { align: 'center' }))
    }
    chunks.push(formatStyledLine(L.thanks, { align: 'center' }))

    // 仅在无模板且显式开启时才兜底追加条码/二维码
    if (!hasBarcodeRendered && data.showBarcode === true && data.orderNum) {
      chunks.push(buildEscPosBarcode(String(data.orderNum)))
    }
    if (!hasQrRendered && data.showQR === true && data.qrCodeUrl) {
      chunks.push(buildEscPosQRCode(String(data.qrCodeUrl), is80mm ? 6 : 4))
    }
  }

    chunks.push(Buffer.from([0x0A, 0x0A]))
    return Buffer.concat(chunks)
  } catch (renderErr: any) {
    writeCrash(`[BUILD ESCPOS ERROR] Error in buildReceiptEscPosBuffer: ${renderErr?.message}`)
    // A text fallback would silently discard the selected template's logo and typography.
    if (Array.isArray(data.blocks) || Array.isArray(data.template?.blocks)) throw renderErr
    try {
      const text = generateReceiptText(data)
      return Buffer.concat([encodeEscPosText(text), Buffer.from([0x0A, 0x0A])])
    } catch {
      return Buffer.from([0x0A, 0x0A])
    }
  }
}

function generateReceiptText(data: any): string {
  const is80mm = data.paperSize === '80mm'
  const width = is80mm ? 48 : 32

  const lang = (data.language || 'id').toLowerCase()
  const i18nMap: Record<string, Record<string, string>> = {
    zh: {
      orderNo: 'NO.',
      date: '日期',
      channel: '渠道',
      table: '桌号',
      cashier: '收银员',
      customer: '顾客',
      item: '商品名称',
      qty: '数量',
      price: '金额',
      subtotal: '小计:',
      tax: '税费:',
      discount: '优惠:',
      total: '总计:',
      pay: '实付:',
      change: '找零:',
      member: '会员:',
      points: '积分抵扣:',
      thanks: '=== 谢谢惠顾 欢迎光临 ==='
    },
    en: {
      orderNo: 'NO.',
      date: 'Date',
      channel: 'Channel',
      table: 'Table',
      cashier: 'Cashier',
      customer: 'Customer',
      item: 'ITEM',
      qty: 'QTY',
      price: 'PRICE',
      subtotal: 'Subtotal:',
      tax: 'Tax:',
      discount: 'Discount:',
      total: 'TOTAL:',
      pay: 'Paid:',
      change: 'Change:',
      member: 'Member:',
      points: 'Points:',
      thanks: '=== THANK YOU ==='
    },
    id: {
      orderNo: 'NO.',
      date: 'Tgl',
      channel: 'Kanal',
      table: 'Meja',
      cashier: 'Kasir',
      customer: 'Pelanggan',
      item: 'ITEM',
      qty: 'QTY',
      price: 'HARGA',
      subtotal: 'Subtotal:',
      tax: 'Pajak:',
      discount: 'Diskon:',
      total: 'TOTAL:',
      pay: 'Bayar:',
      change: 'Kembalian:',
      member: 'Member:',
      points: 'Poin:',
      thanks: '=== TERIMA KASIH ==='
    }
  }
  const L = i18nMap[lang] || i18nMap.id

  const nameWidth = is80mm ? 28 : 16
  const qtyWidth = is80mm ? 6 : 4
  const priceWidth = is80mm ? 14 : 12
  const labelWidth = is80mm ? 30 : 18
  const valWidth = is80mm ? 18 : 14

  // Check if blocks template is supplied
  const rawBlocks = Array.isArray(data.blocks) ? data.blocks : (data.template?.blocks || null)
  if (Array.isArray(rawBlocks)) {
    const lines: string[] = []
    const enabledBlocks = [...rawBlocks]
      .filter((b: any) => b && b.enabled !== false)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))

    for (const block of enabledBlocks) {
      const cfg = block.config || {}
      switch (block.type) {
        case 'logo': break
        case 'header': {
          const headerText = cfg.text || data.header || data.storeName || 'YOUME'
          if (headerText) {
            lines.push(centerText(headerText, width))
          }
          break
        }
        case 'storeInfo': {
          const phone = cfg.phone || data.storePhone
          const address = cfg.address || data.storeAddress
          if (cfg.showPhone !== false && phone) {
            lines.push(centerText(`Tel: ${phone}`, width))
          }
          if (cfg.showAddress !== false && address) {
            lines.push(centerText(address, width))
          }
          break
        }
        case 'divider': {
          const style = cfg.dividerStyle || 'line'
          if (style === 'dashed') lines.push(repeatChar('- ', Math.floor(width / 2)))
          else if (style === 'space') lines.push('')
          else if (style === 'stars') lines.push(repeatChar('*', width))
          else lines.push(repeatChar('-', width))
          break
        }
        case 'orderInfo': {
          if (cfg.showPickupNumber !== false && data.pickupNumber) {
            lines.push(centerText(`*** ${L.queueNo}: ${data.pickupNumber} ***`, width))
          }
          if (cfg.showOrderNo !== false && data.orderNum) lines.push(`NO. ${data.orderNum}`)
          const showDate = cfg.showDate !== false
          const showTime = cfg.showTime !== false
          if (showDate || showTime) {
            const dt = formatDateTime(data.orderDate || data.createdAt, showDate, showTime)
            lines.push(`${padEndVisual(L.date, is80mm ? 10 : 7)}: ${dt}`)
          }
          if (cfg.showChannel && data.channelName) {
            const tableText = data.tableNumber ? ` (${L.table} ${data.tableNumber})` : ''
            lines.push(`${padEndVisual(L.channel, is80mm ? 10 : 7)}: ${data.channelName}${tableText}`)
          }
          const showCashier = cfg.showCashier !== undefined ? cfg.showCashier : (data.showStaffName !== false)
          if (showCashier && data.cashierName) {
            lines.push(`${padEndVisual(L.cashier, is80mm ? 10 : 7)}: ${data.cashierName}`)
          }
          const showCustomer = cfg.showCustomer !== undefined ? cfg.showCustomer : data.showCustomerName
          if (showCustomer && data.customerName) {
            lines.push(`${padEndVisual(L.customer, is80mm ? 10 : 7)}: ${data.customerName}`)
          }
          break
        }
        case 'items': {
          lines.push(`${padEndVisual(L.item, nameWidth)}${padStartVisual(L.qty, qtyWidth)}${padStartVisual(L.price, priceWidth)}`)
          lines.push(repeatChar('-', Math.max(20, width - 2)))
          const isCompact = (cfg.itemFormat || data.itemDetailFormat) === 'compact'
          if (data.items && data.items.length > 0) {
            data.items.forEach((item: any) => {
              const spec = item.specName ? ` ${item.specName}` : ''
              const fullName = `${item.productName}${spec}`
              const qty = padStartVisual(String(item.quantity), qtyWidth)
              const price = padStartVisual(formatRp(item.unitPrice * item.quantity), priceWidth)
              if (getVisualWidth(fullName) <= nameWidth) {
                const name = padEndVisual(fullName, nameWidth)
                lines.push(`${name}${qty}${price}`)
              } else {
                lines.push(fullName)
                lines.push(`${' '.repeat(nameWidth)}${qty}${price}`)
              }

              if (isCompact) {
                const parts: string[] = []
                if (cfg.showSugarIce !== false && (item.sugarLevelName || item.iceLevelName)) {
                  const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
                  if (mods) parts.push(`[${mods}]`)
                }
                if (cfg.showAddon !== false && item.addons && item.addons.length > 0) {
                  const addonNames = item.addons.map((a: any) => a.name || a).join(', ')
                  if (addonNames) parts.push(`+${addonNames}`)
                }
                if (parts.length > 0) {
                  lines.push(`  ${truncate(parts.join(' '), width - 2)}`)
                }
              } else {
                if (cfg.showAddon !== false && item.addons && item.addons.length > 0) {
                  item.addons.forEach((addon: any) => {
                    lines.push(`  + ${truncate(addon.name || addon, width - 4)}`)
                  })
                }
                if (cfg.showSugarIce !== false && (item.sugarLevelName || item.iceLevelName)) {
                  const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
                  lines.push(`  [${mods}]`)
                }
              }
            })
          }
          break
        }
        case 'subtotal': {
          const subtotalLabel = padEndVisual(cfg.subtotalLabel || L.subtotal, labelWidth)
          lines.push(`${subtotalLabel}${padStartVisual(formatRp(data.subtotal || 0), valWidth)}`)
          break
        }
        case 'tax': {
          const taxLabel = padEndVisual(cfg.label || (cfg.rate ? `${L.tax} (${cfg.rate}%)` : L.tax), labelWidth)
          lines.push(`${taxLabel}${padStartVisual(formatRp(data.tax || 0), valWidth)}`)
          break
        }
        case 'total': {
          if (data.discount && data.discount > 0) {
            const promoName = data.promotionName || data.discountNote || ''
            const showDetail = cfg.showDiscountDetail !== false && data.showPromotionDetail !== false
            const baseDiscLabel = cfg.discountLabel || L.discount

            if (showDetail && promoName) {
              const fullDiscLabel = `${baseDiscLabel} (${promoName})`
              if (fullDiscLabel.length + 12 <= width) {
                lines.push(`${padEndVisual(fullDiscLabel, labelWidth)}-${padStartVisual(formatRp(data.discount), valWidth)}`)
              } else {
                lines.push(`${padEndVisual(baseDiscLabel, labelWidth)}-${padStartVisual(formatRp(data.discount), valWidth)}`)
                lines.push(`  [${promoName}]`)
              }
            } else {
              lines.push(`${padEndVisual(baseDiscLabel, labelWidth)}-${padStartVisual(formatRp(data.discount), valWidth)}`)
            }
          }
          const totalLabel = padEndVisual(cfg.totalLabel || L.total, labelWidth)
          lines.push(`${totalLabel}${padStartVisual(formatRp(data.total || 0), valWidth)}`)
          break
        }
        case 'paymentInfo': {
          if (cfg.showMethod !== false) {
            lines.push(`${padEndVisual('Metode:', labelWidth)}${padStartVisual(data.paymentMethod || 'Cash', valWidth)}`)
          }
          if (cfg.showReceived !== false && (data.paidAmount !== undefined && data.paidAmount > 0)) {
            lines.push(`${padEndVisual(L.pay, labelWidth)}${padStartVisual(formatRp(data.paidAmount), valWidth)}`)
          }
          if (cfg.showChange !== false && (data.paidAmount !== undefined && data.paidAmount > 0)) {
            lines.push(`${padEndVisual(L.change, labelWidth)}${padStartVisual(formatRp(data.change || 0), valWidth)}`)
          }
          break
        }
        case 'footer': {
          if (cfg.showDivider) {
            lines.push(repeatChar('-', width))
          }
          const footerMsg = cfg.footerText || data.footer
          if (footerMsg) {
            lines.push(centerText(footerMsg, width))
          }
          break
        }
        case 'customText': {
          const customMsg = cfg.customText || cfg.text
          if (customMsg) {
            lines.push(centerText(customMsg, width))
          }
          break
        }
        case 'barcode':
        case 'qrCode':
          // Rendered via binary ESC/POS commands
          break
        default:
          break
      }
    }

    if (data.copyLabel) {
      lines.push(centerText(data.copyLabel, width))
    }

    return lines.join('\r\n') + '\r\n\r\n'
  }

  // Fallback: Legacy layout if no blocks passed
  const lines: string[] = []

  // 1. Header (Store Name / Custom Header)
  const storeTitle = data.storeName || data.header || 'YOUME'
  lines.push(centerText(storeTitle, width))

  if (data.storeAddress) {
    lines.push(centerText(data.storeAddress, width))
  }
  if (data.storePhone) {
    lines.push(centerText(`Tel: ${data.storePhone}`, width))
  }
  if (data.copyLabel) {
    lines.push(centerText(data.copyLabel, width))
  }
  lines.push(repeatChar('=', width))

  // 2. Order Metadata
  lines.push(`NO. ${data.orderNum || ''}`)
  lines.push(`${L.date.padEnd(is80mm ? 10 : 7)}: ${formatDateTime()}`)

  if (data.channelName) {
    const tableText = data.tableNumber ? ` (${L.table} ${data.tableNumber})` : ''
    lines.push(`${L.channel.padEnd(is80mm ? 10 : 7)}: ${data.channelName}${tableText}`)
  }

  if (data.showStaffName !== false && data.cashierName) {
    lines.push(`${L.cashier.padEnd(is80mm ? 10 : 7)}: ${data.cashierName}`)
  }

  if (data.showCustomerName && data.customerName) {
    lines.push(`${L.customer.padEnd(is80mm ? 10 : 7)}: ${data.customerName}`)
  }

  lines.push(repeatChar('-', width))

  // 3. Item Table Header
  lines.push(`${L.item.padEnd(nameWidth)}${L.qty.padStart(qtyWidth)}${L.price.padStart(priceWidth)}`)
  lines.push(repeatChar('-', width))

  // 4. Items List
  const isCompactFallback = data.itemDetailFormat === 'compact'
  if (data.items && data.items.length > 0) {
    data.items.forEach((item: any) => {
      const spec = item.specName ? ` ${item.specName}` : ''
      const name = truncate(`${item.productName}${spec}`, nameWidth).padEnd(nameWidth)
      const qty = String(item.quantity).padStart(qtyWidth)
      const price = formatRp(item.unitPrice * item.quantity).padStart(priceWidth)
      lines.push(`${name}${qty}${price}`)

      if (data.showKitchenNote !== false) {
        if (isCompactFallback) {
          const parts: string[] = []
          if (item.sugarLevelName || item.iceLevelName) {
            const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
            if (mods) parts.push(`[${mods}]`)
          }
          if (item.addons && item.addons.length > 0) {
            const addonNames = item.addons.map((addon: any) => addon.name || addon).join(', ')
            if (addonNames) parts.push(`+${addonNames}`)
          }
          if (parts.length > 0) {
            lines.push(`  ${truncate(parts.join(' '), width - 2)}`)
          }
        } else {
          if (item.addons && item.addons.length > 0) {
            item.addons.forEach((addon: any) => {
              lines.push(`  + ${truncate(addon.name || addon, width - 4)}`)
            })
          }
          if (item.sugarLevelName || item.iceLevelName) {
            const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
            lines.push(`  [${mods}]`)
          }
        }
      }
    })
  }

  lines.push(repeatChar('-', width))

  // 5. Totals
  lines.push(`${L.subtotal.padEnd(labelWidth)}${formatRp(data.subtotal || 0).padStart(valWidth)}`)
  lines.push(`${L.tax.padEnd(labelWidth)}${formatRp(data.tax || 0).padStart(valWidth)}`)
  if (data.discount && data.discount > 0) {
    const promoName = data.promotionName || data.discountNote || ''
    if (data.showPromotionDetail !== false && promoName) {
      lines.push(`${L.discount.padEnd(labelWidth)}-${formatRp(data.discount).padStart(valWidth)}`)
      lines.push(`  [${promoName}]`)
    } else {
      lines.push(`${L.discount.padEnd(labelWidth)}-${formatRp(data.discount).padStart(valWidth)}`)
    }
  }
  lines.push(repeatChar('-', width))
  lines.push(`${L.total.padEnd(labelWidth)}${formatRp(data.total || 0).padStart(valWidth)}`)

  // 6. Payment & Change
  if (data.paidAmount) {
    lines.push(repeatChar('-', width))
    lines.push(`${L.pay.padEnd(labelWidth)}${formatRp(data.paidAmount).padStart(valWidth)}`)
    lines.push(`${L.change.padEnd(labelWidth)}${formatRp(data.change || 0).padStart(valWidth)}`)
  }

  // 7. Member
  if (data.memberName) {
    lines.push(repeatChar('-', width))
    lines.push(`${L.member} ${data.memberName}`)
    if (data.pointsRedeemed && data.pointsRedeemed > 0) {
      lines.push(`${L.points} -${data.pointsRedeemed}`)
    }
  }

  // 8. Footer
  lines.push('')
  if (data.footer && data.footer !== data.storeName) {
    lines.push(centerText(data.footer, width))
  }
  lines.push(centerText(L.thanks, width))

  return lines.join('\r\n') + '\r\n\r\n'
}

/**
 * 构建 ESC/POS 2D 二维码原生指令 (Model 2, 支持 58mm / 80mm 热敏小票机)
 */
function buildEscPosQRCode(content: string, moduleSize = 5, align = 'center'): Buffer {
  if (!content) return Buffer.alloc(0)
  const dataBytes = Buffer.from(content, 'utf8')
  const pL = (dataBytes.length + 3) & 0xff
  const pH = ((dataBytes.length + 3) >> 8) & 0xff

  return Buffer.concat([
    // 居中对齐 ESC a 1
    Buffer.from([0x1B, 0x61, align === 'left' ? 0 : align === 'right' ? 2 : 1]),
    // GS ( k: Model 2 (4, 0, 49, 65, 50, 0)
    Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    // GS ( k: 设置块大小 (3, 0, 49, 67, moduleSize)
    Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, Math.max(3, Math.min(10, moduleSize))]),
    // GS ( k: 纠错级别 M (3, 0, 49, 69, 49)
    Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]),
    // GS ( k: 存入二维码数据 (pL, pH, 49, 80, 48, ...data)
    Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]),
    dataBytes,
    // GS ( k: 打印二维码 (3, 0, 49, 81, 48)
    Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]),
    // 换行并重置为左对齐 ESC a 0
    Buffer.from([0x0A, 0x0A, 0x1B, 0x61, 0x00])
  ])
}

/**
 * 构建 ESC/POS 订单条形码 (CODE128 格式，方便扫码枪秒级反扫退单或查单)
 * 标准 ESC/POS CODE128 (GS k 73) 必须带有 Code Set B ({B 即 0x7B, 0x42) 前缀
 */
function buildEscPosBarcode(content: string, height = 50, align = 'center', type = 'code128'): Buffer {
  if (!content) return Buffer.alloc(0)
  const clean = content.replace(/[^A-Za-z0-9\-]/g, '')
  const isCode39 = type === 'code39'
  if (!clean) return Buffer.alloc(0)
  const dataBytes = Buffer.from(isCode39 ? clean.toUpperCase() : clean, 'ascii')
  // CODE128 Code Set B 前缀: {B (0x7B, 0x42)
  const payload = isCode39 ? dataBytes : Buffer.concat([Buffer.from([0x7B, 0x42]), dataBytes])
  return Buffer.concat([
    // 居中对齐 ESC a 1
    Buffer.from([0x1B, 0x61, align === 'left' ? 0 : align === 'right' ? 2 : 1]),
    // 设置条码高度 50 dots
    Buffer.from([0x1D, 0x68, Math.max(1, Math.min(255, Math.round(height)))]),
    // 设置条码宽度 2 dots
    Buffer.from([0x1D, 0x77, 0x02]),
    // 设置数字显示在条码下方 (HRI below: 0x02)
    Buffer.from([0x1D, 0x48, 0x02]),
    // CODE128 打印指令: GS k 73 <length> <data>
    Buffer.from([0x1D, 0x6B, isCode39 ? 0x45 : 0x49, payload.length]),
    payload,
    // 换行并重置为左对齐 ESC a 0
    Buffer.from([0x0A, 0x0A, 0x1B, 0x61, 0x00])
  ])
}

function getVisualWidth(str: string): number {
  if (!str) return 0
  let w = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code > 255 || (code >= 0x1100 && code <= 0x115F) || (code >= 0x2E80 && code <= 0x9FFF)) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

function padEndVisual(str: string, targetWidth: number): string {
  const vLen = getVisualWidth(str)
  if (vLen >= targetWidth) return str
  return str + ' '.repeat(targetWidth - vLen)
}

function padStartVisual(str: string, targetWidth: number): string {
  const vLen = getVisualWidth(str)
  if (vLen >= targetWidth) return str
  return ' '.repeat(targetWidth - vLen) + str
}

function centerText(text: string, width: number): string {
  if (!text) return ''
  const padding = Math.max(0, Math.floor((width - getVisualWidth(text)) / 2))
  return ' '.repeat(padding) + text
}

function repeatChar(char: string, count: number): string {
  return char.repeat(count)
}

function truncate(str: string, maxVisualLen: number): string {
  if (!str) return ''
  let cur = 0
  let res = ''
  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const code = str.charCodeAt(i)
    const w = (code > 255 || (code >= 0x1100 && code <= 0x115F) || (code >= 0x2E80 && code <= 0x9FFF)) ? 2 : 1
    if (cur + w > maxVisualLen) break
    cur += w
    res += char
  }
  return res
}

function formatRp(amount: number): string {
  return 'Rp ' + amount.toLocaleString('id-ID')
}

function formatDateTime(dateInput?: any, showDate = true, showTime = true): string {
  const date = dateInput ? new Date(dateInput) : new Date()
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  if (showDate && showTime) return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
  if (showDate) return `${day}/${month}/${year}`
  if (showTime) return `${hours}:${minutes}:${seconds}`
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

// 单例锁：确保只有一个实例运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting.')
  app.quit()
}

// second-instance 事件在任何时候都可能触发，在 whenReady 之前也会
// 所以这里使用延迟引用 mainWindow（whenReady 里才创建）
app.on('second-instance', () => {
  // 延迟聚焦到主窗口（等待 whenReady 完成）
  setTimeout(() => {
    const { BrowserWindow } = require('electron')
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const win = wins[0]
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  }, 1000)
})

// 应用启动
app.whenReady().then(async () => {
  console.log('[Electron] App ready, starting up...')

  // 警告：打印模块加载失败
  if (printerLoadFailed) {
    const warningMsg = '打印模块（electron-pos-printer）未能成功加载。\n\n影响功能：\n- 小票打印可能无法工作\n- 钱箱可能无法打开\n\n建议：请重新安装应用程序。'
    console.error('[Electron] Printer module warning:', warningMsg)
    dialog.showMessageBox({
      type: 'warning',
      title: '打印模块加载失败',
      message: warningMsg,
      buttons: ['确定']
    })
  }

  // WebView2 检查（仅 Windows，Electron 28+ 已内置 WebView2 但旧系统可能缺失）
  if (process.platform === 'win32') {
    const webview2Available = checkWebView2()
    console.log('[Electron] WebView2 available:', webview2Available)
    if (!webview2Available) {
      const msg = 'WebView2 运行时未安装。\n\n请先安装 Microsoft Edge WebView2 运行时：\nhttps://developer.microsoft.com/microsoft-edge/webview2/\n\n安装后请重新启动应用程序。'
      console.error('[Electron] WebView2 MISSING:', msg)
      dialog.showErrorBox('缺少 WebView2 运行时', msg)
      app.quit()
      return
    }
  }

  // 注册全局快捷键：Ctrl+Shift+D 打开诊断页
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`window.location.hash = '#/diagnostics'`)
    }
  })

  // 先启动本地服务器（仅打包模式）
  if (app.isPackaged) {
    // 启动服务器并等待 schema 同步完成
    // 注意：即使这里抛异常，也不应该导致整个 app 退出
    try {
      await startLocalServer()
    } catch (err: any) {
      log.error('[Electron] startLocalServer() threw:', err.message, err.stack)
      // 不退出，继续尝试启动窗口和服务器
    }

    // 等待服务器 port 7072 可用后再创建窗口
    try {
      await waitForPort(7072, 60000)
      log.log('[Electron] Server is ready, creating windows...')
      try {
        createMainWindow()
        console.log('[Electron] Main window created')
      } catch (e) {
        console.error('[Electron] Failed to create main window:', e)
      }
      try {
        createCustomerWindow()
        console.log('[Electron] Customer window created')
      } catch (e) {
        console.warn('[Electron] Failed to create customer window:', e)
      }
      if (mainWindow) {
        setupUpdater(mainWindow,onlineInstallationHooks)
        setTimeout(() => checkForUpdatesOnStart(), 10000)
      }
    } catch (err: any) {
      log.error('[Electron] Server failed to start:', err.message)
      // 即使服务器启动失败也创建主窗口，显示错误页
      createMainWindow()
      if (mainWindow) {
        showErrorPage(mainWindow, '服务器启动失败',
          '本地 API 服务器未能成功启动，应用程序无法正常工作。',
          `错误：${err.message}\n\n请尝试重新安装应用程序。\n如果问题持续，请查看日志文件获取详细信息。`)
      }
    }
  } else {
    // 开发模式：直接创建窗口（vite dev server 已运行）
    createMainWindow()
    createCustomerWindow()
    if (mainWindow) {
      setupUpdater(mainWindow,onlineInstallationHooks)
      setTimeout(() => checkForUpdatesOnStart(), 10000)
    }
  }
})

app.on('window-all-closed', () => {
  stopLocalServer()
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

// 确保退出时关闭服务器
app.on('before-quit', () => {
  stopLocalServer()
})
