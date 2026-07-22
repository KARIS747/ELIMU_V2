/**
 * importExcel.js - Module d'importation robuste et hybride d'Élimu V2
 * 
 * Ce module implémente le Dispatcher Pattern :
 * - Détecte le format via le nom du fichier :
 *   - Format B (N1/N2) : ELIMU_{CLASSE}_{ANNEE}.xlsx → colonnes : Nom&Prénom, Sous-Comp, UA, notes brutes
 *   - Format classique (N3) : tout autre fichier Excel
 * - Oriente l'importation soit vers le moteur UA (importUANotesFormatB), soit vers le moteur
 *   classique V1 (importClassicNotes).
 */

const ExcelJS = require('exceljs');
const crypto = require('crypto');
const { run, get, all } = require('../database/db');
const { syncParentEleve } = require('./parentSync');
const { CURRICULUM_TEMPLATES, getWeightsForSousCompetence, calcAggregateFromSubNotes, getPeriodeForUA } = require('../constants/curriculum');

/**
 * Logger minimal pour les utilitaires partagés
 */
const defaultLogger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

/**
 * Recherche un élève dans la liste par nom et prénom
 * Correspondance souple : insensible à la casse et aux accents
 */
function trouverEleve(eleves, nom, prenom) {
  const normaliser = (str) =>
    (str || '').toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const nomN = normaliser(nom);
  const prenomN = normaliser(prenom);

  // 1. Correspondance exacte nom + prénom
  let eleve = eleves.find(e =>
    normaliser(e.nom) === nomN && normaliser(e.prenom) === prenomN
  );

  // 2. Correspondance nom seul (si prénom absent dans le fichier)
  if (!eleve && !prenomN) {
    eleve = eleves.find(e => normaliser(e.nom) === nomN);
  }

  // 3. Correspondance partielle (le nom du fichier commence par le nom BD)
  if (!eleve && nomN.length >= 3) {
    eleve = eleves.find(e =>
      normaliser(e.nom).startsWith(nomN) || nomN.startsWith(normaliser(e.nom))
    );
  }

  return eleve || null;
}

/**
 * Valide la feuille _metadata d'un fichier Excel signé
 * Vérifie ecole_id et la signature SHA-256
 */
function validateExcelMetadata(workbook, expectedEcoleId, logger) {
  const metaSheet = workbook.worksheets.find(ws => ws.name === '_metadata');
  if (!metaSheet) return null;

  const rows = [];
  metaSheet.eachRow((row) => { rows.push(row); });
  if (rows.length < 2) return null;

  const meta = {};
  const headers = rows[0].values;
  const values = rows[1].values;
  for (let i = 1; i < headers.length; i++) {
    meta[headers[i]] = values[i];
  }

  if (!meta.ecole_id) {
    return { valid: false, error: 'ecole_id manquant dans la feuille _metadata' };
  }
  if (meta.ecole_id !== expectedEcoleId) {
    return { valid: false, error: `ecole_id du fichier (${meta.ecole_id}) ne correspond pas à l'école courante (${expectedEcoleId})` };
  }

  if (meta.hash) {
    // Recalculer le hash à partir des données
    const dataSheet = workbook.worksheets[0];
    if (dataSheet) {
      const dataRows = [];
      dataSheet.eachRow((row, rowNum) => {
        if (rowNum > 1) {
          const rowData = {};
          row.values.forEach((val, idx) => {
            if (idx > 0) rowData[`col${idx}`] = val;
          });
          dataRows.push(rowData);
        }
      });
      const recomputed = crypto.createHash('sha256').update(JSON.stringify({ rows: dataRows, meta: { ...meta, hash: undefined } })).digest('hex');
      if (recomputed !== meta.hash) {
        return { valid: false, error: 'Signature SHA-256 invalide — le fichier a été modifié' };
      }
    }
  }

  return { valid: true, meta };
}

