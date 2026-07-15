/**
 * handlers/matieres.js — Gestion des matières
 */

const { run, all } = require('../../shared/database/db');
const { hasRole } = require('../../shared/security/access');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId } = deps;

  // Helper pour vérifier l'accès admin
  const checkAdmin = async () => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, 'admin');
  };

  ipcMain.handle('db:getMatieres', async () => {
    if (!getCurrentUserId()) return [];
    try {
      return all('SELECT * FROM matieres ORDER BY nom_matiere');
    } catch (error) {
      logger.error('Erreur getMatieres:', error);
      return [];
    }
  });

  ipcMain.handle('db:addMatiere', async (event, nom) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!nom) return { success: false, error: 'Nom de matière requis' };
      const result = run('INSERT INTO matieres (nom_matiere) VALUES (?)', [nom.trim()]);
      return { success: true, id: result.lastID };
    } catch (error) {
      logger.error('Erreur addMatiere:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:deleteMatiere', async (event, id) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const mid = parseInt(id);
      if (isNaN(mid)) return { success: false, error: 'ID invalide' };
      run('DELETE FROM matieres WHERE id=?', [mid]);
      return { success: true };
    } catch (error) {
      logger.error('Erreur deleteMatiere:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:updateMatiereCoefficient', async (event, id, coefficient) => {
    if (!(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const mid = parseInt(id);
      const coeff = parseFloat(coefficient);
      if (isNaN(mid) || isNaN(coeff)) return { success: false, error: 'Données invalides' };
      run('UPDATE matieres SET coefficient = ? WHERE id = ?', [coeff, mid]);
      return { success: true };
    } catch (error) {
      logger.error('Erreur updateMatiereCoefficient:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
