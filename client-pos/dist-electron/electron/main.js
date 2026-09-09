"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const updater_1 = require("./updater");
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
const main_1 = __importDefault(require("electron-log/main"));
// 初始化 electron-log（文件日志）
// 日志路径：{userData}/logs/main.log
main_1.default.initialize();
main_1.default.transports.file.level = 'info';
main_1.default.transports.console.level = 'debug';
main_1.default.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
// 全局未捕获异常处理器（防止静默崩溃）
process.on('uncaughtException', (error) => {
    main_1.default.error('[FATAL] Uncaught exception:', error);
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
    main_1.default.error('[FATAL] Unhandled rejection:', reason);
    setTimeout(() => process.exit(1), 1000);
});
// Odoo-style thermal printer support
let ThermalPrinter = null;
let ElectronPrinter = null;
try {
    ThermalPrinter = require('node-thermal-printer');
    ElectronPrinter = require('electron-printer');
    console.log('[PRINTER] node-thermal-printer and electron-printer loaded');
}
catch (e) {
    console.log('[PRINTER] Thermal printer libs not available:', e?.message);
}
// 检测 WebView2 是否可用（Windows only）
function checkWebView2() {
    if (process.platform !== 'win32')
        return true;
    try {
        // 检查注册表键：Everett 存储（WebView2 安装后写入）
        const regKey = 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
        const { execSync } = require('child_process');
        const result = execSync(`reg query "${regKey}" /v pv 2>nul`, { encoding: 'utf8', timeout: 5000 });
        const match = result.match(/pv\s+REG_SZ\s+(\d+\.\d+\.\d+)/);
        if (match) {
            console.log('[WebView2] Runtime version:', match[1]);
            return true;
        }
        return false;
    }
    catch {
        // 注册表键不存在 = WebView2 未安装
        return false;
    }
}
// 获取日志文件路径
function getLogPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'logs', 'main.log');
}
// 获取日志目录路径
function getLogDir() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'logs');
}
// 显示错误信息页面（同步版本，不依赖窗口加载）
function showErrorPageSync(title, message, details) {
    const logPath = getLogPath();
    const logDir = getLogDir();
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
</html>`;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    }
}
// 显示错误信息页面
function showErrorPage(mainWindow, title, message, details) {
    const logPath = getLogPath();
    const logDir = getLogDir();
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
</html>`;
    mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
}
// Windows DPI awareness - 修复高分屏字体模糊
// Process DPI awareness before app.ready()
if (process.platform === 'win32') {
    // 尝试设置 Per-Monitor DPI v2 (需要 Windows 10 1703+)
    try {
        // SetProcessDpiAwarenessContext for Per-Monitor v2
        // Falls back gracefully on older Windows
        electron_1.app.commandLine.appendSwitch('high-dpi-config', '1.0');
        electron_1.app.commandLine.appendSwitch('force-device-scale-factor', '1');
    }
    catch (e) {
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
let mainWindow = null;
let customerWindow = null;
// 本地 Express 服务器进程（用于打包后的桌面版本）
let serverProcess = null;
/**
 * 获取服务器入口文件的真实路径
 *
 * asar:true  -> server 在 app.asar.unpacked/server/dist/index.js
 * asar:false -> server 在 server/dist/index.js（extraResources 直接在 resources/ 下）
 *
 * 检测方法：app.getAppPath() 末尾是 .asar 则为 asar 模式
 */
function getServerEntryPath() {
    const isAsar = electron_1.app.getAppPath().endsWith('.asar');
    if (isAsar) {
        // asar: true — server 在 app.asar.unpacked 下
        return path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'dist', 'index.js');
    }
    else {
        // asar: false — server 直接在 resources/server/dist 下（extraResources）
        return path_1.default.join(process.resourcesPath, 'server', 'dist', 'index.js');
    }
}
/**
 * 获取 seed 数据库模板路径
 */
function getSeedTemplatePath() {
    // seed.db 位于 asar 内部 app.getAppPath()/server/prisma/seed.db
    // extraResources 已将 server/uploads 复制到 asar.unpacked，但 prisma 文件由 asarUnpack 提取
    // 为确保兼容性，优先使用 app.getAppPath()（asar 内部），备用 asar.unpacked
    if (electron_1.app.isPackaged) {
        const asarPath = path_1.default.join(electron_1.app.getAppPath(), 'server', 'prisma', 'seed.db');
        const unpackedPath = path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'seed.db');
        return fs_1.default.existsSync(asarPath) ? asarPath : (fs_1.default.existsSync(unpackedPath) ? unpackedPath : asarPath);
    }
    else {
        return path_1.default.join(process.resourcesPath, 'server', 'prisma', 'seed.db');
    }
}
/**
 * 获取 Prisma schema 路径（asar/unpack 兼容）
 */
function getPrismaSchemaPath() {
    // schema.prisma 由 asarUnpack 提取到 asar.unpacked/server/prisma/schema.prisma
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'schema.prisma');
    }
    else {
        return path_1.default.join(process.resourcesPath, 'server', 'prisma', 'schema.prisma');
    }
}
/**
 * 同步检查并修复用户数据库 schema
 * 等待 prisma db push 完成后再继续（同步阻塞）
 * 这确保数据库 schema 在服务器启动前就已更新
 */
