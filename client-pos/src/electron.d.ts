export {}

declare global {
  interface Window {
    electronAPI?: {
      // Hardware - USB printer (printerName = Windows printer name)
      sendPrintReceipt: (data: PrintReceiptData) => Promise<{ success: boolean; error?: string }>
      sendKitchenOrder: (data: PrintKitchenData) => Promise<{ success: boolean; error?: string }>
      openCashDrawer: (data?: { printerName?: string }) => Promise<{ success: boolean; error?: string }>
      listPrinters: () => Promise<{ printers: string[] }>

      // Config
      setApiUrl: (url: string) => Promise<{ success: boolean; error?: string }>
      getApiUrl: () => Promise<{ url: string }>

      // Updates
      checkForUpdates: () => Promise<{ updateAvailable: boolean }>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>

      // Event listeners
      onUpdateStatus: (callback: (status: string, info?: any) => void) => void
      onUpdateProgress: (callback: (progress: number) => void) => void
      onUpdateError: (callback: (error: string) => void) => void

      // App info
      getAppVersion: () => Promise<string>
      platform: string
    }
  }

  interface PrintReceiptData {
    orderNum: string
    header: string
    footer: string
    printerName: string   // Windows printer name, e.g. "XPrinter" (USB)
    printerHost?: string  // Network printer IP, e.g. "192.168.1.100"
    printerPort?: number  // Network printer port, e.g. 9100
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

  interface PrintKitchenData {
    orderNum: string
    printerName: string
    printerHost?: string  // Network printer IP
    printerPort?: number  // Network printer port
    items: Array<{
      productName: string
      specName: string
      quantity: number
      sugarLevelName?: string
      iceLevelName?: string
      addons?: Array<{ name: string; price: number }>
      note?: string
    }>
  }
}
