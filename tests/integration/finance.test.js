const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');
const { genererTranchesPourEleve } = require('../../src/main/utils/financeUtils');

describe('Finance Integration', () => {
  const testDbPath = path.join(__dirname, 'test_finance_integration.db');
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  beforeEach(async () => {
    await run('DELETE FROM tranches');
    await run('DELETE FROM frais_types');
    await run('DELETE FROM eleves');
  });

  test('Génère correctement les tranches pour un élève', async () => {
    const eleveRes = await run('INSERT INTO eleves (nom, prenom) VALUES (?, ?)', ['Finance', 'Test']);
    const eleveId = eleveRes.lastID;

    // Créer un type de frais : 3 tranches de 10000 tous les mois
    const ftRes = await run(
      `INSERT INTO frais_types (nom, montant_par_tranche, nombre_tranches, periodicite_mois, date_premiere_echeance, actif)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Scolarité', 10000, 3, 1, '2026-01-01', 1]
    );
    const ftId = ftRes.lastID;

    const result = genererTranchesPourEleve(eleveId, 1, mockLogger);
    expect(result.success).toBe(true);
    expect(result.nbGeneres).toBe(3);

    const tranches = all('SELECT * FROM tranches WHERE eleve_id = ? ORDER BY numero_tranche', [eleveId]);
    expect(tranches.length).toBe(3);
    expect(tranches[0].montant).toBe(10000);
    expect(tranches[0].numero_tranche).toBe(1);
    expect(tranches[0].date_echeance).toBe('2026-01-01');
    expect(tranches[1].date_echeance).toBe('2026-02-01');
    expect(tranches[2].date_echeance).toBe('2026-03-01');
  });

  test('Ne génère rien si aucun frais actif', async () => {
    const eleveRes = await run('INSERT INTO eleves (nom, prenom) VALUES (?, ?)', ['Finance', 'Test 2']);
    const eleveId = eleveRes.lastID;

    const result = genererTranchesPourEleve(eleveId, 1, mockLogger);
    expect(result.nbGeneres).toBe(0);
  });
});
