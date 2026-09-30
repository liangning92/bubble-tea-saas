import { app, BrowserWindow, ipcMain, screen, globalShortcut, dialog, Menu } from 'electron'
import path from 'path'
import { setupUpdater, checkForUpdatesOnStart } from './updater'

// 彻底禁用并隐藏 Windows / Linux 默认顶部菜单栏（File, Edit, View, Window, Help）
Menu.setApplicationMenu(null)
import fs from 'fs'
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

  // skip db push at runtime - causes issues with existing databases (data loss, corruption)
  // if schema is outdated, rebuild the app from a fresh installer
  // ensureSchemaUpToDate(userDbPath)

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
      // 覆盖数据库路径为用户可写目录
      // 使用 file:${path} 格式，Prisma 会正确处理带引号的路径
      DATABASE_URL: `file:${userDbPath}`,
      // uploads 目录路径（asar 模式下在 asar.unpacked 下）
      UPLOADS_PATH: uploadsPath,
      // 关键：设置 NODE_PATH 让 fork() 的子进程能找到 express/cors 等模块
      // 需要同时包含 server/node_modules 和根目录的 node_modules（prisma 相关）
      NODE_PATH: nodePath,
      // CORS: 允许所有来源，因为 Electron app 从 file:// 加载
      CORS_ORIGIN: '*'
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
    backgroundColor: '#ffffff'
  })

  // 彻底移除 Windows 默认菜单栏（File, Edit, View, Window, Help）
  mainWindow.setMenu(null)
  mainWindow.setMenuBarVisibility(false)
  mainWindow.setAutoHideMenuBar(true)

  // 确保全屏铺满无黑边
  mainWindow.maximize()
  mainWindow.setFullScreen(true)

  // 允许 F11 键切换全屏（方便运维调试）
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown' && mainWindow && !mainWindow.isDestroyed()) {
      const isFull = mainWindow.isFullScreen()
      mainWindow.setFullScreen(!isFull)
      if (isFull) {
        mainWindow.maximize()
      }
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
    mainWindow.webContents.on('crashed', (event, killed) => {
      console.error('[Electron] Renderer process crashed, killed:', killed)
      if (mainWindow) showErrorPage(mainWindow, '渲染进程崩溃', '应用程序崩溃，请尝试重新安装。', `killed: ${killed}`)
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

  customerWindow.webContents.on('crashed', () => {
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

/**
 * 自动识别打印机名称：优先使用传入参数（支持精确匹配和模糊匹配），未指定时自动查找 Windows 默认打印机或热敏小票打印机
 */
async function resolvePrinterName(providedName?: string): Promise<string> {
  const trimmed = (providedName || '').trim()

  // 获取系统已安装的所有打印机
  let installedPrinters: { name: string; isDefault?: boolean }[] = []
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      installedPrinters = await mainWindow.webContents.getPrintersAsync()
    }
  } catch (err: any) {
    writeCrash(`[PRINTER RESOLVE] getPrintersAsync failed: ${err.message}`)
  }

  // 1. 如果收银员指定了名称
  if (trimmed) {
    // 虚拟串口 COM 口或网络共享路径直接返回
    if (/^COM\d+/i.test(trimmed) || trimmed.startsWith('\\\\')) {
      return trimmed
    }

    if (installedPrinters.length > 0) {
      // 1a. 优先全字精确匹配（忽略大小写）
      const exact = installedPrinters.find(p => p.name.toLowerCase() === trimmed.toLowerCase())
      if (exact) {
        writeCrash(`[PRINTER RESOLVE] Exact match: '${trimmed}' -> '${exact.name}'`)
        return exact.name
      }
      // 1b. 模糊匹配：例如输入 'POS-80'，实际驱动名为 'POS-80 Series' 或 'XP-80 POS'
      const fuzzy = installedPrinters.find(p =>
        p.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        trimmed.toLowerCase().includes(p.name.toLowerCase())
      )
      if (fuzzy) {
        writeCrash(`[PRINTER RESOLVE] Fuzzy match: '${trimmed}' -> '${fuzzy.name}'`)
        return fuzzy.name
      }
    }
    // 未在系统列表中找到时，仍返回用户输入的名称（由打印子系统尝试打开）
    writeCrash(`[PRINTER RESOLVE] Using provided printer name directly: '${trimmed}'`)
    return trimmed
  }

  // 2. 未指定名称时的自动探测策略
  if (installedPrinters.length > 0) {
    // 2a. 查找系统默认打印机
    const defaultPrinter = installedPrinters.find(p => p.isDefault)
    if (defaultPrinter?.name) {
      writeCrash(`[PRINTER RESOLVE] Auto-selected default printer: '${defaultPrinter.name}'`)
      return defaultPrinter.name
    }
    // 2b. 查找热敏/小票/POS关键词打印机
    const thermalPrinter = installedPrinters.find(p =>
      /pos|receipt|thermal|xp-|epson|tsp|58|80|printer/i.test(p.name)
    )
    if (thermalPrinter?.name) {
      writeCrash(`[PRINTER RESOLVE] Auto-selected thermal printer: '${thermalPrinter.name}'`)
      return thermalPrinter.name
    }
    // 2c. 回退至第 1 台可用打印机
    writeCrash(`[PRINTER RESOLVE] Auto-selected first printer: '${installedPrinters[0].name}'`)
    return installedPrinters[0].name
  }

  return ''
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

    // Windows P/Invoke 调用 winspool.drv 的 OpenPrinterA + StartDocPrinterA + WritePrinter
    const safePrinterName = printerName.replace(/'/g, "''").replace(/\\/g, "\\\\")
    const safeTempFile = tempFile.replace(/'/g, "''").replace(/\\/g, "\\\\")

    const psScript = `
$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;

public class WinSpoolRaw {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

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
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "POS_RAW_JOB";
        di.pDataType = "RAW";

        if (!OpenPrinter(szPrinter, out hPrinter, IntPtr.Zero)) {
            return false;
        }

        bool ok = false;
        if (StartDocPrinter(hPrinter, 1, di)) {
            if (StartPagePrinter(hPrinter)) {
                IntPtr pBuf = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, pBuf, bytes.Length);
                Int32 written = 0;
                ok = WritePrinter(hPrinter, pBuf, bytes.Length, out written);
                Marshal.FreeCoTaskMem(pBuf);
                EndPagePrinter(hPrinter);
            }
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

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
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
      cleanup()
      writeCrash(`[WIN-RAW] Spawn error: ${err.message}`)
      reject(err)
    })
  })
}

/**
 * 打印小票 - 优先使用 winspool.drv RAW 原生打印，支持内嵌弹钱箱脉冲
 */
ipcMain.handle('print-receipt', async (_event, data) => {
  try {
    let printerName = await resolvePrinterName(data.printerName)
    const { printerHost, printerPort, blocks, openCashDrawer: shouldOpenDrawer } = data

    writeCrash(`[PRINT] ====== print-receipt called ======`)
    writeCrash(`[PRINT] resolved printerName='${printerName}' (original: '${data.printerName}')`)
    writeCrash(`[PRINT] printerHost='${printerHost}' port=${printerPort}`)
    writeCrash(`[PRINT] hasBlocks=${!!(blocks && blocks.length > 0)}`)
    writeCrash(`[PRINT] openCashDrawer=${!!shouldOpenDrawer}`)
    writeCrash(`[PRINT] orderNum=${data.orderNum} total=${data.total}`)

    if (!printerName) {
      writeCrash('[PRINT] ERROR: No printer available on Windows system')
      return { success: false, error: 'No printer available on system' }
    }

    // 钱箱开锁脉冲指令：ESC p 0 25 250 + ESC p 1 25 250 + BEL
    const drawerCmd = shouldOpenDrawer ? Buffer.from([
      0x1B, 0x70, 0x00, 0x19, 0xFA,
      0x1B, 0x70, 0x01, 0x19, 0xFA,
      0x10, 0x14, 0x01, 0x00, 0x05,
      0x07
    ]) : Buffer.alloc(0)

    // 如果有自定义格式化模板，尝试 PosPrinter 静默打印
    if (blocks && blocks.length > 0 && PosPrinter) {
      try {
        if (shouldOpenDrawer) {
          try { await sendRawBytesToWindowsPrinter(printerName, drawerCmd) } catch (e) {}
        }
        await PosPrinter.print(blocks, {
          printerName: printerName,
          silent: true,
          preview: false,
        })
        writeCrash('[PRINT] PosPrinter.print success')
        return { success: true }
      } catch (printErr: any) {
        writeCrash(`[PRINT] PosPrinter.print failed: ${printErr.message}, falling back to raw print...`)
      }
    }

    // 生成 ESC/POS 原始打印指令 (支持多联打印 printCopies)
    const printCopies = Math.max(1, Math.min(5, data.printCopies || 1))
    const rawChunks: Buffer[] = []
    const encoder = new TextEncoder()
    const initCmd = Buffer.from([0x1B, 0x40])  // ESC @ 初始化
    const cutCmd = Buffer.from([0x1D, 0x56, 0x00, 0x0A, 0x0A])  // GS V 0 全切纸

    for (let c = 0; c < printCopies; c++) {
      const copyData = printCopies > 1 ? {
        ...data,
        copyLabel: c === 0 ? '(Customer Copy)' : '(Merchant Copy)'
      } : data
      const text = generateReceiptText(copyData)
      // 只有第一联出纸前触发弹钱箱
      const firstDrawerCmd = (c === 0 && shouldOpenDrawer) ? drawerCmd : Buffer.alloc(0)
      rawChunks.push(Buffer.concat([firstDrawerCmd, initCmd, encoder.encode(text), cutCmd]))
    }
    const rawBytes = Buffer.concat(rawChunks)
    writeCrash(`[PRINT] printCopies=${printCopies} rawBytes length=${rawBytes.length}`)

    // 1. 如果打印机是 COM 口（虚拟串口）
    const isComPort = /^COM\d+/i.test(printerName)
    if (isComPort) {
      try {
        await printViaComPort(printerName, rawBytes)
        writeCrash('[PRINT] printViaComPort success')
        return { success: true }
      } catch (comErr: any) {
        writeCrash(`[PRINT] printViaComPort failed: ${comErr.message}`)
        return { success: false, error: comErr.message }
      }
    }

    // 2. Windows 原生 winspool.drv RAW 方式（最高优先级，直接写入打印后台）
    try {
      await sendRawBytesToWindowsPrinter(printerName, rawBytes)
      writeCrash('[PRINT] sendRawBytesToWindowsPrinter success')
      return { success: true }
    } catch (winRawErr: any) {
      writeCrash(`[PRINT] sendRawBytesToWindowsPrinter failed: ${winRawErr.message}, trying PosPrinter fallback...`)
    }

    // 3. 回退尝试 PosPrinter.sendRawCommand
    if (PosPrinter?.sendRawCommand) {
      try {
        await PosPrinter.sendRawCommand(printerName, rawBytes)
        writeCrash('[PRINT] PosPrinter.sendRawCommand success')
        return { success: true }
      } catch (rawErr: any) {
        writeCrash(`[PRINT] PosPrinter.sendRawCommand failed: ${rawErr.message}, trying printViaWindowsRaw...`)
      }
    }

    // 4. 回退尝试 printViaWindowsRaw
    try {
      await printViaWindowsRaw({ ...data, printerName })
      writeCrash('[PRINT] printViaWindowsRaw fallback success')
      return { success: true }
    } catch (winErr: any) {
      writeCrash(`[PRINT] printViaWindowsRaw fallback failed: ${winErr.message}`)
      return { success: false, error: winErr.message }
    }
  } catch (error: any) {
    writeCrash(`[PRINT] print-receipt error: ${error.message}`)
    return { success: false, error: error.message }
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
 * 网络打印 - 直接发送 ESC/POS 命令到打印机
 */
function printViaNetwork(text: string, host: string, port: number): Promise<void> {
  const net = require('net')
  return new Promise((resolve, reject) => {
    const client = new net.Socket()
    const timeout = setTimeout(() => {
      client.destroy()
      reject(new Error('Network print timeout'))
    }, 10000)

    client.connect(port, host, () => {
      clearTimeout(timeout)
      const buffer = Buffer.from(text, 'latin1')
      client.write(buffer, 'latin1', (err: any) => {
        if (err) {
          client.end()
          reject(err)
        } else {
          client.end()
          console.log('[PRINT] Data sent to', host + ':' + port)
          resolve()
        }
      })
    })

    client.on('error', (err: any) => {
      clearTimeout(timeout)
      console.error('[PRINT] Network error:', err.message)
      reject(err)
    })
  })
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
    let printerName = await resolvePrinterName(data?.printerName)
    const pulseMs = Math.max(20, Math.min(500, data?.cashDrawerPulse || 100))

    writeCrash(`[CASH DRAWER] ====== open-cash-drawer called ======`)
    writeCrash(`[CASH DRAWER] resolved printerName='${printerName}' (original: '${data?.printerName}')`)
    writeCrash(`[CASH DRAWER] cashDrawerPulse=${pulseMs}ms`)

    if (!printerName) {
      writeCrash('[CASH DRAWER] ERROR: No printer available on Windows system')
      return { success: false, error: 'No printer available on system' }
    }

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

    // 2. Windows 原生 winspool.drv RAW 方式（最高优先级，直接写入打印机 Spooler 队列）
    try {
      await sendRawBytesToWindowsPrinter(printerName, drawerCmd)
      writeCrash('[CASH DRAWER] sendRawBytesToWindowsPrinter success')
      return { success: true }
    } catch (winRawErr: any) {
      writeCrash(`[CASH DRAWER] sendRawBytesToWindowsPrinter failed: ${winRawErr.message}, trying PosPrinter fallback...`)
    }

    // 3. 回退尝试 PosPrinter.sendRawCommand
    if (PosPrinter?.sendRawCommand) {
      try {
        await PosPrinter.sendRawCommand(printerName, drawerCmd)
        writeCrash('[CASH DRAWER] PosPrinter.sendRawCommand success')
        return { success: true }
      } catch (drawerErr: any) {
        writeCrash(`[CASH DRAWER] PosPrinter.sendRawCommand failed: ${drawerErr.message}, trying PosPrinter.openCashDrawer...`)
      }
    }

    // 4. 回退尝试 PosPrinter.openCashDrawer
    if (PosPrinter?.openCashDrawer) {
      try {
        await PosPrinter.openCashDrawer(printerName, { onTime: pulseMs, offTime: pulseMs })
        writeCrash('[CASH DRAWER] PosPrinter.openCashDrawer success')
        return { success: true }
      } catch (posDrawerErr: any) {
        writeCrash(`[CASH DRAWER] PosPrinter.openCashDrawer failed: ${posDrawerErr.message}`)
      }
    }

    return { success: false, error: 'All cash drawer opening methods failed for: ' + printerName }
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
    const { orderNum, printerName, printerHost, printerPort, items } = data

    writeCrash(`[KITCHEN] ====== send-kitchen-order called ======`)
    writeCrash(`[KITCHEN] orderNum='${orderNum}' printerName='${printerName}'`)
    writeCrash(`[KITCHEN] printerHost='${printerHost}' port=${printerPort}`)

    if (!orderNum) {
      writeCrash('[KITCHEN] ERROR: orderNum is empty')
      return { success: false, error: 'No order number provided' }
    }

    // 生成厨房小票文本
    const kitchenText = generateKitchenText({ orderNum, items })
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
      const encoder = new TextEncoder()
      const initCmd = Buffer.from([0x1B, 0x40])  // ESC @
      const cutCmd = Buffer.from([0x1D, 0x56, 0x00])  // GS V 0 (full cut)
      const rawBytes = Buffer.concat([initCmd, encoder.encode(kitchenText), cutCmd])

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
        // Windows 打印机名：使用 sendRawCommand
        try {
          await PosPrinter.sendRawCommand(printerName, rawBytes)
          writeCrash('[KITCHEN] sendRawCommand success')
          return { success: true }
        } catch (rawErr: any) {
          writeCrash(`[KITCHEN] sendRawCommand failed: ${rawErr.message}`)
          return { success: false, error: rawErr.message }
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
    const resolvedName = await resolvePrinterName(data.printerName)
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
      const encoder = new TextEncoder()
      const initCmd = Buffer.from([0x1B, 0x40])  // ESC @
      const cutCmd = Buffer.from([0x1D, 0x56, 0x00, 0x0A, 0x0A])  // GS V 0 full cut
      const rawBytes = Buffer.concat([initCmd, encoder.encode(text), cutCmd])

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
          writeCrash(`[SHIFT-REPORT] sendRawBytesToWindowsPrinter failed: ${winRawErr.message}, trying PosPrinter fallback...`)
        }

        try {
          await PosPrinter.sendRawCommand(resolvedName, rawBytes)
          writeCrash('[SHIFT-REPORT] sendRawCommand success')
          return { success: true }
        } catch (rawErr: any) {
          writeCrash(`[SHIFT-REPORT] sendRawCommand failed: ${rawErr.message}`)
          return { success: false, error: rawErr.message }
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
    const resolvedName = await resolvePrinterName(printerName)
    const encoder = new TextEncoder()
    const chunks: Buffer[] = []

    for (const item of stickers) {
      if (isTspl) {
        const tsplStr = generateCupStickerTspl(item)
        chunks.push(Buffer.from(encoder.encode(tsplStr)))
      } else {
        const escStr = generateCupStickerEscPos(item)
        const initCmd = Buffer.from([0x1B, 0x40])
        const cutCmd = Buffer.from([0x1D, 0x56, 0x00, 0x0A])
        chunks.push(Buffer.concat([initCmd, Buffer.from(encoder.encode(escStr)), cutCmd]))
      }
    }
    const rawBytes = Buffer.concat(chunks)

    if (printerHost && printerPort) {
      try {
        await printViaNetwork(rawBytes.toString('binary'), printerHost, printerPort)
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
          writeCrash(`[STICKER] sendRawBytesToWindowsPrinter failed: ${winRawErr.message}, trying PosPrinter fallback...`)
        }

        // 2. 回退尝试 PosPrinter.sendRawCommand
        try {
          await PosPrinter.sendRawCommand(resolvedName, rawBytes)
          writeCrash('[STICKER] sendRawCommand success')
          return { success: true }
        } catch (rawErr: any) {
          writeCrash(`[STICKER] sendRawCommand failed: ${rawErr.message}`)
          return { success: false, error: rawErr.message }
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
  const lines: string[] = []
  const is80mm = data.paperSize === '80mm'
  const width = is80mm ? 48 : 32
  const lang = (data.language || 'id').toLowerCase()

  const L = lang === 'zh' ? {
    title: '=== 交接班对账单 (Z-REPORT) ===',
    store: '门店',
    cashier: '收银员',
    shift: '班次',
    openedAt: '开班时间',
    closedAt: '交班时间',
    printTime: '打印时间',
    secSales: '--- 营业额汇总 ---',
    openFloat: '开班备用金',
    cashSales: '现金实收',
    qrisSales: 'QRIS/扫码销售',
    gofoodSales: 'GoFood 销售',
    grabSales: 'Grab 销售',
    shopeeSales: 'Shopee 销售',
    expenses: '营业支出(备用金支取)',
    secReconcile: '--- 现金盘点对账 ---',
    expectedCash: '钱箱应有现金',
    actualCash: '实际盘点现金',
    difference: '现金差额(长/短款)',
    secStats: '--- 单据统计 ---',
    totalOrders: '总订单数',
    totalCups: '总制作杯数',
    signCashier: '收银员签字: ________________',
    signManager: '店长/主管签字: ______________'
  } : {
    title: '=== LAPORAN SHIFT (Z-REPORT) ===',
    store: 'Toko',
    cashier: 'Kasir',
    shift: 'Shift',
    openedAt: 'Waktu Buka',
    closedAt: 'Waktu Tutup',
    printTime: 'Dicetak',
    secSales: '--- RINGKASAN PENJUALAN ---',
    openFloat: 'Kas Awal / Float',
    cashSales: 'Penjualan Tunai',
    qrisSales: 'Penjualan QRIS',
    gofoodSales: 'Penjualan GoFood',
    grabSales: 'Penjualan Grab',
    shopeeSales: 'Penjualan Shopee',
    expenses: 'Pengeluaran Kas',
    secReconcile: '--- REKONSILIASI KAS ---',
    expectedCash: 'Kas Seharusnya',
    actualCash: 'Kas Dihitung',
    difference: 'Selisih (Lebih/Kurang)',
    secStats: '--- STATISTIK TRANSAKSI ---',
    totalOrders: 'Total Transaksi',
    totalCups: 'Total Cup / Minuman',
    signCashier: 'Ttd Kasir: __________________',
    signManager: 'Ttd Supervisor: _____________'
  }

  const storeName = data.storeName || 'YOUME'
  lines.push(centerText(L.title, width))
  lines.push(centerText(storeName, width))
  lines.push(repeatChar('=', width))

  const colWidth = is80mm ? 22 : 14
  lines.push(`${L.cashier.padEnd(colWidth)}: ${data.cashierName || 'Kasir'}`)
  lines.push(`${L.shift.padEnd(colWidth)}: ${data.shiftType || 'Regular'}`)
  if (data.openedAt) lines.push(`${L.openedAt.padEnd(colWidth)}: ${data.openedAt}`)
  lines.push(`${L.closedAt.padEnd(colWidth)}: ${data.closedAt || formatDateTime()}`)
  lines.push(`${L.printTime.padEnd(colWidth)}: ${formatDateTime()}`)

  lines.push(repeatChar('-', width))
  lines.push(centerText(L.secSales, width))

  const addRow = (label: string, amount: number) => {
    const valStr = formatRp(amount || 0)
    const spaces = Math.max(1, width - label.length - valStr.length)
    lines.push(`${label}${' '.repeat(spaces)}${valStr}`)
  }

  addRow(L.openFloat, data.openFloat || 0)
  addRow(L.cashSales, data.cashSales || 0)
  if (data.qrisSales) addRow(L.qrisSales, data.qrisSales)
  if (data.gofoodSales) addRow(L.gofoodSales, data.gofoodSales)
  if (data.grabSales) addRow(L.grabSales, data.grabSales)
  if (data.shopeeSales) addRow(L.shopeeSales, data.shopeeSales)
  if (data.expenses) addRow(L.expenses, data.expenses)

  lines.push(repeatChar('-', width))
  lines.push(centerText(L.secReconcile, width))

  const expected = data.expectedCash || 0
  const actual = data.actualCash || 0
  const diff = actual - expected

  addRow(L.expectedCash, expected)
  addRow(L.actualCash, actual)

  const diffStr = (diff >= 0 ? '+' : '') + formatRp(diff)
  const diffLabel = L.difference
  const diffSpaces = Math.max(1, width - diffLabel.length - diffStr.length)
  lines.push(`${diffLabel}${' '.repeat(diffSpaces)}${diffStr}`)

  lines.push(repeatChar('-', width))
  lines.push(centerText(L.secStats, width))
  lines.push(`${L.totalOrders.padEnd(colWidth)}: ${data.totalOrders ?? 0}`)
  if (data.totalCups !== undefined) {
    lines.push(`${L.totalCups.padEnd(colWidth)}: ${data.totalCups}`)
  }

  lines.push(repeatChar('-', width))
  lines.push('')
  lines.push(L.signCashier)
  lines.push('')
  lines.push(L.signManager)
  lines.push('')
  lines.push(repeatChar('=', width))

  return lines.join('\n') + '\n\n\n\n'
}

/**
 * 生成 TSPL 茶饮杯贴指令 (40mm x 30mm / 50mm x 30mm)
 */
function generateCupStickerTspl(item: any): string {
  const store = item.storeName || 'YOUME'
  const orderNum = item.orderNum || ''
  const cupNo = item.cupIndex && item.totalCups ? `[${item.cupIndex}/${item.totalCups}]` : ''
  const name = (item.productName || item.name || '').slice(0, 24)
  const spec = item.specName || ''
  const sugar = item.sugarLevelName ? `Sugar: ${item.sugarLevelName}` : ''
  const ice = item.iceLevelName ? `Ice: ${item.iceLevelName}` : ''
  const mods = [sugar, ice].filter(Boolean).join(' | ')
  const addons = (item.addons || []).map((a: any) => `+${a.name || a}`).join(', ').slice(0, 30)
  const time = item.time || formatDateTime().slice(11, 19)
  const channel = item.channelName ? `(${item.channelName})` : ''

  const tspl = [
    'SIZE 40 mm, 30 mm',
    'GAP 2 mm, 0 mm',
    'DIRECTION 1',
    'CLS',
    `TEXT 15,15,"TSS24.BF2",0,1,1,"${store} #${orderNum} ${cupNo}"`,
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
  lines.push(centerText(`${store} #${orderNum} ${cupNo}`, width))
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

  lines.push(centerText('======== 厨房订单 ========', width))
  lines.push(`桌号/订单号: ${data.orderNum || ''}`)
  lines.push(`时间: ${formatTime()}`)
  lines.push(repeatChar('-', width))

  if (data.items && data.items.length > 0) {
    data.items.forEach((item: any) => {
      lines.push(`${item.quantity || 1} x ${item.productName || item.name || 'item'}`)
      if (item.specName) {
        lines.push(`  规格: ${item.specName}`)
      }
      if (item.sugarLevelName || item.iceLevelName) {
        const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
        lines.push(`  甜度/冰度: ${mods}`)
      }
      if (item.addons && item.addons.length > 0) {
        item.addons.forEach((addon: any) => {
          lines.push(`  + ${addon.name}`)
        })
      }
      if (item.notes || item.note || item.remark) {
        lines.push(`  备注: ${item.notes || item.note || item.remark}`)
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

function generateReceiptText(data: any): string {
  const lines: string[] = []
  const is80mm = data.paperSize === '80mm'
  const width = is80mm ? 48 : 32

  const lang = (data.language || 'id').toLowerCase()
  const i18nMap: Record<string, Record<string, string>> = {
    zh: {
      orderNo: '单号',
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
      orderNo: 'Order No',
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
      orderNo: 'No Order',
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
  lines.push(`${L.orderNo.padEnd(is80mm ? 10 : 7)}: ${data.orderNum || ''}`)
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
  // 58mm: name 16 + qty 4 + price 12 = 32
  // 80mm: name 28 + qty 6 + price 14 = 48
  const nameWidth = is80mm ? 28 : 16
  const qtyWidth = is80mm ? 6 : 4
  const priceWidth = is80mm ? 14 : 12

  lines.push(`${L.item.padEnd(nameWidth)}${L.qty.padStart(qtyWidth)}${L.price.padStart(priceWidth)}`)
  lines.push(repeatChar('-', width))

  // 4. Items List
  if (data.items && data.items.length > 0) {
    data.items.forEach((item: any) => {
      const spec = item.specName ? ` ${item.specName}` : ''
      const name = truncate(`${item.productName}${spec}`, nameWidth).padEnd(nameWidth)
      const qty = String(item.quantity).padStart(qtyWidth)
      const price = formatRp(item.unitPrice * item.quantity).padStart(priceWidth)
      lines.push(`${name}${qty}${price}`)

      if (data.showKitchenNote !== false) {
        if (item.addons && item.addons.length > 0) {
          item.addons.forEach((addon: any) => {
            lines.push(`  + ${truncate(addon.name, width - 4)}`)
          })
        }
        if (item.sugarLevelName || item.iceLevelName) {
          const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ')
          lines.push(`  [${mods}]`)
        }
      }
    })
  }

  lines.push(repeatChar('-', width))

  // 5. Totals
  const labelWidth = is80mm ? 30 : 18
  const valWidth = is80mm ? 18 : 14

  lines.push(`${L.subtotal.padEnd(labelWidth)}${formatRp(data.subtotal || 0).padStart(valWidth)}`)
  lines.push(`${L.tax.padEnd(labelWidth)}${formatRp(data.tax || 0).padStart(valWidth)}`)
  if (data.discount && data.discount > 0) {
    lines.push(`${L.discount.padEnd(labelWidth)}-${formatRp(data.discount).padStart(valWidth)}`)
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
        setupUpdater(mainWindow)
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
      setupUpdater(mainWindow)
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
