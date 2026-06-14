import { ipcMain, app } from 'electron';
import path from 'path';
import fs from 'fs';
let mainWindow = null;
// Version info
let latestVersion = '2.0.0';
let updateUrl = '';
/**
 * Get API URL from persistent config file
 */
function getPersistentApiUrl() {
    const configPath = path.join(app.getPath('userData'), 'api-config.json');
    try {
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return data.apiUrl || '/api';
        }
    }
    catch (e) { }
    return '/api';
}
/**
 * Initialize updater with main window reference
 */
function setupUpdater(window) {
    mainWindow = window;
    setupIpcHandlers();
}
/**
 * Send message to renderer process
 */
function sendToRenderer(channel, ...args) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
    }
}
/**
 * Set up IPC handlers for update operations
 */
function setupIpcHandlers() {
    // Check for updates via API
    ipcMain.handle('check-for-updates', async () => {
        try {
            sendToRenderer('update-status', 'checking');
            const currentVersion = app.getVersion();
            // Get API URL from persistent config (set by user in LoginPage)
            const apiUrl = getPersistentApiUrl();
            // Normalize URL - if relative path, use localhost:3000 as fallback for updates
            let serverUrl = apiUrl;
            if (apiUrl.startsWith('/')) {
                // Relative path - only works if running on same machine
                // For updates from remote, we need full URL
                console.log('[Updater] Using relative API URL:', apiUrl);
                sendToRenderer('update-status', 'up-to-date', { version: currentVersion });
                return { current: currentVersion, latest: currentVersion };
            }
            // Fetch version from server API
            const response = await fetch(`${serverUrl}/api/version`);
            if (response.ok) {
                const data = await response.json();
                latestVersion = data.latest || currentVersion;
                updateUrl = data.updateUrl || '';
                if (latestVersion !== currentVersion) {
                    sendToRenderer('update-status', 'available', {
                        version: latestVersion,
                        updateUrl: updateUrl
                    });
                }
                else {
                    sendToRenderer('update-status', 'up-to-date', {
                        version: currentVersion
                    });
                }
            }
            else {
                sendToRenderer('update-status', 'up-to-date', {
                    version: currentVersion
                });
            }
            return { current: currentVersion, latest: latestVersion };
        }
        catch (error) {
            console.error('[Updater] Check failed:', error.message);
            sendToRenderer('update-status', 'up-to-date', {
                version: app.getVersion()
            });
            return null;
        }
    });
    // Download update
    ipcMain.handle('download-update', async () => {
        try {
            if (!updateUrl) {
                throw new Error('No update URL configured');
            }
            sendToRenderer('update-status', 'downloading');
            sendToRenderer('update-progress', { percent: 50 });
            // In production, this would download the installer
            sendToRenderer('update-progress', { percent: 100 });
            sendToRenderer('update-status', 'downloaded', {
                version: latestVersion
            });
            return true;
        }
        catch (error) {
            console.error('[Updater] Download failed:', error.message);
            sendToRenderer('update-error', error.message);
            return false;
        }
    });
    // Install update and restart
    ipcMain.handle('install-update', () => {
        console.log('[Updater] Update would install and restart...');
    });
    // Get current version
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });
}
/**
 * Check for updates automatically (call on app start in packaged mode)
 */
function checkForUpdatesOnStart() {
    if (!app.isPackaged) {
        console.log('[Updater] Skipping auto-check in development mode');
        return;
    }
    console.log('[Updater] Checking for updates on startup...');
    setTimeout(() => {
        sendToRenderer('update-status', 'checking');
    }, 3000);
}
export { setupUpdater, checkForUpdatesOnStart };
