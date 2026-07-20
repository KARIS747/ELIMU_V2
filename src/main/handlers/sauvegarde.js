/**
 * handlers/sauvegarde.js — Sauvegarde, restauration et gestion de l'année scolaire
 */

const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const { initializeDatabase, closeDatabase, run } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');

const { getLocalDateString, getLocalTimestampForFile } = require('../../shared/utils/dateUtils');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getMainWindow: function, getBackupDir: function, getDbPath: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getMainWindow, getBackupDir, getDbPath, getCurrentEcoleId } = deps;

  // Helper pour vérifier l'accès admin
  const checkAdmin = async () => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, 'admin');
  };

  // ── Sauvegarde manuelle ─────────────────────────────────────────────────────

  ipcMain.handle('backup:create', async (event, utilisateurId, customFolder) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const timestamp = getLocalTimestampForFile();
      const targetDir = customFolder || getBackupDir();
      const backupPath = path.join(targetDir, `elimu_backup_${timestamp}.db`);
      
      if (!fs.existsSync(targetDir)) {
          return { success: false, error: 'Dossier de sauvegarde inexistant' };
      }

      // Copie directe sans fermer la base (WAL mode le permet)
      fs.copyFileSync(getDbPath(), backupPath);
      
      const stats = fs.statSync(backupPath);
      if (stats.size === 0) {
          throw new Error('La sauvegarde est corrompue (fichier vide).');
      }

      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'BACKUP', `Sauvegarde: ${backupPath}`);
      return { success: true, path: backupPath };
    } catch (error) {
      logger.error('Erreur backup:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Restauration ────────────────────────────────────────────────────────────

  ipcMain.handle('backup:restore', async (event, utilisateurId) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const result = await dialog.showOpenDialog(getMainWindow(), {
        properties: ['openFile'],
        filters: [{ name: 'Base de données', extensions: ['db'] }]
      });
      if (result.canceled) return { canceled: true };
      
      await closeDatabase();
      fs.copyFileSync(result.filePaths[0], getDbPath());
      
      // Crucial : Re-initialiser la base après restauration
      await initializeDatabase(getDbPath());
      
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'RESTORE', `Restauration depuis : ${result.filePaths[0]}`);
      logger.info('Base de données restaurée');
      return { success: true };
    } catch (error) {
      logger.error('Erreur restore:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Liste des sauvegardes ───────────────────────────────────────────────────

  ipcMain.handle('backup:liste', async (event, customFolder) => {
    if (!getCurrentUserId()) return [];
    try {
      const backupDirPath = getBackupDir();
      const directories = [backupDirPath];
      
      if (customFolder && customFolder !== backupDirPath && fs.existsSync(customFolder)) {
        directories.push(customFolder);
      }

      let allFiles = [];

      for (const dir of directories) {
        try {
          const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.db'))
            .map(f => {
              const filePath = path.join(dir, f);
              const stat = fs.statSync(filePath);
              return {
                nom:    f,
                taille: Math.round(stat.size / 1024),
                date:   getLocalDateString(stat.mtime),
                auto:   f.startsWith('elimu_auto_'),
                path:   filePath
              };
            });
          allFiles = allFiles.concat(files);
        } catch (err) {
          logger.error(`Erreur lecture dossier ${dir}:`, err);
        }
      }

      // Supprimer les doublons éventuels par nom de fichier (si même nom dans deux dossiers, on garde le plus récent)
      const uniqueFiles = [];
      const seen = new Set();
      
      allFiles
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(f => {
          if (!seen.has(f.nom)) {
            seen.add(f.nom);
            uniqueFiles.push(f);
          }
        });

      return uniqueFiles;
    } catch (error) {
      logger.error('Erreur backup:liste:', error);
      return [];
    }
  });

  // ── Nouvelle année scolaire ─────────────────────────────────────────────────

  ipcMain.handle('db:nouvelleAnneeScolaire', async (event, utilisateurId) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const timestamp = getLocalTimestampForFile();
      const backupPath = path.join(getBackupDir(), `elimu_fin_annee_${timestamp}.db`);
      fs.copyFileSync(getDbPath(), backupPath);
      logger.info(`✅ Backup fin d'année : ${backupPath}`);

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      run('DELETE FROM heures_absence WHERE ecole_id = ?', [ecoleId]);
      run('DELETE FROM absences WHERE ecole_id = ?', [ecoleId]);
      run('DELETE FROM sanctions WHERE ecole_id = ?', [ecoleId]);
      run('DELETE FROM notes WHERE ecole_id = ?', [ecoleId]);
      run('DELETE FROM eleves WHERE ecole_id = ?', [ecoleId]);
      run(
        "DELETE FROM sqlite_sequence WHERE name IN ('eleves','notes','absences','sanctions','heures_absence')"
      );

      await logAudit(
        getCurrentUserId(),
        'NOUVELLE_ANNEE',
        `Nouvelle année scolaire — backup: ${path.basename(backupPath)}`
      );
      logger.info('✅ Nouvelle année scolaire initialisée');
      return { success: true, backupPath };
    } catch (error) {
      logger.error('Erreur nouvelleAnneeScolaire:', error);
      return { error: error.message };
    }
  });
}

/**
 * Lance la sauvegarde automatique quotidienne.
 * À appeler depuis main.js après l'initialisation de la base de données.
 * @param {{ logger: object, getBackupDir: function, getDbPath: function }} deps
 */
async function sauvegardeAutomatique(deps) {
  const { logger, getBackupDir, getDbPath } = deps;
  try {
    const backupDirPath = getBackupDir();
    if (!fs.existsSync(backupDirPath)) {
      fs.mkdirSync(backupDirPath, { recursive: true });
    }
    const currentDbPath = getDbPath();
    const today = getLocalDateString();
    const dejaFaite = fs.readdirSync(backupDirPath).some(
      f => f.startsWith('elimu_auto_') && f.includes(today)
    );
    if (dejaFaite) {
      logger.info("Sauvegarde automatique déjà effectuée aujourd'hui — skip");
      return;
    }
    const timestamp = getLocalTimestampForFile();
    const backupPath = path.join(backupDirPath, `elimu_auto_${timestamp}.db`);
    fs.copyFileSync(currentDbPath, backupPath);
    logger.info(`✅ Sauvegarde automatique créée : ${backupPath}`);

    const fichiers = fs.readdirSync(backupDirPath)
      .filter(f => f.endsWith('.db'))
      .map(f => ({ nom: f, mtime: fs.statSync(path.join(backupDirPath, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const aSupprimer = fichiers.slice(30);
    aSupprimer.forEach(f => {
      fs.unlinkSync(path.join(backupDirPath, f.nom));
      logger.info(`🗑️ Vieux backup supprimé : ${f.nom}`);
    });
  } catch (error) {
    logger.error('Erreur sauvegarde automatique:', error);
  }
}

module.exports = { register, sauvegardeAutomatique };
