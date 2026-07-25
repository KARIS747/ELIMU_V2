const ExcelJS = require('exceljs');
const { run, get, all } = require('../../database/db');
const { getWeightsForSousCompetence, calcAggregateFromSubNotes, getPeriodeForUA } = require('../../constants/curriculum');
const { defaultLogger, trouverEleve, readPwaMetadata } = require('./helpers');

async function importPwaExport(filePath, utilisateurId, anneeId = null, ecoleId = '') {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbNotes: 0,
    nbAbsences: 0,
    nbErreurs: 0,
    erreurs: [],
    avertissements: []
  };

  const { genererTranchesPourEleve } = require('../../../main/utils/financeUtils');

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024)
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const meta = readPwaMetadata(workbook, ecoleId);
  if (meta && meta.ecole_id && meta.ecole_id !== ecoleId) {
    return { ...resultat, error: `L'export PWA ne correspond pas à cette école (${meta.ecole_id} ≠ ${ecoleId})` };
  }

  for (const ws of workbook.worksheets) {
    if (ws.name === '_metadata') continue;

    const sheetType = detectSheetType(ws);
    switch (sheetType) {
      case 'notes':
        await importPwaNotesSheet(ws, resultat, ecoleId, anneeId, genererTranchesPourEleve, utilisateurId);
        break;
      case 'notes_n3':
        await importPwaNotesN3Sheet(ws, resultat, ecoleId, anneeId, utilisateurId);
        break;
      case 'absences':
        await importPwaAbsencesSheet(ws, resultat, ecoleId, anneeId);
        break;
      case 'eleves':
        await importPwaElevesSheet(ws, resultat, ecoleId, anneeId, genererTranchesPourEleve);
        break;
      default:
        resultat.avertissements.push(`Feuille "${ws.name}" ignorée (format inconnu)`);
    }
  }

  resultat.nbImportes = resultat.nbNotes + resultat.nbAbsences;
  resultat.statut = resultat.nbErreurs === 0 ? 'Succès' : resultat.nbImportes > 0 ? 'Partiel' : 'Échec';
  resultat.success = resultat.nbNotes > 0 || resultat.nbAbsences > 0 || resultat.nbErreurs === 0;
  return resultat;
}

function detectSheetType(ws) {
  const headerRow = [];
  const row = ws.getRow(1);
  row.eachCell((cell) => { headerRow.push(String(cell.value || '').toLowerCase().trim()); });

  const h = headerRow.join(' ');
  if (h.includes('nom') && h.includes('prenom') && h.includes('matiere') && h.includes('sequence'))
    return 'notes_n3';
  if (h.includes('nom') && h.includes('prenom') && (h.includes('sous_competence') || h.includes('sous-competence')) && h.includes('ua'))
    return 'notes';
  if (h.includes('nom') && h.includes('prenom') && (h.includes('motif') || h.includes('justifie')))
    return 'absences';
  if (h.includes('nom') && h.includes('prenom') && h.includes('sexe'))
    return 'eleves';

  const colCount = headerRow.filter(h => h).length;
  if (colCount >= 2) return 'notes';
  return 'unknown';
}

