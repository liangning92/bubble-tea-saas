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

interface PrinterListResult {
  printers: string[]
}

interface CashDrawerResult {
  success: boolean
  error?: string
}

interface PrintReceiptData {
  orderNum: string
  header: string
  footer: string
  printerName?: string
  items: Array<{
    productName: string
    specName: string
    quantity: number
    unitPrice: number
    addons: Array<{ name: string; price: number }>
  }>
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  cashierName?: string
  orderDate?: string
  customerName?: string
  paymentReceived?: number
  change?: number
}

interface PrintResult {
  success: boolean
  error?: string
}

interface ElectronAPI {
  // Hardware
  sendPrintReceipt: (data: PrintReceiptData) => Promise<PrintResult>
  sendKitchenOrder: (data: any) => Promise<PrintResult>
  openCashDrawer: (data?: { printerName?: string }) => Promise<CashDrawerResult>
  listPrinters: () => Promise<PrinterListResult>

  // Config
  setApiUrl: (url: string) => Promise<{ success: boolean }>
  getApiUrl: () => Promise<{ url: string }>

  // Updates
  checkForUpdates: () => Promise<{ updateAvailable: boolean }>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  getAppVersion: () => Promise<string>

  // Event listeners for updates
  onUpdateStatus: (callback: (status: string, info?: any) => void) => void
  onUpdateProgress: (callback: (progress: number) => void) => void
  onUpdateError: (callback: (error: string) => void) => void

  // Platform info
  platform: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
