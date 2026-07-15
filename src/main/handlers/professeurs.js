/**
 * handlers/professeurs.js — CRUD professeurs & classes enseignées
 */

const { run, get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId } = deps;

  // Helper pour vérifier l'accès admin/secretaire
  const checkAccess = async (roles = ['admin', 'secretaire']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Liste paginée ───────────────────────────────────────────────────────────

  ipcMain.handle('db:getProfesseurs', async (event, filtres = {}) => {
    if (!getCurrentUserId()) return { professeurs: [], total: 0 };
    try {
      const { recherche = '', actifSeulement = false, page = 1, limit = 50 } = filtres;
      let where = 'WHERE 1=1';
      const params = [];
      if (actifSeulement) { where += ' AND p.actif = 1'; }
      if (recherche && recherche.trim()) {
        where += ' AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.matiere_principale LIKE ?)';
        const q = `%${recherche.trim()}%`;
        params.push(q, q, q);
      }
      const countRow = get(
        `SELECT COUNT(*) as total FROM professeurs p ${where}`,
        params
      );
      const total = countRow?.total || 0;
      
      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 50;
      const offset = (pNum - 1) * lNum;

      const profs = all(`
        SELECT p.*,
               COUNT(DISTINCT pc.classe_id) AS nb_classes
        FROM professeurs p
        LEFT JOIN professeurs_classes pc ON pc.classe_id = p.id
        ${where}
        GROUP BY p.id
        ORDER BY p.nom, p.prenom
        LIMIT ? OFFSET ?
      `, [...params, lNum, offset]);

      // Global Stats pour les KPIs
      const nbActifs = get('SELECT COUNT(*) as count FROM professeurs WHERE actif = 1')?.count || 0;
      const nbFemmes = get('SELECT COUNT(*) as count FROM professeurs WHERE sexe = "F"')?.count || 0;

      return { professeurs: profs, total, page: pNum, limit: lNum, stats: { nbActifs, nbFemmes } };
      } catch (e) {
      logger.error('Erreur db:getProfesseurs:', e);
      return { professeurs: [], total: 0, page: 1, limit: 50 };
    }
  });

  // ── Liste simplifiée (sélecteur) ────────────────────────────────────────────

  ipcMain.handle('db:getProfesseursList', async (event, classeId) => {
    if (!getCurrentUserId()) return [];
    try {
      let sql = `
        SELECT p.id, p.nom, p.prenom, p.matiere_principale
        FROM professeurs p
        WHERE p.actif = 1
      `;
      const params = [];
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) {
        sql += ` AND EXISTS (
          SELECT 1 FROM professeurs_classes pc
          WHERE pc.professeur_id = p.id AND pc.classe_id = ?
        )`;
        params.push(cid);
      }
      sql += ' ORDER BY p.nom, p.prenom';
      return all(sql, params);
    } catch (e) {
      logger.error('Erreur db:getProfesseursList:', e);
      return [];
    }
  });

  // ── Détail ──────────────────────────────────────────────────────────────────

  ipcMain.handle('db:getProfesseurDetail', async (event, id) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const pid = parseInt(id);
      if (isNaN(pid)) return { error: 'ID invalide' };

      const prof = get(`SELECT * FROM professeurs WHERE id = ?`, [pid]);
      if (!prof) return { error: 'Professeur introuvable' };
      
      const classes = all(`
        SELECT c.id, c.nom_classe, c.niveau,
               (SELECT COUNT(*) FROM eleves WHERE classe_id = c.id) as nb_eleves
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ?
        ORDER BY c.nom_classe
      `, [pid]);

      const classesPrincipales = all(`
        SELECT id, nom_classe, niveau FROM classes
        WHERE professeur_principal_id = ? ORDER BY nom_classe
      `, [pid]);

      // Calcul du nombre total d'élèves impactés
      const totalEleves = classes.reduce((acc, c) => acc + (c.nb_eleves || 0), 0);

      return { professeur: prof, classes, classesPrincipales, totalEleves };
    } catch (e) {
      logger.error('Erreur db:getProfesseurDetail:', e);
      return { error: e.message };
    }
  });

  // ── Création ────────────────────────────────────────────────────────────────

  ipcMain.handle('db:addProfesseur', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.nom || !data.prenom) return { success: false, error: 'Nom et prénom requis' };
      const r = run(`
        INSERT INTO professeurs (civilite, nom, prenom, sexe, telephone, email, 
                                matiere_principale, specialite, diplome_max, 
                                adresse, ville, date_embauche, actif)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.civilite || null, data.nom.trim(), data.prenom.trim(), data.sexe || null,
        data.telephone ? data.telephone.trim() : null, data.email ? data.email.trim() : null,
        data.matiere_principale ? data.matiere_principale.trim() : null,
        data.specialite || null, data.diplome_max || null,
        data.adresse || null, data.ville || null,
        data.date_embauche || null, data.actif ?? 1
      ]);
      await logAudit(getCurrentUserId(), 'ADD_PROFESSEUR', `Nouveau prof : ${data.prenom} ${data.nom}`);
      return { success: true, id: r.lastID };
    } catch (e) {
      logger.error('Erreur db:addProfesseur:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Modification ────────────────────────────────────────────────────────────

  ipcMain.handle('db:updateProfesseur', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };

      run(`
        UPDATE professeurs SET 
          civilite=?, nom=?, prenom=?, sexe=?, telephone=?, email=?,
          matiere_principale=?, specialite=?, diplome_max=?, 
          adresse=?, ville=?, date_embauche=?, actif=?
        WHERE id=?
      `, [
        data.civilite || null, data.nom.trim(), data.prenom.trim(), data.sexe || null,
        data.telephone ? data.telephone.trim() : null, data.email ? data.email.trim() : null,
        data.matiere_principale ? data.matiere_principale.trim() : null,
        data.specialite || null, data.diplome_max || null,
        data.adresse || null, data.ville || null,
        data.date_embauche || null, data.actif ?? 1, pid
      ]);
      await logAudit(getCurrentUserId(), 'UPDATE_PROFESSEUR', `Prof ID ${pid} mis à jour`);
      return { success: true };
    } catch (e) {
      logger.error('Erreur db:updateProfesseur:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Désactivation ───────────────────────────────────────────────────────────

  ipcMain.handle('db:deleteProfesseur', async (event, id) => {
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const pid = parseInt(id);
      if (isNaN(pid)) return { success: false, error: 'ID invalide' };
      run(`UPDATE professeurs SET actif = 0 WHERE id = ?`, [pid]);
      run(`UPDATE classes SET professeur_principal_id = NULL WHERE professeur_principal_id = ?`, [pid]);
      await logAudit(getCurrentUserId(), 'DELETE_PROFESSEUR', `Prof ID ${pid} désactivé`);
      return { success: true };
    } catch (e) {
      logger.error('Erreur db:deleteProfesseur:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Classes enseignées ──────────────────────────────────────────────────────

  ipcMain.handle('db:updateClassesEnseignees', async (event, professeurId, classeIds) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const pid = parseInt(professeurId);
      if (isNaN(pid)) return { success: false, error: 'ID professeur invalide' };

      run(`DELETE FROM professeurs_classes WHERE professeur_id = ?`, [pid]);
      if (Array.isArray(classeIds) && classeIds.length) {
        for (const cid of classeIds) {
          const classIdNum = parseInt(cid);
          if (isNaN(classIdNum)) continue;
          try {
            run(
              `INSERT OR IGNORE INTO professeurs_classes (professeur_id, classe_id) VALUES (?, ?)`,
              [pid, classIdNum]
            );
          } catch (err) {
            // ignorer
          }
        }
      }
      return { success: true };
    } catch (e) {
      logger.error('Erreur db:updateClassesEnseignees:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('db:getClassesByProfesseur', async (event, professeurId) => {
    if (!getCurrentUserId()) return [];
    try {
      const pid = parseInt(professeurId);
      if (isNaN(pid)) return [];
      return all(`
        SELECT c.id, c.nom_classe, c.niveau
        FROM classes c
        JOIN professeurs_classes pc ON pc.classe_id = c.id
        WHERE pc.professeur_id = ?
        ORDER BY c.nom_classe
      `, [pid]);
    } catch (e) {
      logger.error('Erreur db:getClassesByProfesseur:', e);
      return [];
    }
  });
}

module.exports = { register };
