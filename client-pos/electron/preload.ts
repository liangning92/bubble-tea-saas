import { contextBridge, ipcRenderer } from 'electron'

/**
 * 预加载脚本 - 安全地暴露 IPC 到渲染进程
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 发送订单更新到副屏
  sendOrderUpdate: (orderData: any) => {
    ipcRenderer.send('order-update', orderData)
  },

  // 清空副屏
  sendOrderClear: () => {
    ipcRenderer.send('order-clear')
  },

  // 发送订单完成到副屏
  sendOrderComplete: (orderNumber: string) => {
    ipcRenderer.send('order-complete', orderNumber)
  },

  // 监听来自主屏的订单更新
  onOrderUpdate: (callback: (orderData: any) => void) => {
    ipcRenderer.on('order-update', (_event, data) => callback(data))
  },

  // 监听清空命令
  onOrderClear: (callback: () => void) => {
    ipcRenderer.on('order-clear', () => callback())
  },

  // 监听订单完成
  onOrderComplete: (callback: (orderNumber: string) => void) => {
    ipcRenderer.on('order-complete', (_event, data) => callback(data))
  },

  // 打印小票
  sendPrintReceipt: (data: any) => {
    return ipcRenderer.invoke('print-receipt', data)
  },

  // 打开钱箱
  openCashDrawer: (data?: any) => {
    return ipcRenderer.invoke('open-cash-drawer', data || {})
  },

  // 列出打印机
  listPrinters: () => {
    return ipcRenderer.invoke('list-printers')
  },

  // 发送厨房小票
  sendKitchenOrder: (data: any) => {
    return ipcRenderer.invoke('send-kitchen-order', data)
  },

  // 发送付款二维码到副屏
  sendPaymentQr: (qrData: any) => {
    ipcRenderer.send('payment-qr', qrData)
  },

  // 监听付款二维码 (副屏端)
  onPaymentQr: (callback: (qrData: any) => void) => {
    ipcRenderer.on('payment-qr', (_event, data) => callback(data))
  },

  // 打印交接班对账小票 (Z-Report)
  sendPrintShiftReport: (data: any) => {
    return ipcRenderer.invoke('print-shift-report', data)
  },

  // 打印茶饮杯贴/不干胶标签 (TSPL)
  sendCupStickers: (data: any) => {
    return ipcRenderer.invoke('print-cup-stickers', data)
  },

  // ========== 自动更新相关 ==========

  // 检查更新
  checkForUpdates: () => {
    return ipcRenderer.invoke('check-for-updates')
  },

  // 下载更新
  downloadUpdate: () => {
    return ipcRenderer.invoke('download-update')
  },

  // 安装更新并重启
  installUpdate: () => {
    return ipcRenderer.invoke('install-update')
  },

  // 获取应用版本
  getAppVersion: () => {
    return ipcRenderer.invoke('get-app-version')
  },

  getLogEntries: () => {
    return ipcRenderer.invoke('get-log-entries')
  },

  // 监听更新状态变化
  onUpdateStatus: (callback: (status: string, info?: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any, info: any) => callback(status, info)
    ipcRenderer.on('update-status', listener)
    return () => ipcRenderer.removeListener('update-status', listener)
  },

  // 监听更新进度
  onUpdateProgress: (callback: (progress: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress)
    ipcRenderer.on('update-progress', listener)
    return () => ipcRenderer.removeListener('update-progress', listener)
  },

  // 监听更新错误
  onUpdateError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: any) => callback(error)
    ipcRenderer.on('update-error', listener)
    return () => ipcRenderer.removeListener('update-error', listener)
  },

  // ========== API URL 配置 ==========

  // 获取 API URL（供主进程/升级使用）
  getApiUrl: () => {
    return ipcRenderer.invoke('get-api-url')
  },

  // 保存 API URL（持久化）
  setApiUrl: (url: string) => {
    return ipcRenderer.invoke('set-api-url', url)
  },

  // ========== 窗口控制 (最小化、最大化/还原、关闭) ==========
  minimizeWindow: () => {
    return ipcRenderer.invoke('window-minimize')
  },
  maximizeWindow: () => {
    return ipcRenderer.invoke('window-maximize')
  },
  closeWindow: () => {
    return ipcRenderer.invoke('window-close')
  },
  isMaximized: () => {
    return ipcRenderer.invoke('window-is-maximized')
  }
})