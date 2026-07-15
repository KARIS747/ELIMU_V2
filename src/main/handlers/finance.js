/**
 * handlers/finance.js — Gestion financière (frais, tranches, paiements, reçus)
 */

const { dialog } = require('electron');

const { run, get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { majStatutsTransches, genererNumeroRecu } = require('../utils/financeUtils');
const { genererRecuPDF } = require('../../shared/utils/recuPDF');
const { exportImpayesPDF } = require('../../shared/utils/pdf/exportImpayes');
const { isSystemTampered } = require('../utils/integrity');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getMainWindow: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getMainWindow, getCurrentAnneeId } = deps;

  const { hasRole } = require('../../shared/security/access');
  const { getLocalDateString } = require('../../shared/utils/dateUtils');

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin', 'comptable']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Statistiques globales ───────────────────────────────────────────────────

  ipcMain.handle('finance:getStats', async () => {
    if (!(await checkAccess()) || isSystemTampered()) return { error: 'Accès non autorisé' };
    try {
      const anneeId = getCurrentAnneeId();
      majStatutsTransches();
      const du       = get(`SELECT COALESCE(SUM(montant), 0) AS total FROM tranches WHERE annee_scolaire_id = ?`, [anneeId]) || {};
      const encaisse = get(`SELECT COALESCE(SUM(montant), 0) AS total FROM paiements WHERE annee_scolaire_id = ?`, [anneeId]) || {};
      const impayes  = get(`SELECT COALESCE(SUM(montant), 0) AS total FROM tranches WHERE annee_scolaire_id = ? AND statut != 'paye'`, [anneeId]) || {};
      return {
        total_du:       du.total       || 0,
        total_encaisse: encaisse.total || 0,
        total_impayes:  impayes.total  || 0
      };
    } catch (e) {
      logger.error('Erreur finance:getStats:', e);
      return { error: e.message };
    }
  });

  // ── Types de frais ──────────────────────────────────────────────────────────

  ipcMain.handle('finance:getFraisTypes', async () => {
    if (!(await checkAccess())) return [];
    try {
      const anneeId = getCurrentAnneeId();
      return all(`SELECT * FROM frais_types WHERE annee_scolaire_id = ? ORDER BY actif DESC, nom`, [anneeId]);
    } catch (e) {
      logger.error('Erreur finance:getFraisTypes:', e);
      return [];
    }
  });

  ipcMain.handle('finance:addFraisType', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const anneeId = getCurrentAnneeId();
      const r = run(
        `INSERT INTO frais_types
           (nom, montant_par_tranche, nombre_tranches, periodicite_mois, date_premiere_echeance, destinataire, actif, annee_scolaire_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.nom, data.montant_par_tranche, data.nombre_tranches,
          data.periodicite_mois, data.date_premiere_echeance,
          data.destinataire || 'etablissement', data.actif ?? 1, anneeId
        ]
      );
      return { success: true, id: r.lastID };
    } catch (e) {
      logger.error('Erreur finance:addFraisType:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finance:updateFraisType', async (event, id, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const fid = parseInt(id);
      if (isNaN(fid)) return { success: false, error: 'ID invalide' };
      run(
        `UPDATE frais_types SET nom=?, montant_par_tranche=?, nombre_tranches=?,
           periodicite_mois=?, date_premiere_echeance=?, destinataire=?, actif=?
         WHERE id=?`,
        [
          data.nom, data.montant_par_tranche, data.nombre_tranches,
          data.periodicite_mois, data.date_premiere_echeance,
          data.destinataire, data.actif ?? 1, fid
        ]
      );
      return { success: true };
    } catch (e) {
      logger.error('Erreur finance:updateFraisType:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finance:deleteFraisType', async (event, id) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const fid = parseInt(id);
      if (isNaN(fid)) return { success: false, error: 'ID invalide' };
      const paiements = get(
        `SELECT COUNT(*) AS nb FROM paiement_tranches pt
         JOIN tranches t ON t.id = pt.tranche_id WHERE t.frais_type_id = ?`,
        [fid]
      );
      if (paiements?.nb > 0) {
        return { success: false, error: 'Des paiements sont liés à ce type de frais' };
      }
      run(`DELETE FROM frais_types WHERE id = ?`, [fid]);
      return { success: true };
    } catch (e) {
      logger.error('Erreur finance:deleteFraisType:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Génération de tranches ──────────────────────────────────────────────────

  ipcMain.handle('finance:genererTranches', async (event, { frais_type_id, cible, id_cible }) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const fid = parseInt(frais_type_id);
      const anneeId = getCurrentAnneeId();
      const ft = get(`SELECT * FROM frais_types WHERE id = ?`, [fid]);
      if (!ft) return { success: false, error: 'Type de frais introuvable' };

      let eleves;
      const targetId = parseInt(id_cible);
      if (cible === 'eleve' && !isNaN(targetId))       eleves = all(`SELECT id FROM eleves WHERE id = ?`, [targetId]);
      else if (cible === 'classe' && !isNaN(targetId))  eleves = all(`SELECT id FROM eleves WHERE classe_id = ?`, [targetId]);
      else                                              eleves = all(`SELECT id FROM eleves WHERE annee_scolaire_id = ?`, [anneeId]);

      let nbGeneres = 0;
      const dateDebut = new Date(ft.date_premiere_echeance);
      for (const eleve of eleves) {
        let date = new Date(dateDebut);
        for (let t = 1; t <= ft.nombre_tranches; t++) {
          try {
            run(
              `INSERT OR IGNORE INTO tranches
                 (frais_type_id, eleve_id, numero_tranche, montant, date_echeance, statut, annee_scolaire_id)
               VALUES (?, ?, ?, ?, ?, 'en_attente', ?)`,
              [fid, eleve.id, t, ft.montant_par_tranche, getLocalDateString(date), anneeId]
            );
            nbGeneres++;
          } catch (err) {
            // Ignorer les doublons (UNIQUE constraint)
          }
          date.setMonth(date.getMonth() + ft.periodicite_mois);
        }
      }
      await logAudit(getCurrentUserId(), 'FINANCE_GEN_TRANCHES', `Génération tranches pour ${cible} ID ${id_cible}`);
      return { success: true, nbGeneres };
    } catch (e) {
      logger.error('Erreur finance:genererTranches:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Consultation des tranches ───────────────────────────────────────────────

  ipcMain.handle('finance:getTranches', async (event, filtres = {}) => {
    if (!(await checkAccess())) return { tranches: [], total: 0, error: 'Accès non autorisé' };
    try {
      const anneeId = getCurrentAnneeId();
      if (!anneeId) return { tranches: [], total: 0, error: 'Aucune année scolaire active' };

      majStatutsTransches();
      const { classeId, statut, search, numero_tranche, frais_type_id, page = 1, limit = 30 } = filtres;
      let where = ' WHERE t.annee_scolaire_id = ?';
      const params = [anneeId];
      
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) { where += ' AND e.classe_id = ?'; params.push(cid); }
      if (statut) { where += ' AND t.statut = ?'; params.push(statut); }
      const nTranche = parseInt(numero_tranche);
      if (!isNaN(nTranche)) { where += ' AND t.numero_tranche = ?'; params.push(nTranche); }
      const ftid = parseInt(frais_type_id);
      if (!isNaN(ftid)) { where += ' AND t.frais_type_id = ?'; params.push(ftid); }
      
      if (search && search.trim()) {
        where += ' AND (e.nom LIKE ? OR e.prenom LIKE ?)';
        const q = `%${search.trim()}%`;
        params.push(q, q);
      }
      const countSql = `
        SELECT COUNT(*) as total
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        ${where}
      `;
      const totalRow = get(countSql, params);
      const total = totalRow?.total || 0;
      
      const pNum = parseInt(page) || 1;
      const lNum = parseInt(limit) || 30;
      const offset = (pNum - 1) * lNum;
      
      const dataSql = `
        SELECT t.*, ft.nom AS nom_frais, e.nom, e.prenom, c.nom_classe
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        ${where}
        ORDER BY t.date_echeance, e.nom, e.prenom
        LIMIT ? OFFSET ?
      `;
      const tranches = all(dataSql, [...params, lNum, offset]);
      return { tranches, total, page: pNum, limit: lNum };
    } catch (e) {
      logger.error('Erreur finance:getTranches:', e);
      return { tranches: [], total: 0, error: e.message };
    }
  });

  ipcMain.handle('finance:getTranchesParEleve', async (event, eleveId) => {
    if (!getCurrentUserId()) return [];
    try {
      const eid = parseInt(eleveId);
      if (isNaN(eid)) return [];
      const anneeId = getCurrentAnneeId();
      majStatutsTransches();
      return all(
        `SELECT t.*, ft.nom AS nom_frais FROM tranches t
         JOIN frais_types ft ON ft.id = t.frais_type_id
         WHERE t.eleve_id = ? AND t.annee_scolaire_id = ? ORDER BY t.statut DESC, t.date_echeance`,
        [eid, anneeId]
      );
    } catch (e) {
      logger.error('Erreur finance:getTranchesParEleve:', e);
      return [];
    }
  });

  // ── Paiements ───────────────────────────────────────────────────────────────

  ipcMain.handle('finance:enregistrerPaiement', async (event, data) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const anneeId = getCurrentAnneeId();
      const { eleve_id, montant, date, mode, reference, notes, tranche_ids, utilisateur_id } = data;
      const eid = parseInt(eleve_id);
      if (isNaN(eid)) return { success: false, error: 'ID élève invalide' };

      let totalTranches = 0;
      if (Array.isArray(tranche_ids) && tranche_ids.length) {
        const ids = tranche_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const sumRow = get(
            `SELECT SUM(montant) as total FROM tranches WHERE id IN (${placeholders})`,
            ids
          );
          totalTranches = sumRow?.total || 0;
        }
      }

      const montantFinal = totalTranches > 0 ? totalTranches : parseFloat(montant);
      if (isNaN(montantFinal) || montantFinal <= 0) return { success: false, error: 'Montant invalide' };
      
      const recuNum = genererNumeroRecu();

      const r = run(
        `INSERT INTO paiements
           (eleve_id, montant, date, mode, reference, recu_numero, notes, utilisateur_id, annee_scolaire_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eid, montantFinal, date, mode,
          reference || null, recuNum, notes || null,
          parseInt(utilisateur_id) || getCurrentUserId(), anneeId
        ]
      );
      const paiementId = r.lastID;

      let montantRestant = montantFinal;
      if (Array.isArray(tranche_ids) && tranche_ids.length) {
        for (const trancheId of tranche_ids) {
          const tid = parseInt(trancheId);
          if (isNaN(tid)) continue;
          const tranche = get(`SELECT montant FROM tranches WHERE id = ?`, [tid]);
          if (!tranche || montantRestant <= 0) break;
          const applique = Math.min(tranche.montant, montantRestant);
          run(
            `INSERT OR IGNORE INTO paiement_tranches (paiement_id, tranche_id, montant_applique)
             VALUES (?, ?, ?)`,
            [paiementId, tid, applique]
          );
          if (applique >= tranche.montant) {
            run(`UPDATE tranches SET statut = 'paye' WHERE id = ?`, [tid]);
          }
          montantRestant -= applique;
        }
      }

      await logAudit(
        getCurrentUserId(),
        'FINANCE_PAIEMENT',
        `Paiement ${recuNum} — élève ${eid} — ${montantFinal} FCFA`
      );
      return { success: true, paiement_id: paiementId, recu_numero: recuNum };
    } catch (e) {
      logger.error('Erreur finance:enregistrerPaiement:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('finance:getPaiements', async (event, filtres = {}) => {
    if (!(await checkAccess(['admin', 'comptable', 'secretaire']))) return [];
    try {
      const anneeId = getCurrentAnneeId();
      const { jours, classeId, limit = 50 } = filtres;
      let sql = `
        SELECT p.*, e.nom, e.prenom, c.nom_classe,
               u.nom_complet AS nom_caissier
        FROM paiements p
        JOIN eleves e ON e.id = p.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        LEFT JOIN utilisateurs u ON u.id = p.utilisateur_id
        WHERE p.annee_scolaire_id = ?
      `;
      const params = [anneeId];
      const nJours = parseInt(jours);
      if (!isNaN(nJours) && nJours > 0) {
        sql += ` AND p.date >= date('now', ?)`;
        params.push(`-${nJours} days`);
      }
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) { sql += ' AND e.classe_id = ?'; params.push(cid); }
      
      const lNum = parseInt(limit) || 50;
      sql += ` ORDER BY p.created_at DESC LIMIT ?`;
      params.push(lNum);
      
      return all(sql, params);
    } catch (e) {
      logger.error('Erreur finance:getPaiements:', e);
      return [];
    }
  });

  // ── Impayés ─────────────────────────────────────────────────────────────────

  ipcMain.handle('finance:getImpayes', async (event, filtres = null) => {
    if (!(await checkAccess())) return { impayes: [], total: 0 };
    try {
      const anneeId = getCurrentAnneeId();
      majStatutsTransches();
      let classeId = null, fraisTypeId = null, numeroTranche = null, page = 1, limit = 50;
      
      if (filtres !== null && typeof filtres === 'object' && !Array.isArray(filtres)) {
        classeId     = parseInt(filtres.classeId) || null;
        fraisTypeId  = parseInt(filtres.fraisTypeId) || null;
        numeroTranche = parseInt(filtres.numeroTranche) || null;
        page         = parseInt(filtres.page)  || 1;
        limit        = parseInt(filtres.limit) || 50;
      } else if (filtres !== null) {
        classeId = parseInt(filtres);
      }

      let where = ` WHERE t.statut IN ('en_attente', 'en_retard') AND t.annee_scolaire_id = ?`;
      const params = [anneeId];
      
      if (!isNaN(classeId) && classeId > 0) { where += ' AND e.classe_id = ?'; params.push(classeId); }
      if (!isNaN(fraisTypeId) && fraisTypeId > 0) { where += ' AND t.frais_type_id = ?'; params.push(fraisTypeId); }
      if (!isNaN(numeroTranche) && numeroTranche > 0) { where += ' AND t.numero_tranche = ?'; params.push(numeroTranche); }

      const countSql = `
        SELECT COUNT(*) as total
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        ${where}
      `;
      const totalRow = get(countSql, params);
      const total = totalRow?.total || 0;
      const offset = (page - 1) * limit;

      const dataSql = `
        SELECT t.id, t.numero_tranche, t.montant, t.date_echeance, t.statut,
               ft.nom AS nom_frais,
               e.id AS eleve_id, e.nom, e.prenom, e.nom_parent, e.telephone_parent,
               c.nom_classe
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        ${where}
        ORDER BY t.date_echeance, e.nom
        LIMIT ? OFFSET ?
      `;
      const impayes = all(dataSql, [...params, limit, offset]);
      return { impayes, total, page, limit };
    } catch (e) {
      logger.error('Erreur finance:getImpayes:', e);
      return { impayes: [], total: 0, page: 1, limit: 50 };
    }
  });

  ipcMain.handle('finance:getTopImpayes', async (event, limit = 5) => {
    if (!(await checkAccess())) return [];
    try {
      const anneeId = getCurrentAnneeId();
      const lNum = parseInt(limit) || 5;
      majStatutsTransches();
      return all(
        `SELECT e.id, e.nom, e.prenom, c.nom_classe,
                COUNT(t.id) AS nb_tranches,
                SUM(t.montant) AS total_impaye
         FROM tranches t
         JOIN eleves e ON e.id = t.eleve_id
         LEFT JOIN classes c ON c.id = e.classe_id
         WHERE t.statut IN ('en_attente', 'en_retard') AND t.annee_scolaire_id = ?
         GROUP BY e.id ORDER BY total_impaye DESC LIMIT ?`,
        [anneeId, lNum]
      );
    } catch (e) {
      logger.error('Erreur finance:getTopImpayes:', e);
      return [];
    }
  });

  ipcMain.handle('finance:getEncaissementsParMois', async () => {
    if (!(await checkAccess())) return [];
    try {
      const anneeId = getCurrentAnneeId();
      return all(
        `SELECT strftime('%m/%Y', date) AS mois, SUM(montant) AS total
         FROM paiements
         WHERE date >= date('now', '-12 months') AND annee_scolaire_id = ?
         GROUP BY strftime('%Y-%m', date)
         ORDER BY strftime('%Y-%m', date)`,
        [anneeId]
      );
    } catch (e) {
      logger.error('Erreur finance:getEncaissementsParMois:', e);
      return [];
    }
  });

  // ── Reçu PDF ────────────────────────────────────────────────────────────────

  ipcMain.handle('finance:getRecuPDF', async (event, paiementId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'comptable', 'secretaire']))) return { error: 'Accès non autorisé' };
    try {
      const pid = parseInt(paiementId);
      if (isNaN(pid)) return { error: 'ID paiement invalide' };
      const paiement = get(`SELECT recu_numero FROM paiements WHERE id = ?`, [pid]);
      if (!paiement) return { error: 'Paiement introuvable' };
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `recu_${paiement.recu_numero || pid}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };
      return await genererRecuPDF(pid, savePath.filePath, lang);
    } catch (e) {
      logger.error('Erreur finance:getRecuPDF:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Export impayés (Excel) ──────────────────────────────────────────────────

  ipcMain.handle('finance:exportImpayes', async (event, classeId = null, lang = 'fr') => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: 'impayes_finance.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      majStatutsTransches();

      let sql = `
        SELECT e.nom, e.prenom, c.nom_classe, e.nom_parent, e.telephone_parent,
               ft.nom AS nom_frais, t.numero_tranche, t.montant, t.date_echeance, t.statut
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        WHERE t.statut IN ('en_attente', 'en_retard') AND t.annee_scolaire_id = ?
      `;
      const params = [anneeId];
      const cid = parseInt(classeId);
      if (!isNaN(cid) && cid > 0) { sql += ' AND e.classe_id = ?'; params.push(cid); }
      sql += ' ORDER BY e.nom, e.prenom, t.date_echeance';
      const impayes = all(sql, params);

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Impayés');

      const { getDocTranslator } = require('../../shared/utils/pdf/locales');
      const tDoc = getDocTranslator(lang);
      const locale = lang === 'en' ? 'en-US' : 'fr-FR';

      ws.addRow([`${tDoc('finance_unpaid_title')} — Elimu`]);
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.addRow([`${tDoc('date')} : ${new Date().toLocaleDateString(locale)}`]);
      ws.addRow([]);

      const header = ws.addRow([
        tDoc('col_name'), tDoc('col_firstname'), tDoc('class'), 
        tDoc('parent_label'), 
        tDoc('phone_label'),
        tDoc('subject'), 
        tDoc('tranche'), 
        tDoc('amount') + ' (FCFA)', 
        tDoc('col_due_date'), 
        tDoc('col_status')
      ]);
      header.eachCell(cell => {
        cell.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
        cell.font    = { bold: true, color: { argb: 'FFffffff' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      header.height = 22;

      impayes.forEach(i => {
        const row = ws.addRow([
          i.nom, i.prenom, i.nom_classe || '—', i.nom_parent || '—',
          i.telephone_parent || '—', i.nom_frais,
          `T${i.numero_tranche}`, i.montant,
          new Date(i.date_echeance).toLocaleDateString(locale),
          i.statut === 'en_retard' ? (lang === 'en' ? 'Overdue' : 'En retard') : (lang === 'en' ? 'Pending' : 'En attente')
        ]);
        if (i.statut === 'en_retard') {
          row.getCell(10).font = { bold: true, color: { argb: 'FFff4757' } };
        }
        row.getCell(8).numFmt = '#,##0';
      });

      ws.columns = [
        { width: 18 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 16 },
        { width: 22 }, { width: 10 }, { width: 16 }, { width: 14 }, { width: 14 }
      ];
      await wb.xlsx.writeFile(savePath.filePath);
      return { success: true, nbImpayes: impayes.length, path: savePath.filePath };
    } catch (e) {
      logger.error('Erreur finance:exportImpayes:', e);
      return { success: false, error: e.message };
    }
  });

  // ── Export impayés (PDF) ────────────────────────────────────────────────────

  ipcMain.handle('finance:exportImpayesPDF', async (event, filtres = {}) => {
    if (!(await checkAccess())) return { success: false, error: 'Accès non autorisé' };
    try {
      const { classeId, fraisTypeId, numeroTranche, lang = 'fr' } = filtres;
      const anneeId = getCurrentAnneeId();
      
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `impayes_${classeId ? 'classe_' + classeId : 'etablissement'}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const result = await exportImpayesPDF(savePath.filePath, { 
        classeId: parseInt(classeId) || null, 
        fraisTypeId: parseInt(fraisTypeId) || null,
        numeroTranche: parseInt(numeroTranche) || null,
        anneeId,
        lang
      });
      
      await logAudit(
        getCurrentUserId(),
        'EXPORT_IMPAYES_PDF',
        `Export PDF des impayés (Filtres: ${JSON.stringify(filtres)})`
      );
      
      return result;
    } catch (e) {
      logger.error('Erreur finance:exportImpayesPDF:', e);
      return { success: false, error: e.message };
    }
  });
}

module.exports = { register };
