const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');
const { importExcel } = require('../../src/shared/utils/importExcel');

describe('Import Excel', () => {
  const testDbPath = path.join(__dirname, 'test_import.db');
  let classeId, matiereId, adminUserId, anneeId;

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);

    // Créer une année scolaire active
    const anneeRes = await run(
      'INSERT INTO annees_scolaires (libelle, active) VALUES (?, ?)',
      ['2025-2026', 1]
    );
    anneeId = anneeRes.lastID;

    // Créer un utilisateur admin
    const adminRes = await run(
      `INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, nom_complet)
       VALUES (?, ?, ?, ?)`,
      ['admin', 'hash_fake', 'admin', 'Administrateur']
    );
    adminUserId = adminRes.lastID;

    // Créer une classe et une matière
    const classeRes = await run('INSERT INTO classes (nom_classe, niveau, matieres_json) VALUES (?, ?, ?)', ['Classe Import', 'Secondaire', '[]']);
    classeId = classeRes.lastID;
    const matiereRes = await run('INSERT INTO matieres (nom_matiere) VALUES (?)', ['Maths']);
    matiereId = matiereRes.lastID;

    // Ajouter un élève existant pour tester la mise à jour (avec anneeId)
    await run('INSERT INTO eleves (nom, prenom, classe_id, annee_scolaire_id) VALUES (?, ?, ?, ?)', ['Existant', 'Nom', classeId, anneeId]);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('Importe des notes depuis un fichier Excel valide', async () => {
    // Créer un fichier Excel temporaire
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Notes');
    sheet.addRow(['Nom', 'Prénom', 'Note']);
    sheet.addRow(['Dupont', 'Jean', '15']);
    sheet.addRow(['Martin', 'Paul', '12.5']);
    sheet.addRow(['Existant', 'Nom', '18']); // élève déjà existant
    const tempFilePath = path.join(__dirname, 'temp_notes.xlsx');
    await workbook.xlsx.writeFile(tempFilePath);

    // Importer (utilisateurId = adminUserId, anneeId = anneeId)
    const result = await importExcel(tempFilePath, classeId, matiereId, 'Trimestre 1', 1, adminUserId, anneeId);
    expect(result.success).toBe(true);
    expect(result.nbImportes).toBe(3);
    expect(result.nbErreurs).toBe(0);

    // Vérifier que les notes ont bien été insérées
    const eleveDupont = await get('SELECT id FROM eleves WHERE nom = ? AND prenom = ?', ['Dupont', 'Jean']);
    expect(eleveDupont).toBeDefined();
    const noteDupont = await get('SELECT note FROM notes WHERE eleve_id = ? AND matiere_id = ?', [eleveDupont.id, matiereId]);
    expect(noteDupont.note).toBe(15);

    // Vérifier que l'élève existant a bien reçu sa note
    const eleveExistant = await get('SELECT id FROM eleves WHERE nom = ? AND prenom = ?', ['Existant', 'Nom']);
    const noteExistant = await get('SELECT note FROM notes WHERE eleve_id = ? AND matiere_id = ?', [eleveExistant.id, matiereId]);
    expect(noteExistant.note).toBe(18);

    // Nettoyer
    fs.unlinkSync(tempFilePath);
  });
});
