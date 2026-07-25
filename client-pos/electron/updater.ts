import { BrowserWindow, ipcMain, app } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoUpdater } = require('electron-updater')

let mainWindow: BrowserWindow | null = null

// Log helper
function log(level: 'info' | 'warn' | 'error', message: string, ...args: any[]) {
  const prefix = '[Updater]'
  if (level === 'info') console.log(prefix, message, ...args)
  else if (level === 'warn') console.warn(prefix, message, ...args)
  else console.error(prefix, message, ...args)
}

log('info', 'Auto-updater initialized')

/**
 * Initialize updater with main window reference
 */
export function setupUpdater(window: BrowserWindow) {
  mainWindow = window

  // Configure auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Set up event listeners
  autoUpdater.on('checking-for-update', () => {
    log('info', 'Checking for update...')
    sendToRenderer('update-status', 'checking')
  })

  autoUpdater.on('update-available', (info: any) => {
    log('info', 'Update available:', info.version)
    sendToRenderer('update-status', 'available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', (info: any) => {
    log('info', 'Update not available, current version:', info.version)
    sendToRenderer('update-status', 'up-to-date', { version: info.version })
  })

  autoUpdater.on('download-progress', (progressObj: any) => {
    log('info', 'Download progress:', progressObj.percent.toFixed(2) + '%')
    sendToRenderer('update-progress', {
      percent: progressObj.percent,
      bytesPerSecond: progressObj.bytesPerSecond,
      total: progressObj.total,
      transferred: progressObj.transferred
    })
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    log('info', 'Update downloaded:', info.version)
    sendToRenderer('update-status', 'downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: any) => {
    log('error', 'Error:', err.message)
    sendToRenderer('update-error', err.message)
  })

  setupIpcHandlers()
}

/**
 * Send message to renderer process
 */
function sendToRenderer(channel: string, ...args: any[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

/**
 * Set up IPC handlers for update operations
 */
function setupIpcHandlers() {
  // Check for updates via API
  ipcMain.handle('check-for-updates', async () => {
    try {
      sendToRenderer('update-status', 'checking')

      const currentVersion = app.getVersion()
      log('info', 'Current version:', currentVersion)

      // Use electron-updater to check GitHub for updates
      try {
        await autoUpdater.checkForUpdates()
      } catch (error: any) {
        log('warn', 'Check for updates failed:', error.message)
        // Don't send 'up-to-date' here - the 'error' event already sends update-error
        // Sending 'up-to-date' would override the error status in the UI
      }

      return { current: currentVersion, latest: currentVersion }
    } catch (error: any) {
      log('error', 'Check failed:', error.message)
      // Don't send 'up-to-date' - let the error event handle it
      return null
    }
  })

  // Download update
  ipcMain.handle('download-update', async () => {
    try {
      log('info', 'Starting download...')
      sendToRenderer('update-status', 'downloading')
      sendToRenderer('update-progress', { percent: 0 })

      await autoUpdater.downloadUpdate()

      return true
    } catch (error: any) {
      log('error', 'Download failed:', error.message)
      sendToRenderer('update-error', error.message)
      return false
    }
  })

  // Install update and restart
  ipcMain.handle('install-update', () => {
    log('info', 'Installing update and restarting...')
    autoUpdater.quitAndInstall(false, true)
  })

  // Get current version
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })
}

/**
 * Check for updates automatically (call on app start in packaged mode)
 */
export function checkForUpdatesOnStart() {
  if (!app.isPackaged) {
    log('info', 'Skipping auto-check in development mode')
    return
  }

  log('info', 'Checking for updates on startup...')

  // Delay initial check by 5 seconds to let app fully start
  setTimeout(() => {
    sendToRenderer('update-status', 'checking')
    autoUpdater.checkForUpdates().catch((err: any) => {
      log('warn', 'Initial check failed:', err.message)
    })
  }, 5000)
}

export default autoUpdater