async function importPwaNotesSheet(ws, resultat, ecoleId, anneeId, genererTranchesPourEleve, utilisateurId) {
  const lignes = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    lignes.push({ row, rowNumber });
  });

  const classeCache = {};

  for (const { row, rowNumber } of lignes) {
    try {
      const nomClass = String(row.getCell(1).value || '').trim();
      const pPrenom  = String(row.getCell(2).value || '').trim();
      const ua       = String(row.getCell(3).value || '').trim().toUpperCase();
      const sousCode = String(row.getCell(4).value || '').trim();
      const orale    = parseFloat(String(row.getCell(5).value || '').replace(',', '.'));
      const ecrite   = parseFloat(String(row.getCell(6).value || '').replace(',', '.'));
      const pratique = parseFloat(String(row.getCell(7).value || '').replace(',', '.'));
      const savoirEtre = parseFloat(String(row.getCell(8).value || '').replace(',', '.'));
      const classeNom  = String(row.getCell(9).value || '').trim();

      if (!ua || !sousCode || !classeNom) continue;

      if (!classeCache[classeNom]) {
        classeCache[classeNom] = get('SELECT id, niveau_v2, nom_classe FROM classes WHERE nom_classe=? AND ecole_id=?', [classeNom, ecoleId]);
      }
      const classe = classeCache[classeNom];
      if (!classe) {
        resultat.avertissements.push(`Notes L${rowNumber}: Classe "${classeNom}" introuvable`);
        continue;
      }

      let lvl = classe.niveau_v2;
      if (!lvl) {
        const n = (classe.nom_classe || '').toUpperCase();
        if (n.includes('SIL') || n.includes('CP')) lvl = 'N1';
        else if (n.includes('CE1') || n.includes('CE2')) lvl = 'N2';
        else if (n.includes('CM1') || n.includes('CM2')) lvl = 'N3';
      }

      if (lvl !== 'N1' && lvl !== 'N2') {
        resultat.avertissements.push(`Notes L${rowNumber}: Classe "${classeNom}" niveau non N1/N2`);
        continue;
      }

      const eleves = all(
        'SELECT id, nom, prenom FROM eleves WHERE classe_id=? AND annee_scolaire_id=? AND ecole_id=?',
        [classe.id, anneeId, ecoleId]
      );

      let eleve = trouverEleve(eleves, nomClass, pPrenom);
      if (!eleve) {
        try {
          const inserted = run(
            'INSERT INTO eleves (nom, prenom, classe_id, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)',
            [nomClass, pPrenom, classe.id, anneeId, ecoleId]
          );
          eleve = { id: inserted.lastID, nom: nomClass, prenom: pPrenom };
          eleves.push(eleve);
          if (anneeId) genererTranchesPourEleve(eleve.id, anneeId, defaultLogger, ecoleId);
        } catch (e) {
          resultat.erreurs.push(`Notes L${rowNumber}: Impossible de créer élève "${nomClass} ${pPrenom}"`);
          resultat.nbErreurs++;
          continue;
        }
      }

      const weights = getWeightsForSousCompetence(lvl, sousCode);
      if (!weights) {
        resultat.erreurs.push(`Notes L${rowNumber}: Code "${sousCode}" invalide pour ${lvl}`);
        resultat.nbErreurs++;
        continue;
      }

      const periode = getPeriodeForUA(ua);
      if (!periode) {
        resultat.erreurs.push(`Notes L${rowNumber}: UA "${ua}" invalide`);
        resultat.nbErreurs++;
        continue;
      }

      const types = ['orale', 'ecrite', 'pratique', 'savoirEtre'];
      const vals  = [orale, ecrite, pratique, savoirEtre];
      const subNotes = {};
      let hasNote = false;

      for (let i = 0; i < types.length; i++) {
        const t = types[i];
        const maxP = weights[t] || 1;
        const v = vals[i];

        if (isNaN(v) || v < 0) continue;
        if (v > maxP) {
          resultat.erreurs.push(`Notes L${rowNumber}: Note ${t} "${v}" > max ${maxP}`);
          resultat.nbErreurs++;
          continue;
        }

        subNotes[t] = v;  // raw value pour l'agregat (pas /20)

        run(
          `DELETE FROM notes WHERE eleve_id=? AND sous_competence_code=? AND (sous_type=? OR type_eval=?) AND ua=? AND annee_scolaire_id=? AND ecole_id=?`,
          [eleve.id, sousCode, t, t, ua, anneeId, ecoleId]
        );
        run(
          `INSERT INTO notes (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, annee_scolaire_id, periode, ecole_id) VALUES (?, ?, ?, ?, ?, ?, 'PWA', ?, ?, ?)`,
          [eleve.id, v, ua, sousCode, t, t, anneeId, periode, ecoleId]
        );
        resultat.nbNotes++;
        hasNote = true;
      }

      if (!hasNote) continue;

      const agg = calcAggregateFromSubNotes(subNotes, weights);
      if (agg !== null) {
        run(
          `DELETE FROM notes WHERE eleve_id=? AND sous_competence_code=? AND sous_type IS NULL AND ua=? AND annee_scolaire_id=? AND ecole_id=?`,
          [eleve.id, sousCode, ua, anneeId, ecoleId]
        );
        run(
          `INSERT INTO notes (eleve_id, note, ua, sous_competence_code, type_eval, sous_type, source, annee_scolaire_id, periode, ecole_id) VALUES (?, ?, ?, ?, NULL, NULL, 'PWA', ?, ?, ?)`,
          [eleve.id, Math.round(agg * 100) / 100, ua, sousCode, anneeId, periode, ecoleId]
        );
        resultat.nbNotes++;
      }
    } catch (rowErr) {
      resultat.erreurs.push(`Notes L${rowNumber}: ${rowErr.message}`);
      resultat.nbErreurs++;
    }
  }
}

