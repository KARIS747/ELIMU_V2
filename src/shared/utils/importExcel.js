/**
 * importExcel.js - Module d'importation robuste et hybride d'Élimu V2
 * 
 * Ce module implémente le Dispatcher Pattern :
 * - Détecte automatiquement si un fichier provient de la PWA Enseignants (Système UA N1/N2)
 *   via son nom de fichier strict (ex: ELIMU_SIL_1A_UA1_2026_99.xlsx).
 * - Oriente l'importation soit vers le moteur UA (importUANotes), soit vers le moteur
 *   classique V1 (importClassicNotes).
 *
 * Développé selon des standards de niveau Senior (isolation, robustesse, transactions).
 */

const ExcelJS = require('exceljs');
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
 * Point d'entrée principal (Dispatcher Pattern)
 * @param {string} filePath      - Chemin complet vers le fichier Excel
 * @param {number} classeId      - ID de la classe concernée
 * @param {number} matiereId     - ID de la matière (concerne N3 classique)
 * @param {string} periode       - Ex: "Trimestre 1"
 * @param {number} sequence      - Ex: 1, 2
 * @param {number} utilisateurId - ID de l'utilisateur
 * @param {number} anneeId       - ID de l'année scolaire
 * @returns {Promise<Object>}    Résultat détaillé
 */
async function importExcel(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null) {
  const fileName = filePath.split('/').pop().split('\\').pop();
  
  // Format attendu V2 : ELIMU_{CLASSE}_{CODE}_{UA}_{ANNEE}_{ID}.xlsx
  const uaMatch = fileName.match(/^ELIMU_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^\.]+)\.xlsx$/i);
  
  if (uaMatch) {
    const sousCompetenceCode = uaMatch[2].toUpperCase();
    const ua = uaMatch[3].toUpperCase();
    console.log(`🚀 Dispatcher : Format V2 détecté. Ingestion UA (${sousCompetenceCode} - ${ua}) pour la classe ${classeId}`);
    return await importUANotes(filePath, classeId, sousCompetenceCode, ua, utilisateurId, anneeId);
  } else {
    console.log(`🚀 Dispatcher : Format classique V1 détecté pour la classe ${classeId}`);
    return await importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId);
  }
}

/**
 * MOTEUR D'INGESTION V2 (Système qualitatif par Unités d'Apprentissage)
 */
