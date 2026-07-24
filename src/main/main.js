/**
 * main.js - Point d'entrée principal de l'application Elimu (OPTIMISÉ)
 * Version avec Splash Screen et chargement modulaire.
 */

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

app.commandLine.appendSwitch('disable-gpu');

// === ÉTAT GLOBAL ===
let mainWindow = null;
let splashWindow = null;
let currentUserId = null;
let currentAnneeId = null;
let currentEcoleId = null;

// === CONFIGURATION DES LOGS (Rapide) ===
const userDataPath = app.getPath('userData');
const backupDir = path.join(userDataPath, 'backups');
const logsDir = path.join(userDataPath, 'logs');
const dbPath = path.join(userDataPath, 'elimu.db');

if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Lazy load logger to speed up initial require
let logger;
function getLogger() {
  if (!logger) {
    const { createLogger } = require('../shared/utils/logger');
    logger = createLogger('main');
  }
  return logger;
}

// === GESTION DES ERREURS GLOBALES ===
function logFatal(err) {
  const msg = `[FATAL ${new Date().toISOString()}] ${err.stack || err}\n`;
  const backupLogPath = path.join(userDataPath, 'startup-error.log');
  fs.appendFileSync(backupLogPath, msg);
  console.error(msg);
}

process.on('uncaughtException', (err) => {
  logFatal(err);
  dialog.showErrorBox('Erreur Critique', err.message || 'Une erreur inattendue est survenue.');
  app.quit();
});

// === VERROUILLAGE D'INSTANCE UNIQUE ===
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// === SPLASH SCREEN ===
function createSplashScreen() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    backgroundColor: '#1a1e2c',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, '../renderer/splash/splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

