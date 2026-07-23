const ExcelJS = require('exceljs');
const { run, get } = require('../../database/db');
const bcrypt = require('bcryptjs');

async function importListeProfesseurs(filePath, ecoleId = '', utilisateurId = null) {
  const resultat = {
    success: false,
    nbImportes: 0,
    nbMisAJour: 0,
    nbComptesCreer: 0,
    nbErreurs: 0,
    erreurs: []
  };

  const fs = require('fs');

  const stats = fs.statSync(filePath);
  if (stats.size > 10 * 1024 * 1024)
    return { ...resultat, error: 'Fichier trop volumineux (max 10MB)' };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet)
    return { ...resultat, error: 'Fichier Excel vide ou invalide' };

  const SALT_ROUNDS = 10;
  const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$%&';
  function generatePassword(length = 12) {
    let pwd = '';
    for (let i = 0; i < length; i++)
      pwd += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
    return pwd;
  }

  const lignes = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const nom      = String(row.getCell(1).value || '').trim();
    const prenom   = String(row.getCell(2).value || '').trim();
    const email    = String(row.getCell(3).value || '').trim();
    const tel      = String(row.getCell(4).value || '').trim();
    const specialite = String(row.getCell(5).value || '').trim() || null;
    const matieres   = String(row.getCell(6).value || '').trim() || null;

    if (nom && prenom)
      lignes.push({ nom, prenom, email, tel, specialite, matieres, rowNumber });
  });

  if (!lignes.length)
    return { ...resultat, error: 'Aucune ligne de données trouvée' };

  run('BEGIN');
  try {
    for (const { nom, prenom, email, tel, specialite, matieres, rowNumber } of lignes) {
      try {
        const nomUtilisateur = (prenom + '.' + nom).toLowerCase().replace(/[^a-z.]/g, '');
        let professeur = get('SELECT id FROM professeurs WHERE LOWER(nom)=LOWER(?) AND LOWER(prenom)=LOWER(?) AND ecole_id=?', [nom, prenom, ecoleId]);

        if (professeur) {
          run(
            'UPDATE professeurs SET email=?, telephone=?, specialite=?, matieres=? WHERE id=? AND ecole_id=?',
            [email, tel, specialite, matieres, professeur.id, ecoleId]
          );
          resultat.nbMisAJour++;
        } else {
          const inserted = run(
            'INSERT INTO professeurs (nom, prenom, email, telephone, specialite, matieres, ecole_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nom, prenom, email, tel, specialite, matieres, ecoleId]
          );
          professeur = { id: inserted.lastID };
          resultat.nbImportes++;

          let utilisateur = get('SELECT id FROM utilisateurs WHERE nom_utilisateur=? AND ecole_id=?', [nomUtilisateur, ecoleId]);
          if (!utilisateur) {
            const motDePasse = generatePassword(10);
            const hash = bcrypt.hashSync(motDePasse, SALT_ROUNDS);
            const userInsert = run(
              'INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe, role, ecole_id) VALUES (?, ?, ?, ?)',
              [nomUtilisateur, hash, 'enseignant', ecoleId]
            );
            run(
              'UPDATE professeurs SET utilisateur_id=? WHERE id=? AND ecole_id=?',
              [userInsert.lastID, professeur.id, ecoleId]
            );
            resultat.nbComptesCreer++;
          }
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

module.exports = { importListeProfesseurs };