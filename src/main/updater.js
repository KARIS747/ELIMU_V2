const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { ipcMain } = require('electron');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// IPC listener to manually check for updates
ipcMain.handle('updater:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (error) {
    log.error('Erreur lors de la vérification manuelle:', error);
    return { success: false, error: 'update.status.error_manual' };
  }
});

// IPC listener to restart and install the update
ipcMain.on('updater:quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

/**
 * Initializes the auto-updater and sets up event listeners.
 * @param {BrowserWindow} mainWindow The main application window to send status messages to.
 */
function setupUpdater(mainWindow) {
  // Send status messages to the renderer process
  const sendStatusToWindow = (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('updater:status', { status: 'checking', message: 'update.status.checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow('updater:status', { 
      status: 'available', 
      message: 'update.status.available', 
      version: info.version 
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatusToWindow('updater:status', { status: 'not-available', message: 'update.status.not_available' });
  });

  autoUpdater.on('error', (err) => {
    log.error('Erreur auto-updater:', err);
    sendStatusToWindow('updater:status', { status: 'error', message: 'update.status.error', error: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow('updater:progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow('updater:status', { 
      status: 'downloaded', 
      message: 'update.status.downloaded',
      version: info.version
    });
  });

  // Initial check on startup
  // We can add a delay to not slow down the app startup
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 5000);
}

module.exports = { setupUpdater };
