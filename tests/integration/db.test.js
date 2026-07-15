const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');

describe('Tests d’intégration base de données', () => {
  const testDbPath = path.join(__dirname, 'test_integration.db');

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);
    // Création manuelle des tables finance (normalement fait par initFinanceTables)
    await run(`CREATE TABLE IF NOT EXISTS frais_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      montant_par_tranche REAL NOT NULL,
      nombre_tranches INTEGER NOT NULL DEFAULT 1,
      periodicite_mois INTEGER NOT NULL DEFAULT 1,
      date_premiere_echeance TEXT NOT NULL,
      destinataire TEXT DEFAULT 'etablissement',
      actif INTEGER DEFAULT 1,
      date_creation TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS tranches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      frais_type_id INTEGER NOT NULL,
      eleve_id INTEGER NOT NULL,
      numero_tranche INTEGER NOT NULL,
      montant REAL NOT NULL,
      date_echeance TEXT NOT NULL,
      statut TEXT DEFAULT 'en_attente'
    )`);
    await run(`CREATE TABLE IF NOT EXISTS paiements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eleve_id INTEGER NOT NULL,
      montant REAL NOT NULL,
      date TEXT NOT NULL,
      mode TEXT,
      reference TEXT,
      recu_numero TEXT UNIQUE,
      notes TEXT,
      utilisateur_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(`CREATE TABLE IF NOT EXISTS paiement_tranches (
      paiement_id INTEGER NOT NULL,
      tranche_id INTEGER NOT NULL,
      montant_applique REAL NOT NULL,
      PRIMARY KEY(paiement_id, tranche_id)
    )`);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  // Tests existants (CRUD classe, élève, notes)
  test('CRUD classe', async () => {
    const res = await run('INSERT INTO classes (nom_classe, niveau, matieres_json) VALUES (?, ?, ?)', ['Classe Test', 'Secondaire', '[]']);
    expect(res.lastID).toBeTruthy();
    const classe = await get('SELECT * FROM classes WHERE id = ?', [res.lastID]);
    expect(classe.nom_classe).toBe('Classe Test');
    await run('UPDATE classes SET nom_classe = ? WHERE id = ?', ['Classe Modifiée', res.lastID]);
    const updated = await get('SELECT * FROM classes WHERE id = ?', [res.lastID]);
    expect(updated.nom_classe).toBe('Classe Modifiée');
    await run('DELETE FROM classes WHERE id = ?', [res.lastID]);
    const deleted = await get('SELECT * FROM classes WHERE id = ?', [res.lastID]);
    expect(deleted).toBeUndefined();
  });

  test('CRUD élève avec classe', async () => {
    const classeRes = await run('INSERT INTO classes (nom_classe, niveau, matieres_json) VALUES (?, ?, ?)', ['Classe Élève', 'Primaire', '[]']);
    const classeId = classeRes.lastID;
    const eleveRes = await run('INSERT INTO eleves (nom, prenom, classe_id) VALUES (?, ?, ?)', ['NomTest', 'PrenomTest', classeId]);
    const eleveId = eleveRes.lastID;
    const eleve = await get('SELECT * FROM eleves WHERE id = ?', [eleveId]);
    expect(eleve.nom).toBe('NomTest');
    expect(eleve.classe_id).toBe(classeId);
  });

  test('Ajout et lecture de notes', async () => {
    const matiereRes = await run('INSERT INTO matieres (nom_matiere) VALUES (?)', ['Maths']);
    const matiereId = matiereRes.lastID;
    const classeRes = await run('INSERT INTO classes (nom_classe, niveau, matieres_json) VALUES (?, ?, ?)', ['Classe Note', 'Secondaire', '[]']);
    const classeId = classeRes.lastID;
    const eleveRes = await run('INSERT INTO eleves (nom, prenom, classe_id) VALUES (?, ?, ?)', ['Dupont', 'Jean', classeId]);
    const eleveId = eleveRes.lastID;
    await run('INSERT INTO notes (eleve_id, matiere_id, note, periode, sequence) VALUES (?, ?, ?, ?, ?)', [eleveId, matiereId, 14.5, 'Trimestre 1', 1]);
    const notes = await all('SELECT * FROM notes WHERE eleve_id = ?', [eleveId]);
    expect(notes.length).toBe(1);
    expect(notes[0].note).toBe(14.5);
  });

  // ========== TESTS FINANCE ==========
  describe('Finance', () => {
    let fraisTypeId, eleveId, utilisateurId;

    beforeEach(async () => {
      // Créer un utilisateur pour les paiements
      const userRes = await run(`INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role) VALUES (?, ?, ?)`, ['caissier', 'hash', 'secretaire']);
      utilisateurId = userRes.lastID;
      // Créer un élève
      const eleveRes = await run(`INSERT INTO eleves (nom, prenom) VALUES (?, ?)`, ['Test', 'Élève']);
      eleveId = eleveRes.lastID;
      // Créer un type de frais
      const ftRes = await run(`INSERT INTO frais_types (nom, montant_par_tranche, nombre_tranches, periodicite_mois, date_premiere_echeance) VALUES (?, ?, ?, ?, ?)`,
        ['Scolarité', 25000, 3, 3, '2025-01-01']);
      fraisTypeId = ftRes.lastID;
    });

    afterEach(async () => {
      await run(`DELETE FROM paiement_tranches`);
      await run(`DELETE FROM paiements`);
      await run(`DELETE FROM tranches`);
      await run(`DELETE FROM frais_types WHERE id = ?`, [fraisTypeId]);
      await run(`DELETE FROM eleves WHERE id = ?`, [eleveId]);
      await run(`DELETE FROM utilisateurs WHERE id = ?`, [utilisateurId]);
    });

    test('CRUD frais_types', async () => {
      const ft = await get(`SELECT * FROM frais_types WHERE id = ?`, [fraisTypeId]);
      expect(ft.nom).toBe('Scolarité');
      expect(ft.montant_par_tranche).toBe(25000);
      expect(ft.nombre_tranches).toBe(3);
      await run(`UPDATE frais_types SET montant_par_tranche = ? WHERE id = ?`, [27000, fraisTypeId]);
      const updated = await get(`SELECT * FROM frais_types WHERE id = ?`, [fraisTypeId]);
      expect(updated.montant_par_tranche).toBe(27000);
    });

    test('Génération de tranches', async () => {
      for (let i = 1; i <= 3; i++) {
        await run(`INSERT INTO tranches (frais_type_id, eleve_id, numero_tranche, montant, date_echeance) VALUES (?, ?, ?, ?, ?)`,
          [fraisTypeId, eleveId, i, 25000, `2025-0${i}-01`]);
      }
      const tranches = await all(`SELECT * FROM tranches WHERE eleve_id = ?`, [eleveId]);
      expect(tranches.length).toBe(3);
      expect(tranches[0].montant).toBe(25000);
    });

    test('Enregistrement d’un paiement et mise à jour du statut', async () => {
      await run(`INSERT INTO tranches (frais_type_id, eleve_id, numero_tranche, montant, date_echeance, statut) VALUES (?, ?, ?, ?, ?, ?)`,
        [fraisTypeId, eleveId, 1, 25000, '2025-01-01', 'en_attente']);
      const trancheId = (await get(`SELECT id FROM tranches WHERE eleve_id = ?`, [eleveId])).id;
      const recuNum = `REC-${Date.now()}`;
      const paiementRes = await run(`INSERT INTO paiements (eleve_id, montant, date, mode, recu_numero, utilisateur_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [eleveId, 25000, '2025-02-01', 'especes', recuNum, utilisateurId]);
      const paiementId = paiementRes.lastID;
      await run(`INSERT INTO paiement_tranches (paiement_id, tranche_id, montant_applique) VALUES (?, ?, ?)`,
        [paiementId, trancheId, 25000]);
      await run(`UPDATE tranches SET statut = 'paye' WHERE id = ?`, [trancheId]);
      const tranche = await get(`SELECT statut FROM tranches WHERE id = ?`, [trancheId]);
      expect(tranche.statut).toBe('paye');
    });

    test('Calcul des totaux (du, encaissé, impayés)', async () => {
      for (let i = 1; i <= 2; i++) {
        await run(`INSERT INTO tranches (frais_type_id, eleve_id, numero_tranche, montant, date_echeance, statut) VALUES (?, ?, ?, ?, ?, ?)`,
          [fraisTypeId, eleveId, i, 25000, `2025-0${i}-01`, i === 1 ? 'paye' : 'en_attente']);
      }
      const recuNum = `REC-${Date.now()}`;
      await run(`INSERT INTO paiements (eleve_id, montant, date, mode, recu_numero, utilisateur_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [eleveId, 25000, '2025-02-01', 'especes', recuNum, utilisateurId]);
      const totalDu = await get(`SELECT SUM(montant) as total FROM tranches`);
      const totalEncaisse = await get(`SELECT SUM(montant) as total FROM paiements`);
      const totalImpayes = await get(`SELECT SUM(montant) as total FROM tranches WHERE statut != 'paye'`);
      expect(totalDu.total).toBe(50000);
      expect(totalEncaisse.total).toBe(25000);
      expect(totalImpayes.total).toBe(25000);
    });
  });
});