async function ensureSchemaUpToDate(userDbPath) {
    // 获取 server/node_modules 的基础路径（不含 .bin）
    const serverModulesPath = electron_1.app.isPackaged
        ? path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'node_modules')
        : path_1.default.join(process.resourcesPath, 'server', 'node_modules');
    // 定位 node 可执行文件（跨平台）
    // 注意：Electron 打包后 process.execPath 是 Electron/BTPS.exe，不是独立的 node.exe
    // 不能用 Electron 主程序来执行 node 脚本，必须找正确的 node 路径
    // Windows 打包后 node.exe 位于 resources/app.asar.unpacked/node_modules/electron/dist/node.exe
    // 或者使用 electron 提供的特殊方法：直接用 process.execPath + --eval 风格
    // 最简单方案：用 process.execPath 带上 script 参数（electron fork 的标准用法）
    let nodeBin = process.execPath;
    if (process.platform === 'win32') {
        // 尝试找 electron 目录下的 node.exe（electron-builder 打包时带）
        const electronDir = path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist');
        const electronNodeExe = path_1.default.join(electronDir, 'node.exe');
        if (fs_1.default.existsSync(electronNodeExe)) {
            nodeBin = electronNodeExe;
            main_1.default.log('[Schema] Using electron bundled node:', nodeBin);
        }
        else {
            // 备用：直接用 process.execPath（Electron 本身包含 Node.js）
            main_1.default.log('[Schema] electron node.exe not found, using process.execPath as fallback');
        }
    }
    // prisma CLI 入口脚本（避免使用 .bin/prisma shell 脚本，它包含硬编码的开发机路径）
    // npm 安装时路径: server/node_modules/prisma/build/index.js
    const prismaCliPath = path_1.default.join(serverModulesPath, 'prisma', 'build', 'index.js');
    const schemaPath = getPrismaSchemaPath();
    if (!fs_1.default.existsSync(schemaPath)) {
        main_1.default.warn('[Schema] schema.prisma not found, skipping db sync');
        return;
    }
    if (!fs_1.default.existsSync(prismaCliPath)) {
        main_1.default.warn('[Schema] prisma CLI not found at', prismaCliPath, '- skipping db sync');
        return;
    }
    main_1.default.log('[Schema] Checking database schema...');
    main_1.default.log('[Schema] Prisma CLI:', prismaCliPath);
    return new Promise((resolve) => {
        let childExited = false;
        // 直接用 node 执行 prisma CLI 脚本，避免 shell 脚本在 Windows 上的路径问题
        // 注意：stdout 设为 'ignore' 避免 Prisma 退出后 pipe 断开导致 EPIPE 错误
        const child = (0, child_process_1.spawn)(nodeBin, [prismaCliPath, 'db', 'push', '--accept-data-loss', '--schema', schemaPath], {
            env: { ...process.env, DATABASE_URL: `file:${userDbPath}`, NODE_ENV: 'production' },
            stdio: ['ignore', 'ignore', 'pipe', 'pipe']
        });
        let stderrData = '';
        child.stderr?.on('data', (d) => {
            const msg = d.toString();
            stderrData += msg;
            if (msg.includes('The column') || msg.includes('Your database is now in sync') || msg.includes('error')) {
                main_1.default.log('[Prisma]', msg.trim());
            }
        });
        child.on('close', (code) => {
            childExited = true;
            if (code === 0 || stderrData.includes('Your database is now in sync')) {
                main_1.default.log('[Schema] Database schema is up to date');
            }
            else {
                main_1.default.warn('[Schema] db push returned code', code, '- continuing anyway');
            }
            resolve();
        });
        child.on('error', (err) => {
            main_1.default.warn('[Schema] Could not run prisma db push:', err.message, '- continuing anyway');
            resolve();
        });
        // 超时保护：60秒
        setTimeout(() => {
            if (!childExited) {
                child.kill();
                main_1.default.warn('[Schema] db push timed out after 60s, continuing anyway');
                resolve();
            }
        }, 60000);
    });
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
async function startLocalServer() {
    if (!electron_1.app.isPackaged) {
        console.log('[Server] Dev mode - skipping local server start');
        return;
    }
    // ─── 关键修复：启动前清理残留进程 ───────────────────────────────
    // 场景：上次应用被强制 kill，或 SIGTERM 未能干净杀死 serverProcess
    // 导致端口 7072 被僵尸进程占用，新实例卡在 waitForPort 超时
    try {
        const { execSync } = require('child_process');
        if (process.platform === 'win32') {
            // Windows: 查找占用 7072 端口的进程并强制结束
            const result = execSync(`netstat -ano | findstr :7072 | findstr LISTENING`, { encoding: 'utf8', windowsHide: true });
            const lines = result.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const localAddr = parts[1] || '';
                if (!localAddr.includes(':7072'))
                    continue;
                const pid = parts[parts.length - 1];
                if (!pid || pid === '0')
                    continue;
                console.log(`[Server] Killing residual process PID=${pid} holding port 7072`);
                try {
                    execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
                    console.log(`[Server] Residual process ${pid} killed`);
                }
                catch (killErr) {
                    console.warn(`[Server] Failed to kill PID ${pid}:`, killErr.message);
                }
            }
        }
        else {
            // macOS/Linux: 用 lsof 找到占用 7072 的进程
            const result = execSync(`lsof -ti:7072 2>/dev/null || true`, { encoding: 'utf8' });
            const pids = result.trim().split('\n').filter(Boolean);
            for (const pid of pids) {
                console.log(`[Server] Killing residual process PID=${pid} holding port 7072`);
                try {
                    process.kill(parseInt(pid), 'SIGKILL');
                    console.log(`[Server] Residual process ${pid} killed`);
                }
                catch (killErr) {
                    console.warn(`[Server] Failed to kill PID ${pid}:`, killErr.message);
                }
            }
        }
        // 等待系统释放端口
        await new Promise(r => setTimeout(r, 1000));
    }
    catch (cleanupErr) {
        // 端口未被占用 → 忽略错误
        console.log('[Server] No residual process on port 7072, proceeding...');
    }
    // ─── 清理完毕 ────────────────────────────────────────────────
    const userDataDir = electron_1.app.getPath('userData');
    const dbDir = path_1.default.join(userDataDir, 'data');
    const userDbPath = path_1.default.join(dbDir, 'dev.db');
    // seed 模板路径（asar 模式自适应）
    const seedTemplatePath = getSeedTemplatePath();
    main_1.default.log(`[Server] App version: ${electron_1.app.getVersion()}, userData: ${userDataDir}`);
    // 确保数据库目录存在
    try {
        if (!fs_1.default.existsSync(dbDir)) {
            fs_1.default.mkdirSync(dbDir, { recursive: true });
            main_1.default.log('[Server] Created data directory:', dbDir);
        }
    }
    catch (e) {
        main_1.default.error('[Server] Failed to create data directory:', e);
        return;
    }
    // 首次安装：从 seed.db 模板复制用户数据库
    if (!fs_1.default.existsSync(userDbPath)) {
        main_1.default.log('[Server] User database not found, initializing from seed...');
        const seedExists = fs_1.default.existsSync(seedTemplatePath);
        main_1.default.log('[Server] Seed template path:', seedTemplatePath);
        main_1.default.log('[Server] Seed template exists:', seedExists);
        if (seedExists) {
            try {
                fs_1.default.copyFileSync(seedTemplatePath, userDbPath);
                main_1.default.log('[Server] Seed copied to user database:', userDbPath);
            }
            catch (copyErr) {
                main_1.default.error('[Server] Failed to copy seed.db:', copyErr);
                // 继续尝试启动，Prisma 会尝试创建表（可能失败但至少能运行部分功能）
            }
        }
        else {
            main_1.default.warn('[Server] Seed template not found at expected path, will try to start anyway');
            main_1.default.warn('[Server] If startup fails, please reinstall the application');
        }
    }
    else {
        main_1.default.log('[Server] User database already exists:', userDbPath);
    }
    // 关键：自动检测并修复数据库 schema（新增列/表缺失时自动 db push）
    // 这确保从旧版本升级的用户不需要手动清理数据库
    // 同步等待完成：schema 必须先更新，服务器才能安全启动
    await ensureSchemaUpToDate(userDbPath);
    // unpackedRoot = resources/app.asar.unpacked/（Node 模块实际位置）
    const unpackedRoot = path_1.default.join(process.resourcesPath, 'app.asar.unpacked');
    // server 模块在 app.asar.unpacked/server/node_modules
    // @prisma/client 和 .prisma 在 app.asar.unpacked/node_modules
    // NODE_PATH 需要包含两者才能让 prisma 和服务器正确加载模块
    const serverModulesPath = path_1.default.join(unpackedRoot, 'server', 'node_modules');
    const prismaModulesPath = path_1.default.join(unpackedRoot, 'node_modules');
    const nodePath = `${serverModulesPath}${path_1.default.delimiter}${prismaModulesPath}`;
    main_1.default.log('[Server] NODE_PATH:', nodePath);
    // 获取服务器入口文件路径（asarUnpack 后的真实文件系统路径）
    const serverEntry = getServerEntryPath();
    main_1.default.log('[Server] Server path:', serverEntry);
    main_1.default.log('[Server] Database path:', userDbPath);
    main_1.default.log('[Server] Starting local API server...');
    // asar 模式下 uploads 在 app.asar.unpacked/server/uploads
    const uploadsPath = path_1.default.join(unpackedRoot, 'server', 'uploads');
    main_1.default.log('[Server] Uploads path:', uploadsPath);
    // fork Express 服务器
    // 注意：必须显式指定 node 可执行文件路径，不能依赖 fork() 默认行为
    // Windows 上 process.execPath 是 BTPS.exe（Electron 主程序），不是 node.exe
    // electron-builder 打包后 node.exe 位于 app.asar.unpacked/node_modules/electron/dist/
    let nodeExecPath = process.execPath;
    if (process.platform === 'win32') {
        const electronDir = path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'electron', 'dist');
        const electronNodeExe = path_1.default.join(electronDir, 'node.exe');
        if (fs_1.default.existsSync(electronNodeExe)) {
            nodeExecPath = electronNodeExe;
            main_1.default.log('[Server] Using electron bundled node:', nodeExecPath);
        }
        else {
            main_1.default.log('[Server] electron node.exe not found, using process.execPath as fallback');
        }
    }
    serverProcess = (0, child_process_1.fork)(serverEntry, [], {
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
    });
    serverProcess.on('message', (msg) => {
        main_1.default.log('[Server]', msg);
    });
    serverProcess.stdout?.on('data', (data) => {
        main_1.default.log('[Server stdout]', data.toString().trim());
    });
    serverProcess.stderr?.on('data', (data) => {
        main_1.default.error('[Server stderr]', data.toString().trim());
    });
    serverProcess.on('error', (err) => {
        main_1.default.error('[Server] Failed to start:', err.message);
    });
    serverProcess.on('exit', (code, signal) => {
        console.log(`[Server] Process exited with code ${code}, signal ${signal}`);
        serverProcess = null;
    });
    console.log('[Server] Local API server started (PID:', serverProcess.pid, ')');
}
/**
 * 等待端口可用（轮询检测）
 */
