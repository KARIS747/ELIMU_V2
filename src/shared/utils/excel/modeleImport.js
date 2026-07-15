/**
 * excel/modeleImport.js — Génération d'un modèle Excel pour l'importation des élèves
 */

const ExcelJS = require('exceljs');
const { get } = require('../../database/db');
const { getDocTranslator } = require('../pdf/locales');

async function genererModeleImportClasse(classeId, outputPath, lang = 'fr') {
  const t = getDocTranslator(lang);
  const classe = get('SELECT nom_classe FROM classes WHERE id = ?', [classeId]);
  const nomClasse = classe ? classe.nom_classe : 'Classe';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elimu';
  const sheetName = lang === 'en' ? `Import_Students_${nomClasse}` : `Import_Eleves_${nomClasse}`;
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  // En-tête (Ligne 1)
  const headerRow = sheet.addRow([
    t('model_lastname'), 
    t('model_firstname'), 
    t('eleve.sexe'),
    t('model_birthdate'), 
    t('model_parent_name'), 
    t('model_parent_phone')
  ]);

  // Style de l'en-tête
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a3c6e' } };
    cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 25;

  // Colonnes
  sheet.columns = [
    { width: 25 }, // Nom
    { width: 25 }, // Prénom
    { width: 10 }, // Sexe
    { width: 25 }, // Date N
    { width: 25 }, // Nom Parent
    { width: 20 }  // Tel Parent
  ];

  // Ajouter quelques lignes d'exemple (grisées)
  const examples = [
    ['DOE', 'John', 'M', '2012-05-14', 'DOE Senior', '699000000'],
    ['NGUEMA', 'Marie', 'F', '2013-11-20', 'NGUEMA Paul', '677000000']
  ];

  examples.forEach(ex => {
    const row = sheet.addRow(ex);
    row.eachCell(cell => {
      cell.font = { italic: true, color: { argb: 'FF888888' } };
    });
  });

  // Ajouter une protection ou un commentaire ?
  sheet.addRow([]);
  const noteRow = sheet.addRow([t('model_example_note')]);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FFFF0000' } };

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath, nomClasse };
}

/**
 * Génère un modèle Excel pour l'importation des professeurs
 */
async function genererModeleImportProfesseurs(outputPath, lang = 'fr') {
  const t = getDocTranslator(lang);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elimu';
  const sheetName = lang === 'en' ? 'Teachers_Import_Model' : 'Modele_Import_Professeurs';
  const sheet = workbook.addWorksheet(sheetName.substring(0, 31));

  // En-tête (Ligne 1)
  const headerRow = sheet.addRow([
    t('model_lastname'), 
    t('model_firstname'), 
    t('model_prof_discipline'),
    t('model_prof_civilite'),
    t('model_prof_gender'),
    t('model_prof_phone'),
    t('model_prof_email'),
    t('model_prof_specialty'),
    t('model_prof_degree'),
    t('model_prof_city')
  ]);

  // Style de l'en-tête
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo purple
    cell.font = { bold: true, color: { argb: 'FFffffff' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  headerRow.height = 25;

  // Colonnes
  sheet.columns = [
    { width: 25 }, // Nom
    { width: 25 }, // Prénom
    { width: 25 }, // Discipline
    { width: 15 }, // Civilité
    { width: 10 }, // Sexe
    { width: 20 }, // Tél
    { width: 25 }, // Email
    { width: 20 }, // Spécialité
    { width: 20 }, // Diplôme
    { width: 20 }  // Ville
  ];

  // Ajouter une ligne d'exemple
  const example = ['DOE', 'Jane', 'Mathematics', 'Mme', 'F', '+237600000000', 'jane.doe@school.com', 'Algebra', 'Master', 'Yaoundé'];
  const exRow = sheet.addRow(example);
  exRow.eachCell(cell => {
    cell.font = { italic: true, color: { argb: 'FF888888' } };
  });

  sheet.addRow([]);
  const noteRow = sheet.addRow([t('model_example_note')]);
  noteRow.getCell(1).font = { italic: true, color: { argb: 'FFFF0000' } };

  await workbook.xlsx.writeFile(outputPath);
  return { success: true, path: outputPath };
}

module.exports = { genererModeleImportClasse, genererModeleImportProfesseurs };
