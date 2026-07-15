/**
 * modeleAbsences.js — Génère un fichier Excel modèle pour l'import des absences
 * Version synchrone pour better-sqlite3
 */

const ExcelJS = require('exceljs');
const { get, all } = require('../database/db');
const { getDocTranslator } = require('./pdf/locales');

/**
 * exportModeleAbsences — génère un fichier Excel modèle pour l'import des absences
 * @param {number} classeId
 * @param {string} outputPath
 * @param {string} periode - Facultatif (ex: "Trimestre 1")
 * @param {string} lang
 * @returns {Promise<Object>}
 */
async function exportModeleAbsences(classeId, outputPath, periode = 'all', lang = 'fr') {
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
  const sheetName = lang === 'en' ? `Absences_Model_${classe.nom_classe}` : `Modele_absences_${classe.nom_classe}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  const isSinglePeriode = periode && periode !== 'all';

  // En-tête
  if (isSinglePeriode) {
    sheet.addRow([t('col_name'), t('col_firstname'), `${t('model_hours')} (${periode})`]);
  } else {
    sheet.addRow([t('col_name'), t('col_firstname'), `${t('quarter')} 1`, `${t('quarter')} 2`, `${t('quarter')} 3`]);
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
    if (isSinglePeriode) {
      sheet.addRow([eleve.nom, eleve.prenom, '']);
    } else {
      sheet.addRow([eleve.nom, eleve.prenom, '', '', '']);
    }
  });

  // Ajuster les largeurs
  if (isSinglePeriode) {
    sheet.columns = [
      { width: 25 }, { width: 20 }, { width: 15 }
    ];
  } else {
    sheet.columns = [
      { width: 25 }, { width: 20 }, { width: 12 }, { width: 12 }, { width: 12 }
    ];
  }

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nbEleves: eleves.length };
}

module.exports = { exportModeleAbsences };
