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
    ipcRenderer.send('print-receipt', data)
  },

  // 打开钱箱
  openCashDrawer: (data?: any) => {
    ipcRenderer.send('open-cash-drawer', data || {})
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

  // 监听更新状态变化
  onUpdateStatus: (callback: (status: string, info?: any) => void) => {
    ipcRenderer.on('update-status', (_event, status, info) => callback(status, info))
  },

  // 监听更新进度
  onUpdateProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update-progress', (_event, progress) => callback(progress))
  },

  // 监听更新错误
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error))
  },

  // ========== API URL 配置 ==========

  // 获取 API URL（供主进程/升级使用）
  getApiUrl: () => {
    return ipcRenderer.invoke('get-api-url')
  },

  // 保存 API URL（持久化）
  setApiUrl: (url: string) => {
    return ipcRenderer.invoke('set-api-url', url)
  }
})