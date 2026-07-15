/**
 * modeleNotes.js — Génère un fichier Excel modèle pour l'import des notes
 */

const ExcelJS = require('exceljs');
const { get, all } = require('../database/db');
const { getDocTranslator } = require('./pdf/locales');
const { CURRICULUM_TEMPLATES } = require('../constants/curriculum');

/**
 * exportModeleNotes — génère un fichier Excel modèle pour l'import des notes
 * 
 * Format B (N1/N2) : ELIMU_{CLASSE}_{ANNEE}.xlsx
 * Colonnes : Nom et Prénom | Sous-Comp. | UA | Orale/sur X | Écrite/sur X | Pratique/sur X | Savoir-être/sur X
 * Les en-têtes de note incluent le max MINEDUB (ex: Orale/20, Écrite/15)
 * 
 * Format classique (N3) : modèle simple Nom + Prénom + Note
 */
async function exportModeleNotes(classeId, outputPath, lang = 'fr') {
  const t = getDocTranslator(lang);
  const classe = get('SELECT * FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { success: false, error: 'Classe non trouvée' };

  const eleves = all(`
    SELECT nom, prenom FROM eleves
    WHERE classe_id = ? AND annee_scolaire_id = (SELECT id FROM annees_scolaires WHERE active = 1 LIMIT 1)
    ORDER BY nom, prenom
  `, [classeId]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elimu';
  workbook.created = new Date();

  const isV2 = (classe.niveau_v2 === 'N1' || classe.niveau_v2 === 'N2');

  if (isV2) {
    const lvl = classe.niveau_v2;
    // 1 feuille par compétence
    const competences = CURRICULUM_TEMPLATES[lvl]?.competences || {};
    for (const [compCode, comp] of Object.entries(competences)) {
      const sheetName = `${compCode} - ${(comp.nom || compCode).substring(0, 25)}`;
      const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

      // En-tête : on détermine les colonnes max à partir de la 1ère sous-comp
      sheet.addRow([
        t('col_fullname') || 'Nom et Prénom',
        'Sous-Comp.',
        'UA',
        'Orale',
        'Écrite',
        'Pratique',
        'Savoir-être'
      ]);

      // Ligne d'info : max pour chaque sous-compétence
      const headerRow = sheet.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
        cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      headerRow.height = 25;

      // Lignes élèves
      for (const eleve of eleves) {
        for (const [sousCode, sc] of Object.entries(comp.sousCompetences)) {
          const maxStr = `/${sc.orale || 0} | /${sc.ecrite || 0} | /${sc.pratique || 0} | /${sc.savoirEtre || 0}`;
          sheet.addRow([
            `${eleve.nom} ${eleve.prenom}`,
            sousCode,
            '',
            '', '', '', ''
          ]);
        }
      }

      // Petit rappel des max sur la 2e ligne (commentaire)
      if (sheet.rowCount > 1) {
        const infoRow = sheet.getRow(2);
        infoRow.getCell(2).note = 'Code sous-compétence (ex: 1A, 2B)';
        infoRow.getCell(3).note = 'UA1 à UA8';
      }

      sheet.columns = [
        { width: 28 }, { width: 12 }, { width: 8 },
        { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }
      ];
    }
  } else {
    const sheet = workbook.addWorksheet(`Modele_notes_${classe.nom_classe}`.substring(0, 31));
    sheet.addRow([t('col_name'), t('col_firstname'), t('model_note')]);

    const headerRow = sheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
      cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    headerRow.height = 25;

    eleves.forEach(eleve => {
      sheet.addRow([eleve.nom, eleve.prenom, '']);
    });

    sheet.columns = [{ width: 25 }, { width: 20 }, { width: 15 }];
  }

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nbEleves: eleves.length };
}

module.exports = { exportModeleNotes };