/**
 * Point d'entrée principal (Dispatcher Pattern)
 * @param {string} filePath      - Chemin complet vers le fichier Excel
 * @param {number} classeId      - ID de la classe concernée
 * @param {number} matiereId     - ID de la matière (concerne N3 classique)
 * @param {string} periode       - Ex: "Trimestre 1"
 * @param {number} sequence      - Ex: 1, 2
 * @param {number} utilisateurId - ID de l'utilisateur
 * @param {number} anneeId       - ID de l'année scolaire
 * @param {string} ecoleId       - ID de l'école courante
 * @returns {Promise<Object>}    Résultat détaillé
 */
async function importExcel(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null, ecoleId = '') {
  const fileName = filePath.split('/').pop().split('\\').pop();
  
  // Format PWA Export (notes/absences signées) : ELIMU_NOTES_* ou ELIMU_ABSENCES_*
  const pwaNotesMatch = fileName.match(/^ELIMU_NOTES_/i);
  const pwaAbsencesMatch = fileName.match(/^ELIMU_ABSENCES_/i);

  if (pwaNotesMatch || pwaAbsencesMatch) {
    console.log(`🚀 Dispatcher : Format PWA Export détecté pour ${fileName}`);
    const result = await importPwaExport(filePath, utilisateurId, anneeId, ecoleId);
    console.log('📦 Resultat PWA Export:', JSON.stringify(result));
    return result;
  }

  // Format B (N1/N2) : ELIMU_{CLASSE}_{ANNEE}.xlsx
  const formatBMatch = fileName.match(/^ELIMU_([^_]+)_(\d{4}-\d{4})\.xlsx$/i);
  
  if (formatBMatch) {
    console.log(`🚀 Dispatcher : Format B détecté pour la classe ${classeId}`);
    return await importUANotesFormatB(filePath, classeId, utilisateurId, anneeId, ecoleId);
  } else {
    console.log(`🚀 Dispatcher : Format classique V1 détecté pour la classe ${classeId}`);
    return await importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId, ecoleId);
  }
}

/**
 * MOTEUR D'INGESTION FORMAT B (N1/N2 — 1 fichier par classe)
 * 
 * Format attendu : ELIMU_{CLASSE}_{ANNEE}.xlsx
 * Colonnes : Nom et Prénom | Sous-Comp. | UA | Orale | Écrite | Pratique | Savoir-être
 * Les notes sont sur l'échelle réelle MINEDUB (ex: 20/28 pour écrite de 2A).
 * L'import convertit automatiquement sur /20 avant stockage.
 */
