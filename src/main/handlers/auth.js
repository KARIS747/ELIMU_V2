/**
 * handlers/auth.js — Authentification & gestion des utilisateurs
 */

const {
  login,
  createAdmin,
  isFirstLaunch,
  getQuestionSecrete,
  reinitialiserMotDePasse,
  getUtilisateurs,
  createUtilisateur,
  updateUtilisateur,
  deleteUtilisateur
} = require('../../shared/security/auth');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');
const { run, get } = require('../../shared/database/db');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, setCurrentUserId: function, injecterDonneesFictives: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, setCurrentUserId, getCurrentEcoleId, injecterDonneesFictives } = deps;

  // Helper pour vérifier l'accès admin
  const checkAdmin = async () => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, 'admin');
  };

  // ── Déconnexion ────────────────────────────────────────────────────────────

  ipcMain.handle('auth:logout', async () => {
    try {
      const userId = getCurrentUserId();
      if (userId) {
        await logAudit(userId, 'DECONNEXION', 'Déconnexion manuelle');
      }
      setCurrentUserId(null);
      logger.info('Utilisateur déconnecté');
      return { success: true };
    } catch (error) {
      logger.error('Erreur logout:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Première ouverture ──────────────────────────────────────────────────────

  ipcMain.handle('auth:isFirstLaunch', async () => {
    try {
      return await isFirstLaunch();
    } catch (error) {
      logger.error('Erreur isFirstLaunch:', error);
      return true;
    }
  });

  // ── Connexion ───────────────────────────────────────────────────────────────

  ipcMain.handle('auth:login', async (event, username, password) => {
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await login(username, password, ecoleId);
      if (result.success) {
        setCurrentUserId(result.user.id);
        await logAudit(result.user.id, 'CONNEXION', `Connexion: ${username}`);
        logger.info(`Connexion réussie: ${username}`);
      }
      return result;
    } catch (error) {
      logger.error('Erreur login:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Création de l'administrateur initial ────────────────────────────────────

  ipcMain.handle('auth:createAdmin', async (event, username, password, question, reponse) => {
    try {
      // On ne permet la création d'un admin que si c'est le premier lancement
      const first = await isFirstLaunch();
      if (!first) return { success: false, error: 'Un administrateur existe déjà' };

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await createAdmin(username, password, question, reponse, ecoleId);
      if (result.success) {
        setCurrentUserId(result.user.id);
        logger.info(`Admin créé: ${username}`);
      }
      return result;
    } catch (error) {
      logger.error('Erreur createAdmin:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Réinitialisation du mot de passe ────────────────────────────────────────

  ipcMain.handle('auth:getQuestionSecrete', async (event, username) => {
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      return await getQuestionSecrete(username, ecoleId);
    } catch (error) {
      logger.error('Erreur getQuestionSecrete:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:reinitialiserMotDePasse', async (event, username, reponse, nouveauMdp) => {
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      return await reinitialiserMotDePasse(username, reponse, nouveauMdp, ecoleId);
    } catch (error) {
      logger.error('Erreur reinitialiserMotDePasse:', error);
      return { success: false, error: error.message };
    }
  });

  // ── CRUD utilisateurs (admin seulement) ─────────────────────────────────────

  ipcMain.handle('auth:getUtilisateurs', async () => {
    if (!(await checkAdmin())) return [];
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      return await getUtilisateurs(ecoleId);
    } catch (error) {
      logger.error('Erreur getUtilisateurs:', error);
      return [];
    }
  });

  ipcMain.handle('auth:createUtilisateur', async (event, data) => {
    const userId = getCurrentUserId();
    if (!userId || !(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await createUtilisateur({ ...data, ecole_id: ecoleId });
      if (result.success) {
        if (data.role === 'enseignant') {
          const nomParts = (data.nom_complet || data.nom_utilisateur).trim().split(/\s+/);
          const prenom = nomParts.length > 1 ? nomParts.slice(0, -1).join(' ') : '';
          const nom = nomParts.length > 1 ? nomParts[nomParts.length - 1] : nomParts[0];
          run(
            `INSERT OR IGNORE INTO professeurs (nom, prenom, telephone, actif, utilisateur_id, ecole_id)
             VALUES (?, ?, ?, 1, ?, ?)`,
            [nom, prenom, data.telephone || null, result.id, ecoleId]
          );
        }
        await logAudit(
          userId,
          'CREATE_USER',
          `Nouvel utilisateur : ${data.nom_utilisateur} (${data.role})`
        );
      }
      return result;
    } catch (error) {
      logger.error('Erreur createUtilisateur:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:updateUtilisateur', async (event, id, data) => {
    const userId = getCurrentUserId();
    if (!userId || !(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await updateUtilisateur(id, data, ecoleId);
      if (result.success && data.role === 'enseignant') {
        const profExist = get('SELECT id FROM professeurs WHERE utilisateur_id = ? AND ecole_id = ?', [id, ecoleId]);
        if (!profExist) {
          const nomParts = (data.nom_complet || '').trim().split(/\s+/);
          const prenom = nomParts.length > 1 ? nomParts.slice(0, -1).join(' ') : '';
          const nom = nomParts.length > 1 ? nomParts[nomParts.length - 1] : nomParts[0];
          run(
            `INSERT OR IGNORE INTO professeurs (nom, prenom, telephone, actif, utilisateur_id, ecole_id)
             VALUES (?, ?, ?, 1, ?, ?)`,
            [nom, prenom, data.telephone || null, id, ecoleId]
          );
        }
      }
      if (result.success) {
        await logAudit(userId, 'UPDATE_USER', `Utilisateur ID ${id} mis à jour`);
      }
      return result;
    } catch (error) {
      logger.error('Erreur updateUtilisateur:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('auth:deleteUtilisateur', async (event, id) => {
    const userId = getCurrentUserId();
    if (!userId || !(await checkAdmin())) return { success: false, error: 'Accès non autorisé' };
    try {
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await deleteUtilisateur(id, ecoleId);
      if (result.success) {
        await logAudit(userId, 'DELETE_USER', `Utilisateur ID ${id} supprimé`);
      }
      return result;
    } catch (error) {
      logger.error('Erreur deleteUtilisateur:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
