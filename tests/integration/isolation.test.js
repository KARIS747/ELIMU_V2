const path = require('path');
const fs = require('fs');
const { initializeDatabase, closeDatabase, run, get, all } = require('../../src/shared/database/db');

const ECOLE_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ECOLE_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

describe('Isolation multi-école Desktop', () => {
  const testDbPath = path.join(__dirname, 'test_isolation.db');

  beforeAll(async () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    await initializeDatabase(testDbPath);

    await run("INSERT INTO ecoles (ecole_id, nom) VALUES (?, 'Ecole A')", [ECOLE_A]);
    await run("INSERT INTO ecoles (ecole_id, nom) VALUES (?, 'Ecole B')", [ECOLE_B]);

    await run("INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, ecole_id) VALUES ('admin_a', 'hash', 'admin', ?)", [ECOLE_A]);
    await run("INSERT INTO utilisateurs (nom_utilisateur, mot_de_passe_hash, role, ecole_id) VALUES ('admin_b', 'hash', 'admin', ?)", [ECOLE_B]);

    await run("INSERT INTO professeurs (nom, prenom, ecole_id) VALUES ('Dupont', 'Jean', ?)", [ECOLE_A]);
    await run("INSERT INTO professeurs (nom, prenom, ecole_id) VALUES ('Doe', 'Marie', ?)", [ECOLE_B]);

    await run("INSERT INTO classes (nom_classe, niveau, niveau_v2, ecole_id) VALUES ('CP-A', 'Primaire', 'N1', ?)", [ECOLE_A]);
    await run("INSERT INTO classes (nom_classe, niveau, niveau_v2, ecole_id) VALUES ('CM1-A', 'Primaire', 'N2', ?)", [ECOLE_B]);

    const classeA = await get('SELECT id FROM classes WHERE nom_classe = ?', ['CP-A']);
    const classeB = await get('SELECT id FROM classes WHERE nom_classe = ?', ['CM1-A']);

    await run("INSERT INTO eleves (nom, prenom, classe_id, ecole_id) VALUES ('Nkolo', 'Paul', ?, ?)", [classeA.id, ECOLE_A]);
    await run("INSERT INTO eleves (nom, prenom, classe_id, ecole_id) VALUES ('Biyong', 'Jeanne', ?, ?)", [classeB.id, ECOLE_B]);

    await run("INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent, ecole_id) VALUES ('691234567', 'hash', 'Parent A', ?)", [ECOLE_A]);
    await run("INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent, ecole_id) VALUES ('692345678', 'hash', 'Parent B', ?)", [ECOLE_B]);

    const eleveA = await get('SELECT id FROM eleves WHERE nom = ? AND ecole_id = ?', ['Nkolo', ECOLE_A]);
    await run("INSERT INTO notes (eleve_id, matiere_id, note, ecole_id) VALUES (?, 1, 15.0, ?)", [eleveA.id, ECOLE_A]);
    const eleveB = await get('SELECT id FROM eleves WHERE nom = ? AND ecole_id = ?', ['Biyong', ECOLE_B]);
    await run("INSERT INTO notes (eleve_id, matiere_id, note, ecole_id) VALUES (?, 1, 12.0, ?)", [eleveB.id, ECOLE_B]);

    await run("INSERT INTO absences (eleve_id, date, ecole_id) VALUES (?, '2025-09-01', ?)", [eleveA.id, ECOLE_A]);
    await run("INSERT INTO absences (eleve_id, date, ecole_id) VALUES (?, '2025-09-01', ?)", [eleveB.id, ECOLE_B]);
  });

  afterAll(async () => {
    await closeDatabase();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  test('utilisateurs isolés par ecole_id', async () => {
    const adminsA = await all('SELECT * FROM utilisateurs WHERE ecole_id = ?', [ECOLE_A]);
    const adminsB = await all('SELECT * FROM utilisateurs WHERE ecole_id = ?', [ECOLE_B]);
    expect(adminsA.every(u => u.ecole_id === ECOLE_A)).toBe(true);
    expect(adminsB.every(u => u.ecole_id === ECOLE_B)).toBe(true);
    expect(adminsA[0].nom_utilisateur).toBe('admin_a');
    expect(adminsB[0].nom_utilisateur).toBe('admin_b');
  });

  test('professeurs isolés par ecole_id', async () => {
    const profsA = await all('SELECT * FROM professeurs WHERE ecole_id = ?', [ECOLE_A]);
    const profsB = await all('SELECT * FROM professeurs WHERE ecole_id = ?', [ECOLE_B]);
    expect(profsA.every(p => p.ecole_id === ECOLE_A)).toBe(true);
    expect(profsB.every(p => p.ecole_id === ECOLE_B)).toBe(true);
    expect(profsA[0].nom).toBe('Dupont');
    expect(profsB[0].nom).toBe('Doe');
  });

  test('classes isolées par ecole_id', async () => {
    const classesA = await all('SELECT * FROM classes WHERE ecole_id = ?', [ECOLE_A]);
    const classesB = await all('SELECT * FROM classes WHERE ecole_id = ?', [ECOLE_B]);
    expect(classesA.every(c => c.ecole_id === ECOLE_A)).toBe(true);
    expect(classesB.every(c => c.ecole_id === ECOLE_B)).toBe(true);
    expect(classesA[0].nom_classe).toBe('CP-A');
    expect(classesB[0].nom_classe).toBe('CM1-A');
  });

  test('eleves isolés par ecole_id', async () => {
    const elevesA = await all('SELECT * FROM eleves WHERE ecole_id = ?', [ECOLE_A]);
    const elevesB = await all('SELECT * FROM eleves WHERE ecole_id = ?', [ECOLE_B]);
    expect(elevesA.every(e => e.ecole_id === ECOLE_A)).toBe(true);
    expect(elevesB.every(e => e.ecole_id === ECOLE_B)).toBe(true);
    expect(elevesA[0].nom).toBe('Nkolo');
    expect(elevesB[0].nom).toBe('Biyong');
  });

  test('notes isolées par ecole_id', async () => {
    const notesA = await all('SELECT * FROM notes WHERE ecole_id = ?', [ECOLE_A]);
    const notesB = await all('SELECT * FROM notes WHERE ecole_id = ?', [ECOLE_B]);
    expect(notesA.every(n => n.ecole_id === ECOLE_A)).toBe(true);
    expect(notesB.every(n => n.ecole_id === ECOLE_B)).toBe(true);
    expect(notesA[0].note).toBe(15.0);
    expect(notesB[0].note).toBe(12.0);
  });

  test('absences isolées par ecole_id', async () => {
    const absA = await all('SELECT * FROM absences WHERE ecole_id = ?', [ECOLE_A]);
    const absB = await all('SELECT * FROM absences WHERE ecole_id = ?', [ECOLE_B]);
    expect(absA.every(a => a.ecole_id === ECOLE_A)).toBe(true);
    expect(absB.every(a => a.ecole_id === ECOLE_B)).toBe(true);
  });

  test('parents isolés par ecole_id', async () => {
    const parentsA = await all('SELECT * FROM parents WHERE ecole_id = ?', [ECOLE_A]);
    const parentsB = await all('SELECT * FROM parents WHERE ecole_id = ?', [ECOLE_B]);
    expect(parentsA.every(p => p.ecole_id === ECOLE_A)).toBe(true);
    expect(parentsB.every(p => p.ecole_id === ECOLE_B)).toBe(true);
  });

  test('DELETE avec ecole_id ne touche pas l\'autre école', async () => {
    const notesBBefore = await get('SELECT COUNT(*) as c FROM notes WHERE ecole_id = ?', [ECOLE_B]);
    await run('DELETE FROM notes WHERE ecole_id = ?', [ECOLE_A]);
    const notesBAfter = await get('SELECT COUNT(*) as c FROM notes WHERE ecole_id = ?', [ECOLE_B]);
    expect(notesBAfter.c).toBe(notesBBefore.c);
  });
});