async function importUANotes(filePath, classeId, sousCompetenceCode, ua, utilisateurId, anneeId = null) {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const { genererTranchesPourEleve } = require('../../main/utils/financeUtils');

  // 1. Validation taille fichier
  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024) {
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };
  }

  // 2. Détermination du niveau technique (N1 ou N2)
  const classe = get('SELECT nom_classe, niveau, niveau_v2 FROM classes WHERE id = ?', [classeId]);
  if (!classe) {
    return { ...resultat, error: 'Classe non trouvée' };
  }

  let lvl = classe.niveau_v2;
  if (!lvl) {
    const nom = (classe.nom_classe || '').toUpperCase();
    if (nom.includes('SIL') || nom.includes('CP')) lvl = 'N1';
    else if (nom.includes('CE1') || nom.includes('CE2')) lvl = 'N2';
  }

  if (lvl !== 'N1' && lvl !== 'N2') {
    return { ...resultat, error: `La classe "${classe.nom_classe}" n'est pas configurée pour le système d'UA (Niveau 1 ou 2).` };
  }

  // 3. Récupération et validation du curriculum
  const template = CURRICULUM_TEMPLATES[lvl];
  if (!template) {
    return { ...resultat, error: `Curriculum non trouvé pour le niveau "${lvl}"` };
  }

  let subComp = null;
  for (const compId in template.competences) {
    const comp = template.competences[compId];
    if (comp.sousCompetences && comp.sousCompetences[sousCompetenceCode]) {
      subComp = comp.sousCompetences[sousCompetenceCode];
      break;
    }
  }

  if (!subComp) {
    return { ...resultat, error: `Code de sous-compétence "${sousCompetenceCode}" invalide pour le niveau "${lvl}"` };
  }

  // 4. Lecture du fichier Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };
  }

  // 5. Récupération des élèves
  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ?',
    [classeId, anneeId]
  );

  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  // 6. Enregistrement de l'import (matiere_id = NULL pour UA)
  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id)
     VALUES (?, ?, NULL, ?, 'Partiel', ?)`,
    [utilisateurId || 1, classeId, fileName, anneeId]
  );
  const importId = importRecord.lastID;

  // 7. Lecture des lignes
  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Ignorer l'en-tête
    lignes.push({ row, rowNumber });
  });

  // 8. Transaction atomique
  run('BEGIN');
  try {
    for (const { row, rowNumber } of lignes) {
      try {
        const col1 = String(row.getCell(1).value || '').trim();
        const col2 = row.getCell(2).value;

        if (!col1 || col1 === 'N°' || col1 === 'N' || /^\d+$/.test(col1)) {
          continue;
        }

        const nomLu = col1;
        const prenomLu = String(col2 || '').trim();

        let eleve = trouverEleve(eleves, nomLu, prenomLu);
        let eleveId;

        if (!eleve) {
          // Création automatique de l'élève si absent
          try {
            const inserted = run(
              'INSERT INTO eleves (nom, prenom, sexe, classe_id, annee_scolaire_id) VALUES (?, ?, ?, ?, ?)',
              [nomLu, prenomLu, 'M', classeId, anneeId]
            );
            eleveId = inserted.lastID;
            eleve = { id: eleveId, nom: nomLu, prenom: prenomLu };
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

        // Déterminer le trimestre depuis l'UA
        const periode = getPeriodeForUA(ua);

        // Configuration dynamique des types d'évaluations selon le curriculum
        const evaluations = [
          { type: 'orale',       col: 3, max: subComp.orale },
          { type: 'ecrite',      col: 4, max: subComp.ecrite },
          { type: 'pratique',    col: 5, max: subComp.pratique },
          { type: 'savoirEtre',  col: 6, max: subComp.savoirEtre }
        ];

        const subNotes = {};
        let hasSaves = false;

        for (const evalInfo of evaluations) {
          if (evalInfo.max && evalInfo.max > 0) {
            const rawVal = row.getCell(evalInfo.col).value;
            if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '') {
              const val = parseFloat(String(rawVal).replace(',', '.'));
              if (isNaN(val) || val < 0 || val > evalInfo.max) {
                resultat.erreurs.push(`Ligne ${rowNumber}: Note ${evalInfo.type} "${rawVal}" invalide (Maximum autorisé : ${evalInfo.max})`);
                resultat.nbErreurs++;
              } else {
                // Nettoyage avant insertion pour garantir l'unicité du couple
                run(
                  `DELETE FROM notes 
                   WHERE eleve_id = ? AND sous_competence_code = ? AND sous_type = ? AND ua = ? AND annee_scolaire_id = ?`,
                  [eleveId, sousCompetenceCode, evalInfo.type, ua, anneeId]
                );

                // Insertion de la sous-note
                run(
                  `INSERT INTO notes 
                     (eleve_id, note, ua, sous_competence_code, sous_type, source, import_id, annee_scolaire_id, periode)
                   VALUES (?, ?, ?, ?, ?, 'EXCEL', ?, ?, ?)`,
                  [eleveId, val, ua, sousCompetenceCode, evalInfo.type, importId, anneeId, periode]
                );
                resultat.nbImportes++;
                hasSaves = true;
                subNotes[evalInfo.type] = val;
              }
            }
          }
        }

        // Calculer et insérer la note agrégée pondérée
        const weights = getWeightsForSousCompetence(lvl, sousCompetenceCode);
        if (weights && Object.keys(subNotes).length > 0) {
          const aggNote = calcAggregateFromSubNotes(subNotes, weights);
          if (aggNote !== null) {
            // Nettoyer l'ancien agrégat
            run(
              `DELETE FROM notes
               WHERE eleve_id = ? AND sous_competence_code = ? AND sous_type IS NULL AND ua = ? AND annee_scolaire_id = ?`,
              [eleveId, sousCompetenceCode, ua, anneeId]
            );
            run(
              `INSERT INTO notes
                 (eleve_id, note, ua, sous_competence_code, sous_type, source, import_id, annee_scolaire_id, periode)
               VALUES (?, ?, ?, ?, NULL, 'EXCEL', ?, ?, ?)`,
              [eleveId, aggNote, ua, sousCompetenceCode, importId, anneeId, periode]
            );
            resultat.nbImportes++;
          }
        }

        if (!hasSaves && resultat.nbErreurs === 0) {
          resultat.avertissements.push(`Ligne ${rowNumber}: Aucune évaluation trouvée pour "${nomLu} ${prenomLu}"`);
        }

      } catch (rowError) {
        resultat.erreurs.push(`Ligne ${rowNumber}: Erreur — ${rowError.message}`);
        resultat.nbErreurs++;
      }
    }
    run('COMMIT');
  } catch (globalError) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique lors de l'insertion : ${globalError.message}` };
  }

  const statut = resultat.nbErreurs === 0 ? 'Succès' : resultat.nbImportes > 0 ? 'Partiel' : 'Échec';
  run(
    `UPDATE imports SET statut=?, nb_importes=?, nb_erreurs=?, message=? WHERE id=?`,
    [
      statut,
      resultat.nbImportes,
      resultat.nbErreurs,
      `${resultat.nbImportes} évaluation(s) UA importée(s), ${resultat.nbErreurs} erreur(s)`,
      importId
    ]
  );

  resultat.success = resultat.nbImportes > 0;
  resultat.statut = statut;
  return resultat;
}

/**
 * MOTEUR D'INGESTION V1 (Système classique quantitatif pour Niveau 3)
 */
