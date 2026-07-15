const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');
const { syncParentEleve } = require('../../src/shared/utils/parentSync');

describe('parentSync Integration', () => {
  const testDbPath = path.join(__dirname, 'test_parent_sync.db');
  const mockLogger = {
    info: jest.fn(),
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
    await run('DELETE FROM eleves');
    await run('DELETE FROM parents');
    await run('DELETE FROM parents_eleves');
  });

  test('Crée un parent et lie l’élève quand le parent n’existe pas', async () => {
    const eleveRes = await run('INSERT INTO eleves (nom, prenom) VALUES (?, ?)', ['Eleve', 'Un']);
    const eleveId = eleveRes.lastID;

    await syncParentEleve(eleveId, 'Papa Eleve', '123456789', mockLogger);

    const parent = await get('SELECT * FROM parents WHERE telephone = ?', ['123456789']);
    expect(parent).toBeDefined();
    expect(parent.nom_parent).toBe('Papa Eleve');
    expect(parent.mot_de_passe_hash).toBeDefined();

    const liaison = await get('SELECT * FROM parents_eleves WHERE parent_id = ? AND eleve_id = ?', [parent.id, eleveId]);
    expect(liaison).toBeDefined();
  });

  test('Lie l’élève à un parent existant', async () => {
    const parentRes = await run('INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent) VALUES (?, ?, ?)', ['987654321', 'hash', 'Parent Existant']);
    const parentId = parentRes.lastID;

    const eleveRes = await run('INSERT INTO eleves (nom, prenom) VALUES (?, ?)', ['Eleve', 'Deux']);
    const eleveId = eleveRes.lastID;

    await syncParentEleve(eleveId, 'Nouveau Nom Parent', '987654321', mockLogger);

    const liaison = await get('SELECT * FROM parents_eleves WHERE parent_id = ? AND eleve_id = ?', [parentId, eleveId]);
    expect(liaison).toBeDefined();

    // Le nom ne devrait pas changer si déjà présent (selon l'implémentation actuelle qui ne change que si vide)
    const parent = await get('SELECT nom_parent FROM parents WHERE id = ?', [parentId]);
    expect(parent.nom_parent).toBe('Parent Existant');
  });

  test('Supprime la liaison si le téléphone est vide', async () => {
    const parentRes = await run('INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent) VALUES (?, ?, ?)', ['000', 'hash', 'Parent']);
    const parentId = parentRes.lastID;
    const eleveRes = await run('INSERT INTO eleves (nom, prenom) VALUES (?, ?)', ['Eleve', 'Trois']);
    const eleveId = eleveRes.lastID;
    await run('INSERT INTO parents_eleves (parent_id, eleve_id) VALUES (?, ?)', [parentId, eleveId]);

    await syncParentEleve(eleveId, '', '', mockLogger);

    const liaison = await get('SELECT * FROM parents_eleves WHERE eleve_id = ?', [eleveId]);
    expect(liaison).toBeUndefined();
  });
});
