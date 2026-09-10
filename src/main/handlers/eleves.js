/**
 * handlers/eleves.js — Gestion des élèves, notes et statistiques
 */

const { run, get, all, getLastWriteTimestamp } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');
const { genererTranchesPourEleve } = require('../utils/financeUtils');
const { syncParentEleve } = require('../../shared/utils/parentSync');
const { isSystemTampered } = require('../utils/integrity');
const { UA_TRIMESTRE_MAP, getUAsForPeriode, getWeightsForSousCompetence } = require('../../shared/constants/curriculum');

// Cache pour le dashboard
let dashboardCache = new Map();
let lastDashboardInvalidation = 0;

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentAnneeId, getCurrentEcoleId } = deps;

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
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const cid = parseInt(classeId);
      let sql = `
        SELECT e.id, e.nom, e.prenom, e.matricule, e.sexe, e.classe_id, c.nom_classe, c.niveau_v2,
               (SELECT s.moyenne_generale FROM stats_eleves s WHERE s.eleve_id = e.id AND s.annee_scolaire_id = ? LIMIT 1) as moyenne_generale
        FROM eleves e
        LEFT JOIN classes c ON c.id = e.classe_id
        WHERE e.annee_scolaire_id = ? AND e.ecole_id = ?
      `;
      const params = [anneeId, anneeId, ecoleId];
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
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const cid = parseInt(classeId);
      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 50;
      const offset = (Math.max(1, pNum) - 1) * lNum;

      const params = [anneeId, ecoleId];
      let where = 'WHERE e.annee_scolaire_id = ? AND e.ecole_id = ?';
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
        SELECT e.id, e.nom, e.prenom, e.matricule, e.date_naissance, e.sexe,
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
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const eleve = get(
        `SELECT e.*, c.nom_classe, c.niveau_v2 FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id WHERE e.id = ? AND e.ecole_id = ?`,
        [id, ecoleId]
      );
      if (!eleve) return { error: 'Élève non trouvé' };

      const notes = all(
        `SELECT n.*, m.nom_matiere, m.coefficient FROM notes n LEFT JOIN matieres m ON m.id = n.matiere_id
         WHERE n.eleve_id = ? AND n.annee_scolaire_id = ? AND n.ecole_id = ? ORDER BY n.date_import DESC`,
        [id, anneeId, ecoleId]
      );
      const absences = all(
        'SELECT * FROM absences WHERE eleve_id = ? AND ecole_id = ? ORDER BY date DESC LIMIT 10',
        [id, ecoleId]
      );
      const sanctions = all(
        'SELECT * FROM sanctions WHERE eleve_id = ? AND ecole_id = ? ORDER BY date DESC LIMIT 10',
        [id, ecoleId]
      );
      return { eleve, notes, absences, sanctions };
    } catch (error) {
      logger.error('Erreur getEleveDetail:', error);
      return { error: error.message };
    }
  });

  // ── CRUD élèves ─────────────────────────────────────────────────────────────

  // Valide la classe (obligatoire) et l'unicité du matricule (par école+année).
  // Retourne { ok:true, classeId, matricule } ou { ok:false, error }.
  const validerEleve = (data, ecoleId, anneeId, eleveIdExclu = null) => {
    const cid = parseInt(data.classe_id);
    if (isNaN(cid)) return { ok: false, error: 'Veuillez sélectionner une classe pour l\u2019élève.' };
    const classe = get(`SELECT id FROM classes WHERE id = ? AND ecole_id = ?`, [cid, ecoleId]);
    if (!classe) return { ok: false, error: 'La classe sélectionnée est introuvable.' };
    const mat = data.matricule ? String(data.matricule).trim() : null;
    const matricule = mat || null;
    if (matricule) {
      const doublon = get(
        `SELECT id FROM eleves WHERE matricule = ? COLLATE NOCASE AND ecole_id = ?
           AND ((annee_scolaire_id = ?) OR (annee_scolaire_id IS NULL AND ? IS NULL))
           ${eleveIdExclu ? 'AND id != ?' : ''} LIMIT 1`,
        eleveIdExclu ? [matricule, ecoleId, anneeId, anneeId, eleveIdExclu] : [matricule, ecoleId, anneeId, anneeId]
      );
      if (doublon) return { ok: false, error: `Le matricule « ${matricule} » est déjà attribué à un autre élève.` };
    }
    return { ok: true, classeId: cid, matricule };
  };

  const messageErreurContrainte = (message) => {
    if (message && message.includes('UNIQUE constraint failed') && message.includes('matricule'))
      return 'Ce matricule est déjà attribué à un autre élève.';
    return message;
  };

  ipcMain.handle('db:addEleve', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.nom || !data.prenom) return { success: false, error: 'Nom et prénom requis' };
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const validation = validerEleve(data, ecoleId, anneeId);
      if (!validation.ok) return { success: false, error: validation.error };
      const result = run(
        `INSERT INTO eleves (nom, prenom, matricule, date_naissance, sexe, classe_id, nom_parent, telephone_parent, email_parent, annee_scolaire_id, ecole_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.nom.trim(), data.prenom.trim(), validation.matricule, data.date_naissance, data.sexe || 'M', validation.classeId,
         data.nom_parent ? data.nom_parent.trim() : null, data.telephone_parent ? data.telephone_parent.trim() : null,
         data.email_parent ? data.email_parent.trim() : null, anneeId, ecoleId]
      );
      const eleveId = result.lastID;

      // Synchronisation parent automatique
      if (data.telephone_parent) {
        await syncParentEleve(eleveId, data.nom_parent, data.telephone_parent, logger, ecoleId);
      }

      try {
        const tranchesResult = genererTranchesPourEleve(eleveId, anneeId, logger, ecoleId);
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
      return { error: messageErreurContrainte(error.message) };
    }
  });

  ipcMain.handle('db:updateEleve', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(id);
      if (isNaN(eid) || eid < 1) return { error: 'ID élève invalide' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const anneeId = getCurrentAnneeId();
      const validation = validerEleve(data, ecoleId, anneeId, eid);
      if (!validation.ok) return { success: false, error: validation.error };

      run(
        `UPDATE eleves SET nom=?, prenom=?, matricule=?, date_naissance=?, sexe=?, classe_id=?, nom_parent=?, telephone_parent=?, email_parent=? WHERE id=? AND ecole_id=?`,
        [data.nom.trim(), data.prenom.trim(), validation.matricule, data.date_naissance, data.sexe || null, validation.classeId,
         data.nom_parent ? data.nom_parent.trim() : null, data.telephone_parent ? data.telephone_parent.trim() : null,
         data.email_parent ? data.email_parent.trim() : null, eid, ecoleId]
      );

      // Synchronisation parent automatique
      await syncParentEleve(eid, data.nom_parent, data.telephone_parent, logger, ecoleId);

      await logAudit(getCurrentUserId(), 'UPDATE_ELEVE', `Mise à jour élève ID ${eid}`);
      return { success: true };
    } catch (error) {
      logger.error('Erreur updateEleve:', error);
      return { error: messageErreurContrainte(error.message) };
    }
  });

  ipcMain.handle('db:deleteEleve', async (event, id) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(id);
      if (isNaN(eid) || eid < 1) return { error: 'ID élève invalide' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      run('DELETE FROM eleves WHERE id=? AND ecole_id=?', [eid, ecoleId]);
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
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
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
        if (isNaN(noteVal) || noteVal < 0) continue;
        if (!isQual && noteVal > 20) continue;

        if (isQual) {
          const existing = get(
            `SELECT id FROM notes WHERE eleve_id = ? AND periode = ? AND ua = ? AND sous_competence_code IS ? AND annee_scolaire_id = ? AND ecole_id = ?`,
            [eid, periode, ua, sous_competence_code || null, anneeId, ecoleId]
          );
          if (existing) {
            run('UPDATE notes SET note = ?, date_import = CURRENT_TIMESTAMP WHERE id = ? AND ecole_id = ?', [noteVal, existing.id, ecoleId]);
          } else {
            run(
              `INSERT INTO notes (eleve_id, note, periode, annee_scolaire_id, ua, sous_competence_code, type_eval, ecole_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [eid, noteVal, periode, anneeId, ua, sous_competence_code || null, type_eval || 'TI', ecoleId]
            );
          }
        } else {
          run(
            `INSERT INTO notes (eleve_id, matiere_id, note, periode, sequence, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(eleve_id, matiere_id, periode, sequence, annee_scolaire_id) DO UPDATE SET note = excluded.note, date_import = CURRENT_TIMESTAMP`,
            [eid, mid, noteVal, periode, seq, anneeId, ecoleId]
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
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      let sql = `
        SELECT n.id, n.eleve_id, n.matiere_id, n.note, n.periode, n.sequence,
               n.ua, n.sous_competence_code, n.type_eval, n.sous_type,
               e.nom, e.prenom, m.nom_matiere
        FROM notes n
        JOIN eleves e ON e.id = n.eleve_id
        LEFT JOIN matieres m ON m.id = n.matiere_id
        WHERE e.classe_id = ? AND n.annee_scolaire_id = ? AND n.ecole_id = ?
      `;
      const params = [cid, anneeId, ecoleId];
      if (!isNaN(mid)) { sql += ' AND n.matiere_id = ?'; params.push(mid); }
      sql += ' ORDER BY COALESCE(n.ua, m.nom_matiere), e.nom, e.prenom, n.periode';
      return all(sql, params);
    } catch (error) {
      logger.error('Erreur getNotesByClasse:', error);
      return { error: error.message };
    }
  });

  // ── Statistiques ────────────────────────────────────────────────────────────

  ipcMain.handle('db:getDashboardStats', async (event, classeId, periode, sequence, niveau) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const cacheKey = `${anneeId}-${classeId}-${periode}-${sequence}-${niveau}`;
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

      // ── Déterminer les niveaux à traiter ────────────────────────────────
      let niveauxATraiter = [];
      if (niveau) {
        niveauxATraiter = [niveau];
      } else if (!isNaN(cid) && cid > 0) {
        const nr = get('SELECT niveau_v2 FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
        if (nr) niveauxATraiter.push(nr.niveau_v2);
      }

      const hasN1N2 = niveauxATraiter.some(n => n === 'N1' || n === 'N2');
      const hasN3 = niveauxATraiter.some(n => n === 'N3' || n === 'Autre');

      let moyenne = 0, nbEleves = 0, top5 = [], alertes = [], parMatiere = [];
      let tousEleves = []; // pour fusion N1N2 + N3

      // ── Path N1/N2 : moyennes pondérées par le curriculum MINEDUB ──────
      if (hasN1N2) {
        let n1n2Where = 'WHERE n.annee_scolaire_id = ? AND n.sous_type IS NULL AND n.ecole_id = ?';
        const n1n2Vals = (niveau === 'N1' || niveau === 'N2') ? [niveau] : ['N1', 'N2'];
        n1n2Where += ' AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 IN (' + n1n2Vals.map(_ => '?').join(',') + '))';
        const n1n2Params = [anneeId, ecoleId, ecoleId, ...n1n2Vals];
        if (!isNaN(cid) && cid > 0) { n1n2Where += ' AND e.classe_id = ?'; n1n2Params.push(cid); }
        if (periode && periode !== 'Tous') {
          const uas = getUAsForPeriode(periode);
          n1n2Where += ' AND n.periode = ?'; n1n2Params.push(periode);
          if (uas.length) {
            n1n2Where += ' AND n.ua IN (' + uas.map(_ => '?').join(',') + ')';
            n1n2Params.push(...uas);
          }
        }

        const rawNotes = all(`
          SELECT e.id, e.nom, e.prenom, e.classe_id, n.note, n.sous_competence_code, n.ua
          FROM notes n JOIN eleves e ON e.id = n.eleve_id
          ${n1n2Where}
        `, n1n2Params);

        // Cache des niveaux par classe
        const niveauCache = {};
        const studentMap = {};
        for (const row of rawNotes) {
          if (!studentMap[row.id]) {
            if (!niveauCache[row.classe_id]) {
              const cl = get('SELECT niveau_v2 FROM classes WHERE id = ?', [row.classe_id]);
              niveauCache[row.classe_id] = cl?.niveau_v2 || 'N1';
            }
            studentMap[row.id] = {
              id: row.id, nom: row.nom, prenom: row.prenom,
              totalWeighted: 0, totalPoids: 0,
              niveau: niveauCache[row.classe_id]
            };
          }
          const weights = getWeightsForSousCompetence(studentMap[row.id].niveau, row.sous_competence_code);
          const totalPoids = (weights?.orale || 0) + (weights?.ecrite || 0) + (weights?.pratique || 0) + (weights?.savoirEtre || 0);
          if (totalPoids > 0) {
            studentMap[row.id].totalWeighted += row.note * totalPoids;
            studentMap[row.id].totalPoids += totalPoids;
          }
        }

        const n1n2Students = Object.values(studentMap).map(s => ({
          id: s.id, nom: s.nom, prenom: s.prenom,
          moyenne: s.totalPoids > 0 ? parseFloat((s.totalWeighted / s.totalPoids).toFixed(2)) : 0
        }));

        tousEleves.push(...n1n2Students);

        // Radar N1/N2 : groupé par UA
        let uaFilter = '';
        const uaFilterVals = [];
        if (periode && periode !== 'Tous') {
          const uas = getUAsForPeriode(periode);
          if (uas.length) {
            uaFilter = ' AND n.ua IN (' + uas.map(_ => '?').join(',') + ')';
            uaFilterVals.push(...uas);
          }
        }
        const uaRadar = all(
          `SELECT n.ua, ROUND(AVG(n.note), 2) as moyenne
           FROM notes n JOIN eleves e ON e.id = n.eleve_id
           ${whereClause} AND n.ua IS NOT NULL AND n.sous_type IS NULL AND n.ecole_id = ?${uaFilter}
           GROUP BY n.ua ORDER BY n.ua`,
          [...params, ecoleId, ...uaFilterVals]
        ).map(r => ({ nom_matiere: r.ua, coefficient: 1, moyenne: r.moyenne, niveau: 'N1/N2' }));

        parMatiere.push(...uaRadar);
      }

      // ── Path N3 : stats_eleves pré-calculées ────────────────────────────
      if (hasN3) {
        const n3Params = [...params, ecoleId];
        if (!isNaN(cid) && cid > 0) { n3Params.push(cid); }

        const n3Stats = get(`
          SELECT
            (SELECT ROUND(AVG(s.moyenne), 2) FROM stats_eleves s JOIN eleves e ON s.eleve_id = e.id
             ${whereClause.replace(/n\./g, 's.')} AND e.ecole_id = ? ${!isNaN(cid) && cid > 0 ? 'AND e.classe_id = ?' : ''}) as moyenne,
            (SELECT COUNT(*) FROM eleves e WHERE e.annee_scolaire_id = ? AND e.ecole_id = ?
             ${!isNaN(cid) && cid > 0 ? 'AND e.classe_id = ?' : ''}) as nb_eleves
        `, [...n3Params, anneeId, ecoleId, ...(!isNaN(cid) && cid > 0 ? [cid] : [])]);

        // Per-student averages for merging (N3 students only)
        const n3NiveauVal = (niveau === 'Autre') ? '__CUSTOM__' : 'N3';
        const n3WhereExtra = (niveau === 'Autre')
          ? "AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND (niveau_v2 IS NULL OR niveau_v2 NOT IN ('N1','N2','N3')))"
          : "AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 = ?)";
        const n3ExtraParams = (niveau === 'Autre') ? [ecoleId] : [ecoleId, 'N3'];
        const n3Students = all(
          `SELECT e.id, e.nom, e.prenom, ROUND(AVG(s.moyenne), 2) AS moyenne
           FROM eleves e JOIN stats_eleves s ON s.eleve_id = e.id
           ${whereClause.replace(/n\./g, 's.')} AND e.ecole_id = ?
           ${n3WhereExtra}
           GROUP BY e.id ORDER BY moyenne DESC`,
          [...params, ecoleId, ...n3ExtraParams]
        ).map(s => ({ id: s.id, nom: s.nom, prenom: s.prenom, moyenne: s.moyenne || 0 }));

        tousEleves.push(...n3Students);

        // Radar N3 : par matière
        const matiereRadar = all(
          `SELECT m.nom_matiere, m.coefficient, ROUND(AVG(n.note), 2) as moyenne
           FROM notes n JOIN matieres m ON m.id = n.matiere_id JOIN eleves e ON e.id = n.eleve_id
           ${whereClause} AND n.ecole_id = ? GROUP BY m.id ORDER BY m.nom_matiere`,
          [...params, ecoleId]
        ).map(r => ({ ...r, niveau: 'N3' }));

        parMatiere.push(...matiereRadar);
      }

      // ── Fusion des résultats N1/N2 et N3 ────────────────────────────────
      let nbWhere = 'annee_scolaire_id = ? AND ecole_id = ?';
      const nbParams = [anneeId, ecoleId];
      if (!isNaN(cid) && cid > 0) { nbWhere += ' AND classe_id = ?'; nbParams.push(cid); }
      else if (niveau === 'Autre') { nbWhere += ' AND classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND (niveau_v2 IS NULL OR niveau_v2 NOT IN (\'N1\',\'N2\',\'N3\')))'; nbParams.push(ecoleId); }
      else if (niveau) { nbWhere += ' AND classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 = ?)'; nbParams.push(ecoleId, niveau); }
      const nbRow = get(`SELECT COUNT(*) as count FROM eleves e WHERE ${nbWhere}`, nbParams);
      nbEleves = nbRow?.count || 0;
      const nbAvecNotes = tousEleves.length;
      moyenne = nbAvecNotes > 0
        ? parseFloat((tousEleves.reduce((s, r) => s + (r.moyenne || 0), 0) / nbAvecNotes).toFixed(2))
        : 0;

      top5 = [...tousEleves].sort((a, b) => (b.moyenne || 0) - (a.moyenne || 0)).slice(0, 5);
      alertes = tousEleves.filter(s => (s.moyenne || 0) < 10).sort((a, b) => (a.moyenne || 0) - (b.moyenne || 0)).slice(0, 5);

      // Filtre niveau pour les KPIs (sexe/absences) quand aucune classe spécifique
      const niveauClasseFilter = (tableAlias) => {
        if (!isNaN(cid) && cid > 0) return { sql: ` AND ${tableAlias}.classe_id = ?`, params: [cid] };
        if (niveau === 'Autre') return { sql: ` AND ${tableAlias}.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND (niveau_v2 IS NULL OR niveau_v2 NOT IN ('N1','N2','N3')))`, params: [ecoleId] };
        if (niveau) return { sql: ` AND ${tableAlias}.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 = ?)`, params: [ecoleId, niveau] };
        return { sql: '', params: [] };
      };

      let sexeWhere = 'annee_scolaire_id = ? AND ecole_id = ?';
      const sexeParams = [anneeId, ecoleId];
      const sexeF = niveauClasseFilter('e');
      sexeWhere += sexeF.sql;
      sexeParams.push(...sexeF.params);

      const statsSexe = get(`
        SELECT 
          COALESCE(SUM(CASE WHEN sexe = 'M' THEN 1 ELSE 0 END), 0) as garcons,
          COALESCE(SUM(CASE WHEN sexe = 'F' THEN 1 ELSE 0 END), 0) as filles
        FROM eleves e
        WHERE ${sexeWhere}
      `, sexeParams);

      let absWhere = 'ha.annee_scolaire_id = ? AND ha.ecole_id = ?';
      const absParams = [anneeId, ecoleId];
      const absF = niveauClasseFilter('e');
      absWhere += absF.sql;
      absParams.push(...absF.params);
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

      const assF = niveauClasseFilter('e');
      const topAssidusParams = [anneeId, ecoleId, ...assF.params];
      if (periode && periode !== 'Tous') { topAssidusParams.push(periode); }
      topAssidusParams.push(anneeId, ecoleId);

      const topAssidus = all(
        `SELECT e.id, e.nom, e.prenom, SUM(ha.heures) as total_heures
         FROM eleves e
         LEFT JOIN heures_absence ha ON e.id = ha.eleve_id AND ha.annee_scolaire_id = ? AND ha.ecole_id = ? ${periode && periode !== 'Tous' ? 'AND ha.periode = ?' : ''}
         WHERE e.annee_scolaire_id = ? AND e.ecole_id = ? ${assF.sql}
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
      const errMsg = error?.message || error?.toString() || 'Erreur inconnue';
      logger.error('Erreur getDashboardStats: ' + errMsg);
      console.error('Erreur getDashboardStats détail:', error);
      return { error: errMsg };
    }
  });

  ipcMain.handle('db:getEvolutionStats', async (event, classeId, niveau) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const cacheKey = `evolution-${anneeId}-${classeId}-${niveau}`;
      const cached = checkDashboardCache(cacheKey);
      if (cached) return cached;

      const cid = parseInt(classeId);

      // Déterminer les niveaux
      let niveaux = [];
      if (niveau) {
        niveaux = [niveau];
      } else if (!isNaN(cid) && cid > 0) {
        const nr = get('SELECT niveau_v2 FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
        if (nr) niveaux.push(nr.niveau_v2);
      }

      const hasN1N2 = niveaux.some(n => n === 'N1' || n === 'N2');
      const hasN3 = niveaux.some(n => n === 'N3' || n === 'Autre');

      let rows = [];

      // N1/N2 evolution : by periode (weighted)
      if (hasN1N2) {
        const n1n2Vals = (niveau === 'N1' || niveau === 'N2') ? [niveau] : ['N1', 'N2'];
        const n1n2Params = [anneeId, ecoleId, ecoleId, ...n1n2Vals];
        let n1n2Where = 'n.annee_scolaire_id = ? AND n.ecole_id = ? AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 IN (' + n1n2Vals.map(_ => '?').join(',') + ')) AND n.ua IS NOT NULL AND n.sous_type IS NULL';
        if (!isNaN(cid) && cid > 0) { n1n2Where += ' AND e.classe_id = ?'; n1n2Params.push(cid); }
        // Fetch raw aggregate notes with their sous_competence_code for weighted calc
        const rawNotes = all(`
          SELECT e.classe_id, n.periode, n.note, n.sous_competence_code
          FROM notes n JOIN eleves e ON e.id = n.eleve_id
          WHERE ${n1n2Where}
        `, n1n2Params);

        // Cache niveau par classe
        const niveauCache = {};
        const getNiveau = (classeId) => {
          if (!niveauCache[classeId]) {
            const cl = get('SELECT niveau_v2 FROM classes WHERE id = ?', [classeId]);
            niveauCache[classeId] = cl?.niveau_v2 || 'N1';
          }
          return niveauCache[classeId];
        };

        const periodeTotals = {};
        for (const r of rawNotes) {
          if (!periodeTotals[r.periode]) periodeTotals[r.periode] = { totalWeighted: 0, totalPoids: 0 };
          const weights = getWeightsForSousCompetence(getNiveau(r.classe_id), r.sous_competence_code);
          const totalPoids = (weights?.orale || 0) + (weights?.ecrite || 0) + (weights?.pratique || 0) + (weights?.savoirEtre || 0);
          if (totalPoids > 0) {
            periodeTotals[r.periode].totalWeighted += r.note * totalPoids;
            periodeTotals[r.periode].totalPoids += totalPoids;
          }
        }

        const ordrePeriode = { 'Trimestre 1': 1, 'Trimestre 2': 2, 'Trimestre 3': 3 };
        for (const [periode, vals] of Object.entries(periodeTotals)) {
          rows.push({
            periode,
            sequence: null,
            ua: null,
            moyenne: vals.totalPoids > 0 ? parseFloat((vals.totalWeighted / vals.totalPoids).toFixed(2)) : 0,
            niveau: 'N1/N2'
          });
        }
        rows.sort((a, b) => (ordrePeriode[a.periode] || 99) - (ordrePeriode[b.periode] || 99));
      }

      // N3 evolution : by sequence via stats_eleves
      if (hasN3) {
        let whereClause = ' WHERE s.annee_scolaire_id = ?';
        const whereParams = [anneeId];
        if (!isNaN(cid) && cid > 0) { whereClause += ' AND e.classe_id = ?'; whereParams.push(cid); }
        if (niveau === 'Autre') {
          whereClause += " AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND (niveau_v2 IS NULL OR niveau_v2 NOT IN ('N1','N2','N3')))";
          whereParams.push(ecoleId);
        } else {
          whereClause += ' AND e.classe_id IN (SELECT id FROM classes WHERE ecole_id = ? AND niveau_v2 = ?)';
          whereParams.push(ecoleId, 'N3');
        }
        const n3Rows = all(
          `SELECT s.periode, s.sequence, ROUND(AVG(s.moyenne), 2) AS moyenne
           FROM stats_eleves s JOIN eleves e ON e.id = s.eleve_id AND e.ecole_id = ?
           ${whereClause}
           GROUP BY s.periode, s.sequence ORDER BY s.periode, s.sequence`,
          [ecoleId, ...whereParams]
        ).map(r => ({ ...r, ua: null, niveau: 'N3' }));
        rows.push(...n3Rows);
      }
      
      dashboardCache.set(cacheKey, rows);
      return rows;
    } catch (error) {
      const errMsg = error?.message || error?.toString() || 'Erreur inconnue';
      logger.error('Erreur getEvolutionStats: ' + errMsg);
      console.error('Erreur getEvolutionStats détail:', error);
      return { error: errMsg };
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