async function importPwaNotesN3Sheet(ws, resultat, ecoleId, anneeId, utilisateurId) {
  const { CURRICULUM_TEMPLATES } = require('../../constants/curriculum');
  const matieresMap = CURRICULUM_TEMPLATES.N3.matieresFixes;

  const fileName = ws.workbook ? (ws.workbook.fileName || 'PWA') : 'PWA';
  const importRecord = run(
    `INSERT INTO imports (utilisateur_id, fichier_nom, statut, annee_scolaire_id, ecole_id)
     VALUES (?, ?, 'Partiel', ?, ?)`,
    [utilisateurId || 1, fileName, anneeId, ecoleId]
  );
  const importId = importRecord.lastID;

  const lignes = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    lignes.push({ row, rowNumber });
  });

  const classeCache = {};
  let nbInserted = 0;

  for (const { row, rowNumber } of lignes) {
    try {
      const nom      = String(row.getCell(1).value || '').trim();
      const prenom   = String(row.getCell(2).value || '').trim();
      const matCode  = String(row.getCell(3).value || '').trim().toUpperCase();
      const noteVal  = parseFloat(String(row.getCell(4).value || '').replace(',', '.'));
      const seq      = parseInt(String(row.getCell(5).value || '1').trim(), 10);
      const trim     = String(row.getCell(6).value || '').trim();
      const classeNom = String(row.getCell(7).value || '').trim();

      if (!nom || !classeNom || isNaN(noteVal) || noteVal < 0) continue;

      if (!classeCache[classeNom]) {
        classeCache[classeNom] = get('SELECT id FROM classes WHERE nom_classe=? AND ecole_id=?', [classeNom, ecoleId]);
      }
      const classe = classeCache[classeNom];
      if (!classe) {
        resultat.avertissements.push(`N3 L${rowNumber}: Classe "${classeNom}" introuvable`);
        continue;
      }

      const eleves = all(
        'SELECT id, nom, prenom FROM eleves WHERE classe_id=? AND annee_scolaire_id=? AND ecole_id=?',
        [classe.id, anneeId, ecoleId]
      );

      let eleve = trouverEleve(eleves, nom, prenom);
      if (!eleve) {
        try {
          const inserted = run(
            'INSERT INTO eleves (nom, prenom, classe_id, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, classe.id, anneeId, ecoleId]
          );
          eleve = { id: inserted.lastID, nom, prenom };
          eleves.push(eleve);
        } catch (e) {
          resultat.erreurs.push(`N3 L${rowNumber}: Impossible de créer élève "${nom} ${prenom}"`);
          resultat.nbErreurs++;
          continue;
        }
      }

      const fullName = matieresMap[matCode];
      if (!fullName) {
        resultat.erreurs.push(`N3 L${rowNumber}: Code matière "${matCode}" inconnu`);
        resultat.nbErreurs++;
        continue;
      }

      let matiere = get('SELECT id FROM matieres WHERE nom_matiere=?', [fullName]);
      if (!matiere) {
        const r = run('INSERT INTO matieres (nom_matiere, coefficient) VALUES (?, 1)', [fullName]);
        matiere = { id: r.lastID };
      }

      const trimNum = parseInt(trim.replace(/\D/g, ''), 10) || 1;
      const periode = 'Trimestre ' + trimNum;

      run(
        `INSERT OR REPLACE INTO notes (eleve_id, matiere_id, note, periode, sequence, import_id, source, annee_scolaire_id, ecole_id)
         VALUES (?, ?, ?, ?, ?, ?, 'PWA', ?, ?)`,
        [eleve.id, matiere.id, noteVal, periode, seq, importId, anneeId, ecoleId]
      );
      nbInserted++;
    } catch (rowErr) {
      resultat.erreurs.push(`N3 L${rowNumber}: ${rowErr.message}`);
      resultat.nbErreurs++;
    }
  }

  resultat.nbNotes += nbInserted;

  if (importId) {
    const statut = resultat.nbErreurs === 0 ? 'Succès' : nbInserted > 0 ? 'Partiel' : 'Échec';
    run(
      `UPDATE imports SET statut=?, nb_importes=?, nb_erreurs=?, message=? WHERE id=?`,
      [statut, nbInserted, resultat.nbErreurs, `${nbInserted} note(s) N3 importée(s), ${resultat.nbErreurs} erreur(s)`, importId]
    );
  }
}

