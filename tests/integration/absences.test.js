const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');

describe('Absences Integration', () => {
  const testDbPath = path.join(__dirname, 'test_absences.db');
  let eleveId, anneeId;

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);

    const anneeRes = await run('INSERT INTO annees_scolaires (libelle, active) VALUES (?, ?)', ['2025-2026', 1]);
    anneeId = anneeRes.lastID;

    const eleveRes = await run('INSERT INTO eleves (nom, prenom, annee_scolaire_id) VALUES (?, ?, ?)', ['Test', 'Eleve', anneeId]);
    eleveId = eleveRes.lastID;
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('Ajout d’une absence simple', async () => {
    const result = run(
      'INSERT INTO absences (eleve_id, date, justifie, motif, annee_scolaire_id) VALUES (?, ?, ?, ?, ?)',
      [eleveId, '2026-06-18', 0, 'Malade', anneeId]
    );
    expect(result.lastID).toBeGreaterThan(0);

    const absence = await get('SELECT * FROM absences WHERE id = ?', [result.lastID]);
    expect(absence.motif).toBe('Malade');
    expect(absence.eleve_id).toBe(eleveId);
  });

  test('Enregistrement des heures d’absence avec ON CONFLICT', async () => {
    // Premier enregistrement
    run(
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, 'Trimestre 1', 10, anneeId]
    );

    let h = await get('SELECT heures FROM heures_absence WHERE eleve_id = ? AND periode = ?', [eleveId, 'Trimestre 1']);
    expect(h.heures).toBe(10);

    // Mise à jour (même élève, même trimestre, même année)
    run(
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, 'Trimestre 1', 15, anneeId]
    );

    h = await get('SELECT heures FROM heures_absence WHERE eleve_id = ? AND periode = ?', [eleveId, 'Trimestre 1']);
    expect(h.heures).toBe(15);
  });

  test('Récupération globale des heures d’absence', async () => {
    run(
      `INSERT INTO heures_absence (eleve_id, periode, heures, annee_scolaire_id) VALUES (?, ?, ?, ?)
       ON CONFLICT(eleve_id, periode, annee_scolaire_id) DO UPDATE SET heures = excluded.heures`,
      [eleveId, 'Trimestre 2', 5, anneeId]
    );

    const rows = all(
      `SELECT periode, heures FROM heures_absence WHERE eleve_id = ? AND annee_scolaire_id = ? ORDER BY periode`,
      [eleveId, anneeId]
    );
    
    const stats = { 'Trimestre 1': 0, 'Trimestre 2': 0, 'Trimestre 3': 0 };
    rows.forEach(r => { stats[r.periode] = r.heures; });

    expect(stats['Trimestre 1']).toBe(15);
    expect(stats['Trimestre 2']).toBe(5);
    expect(stats['Trimestre 3']).toBe(0);
  });
});
