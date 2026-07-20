/**
 * handlers/audit.js — Gestion du journal d'audit
 */

const { all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');

function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentEcoleId } = deps;

  ipcMain.handle('audit:log', async (event, action, details, utilisateurId) => {
    // Sécurité : On utilise l'ID de session si disponible, sinon celui passé (cas limites)
    const effectiveUserId = getCurrentUserId() || utilisateurId;
    if (!effectiveUserId) return;
    return await logAudit(effectiveUserId, action, details);
  });

  ipcMain.handle('audit:getLogs', async (event, limit = 50) => {
    const userId = getCurrentUserId();
    if (!userId || !(await hasRole(userId, 'admin'))) return [];
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const nLimit = parseInt(limit) || 50;
      return all(`
        SELECT a.*, u.nom_utilisateur 
        FROM audit_log a
        LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE a.ecole_id = ?
        ORDER BY a.timestamp DESC
        LIMIT ?
      `, [ecoleId, nLimit]);
    } catch (err) {
      logger.error('Erreur audit:getLogs:', err);
      return [];
    }
  });
}

module.exports = { logAudit, register };