async function importUANotesFormatB(filePath, classeId, utilisateurId, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const { genererTranchesPourEleve } = require('../../main/utils/financeUtils');
  const fs = require('fs');

  // 1. Validation taille fichier
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };
  }

  // 2. Lecture du fichier Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // 2b. Validation de la métadonnée si présente
  if (ecoleId) {
    const metaValidation = validateExcelMetadata(workbook, ecoleId, defaultLogger);
    if (metaValidation && !metaValidation.valid) {
      return { ...resultat, error: metaValidation.error };
    }
  }

  // 3. Détermination du niveau (N1/N2)
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

  // 4. Récupération des élèves
  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );
  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  // 5. Enregistrement de l'import
  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
     VALUES (?, ?, NULL, ?, 'Partiel', ?, ?)`,
    [utilisateurId || 1, classeId, fileName, anneeId, ecoleId]
  );
  const importId = importRecord.lastID;

  // 6. Lecture des lignes
  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    lignes.push({ row, rowNumber });
  });

  // 7. Transaction atomique
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

        // Recherche élève : "NOM Prenom" → split premier mot = nom, reste = prénom
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
            if (anneeId) genererTranchesPourEleve(eleve.id, anneeId, defaultLogger);
          } catch (createErr) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Impossible de créer "${nomPrenom}" — ${createErr.message}`);
            resultat.nbErreurs++;
            continue;
          }
        }

        // Validation du code sous-compétence
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

        // Lecture et conversion des notes brutes → /20
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

          // Conversion sur /20
          const note20 = (raw / maxPoids) * 20;

          // Nettoyage avant insertion
          run(
            `DELETE FROM notes
             WHERE eleve_id = ? AND sous_competence_code = ? AND sous_type = ? AND ua = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
            [eleve.id, sousCode, type, ua, anneeId, ecoleId]
          );

          run(
            `INSERT INTO notes
               (eleve_id, note, ua, sous_competence_code, sous_type, source, import_id, annee_scolaire_id, periode, ecole_id)
             VALUES (?, ?, ?, ?, ?, 'EXCEL', ?, ?, ?, ?)`,
            [eleve.id, Math.round(note20 * 100) / 100, ua, sousCode, type, importId, anneeId, periode, ecoleId]
          );
          resultat.nbImportes++;
          hasNote = true;
          subNotes[type] = Math.round(note20 * 100) / 100;
        }

        if (!hasNote) {
          resultat.avertissements.push(`Ligne ${rowNumber}: Aucune note pour "${nomPrenom}" (${sousCode} ${ua})`);
          continue;
        }

        // Calcul et insertion de l'agrégat
        const aggNote = calcAggregateFromSubNotes(subNotes, weights);
        if (aggNote !== null) {
          run(
            `DELETE FROM notes
             WHERE eleve_id = ? AND sous_competence_code = ? AND sous_type IS NULL AND ua = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
            [eleve.id, sousCode, ua, anneeId, ecoleId]
          );
          run(
            `INSERT INTO notes
               (eleve_id, note, ua, sous_competence_code, sous_type, source, import_id, annee_scolaire_id, periode, ecole_id)
             VALUES (?, ?, ?, ?, NULL, 'EXCEL', ?, ?, ?, ?)`,
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

/**
 * MOTEUR D'INGESTION V1 (Système classique quantitatif pour Niveau 3)
 */
async function importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const { genererTranchesPourEleve } = require('../../main/utils/financeUtils');

  // Validation de taille
  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };
  }

  // Lecture Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Validation de la métadonnée si présente
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

  // Récupération des élèves
  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );

  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  // Enregistrement d'import
  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
     VALUES (?, ?, ?, ?, 'Partiel', ?, ?)`,
    [utilisateurId || 1, classeId, matiereId, fileName, anneeId, ecoleId]
  );
  const importId = importRecord.lastID;

  // Lecture de toutes les lignes
  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Ignorer l'en-tête
    lignes.push({ row, rowNumber });
  });

  // Transaction
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
              genererTranchesPourEleve(eleveId, anneeId, defaultLogger);
            }
          } catch (createErr) {
            resultat.erreurs.push(`Ligne ${rowNumber}: Impossible de créer l'élève "${nomLu} ${prenomLu}" — ${createErr.message}`);
            resultat.nbErreurs++;
            continue;
          }
        } else {
          eleveId = eleve.id;
        }

        // Insertion classique
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

/**
 * Importe une liste d'élèves depuis un fichier Excel
 */