async function importPwaAbsencesSheet(ws, resultat, ecoleId, anneeId) {
  const lignes = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    lignes.push({ row, rowNumber });
  });

  for (const { row, rowNumber } of lignes) {
    try {
      const nom     = String(row.getCell(1).value || '').trim();
      const prenom  = String(row.getCell(2).value || '').trim();
      const dateStr = String(row.getCell(3).value || '').trim();
      const motif   = String(row.getCell(4).value || '').trim() || 'Non justifié';
      const justifie = ['OUI', 'O', 'YES', 'Y', '1'].includes(
        String(row.getCell(5).value || '').trim().toUpperCase()
      );
      const classeNom = String(row.getCell(6).value || '').trim();

      if (!nom || !dateStr) continue;

      const classe = classeNom
        ? get('SELECT id FROM classes WHERE nom_classe=? AND ecole_id=?', [classeNom, ecoleId])
        : null;

      const eleve = classe
        ? get(
            'SELECT id FROM eleves WHERE LOWER(nom)=LOWER(?) AND LOWER(prenom)=LOWER(?) AND classe_id=? AND ecole_id=?',
            [nom, prenom, classe.id, ecoleId]
          )
        : get(
            'SELECT id FROM eleves WHERE LOWER(nom)=LOWER(?) AND LOWER(prenom)=LOWER(?) AND ecole_id=?',
            [nom, prenom, ecoleId]
          );

      if (!eleve) {
        resultat.erreurs.push(`Absences L${rowNumber}: Élève "${nom} ${prenom}" non trouvé`);
        resultat.nbErreurs++;
        continue;
      }

      run(
        `INSERT INTO absences (eleve_id, date, motif, justifie, annee_scolaire_id, ecole_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eleve.id, dateStr, motif, justifie ? 1 : 0, anneeId, ecoleId]
      );
      resultat.nbAbsences++;
    } catch (rowErr) {
      resultat.erreurs.push(`Absences L${rowNumber}: ${rowErr.message}`);
      resultat.nbErreurs++;
    }
  }
}

async function importPwaElevesSheet(ws, resultat, ecoleId, anneeId, genererTranchesPourEleve) {
}

module.exports = { importPwaExport, importPwaNotesSheet, importPwaNotesN3Sheet, importPwaAbsencesSheet, importPwaElevesSheet, detectSheetType };