function waitForPort(port, timeoutMs = 30000) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const client = new net_1.default.Socket();
            client.connect(port, '127.0.0.1', () => {
                client.destroy();
                main_1.default.log(`[Server] Port ${port} is ready`);
                resolve();
            });
            client.on('error', () => {
                client.destroy();
                if (Date.now() - startTime > timeoutMs) {
                    reject(new Error(`Port ${port} did not become available within ${timeoutMs}ms`));
                }
                else {
                    setTimeout(check, 500);
                }
            });
        };
        check();
    });
}
/**
 * 关闭本地服务器（应用退出时）
 */
function stopLocalServer() {
    if (serverProcess) {
        console.log('[Server] Shutting down local server...');
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
}
// 开发模式检测
const isDev = process.env.NODE_ENV !== 'production' && !electron_1.app.isPackaged;
/**
 * 获取资源文件路径（兼容打包和开发模式）
 * 优先使用 app.getAppPath()，因为 __dirname 在某些打包情况下不可靠
 */
function getResourcePath(relativePath) {
    if (electron_1.app.isPackaged) {
        // 打包后：app.getAppPath() 返回包含 resources/app 的目录
        // 结构: resources/app/client-pos/dist/index.html
        // electron-builder.json 的 files 配置把 client-pos/ 目录内容打包进去
        // 但 dist-electron 在 asarUnpack 中，所以实际在 app.asar.unpacked 下
        // sandbox: true 时 preload 必须使用 unpacked 路径
        if (relativePath.startsWith('dist-electron')) {
            // dist-electron 在 asarUnpack 中，使用 unpacked 路径
            return path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'client-pos', relativePath);
        }
        return path_1.default.join(electron_1.app.getAppPath(), 'client-pos', relativePath);
    }
    else {
        // 开发模式：使用 __dirname
        // __dirname = 项目根目录/dist-electron/electron
        return path_1.default.join(__dirname, '..', '..', relativePath);
    }
}
/**
 * 创建主窗口（收银界面）
 */
