/**
 * Electron API 类型声明
 */

interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

interface UpdateInfo {
  version: string
  releaseDate: string
  releaseNotes?: string
}

type UpdateStatus = 'checking' | 'available' | 'up-to-date' | 'downloading' | 'downloaded' | 'error'

interface ElectronAPI {
  sendOrderUpdate: (orderData: any) => void
  sendOrderClear: () => void
  sendOrderComplete: (orderNumber: string) => void
  openCashDrawer: (data?: any) => void  // 打开钱箱
  sendPrintReceipt: (data: any, callback?: (result: any) => void) => void  // 打印小票
  onOrderUpdate: (callback: (orderData: any) => void) => void
  onOrderClear: (callback: () => void) => void
  onOrderComplete: (callback: (orderNumber: string) => void) => void

  // 自动更新
  checkForUpdates: () => Promise<any>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => Promise<void>
  getAppVersion: () => Promise<string>
  onUpdateStatus: (callback: (status: UpdateStatus, info?: UpdateInfo) => void) => void
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => void
  onUpdateError: (callback: (error: string) => void) => void

  // API URL 配置（供主进程/升级使用）
  getApiUrl: () => Promise<string>
  setApiUrl: (url: string) => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}