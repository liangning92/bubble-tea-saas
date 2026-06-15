"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const updater_1 = require("./updater");
// 禁用硬件加速 - 防止某些电脑白屏
electron_1.app.disableHardwareAcceleration();
// 添加 Chromium 启动参数，解决触屏/显卡问题
electron_1.app.commandLine.appendSwitch('disable-gpu');
electron_1.app.commandLine.appendSwitch('disable-software-rasterizer');
electron_1.app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
electron_1.app.commandLine.appendSwitch('no-sandbox');
electron_1.app.commandLine.appendSwitch('disable-dev-shm-usage');
electron_1.app.commandLine.appendSwitch('disable-gpu-compositing');
// 窗口引用
let mainWindow = null;
let customerWindow = null;
// 开发模式检测
const isDev = process.env.NODE_ENV !== 'production' && !electron_1.app.isPackaged;
/**
 * 获取资源文件路径（兼容打包和开发模式）
 * 使用 __dirname 作为基准，因为它总是指向当前执行文件所在的目录
 */
function getResourcePath(relativePath) {
    // __dirname 在打包后指向 dist-electron/electron
    // 所以向上两级到达 app 根目录
    if (electron_1.app.isPackaged) {
        // asar: false 时，结构是 resources/app/dist-electron/electron/
        // __dirname = resources/app/dist-electron/electron
        // 向上两级 = resources/app/
        return path_1.default.join(__dirname, '..', '..', relativePath);
    }
    else {
        // 开发模式：__dirname = 项目根目录/dist-electron/electron
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
        webPreferences: {
            preload: getResourcePath('dist-electron/electron/preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        title: 'Bubble Tea POS'
    });
    // 加载主界面
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
        console.log('[Electron] Index exists:', fs.existsSync(indexPath));
        console.log('[Electron] Preload exists:', fs.existsSync(preloadPath));
        // 创建诊断窗口显示加载状态
        mainWindow.loadFile(indexPath).catch((err) => {
            console.error('[Electron] Failed to load index:', err);
            // 显示错误对话框
            const { dialog } = require('electron');
            dialog.showErrorBox('Load Error', 'Failed to load index.html: ' + err.message);
        });
        // 监听加载失败
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('[Electron] Failed to load:', errorCode, errorDescription);
            mainWindow?.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="padding:20px;font-family:Arial;background:#333;color:#fff;min-height:100vh;margin:0;display:flex;flex-direction:column;justify-content:center;align-items:center;"><h2 style="color:#ff6b6b;">加载失败</h2><p>错误码: ${errorCode}</p><p>${errorDescription}</p><p style="margin-top:20px;">Index: ${indexPath}</p></div>'
      `);
        });
        // 监听渲染进程崩溃
        mainWindow.webContents.on('crashed', () => {
            console.error('[Electron] Renderer process crashed');
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
electron_1.ipcMain.on('print-receipt', async (_event, data) => {
    try {
        const text = generateReceiptText(data);
        console.log('[PRINT] Preparing to print receipt');
        // Windows 原生打印（使用 PowerShell，不需要网络或驱动）
        if (process.platform === 'win32') {
            try {
                await printViaWindows(text, data.printerName);
                console.log('[PRINT] Windows native print successful');
                return;
            }
            catch (winError) {
                console.log('[PRINT] Windows native print failed:', winError.message);
            }
        }
        // 网络打印作为备选
        const printerHost = data.printerHost || process.env.PRINTER_HOST || '192.168.1.100';
        const printerPort = data.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
        printViaNetwork(text, printerHost, printerPort);
    }
    catch (error) {
        console.error('[PRINT ERROR]', error);
    }
});
/**
 * Windows 原生打印（使用 PowerShell Out-Printer）
 * 不需要网络，不需要驱动，只需要打印机在 Windows 中已添加
 */
async function printViaWindows(text, printerName) {
    const { exec } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    return new Promise((resolve, reject) => {
        const tempFile = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`);
        // 使用 latin1 编码（ESC/POS 打印机常用）
        fs.writeFileSync(tempFile, text, { encoding: 'latin1' });
        let psCommand;
        if (printerName) {
            // 发送到指定打印机
            psCommand = `Out-Printer -Name "${printerName}" -FilePath "${tempFile}"`;
        }
        else {
            // 使用默认打印机
            psCommand = `Get-Content "${tempFile}" | Out-Printer`;
        }
        exec(`powershell -Command "${psCommand}"`, (error) => {
            try {
                fs.unlinkSync(tempFile);
            }
            catch (e) {
                // 忽略删除错误
            }
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
/**
 * 网络打印
 */
function printViaNetwork(text, host, port) {
    const net = require('net');
    const client = new net.Socket();
    client.connect(port, host, () => {
        client.write(Buffer.from(text, 'latin1'));
        client.end();
        console.log('[PRINT] Network print sent to', host + ':' + port);
    });
    client.on('error', (err) => {
        console.error('[PRINT ERROR]', err.message);
    });
}
/**
 * 打开钱箱 - Windows原生 或 网络
 * 钱箱通常连接到打印机，命令发送到打印机
 */
electron_1.ipcMain.on('open-cash-drawer', async (_event, data) => {
    try {
        console.log('[CASH DRAWER] Opening drawer');
        // Windows 原生打印钱箱命令
        if (process.platform === 'win32') {
            try {
                await openCashDrawerViaWindows(data.printerName);
                console.log('[CASH DRAWER] Windows native drawer opened');
                return;
            }
            catch (winError) {
                console.log('[CASH DRAWER] Windows native failed:', winError.message);
            }
        }
        // 网络作为备选
        const printerHost = data?.printerHost || process.env.PRINTER_HOST || '192.168.1.100';
        const printerPort = data?.printerPort || parseInt(process.env.PRINTER_PORT || '9100');
        openCashDrawerViaNetwork(printerHost, printerPort);
    }
    catch (error) {
        console.error('[CASH DRAWER ERROR]', error);
    }
});
/**
 * Windows 原生打开钱箱
 */
async function openCashDrawerViaWindows(printerName) {
    const { exec } = require('child_process');
    const os = require('os');
    return new Promise((resolve, reject) => {
        // ESC/POS 钱箱弹出命令: ESC p 0 50 50
        // m=0(钱箱1), t1=50(100ms脉冲), t2=50(100ms间隔)
        const cashDrawerCmd = Buffer.from([0x1B, 0x70, 0x00, 0x32, 0x32]);
        const tempFile = path_1.default.join(os.tmpdir(), `drawer_${Date.now()}.bin`);
        require('fs').writeFileSync(tempFile, cashDrawerCmd);
        // 使用默认打印机或指定打印机
        let psCommand;
        if (printerName) {
            psCommand = `Out-Printer -Name "${printerName}" -FilePath "${tempFile}"`;
        }
        else {
            psCommand = `Get-Content "${tempFile}" | Out-Printer`;
        }
        exec(`powershell -Command "${psCommand}"`, (error) => {
            try {
                require('fs').unlinkSync(tempFile);
            }
            catch (e) { }
            if (error) {
                reject(error);
                return;
            }
            resolve();
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
    const client = new net.Socket();
    client.connect(port, host, () => {
        client.write(cashDrawerCommand);
        client.end();
        console.log('[CASH DRAWER] Network drawer command sent to', host + ':' + port);
    });
    client.on('error', (err) => {
        console.error('[CASH DRAWER ERROR]', err.message);
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
    console.log('[Electron] App ready, creating windows...');
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
});
electron_1.app.on('window-all-closed', () => {
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