function createMainWindow() {
    // 双屏兼容：显式找最左边的屏幕作为主屏（点单系统）
    // 不依赖 getPrimaryDisplay()（用户可能把外接屏设为主屏）
    const allDisplays = electron_1.screen.getAllDisplays();
    const leftmostDisplay = allDisplays.reduce((leftmost, current) => current.bounds.x < leftmost.bounds.x ? current : leftmost);
    const { width, height, x: screenX, y: screenY } = leftmostDisplay.workArea;
    mainWindow = new electron_1.BrowserWindow({
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
            // 高 DPI 支持
            enableBlinkFeatures: 'CSSColorSchemeUARendering'
        },
        // Windows 高 DPI 设置
        titleBarStyle: process.platform === 'win32' ? 'default' : undefined,
        title: 'Bubble Tea POS',
        backgroundColor: '#ffffff'
    });
    // 加载主界面（服务器启动后才加载，确保 API 可用）
    if (isDev) {
        mainWindow.loadURL('http://localhost:6063');
        mainWindow.webContents.openDevTools();
    }
    else {
        const indexPath = getResourcePath('dist/index.html');
        const preloadPath = getResourcePath('dist-electron/electron/preload.js');
        const fs = require('fs');
        console.log('[Electron] App path:', electron_1.app.getAppPath());
        console.log('[Electron] __dirname:', __dirname);
        console.log('[Electron] Loading index from:', indexPath);
        console.log('[Electron] Preload path:', preloadPath);
        // 检查文件是否存在
        const indexExists = fs.existsSync(indexPath);
        const preloadExists = fs.existsSync(preloadPath);
        console.log('[Electron] Index exists:', indexExists);
        console.log('[Electron] Preload exists:', preloadExists);
        // 诊断信息
        const diagnosticInfo = {
            'app.getAppPath()': electron_1.app.getAppPath(),
            '__dirname': __dirname,
            'indexPath': indexPath,
            'preloadPath': preloadPath,
            'indexPath 存在': indexExists,
            'preloadPath 存在': preloadExists,
            'indexPath 目录': fs.existsSync(path_1.default.dirname(indexPath)) ? '存在' : '不存在',
            'isDev': isDev,
            'isPackaged': electron_1.app.isPackaged,
            'NODE_ENV': process.env.NODE_ENV || 'undefined'
        };
        const diagnosticText = Object.entries(diagnosticInfo)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');
        // 创建诊断窗口（独立窗口，即使主窗口白屏也能看到）
        const diagWindow = new electron_1.BrowserWindow({
            width: 900,
            height: 650,
            title: '诊断信息 - Bubble Tea POS',
            alwaysOnTop: true
        });
        const dir = path_1.default.dirname(indexPath);
        let dirContents = '无法读取';
        try {
            if (fs.existsSync(dir)) {
                dirContents = fs.readdirSync(dir).slice(0, 30).join('\n');
            }
        }
        catch (e) { }
        // 读取最近的错误日志（electron-log）
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'logs', 'main.log');
        let recentLogs = '无日志文件';
        try {
            if (fs.existsSync(logPath)) {
                const logContent = fs.readFileSync(logPath, 'utf-8');
                const logLines = logContent.split('\n').filter(Boolean).slice(-30);
                recentLogs = logLines.map((line) => {
                    if (line.includes('[error]') || line.includes('[FATAL]')) {
                        return '<span style="color:#f44747">' + line.replace(/</g, '&lt;') + '</span>';
                    }
                    else if (line.includes('[warn]')) {
                        return '<span style="color:#dcdcaa">' + line.replace(/</g, '&lt;') + '</span>';
                    }
                    return '<span style="color:#9cdcfe">' + line.replace(/</g, '&lt;') + '</span>';
                }).join('\n');
            }
        }
        catch (e) {
            recentLogs = '读取失败: ' + String(e);
        }
        const logPathDisplay = logPath.replace(/</g, '&lt;');
        diagWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>诊断信息 - Bubble Tea POS</title>
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
<p style="color:#808080;margin-top:16px">如果这个窗口没自动关闭，说明主窗口加载失败。请截图发给我分析。</p>
</body>
</html>`)}`);
        // 尝试加载页面
        mainWindow.loadFile(indexPath).then(() => {
            console.log('[Electron] Successfully loaded index.html');
            // 加载成功后关闭诊断窗口
            diagWindow.close();
        }).catch((err) => {
            console.error('[Electron] Failed to load index:', err);
            // 诊断窗口已经打开，显示了路径信息
        });
        // 监听页面加载成功
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[Electron] Page finished loading');
            // 页面加载成功，但可能是白屏（React渲染失败）
            // 等待2秒后检查窗口是否还是空白
            const win = mainWindow;
            setTimeout(() => {
                if (win && !win.isDestroyed()) {
                    win.webContents.executeJavaScript(`
            document.body.innerHTML.length < 100 ||
            document.querySelector('#root')?.innerHTML === '' ||
            document.querySelector('#root')?.children.length === 0
          `).then(isBlank => {
                        if (isBlank) {
                            console.error('[Electron] Page appears blank - React may have failed to render');
                        }
                    }).catch(() => { });
                }
            }, 2000);
        });
        // 监听页面加载失败
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('[Electron] Page failed to load:', errorCode, errorDescription);
            if (mainWindow)
                showErrorPage(mainWindow, '页面加载失败', '无法加载主界面，可能缺少必要的运行时组件。', `错误码: ${errorCode}\n描述: ${errorDescription}`);
        });
        // 监听渲染进程错误
        mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('[Electron] Renderer process gone:', details);
            if (mainWindow)
                showErrorPage(mainWindow, '渲染进程异常', '应用程序渲染进程意外退出。', `详情: ${JSON.stringify(details)}`);
        });
        // 监听控制台消息（来自渲染进程）- 捕获所有级别
        mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            const levelNames = ['debug', 'info', 'warn', 'error'];
            const levelName = levelNames[level] || `level${level}`;
            console.log(`[Renderer ${levelName}] ${message} (${sourceId}:${line})`);
            // React 常见错误关键字
            const errorPatterns = [
                'Error:', 'Cannot', 'undefined', 'null is not',
                'is not a function', 'is not defined', 'Failed to',
                'SyntaxError', 'TypeError', 'ReferenceError'
            ];
            const isLikelyError = level >= 2 ||
                errorPatterns.some(p => message.includes(p));
            if (isLikelyError && mainWindow && !mainWindow.isDestroyed()) {
                // 显示渲染错误
                console.error(`[Renderer Error Detected] ${message}`);
            }
        });
        // 监听渲染进程崩溃
        mainWindow.webContents.on('crashed', (event, killed) => {
            console.error('[Electron] Renderer process crashed, killed:', killed);
            if (mainWindow)
                showErrorPage(mainWindow, '渲染进程崩溃', '应用程序崩溃，请尝试重新安装。', `killed: ${killed}`);
        });
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
        if (customerWindow) {
            customerWindow.close();
        }
    });
    // 监听页面加载错误
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('[Electron] Failed to load:', errorCode, errorDescription);
    });
    mainWindow.webContents.on('crashed', () => {
        console.error('[Electron] Renderer process crashed');
    });
    console.log('[Electron] Main window created');
}
/**
 * 创建副屏窗口（顾客展示）
 * 双屏兼容：使用最右边的屏幕（排除主窗口所在屏）
 */
