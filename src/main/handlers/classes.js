/**
 * handlers/classes.js — Gestion des classes
 */

const { run, get, all } = require('../../shared/database/db');
const { hasRole } = require('../../shared/security/access');

/**
 * Synchronise les noms de matières avec la table globale 'matieres'.
 * Permet de supprimer l'onglet de gestion manuelle des matières dans les paramètres.
 */
function syncMatieres(matieres) {
  if (!Array.isArray(matieres)) return;
  for (const m of matieres) {
    const nom = (m.nom || m.nom_matiere || '').trim();
    if (!nom) continue;
    try {
      // On insère si n'existe pas déjà (IGNORE car nom_matiere est UNIQUE)
      run('INSERT OR IGNORE INTO matieres (nom_matiere) VALUES (?)', [nom]);
    } catch (e) { /* Silencieux */ }
  }
}

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentAnneeId, getCurrentEcoleId } = deps;

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  ipcMain.handle('db:getClasses', async () => {
    const userId = getCurrentUserId();
    if (!userId) {
      logger.warn('Tentative getClasses sans userId');
      return { error: 'Non authentifié' };
    }
    
    try {
      let anneeId = getCurrentAnneeId();
      
      // Fallback si l'année n'est pas initialisée
      if (!anneeId) {
        const lastAnnee = get('SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1') 
                       || get('SELECT id FROM annees_scolaires ORDER BY id DESC LIMIT 1');
        anneeId = lastAnnee?.id;
        logger.info(`getClasses: anneeId était nul, utilisation fallback: ${anneeId}`);
      }

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const query = `
        SELECT c.*,
               COUNT(DISTINCT e.id) as nb_eleves,
               ROUND(AVG(n.note), 2) as moyenne_generale,
               p.nom  AS prof_principal_nom,
               p.prenom AS prof_principal_prenom
        FROM classes c
        LEFT JOIN eleves e ON e.classe_id = c.id AND e.annee_scolaire_id = ? AND e.ecole_id = ?
        LEFT JOIN notes n ON n.eleve_id = e.id AND n.annee_scolaire_id = ? AND n.ecole_id = ?
        LEFT JOIN professeurs p ON p.id = c.professeur_principal_id
        WHERE c.ecole_id = ?
        GROUP BY c.id
        ORDER BY c.niveau, c.nom_classe
      `;
      
      const rows = all(query, [anneeId, ecoleId, anneeId, ecoleId, ecoleId]);
      logger.info(`getClasses: ${rows.length} classes trouvées pour anneeId=${anneeId}`);
      return rows;
    } catch (error) {
      logger.error('Erreur getClasses:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:addClass', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.nom_classe) return { success: false, error: 'Nom de classe requis' };
      
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      // Synchro auto des matières
      syncMatieres(data.matieres);

      const result = run(
        'INSERT INTO classes (nom_classe, niveau, niveau_v2, systeme_educatif, matieres_json, ecole_id) VALUES (?, ?, ?, ?, ?, ?)',
        [
          data.nom_classe.trim(),
          data.niveau,
          data.niveau_v2 || null,
          data.systeme_educatif || 'francophone',
          JSON.stringify(data.matieres || []),
          ecoleId
        ]
      );
      return { success: true, id: result.lastID };
    } catch (error) {
      logger.error('Erreur addClass:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:updateClass', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(id);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      // Synchro auto des matières
      syncMatieres(data.matieres);

      run(
        'UPDATE classes SET nom_classe=?, niveau=?, niveau_v2=?, systeme_educatif=?, matieres_json=?, professeur_principal_id=? WHERE id=? AND ecole_id=?',
        [
          data.nom_classe ? data.nom_classe.trim() : '',
          data.niveau,
          data.niveau_v2 || null,
          data.systeme_educatif || 'francophone',
          JSON.stringify(data.matieres || []),
          parseInt(data.professeur_principal_id) || null,
          cid,
          ecoleId
        ]
      );
      return { success: true };
    } catch (error) {
      logger.error('Erreur updateClass:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:deleteClass', async (event, id) => {
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(id);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      // Vérifier si la classe a des élèves
      const row = get('SELECT COUNT(*) as count FROM eleves WHERE classe_id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (row && row.count > 0) {
        return { success: false, error: 'Impossible de supprimer une classe contenant des élèves' };
      }

      run('DELETE FROM classes WHERE id=? AND ecole_id=?', [cid, ecoleId]);
      return { success: true };
    } catch (error) {
      logger.error('Erreur deleteClass:', error);
      return { error: error.message };
    }
  });
}

module.exports = { register };
