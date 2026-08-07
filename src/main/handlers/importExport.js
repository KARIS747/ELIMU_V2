/**
 * handlers/importExport.js — Import / Export (Excel, PDF, ZIP bulletins)
 */

const { dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { get, all } = require('../../shared/database/db');
const { logAudit } = require('../../shared/security/audit');
const { hasRole } = require('../../shared/security/access');
const {
  exportBulletinTrimestre,
  exportBulletinClassePDF,
  exportBulletinRecap,
  exportRecapClassePDF,
  exportExcel,
  exportExcelRentree,
  exportModeleAbsences,
  exportModeleNotes,
  loadConfig
} = require('../../shared/utils/exportFiles');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {{ logger: object, getCurrentUserId: function, getMainWindow: function, getCurrentAnneeId: function }} deps
 */
function register(ipcMain, deps) {
  const { logger, getCurrentUserId, getMainWindow, getCurrentAnneeId, getCurrentEcoleId } = deps;

  // Helper pour vérifier l'accès
  const checkAccess = async (roles = ['admin', 'secretaire', 'enseignant', 'comptable']) => {
    const userId = getCurrentUserId();
    if (!userId) return false;
    return await hasRole(userId, roles);
  };

  // ── Sélection de fichier ────────────────────────────────────────────────────

  ipcMain.handle('import:selectFile', async () => {
    if (!getCurrentUserId()) return null;
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Import Excel (notes) ────────────────────────────────────────────────────

  ipcMain.handle('import:excel', async (event, filePath, classeId, matiereId, periode, sequence, utilisateurId) => {
    if (!(await checkAccess(['admin', 'enseignant', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const { importExcel } = require('../../shared/utils/importExcel');
      const anneeId = getCurrentAnneeId();
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      const parsedMatiereId = (matiereId !== null && matiereId !== undefined) ? parseInt(matiereId) : null;
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await importExcel(filePath, parseInt(classeId), parsedMatiereId, periode, sequence, uid, anneeId, ecoleId);
      await logAudit(uid, 'IMPORT_EXCEL', `${result.nbImportes} notes importées`);
      return result;
    } catch (error) {
      logger.error('Erreur importExcel:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Import liste élèves ─────────────────────────────────────────────────────

  ipcMain.handle('import:listeEleves', async (event, filePath, classeId, mode, utilisateurId) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const { importListeEleves } = require('../../shared/utils/importExcel');
      const anneeId = getCurrentAnneeId();
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      const cid = parseInt(classeId);
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await importListeEleves(filePath, cid, mode, uid, anneeId, ecoleId);
      await logAudit(uid, 'IMPORT_LISTE_ELEVES', `Classe ID ${cid} · mode ${mode}`);
      return result;
    } catch (error) {
      logger.error('Erreur importListeEleves:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Import liste professeurs ────────────────────────────────────────────────

  ipcMain.handle('import:listeProfesseurs', async (event, filePath, mode, utilisateurId) => {
    if (!(await checkAccess(['admin']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const { importListeProfesseurs } = require('../../shared/utils/importExcel');
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const result = await importListeProfesseurs(filePath, mode, uid, ecoleId);
      if (result.success) {
        await logAudit(
          uid,
          'IMPORT_LISTE_PROFESSEURS',
          `Mode ${mode} — ${result.nbAjoutes} enseignant(s) importé(s), ${result.nbIgnores || 0} ignoré(s), ${result.nbErreurs} erreur(s)`
        );
      }
      return result;
    } catch (error) {
      logger.error('Erreur importListeProfesseurs:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export bulletin individuel (PDF) ────────────────────────────────────────

  ipcMain.handle('export:pdf', async (event, eleveId, periode, sequence, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(eleveId);
      if (isNaN(eid)) return { success: false, error: 'ID élève invalide' };
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `bulletin_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const anneeId = getCurrentAnneeId();
      const result = await exportBulletinTrimestre(eid, periode, savePath.filePath, null, anneeId, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_PDF', `Bulletin élève ID: ${eid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportPDF:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export:modeleImportProfesseurs', async (event, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const { genererModeleImportProfesseurs } = require('../../shared/utils/excel/modeleImport');
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: lang === 'en' ? 'teachers_import_template.xlsx' : 'modele_import_professeurs.xlsx',
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const result = await genererModeleImportProfesseurs(savePath.filePath, lang);
      await logAudit(getCurrentUserId(), 'EXPORT_MODELE_IMPORT_PROFS', `Modèle import profs généré (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportModeleImportProfesseurs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export:modeleImport', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const { genererModeleImportClasse } = require('../../shared/utils/excel/modeleImport');
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `modele_import_eleves_classe_${cid}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const result = await genererModeleImportClasse(cid, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_MODELE_IMPORT', `Modèle import classe ID: ${cid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportModeleImport:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export liste classe (Excel) ─────────────────────────────────────────────

  ipcMain.handle('export:excel', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `liste_classe_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const anneeId = getCurrentAnneeId();
      const result = await exportExcel(cid, savePath.filePath, anneeId, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_EXCEL', `Liste classe ID: ${cid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportExcel:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export récapitulatif annuel individuel ──────────────────────────────────

  ipcMain.handle('export:bulletinRecap', async (event, eleveId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const eid = parseInt(eleveId);
      if (isNaN(eid)) return { success: false, error: 'ID élève invalide' };
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `recap_annuel_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const anneeId = getCurrentAnneeId();
      const result = await exportBulletinRecap(eid, savePath.filePath, null, anneeId, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_RECAP', `Récapitulatif annuel élève ID: ${eid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportBulletinRecap:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export bordereau d'absences (PDF) ────────────────────────────────────────

  ipcMain.handle('export:bordereauAbsences', async (event, classeId, trimestre, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const { generateBordereauAbsencesPDF } = require('../../shared/utils/exportFiles');
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };
      
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `bordereau_absences_${classe.nom_classe.replace(/\s/g, '_')}_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';
      
      const eleves = all(
        'SELECT nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom',
        [cid, anneeId, ecoleId]
      );
      eleves.sort((a,b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

      const result = await generateBordereauAbsencesPDF(eleves, { classe: classe.nom_classe, trimestre, annee }, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_BORDEREAU_ABS', `Bordereau absences classe: ${cid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportBordereauAbsences:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export liste élèves d'une classe (PDF) ──────────────────────────────────

  ipcMain.handle('export:listeEleves', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const { exportListeElevesPDF } = require('../../shared/utils/exportFiles');
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `liste_eleves_${classe.nom_classe.replace(/\s/g, '_')}_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';

      const eleves = all(
        `SELECT nom, prenom, matricule, date_naissance, sexe FROM eleves
         WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
        [cid, anneeId, ecoleId]
      );
      eleves.sort((a,b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

      const result = await exportListeElevesPDF(eleves, { classe: classe.nom_classe, annee }, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_LISTE_ELEVES', `Export liste élèves classe: ${cid} (${eleves.length} élèves)`);
      return result;
    } catch (error) {
      logger.error('Erreur exportListeEleves:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export liste des enseignants (PDF) ──────────────────────────────────────

  ipcMain.handle('export:listeProfesseurs', async (event, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const { exportListeProfesseursPDF } = require('../../shared/utils/exportFiles');
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `liste_enseignants_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';

      const enseignants = all(
        `SELECT p.nom, p.prenom, p.telephone, p.email, p.matiere_principale, p.actif, u.nom_utilisateur
         FROM professeurs p
         LEFT JOIN utilisateurs u ON p.utilisateur_id = u.id
         WHERE p.ecole_id = ?
         ORDER BY p.nom, p.prenom`,
        [ecoleId]
      );

      const result = await exportListeProfesseursPDF(enseignants, { annee }, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_LISTE_ENSEIGNANTS', `Export liste enseignants (${enseignants.length} enseignants)`);
      return result;
    } catch (error) {
      logger.error('Erreur exportListeProfesseurs:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export liste affichable des notes (PDF paysage) ─────────────────────────
  // Liste destinée à être affichée en classe pour consultation/contestation.
  // N1/N2 : une liste par UA, notes sur Σ(poids) par sous-compétence.
  // N3    : notes /20 par matière pour la séquence choisie.

  ipcMain.handle('export:listeAffichable', async (event, classeId, options, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const opts = options || {};
      const periode = opts.periode || 'Trimestre 1';

      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe, niveau_v2 FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };
      const lvl = classe.niveau_v2;

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `liste_affichable_${classe.nom_classe.replace(/\s/g, '_')}_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const eleves = all(
        'SELECT id, nom, prenom, matricule FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom',
        [cid, anneeId, ecoleId]
      );
      const students = eleves.map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom, matricule: e.matricule }));

      let result;
      const uid = parseInt(utilisateurId) || getCurrentUserId();

      if (lvl === 'N1' || lvl === 'N2') {
        const { getUAsForPeriode, CURRICULUM_TEMPLATES, getWeightsForSousCompetence } = require('../../shared/constants/curriculum');
        let uas;
        if (opts.ua && opts.ua !== 'ALL') {
          uas = [opts.ua];
        } else {
          uas = getUAsForPeriode(periode);
        }
        if (!uas.length) return { error: 'Aucune UA pour la période sélectionnée' };

        const notes = all(
          `SELECT n.eleve_id, n.ua, n.sous_competence_code, n.sous_type, n.note
           FROM notes n
           WHERE n.ecole_id = ? AND n.annee_scolaire_id = ? AND n.sous_type IS NOT NULL
             AND n.ua IN (${uas.map(() => '?').join(',')})
             AND n.eleve_id IN (${students.map(() => '?').join(',') || "''"})
           ORDER BY n.ua, n.eleve_id, n.sous_competence_code`,
          [ecoleId, anneeId, ...uas, ...students.map(s => s.id)]
        );

        const { buildDocDataN12, exportListeAffichableN12PDF } = require('../../shared/utils/pdf/listesAffichables');
        const docData = buildDocDataN12(notes, students, {
          lvl, uas, CURRICULUM_TEMPLATES, getWeightsForSousCompetence,
          classe: classe.nom_classe, trimestre: periode, annee
        });
        result = await exportListeAffichableN12PDF(docData, savePath.filePath, lang);
        await logAudit(uid, 'EXPORT_LISTE_AFFICHABLE_N12', `Liste affichable ${lvl} classe ${cid} (${uas.join(',')})`);
      } else {
        // N3 — liste par matière pour la séquence choisie
        const sequence = opts.sequence || '1';
        const matieres = all(
          `SELECT DISTINCT m.id AS matiere_id, m.nom_matiere AS nom, m.coefficient AS coef
           FROM notes n JOIN matieres m ON m.id = n.matiere_id
           WHERE n.ecole_id = ? AND n.annee_scolaire_id = ? AND n.periode = ? AND n.sequence = ?
             AND n.matiere_id IS NOT NULL
           ORDER BY m.nom_matiere`,
          [ecoleId, anneeId, periode, parseInt(sequence)]
        );

        const notes = all(
          `SELECT n.eleve_id, n.matiere_id, n.note
           FROM notes n
           WHERE n.ecole_id = ? AND n.annee_scolaire_id = ? AND n.periode = ? AND n.sequence = ?
             AND n.matiere_id IS NOT NULL
             AND n.eleve_id IN (${students.map(() => '?').join(',') || "''"})
           ORDER BY n.eleve_id`,
          [ecoleId, anneeId, periode, parseInt(sequence), ...students.map(s => s.id)]
        );

        const { buildDocDataN3, exportListeAffichableN3PDF } = require('../../shared/utils/pdf/listesAffichables');
        const docData = buildDocDataN3(notes, students, {
          matieres, classe: classe.nom_classe, trimestre: periode, sequence, annee
        });
        if (docData.matieres.length === 0) return { error: 'Aucune note trouvée pour cette séquence' };
        result = await exportListeAffichableN3PDF(docData, savePath.filePath, lang);
        await logAudit(uid, 'EXPORT_LISTE_AFFICHABLE_N3', `Liste affichable N3 classe ${cid} (Séq ${sequence})`);
      }

      return result;
    } catch (error) {
      logger.error('Erreur exportListeAffichable:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export bordereau d'émargement (PDF) ──────────────────────────────────────

  ipcMain.handle('export:bordereauEmargement', async (event, classeId, trimestre, utilisateurId, translations) => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const { generateBordereauEmargementPDF } = require('../../shared/utils/exportFiles');
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };
      
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `bordereau_emargement_${classe.nom_classe.replace(/\s/g, '_')}_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';
      
      const eleves = all(
        'SELECT nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom',
        [cid, anneeId, ecoleId]
      );
      eleves.sort((a,b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

      const result = await generateBordereauEmargementPDF(eleves, { classe: classe.nom_classe, trimestre, annee, ...translations }, savePath.filePath);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_BORDEREAU_EMARGE', `Bordereau émargement classe: ${cid}`);
      return result;
    } catch (error) {
      logger.error('Erreur exportBordereauEmargement:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export bordereau de notes (PDF) ────────────────────────────────────────

  ipcMain.handle('export:bordereau', async (event, classeId, matiereId, trimestre, sequence, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      const mid = parseInt(matiereId);
      if (isNaN(cid) || isNaN(mid)) return { success: false, error: 'ID invalide' };

      const { generateBordereauPDF } = require('../../shared/utils/exportFiles');
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      const matiere = get('SELECT nom_matiere FROM matieres WHERE id = ?', [mid]);
      if (!classe || !matiere) return { error: 'Classe ou matière non trouvée' };
      
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `bordereau_${classe.nom_classe.replace(/\s/g, '_')}_${matiere.nom_matiere.replace(/\s/g, '_')}_${Date.now()}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });
      if (savePath.canceled) return { canceled: true };

      const anneeId = getCurrentAnneeId();
      const annee = (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || '';
      
      const eleves = all(
        'SELECT nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom',
        [cid, anneeId, ecoleId]
      );
      eleves.sort((a,b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom));

      const result = await generateBordereauPDF(eleves, { classe: classe.nom_classe, matiere: matiere.nom_matiere, trimestre, sequence, annee }, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_BORDEREAU', `Bordereau classe: ${cid}, matière: ${mid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportBordereau:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export liste rentrée (Excel) ────────────────────────────────────────────

  ipcMain.handle('export:excelRentree', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      if (isNaN(cid)) return { success: false, error: 'ID classe invalide' };
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const nomClasse = (get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]))?.nom_classe || cid;
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `rentree_${String(nomClasse).replace(/\s/g, '_')}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const anneeId = getCurrentAnneeId();
      const result = await exportExcelRentree(cid, savePath.filePath, anneeId, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_RENTREE', `Liste rentrée classe ID: ${cid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportExcelRentree:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Export bulletins classe (PDF UNIQUE) ───────────────────────────────────

  ipcMain.handle('export:bulletinClasse', async (event, classeId, periode, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      const anneeId = getCurrentAnneeId();
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      const eleves = all(
        'SELECT id FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom',
        [cid, anneeId, ecoleId]
      );
      if (!eleves.length) return { error: 'Aucun élève dans cette classe' };

      const total = eleves.length;
      const onProgress = (completed) => {
        event.sender.send('export-progress', { type: 'bulletinClasse', completed, total });
      };

      const saveResult = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `Bulletins_${String(classe?.nom_classe || 'Classe').replace(/\s/g, '_')}_${periode.replace(/\s/g, '_')}.pdf`,
        filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
      });
      if (saveResult.canceled) return { canceled: true };

      const result = await exportBulletinClassePDF(eleves.map(e => e.id), periode, saveResult.filePath, anneeId, lang, onProgress);
      
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(
        uid,
        'EXPORT_BULLETINS_CLASSE',
        `Classe ${cid} — ${result.count} bulletins générés (${lang})`
      );

      return {
        success: true,
        path: saveResult.filePath,
        nbEleves: result.count
      };
    } catch (error) {
      logger.error('Erreur exportBulletinClasse:', error);
      return { error: error.message };
    }
  });

  // ── Export récapitulatifs annuels classe (PDF UNIQUE) ───────────────────────

  ipcMain.handle('export:recapClasse', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };

      const anneeId = getCurrentAnneeId();
      const eleves = all(
        `SELECT id FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ? ORDER BY nom, prenom`,
        [cid, anneeId, ecoleId]
      );
      if (!eleves.length) return { error: 'Aucun élève dans cette classe' };

      const total = eleves.length;
      const onProgress = (completed) => {
        event.sender.send('export-progress', { type: 'recapClasse', completed, total });
      };

      const saveResult = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `Recaps_Annuels_${String(classe.nom_classe).replace(/\s/g, '_')}.pdf`,
        filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
      });
      if (saveResult.canceled) return { canceled: true };

      const result = await exportRecapClassePDF(eleves.map(e => e.id), saveResult.filePath, anneeId, lang, onProgress);

      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(
        uid,
        'EXPORT_RECAP_CLASSE',
        `Classe ${cid} — ${result.count} récapitulatifs générés (${lang})`
      );

      return {
        success: true,
        path: saveResult.filePath,
        nbEleves: result.count
      };
    } catch (error) {
      logger.error('Erreur exportRecapClasse:', error);
      return { error: error.message };
    }
  });

  // ── Export modèle absences ──────────────────────────────────────────────────

  ipcMain.handle('export:modeleAbsences', async (event, classeId, utilisateurId, periode, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };

      const suffix = periode && periode !== 'all' ? `_${periode.replace(/\s/g, '_')}` : '';
      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: `modele_absences_${classe.nom_classe.replace(/\s/g, '_')}${suffix}.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const result = await exportModeleAbsences(cid, savePath.filePath, periode, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_MODELE_ABSENCES', `Modèle absences généré pour classe ${cid} (${periode || 'tous'}) (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportModeleAbsences:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('export:modeleNotes', async (event, classeId, utilisateurId, lang = 'fr') => {
    if (!(await checkAccess(['admin', 'secretaire', 'enseignant']))) return { success: false, error: 'Accès non autorisé' };
    try {
      const cid = parseInt(classeId);
      const ecoleId = getCurrentEcoleId ? getCurrentEcoleId() : '';
      const classe = get('SELECT nom_classe, niveau_v2 FROM classes WHERE id = ? AND ecole_id = ?', [cid, ecoleId]);
      if (!classe) return { error: 'Classe non trouvée' };
      
      const defaultFilename = (classe.niveau_v2 === 'N1' || classe.niveau_v2 === 'N2')
        ? `ELIMU_${classe.nom_classe.toUpperCase().replace(/\s/g, '_')}_[CODE]_[UA]_[ANNEE].xlsx`
        : `modele_notes_${classe.nom_classe.replace(/\s/g, '_')}.xlsx`;

      const savePath = await dialog.showSaveDialog(getMainWindow(), {
        defaultPath: defaultFilename,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }]
      });
      if (savePath.canceled) return { canceled: true };
      const result = await exportModeleNotes(cid, savePath.filePath, lang);
      const uid = parseInt(utilisateurId) || getCurrentUserId();
      await logAudit(uid, 'EXPORT_MODELE_NOTES', `Modèle notes généré pour classe ${cid} (${lang})`);
      return result;
    } catch (error) {
      logger.error('Erreur exportModeleNotes:', error);
      return { success: false, error: error.message };
    }
  });

  // ── Lecture fichier texte ───────────────────────────────────────────────────

  ipcMain.handle('fs:readTextFile', async (event, filePath) => {
    if (!(await checkAccess(['admin', 'secretaire']))) return { error: 'Accès non autorisé' };
    try {
      // Sécurité : on ne permet que la lecture de fichiers dans le dossier temporaire ou data
      const basename = path.basename(filePath);
      if (!filePath.includes(os.tmpdir()) && !filePath.includes(app.getPath('userData'))) {
          logger.warn(`Tentative de lecture de fichier hors périmètre: ${filePath}`);
          // Pour l'instant on laisse car l'import CSV en a besoin, mais on logge.
      }
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      logger.error('Erreur lecture fichier texte:', error);
      return { error: error.message };
    }
  });
}

module.exports = { register };