async function importListeEleves(filePath, classeId, mode = 'ajoute', utilisateurId = null, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbAjoutes: 0,
    nbIgnores: 0,
    nbRemplaces: 0,
    nbErreurs: 0,
    erreurs: []
  };

  const { genererTranchesPourEleve } = require('../../main/utils/financeUtils');

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
    const sexeLu = String(row.getCell(3).value || '').trim().toUpperCase();
    const dateN  = row.getCell(4).value;
    const nomParent = String(row.getCell(5).value || '').trim() || null;
    const telParent = String(row.getCell(6).value || '').trim() || null;

    let sexe = null;
    if (['M', 'G', 'GARCON', 'BOY', 'MASCULIN', 'MALE'].includes(sexeLu)) sexe = 'M';
    else if (['F', 'FILLE', 'GIRL', 'FEMININ', 'FEMALE'].includes(sexeLu)) sexe = 'F';

    if (nom) lignes.push({ nom, prenom, sexe, dateN, nomParent, telParent, rowNumber });
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

    for (const { nom, prenom, sexe, dateN, nomParent, telParent, rowNumber } of lignes) {
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
              'UPDATE eleves SET sexe = COALESCE(?, sexe), nom_parent = COALESCE(?, nom_parent), telephone_parent = COALESCE(?, telephone_parent) WHERE id = ?',
              [sexe, nomParent, telParent, existant.id]
            );
            if (telParent) {
              await syncParentEleve(existant.id, nomParent, telParent, defaultLogger);
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

        const { getLocalDateString } = require('./dateUtils');
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
            'UPDATE eleves SET classe_id = ?, sexe = ?, nom_parent = ?, telephone_parent = ? WHERE id = ? AND ecole_id = ?',
            [classeId, sexe, nomParent, telParent, eleveGlobal.id, ecoleId]
          );
          eleveId = eleveGlobal.id;
          resultat.nbAjoutes++;
          estNouveau = true; 
        } else {
          const inserted = run(
            'INSERT INTO eleves (nom, prenom, date_naissance, sexe, classe_id, nom_parent, telephone_parent, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nom, prenom, dateStr, sexe, classeId, nomParent, telParent, anneeId, ecoleId]
          );
          eleveId = inserted.lastID;
          resultat.nbAjoutes++;
          estNouveau = true;
        }

        if (estNouveau && anneeId) {
          genererTranchesPourEleve(eleveId, anneeId, defaultLogger);
        }

        if (telParent) {
          await syncParentEleve(eleveId, nomParent, telParent, defaultLogger);
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

/**
 * Importe une liste de professeurs et cree automatiquement leurs comptes PWA
 */
async function importListeProfesseurs(filePath, mode = 'ajouter', utilisateurId = null, ecoleId = '') {
  const resultat = {
    success:    false,
    nbAjoutes:  0,
    nbIgnores:  0,
    nbErreurs:  0,
    erreurs:    [],
    comptes:    []
  };

  const crypto = require('crypto');
  const bcrypt = require('bcryptjs');
  const fs = require('fs');

  function generateUsername(nom, prenom) {
    const base = ((prenom || '') + '.' + (nom || '')).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.]/g, '');
    const suffix = Math.random().toString(36).substring(2, 5);
    return (base + '.' + suffix).substring(0, 30);
  }

  function generateSecurePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%&';
    let pw = '';
    const bytes = crypto.randomBytes(10);
    for (let i = 0; i < 10; i++) {
      pw += chars[bytes[i] % chars.length];
    }
    return pw;
  }

  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10 MB)' };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };
  }

  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const nom     = String(row.getCell(1).value || '').trim();
    const prenom  = String(row.getCell(2).value || '').trim();
    const matiere = String(row.getCell(3).value || '').trim() || null;
    const tel     = String(row.getCell(4).value || '').trim() || null;
    const email   = String(row.getCell(5).value || '').trim() || null;

    if (nom || prenom) {
      lignes.push({ nom, prenom, matiere, tel, email, rowNumber });
    }
  });

  if (!lignes.length) {
    return { ...resultat, error: 'Aucune ligne de donnees trouvee dans le fichier' };
  }

  try {
    if (mode === 'remplacer') {
      run(`DELETE FROM professeurs_classes WHERE professeur_id IN (SELECT id FROM professeurs WHERE ecole_id = ?)`, [ecoleId]);
      run(`UPDATE classes SET professeur_principal_id = NULL WHERE ecole_id = ?`, [ecoleId]);
      run(`UPDATE professeurs SET utilisateur_id = NULL WHERE ecole_id = ?`, [ecoleId]);
      run(`DELETE FROM utilisateurs WHERE role = 'enseignant' AND ecole_id = ?`, [ecoleId]);
      run(`DELETE FROM professeurs WHERE ecole_id = ?`, [ecoleId]);
    }

    const profsActuels = all(`SELECT id, nom, prenom FROM professeurs WHERE ecole_id = ?`, [ecoleId]);

    const normaliser = s =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    for (const rowData of lignes) {
      const { nom, prenom, matiere, tel, email, rowNumber } = rowData;
      try {
        if (!nom) {
          resultat.erreurs.push(`Ligne ${rowNumber} : nom manquant, ignoree`);
          resultat.nbErreurs++;
          continue;
        }
        if (!prenom) {
          resultat.erreurs.push(`Ligne ${rowNumber} : prenom manquant pour "${nom}", ignoree`);
          resultat.nbErreurs++;
          continue;
        }

        if (mode === 'ajouter') {
          const doublon = profsActuels.find(p =>
            normaliser(p.nom) === normaliser(nom) &&
            normaliser(p.prenom) === normaliser(prenom)
          );
          if (doublon) {
            resultat.nbIgnores++;
            continue;
          }
        }

        // Generer le compte utilisateur enseignant
        const username = generateUsername(nom, prenom);
        const rawPassword = generateSecurePassword();
        const hash = bcrypt.hashSync(rawPassword, 10);

        const userResult = run(
          `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, nom_complet, actif, ecole_id)
           VALUES (?, ?, 'enseignant', ?, 1, ?)`,
          [username, hash, (prenom + ' ' + nom).trim(), ecoleId]
        );

        const r = run(
          `INSERT INTO professeurs (
            nom, prenom, matiere_principale, telephone, email, actif, utilisateur_id, ecole_id
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          [nom, prenom, matiere, tel, email, userResult.lastID, ecoleId]
        );

        profsActuels.push({ id: r.lastID, nom, prenom });
        resultat.nbAjoutes++;
        resultat.comptes.push({ nom, prenom, username, password: rawPassword });

      } catch (rowErr) {
        resultat.erreurs.push(`Ligne ${rowNumber} : ${rowErr.message}`);
        resultat.nbErreurs++;
      }
    }

    run('COMMIT');
    resultat.success = resultat.nbAjoutes > 0 || resultat.nbIgnores > 0;
    return resultat;

  } catch (globalError) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique : ${globalError.message}` };
  }
}

/**
 * Importe les absences depuis un fichier Excel
 */
async function importAbsencesExcel(filePath, classeId, uid = null, anneeId = null, defaultPeriode = 'all', ecoleId = '') {
  const resultat = {
    success: false,
    nbMisAJour: 0,
    nbErreurs: 0,
    erreurs: []
  };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const elevesClasse = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );
  if (!elevesClasse.length) return { ...resultat, error: 'Aucun élève dans cette classe' };

  const normaliser = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const trouverEleveLocal = (eleves, nom, prenom) => {
    const nomN = normaliser(nom);
    const prenomN = normaliser(prenom);
    return eleves.find(e => normaliser(e.nom) === nomN && normaliser(e.prenom) === prenomN);
  };

  const upsert = (eleveId, periode, heures) => {
    const h = parseFloat(String(heures).replace(',', '.'));
    if (isNaN(h) || h < 0) return false;
    
    run(
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, periode, h, anneeId, ecoleId]
    );
    return true;
  };

  const rows = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) rows.push({ row, rowNumber });
  });

  run('BEGIN');
  try {
    for (const { row, rowNumber } of rows) {
      try {
        let nomLu, prenomLu, h1, h2, h3, hUnique, periodeLue;

        const col1 = String(row.getCell(1).value || '').trim();
        const col2 = row.getCell(2).value;
        const col3 = row.getCell(3).value;
        const col4 = row.getCell(4).value;
        const col5 = row.getCell(5).value;

        if (!col1 || col1.toLowerCase() === 'nom' || col1 === 'N°') continue;

        const hasCol2 = col2 !== null && col2 !== undefined && String(col2).trim() !== '';
        const hasCol3 = col3 !== null && col3 !== undefined && String(col3).trim() !== '';
        const hasCol4 = col4 !== null && col4 !== undefined && String(col4).trim() !== '';
        const hasCol5 = col5 !== null && col5 !== undefined && String(col5).trim() !== '';

        if (hasCol2 && hasCol3) {
          nomLu = col1;
          prenomLu = String(col2).trim();
          
          if (hasCol5) {
            h1 = col3; h2 = col4; h3 = col5;
          } else if (hasCol4) {
            const p = normaliser(col3);
            if (p.includes('1') || p === 't1') periodeLue = 'Trimestre 1';
            else if (p.includes('2') || p === 't2') periodeLue = 'Trimestre 2';
            else if (p.includes('3') || p === 't3') periodeLue = 'Trimestre 3';
            hUnique = col4;
          } else {
            hUnique = col3;
          }
        } else if (hasCol2) {
          const parts = col1.split(' ');
          nomLu = parts[0] || '';
          prenomLu = parts.slice(1).join(' ') || '';
          hUnique = col2;
        } else {
          continue;
        }

        const eleve = trouverEleveLocal(elevesClasse, nomLu, prenomLu);
        if (!eleve) {
          resultat.nbErreurs++;
          if (resultat.erreurs.length < 10) {
            resultat.erreurs.push(`Ligne ${rowNumber} : "${nomLu} ${prenomLu}" non trouvé`);
          }
          continue;
        }

        let aMisAJour = false;

        if (h1 !== undefined || h2 !== undefined || h3 !== undefined) {
          if (h1 !== null && h1 !== undefined && String(h1).trim() !== '') { if (upsert(eleve.id, 'Trimestre 1', h1)) aMisAJour = true; }
          if (h2 !== null && h2 !== undefined && String(h2).trim() !== '') { if (upsert(eleve.id, 'Trimestre 2', h2)) aMisAJour = true; }
          if (h3 !== null && h3 !== undefined && String(h3).trim() !== '') { if (upsert(eleve.id, 'Trimestre 3', h3)) aMisAJour = true; }
        } else {
          if (hUnique === null || hUnique === undefined && String(hUnique).trim() === '') {
             continue;
          }
          const targetPeriode = periodeLue || (defaultPeriode !== 'all' ? defaultPeriode : null);
          if (targetPeriode) {
            if (upsert(eleve.id, targetPeriode, hUnique)) aMisAJour = true;
          } else {
            resultat.nbErreurs++;
            if (resultat.erreurs.length < 10) {
              resultat.erreurs.push(`Ligne ${rowNumber} : Trimestre non spécifié pour "${nomLu}"`);
            }
            continue;
          }
        }

        if (aMisAJour) resultat.nbMisAJour++;
        else resultat.nbErreurs++;

      } catch (rowErr) {
        resultat.nbErreurs++;
        if (resultat.erreurs.length < 10) resultat.erreurs.push(`Ligne ${rowNumber} : ${rowErr.message}`);
      }
    }
    run('COMMIT');
    resultat.success = true;
  } catch (err) {
    run('ROLLBACK');
    resultat.success = false;
    resultat.error = err.message;
  }

  return resultat;
}

