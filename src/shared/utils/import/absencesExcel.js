const ExcelJS = require('exceljs');
const { run, all, get } = require('../../database/db');

/**
 * importAbsencesExcel — importe un fichier Excel d'absences au format export PWA
 * (colonnes : Nom, Prenom, Trimestre, Heures absence [, Classe])
 * et met à jour les heures d'absence par trimestre (table heures_absence).
 *
 * Formats reconnus :
 *  - PWA  : Nom | Prenom | Trimestre | Heures absence [| Classe]
 *  - Modèle multi-périodes : Nom | Prenom | Trimestre 1 | Trimestre 2 | Trimestre 3
 *  - Modèle mono-période   : Nom | Prenom | Heures (Trimestre x)
 */
async function importAbsencesExcel(filePath, classeId, utilisateurId = null, anneeId = null, periode = null, ecoleId = '') {
  const resultat = { success: false, nbMisAJour: 0, nbErreurs: 0, erreurs: [] };

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024)
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // ── Élèves (école + année) avec leur classe ────────────────────────────────
  const eleves = all(
    `SELECT e.id, e.nom, e.prenom, e.classe_id, c.nom_classe
     FROM eleves e LEFT JOIN classes c ON c.id = e.classe_id
     WHERE e.ecole_id = ? AND e.annee_scolaire_id = ?`,
    [ecoleId, anneeId]
  );
  if (!eleves.length)
    return { ...resultat, error: 'Aucun élève trouvé pour cette école et cette année' };

  // ── En-têtes (détection du format) ─────────────────────────────────────────
  const headerCells = worksheet.getRow(1);
  const headers = [];
  headerCells.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = normaliser(cell.value);
  });

  const indexDe = (liste) => headers.findIndex(h => liste.includes(h));
  const nomIdx    = indexDe(['nom', 'name', 'lastname']);
  const prenomIdx = indexDe(['prenom', 'prénom', 'prenoms', 'firstname']);
  const trimCol   = indexDe(['trimestre', 'periode', 'période', 'period', 'quarter']);
  const heureCol  = indexDe(['heures absence', 'heures absences', 'heures', 'nb heures', 'hours']);
  const t1Idx     = indexDe(['trimestre 1', 'quarter 1', 't1', 'tr1']);
  const t2Idx     = indexDe(['trimestre 2', 'quarter 2', 't2', 'tr2']);
  const t3Idx     = indexDe(['trimestre 3', 'quarter 3', 't3', 'tr3']);
  const classeIdx = indexDe(['classe', 'class']);

  const modelePeriode = headers.findIndex(h => h && h.startsWith('heures (trimestre'));

  let mode = 'pwa';
  if (trimCol >= 0 && heureCol >= 0) mode = 'pwa';
  else if (t1Idx >= 0 || t2Idx >= 0 || t3Idx >= 0) mode = 'multi';
  else if (modelePeriode >= 0) mode = 'mono';

  const mapPeriode = (raw) => {
    const p = normaliser(raw);
    if (!p) return null;
    if (p.includes('1')) return 'Trimestre 1';
    if (p.includes('2')) return 'Trimestre 2';
    if (p.includes('3')) return 'Trimestre 3';
    return null;
  };

  const parseHeures = (raw) => {
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    if (s === '') return null;
    const n = parseFloat(s);
    return isNaN(n) || n < 0 ? null : n;
  };

  const trouverEleve = (nom, prenom, classeNom) => {
    const nN = normaliser(nom), nP = normaliser(prenom);
    return eleves.find(e =>
      normaliser(e.nom) === nN && normaliser(e.prenom) === nP &&
      (!classeNom || normaliser(e.nom_classe) === normaliser(classeNom))
    );
  };

  const upsert = (eleveId, peri, heures) => {
    const h = parseHeures(heures);
    if (h === null) return false;
    if (periode && periode !== 'all' && peri !== periode) return false;
    run(
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id, ecole_id) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, peri, h, anneeId, ecoleId]
    );
    return true;
  };

  run('BEGIN');
  try {
    let nbLignes = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      nbLignes++;
      try {
        const nom    = String(row.getCell(nomIdx >= 0 ? nomIdx : 1).value || '').trim();
        const prenom = String(row.getCell(prenomIdx >= 0 ? prenomIdx : 2).value || '').trim();
        if (!nom) return;

        const classeNom = classeIdx >= 0
          ? String(row.getCell(classeIdx).value || '').trim()
          : null;
        const eleve = trouverEleve(nom, prenom, classeNom);
        if (!eleve) {
          resultat.erreurs.push(`Ligne ${rowNumber}: Élève "${nom} ${prenom}" non trouvé`);
          resultat.nbErreurs++;
          return;
        }

        if (mode === 'pwa') {
          const peri = mapPeriode(row.getCell(trimCol).value);
          if (!peri) {
            resultat.erreurs.push(`Ligne ${rowNumber}: période "${row.getCell(trimCol).value}" non reconnue`);
            resultat.nbErreurs++;
            return;
          }
          if (upsert(eleve.id, peri, row.getCell(heureCol).value)) resultat.nbMisAJour++;
          else resultat.nbErreurs++;
        } else if (mode === 'mono') {
          const peri = modelePeriode >= 0 ? mapPeriode(headers[modelePeriode]) : mapPeriode(periode);
          if (!peri) {
            resultat.erreurs.push(`Ligne ${rowNumber}: période non reconnue`);
            resultat.nbErreurs++;
            return;
          }
          if (upsert(eleve.id, peri, row.getCell(modelePeriode >= 0 ? modelePeriode : 3).value)) resultat.nbMisAJour++;
          else resultat.nbErreurs++;
        } else {
          const valeurs = [t1Idx, t2Idx, t3Idx].map(i =>
            i >= 0 ? row.getCell(i).value : undefined
          );
          let updated = 0;
          if (valeurs[0] !== undefined && upsert(eleve.id, 'Trimestre 1', valeurs[0])) updated++;
          if (valeurs[1] !== undefined && upsert(eleve.id, 'Trimestre 2', valeurs[1])) updated++;
          if (valeurs[2] !== undefined && upsert(eleve.id, 'Trimestre 3', valeurs[2])) updated++;
          if (updated > 0) resultat.nbMisAJour++;
          else resultat.nbErreurs++;
        }
      } catch (rowErr) {
        resultat.erreurs.push(`Ligne ${rowNumber}: ${rowErr.message}`);
        resultat.nbErreurs++;
      }
    });

    if (!nbLignes) {
      run('ROLLBACK');
      return { ...resultat, error: 'Aucune ligne de données trouvée' };
    }
    run('COMMIT');
    resultat.success = true;
    return resultat;
  } catch (err) {
    run('ROLLBACK');
    return { ...resultat, error: `Erreur critique : ${err.message}` };
  }
}

module.exports = { importAbsencesExcel };
