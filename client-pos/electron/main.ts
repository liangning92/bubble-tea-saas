import { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog, Menu, nativeImage, safeStorage } from 'electron'
import { randomBytes } from 'crypto'
import path from 'path'
import { setupUpdater, checkForUpdatesOnStart } from './updater'

// 彻底禁用并隐藏 Windows / Linux 默认顶部菜单栏（File, Edit, View, Window, Help）
Menu.setApplicationMenu(null)
import fs from 'fs'

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
 * 3. fork Express 服务器，DATABASE_URL 指向用户目