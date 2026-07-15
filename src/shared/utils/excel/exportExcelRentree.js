/**
 * excel/exportExcelRentree.js — Export liste rentrée au format Excel
 * Version synchrone pour better-sqlite3
 */

const ExcelJS = require('exceljs');
const { get, all } = require('../../database/db');
const { getDocTranslator } = require('../pdf/locales');

async function exportExcelRentree(classeId, outputPath, anneeId, lang = 'fr') {
  const t = getDocTranslator(lang);
  const classe = get('SELECT * FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { success: false, error: 'Classe non trouvée' };

  let sql = `
    SELECT e.nom, e.prenom, e.date_naissance,
           ROUND(SUM(n.note * m.coefficient) / NULLIF(SUM(m.coefficient), 0), 2) AS moyenne_annuelle
    FROM eleves e
    LEFT JOIN notes n ON n.eleve_id = e.id
    LEFT JOIN matieres m ON m.id = n.matiere_id
    WHERE e.classe_id = ?
  `;
  const params = [classeId];
  if (anneeId) {
    sql += ' AND e.annee_scolaire_id = ?';
    params.push(anneeId);
  }
  sql += ' GROUP BY e.id ORDER BY e.nom, e.prenom';

  const eleves = all(sql, params);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elimu';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`${classe.nom_classe}`);

  sheet.addRow([`${t('excel_rentree_title')} — ${classe.nom_classe} — ${t('date')} : ${new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}`]);
  sheet.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF1a3c6e' } };
  sheet.addRow([t('excel_rentree_hint')]);
  sheet.getRow(2).font = { italic: true, size: 11, color: { argb: 'FF888888' } };
  sheet.addRow([]);

  const headerRow = sheet.addRow([t('col_num'), t('col_name'), t('col_firstname'), t('birth_date'), t('col_annual_avg')]);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00875A' } };
    cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 25;

  eleves.forEach((eleve, i) => {
    const row = sheet.addRow([
      i + 1, eleve.nom, eleve.prenom,
      eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '',
      eleve.moyenne_annuelle || ''
    ]);
    if (i % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FFF4' } };
      });
    }
    const moy = eleve.moyenne_annuelle;
    if (moy) {
      const color = moy >= 14 ? 'FF00875A' : moy >= 10 ? 'FFfa8c16' : 'FFf5222d';
      row.getCell(5).font = { bold: true, color: { argb: color } };
    }
  });

  sheet.columns = [
    { width: 5 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 16 }, { width: 16 }
  ];

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nbEleves: eleves.length };
}

module.exports = { exportExcelRentree };
