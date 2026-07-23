const ExcelJS = require('exceljs');
const { run, all } = require('../../database/db');

async function importAbsencesExcel(filePath, classeId, utilisateurId = null, anneeId = null, periode = null, ecoleId = '') {
  const resultat = { success: false, nbImportes: 0, nbErreurs: 0, erreurs: [] };

  const fs = require('fs');
  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024)
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? AND annee_scolaire_id = ? AND ecole_id = ?',
    [classeId, anneeId, ecoleId]
  );

  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const nom    = String(row.getCell(1).value || '').trim();
    const prenom = String(row.getCell(2).value || '').trim();
    const motif  = String(row.getCell(3).value || '').trim();
    const justifie = ['OUI', 'O', 'YES', 'Y', '1'].includes(
      String(row.getCell(4).value || '').trim().toUpperCase()
    );
    if (nom) lignes.push({ nom, prenom, rowNumber, motif: motif || 'Non justifie', justifie });
  });

  if (!lignes.length)
    return { ...resultat, error: 'Aucune ligne de donnees trouvee' };

  const today = new Date().toISOString().split('T')[0];

  run('BEGIN');
  try {
    for (const { nom, prenom, motif, justifie, rowNumber } of lignes) {
      try {
        const normaliser = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const eleve = eleves.find(e =>
          normaliser(e.nom) === normaliser(nom) && normaliser(e.prenom) === normaliser(prenom)
        );

        if (!eleve) {
          resultat.erreurs.push(`Ligne ${rowNumber}: Eleve "${nom} ${prenom}" non trouve`);
          resultat.nbErreurs++;
          continue;
        }

        run(
          `INSERT INTO absences (eleve_id, date, motif, justifie, heure_debut, heure_fin, annee_scolaire_id, periode, ecole_id)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
          [eleve.id, today, motif, justifie ? 1 : 0, anneeId, periode, ecoleId]
        );
        resultat.nbImportes++;
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

module.exports = { importAbsencesExcel };