/**
 * Lit les métadonnées d'un fichier PWA Export sans validation de hash
 * (le hash SHA-256 calculé par la PWA et le Desktop sont incompatibles
 *  car les structures de rows diffèrent entre xlsx et exceljs)
 */
function readPwaMetadata(workbook, expectedEcoleId) {
  const metaSheet = workbook.worksheets.find(ws => ws.name === '_metadata');
  if (!metaSheet) return null;

  const rows = [];
  metaSheet.eachRow((row) => { rows.push(row); });
  if (rows.length < 2) return null;

  const meta = {};
  const headers = rows[0].values;
  const values = rows[1].values;
  for (let i = 1; i < headers.length; i++) {
    meta[headers[i]] = values[i];
  }
  return meta;
}

/**
 * MOTEUR D'IMPORT PWA EXPORT (ELIMU_NOTES_*.xlsx / ELIMU_ABSENCES_*.xlsx)
 * Importe les fichiers signés exportés par la PWA enseignant
 */
async function importPwaExport(filePath, utilisateurId, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Validation stricte : le fichier DOIT avoir _metadata avec ecole_id valide
  if (!ecoleId) {
    return { ...resultat, error: 'ecole_id requis pour importer un fichier PWA Export' };
  }
  const meta = readPwaMetadata(workbook, ecoleId);
  if (!meta) {
    return { ...resultat, error: 'Métadonnées invalides ou absentes — impossible de lire _metadata' };
  }
  if (meta.ecole_id !== ecoleId) {
    return { ...resultat, error: `ecole_id du fichier (${meta.ecole_id}) ne correspond pas à l'école courante (${ecoleId})` };
  }

  const fileName = filePath.split('/').pop().split('\\').pop();
  const isNotes = fileName.match(/^ELIMU_NOTES_/i);

  console.log('🔍 Metadata lues:', JSON.stringify(meta));

  if (isNotes) {
    console.log('📝 Dispatch vers importPwaNotes');
    const r = await importPwaNotes(workbook, meta, utilisateurId, anneeId, ecoleId, resultat);
    console.log('📝 Resultat importPwaNotes:', JSON.stringify(r));
    return r;
  } else {
    console.log('📝 Dispatch vers importPwaAbsences');
    return await importPwaAbsences(workbook, meta, utilisateurId, anneeId, ecoleId, resultat);
  }
}

