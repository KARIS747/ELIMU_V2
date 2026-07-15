/**
 * handlers/eleves.js — Gestion des élèves, notes et statistiques
 */

const { run, get, all, getLastWriteTimestamp } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');
const { genererTranchesPourEleve } = require('../utils/financeUtils');
const { syncParentEleve } = require('../../shared/utils/parentSync');
const { isSystemTampered } = require('../utils/integrity');
const { UA_TRIMESTRE_MAP, getUAsForPeriode } = require('../../shared/constants/curriculum');

// Cache pour le dashboard
let dashboardCache = new Map();
let lastDashboardInvalidation = 0;

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentAnneeId } = deps;

  // Invalider le cache du dashboard si nécessaire
  const checkDashboardCache = (key) => {
    const lastWrite = getLastWriteTimestamp();
    if (lastWrite > lastDashboardInvalidation) {
      dashboardCache.clear();
      lastDashboardInvalidation = lastWrite;
      return null;
    }
    return dashboardCache.get(key);
  };

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin', 'enseignant', 'secretaire']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Liste & détail élèves ───────────────────────────────────────────────────

  ipcMain.handle('db:getEleves', async (event, classeId) => {
    if (!getCurrentUserId() || isSystemTampered()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const cid = parseInt(classeId);
      let sql = `
        SELECT e.id, e.nom, e.prenom, e.sexe, e.classe_id, c.nom_classe, c.niveau_v2,
               (SELECT s.moyenne_generale FROM stats_eleves s WHERE s.eleve_id = e.id AND s.annee_scolaire_id = ? LIMIT 1) as moyenne_generale
        FROM eleves e
        LEFT JOIN classes c ON c.id = e.classe_id
        WHERE e.annee_scolaire_id = ?
      `;
      const params = [anneeId, anneeId];
      if (!isNaN(cid) && cid > 0) { 
        sql += ' AND e.classe_id = ?'; 
        params.push(cid); 
      }
      sql += ' ORDER BY e.nom, e.prenom';
      return all(sql, params);
    } catch (error) {
      logger.error('Erreur getEleves:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:getElevesPagines', async (event, classeId, recherche = '', page = 1, limit = 50, sexe = '') => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const cid = parseInt(classeId);
      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 50;
      const offset = (Math.max(1, pNum) - 1) * lNum;

      const params = [anneeId];
      let where = 'WHERE e.annee_scolaire_id = ?';
      if (!isNaN(cid) && cid > 0) { 
        where += ' AND e.classe_id = ?'; 
        params.push(cid); 
      }
      if (sexe && (sexe === 'M' || sexe === 'F')) {
        where += ' AND e.sexe = ?';
        params.push(sexe);
      }
      if (recherche && recherche.trim()) {
        where += " AND (e.nom || ' ' || e.prenom LIKE ? OR e.prenom || ' ' || e.nom LIKE ?)";
        const q = `%${recherche.trim()}%`;
        params.push(q, q);
      }

      const countRow = get(`SELECT COUNT(*) as total FROM eleves e ${where}`, params);
      const total = countRow?.total || 0;

      const eleves = all(`
        SELECT e.id, e.nom, e.prenom, e.date_naissance, e.sexe,
               e.classe_id, e.nom_parent, e.telephone_parent, e.date_inscription,
               c.nom_classe, c.niveau_v2,
               MAX(s.moyenne_generale) as moyenne_generale
        FROM eleves e
        LEFT JOIN classes c ON c.id = e.classe_id
        LEFT JOIN stats_eleves s ON s.eleve_id = e.id AND s.annee_scolaire_id = e.annee_scolaire_id
        ${where}
        GROUP BY e.id
        ORDER BY e.nom, e.prenom
        LIMIT ? OFFSET ?
      `, [...params, lNum, offset]);
      
      // Note : On prend la moyenne générale du dernier trimestre/séquence disponible ou on peut adapter
      // Si on veut la moyenne générale calculée via trigger, elle est dans n'importe quelle ligne de stats_eleves pour cet élève/année.
      // On peut simplifier le JOIN pour prendre la première trouvée.
      
      return { eleves, pagination: { total, page: pNum, limit: lNum, pages: Math.ceil(total / lNum) } };
    } catch (error) {
      logger.error('Erreur getElevesPagines:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:getEleveDetail', async (event, eleveId) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const id = parseInt(eleveId);
      if (isNaN(id) || id < 1) return { error: 'ID élève invalide' };

      const anneeId = getCurrentAnneeId();
      const eleve = get(
        `SELECT e.*, c.nom_classe, c.niveau_v2 FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id WHERE e.id = ?`,
        [id]
      );
      if (!eleve) return { error: 'Élève non trouvé' };

      const notes = all(
        `SELECT n.*, m.nom_matiere, m.coefficient FROM notes n LEFT JOIN matieres m ON m.id = n.matiere_id
         WHERE n.eleve_id = ? AND n.annee_scolaire_id = ? ORDER BY n.date_import DESC`,
        [id, anneeId]
      );
      const absences = all(
        'SELECT * FROM absences WHERE eleve_id = ? ORDER BY date DESC LIMIT 10',
        [id]
      );
      const sanctions = all(
        'SELECT * FROM sanctions WHERE eleve_id = ? ORDER BY date DESC LIMIT 10',
        [id]
      );
      return { eleve, notes, absences, sanctions };
    } catch (error) {
      logger.error('Erreur getEleveDetail:', error);
      return { error: error.message };
    }
  });

  // ── CRUD élèves ─────────────────────────────────────────────────────────────

  ipcMain.handle('db:addEleve', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.nom || !data.prenom) return { success: false, error: 'Nom et prénom requis' };
      const anneeId = getCurrentAnneeId();
      const result = run(
        `INSERT INTO eleves (nom, prenom, date_naissance, sexe, classe_id, nom_parent, telephone_parent, email_parent, annee_scolaire_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.nom.trim(), data.prenom.trim(), data.date_naissance, data.sexe || 'M', parseInt(data.classe_id) || null,
         data.nom_parent ? data.nom_parent.trim() : null, data.telephone_parent ? data.telephone_parent.trim() : null, 
         data.email_parent ? data.email_parent.trim() : null, anneeId]
      );
      const eleveId = result.lastID;

      // Synchronisation parent automatique
      if (data.telephone_parent) {
        await syncParentEleve(eleveId, data.nom_parent, data.telephone_parent, logger);
      }

      try {
        const tranchesResult = genererTranchesPourEleve(eleveId, anneeId, logger);
        if (tranchesResult.success && tranchesResult.nbGeneres > 0) {
          logger.info(`Élève ID ${eleveId} — ${tranchesResult.nbGeneres} tranche(s) finance générée(s) automatiquement.`);
        }
      } catch (trancheErr) {
        logger.error(`Erreur génération tranches auto pour élève ID ${eleveId}:`, trancheErr);
      }

      await logAudit(getCurrentUserId(), 'ADD_ELEVE', `Ajout élève : ${data.nom} ${data.prenom} (ID: ${eleveId})`);
      return { success: true, id: eleveId };
    } catch (error) {
      logger.error('Erreur addEleve:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:updateEleve', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(id);
      if (isNaN(eid) || eid < 1) return { error: 'ID élève invalide' };

      run(
        `UPDATE eleves SET nom=?, prenom=?, date_naissance=?, sexe=?, classe_id=?, nom_parent=?, telephone_parent=?, email_parent=? WHERE id=?`,
        [data.nom.trim(), data.prenom.trim(), data.date_naissance, data.sexe || null, parseInt(data.classe_id) || null,
         data.nom_parent ? data.nom_parent.trim() : null, data.telephone_parent ? data.telephone_parent.trim() : null, 
         data.email_parent ? data.email_parent.trim() : null, eid]
      );

      // Synchronisation parent automatique
      await syncParentEleve(eid, data.nom_parent, data.telephone_parent, logger);

      await logAudit(getCurrentUserId(), 'UPDATE_ELEVE', `Mise à jour élève ID ${eid}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur updateEleve:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:deleteEleve', async (event, id) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(id);
      if (isNaN(eid) || eid < 1) return { error: 'ID élève invalide' };
      run('DELETE FROM eleves WHERE id=?', [eid]);
      await logAudit(getCurrentUserId(), 'DELETE_ELEVE', `Suppression élève ID ${eid}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur deleteEleve:', error);
      return { error: error.message };
    }
  });

  // ── Notes ───────────────────────────────────────────────────────────────────

  ipcMain.handle('db:saveNotes', async (event, { notes, matiere_id, classe_id, periode, sequence, utilisateur_id, ua, sous_competence_code, type_eval }) => {
    if (!(await checkAccess(['admin', 'enseignant', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!Array.isArray(notes) || !notes.length) return { success: false, error: 'Aucune note à enregistrer' };
      const cid = parseInt(classe_id);
      if (isNaN(cid) || !periode) return { success: false, error: 'Paramètres manquants' };
      
      const anneeId = getCurrentAnneeId();
      const isQual = ua ? true : false;
      const seq = isQual ? null : sequence;
      const mid = isQual ? null : parseInt(matiere_id);
      
      if (!isQual && (isNaN(mid) || !seq)) return { success: false, error: 'Paramètres manquants (matiere_id ou sequence)' };

      let nbSauvegardes = 0;
      for (const n of notes) {
        const { eleve_id, note } = n;
        const eid = parseInt(eleve_id);
        if (isNaN(eid)) continue;
        const noteVal = parseFloat(note);
        if (isNaN(noteVal) || noteVal < 0 || noteVal > 20) continue;

        if (isQual) {
          const existing = get(
            `SELECT id FROM notes WHERE eleve_id = ? AND periode = ? AND ua = ? AND sous_competence_code IS ? AND annee_scolaire_id = ?`,
            [eid, periode, ua, sous_competence_code || null, anneeId]
          );
          if (existing) {
            run('UPDATE notes SET note = ?, date_import = CURRENT_TIMESTAMP WHERE id = ?', [noteVal, existing.id]);
          } else {
            run(
              `INSERT INTO notes (eleve_id, note, periode, annee_scolaire_id, ua, sous_competence_code, type_eval)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [eid, noteVal, periode, anneeId, ua, sous_competence_code || null, type_eval || 'TI']
            );
          }
        } else {
          run(
            `INSERT INTO notes (eleve_id, matiere_id, note, periode, sequence, annee_scolaire_id) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(eleve_id, matiere_id, periode, sequence, annee_scolaire_id) DO UPDATE SET note = excluded.note, date_import = CURRENT_TIMESTAMP`,
            [eid, mid, noteVal, periode, seq, anneeId]
          );
        }
        nbSauvegardes++;
      }
      await logAudit(
        getCurrentUserId(),
        'SAVE_NOTES',
        isQual
          ? `Classe ${cid} · UA ${ua} · ${periode} · ${nbSauvegardes} note(s) qualitative(s)`
          : `Classe ${cid} · Matière ${mid} · ${periode} Séq.${sequence} · ${nbSauvegardes} note(s)`
      );
      return { success: true, nbSauvegardes };
    } catch (error) {
      logger.error('Erreur saveNotes:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('db:getNotesByClasse', async (event, classeId, matiereId = null) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const cid = parseInt(classeId);
      const mid = parseInt(matiereId);
      if (isNaN(cid)) return { error: 'ID classe manquant ou invalide' };
      const anneeId = getCurrentAnneeId();
      let sql = `
        SELECT n.id, n.eleve_id, n.matiere_id, n.note, n.periode, n.sequence,
               n.ua, n.sous_competence_code, n.type_eval, n.sous_type,
               e.nom, e.prenom, m.nom_matiere
        FROM notes n
        JOIN eleves e ON e.id = n.eleve_id
        LEFT JOIN matieres m ON m.id = n.matiere_id
        WHERE e.classe_id = ? AND n.annee_scolaire_id = ?
      `;
      const params = [cid, anneeId];
      if (!isNaN(mid)) { sql += ' AND n.matiere_id = ?'; params.push(mid); }
      sql += ' ORDER BY COALESCE(n.ua, m.nom_matiere), e.nom, e.prenom, n.periode';
      return all(sql, params);
    } catch (error) {
      logger.error('Erreur getNotesByClasse:', error);
      return { error: error.message };
    }
  });

  // ── Statistiques ────────────────────────────────────────────────────────────

  ipcMain.handle('db:getDashboardStats', async (event, classeId, periode, sequence) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const cacheKey = `${anneeId}-${classeId}-${periode}-${sequence}`;
      const cached = checkDashboardCache(cacheKey);
      if (cached) return cached;

      const cid = parseInt(classeId);
      const seqNum = parseInt(sequence);
      const params = [anneeId];
      let whereNotes = 'n.annee_scolaire_id = ?';

      if (!isNaN(cid) && cid > 0) { whereNotes += ' AND e.classe_id = ?'; params.push(cid); }
      if (periode && periode !== 'Tous') { whereNotes += ' AND n.periode = ?'; params.push(periode); }
      if (!isNaN(seqNum) && seqNum > 0) { whereNotes += ' AND n.sequence = ?'; params.push(seqNum); }

      const whereClause = ' WHERE ' + whereNotes;

      // Détecter si la classe sélectionnée est N1/N2 (qualitatif)
      let isN1N2 = false;
      if (!isNaN(cid) && cid > 0) {
        const niveauRow = get('SELECT niveau_v2 FROM classes WHERE id = ?', [cid]);
        isN1N2 = niveauRow && (niveauRow.niveau_v2 === 'N1' || niveauRow.niveau_v2 === 'N2');
      }

      let moyenne = 0, nbEleves = 0, top5 = [], alertes = [], parMatiere = [];

      if (isN1N2) {
        // N1/N2 : Filtrer les UA qui correspondent au trimestre sélectionné
        // On ne prend que les lignes agrégées (sous_type IS NULL), pas les sous-types
        let n1n2Where = whereClause + ' AND n.sous_type IS NULL';
        const n1n2Params = [...params];
        if (periode && periode !== 'Tous') {
          const uas = getUAsForPeriode(periode);
          if (uas.length) {
            n1n2Where += ' AND n.ua IN (' + uas.map(_ => '?').join(',') + ')';
            n1n2Params.push(...uas);
          }
        }
        const studentAverages = all(`
          SELECT e.id, e.nom, e.prenom, ROUND(AVG(n.note), 2) as moyenne
          FROM notes n JOIN eleves e ON e.id = n.eleve_id
          ${n1n2Where}
          GROUP BY e.id
        `, n1n2Params);

        nbEleves = studentAverages.length;
        moyenne = nbEleves > 0
          ? parseFloat((studentAverages.reduce((s, r) => s + (r.moyenne || 0), 0) / nbEleves).toFixed(2))
          : 0;

        top5 = [...studentAverages].sort((a, b) => (b.moyenne || 0) - (a.moyenne || 0)).slice(0, 5);
        alertes = studentAverages.filter(s => (s.moyenne || 0) < 5).sort((a, b) => (a.moyenne || 0) - (b.moyenne || 0)).slice(0, 5);

        let uaFilter = '';
        const uaParams = [...params];
        if (periode && periode !== 'Tous') {
          const uas = getUAsForPeriode(periode);
          if (uas.length) {
            uaFilter = ' AND n.ua IN (' + uas.map(_ => '?').join(',') + ')';
            uaParams.push(...uas);
          }
        }
        parMatiere = all(
          `SELECT n.ua as nom_matiere, 1 as coefficient, ROUND(AVG(n.note), 2) as moyenne
           FROM notes n JOIN eleves e ON e.id = n.eleve_id
           ${whereClause} AND n.ua IS NOT NULL AND n.sous_type IS NULL${uaFilter}
           GROUP BY n.ua ORDER BY n.ua`,
          uaParams
        );
      } else {
        // N3 ou vue globale : utilise stats_eleves et matières classiques
        const stats = get(`
          SELECT 
            (SELECT ROUND(AVG(s.moyenne), 2) FROM stats_eleves s JOIN eleves e ON s.eleve_id = e.id ${whereClause.replace(/n\./g, 's.')}) as moyenne,
            (SELECT COUNT(*) FROM eleves e WHERE e.annee_scolaire_id = ? ${!isNaN(cid) && cid > 0 ? 'AND e.classe_id = ?' : ''}) as nb_eleves
        `, !isNaN(cid) && cid > 0 ? [...params, anneeId, cid] : [...params, anneeId]);

        moyenne = stats?.moyenne || 0;
        nbEleves = stats?.nb_eleves || 0;

        top5 = all(
          `SELECT e.id, e.nom, e.prenom, s.moyenne
           FROM eleves e JOIN stats_eleves s ON s.eleve_id = e.id
           ${whereClause.replace(/n\./g, 's.')} ORDER BY s.moyenne DESC LIMIT 5`,
          params
        );
        alertes = all(
          `SELECT e.id, e.nom, e.prenom, s.moyenne
           FROM eleves e JOIN stats_eleves s ON s.eleve_id = e.id
           ${whereClause.replace(/n\./g, 's.')} AND s.moyenne < 10 ORDER BY s.moyenne ASC LIMIT 5`,
          params
        );

        parMatiere = all(
          `SELECT m.nom_matiere, m.coefficient, ROUND(AVG(n.note), 2) as moyenne
           FROM notes n JOIN matieres m ON m.id = n.matiere_id JOIN eleves e ON e.id = n.eleve_id
           ${whereClause} GROUP BY m.id ORDER BY m.nom_matiere`,
          params
        );
      }

      // --- Statistiques par sexe ---

      let sexeWhere = 'annee_scolaire_id = ?';
      const sexeParams = [anneeId];
      if (!isNaN(cid) && cid > 0) { sexeWhere += ' AND classe_id = ?'; sexeParams.push(cid); }

      const statsSexe = get(`
        SELECT 
          COALESCE(SUM(CASE WHEN sexe = 'M' THEN 1 ELSE 0 END), 0) as garcons,
          COALESCE(SUM(CASE WHEN sexe = 'F' THEN 1 ELSE 0 END), 0) as filles
        FROM eleves 
        WHERE ${sexeWhere}
      `, sexeParams);

      // --- NOUVEAU : Statistiques d'absences ---
      let absWhere = 'ha.annee_scolaire_id = ?';
      const absParams = [anneeId];
      if (!isNaN(cid) && cid > 0) { absWhere += ' AND e.classe_id = ?'; absParams.push(cid); }
      if (periode && periode !== 'Tous') { absWhere += ' AND ha.periode = ?'; absParams.push(periode); }

      const topAbsences = all(
        `SELECT e.id, e.nom, e.prenom, SUM(ha.heures) as total_heures
         FROM eleves e
         JOIN heures_absence ha ON e.id = ha.eleve_id
         WHERE ${absWhere}
         GROUP BY e.id
         ORDER BY total_heures DESC
         LIMIT 5`,
        absParams
      );

      const topAssidusParams = [anneeId];
      if (periode && periode !== 'Tous') { topAssidusParams.push(periode); }
      topAssidusParams.push(anneeId);
      if (!isNaN(cid) && cid > 0) { topAssidusParams.push(cid); }

      const topAssidus = all(
        `SELECT e.id, e.nom, e.prenom, SUM(ha.heures) as total_heures
         FROM eleves e
         LEFT JOIN heures_absence ha ON e.id = ha.eleve_id AND ha.annee_scolaire_id = ? ${periode && periode !== 'Tous' ? 'AND ha.periode = ?' : ''}
         WHERE e.annee_scolaire_id = ? ${!isNaN(cid) && cid > 0 ? 'AND e.classe_id = ?' : ''}
         GROUP BY e.id
         ORDER BY total_heures ASC
         LIMIT 5`,
        topAssidusParams
      );

      const response = {
        moyenne,
        top5,
        alertes,
        parMatiere,
        nbEleves,
        statsSexe: {
          garcons: statsSexe?.garcons || 0,
          filles: statsSexe?.filles || 0
        },
        absences: {
          top: topAbsences,
          assidus: topAssidus
        }
      };
      
      dashboardCache.set(cacheKey, response);
      logger.info('Stats Dashboard (Recalculé):', JSON.stringify(response.statsSexe));
      return response;
    } catch (error) {
      logger.error('Erreur getDashboardStats:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:getEvolutionStats', async (event, classeId) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const cacheKey = `evolution-${anneeId}-${classeId}`;
      const cached = checkDashboardCache(cacheKey);
      if (cached) return cached;

      const cid = parseInt(classeId);

      // Détecter N1/N2
      let isN1N2 = false;
      if (!isNaN(cid) && cid > 0) {
        const niveauRow = get('SELECT niveau_v2 FROM classes WHERE id = ?', [cid]);
        isN1N2 = niveauRow && (niveauRow.niveau_v2 === 'N1' || niveauRow.niveau_v2 === 'N2');
      }

      let rows;
      if (isN1N2) {
        // N1/N2 : évolution par trimestre (moyenne de toutes les UA du trimestre)
        rows = all(`
          SELECT n.periode, NULL as ua, ROUND(AVG(n.note), 2) AS moyenne
          FROM notes n JOIN eleves e ON e.id = n.eleve_id
          WHERE n.annee_scolaire_id = ? ${!isNaN(cid) && cid > 0 ? 'AND e.classe_id = ?' : ''}
          AND n.ua IS NOT NULL AND n.sous_type IS NULL
          GROUP BY n.periode ORDER BY
            CASE n.periode
              WHEN 'Trimestre 1' THEN 1
              WHEN 'Trimestre 2' THEN 2
              WHEN 'Trimestre 3' THEN 3
              ELSE 4
            END
        `, !isNaN(cid) && cid > 0 ? [anneeId, cid] : [anneeId]);
      } else {
        // N3 / global : évolution par (periode, sequence)
        let whereClause = ' WHERE s.annee_scolaire_id = ?';
        if (!isNaN(cid) && cid > 0) { whereClause += ' AND e.classe_id = ?'; }
        rows = all(
          `SELECT s.periode, s.sequence,
                  ROUND(AVG(s.moyenne), 2) AS moyenne
           FROM stats_eleves s JOIN eleves e ON e.id = s.eleve_id
           ${whereClause}
           GROUP BY s.periode, s.sequence ORDER BY s.periode, s.sequence`,
          !isNaN(cid) && cid > 0 ? [anneeId, cid] : [anneeId]
        );
      }
      
      dashboardCache.set(cacheKey, rows);
      return rows;
    } catch (error) {
      logger.error('Erreur getEvolutionStats:', error);
      return { error: error.message };
    }
  });

  // ── Groupes matières (stubs) ─────────────────────────────────────────────────

  ipcMain.handle('db:getGroupesMatieres', async () => { 
    if (!getCurrentUserId()) return [];
    return []; 
  });
  ipcMain.handle('db:saveGroupesMatieres', async () => { 
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Accès non autorisé' };
    return { success: true }; 
  });
}

module.exports = { register };

