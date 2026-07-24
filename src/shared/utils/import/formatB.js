const ExcelJS = require('exceljs');
const { run, get, all } = require('../../database/db');
const { getWeightsForSousCompetence, calcAggregateFromSubNotes, getPeriodeForUA } = require('../../constants/curriculum');
const { defaultLogger, trouverEleve, validateExcelMetadata } = require('./helpers');

async function importUANotesFormatB(filePath, classeId, utilisateurId, anneeId = null, ecoleId = '') {
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

  const classe = get('SELECT nom_classe, niveau_v2 FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { ...resultat, error: 'Classe non trouvée' };

  let lvl = classe.niveau_v2;
  if (!lvl) {
    const nom = (classe.nom_classe || '').toUpperCase();
    if (nom.includes('SIL') || nom.includes('CP')) lvl = 'N1';
    else if (nom.includes('CE1') || nom.includes('CE2')) lvl = 'N2';
  }
  if (lvl !== 'N1' && lvl !== 'N2') {
    return { ...resultat, error: `La classe "${classe.nom_classe}" n'est pas configurée pour le système UA.` };
  }

  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );
  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
     VALUES (?, ?, NULL, ?, 'Partiel', ?, ?)`,
    [utilisateurId || 1, classeId, fileName, anneeId, ecoleId]
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
        const nomPrenom = String(row.getCell(1).value || '').trim();
        if (!nomPrenom || nomPrenom === 'N°' || nomPrenom === 'Nom et Prénom') continue;

        const sousCode = String(row.getCell(2).value || '').trim().toUpperCase();
        if (!sousCode) {
          resultat.erreurs.push(`Ligne ${rowNumber}: Sous-compétence manquante pour "${nomPrenom}"`);
          resultat.nbErreurs++;
          continue;
        }

        const ua = String(row.getCell(3).value || '').trim().toUpperCase();
        if (!ua || !ua.startsWith('UA')) {
          resultat.erreurs.push(`Ligne ${rowNumber}: UA invalide "${ua}" pour "${nomPrenom}"`);
          resultat.nbErreurs++;
          continue;
        }

        const parts = nomPrenom.split(' ');
        const nomLu = parts[0] || '';
        const prenomLu = parts.slice(1).join(' ') || '';
        let eleve = trouverEleve(eleves, nomLu, prenomLu);

        if (!eleve) {
          try {
            const inserted = run(
              'INSERT INTO eleves (nom, prenom, sexe, classe_id, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?)',
              [nomLu, prenomLu, 'M', classeId, anneeId, ecoleId]
            );
            eleve = { id: inserted.lastID, nom: nomLu, prenom: prenomLu };
            eleves.push(eleve);
            resultat.avertissements.push(`Ligne ${rowNumber}: Élève "${nomPrenom}" créé automatiquement.`);
            if (anneeId) genererTranchesPourEleve(eleve.id, anneeId, defaultLogger, ecoleId);
          } catch (createErr) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Impossible de créer "${nomPrenom}" — ${createErr.message}`);
            resultat.nbErreurs++;
            continue;
          }
        }

        const weights = getWeightsForSousCompetence(lvl, sousCode);
        if (!weights) {
          resultat.erreurs.push(`Ligne ${rowNumber}: Code "${sousCode}" invalide pour le niveau ${lvl}`);
          resultat.nbErreurs++;
          continue;
        }

        const periode = getPeriodeForUA(ua);
        if (!periode) {
          resultat.erreurs.push(`Ligne ${rowNumber}: UA "${ua}" invalide`);
          resultat.nbErreurs++;
          continue;
        }

        const types = ['orale', 'ecrite', 'pratique', 'savoirEtre'];
        const subNotes = {};
        let hasNote = false;

        for (let i = 0; i < types.length; i++) {
          const type = types[i];
          const maxPoids = weights[type] || 0;
          if (maxPoids <= 0) continue;

          const cellVal = row.getCell(4 + i).value;
          if (cellVal === null || cellVal === undefined || String(cellVal).trim() === '') continue;

          const raw = parseFloat(String(cellVal).replace(',', '.'));
          if (isNaN(raw) || raw < 0) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Note ${type} "${cellVal}" invalide`);
            resultat.nbErreurs++;
            continue;
          }
          if (raw > maxPoids) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Note ${type} "${raw}" dépasse le max ${maxPoids} pour ${sousCode}`);
            resultat.nbErreurs++;
            continue;
          }

          const note20 = (raw / maxPoids) * 20;

          run(
            `DELETE FROM notes
             WHERE eleve_id = ? AND sous_competence_code = ? AND (sous_type = ? OR type_eval = ?) AND ua = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
            [eleve.id, sousCode, type, type, ua, anneeId, ecoleId]
          );

          run(
            `INSERT INTO notes
               (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, import_id, annee_scolaire_id, periode, ecole_id)
             VALUES (?, ?, ?, ?, ?, ?, 'EXCEL', ?, ?, ?, ?)`,
            [eleve.id, Math.round(note20 * 100) / 100, ua, sousCode, type, type, importId, anneeId, periode, ecoleId]
          );
          resultat.nbImportes++;
          hasNote = true;
          subNotes[type] = Math.round(note20 * 100) / 100;
        }

        if (!hasNote) {
          resultat.avertissements.push(`Ligne ${rowNumber}: Aucune note pour "${nomPrenom}" (${sousCode} ${ua})`);
          continue;
        }

        const aggNote = calcAggregateFromSubNotes(subNotes, weights);
        if (aggNote !== null) {
          run(
            `DELETE FROM notes
             WHERE eleve_id = ? AND sous_competence_code = ? AND sous_type IS NULL AND ua = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
            [eleve.id, sousCode, ua, anneeId, ecoleId]
          );
          run(
            `INSERT INTO notes
               (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, import_id, annee_scolaire_id, periode, ecole_id)
             VALUES (?, ?, ?, ?, NULL, NULL, 'EXCEL', ?, ?, ?, ?)`,
            [eleve.id, Math.round(aggNote * 100) / 100, ua, sousCode, importId, anneeId, periode, ecoleId]
          );
          resultat.nbImportes++;
        }

      } catch (rowError) {
        resultat.erreurs.push(`Ligne ${rowNumber}: ${rowError.message}`);
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
    [statut, resultat.nbImportes, resultat.nbErreurs,
      `${resultat.nbImportes} note(s) importée(s), ${resultat.nbErreurs} erreur(s)`, importId]
  );

  resultat.success = resultat.nbImportes > 0;
  resultat.statut = statut;
  return resultat;
}

module.exports = { importUANotesFormatB };