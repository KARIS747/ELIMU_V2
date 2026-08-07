const ExcelJS = require('exceljs');
const { run, get, all } = require('../../database/db');
const { syncParentEleve } = require('../parentSync');
const { defaultLogger, trouverEleve } = require('./helpers');

async function importListeEleves(filePath, classeId, mode = 'ajoute', utilisateurId = null, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbAjoutes: 0,
    nbIgnores: 0,
    nbRemplaces: 0,
    nbErreurs: 0,
    erreurs: []
  };

  const { genererTranchesPourEleve } = require('../../../main/utils/financeUtils');

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024)
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const nom    = String(row.getCell(1).value || '').trim();
    const prenom = String(row.getCell(2).value || '').trim();
    const matricule = String(row.getCell(3).value || '').trim() || null;
    const sexeLu = String(row.getCell(4).value || '').trim().toUpperCase();
    const dateN  = row.getCell(5).value;
    const nomParent = String(row.getCell(6).value || '').trim() || null;
    const telParent = String(row.getCell(7).value || '').trim() || null;

    let sexe = null;
    if (['M', 'G', 'GARCON', 'BOY', 'MASCULIN', 'MALE'].includes(sexeLu)) sexe = 'M';
    else if (['F', 'FILLE', 'GIRL', 'FEMININ', 'FEMALE'].includes(sexeLu)) sexe = 'F';

    if (nom) lignes.push({ nom, prenom, sexe, dateN, nomParent, telParent, matricule, rowNumber });
  });

  if (!lignes.length)
    return { ...resultat, error: 'Aucune ligne de données trouvée dans le fichier' };

  run('BEGIN');
  try {
    if (mode === 'ecrase') {
      run('UPDATE eleves SET classe_id = NULL WHERE classe_id = ? AND ecole_id = ?', [classeId, ecoleId]);
      resultat.nbRemplaces = lignes.length;
    }

    const elevesActuels = all(
      'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
      [classeId, anneeId, ecoleId]
    );

    for (const { nom, prenom, sexe, dateN, nomParent, telParent, matricule, rowNumber } of lignes) {
      try {
        if (!nom) {
          resultat.erreurs.push(`Ligne ${rowNumber}: nom vide, ignorée`);
          resultat.nbErreurs++;
          continue;
        }

        if (mode === 'ajoute') {
          const existant = trouverEleve(elevesActuels, nom, prenom);
          if (existant) {
            run(
              'UPDATE eleves SET sexe = COALESCE(?, sexe), nom_parent = COALESCE(?, nom_parent), telephone_parent = COALESCE(?, telephone_parent), matricule = COALESCE(?, matricule) WHERE id = ?',
              [sexe, nomParent, telParent, matricule, existant.id]
            );
            if (telParent) {
              await syncParentEleve(existant.id, nomParent, telParent, defaultLogger, ecoleId);
            }
            resultat.nbIgnores++;
            continue;
          }
        }

        const eleveGlobal = get(
          `SELECT id FROM eleves
           WHERE LOWER(nom) = LOWER(?) AND LOWER(prenom) = LOWER(?) AND ecole_id = ?
           LIMIT 1`,
          [nom, prenom, ecoleId]
        );

        const { getLocalDateString } = require('../dateUtils');
        let dateStr = null;
        if (dateN) {
          if (dateN instanceof Date) {
            dateStr = getLocalDateString(dateN);
          } else if (typeof dateN === 'string' && dateN.trim()) {
            dateStr = dateN.trim();
          }
        }

        let eleveId;
        let estNouveau = false;
        if (eleveGlobal) {
          run(
            'UPDATE eleves SET classe_id = ?, sexe = ?, nom_parent = ?, telephone_parent = ?, matricule = COALESCE(?, matricule) WHERE id = ? AND ecole_id = ?',
            [classeId, sexe, nomParent, telParent, matricule, eleveGlobal.id, ecoleId]
          );
          eleveId = eleveGlobal.id;
          resultat.nbAjoutes++;
          estNouveau = true;
        } else {
          const inserted = run(
            'INSERT INTO eleves (nom, prenom, matricule, date_naissance, sexe, classe_id, nom_parent, telephone_parent, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nom, prenom, matricule, dateStr, sexe, classeId, nomParent, telParent, anneeId, ecoleId]
          );
          eleveId = inserted.lastID;
          resultat.nbAjoutes++;
          estNouveau = true;
        }

        if (estNouveau && anneeId) {
          genererTranchesPourEleve(eleveId, anneeId, defaultLogger, ecoleId);
        }

        if (telParent) {
          await syncParentEleve(eleveId, nomParent, telParent, defaultLogger, ecoleId);
        }

      } catch (rowErr) {
        resultat.erreurs.push(`Ligne ${rowNumber}: ${rowErr.message}`);
        resultat.nbErreurs++;
      }
    }

    run('COMMIT');
    resultat.success = true;
    return resultat;

  } catch (err) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique : ${err.message}` };
  }
}

module.exports = { importListeEleves };