function createCustomerWindow() {
    const allDisplays = electron_1.screen.getAllDisplays();
    // 找最左边的屏幕（主窗口所在屏）
    const leftmostDisplay = allDisplays.reduce((leftmost, current) => current.bounds.x < leftmost.bounds.x ? current : leftmost);
    // 副屏：用最右边的屏幕（通常是外接的顾客展示屏）
    const rightmostDisplay = allDisplays.reduce((rightmost, current) => current.bounds.x > rightmost.bounds.x ? current : rightmost);
    // 如果最右边的屏幕就是主屏（只有一个屏幕），则跳过副屏创建
    const isSameDisplay = rightmostDisplay.bounds.x === leftmostDisplay.bounds.x &&
        rightmostDisplay.bounds.y === leftmostDisplay.bounds.y;
    if (isSameDisplay) {
        console.log('[Electron] Only one display found, skipping customer window');
        return;
    }
    const targetDisplay = rightmostDisplay;
    const { width, height, x: screenX, y: screenY } = targetDisplay.workArea;
    customerWindow = new electron_1.BrowserWindow({
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
    });
    // 加载副屏界面
    if (isDev) {
        customerWindow.loadURL('http://localhost:6063/customer-display');
    }
    else {
        // 注意：loadFile 的 hash 参数不生效，必须用 loadURL + file:// + hash
        const indexPath = getResourcePath('dist/index.html');
        const fileUrl = 'file://' + indexPath.replace(/\\/g, '/') + '#/customer-display';
        console.log('[Electron] Customer display loading:', fileUrl);
        customerWindow.loadURL(fileUrl).catch((err) => {
            console.error('[Electron] Customer display load failed:', err);
        });
    }
    customerWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error('[Electron] Customer display failed to load:', errorCode, errorDescription);
    });
    customerWindow.webContents.on('crashed', () => {
        console.error('[Electron] Customer display renderer crashed');
    });
    customerWindow.on('closed', () => {
        customerWindow = null;
    });
    console.log('[Electron] Customer window created');
}
// IPC 通信 - 订单状态同步到副屏
// ========== Printer Listing (Windows) ==========
electron_1.ipcMain.handle('list-printers', async () => {
    if (process.platform !== 'win32') {
        return { printers: [], error: 'Only supported on Windows' };
    }
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        const psCommand = `Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress`;
        exec(`powershell -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error) {
                console.error('[LIST-PRINTERS] Error:', error.message);
                resolve({ printers: [], error: error.message });
                return;
            }
            try {
                const trimmed = stdout.trim();
                if (!trimmed) {
                    resolve({ printers: [], error: null });
                    return;
                }
                // Parse JSON output (might be array or single string)
                let printers;
                if (trimmed.startsWith('[')) {
                    printers = JSON.parse(trimmed);
                }
                else if (trimmed.startsWith('{')) {
                    printers = [JSON.parse(trimmed).Name];
                }
                else {
                    // Plain text, one printer per line
                    printers = trimmed.split('\n').map((s) => s.trim()).filter(Boolean);
                }
                console.log('[LIST-PRINTERS] Found:', printers.length, 'printers');
                resolve({ printers, error: null });
            }
            catch (parseError) {
                console.error('[LIST-PRINTERS] Parse error:', parseError.message);
                resolve({ printers: [], error: parseError.message });
            }
        });
    });
});
// IPC 通信 - 订单状态同步到副屏
electron_1.ipcMain.on('order-update', (_event, orderData) => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-update', orderData);
    }
});
// IPC 通信 - API URL 配置（持久化到文件系统）
electron_1.ipcMain.handle('get-api-url', () => {
    const fs = require('fs');
    const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'api-config.json');
    try {
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return data.apiUrl || '/api';
        }
    }
    catch (e) { }
    return '/api';
});
electron_1.ipcMain.handle('get-app-version', () => {
    return electron_1.app.getVersion();
});
electron_1.ipcMain.handle('get-log-entries', () => {
    try {
        const logPath = path_1.default.join(electron_1.app.getPath('userData'), 'logs', 'main.log');
        const fs = require('fs');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf-8');
            const entries = content.split('\n').filter(Boolean).slice(-100).map((line) => {
                const match = line.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]\s*\[(\w+)\]\s*(.*)$/);
                if (match) {
                    return { timestamp: match[1], level: match[2].toLowerCase(), message: match[3] };
                }
                return { timestamp: '', level: 'info', message: line };
            });
            return JSON.stringify(entries);
        }
    }
    catch (e) { }
    return '[]';
});
electron_1.ipcMain.handle('set-api-url', (_event, url) => {
    const fs = require('fs');
    // 验证 URL 格式：只允许 /api 相对路径或明确的 http/https URL
    const isValidUrl = typeof url === 'string' && (url === '/api' ||
        url.startsWith('/api?') ||
        url.startsWith('/api/') ||
        /^https?:\/\/[^/]+\/api\/?/.test(url));
    if (!isValidUrl) {
        console.error('[API URL] Invalid URL rejected:', url);
        return false;
    }
    const configPath = path_1.default.join(electron_1.app.getPath('userData'), 'api-config.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify({ apiUrl: url }, null, 2));
        return true;
    }
    catch (e) {
        console.error('[API URL] Failed to save:', e);
        return false;
    }
});
electron_1.ipcMain.on('order-clear', () => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-clear');
    }
});
electron_1.ipcMain.on('order-complete', (_event, orderNumber) => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-complete', orderNumber);
    }
});
/**
 * 打印小票 - Windows原生打印 或 网络打印
 */
electron_1.ipcMain.handle('print-receipt', async (_event, data) => {
    console.log('[PRINT] print-receipt called with:', JSON.stringify({
        printerName: data?.printerName,
        printerHost: data?.printerHost,
        printerPort: data?.printerPort,
        hasItems: !!data?.items?.length
    }));
    try {
        console.log('[PRINT] Preparing to print receipt');
        // USB 打印机：优先使用 Windows 原生打印
        // 网络打印机：通过 RAW 端口打印
        if (process.platform === 'win32') {
            try {
                await printViaWindowsRaw(data);
                console.log('[PRINT] Windows print successful');
                return { success: true };
            }
            catch (winError) {
                console.log('[PRINT] Windows print failed:', winError.message);
                // Windows 打印失败后尝试网络打印（如果是网络打印机）
                const printerHost = data.printerHost || process.env.PRINTER_HOST;
                if (printerHost) {
                    try {
                        const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
                        const text = generateReceiptText(data);
                        await printViaNetwork(text, printerHost, printerPort);
                        console.log('[PRINT] Network print successful');
                        return { success: true };
                    }
                    catch (netError) {
                        console.log('[PRINT] Network print also failed:', netError.message);
                        return { success: false, error: `USB: ${winError.message}, Network: ${netError.message}` };
                    }
                }
                return { success: false, error: winError.message };
            }
        }
        // 非 Windows 平台：尝试网络打印
        const printerHost = data.printerHost || process.env.PRINTER_HOST || '192.168.1.100';
        const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
        const text = generateReceiptText(data);
        await printViaNetwork(text, printerHost, printerPort);
        return { success: true };
    }
    catch (error) {
        console.error('[PRINT ERROR]', error);
        return { success: false, error: error.message };
    }
});
/**
 * 网络打印 - 直接发送 ESC/POS 命令到打印机
 */
function printViaNetwork(text, host, port) {
    const net = require('net');
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Network print timeout'));
        }, 10000); // 10秒超时
        client.connect(port, host, () => {
            clearTimeout(timeout);
            // 发送 latin1 编码的原始 ESC/POS 数据
            const buffer = Buffer.from(text, 'latin1');
            client.write(buffer, 'latin1', (err) => {
                if (err) {
                    client.end();
                    reject(err);
                }
                else {
                    client.end();
                    console.log('[PRINT] Data sent to', host + ':' + port);
                    resolve();
                }
            });
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            console.error('[PRINT] Network error:', err.message);
            reject(err);
        });
    });
}
/**
 * Windows 原生打印 - 使用 Windows print 命令
 */
async function printViaWindowsRaw(data) {
    // 直接使用 Windows print 命令
    return new Promise((resolve, reject) => {
        const text = generateReceiptText(data);
        const printerName = data.printerName || '';
        const os = require('os');
        const path = require('path');
        const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`);
        // 写入临时文件
        try {
            fs_1.default.writeFileSync(tempFile, text, { encoding: 'utf8' });
            console.log('[PRINT] Temp file:', tempFile);
        }
        catch (err) {
            console.log('[PRINT] Write file error:', err.message);
            reject(err);
            return;
        }
        // 使用 print /D:printerName 直接打印到指定打印机
        let cmd;
        if (printerName) {
            cmd = `print /D:"${printerName}" "${tempFile}"`;
        }
        else {
            // 使用默认打印机
            cmd = `print "${tempFile}"`;
        }
        console.log('[PRINT] Printer:', printerName || 'default');
        console.log('[PRINT] Command:', cmd);
        (0, child_process_1.exec)(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
            console.log('[PRINT] stdout:', stdout);
            console.log('[PRINT] stderr:', stderr);
            try {
                fs_1.default.unlinkSync(tempFile);
            }
            catch (e) { }
            if (error) {
                console.log('[PRINT] Error:', error.message);
                reject(error);
            }
            else {
                console.log('[PRINT] Done');
                resolve();
            }
        });
    });
}
/**
 * 打开钱箱 - USB打印机优先Windows原生，网络打印机用网络
 */
