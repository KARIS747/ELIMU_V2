/**
 * excel/exportExcel.js — Export liste de la classe au format Excel
 * Version synchrone pour better-sqlite3
 */

const ExcelJS = require('exceljs');
const { get, all } = require('../../database/db');
const { getDocTranslator } = require('../pdf/locales');

async function exportExcel(classeId, outputPath, anneeId, lang = 'fr') {
  const t = getDocTranslator(lang);
  const classe = get('SELECT * FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { success: false, error: 'Classe non trouvée' };

  // Note : on filtre sur l'année scolaire si fournie
  let sql = `
    SELECT e.nom, e.prenom, e.date_naissance, e.nom_parent, e.telephone_parent,
           ROUND(SUM(n.note * m.coefficient) / NULLIF(SUM(m.coefficient), 0), 2) AS moyenne_generale
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
  const sheet = workbook.addWorksheet(classe.nom_classe);

  sheet.addRow([`${t('excel_list_title')} : ${classe.nom_classe}`]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`${t('date')} : ${new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR')}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow([
    t('col_num'), t('col_name'), t('col_firstname'), t('birth_date'),
    t('col_parent_name'), t('col_parent_phone'), t('average'), t('appreciation')
  ]);

  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
    cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 25;

  eleves.forEach((eleve, i) => {
    const moy = eleve.moyenne_generale;
    let appr = lang === 'en' ? 'No grade' : 'Sans note';
    if (moy) {
      if (lang === 'en') {
        appr = moy >= 16 ? 'Excellent' : moy >= 14 ? 'Very Good' : moy >= 12 ? 'Good' : moy >= 10 ? 'Fair' : 'Poor';
      } else {
        appr = moy >= 16 ? 'Très Bien' : moy >= 14 ? 'Bien' : moy >= 12 ? 'Assez Bien' : moy >= 10 ? 'Passable' : 'Insuffisant';
      }
    }

    const row = sheet.addRow([
      i + 1, eleve.nom.toUpperCase(), eleve.prenom,
      eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '', 
      eleve.nom_parent || '',
      eleve.telephone_parent || '', 
      moy || '', 
      appr
    ]);

    if (moy) {
      const color = moy >= 14 ? 'FF00a854' : moy >= 10 ? 'FFfa8c16' : 'FFf5222d';
      row.getCell(7).font = { bold: true, color: { argb: color } };
    }
  });

  sheet.columns = [
    { width: 5 }, { width: 22 }, { width: 18 }, { width: 10 }, { width: 16 }, { width: 22 }, { width: 18 }, { width: 12 }, { width: 15 }
  ];

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nbEleves: eleves.length };
}

module.exports = { exportExcel };
