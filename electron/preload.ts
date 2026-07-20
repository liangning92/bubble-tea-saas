import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Hardware
  sendPrintReceipt: (data: any) => ipcRenderer.invoke('print-receipt', data),
  sendKitchenOrder: (data: any) => ipcRenderer.invoke('print-kitchen', data),
  openCashDrawer: (data?: { printerHost?: string; printerPort?: number }) =>
    ipcRenderer.invoke('open-cash-drawer', data || {}),
  listPrinters: () => ipcRenderer.invoke('list-printers'),

  // Config
  setApiUrl: (url: string) => ipcRenderer.invoke('set-api-url', url),
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Event listeners for updates
  onUpdateStatus: (callback: (status: string, info?: any) => void) => {
    ipcRenderer.on('update-status', (_e, status, info) => callback(status, info))
  },
  onUpdateProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('update-progress', (_e, progress) => callback(progress))
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_e, error) => callback(error))
  },

  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Platform info
  platform: process.platform
})