electron_1.ipcMain.handle('open-cash-drawer', async (_event, data) => {
    try {
        console.log('[CASH DRAWER] Opening drawer');
        // USB 打印机：使用 Windows 原生方式
        if (process.platform === 'win32') {
            try {
                await openCashDrawerViaWindows(data.printerName);
                console.log('[CASH DRAWER] Windows drawer successful');
                return { success: true };
            }
            catch (winError) {
                console.log('[CASH DRAWER] Windows drawer failed:', winError.message);
                // Windows 失败后尝试网络（如果是网络打印机）
                const printerHost = data?.printerHost || process.env.PRINTER_HOST;
                if (printerHost) {
                    try {
                        const printerPort = data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
                        await openCashDrawerViaNetwork(printerHost, printerPort);
                        console.log('[CASH DRAWER] Network drawer successful');
                        return { success: true };
                    }
                    catch (netError) {
                        console.log('[CASH DRAWER] Network also failed:', netError.message);
                        return { success: false, error: `USB: ${winError.message}, Network: ${netError.message}` };
                    }
                }
                return { success: false, error: winError.message };
            }
        }
        // 非 Windows：尝试网络钱箱
        const printerHost = data?.printerHost || process.env.PRINTER_HOST || '192.168.1.100';
        const printerPort = data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
        await openCashDrawerViaNetwork(printerHost, printerPort);
        return { success: true };
    }
    catch (error) {
        console.error('[CASH DRAWER ERROR]', error);
        return { success: false, error: error.message };
    }
});
/**
 * Windows 原生打开钱箱 - 通过 RAW 端口发送钱箱命令
 */
