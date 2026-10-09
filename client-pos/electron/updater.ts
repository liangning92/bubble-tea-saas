import { BrowserWindow, ipcMain, app, shell } from 'electron'
import {existsSync, createReadStream} from 'fs'
import {mkdir, open, readFile, stat} from 'fs/promises'
import {createHash, randomUUID} from 'crypto'
import {spawn} from 'child_process'
import path from 'path'
import {isNewerUpdate} from '../src/utils/updateVersion'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { autoUpdater } = require('electron-updater')

let mainWindow: BrowserWindow | null = null
let checkInFlight = false
let downloadInProgress = false
let updateDownloaded = false
let downloadedInfo: {version: string; currentVersion: string} | null = null
let updateTimer: ReturnType<typeof setInterval> | null = null
let installerSha512 = ''
let installing = false
let stageInFlight: Promise<void> | null = null
let stageReady = false
let verifiedInstaller: {path:string; size:number; mtimeMs:number} | null = null
let installationHooks: {prepare:()=>Promise<void>;resume:()=>void}

function upgradeHelper() {
  return path.join(process.resourcesPath, 'upgrade-helper', 'btps-db-upgrade.exe')
}

function stagePointer() {
  return path.join(app.getPath('appData'), 'BTPS', 'upgrade-stage.json')
}

function runUpgradeHelper(command: 'stage'|'refresh-stage', installer: string): Promise<void> {
  const helper = upgradeHelper()
  const args = [command, '--old-app', path.dirname(process.execPath), '--installer', installer,
    ...(command === 'stage' ? ['--result', stagePointer()] : ['--staged-pointer', stagePointer()])]
  return new Promise((resolve,reject) => {
    const child = spawn(helper, args, {windowsHide:true, stdio:['ignore','pipe','pipe']})
    let output = ''
    let settled = false
    const timer = setTimeout(() => {child.kill(); finish(Error('UPDATE_BACKGROUND_BACKUP_TIMEOUT'))}, 15 * 60 * 1000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error ? reject(error) : resolve()
    }
    child.stdout.on('data', chunk => {output = (output + String(chunk)).slice(-4096)})
    child.stderr.on('data', chunk => {output = (output + String(chunk)).slice(-4096)})
    child.once('error', finish)
    child.once('exit', code => finish(code === 0 ? undefined : Error(`UPDATE_BACKGROUND_BACKUP_FAILED (${code}): ${output}`)))
  })
}

async function verifyDownloadedInstaller(installer: string): Promise<void> {
  if (!installerSha512) throw Error('UPDATE_INSTALLER_CHECKSUM_MISSING')
  const before = await stat(installer)
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(installer)) hash.update(chunk)
  const after = await stat(installer)
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || hash.digest('base64') !== installerSha512) {
    throw Error('UPDATE_INSTALLER_CHECKSUM_MISMATCH')
  }
  verifiedInstaller = {path:installer,size:after.size,mtimeMs:after.mtimeMs}
}

