/**
 * tests/unit/bulletinQualitatif.test.js
 * Régression bulletins N1/N2 (août 2026)
 *
 * Historique du bug : le bulletin trimestriel convertissait les sous-notes
 * (stockées sur leur échelle réelle : ecrite/15, savoirEtre/5, ...) avec la
 * formule erronée `obtained = (rawNote / 20) * maxPt` au lieu de la somme
 * directe `obtained = rawNote`. Conséquence : une note parfaite 15/15 était
 * affichée 11.25 et la moyenne générale était fausse (16.25 au lieu de 20.00).
 *
 * Ces tests verrouillent :
 *  1. La somme directe `Σ(val)` → `(total / Σ(poids)) * 20` (AGENTS.md §5.3).
 *  2. `computeClassStatsQualitatif` : simple moyenne des agrégats stockés
 *     (cohérente avec le profil élève et stats_eleves).
 *  3. Le chemin N1 de `prepareBulletinTrimestreData` (parcours complet).
 */

// Mock du module DB (better-sqlite3 est compilé pour l'ABI Electron,
// donc on n'instancie jamais la vraie base dans les tests unitaires).
const mockGet = jest.fn();
const mockAll = jest.fn();
jest.mock('../../src/shared/database/db', () => ({
  get: (...args) => mockGet(...args),
  all: (...args) => mockAll(...args),
  run: jest.fn(),
  initializeDatabase: jest.fn(),
  getDatabase: jest.fn(),
  closeDatabase: jest.fn(),
  getLastWriteTimestamp: jest.fn()
}));

const {
  calcAggregateFromSubNotes,
  getWeightsForSousCompetence,
  getNoteToCode
} = require('../../src/shared/constants/curriculum');
const {
  computeClassStatsQualitatif,
  prepareBulletinTrimestreData
} = require('../../src/shared/utils/pdf/bulletinTrimestre');

describe('Régression bulletin N1/N2 — somme directe des sous-notes', () => {
  test('sous-notes parfaites 1B/UA1 → agrégat 20.00 (et non 16.25)', () => {
    const w = getWeightsForSousCompetence('N1', '1B'); // {orale:20, ecrite:15, pratique:0, savoirEtre:5}
    const subNotes = { orale: 20, ecrite: 15, pratique: null, savoirEtre: 5 };

    const result = calcAggregateFromSubNotes(subNotes, w);
    expect(result).toBe(20);

    // Ancienne formule buguée du bulletin : (raw/20)*maxPt sommé puis /20.
    const buggyObtained = (20 / 20) * 20 + (15 / 20) * 15 + (5 / 20) * 5; // 20 + 11.25 + 1.25 = 32.5
    const buggyMoy = (buggyObtained / (20 + 15 + 5)) * 20; // 16.25
    expect(buggyMoy).toBeCloseTo(16.25, 2);
    expect(result).not.toBeCloseTo(buggyMoy, 2);
  });

  test('cote qualitative calculée sur l\'équivalent /20 de la note réelle', () => {
    // ecrite 15/15 = 20/20 équivalent → A+
    expect(getNoteToCode((15 / 15) * 20)).toBe('A+');
    // savoirEtre 5/5 = 20/20 équivalent → A+
    expect(getNoteToCode((5 / 5) * 20)).toBe('A+');
    // Une note brute 15 (échelle réelle ecrite/15) ne doit PAS être traitée comme un /20.
    expect(getNoteToCode(15)).toBe('A');
  });

  test('N2 : sous-compétence 2A (ecrite=28) avec somme directe', () => {
    const w = getWeightsForSousCompetence('N2', '2A'); // {orale:8, ecrite:28, pratique:0, savoirEtre:4}
    const subNotes = { orale: 8, ecrite: 28, pratique: null, savoirEtre: 4 };
    expect(calcAggregateFromSubNotes(subNotes, w)).toBe(20);

    // Mauvaises notes : l'agrégat reflète la somme directe, pas une moyenne pondérée.
    const subNotes2 = { orale: 4, ecrite: 14, pratique: null, savoirEtre: 2 };
    // total = 4 + 14 + 2 = 20 ; poids = 8 + 28 + 4 = 40 → (20/40)*20 = 10
    expect(calcAggregateFromSubNotes(subNotes2, w)).toBe(10);
  });
});

