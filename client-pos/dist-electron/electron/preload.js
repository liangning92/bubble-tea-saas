"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * 预加载脚本 - 安全地暴露 IPC 到渲染进程
 */
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // 发送订单更新到副屏
    sendOrderUpdate: (orderData) => {
        electron_1.ipcRenderer.send('order-update', orderData);
    },
    // 清空副屏
    sendOrderClear: () => {
        electron_1.ipcRenderer.send('order-clear');
    },
    // 发送订单完成到副屏
    sendOrderComplete: (orderNumber) => {
        electron_1.ipcRenderer.send('order-complete', orderNumber);
    },
    // 监听来自主屏的订单更新
    onOrderUpdate: (callback) => {
        electron_1.ipcRenderer.on('order-update', (_event, data) => callback(data));
    },
    // 监听清空命令
    onOrderClear: (callback) => {
        electron_1.ipcRenderer.on('order-clear', () => callback());
    },
    // 监听订单完成
    onOrderComplete: (callback) => {
        electron_1.ipcRenderer.on('order-complete', (_event, data) => callback(data));
    },
    // 打印小票
    sendPrintReceipt: (data) => {
        return electron_1.ipcRenderer.invoke('print-receipt', data);
    },
    // 打开钱箱
    openCashDrawer: (data) => {
        return electron_1.ipcRenderer.invoke('open-cash-drawer', data || {});
    },
    // 列出打印机
    listPrinters: () => {
        return electron_1.ipcRenderer.invoke('list-printers');
    },
    // ========== 自动更新相关 ==========
    // 检查更新
    checkForUpdates: () => {
        return electron_1.ipcRenderer.invoke('check-for-updates');
    },
    // 下载更新
    downloadUpdate: () => {
        return electron_1.ipcRenderer.invoke('download-update');
    },
    // 安装更新并重启
    installUpdate: () => {
        return electron_1.ipcRenderer.invoke('install-update');
    },
    // 获取应用版本
    getAppVersion: () => {
        return electron_1.ipcRenderer.invoke('get-app-version');
    },
    // 监听更新状态变化
    onUpdateStatus: (callback) => {
        electron_1.ipcRenderer.on('update-status', (_event, status, info) => callback(status, info));
    },
    // 监听更新进度
    onUpdateProgress: (callback) => {
        electron_1.ipcRenderer.on('update-progress', (_event, progress) => callback(progress));
    },
    // 监听更新错误
    onUpdateError: (callback) => {
        electron_1.ipcRenderer.on('update-error', (_event, error) => callback(error));
    },
    // ========== API URL 配置 ==========
    // 获取 API URL（供主进程/升级使用）
    getApiUrl: () => {
        return electron_1.ipcRenderer.invoke('get-api-url');
    },
    // 保存 API URL（持久化）
    setApiUrl: (url) => {
        return electron_1.ipcRenderer.invoke('set-api-url', url);
    }
});