function stageDownloadedUpdate(installer: string): Promise<void> {
  if (stageInFlight) return stageInFlight
  stageReady = false
  sendToRenderer('update-status', 'preparing', downloadedInfo)
  stageInFlight = verifyDownloadedInstaller(installer).then(() => runUpgradeHelper('stage', installer)).then(() => {
    stageReady = true
    sendToRenderer('update-status', 'downloaded', downloadedInfo)
  }).catch(error => {
    log('error', 'Background upgrade preparation failed:', error.message)
    sendToRenderer('update-error', error.message)
    throw error
  }).finally(() => {stageInFlight = null})
  return stageInFlight
}

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
export function setupUpdater(window: BrowserWindow, hooks: {prepare:()=>Promise<void>;resume:()=>void}) {
  mainWindow = window
  installationHooks = hooks

  // Configure auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true

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
    if (!isNewerUpdate(info.version, app.getVersion())) {
      sendToRenderer('update-status', 'up-to-date', {version: app.getVersion()})
      return
    }
    log('info', 'Update available:', info.version)
    sendToRenderer('update-status', 'available', {
      version: info.version,
      currentVersion: app.getVersion(),
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
    if (!isNewerUpdate(info.version, app.getVersion())) {
      updateDownloaded = false; downloadedInfo = null; installerSha512 = ''
      sendToRenderer('update-status', 'up-to-date', {version: app.getVersion()})
      return
    }
    updateDownloaded = true
    stageReady = false
    verifiedInstaller = null
    installerSha512 = info.files?.find((file:any)=>String(file.url).endsWith('.exe'))?.sha512 || info.sha512 || ''
    downloadedInfo = {version: info.version, currentVersion: app.getVersion()}
    log('info', 'Update downloaded:', info.version)
    const installer = autoUpdater.installerPath
    if (installer && existsSync(upgradeHelper())) {
      void stageDownloadedUpdate(installer).catch(() => {})
    } else {
      // One-time transition from an old build without a bundled background helper.
      sendToRenderer('update-status', 'downloaded', { version: info.version, currentVersion: app.getVersion() })
    }
  })

  autoUpdater.on('error', (err: any) => {
    downloadInProgress = false
    if(installing){installing=false;try{installationHooks.resume()}catch{}}
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
  ipcMain.handle('show-update-installer', () => {
    const installer = autoUpdater.installerPath
    if (!updateDownloaded || !installer || !existsSync(installer)) {
      updateDownloaded = false
      downloadedInfo = null
      return {success: false}
    }
    shell.showItemInFolder(installer)
    return {success: true}
  })
  // Check for updates via API
  ipcMain.handle('check-for-updates', async () => {
    try {
      if (updateDownloaded && downloadedInfo) {
        const installer = autoUpdater.installerPath
        if (installer && existsSync(upgradeHelper()) && !stageReady) void stageDownloadedUpdate(installer).catch(() => {})
        else sendToRenderer('update-status', 'downloaded', downloadedInfo)
        return {current: app.getVersion(), latest: downloadedInfo.version}
      }
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
  ipcMain.handle('install-update', async (_event, snapshot: any) => {
    if (installing) return false
    installing = true
    let prepared = false
    try {
      const installer = autoUpdater.installerPath
      if (!app.isPackaged || !updateDownloaded || !downloadedInfo || !isNewerUpdate(downloadedInfo.version,app.getVersion()) || !installer || !existsSync(installer)) throw Error('UPDATE_INSTALLER_UNAVAILABLE')
      if (!installerSha512 || !snapshot || snapshot.format !== 'POSOffline-upgrade-v1' || !Array.isArray(snapshot.orders) || !Array.isArray(snapshot.syncQueue) || !Array.isArray(snapshot.config) || !Array.isArray(snapshot.products)) throw Error('UPDATE_BACKUP_REQUIRED')
      if (existsSync(upgradeHelper())) {
        if (!stageReady) await stageDownloadedUpdate(installer)
        else if (stageInFlight) await stageInFlight
        const current = await stat(installer)
        if (!verifiedInstaller || verifiedInstaller.path !== installer || verifiedInstaller.size !== current.size || verifiedInstaller.mtimeMs !== current.mtimeMs) throw Error('UPDATE_INSTALLER_CHANGED_AFTER_VERIFICATION')
      } else await verifyDownloadedInstaller(installer)
      const bytes = Buffer.from(JSON.stringify(snapshot))
      if (bytes.length > 64 * 1024 * 1024) throw Error('UPDATE_BACKUP_TOO_LARGE')
      const folder = path.join(app.getPath('userData'),'data','upgrade-backups')
      await mkdir(folder,{recursive:true})
      const file = path.join(folder,`indexeddb-before-${downloadedInfo.version}-${randomUUID()}.json`)
      const handle = await open(file,'wx',0o600)
      try {await handle.writeFile(bytes);await handle.sync()} finally {await handle.close()}
      if (createHash('sha256').update(await readFile(file)).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) throw Error('UPDATE_BACKUP_VERIFY_FAILED')
      prepared = true
      await installationHooks.prepare()
      if (existsSync(upgradeHelper())) await runUpgradeHelper('refresh-stage', installer)
      sendToRenderer('update-status','installing',downloadedInfo)
      // Heavy verification and backup are complete before opening NSIS.
      autoUpdater.quitAndInstall(false,true)
      return true
    } catch (error:any) {
      if (prepared) {try{installationHooks.resume()}catch{}}
      installing = false
      sendToRenderer('update-error',error.message || 'UPDATE_INSTALL_FAILED')
      return false
    }
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
