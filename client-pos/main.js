import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupUpdater, checkForUpdatesOnStart } from './updater.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 窗口引用
let mainWindow = null;
let customerWindow = null;
// 开发模式检测
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged;
/**
 * 创建主窗口（收银界面）
 */
function createMainWindow() {
    // 双屏兼容：显式找最左边的屏幕作为主屏（点单系统）
    const allDisplays = screen.getAllDisplays();
    const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
        current.bounds.x < leftmost.bounds.x ? current : leftmost
    );
    const { width, height, x: screenX, y: screenY } = leftmostDisplay.workArea;

    mainWindow = new BrowserWindow({
        width: Math.floor(width * 0.6), // 主屏占60%
        height,
        x: screenX,
        y: screenY,
        fullscreen: false, // Windows触屏机可全屏
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
        //关闭主窗口时也关闭副屏
        if (customerWindow) {
            customerWindow.close();
        }
    });
    console.log('[Electron] Main window created');
}
/**
 * 创建副屏窗口（顾客展示）
 */
function createCustomerWindow() {
    const allDisplays = screen.getAllDisplays();

    // 找最左边的屏幕（主窗口所在屏）
    const leftmostDisplay = allDisplays.reduce((leftmost, current) =>
        current.bounds.x < leftmost.bounds.x ? current : leftmost
    );

    // 副屏：用最右边的屏幕（通常是外接的顾客展示屏）
    const rightmostDisplay = allDisplays.reduce((rightmost, current) =>
        current.bounds.x > rightmost.bounds.x ? current : rightmost
    );

    const targetDisplay = (rightmostDisplay.bounds.x !== leftmostDisplay.bounds.x ||
        rightmostDisplay.bounds.y !== leftmostDisplay.bounds.y)
        ? rightmostDisplay
        : (allDisplays.find(d => d !== leftmostDisplay) || allDisplays[0]);

    const { width, height, x: screenX, y: screenY } = targetDisplay.workArea;

    customerWindow = new BrowserWindow({
        width,
        height,
        x: screenX,
        y: screenY,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
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
        customerWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
            hash: '/customer-display'
        });
    }
    customerWindow.on('closed', () => {
        customerWindow = null;
    });
    console.log('[Electron] Customer window created');
}
/**
 * IPC 通信 - 订单状态同步到副屏
 */
ipcMain.on('order-update', (_event, orderData) => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-update', orderData);
    }
});
/**
 * IPC 通信 - 清空副屏显示
 */
ipcMain.on('order-clear', () => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-clear');
    }
});
/**
 * IPC 通信 - 显示感谢语
 */
ipcMain.on('order-complete', (_event, orderNumber) => {
    if (customerWindow && !customerWindow.isDestroyed()) {
        customerWindow.webContents.send('order-complete', orderNumber);
    }
});
/**
 * 打印小票
 * ESC/POS 协议 (58mm热敏打印机, 32字符宽)
 */
ipcMain.on('print-receipt', (_event, data) => {
    try {
        const text = generateReceiptText(data);
        console.log('[PRINT]', text);
        // 实际部署时发送到打印机
        // 这里先输出到控制台，方便调试
        // 真实打印机需要配置IP和端口
        const printerHost = process.env.PRINTER_HOST || '192.168.1.100';
        const printerPort = parseInt(process.env.PRINTER_PORT || '9100');
        // 示例：通过网络打印机打印
        // const net = require('net')
        // const client = new net.Socket()
        // client.connect(printerPort, printerHost, () => {
        //   client.write(Buffer.from(text, 'latin1'))
        //   client.end()
        // })
    }
    catch (error) {
        console.error('[PRINT ERROR]', error);
    }
});
/**
 * 生成小票文本 (58mm打印机, 32字符宽)
 */
function generateReceiptText(data) {
    const lines = [];
    const width = 32; // 58mm打印机32字符
    // 头部
    if (data.header) {
        lines.push(centerText(data.header, width));
        lines.push(repeatChar('=', width));
    }
    // 订单信息
    lines.push(`No   : ${data.orderNum || ''}`);
    lines.push(`Tgl   : ${formatDateTime()}`);
    lines.push(repeatChar('-', width));
    // 表头
    lines.push('ITEM              QTY     HARGA');
    lines.push(repeatChar('-', width));
    // 商品明细
    if (data.items && data.items.length > 0) {
        data.items.forEach((item) => {
            const name = truncate(`${item.productName} ${item.specName}`, 16).padEnd(16);
            const qty = String(item.quantity).padStart(3);
            const price = formatRp(item.unitPrice * item.quantity).padStart(10);
            lines.push(`${name}${qty}${price}`);
            // 加料
            if (item.addons && item.addons.length > 0) {
                item.addons.forEach((addon) => {
                    lines.push(`  + ${truncate(addon.name, 20)}`);
                });
            }
            // 甜度冰度
            if (item.sugarLevelName || item.iceLevelName) {
                const mods = [item.sugarLevelName, item.iceLevelName].filter(Boolean).join(', ');
                lines.push(`  [${mods}]`);
            }
        });
    }
    lines.push(repeatChar('-', width));
    // 合计
    lines.push(`${'Subtotal:'.padEnd(20)}${formatRp(data.subtotal || 0).padStart(10)}`);
    lines.push(`${'Pajak:'.padEnd(20)}${formatRp(data.tax || 0).padStart(10)}`);
    if (data.discount && data.discount > 0) {
        lines.push(`${'Diskon:'.padEnd(20)}-${formatRp(data.discount).padStart(10)}`);
    }
    lines.push(repeatChar('-', width));
    lines.push(`${'TOTAL:'.padEnd(20)}${formatRp(data.total || 0).padStart(10)}`);
    // 支付信息
    lines.push(repeatChar('-', width));
    lines.push(`${'Metode:'.padEnd(20)}${(data.paymentMethod || 'Cash').padStart(10)}`);
    if (data.paidAmount) {
        lines.push(`${'Bayar:'.padEnd(20)}${formatRp(data.paidAmount).padStart(10)}`);
        lines.push(`${'Kembalian:'.padEnd(20)}${formatRp(data.change || 0).padStart(10)}`);
    }
    // 会员信息
    if (data.memberName) {
        lines.push(repeatChar('-', width));
        lines.push(`Member: ${data.memberName}`);
        if (data.pointsRedeemed && data.pointsRedeemed > 0) {
            lines.push(`Points: -${data.pointsRedeemed}`);
        }
    }
    // 底部
    lines.push('');
    if (data.footer) {
        lines.push(centerText(data.footer, width));
    }
    lines.push(centerText('=== TERIMA KASIH ===', width));
    // 走纸
    return lines.join('\n') + '\n\n\n\n\n';
}
/** 居中对齐 */
function centerText(text, width) {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
}
/** 重复字符 */
function repeatChar(char, count) {
    return char.repeat(count);
}
/** 截断字符串 */
function truncate(str, len) {
    return str.length > len ? str.slice(0, len) : str;
}
/** 格式化金额 */
function formatRp(amount) {
    return 'Rp ' + amount.toLocaleString('id-ID');
}
/** 格式化日期时间 */
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
app.whenReady().then(() => {
    createMainWindow();
    createCustomerWindow();
    // Set up auto-updater after windows are created
    if (mainWindow) {
        setupUpdater(mainWindow);
        checkForUpdatesOnStart();
    }
});
// macOS 特殊处理
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        createCustomerWindow();
    }
});