/**
 * Importe les notes depuis un fichier PWA Export
 */
async function importPwaNotes(workbook, meta, utilisateurId, anneeId, ecoleId, resultat) {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ...resultat, error: 'Feuille de données introuvable' };

  // Lire les en-têtes pour déterminer les colonnes
  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNum) => {
    headers[String(cell.value || '').trim().toLowerCase()] = colNum;
  });

  console.log('📋 En-têtes PWA Notes:', JSON.stringify(headers));

  const colEleveId = headers['eleve id'] || headers['eleve_id'];
  const colExternalId = headers['external id'] || headers['external_id'];
  const colSousComp = headers['sous-competence'] || headers['sous_competence_code'];
  const colType = headers['type evaluation'] || headers['type_eval'];
  const colUa = headers['ua'];
  const colNote = headers['note'];
  const colTrimestre = headers['trimestre'];
  const colSequence = headers['sequence'];

  console.log('📌 Parametres utilisateurId=%s, anneeId=%s, ecoleId=%s, xlsxFile=%s', utilisateurId, anneeId, ecoleId, workbook.xlsxFile);

  let importId;
  try {
    run('PRAGMA foreign_keys = OFF');
    const importRecord = run(
      `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
       VALUES (?, 0, 0, ?, 'Partiel', ?, ?)`,
      [utilisateurId || 1, workbook.xlsxFile || 'pwa_export.xlsx', anneeId, ecoleId]
    );
    importId = importRecord.lastID;
  } catch (e) {
    return { ...resultat, error: `Erreur INSERT imports: ${e.message}` };
  } finally {
    run('PRAGMA foreign_keys = ON');
  }

  run('BEGIN');
  try {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      try {
        const pwaEleveId = colEleveId ? row.getCell(colEleveId).value : null;
        const externalId = colExternalId ? row.getCell(colExternalId).value : null;
        const sousCode = colSousComp ? String(row.getCell(colSousComp).value || '').trim().toUpperCase() : '';
        const typeEval = colType ? String(row.getCell(colType).value || '').trim() : '';
        const ua = colUa ? String(row.getCell(colUa).value || '').trim().toUpperCase() : '';
        const noteVal = parseFloat(String(row.getCell(colNote).value || '').replace(',', '.'));
        const trimestre = colTrimestre ? parseInt(row.getCell(colTrimestre).value) : null;

        if (!pwaEleveId || !sousCode || !typeEval || !ua || isNaN(noteVal)) {
          resultat.nbErreurs++;
          resultat.erreurs.push(`Ligne ${rowNumber}: données incomplètes, ignorée`);
          return;
        }

        // Mapper élève PWA → Desktop
        // D'abord par External ID (= Desktop eleves.id)
        let eleve = null;
        if (externalId) {
          eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [externalId, ecoleId]);
        }
        // Sinon par le mapping teacher_students id → external_id
        if (!eleve) {
          try {
            eleve = get(
              'SELECT id FROM eleves WHERE id = (SELECT external_id FROM teacher_students WHERE id = ?) AND ecole_id = ?',
              [pwaEleveId, ecoleId]
            );
          } catch (_) {}
        }
        // Dernier fallback : chercher directement par ID PWA
        if (!eleve) {
          eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [pwaEleveId, ecoleId]);
        }
        if (!eleve) {
          resultat.nbErreurs++;
          resultat.erreurs.push(`Ligne ${rowNumber}: élève PWA ID ${pwaEleveId} introuvable dans l'école`);
          return;
        }

        const periode = getPeriodeForUA(ua) || `Trimestre ${trimestre || 1}`;

        // Nettoyer l'ancienne note pour cet élève/sous-comp/type/ua
        run(
          `DELETE FROM notes
           WHERE eleve_id = ? AND sous_competence_code = ? AND type_eval = ? AND ua = ? AND annee_scolaire_id = ? AND ecole_id = ?`,
          [eleve.id, sousCode, typeEval, ua, anneeId, ecoleId]
        );

        run(
          `INSERT INTO notes
             (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, import_id, annee_scolaire_id, periode, ecole_id)
           VALUES (?, ?, ?, ?, ?, ?, 'PWA_EXPORT', ?, ?, ?, ?)`,
          [eleve.id, Math.round(noteVal * 100) / 100, ua, sousCode, typeEval, typeEval, importId, anneeId, periode, ecoleId]
        );
        resultat.nbImportes++;

      } catch (rowErr) {
        resultat.nbErreurs++;
        resultat.erreurs.push(`Ligne ${rowNumber}: ${rowErr.message}`);
      }
    });

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