async function openCashDrawerViaWindows(printerName) {
    const { exec } = require('child_process');
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    // ESC/POS 钱箱弹出命令: ESC p m t1 t2
    // 标准: 0x1B 0x70 0x00 0x32 0x32 (50ms脉冲)
    const cashDrawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]);
    const tempFile = path.join(os.tmpdir(), `drawer_${Date.now()}.bin`);
    fs.writeFileSync(tempFile, cashDrawerCmd);
    const escapedFile = tempFile.replace(/'/g, "''");
    let cmd;
    if (printerName) {
        // 指定了打印机名称 - 使用该打印机
        const escapedPrinter = printerName.replace(/'/g, "''");
        cmd = `powershell -Command "try { $p = Get-Printer -Name '${escapedPrinter}' -ErrorAction Stop; if ($p -and $p.PortName) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c copy /b \"${escapedFile}\" \"\\\\\\\\$env:COMPUTERNAME\\\\' + $p.PortName' -WindowStyle Hidden -Wait } } catch { }; Remove-Item '${escapedFile}' -Force -EA SilentlyContinue"`;
    }
    else {
        // 没有指定打印机 - 获取默认打印机
        cmd = `powershell -Command "try { $p = Get-Printer | Where-Object { $_.Default } | Select-Object -First 1; if (-not $p) { $p = Get-Printer | Select-Object -First 1 }; if ($p -and $p.PortName) { Start-Process -FilePath 'cmd.exe' -ArgumentList '/c copy /b \"${escapedFile}\" \"\\\\\\\\$env:COMPUTERNAME\\\\' + $p.PortName' -WindowStyle Hidden -Wait } } catch { }; Remove-Item '${escapedFile}' -Force -EA SilentlyContinue"`;
    }
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 10000 }, (error) => {
            try {
                fs.unlinkSync(tempFile);
            }
            catch (e) { }
            if (error) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
/**
 * 网络打开钱箱
 */
function openCashDrawerViaNetwork(host, port) {
    const net = require('net');
    // ESC/POS 钱箱命令
    const cashDrawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]);
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error('Cash drawer network timeout'));
        }, 5000);
        client.connect(port, host, () => {
            clearTimeout(timeout);
            client.write(cashDrawerCommand);
            client.end();
            console.log('[CASH DRAWER] Network drawer command sent to', host + ':' + port);
            resolve();
        });
        client.on('error', (err) => {
            clearTimeout(timeout);
            console.error('[CASH DRAWER ERROR]', err.message);
            reject(err);
        });
    });
}
/**
 * 生成小票文本 (58mm打印机, 32字符宽)
 */