describe('computeClassStatsQualitatif — simple moyenne des agrégats', () => {
  beforeEach(() => {
    mockAll.mockReset();
  });

  test('calcule la moyenne de chaque élève comme simple moyenne des agrégats stockés', () => {
    // Ligne par élève : un agrégat par sous-compétence/UA (sous_type IS NULL).
    mockAll.mockReturnValue([
      { eleve_id: 1, note: 20 },
      { eleve_id: 1, note: 20 },
      { eleve_id: 2, note: 10 },
      { eleve_id: 2, note: 14 }
    ]);

    const stats = computeClassStatsQualitatif(10, 1, 'N1', ['UA1']);

    expect(stats.sorted).toEqual([
      { id: 1, moy: 20 },
      { id: 2, moy: 12 }
    ]);
    expect(stats.moyenneClasse).toBe(16);   // (20 + 12) / 2
    expect(stats.moyennePremier).toBe(20);
    expect(stats.moyenneDernier).toBe(12);
  });

  test('ignore les élèves sans agrégats pour la période', () => {
    mockAll.mockReturnValue([
      { eleve_id: 1, note: 15 }
    ]);
    const stats = computeClassStatsQualitatif(10, 1, 'N1', ['UA1']);
    expect(stats.sorted).toEqual([{ id: 1, moy: 15 }]);
    expect(stats.moyenneClasse).toBe(15);
  });

  test('retourne des stats vides quand la période n\'a pas d\'UA', () => {
    const stats = computeClassStatsQualitatif(10, 1, 'N1', []);
    expect(stats).toEqual({ sorted: [], moyenneClasse: null, moyennePremier: null, moyenneDernier: null });
    expect(mockAll).not.toHaveBeenCalled();
  });
});

describe('prepareBulletinTrimestreData — chemin N1', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
  });

  test('construit notesAgg par UA avec les agrégats stockés', () => {
    // Élève de classe N1
    mockGet.mockImplementation((sql, params) => {
      if (sql.includes('FROM eleves e')) {
        return {
          id: 1,
          nom: 'Beyala',
          prenom: 'Cyprien',
          nom_classe: 'SIL-A',
          classe_id: 10,
          matieres_json_classe: null,
          niveau_v2: 'N1',
          annee_scolaire_id: 1
        };
      }
      if (sql.includes('heures_absence')) return null;
      return null;
    });

    // notesAgg (sous_type IS NULL), notesSub (sous_type IS NOT NULL) et effectif classe
    mockAll.mockImplementation((sql, params) => {
      // computeClassStatsQualitatif : SELECT n.eleve_id, n.note ... JOIN eleves
      if (sql.includes('n.eleve_id, n.note') && sql.includes('JOIN eleves')) {
        return [{ eleve_id: 1, note: 20 }];
      }
      // notesAgg : SELECT n.sous_competence_code, n.note, n.ua ... WHERE n.eleve_id = ? AND n.ua = ?
      if (sql.includes('sous_type IS NULL')) {
        return [{ sous_competence_code: '1B', note: 20, ua: params[1] }];
      }
      if (sql.includes('sous_type IS NOT NULL')) {
        return [
          { sous_competence_code: '1B', sous_type: 'orale', note: 20 },
          { sous_competence_code: '1B', sous_type: 'ecrite', note: 15 },
          { sous_competence_code: '1B', sous_type: 'savoirEtre', note: 5 }
        ];
      }
      if (sql.includes('SELECT id FROM eleves')) {
        return [{ id: 1 }];
      }
      return [];
    });

    const data = prepareBulletinTrimestreData(1, 'Trimestre 1', 'fr', 1);

    expect(data).not.toBeNull();
    expect(data.notesAgg).toHaveLength(3); // UA1, UA2, UA3
    expect(data.notesAgg[0].ua).toBe('UA1');
    expect(data.notesAgg[0].aggRows[0].note).toBe(20);
    expect(data.notesSub).toHaveLength(3);
    expect(data.notesSub[0].subRows).toHaveLength(3);
    // Aucun agrégat parasite : la moyenne de l'élève vient des notes du trimestre.
    expect(data.rangGeneral).toBe(1);
    expect(data.nbElevesClasse).toBe(1);
  });
});
