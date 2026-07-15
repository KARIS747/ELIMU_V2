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
 * Colonnes : Nom et Prénom | Sous-Comp. | UA | Orale | Écrite | Pratique | Savoir-être
 * Les en-têtes incluent le max MINEDUB entre parenthèses (ex: Orale (/20))
 * Chaque ligne a un commentaire Excel indiquant le max exact de sa sous-compétence
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

      // En-tête : max MINEDUB dans les colonnes de notes (1ère sous-compétence comme référence)
      const firstSC = Object.values(comp.sousCompetences)[0];
      sheet.addRow([
        t('col_fullname') || 'Nom et Prénom',
        'Sous-Comp.',
        'UA',
        firstSC ? `Orale (/${firstSC.orale || 0})` : 'Orale',
        firstSC ? `Écrite (/${firstSC.ecrite || 0})` : 'Écrite',
        firstSC ? `Pratique (/${firstSC.pratique || 0})` : 'Pratique',
        firstSC ? `Savoir-être (/${firstSC.savoirEtre || 0})` : 'Savoir-être'
      ]);

      const headerRow = sheet.getRow(1);
      headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
        cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      headerRow.height = 30;

      // Lignes élèves : une par sous-compétence, avec note indiquant les max exacts
      for (const eleve of eleves) {
        for (const [sousCode, sc] of Object.entries(comp.sousCompetences)) {
          const row = sheet.addRow([
            `${eleve.nom} ${eleve.prenom}`,
            sousCode,
            '',
            '', '', '', ''
          ]);
          const maxStr = `Orale: /${sc.orale || 0} | Écrite: /${sc.ecrite || 0} | Pratique: /${sc.pratique || 0} | Savoir-être: /${sc.savoirEtre || 0}`;
          row.getCell(1).note = maxStr;
          row.getCell(4).note = `Max: /${sc.orale || 0}`;
          row.getCell(5).note = `Max: /${sc.ecrite || 0}`;
          row.getCell(6).note = `Max: /${sc.pratique || 0}`;
          row.getCell(7).note = `Max: /${sc.savoirEtre || 0}`;
        }
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
