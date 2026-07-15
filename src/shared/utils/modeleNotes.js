/**
 * modeleNotes.js — Génère un fichier Excel modèle pour l'import des notes
 */

const ExcelJS = require('exceljs');
const { get, all } = require('../database/db');
const { getDocTranslator } = require('./pdf/locales');
const { CURRICULUM_TEMPLATES } = require('../constants/curriculum');

/**
 * exportModeleNotes — génère un fichier Excel modèle pour l'import des notes
 * @param {number} classeId
 * @param {string} outputPath
 * @param {string} lang
 * @returns {Promise<Object>}
 */
async function exportModeleNotes(classeId, outputPath, lang = 'fr') {
  const t = getDocTranslator(lang);
  const classe = get('SELECT * FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { success: false, error: 'Classe non trouvée' };

  const eleves = all(`
    SELECT nom, prenom FROM eleves
    WHERE classe_id = ?
    ORDER BY nom, prenom
  `, [classeId]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elimu';
  workbook.created = new Date();
  const sheetName = lang === 'en' ? `Grades_Model_${classe.nom_classe}` : `Modele_notes_${classe.nom_classe}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  const isV2 = (classe.niveau_v2 === 'N1' || classe.niveau_v2 === 'N2');

  // En-tête
  if (isV2) {
    const lvl = classe.niveau_v2;
    sheet.addRow([t('col_name'), t('col_firstname'), `Orale /20`, `Écrite /20`, `Pratique /20`, `Savoir-Être /20`]);
  } else {
    sheet.addRow([t('col_name'), t('col_firstname'), t('model_note')]);
  }

  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
    cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 25;

  // Remplir les lignes
  eleves.forEach(eleve => {
    if (isV2) {
      sheet.addRow([eleve.nom, eleve.prenom, '', '', '', '']);
    } else {
      sheet.addRow([eleve.nom, eleve.prenom, '']);
    }
  });

  // Ajuster les largeurs
  if (isV2) {
    sheet.columns = [
      { width: 25 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 15 }
    ];
  } else {
    sheet.columns = [
      { width: 25 }, { width: 20 }, { width: 15 }
    ];
  }

  // Protection optionnelle de la feuille (optionnel)
  // sheet.protect('password', { selectLockedCells: true });

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nbEleves: eleves.length };
}

module.exports = { exportModeleNotes };