function generateReceiptText(data) {
    const lines = [];
    const width = 32;
    if (data.header) {
        lines.push(centerText(data.header, width));
        lines.push(repeatChar('=', width));
    }
    lines.push(`No   : ${data.orderNum || ''}`);
    lines.push(`Tgl   : ${formatDateTime()}`);
    lines.push(repeatChar('-', width));
    lines.push('ITEM              QTY     HARGA');
    lines.push(repeatChar('-', width));
    if (data.items && data.items.length > 0) {
        data.items.forEach((item) => {
            const name = truncate(`${item.productName} ${item.specName}`, 16).padEnd(16);
            const qty = String(item.quantity).padStart(3);
            const price = formatRp(item.unitPrice * item.quantity).padStart(10);
            lines.push(`${name}${qty}${price}`);
            if (item.addons && item.addons.length > 0) {
                item.addons.forEach((addon) => {
                    lines.push(`  + ${truncate(addon.name, 20)}`);
                });
            }
            if (item.sugarLevelName || item.iceLevelName) {
                const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ');
                lines.push(`  [${mods}]`);
            }
        });
    }
    lines.push(repeatChar('-', width));
    lines.push(`${'Subtotal:'.padEnd(20)}${formatRp(data.subtotal || 0).padStart(10)}`);
    lines.push(`${'Pajak:'.padEnd(20)}${formatRp(data.tax || 0).padStart(10)}`);
    if (data.discount && data.discount > 0) {
        lines.push(`${'Diskon:'.padEnd(20)}-${formatRp(data.discount).padStart(10)}`);
    }
    lines.push(repeatChar('-', width));
    lines.push(`${'TOTAL:'.padEnd(20)}${formatRp(data.total || 0).padStart(10)}`);
    if (data.paidAmount) {
        lines.push(repeatChar('-', width));
        lines.push(`${'Bayar:'.padEnd(20)}${formatRp(data.paidAmount).padStart(10)}`);
        lines.push(`${'Kembalian:'.padEnd(20)}${formatRp(data.change || 0).padStart(10)}`);
    }
    if (data.memberName) {
        lines.push(repeatChar('-', width));
        lines.push(`Member: ${data.memberName}`);
        if (data.pointsRedeemed && data.pointsRedeemed > 0) {
            lines.push(`Points: -${data.pointsRedeemed}`);
        }
    }
    lines.push('');
    if (data.footer) {
        lines.push(centerText(data.footer, width));
    }
    lines.push(centerText('=== TERIMA KASIH ===', width));
    return lines.join('\n') + '\n\n\n\n\n';
}
function centerText(text, width) {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
}
function repeatChar(char, count) {
    return char.repeat(count);
}
function truncate(str, len) {
    return str.length > len ? str.slice(0, len) : str;
}
function formatRp(amount) {
    return 'Rp ' + amount.toLocaleString('id-ID');
}
function formatDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}
// 单例锁：确保只有一个实例运行
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[Electron] Another instance is already running. Quitting.');
    electron_1.app.quit();
}
// second-instance 事件在任何时候都可能触发，在 whenReady 之前也会
// 所以这里使用延迟引用 mainWindow（whenReady 里才创建）
electron_1.app.on('second-instance', () => {
    // 延迟聚焦到主窗口（等待 whenReady 完成）
    setTimeout(() => {
        const { BrowserWindow } = require('electron');
        const wins = BrowserWindow.getAllWindows();
        if (wins.length > 0) {
            const win = wins[0];
            if (win.isMinimized())
                win.restore();
            win.focus();
        }
    }, 1000);
});
// 应用启动
electron_1.app.whenReady().then(async () => {
    console.log('[Electron] App ready, starting up...');
    // WebView2 检查（仅 Windows，Electron 28+ 已内置 WebView2 但旧系统可能缺失）
    if (process.platform === 'win32') {
        const webview2Available = checkWebView2();
        console.log('[Electron] WebView2 available:', webview2Available);
        if (!webview2Available) {
            const msg = 'WebView2 运行时未安装。\n\n请先安装 Microsoft Edge WebView2 运行时：\nhttps://developer.microsoft.com/en-us/microsoft-edge/webview2/\n\n安装后请重新启动应用程序。';
            console.error('[Electron] WebView2 MISSING:', msg);
            electron_1.dialog.showErrorBox('缺少 WebView2 运行时', msg);
            electron_1.app.quit();
            return;
        }
    }
    // 注册全局快捷键：Ctrl+Shift+D 打开诊断页
    electron_1.globalShortcut.register('CommandOrControl+Shift+D', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`window.location.hash = '#/diagnostics'`);
        }
    });
    // 先启动本地服务器（仅打包模式）
    if (electron_1.app.isPackaged) {
        // 启动服务器并等待 schema 同步完成
        await startLocalServer();
        // 等待服务器 port 7072 可用后再创建窗口
        try {
            await waitForPort(7072, 30000);
            main_1.default.log('[Electron] Server is ready, creating windows...');
            try {
                createMainWindow();
                console.log('[Electron] Main window created');
            }
            catch (e) {
                console.error('[Electron] Failed to create main window:', e);
            }
            try {
                createCustomerWindow();
                console.log('[Electron] Customer window created');
            }
            catch (e) {
                console.warn('[Electron] Failed to create customer window:', e);
            }
            if (mainWindow) {
                (0, updater_1.setupUpdater)(mainWindow);
                setTimeout(() => (0, updater_1.checkForUpdatesOnStart)(), 10000);
            }
        }
        catch (err) {
            main_1.default.error('[Electron] Server failed to start:', err.message);
            // 即使服务器启动失败也创建主窗口，显示错误页
            createMainWindow();
            if (mainWindow) {
                showErrorPage(mainWindow, '服务器启动失败', '本地 API 服务器未能成功启动，应用程序无法正常工作。', `错误：${err.message}\n\n请尝试重新安装应用程序。\n如果问题持续，请查看日志文件获取详细信息。`);
            }
        }
    }
    else {
        // 开发模式：直接创建窗口（vite dev server 已运行）
        createMainWindow();
        createCustomerWindow();
        if (mainWindow) {
            (0, updater_1.setupUpdater)(mainWindow);
            setTimeout(() => (0, updater_1.checkForUpdatesOnStart)(), 10000);
        }
    }
});
electron_1.app.on('window-all-closed', () => {
    stopLocalServer();
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        createCustomerWindow();
    }
});
// 确保退出时关闭服务器
electron_1.app.on('before-quit', () => {
    stopLocalServer();
});