async function importClassicNotes(filePath, classeId, matiereId, periode, sequence, utilisateurId, anneeId = null) {
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

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };
  }

  // Récupération des élèves
  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ?',
    [classeId, anneeId]
  );

  if (!eleves || eleves.length === 0) {
    return { ...resultat, error: 'Aucun élève trouvé dans cette classe' };
  }

  // Enregistrement d'import
  const fileName = filePath.split('/').pop().split('\\').pop();
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, classe_id, matiere_id, fichier_nom, statut, annee_scolaire_id)
     VALUES (?, ?, ?, ?, 'Partiel', ?)`,
    [utilisateurId || 1, classeId, matiereId, fileName, anneeId]
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
              'INSERT INTO eleves (nom, prenom, sexe, classe_id, annee_scolaire_id) VALUES (?, ?, ?, ?, ?)',
              [nomLu, prenomLu || '', 'M', classeId, anneeId]
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
             (eleve_id, matiere_id, note, periode, sequence, import_id, annee_scolaire_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [eleveId, matiereId, noteLue, periode || 'Trimestre 1', sequence || 1, importId, anneeId]
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
async function importListeEleves(filePath, classeId, mode = 'ajoute', utilisateurId = null, anneeId = null) {
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
      run('UPDATE eleves SET classe_id = NULL WHERE classe_id = ?', [classeId]);
      resultat.nbRemplaces = lignes.length;
    }

    const elevesActuels = all(
      'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ?', 
      [classeId, anneeId]
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
           WHERE LOWER(nom) = LOWER(?) AND LOWER(prenom) = LOWER(?)
           LIMIT 1`,
          [nom, prenom]
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
            'UPDATE eleves SET classe_id = ?, sexe = ?, nom_parent = ?, telephone_parent = ? WHERE id = ?',
            [classeId, sexe, nomParent, telParent, eleveGlobal.id]
          );
          eleveId = eleveGlobal.id;
          resultat.nbAjoutes++;
          estNouveau = true; 
        } else {
          const inserted = run(
            'INSERT INTO eleves (nom, prenom, date_naissance, sexe, classe_id, nom_parent, telephone_parent, annee_scolaire_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nom, prenom, dateStr, sexe, classeId, nomParent, telParent, anneeId]
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
 * Importe une liste de professeurs
 */
async function importListeProfesseurs(filePath, mode = 'ajouter', utilisateurId = null) {
  const resultat = {
    success:  false,
    nbAjoutes: 0,
    nbIgnores: 0,
    nbErreurs: 0,
    erreurs:   []
  };

  const fs = require('fs');
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
    const nom        = String(row.getCell(1).value || '').trim();
    const prenom     = String(row.getCell(2).value || '').trim();
    const matiere    = String(row.getCell(3).value || '').trim() || null;
    const civilite   = String(row.getCell(4).value || '').trim() || null;
    const sexe       = String(row.getCell(5).value || '').trim().toUpperCase() || null;
    const tel        = String(row.getCell(6).value || '').trim() || null;
    const email      = String(row.getCell(7).value || '').trim() || null;
    const specialite = String(row.getCell(8).value || '').trim() || null;
    const diplome    = String(row.getCell(9).value || '').trim() || null;
    const ville      = String(row.getCell(10).value || '').trim() || null;

    if (nom || prenom) {
      lignes.push({ 
        nom, prenom, matiere, civilite, sexe, 
        tel, email, specialite, diplome, ville,
        rowNumber 
      });
    }
  });

  if (!lignes.length) {
    return { ...resultat, error: 'Aucune ligne de données trouvée dans le fichier' };
  }

  run('BEGIN');
  try {
    if (mode === 'remplacer') {
      run(`DELETE FROM professeurs_classes`);
      run(`UPDATE classes SET professeur_principal_id = NULL`);
      run(`DELETE FROM professeurs`);
    }

    const profsActuels = all(`SELECT id, nom, prenom FROM professeurs`);

    const normaliser = s =>
      (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    for (const rowData of lignes) {
      const { nom, prenom, matiere, civilite, sexe, tel, email, specialite, diplome, ville, rowNumber } = rowData;
      try {
        if (!nom) {
          resultat.erreurs.push(`Ligne ${rowNumber} : nom manquant, ignorée`);
          resultat.nbErreurs++;
          continue;
        }
        if (!prenom) {
          resultat.erreurs.push(`Ligne ${rowNumber} : prénom manquant pour "${nom}", ignorée`);
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

        const r = run(
          `INSERT INTO professeurs (
            nom, prenom, matiere_principale, civilite, sexe, 
            telephone, email, specialite, diplome_max, ville, actif
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [nom, prenom, matiere, civilite, sexe, tel, email, specialite, diplome, ville]
        );
        profsActuels.push({ id: r.lastID, nom, prenom });
        resultat.nbAjoutes++;

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
async function importAbsencesExcel(filePath, classeId, uid = null, anneeId = null, defaultPeriode = 'all') {
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
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ?',
    [classeId, anneeId]
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
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, periode, h, anneeId]
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

module.exports = { importExcel, importListeEleves, importListeProfesseurs, importAbsencesExcel };
