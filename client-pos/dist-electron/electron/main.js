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
const main_1 = __importDefault(require("electron-log/main"));
// 初始化 electron-log（文件日志）
// 日志路径：{userData}/logs/main.log
main_1.default.initialize();
main_1.default.transports.file.level = 'info';
main_1.default.transports.console.level = 'debug';
main_1.default.transports.file.maxSize = 5 * 1024 * 1024; // 5MB per file
// 全局未捕获异常处理器（防止白屏后完全崩溃）
process.on('uncaughtException', (error) => {
    main_1.default.error('[FATAL] Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
    main_1.default.error('[FATAL] Unhandled rejection:', reason);
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
// 检测 WebView2 是否可用
function checkWebView2() {
    try {
        // 尝试创建一个隐藏窗口测试 WebView2
        const testWindow = new electron_1.BrowserWindow({ show: false, webPreferences: {} });
        testWindow.close();
        return true;
    }
    catch (e) {
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
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 40px; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h2 { color: #d32f2f; margin-top: 0; }
    .details { background: #f9f9f9; padding: 15px; border-radius: 4px; margin-top: 20px; font-size: 14px; word-break: break-all; }
    .log-path { background: #fff3e0; padding: 10px 15px; border-radius: 4px; margin-top: 10px; font-size: 13px; word-break: break-all; font-family: monospace; }
    .btn { background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; margin-right: 10px; }
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
    body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 40px; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h2 { color: #d32f2f; margin-top: 0; }
    .details { background: #f9f9f9; padding: 15px; border-radius: 4px; margin-top: 20px; font-size: 14px; word-break: break-all; }
    .log-path { background: #fff3e0; padding: 10px 15px; border-radius: 4px; margin-top: 10px; font-size: 13px; word-break: break-all; font-family: monospace; }
    .btn { background: #1976d2; color: white; padding: 12px 24px; border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; margin-right: 10px; }
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
function startLocalServer() {
    if (!electron_1.app.isPackaged) {
        console.log('[Server] Dev mode - skipping local server start');
        return;
    }
    const userDataDir = electron_1.app.getPath('userData');
    const dbDir = path_1.default.join(userDataDir, 'data');
    const userDbPath = path_1.default.join(dbDir, 'dev.db');
    // 打包资源路径（asarUnpack 后的位置）
    // app.asar.unpacked 相对于 resourcesPath
    const resourcesPath = process.resourcesPath;
    const seedTemplatePath = path_1.default.join(resourcesPath, 'app.asar.unpacked', 'server', 'prisma', 'seed.db');
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
    // 服务器可执行文件路径
    const serverPath = path_1.default.join(electron_1.app.getAppPath(), 'server', 'dist', 'index.js');
    main_1.default.log('[Server] Server path:', serverPath);
    main_1.default.log('[Server] Database path:', userDbPath);
    main_1.default.log('[Server] Starting local API server...');
    // fork Express 服务器
    // 注意：不传 execPath - Electron 主进程本身就是 Node.js，fork() 会复用当前运行时
    serverProcess = (0, child_process_1.fork)(serverPath, [], {
        env: {
            ...process.env,
            NODE_ENV: 'production',
            PORT: '7072',
            // 覆盖数据库路径为用户可写目录
            DATABASE_URL: `file:${userDbPath}`
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
    const { width, height } = electron_1.screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new electron_1.BrowserWindow({
        width: Math.floor(width * 0.6),
        height,
        x: 0,
        y: 0,
        fullscreen: false,
        resizable: true,
        webPreferences: {
            preload: getResourcePath('dist-electron/electron/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
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
            width: 600,
            height: 400,
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
pre{background:#2d2d2d;padding:10px;border-radius:5px;overflow-x:auto}
.key{color:#9cdcfe}
.status-ok{color:#4ec9b0}
.status-error{color:#f44747}
h3{margin-top:16px;color:#569cd6}
.log-section{max-height:200px;overflow-y:scroll;background:#1e1e1e;border:1px solid #333;border-radius:5px}
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
 */
function createCustomerWindow() {
    const displays = electron_1.screen.getAllDisplays();
    const externalDisplay = displays.find(d => d.bounds.x !== 0 || d.bounds.y !== 0);
    const targetDisplay = externalDisplay || displays[0];
    const { width, height } = targetDisplay.bounds;
    customerWindow = new electron_1.BrowserWindow({
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
    });
    // 加载副屏界面
    if (isDev) {
        customerWindow.loadURL('http://localhost:6063/customer-display');
    }
    else {
        customerWindow.loadFile(getResourcePath('dist/index.html'), {
            hash: '/customer-display'
        }).catch((err) => {
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
// 应用启动
electron_1.app.whenReady().then(() => {
    console.log('[Electron] App ready, starting up...');
    // 注册全局快捷键：Ctrl+Shift+D 打开诊断页
    electron_1.globalShortcut.register('CommandOrControl+Shift+D', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.executeJavaScript(`window.location.hash = '#/diagnostics'`);
        }
    });
    // 先启动本地服务器（仅打包模式）
    startLocalServer();
    // 等待服务器启动后再创建窗口
    // 开发模式不需要启动服务器（vite dev server 已运行）
    const serverStartupDelay = electron_1.app.isPackaged ? 2000 : 0;
    setTimeout(() => {
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
            // 延迟 10 秒后检查更新，不阻塞启动
            setTimeout(() => {
                (0, updater_1.checkForUpdatesOnStart)();
            }, 10000);
        }
    }, serverStartupDelay);
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