function updateSplashStatus(status) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      if(document.getElementById('status')) 
        document.getElementById('status').innerText = "${status}";
    `).catch(() => {});
  }
}

// === FENÊTRE PRINCIPALE ===
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#1a1e2c',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    getLogger().info('Fenêtre principale affichée');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Initialize auto-updater (Deferred)
  const { setupUpdater } = require('./updater');
  setupUpdater(mainWindow);
}

// === CHARGEMENT DES HANDLERS (Modulaire) ===
function registerAllHandlers() {
  const sharedDeps = {
    logger: getLogger(),
    getCurrentUserId: () => currentUserId,
    setCurrentUserId: (id) => { currentUserId = id; },
    getCurrentAnneeId: () => currentAnneeId,
    setCurrentAnneeId: (id) => { currentAnneeId = id; },
    getCurrentEcoleId: () => currentEcoleId,
    setCurrentEcoleId: (id) => { currentEcoleId = id; },
    getMainWindow: () => mainWindow,
    getBackupDir: () => backupDir,
    getDbPath: () => dbPath
  };

  // require() ici au lieu d'en haut pour accélérer le démarrage initial
  require('./handlers/auth').register(ipcMain, { 
    ...sharedDeps
  });
  
  require('./handlers/classes').register(ipcMain, sharedDeps);
  require('./handlers/eleves').register(ipcMain, sharedDeps);
  require('./handlers/matieres').register(ipcMain, sharedDeps);
  require('./handlers/absences').register(ipcMain, sharedDeps);
  require('./handlers/importExport').register(ipcMain, sharedDeps);
  require('./handlers/parametres').register(ipcMain, sharedDeps);
  require('./handlers/professeurs').register(ipcMain, sharedDeps);
  require('./handlers/finance').register(ipcMain, sharedDeps);
  require('./handlers/parents').register(ipcMain, sharedDeps);
  require('./handlers/anneesScolaires').register(ipcMain, sharedDeps);
  require('./handlers/license').register(getLogger());
  require('./handlers/audit').register(ipcMain, sharedDeps);
  require('./handlers/sauvegarde').register(ipcMain, sharedDeps);

  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.on('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });
}

// === LOGIQUE DE DÉMARRAGE ===
app.whenReady().then(async () => {
  createSplashScreen();
  
  try {
    const l = getLogger();
    l.info(`--- Elimu v${app.getVersion()} Starting ---`);

    updateSplashStatus("Vérification d'intégrité...");
    const { checkIntegrity } = require('./utils/integrity');
    checkIntegrity(l);

    updateSplashStatus("Connexion à la base de données...");
    const { initializeDatabase, get, run } = require('../shared/database/db');
    await initializeDatabase(dbPath);

    // Générer ou récupérer l'UUID de l'école (stable)
    let ecoleId = get("SELECT valeur FROM parametres WHERE cle = 'ecole_id'")?.valeur;
    if (!ecoleId) {
      const { randomUUID } = require('crypto');
      ecoleId = randomUUID();
      run("INSERT OR REPLACE INTO parametres (cle, valeur) VALUES ('ecole_id', ?)", [ecoleId]);
    }
    currentEcoleId = ecoleId;

    // S'assurer que l'école est enregistrée dans la table ecoles
    const ecoleExistante = get("SELECT ecole_id FROM ecoles WHERE ecole_id = ?", [ecoleId]);
    if (!ecoleExistante) {
      const nomEtab = get("SELECT valeur FROM parametres WHERE cle = 'nom_etablissement'")?.valeur || 'Mon Établissement';
      run("INSERT OR IGNORE INTO ecoles (ecole_id, nom, date_creation) VALUES (?, ?, datetime('now'))", [ecoleId, nomEtab]);
    }

    updateSplashStatus("Initialisation des modules...");
    await initAnneesScolaires();

    registerAllHandlers();

    updateSplashStatus("Vérification de la licence...");
    await checkLicenseAndProceed();

    const { sauvegardeAutomatique } = require('./handlers/sauvegarde');
    sauvegardeAutomatique({ logger: getLogger(), getBackupDir: () => backupDir, getDbPath: () => dbPath });

  } catch (err) {
    getLogger().error(`Erreur fatale: ${err.message}`);
    logFatal(err);
    dialog.showErrorBox('Erreur d\'initialisation', err.message);
    app.quit();
  }
});

async function initAnneesScolaires() {
  const { get, run } = require('../shared/database/db');
  
  // S'assurer qu'une année est active
  const activeAnnee = get('SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1');
  if (activeAnnee) {
    currentAnneeId = activeAnnee.id;
  } else {
    const lastAnnee = get('SELECT id FROM annees_scolaires ORDER BY id DESC LIMIT 1');
    if (lastAnnee) {
      currentAnneeId = lastAnnee.id;
      run('UPDATE annees_scolaires SET active = 1 WHERE id = ?', [currentAnneeId]);
    }
  }
}

async function checkLicenseAndProceed() {
  if (process.env.NODE_ENV === 'development') {
    createWindow();
    return;
  }

  const { generateHardwareId, verifyLicense } = require('../shared/license');
  const { get, run } = require('../shared/database/db');

  try {
    const hwid = generateHardwareId();
    const keyRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['licence_key']);
    const lastUsageRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['licence_last_usage']);

    if (keyRow?.valeur) {
      const now = new Date();
      const systemDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const lastUsage = lastUsageRow?.valeur || '00000000';
      const effectiveDate = systemDate < lastUsage ? lastUsage : systemDate;

      if (verifyLicense(keyRow.valeur, hwid, effectiveDate)) {
        if (systemDate >= lastUsage) {
          run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', ['licence_last_usage', systemDate]);
        }
        createWindow();
        return;
      }
    }
    createLicenseWindow();
  } catch (error) {
    createLicenseWindow();
  }
}

function createLicenseWindow() {
  const { get } = require('../shared/database/db');
  let lang = 'fr';
  try {
    const langRow = get('SELECT valeur FROM parametres WHERE cle = ?', ['langue_interface']);
    if (langRow?.valeur) lang = langRow.valeur;
  } catch (e) {}

  const licenseWindow = new BrowserWindow({
    width: 600, height: 700, resizable: false, frame: true, backgroundColor: '#1a1e2c',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'preload.js') }
  });

  licenseWindow.loadFile(path.join(__dirname, '../renderer/license-screen/license.html'), { query: { lang } });
  
  if (splashWindow) splashWindow.close();

  ipcMain.once('license:activated', () => {
    licenseWindow.close();
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { };
