/**
 * handlers/absences.js — Absences, sanctions & heures d'absence
 */

const { run, get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');

const PERIODES_OK = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getCurrentAnneeId, getCurrentEcoleId } = deps;

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin', 'enseignant', 'secretaire']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Absences & sanctions ────────────────────────────────────────────────────

  ipcMain.handle('db:addAbsence', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.eleve_id || !data.date) return { success: false, error: 'Données manquantes' };
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = run(
        'INSERT INTO absences (eleve_id, date, justifie, motif, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?)',
        [parseInt(data.eleve_id), data.date, data.justifie ? 1 : 0, data.motif || '', anneeId, ecoleId]
      );
      return { success: true, id: result.lastID };
    } catch (error) {
      logger.error('Erreur addAbsence:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:addSanction', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      if (!data.eleve_id || !data.type || !data.date) return { success: false, error: 'Données manquantes' };
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = run(
        'INSERT INTO sanctions (eleve_id, type, date, description, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?)',
        [parseInt(data.eleve_id), data.type, data.date, data.description || '', anneeId, ecoleId]
      );
      return { success: true, id: result.lastID };
    } catch (error) {
      logger.error('Erreur addSanction:', error);
      return { error: error.message };
    }
  });

  // ── Heures d'absence ────────────────────────────────────────────────────────

  ipcMain.handle('db:getHeuresAbsence', async (event, eleveId) => {
    if (!getCurrentUserId()) return { error: 'Non authentifié' };
    try {
      const id = parseInt(eleveId);
      if (isNaN(id) || id < 1) return { error: 'ID élève invalide' };
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const rows = all(
        `SELECT periode, heures FROM heures_absence WHERE eleve_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY periode`,
        [id, anneeId, ecoleId]
      );
      const result = { 'Trimestre 1': 0, 'Trimestre 2': 0, 'Trimestre 3': 0 };
      rows.forEach(r => { result[r.periode] = r.heures; });
      return result;
    } catch (error) {
      logger.error('Erreur getHeuresAbsence:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('db:saveHeuresAbsence', async (event, { eleve_id, periode, heures }) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(eleve_id);
      if (isNaN(eid) || eid < 1) return { error: 'ID élève invalide' };
      if (!PERIODES_OK.includes(periode)) return { error: 'Trimestre invalide' };
      const h = parseFloat(heures);
      if (isNaN(h) || h < 0 || h > 9999) return { error: 'Heures invalides (0–9999)' };
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      run(
        `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
        [eid, periode, h, anneeId, ecoleId]
      );
      await logAudit(
        getCurrentUserId(),
        'SAVE_HEURES_ABSENCE',
        `Élève ID ${eid} — ${periode} : ${h}h d'absence`
      );
      return { success: true };
    } catch (error) {
      logger.error('Erreur saveHeuresAbsence:', error);
      return { error: error.message };
    }
  });

  // ── Import CSV absences ──────────────────────────────────────────────────────

  ipcMain.handle('db:importAbsencesCSV', async (event, { classeId, csvContent }) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid) || cid < 1) return { error: 'ID classe invalide' };
      if (!csvContent || typeof csvContent !== 'string') return { error: 'Contenu CSV vide ou invalide' };

      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const elevesClasse = all(
        `SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
        [cid, anneeId, ecoleId]
      );
      if (!elevesClasse.length) return { error: 'Aucun élève dans cette classe' };

      const lignes = csvContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (!lignes.length) return { error: 'Fichier CSV vide' };

      const sep = lignes[0].includes(';') ? ';' : ',';
      const enTete = lignes[0].toLowerCase();
      const startIdx = (enTete.includes('nom') || enTete.includes('prenom') || enTete.includes('élève')) ? 1 : 0;
      const cols = lignes[0].split(sep).map(c => c.trim().toLowerCase());
      const isFormatB = cols.some(c => c.includes('trim') || c.includes('period'));

      let nbMisAJour = 0, nbErreurs = 0, erreurs = [];

      const normaliser = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      const trouverEleve = (nomCsv, prenomCsv) => {
        const nN = normaliser(nomCsv), nP = normaliser(prenomCsv);
        return elevesClasse.find(e => normaliser(e.nom) === nN && normaliser(e.prenom) === nP);
      };
      const upsert = async (eleveId, periode, heures) => {
        const h = parseFloat(heures);
        if (isNaN(h) || h < 0) return false;
        run(
          `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
          [eleveId, periode, h, anneeId, ecoleId]
        );
        return true;
      };

      for (let i = startIdx; i < lignes.length; i++) {
        const parts = lignes[i].split(sep).map(p => p.trim());
        if (parts.length < 3) { nbErreurs++; continue; }
        const [nom, prenom, ...reste] = parts;
        const eleve = trouverEleve(nom, prenom);
        if (!eleve) {
          nbErreurs++;
          erreurs.push(`Ligne ${i + 1} : "${nom} ${prenom}" non trouvé dans la classe`);
          continue;
        }
        try {
          if (isFormatB) {
            const [periodeRaw, heuresRaw] = reste;
            let periode = null;
            const p = normaliser(periodeRaw);
            if (p.includes('1') || p === 't1') periode = 'Trimestre 1';
            else if (p.includes('2') || p === 't2') periode = 'Trimestre 2';
            else if (p.includes('3') || p === 't3') periode = 'Trimestre 3';
            if (!periode) {
              nbErreurs++;
              erreurs.push(`Ligne ${i + 1} : période "${periodeRaw}" non reconnue`);
              continue;
            }
            const ok = await upsert(eleve.id, periode, heuresRaw);
            if (ok) nbMisAJour++; else nbErreurs++;
          } else {
            const [h1, h2, h3] = reste;
            let updated = 0;
            if (h1 !== undefined && h1 !== '') { if (await upsert(eleve.id, 'Trimestre 1', h1)) updated++; }
            if (h2 !== undefined && h2 !== '') { if (await upsert(eleve.id, 'Trimestre 2', h2)) updated++; }
            if (h3 !== undefined && h3 !== '') { if (await upsert(eleve.id, 'Trimestre 3', h3)) updated++; }
            if (updated > 0) nbMisAJour++; else nbErreurs++;
          }
        } catch (err) {
          nbErreurs++;
          erreurs.push(`Ligne ${i + 1} : ${err.message}`);
          logger.error('Erreur importAbsencesCSV (ligne):', err);
        }
      }

      await logAudit(
        getCurrentUserId(),
        'IMPORT_ABSENCES_CSV',
        `Classe ID ${cid} — ${nbMisAJour} élève(s) mis à jour, ${nbErreurs} erreur(s)`
      );
      return { success: true, nbMisAJour, nbErreurs, erreurs: erreurs.slice(0, 10) };
    } catch (error) {
      logger.error('Erreur importAbsencesCSV:', error);
      return { error: error.message };
    }
  });

  // ── Import Excel absences ───────────────────────────────────────────────────

  ipcMain.handle('db:importAbsencesExcel', async (event, { classeId, filePath, periode }) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const { importAbsencesExcel } = require('../../shared/utils/importExcel');
      const cid = parseInt(classeId);
      const anneeId = getCurrentAnneeId();
      const uid = getCurrentUserId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      
      const result = await importAbsencesExcel(filePath, cid, uid, anneeId, periode, ecoleId);
      
      if (result.success) {
        await logAudit(
          uid,
          'IMPORT_ABSENCES_EXCEL',
          `Classe ID ${cid} — ${result.nbMisAJour} élève(s) mis à jour, ${result.nbErreurs} erreur(s) (Période: ${periode || 'auto'})`
        );
      }
      return result;
    } catch (error) {
      logger.error('Erreur importAbsencesExcel:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Règles absences (stubs) ─────────────────────────────────────────────────

  ipcMain.handle('db:getReglesAbsences', async () => {
    if (!getCurrentUserId()) return [];
    return [];
  });
  ipcMain.handle('db:saveReglesAbsences', async (event, regles) => {
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Accès non autorisé' };
    return { success: true };
  });
}

module.exports = { register };
