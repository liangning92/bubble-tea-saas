import { BrowserWindow, ipcMain, app } from 'electron'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoUpdater } = require('electron-updater')

let mainWindow: BrowserWindow | null = null
let checkInFlight = false
let downloadInProgress = false
let updateDownloaded = false
let updateTimer: ReturnType<typeof setInterval> | null = null

async function checkForUpdates() {
  if (!app.isPackaged || checkInFlight || downloadInProgress || updateDownloaded) return
  checkInFlight = true
  try {
    return await autoUpdater.checkForUpdates()
  } finally {
    checkInFlight = false
  }
}

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
  autoUpdater.autoInstallOnAppQuit = false

  // Tell electron-updater where to find updates (GitHub Releases)
  // Read from env vars (set in electron-builder extraMetadata or CI environment)
  const owner = process.env.UPDATER_OWNER || 'liangning92'
  const repo = process.env.UPDATER_REPO || 'bubble-tea-saas'
  autoUpdater.setFeedURL({
    provider: 'github',
    owner,
    repo
  })

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
    downloadInProgress = false
    updateDownloaded = true
    log('info', 'Update downloaded:', info.version)
    sendToRenderer('update-status', 'downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err: any) => {
    downloadInProgress = false
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
        await checkForUpdates()
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
      downloadInProgress = true
      log('info', 'Starting download...')
      sendToRenderer('update-status', 'downloading')
      sendToRenderer('update-progress', { percent: 0 })

      await autoUpdater.downloadUpdate()

      return true
    } catch (error: any) {
      downloadInProgress = false
      log('error', 'Download failed:', error.message)
      sendToRenderer('update-error', error.message)
      return false
    }
  })

  // Install update and restart
  ipcMain.handle('install-update', () => {
    // No real legacy database compatibility/migration clearance has been granted.
    // Refuse BEFORE quitting the currently usable POS, even after downloading.
    const message = 'Upgrade clearance required; your current POS stays open. / 请等待升级确认，当前收银程序将保持运行。 / Tunggu persetujuan peningkatan; POS saat ini tetap berjalan.'
    log('warn', 'Installation blocked pending legacy database clearance')
    sendToRenderer('update-error', message)
    return false
  })

}

/**
 * Check for updates automatically (call on app start in packaged mode)
 */
export function checkForUpdatesOnStart() {
  if (!app.isPackaged || updateTimer) return

  const check = () => {
    void checkForUpdates().catch((err: any) => {
      log('warn', 'Automatic update check failed:', err.message)
    })
  }
  const initialTimer = setTimeout(check, 5000)
  updateTimer = setInterval(check, 15 * 60 * 1000)
  app.once('before-quit', () => {
    clearTimeout(initialTimer)
    if (updateTimer) clearInterval(updateTimer)
    updateTimer = null
  })
}

export default autoUpdater
