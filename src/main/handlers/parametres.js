/**
 * handlers/parametres.js — Paramètres, configuration bulletin, audit, logo
 */

const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { run, all } = require('../../shared/database/db');
const { hasRole } = require('../../shared/security/access');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getMainWindow: function, getCurrentUserId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getMainWindow, getCurrentUserId } = deps;

  // Helper pour vérifier l'accès admin
  const checkAdmin = async () => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, 'admin');
  };

  // ── Paramètres généraux ─────────────────────────────────────────────────────

  ipcMain.handle('db:getParametres', async () => {
    if (!getCurrentUserId()) return {};
    try {
      const rows = all('SELECT cle, valeur FROM parametres');
      const params = {};
      rows.forEach(r => { params[r.cle] = r.valeur; });
      return params;
    } catch (error) {
      logger.error('Erreur getParametres:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:saveParametres', async (event, params) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      for (const [cle, valeur] of Object.entries(params)) {
        run('INSERT OR REPLACE INTO parametres (cle, valeur) VALUES (?, ?)', [cle, String(valeur)]);
      }
      return { success: true };
    } catch (error) {
      logger.error('Erreur saveParametres:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Configuration bulletin ──────────────────────────────────────────────────

  ipcMain.handle('db:getBulletinConfig', async () => {
    if (!getCurrentUserId()) return {};
    try {
      const rows = all('SELECT cle, valeur FROM bulletin_config');
      const config = {};
      rows.forEach(r => { config[r.cle] = r.valeur; });
      return config;
    } catch (error) {
      logger.error('Erreur getBulletinConfig:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:saveBulletinConfig', async (event, data) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      for (const [cle, valeur] of Object.entries(data)) {
        run('INSERT OR REPLACE INTO bulletin_config (cle, valeur) VALUES (?, ?)', [cle, String(valeur)]);
      }
      return { success: true };
    } catch (error) {
      logger.error('Erreur saveBulletinConfig:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Logo établissement ──────────────────────────────────────────────────────

  ipcMain.handle('dialog:uploadLogo', async () => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const result = await dialog.showOpenDialog(getMainWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg'] }]
      });
      if (result.canceled) return { canceled: true };
      const filePath = result.filePaths[0];
      const imageBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime =
        ext === '.png'  ? 'image/png' :
        ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
        ext === '.gif'  ? 'image/gif' :
        'image/svg+xml';
      const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;
      return { success: true, dataUrl };
    } catch (error) {
      logger.error('Erreur uploadLogo:', error);
      return { error: error.message };
    }
  });

  // ── Journal d'audit ─────────────────────────────────────────────────────────

  // Supprimé d'ici car déjà présent dans src/main/handlers/audit.js
  /*
  ipcMain.handle('audit:getLogs', async (event, limit = 50) => {
    try {
      return all(
        `SELECT a.*, u.nom_utilisateur FROM audit_log a
         LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY a.timestamp DESC LIMIT ?`,
        [limit]
      );
    } catch (error) {
      logger.error('Erreur getLogs:', error);
      return { error: error.message };
    }
  });
  */

  // ── Sélecteur de dossier ───────────────────────────────────────────────────

  ipcMain.handle('dialog:selectBackupFolder', async () => {
    if (!(await checkAdmin())) return null;
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
}

module.exports = { register };