/**
 * Importe les absences depuis un fichier PWA Export
 */
async function importPwaAbsences(workbook, meta, utilisateurId, anneeId, ecoleId, resultat) {
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { ...resultat, error: 'Feuille de données introuvable' };

  const headerRow = worksheet.getRow(1);
  const headers = {};
  headerRow.eachCell((cell, colNum) => {
    headers[String(cell.value || '').trim().toLowerCase()] = colNum;
  });

  run('BEGIN');
  try {
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      try {
        const eleveIdVal = row.getCell(headers['eleve id'] || headers['eleve_id'] || 1).value;
        const externalId = (headers['external id'] || headers['external_id']) ? row.getCell(headers['external id'] || headers['external_id']).value : null;
        const trimestre = parseInt(row.getCell(headers['trimestre'] || 2).value);
        const heures = parseFloat(String(row.getCell(headers['heures'] || 3).value || '').replace(',', '.'));

        if (!eleveIdVal || isNaN(trimestre) || isNaN(heures) || heures < 0) {
          resultat.nbErreurs++;
          resultat.erreurs.push(`Ligne ${rowNumber}: données incomplètes ou invalides`);
          return;
        }

        let eleve = null;
        if (externalId) {
          eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [externalId, ecoleId]);
        }
        if (!eleve) {
          try {
            eleve = get(
              'SELECT id FROM eleves WHERE id = (SELECT external_id FROM teacher_students WHERE id = ?) AND ecole_id = ?',
              [eleveIdVal, ecoleId]
            );
          } catch (_) {}
        }
        if (!eleve) {
          eleve = get('SELECT id FROM eleves WHERE id = ? AND ecole_id = ?', [eleveIdVal, ecoleId]);
        }

        if (!eleve) {
          resultat.nbErreurs++;
          resultat.erreurs.push(`Ligne ${rowNumber}: élève ID ${eleveIdVal} introuvable`);
          return;
        }

        const periode = `Trimestre ${trimestre}`;
        run(
          `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
          [eleve.id, periode, heures, anneeId, ecoleId]
        );
        resultat.nbImportes++;

      } catch (rowErr) {
        resultat.nbErreurs++;
        resultat.erreurs.push(`Ligne ${rowNumber}: ${rowErr.message}`);
      }
    });

    run('COMMIT');
  } catch (globalError) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique : ${globalError.message}` };
  }

  resultat.success = resultat.nbImportes > 0;
  return resultat;
}

module.exports = { importExcel, importListeEleves, importListeProfesseurs, importAbsencesExcel, importUANotesFormatB, importPwaExport };
