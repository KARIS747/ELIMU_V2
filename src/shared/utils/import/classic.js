const ExcelJS = require('exceljs');
const { run, get, all } = require('../../database/db');
const { defaultLogger, trouverEleve, validateExcelMetadata } = require('./helpers');

async function importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const { genererTranchesPourEleve } = require('../../../main/utils/financeUtils');

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  if (ecoleId) {
    const metaValidation = validateExcelMetadata(workbook, ecoleId, defaultLogger);
    if (metaValidation && !metaValidation.valid) {
      return { ...resultat, error: metaValidation.error };
    }
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };
  }

  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );

  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
     VALUES (?, ?, ?, ?, 'Partiel', ?, ?)`,
    [utilisateurId || 1, classeId, matiereId, fileName, anneeId, ecoleId]
  );
  const importId = importRecord.lastID;

  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    lignes.push({ row, rowNumber });
  });

  run('BEGIN');
  try {
    for (const { row, rowNumber } of lignes) {
      try {
        let nomLu, prenomLu, noteLue;

        const col1 = String(row.getCell(1).value || '').trim();
        const col2 = row.getCell(2).value;
        const col3 = row.getCell(3).value;

        if (!col1 || col1 === 'N°' || col1 === 'N' || /^\d+$/.test(col1)) {
          continue;
        }

        if (col3 !== null && col3 !== undefined && String(col3).trim() !== '') {
          nomLu = col1;
          prenomLu = String(col2 || '').trim();
          noteLue = parseFloat(String(col3).replace(',', '.'));
        } else {
          const parts = col1.split(' ');
          nomLu = parts[0] || '';
          prenomLu = parts.slice(1).join(' ') || '';
          noteLue = parseFloat(String(col2 || '').replace(',', '.'));
        }

        if (col3 === null || col3 === undefined || String(col3).trim() === '') {
          if (col2 === null || col2 === undefined || String(col2).trim() === '') {
            resultat.avertissements.push(`Ligne ${rowNumber}: Note vide ignorée pour "${nomLu} ${prenomLu}"`);
            continue;
          }
        }

        if (isNaN(noteLue) || noteLue < 0 || noteLue > 20) {
          resultat.erreurs.push(`Ligne ${rowNumber}: Note "${noteLue}" invalide (doit être entre 0 et 20)`);
          resultat.nbErreurs++;
          continue;
        }

        let eleve = trouverEleve(eleves, nomLu, prenomLu);
        let eleveId;

        if (!eleve) {
          try {
            const inserted = run(
              'INSERT INTO eleves (nom, prenom, sexe, classe_id, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?)',
              [nomLu, prenomLu || '', 'M', classeId, anneeId, ecoleId]
            );
            eleveId = inserted.lastID;
            eleve = { id: eleveId, nom: nomLu, prenom: prenomLu || '' };
            eleves.push(eleve);
            resultat.avertissements.push(`Ligne ${rowNumber}: Élève "${nomLu} ${prenomLu}" créé automatiquement.`);

            if (anneeId) {
              genererTranchesPourEleve(eleveId, anneeId, defaultLogger, ecoleId);
            }
          } catch (createErr) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Impossible de créer l'élève "${nomLu} ${prenomLu}" — ${createErr.message}`);
            resultat.nbErreurs++;
            continue;
          }
        } else {
          eleveId = eleve.id;
        }

        run(
          `INSERT OR REPLACE INTO notes
             (eleve_id, matiere_id, note, periode, sequence, import_id, annee_scolaire_id, ecole_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [eleveId, matiereId, noteLue, periode || 'Trimestre 1', sequence || 1, importId, anneeId, ecoleId]
        );
        resultat.nbImportes++;

      } catch (rowError) {
        resultat.erreurs.push(`Ligne ${rowNumber}: Erreur — ${rowError.message}`);
        resultat.nbErreurs++;
      }
    }
    run('COMMIT');
  } catch (globalError) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique : ${globalError.message}` };
  }

  const statut = resultat.nbErreurs === 0 ? 'Succès' : resultat.nbImportes > 0 ? 'Partiel' : 'Échec';
  run(
    `UPDATE imports SET statut=?, nb_importes=?, nb_erreurs=?, message=? WHERE id=?`,
    [
      statut,
      resultat.nbImportes,
      resultat.nbErreurs,
      `${resultat.nbImportes} note(s) importée(s), ${resultat.nbErreurs} erreur(s)`,
      importId
    ]
  );

  resultat.success = resultat.nbImportes > 0;
  resultat.statut = statut;
  return resultat;
}

module.exports = { importClassicNotes };