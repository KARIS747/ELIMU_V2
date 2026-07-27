const {
  calcAggregateFromSubNotes,
  getWeightsForSousCompetence,
  getNoteToCode,
  getUAsForPeriode,
  getPeriodeForUA,
  CURRICULUM_TEMPLATES,
  SOUS_TYPES,
} = require('../../src/shared/constants/curriculum');

describe('calcAggregateFromSubNotes', () => {
  test('calcule l\'agregat avec somme directe : (total / totalPoids) * 20', () => {
    const weights = { orale: 20, ecrite: 15, pratique: 0, savoirEtre: 5 };
    const subNotes = { orale: 17.8, ecrite: 10.1, pratique: null, savoirEtre: 2.0 };
    const result = calcAggregateFromSubNotes(subNotes, weights);
    // total = 17.8 + 10.1 + 2.0 = 29.9
    // totalPoids = 20 + 15 + 5 = 40
    // agregat = (29.9 / 40) * 20 = 14.95
    expect(result).toBeCloseTo(14.95, 2);
  });

  test('ignore les sous-types avec poids zero', () => {
    const weights = { orale: 20, ecrite: 15, pratique: 0, savoirEtre: 5 };
    const subNotes = { orale: 14, ecrite: 12, pratique: 999, savoirEtre: 3 };
    const result = calcAggregateFromSubNotes(subNotes, weights);
    // total = 14 + 12 + 3 = 29 (pratique ignore car poids=0)
    // totalPoids = 20 + 15 + 5 = 40
    // agregat = (29 / 40) * 20 = 14.5
    expect(result).toBeCloseTo(14.5, 2);
  });

  test('retourne null si aucune sous-note valide', () => {
    expect(calcAggregateFromSubNotes({ orale: null, ecrite: null, pratique: null, savoirEtre: null }, { orale: 20, ecrite: 15, pratique: 10, savoirEtre: 5 })).toBeNull();
    expect(calcAggregateFromSubNotes({}, { orale: 20, ecrite: 15, pratique: 10, savoirEtre: 5 })).toBeNull();
  });

  test('retourne null si tous les poids sont zero', () => {
    expect(calcAggregateFromSubNotes({ orale: 14, ecrite: 12 }, { orale: 0, ecrite: 0, pratique: 0, savoirEtre: 0 })).toBeNull();
  });

  test('marche avec un seul sous-type', () => {
    const weights = { orale: 20, ecrite: 0, pratique: 0, savoirEtre: 0 };
    const subNotes = { orale: 15, ecrite: null, pratique: null, savoirEtre: null };
    const result = calcAggregateFromSubNotes(subNotes, weights);
    // total = 15, totalPoids = 20
    // agregat = (15 / 20) * 20 = 15
    expect(result).toBe(15);
  });

  test('cas concret N1 : sous-competence 1A avec toutes les sous-notes', () => {
    const sc = CURRICULUM_TEMPLATES.N1.competences.C1.sousCompetences['1A'];
    const weights = { orale: sc.orale, ecrite: sc.ecrite, pratique: sc.pratique, savoirEtre: sc.savoirEtre };
    const subNotes = { orale: 18, ecrite: 13, pratique: null, savoirEtre: 4 };
    const result = calcAggregateFromSubNotes(subNotes, weights);
    // total = 18 + 13 + 4 = 35
    // totalPoids = 20 + 15 + 5 = 40
    // agregat = (35 / 40) * 20 = 17.5
    expect(result).toBeCloseTo(17.5, 2);
  });

  test('cas concret N2 : sous-competence 2B (orale=6, ecrite=7, pratique=20, savoirEtre=7)', () => {
    const sc = CURRICULUM_TEMPLATES.N2.competences.C2.sousCompetences['2B'];
    const weights = { orale: sc.orale, ecrite: sc.ecrite, pratique: sc.pratique, savoirEtre: sc.savoirEtre };
    const subNotes = { orale: 5, ecrite: 6, pratique: 15, savoirEtre: 6 };
    const result = calcAggregateFromSubNotes(subNotes, weights);
    // total = 5 + 6 + 15 + 6 = 32
    // totalPoids = 6 + 7 + 20 + 7 = 40
    // agregat = (32 / 40) * 20 = 16
    expect(result).toBeCloseTo(16, 2);
  });
});

describe('getWeightsForSousCompetence', () => {
  test('retourne les poids d\'une sous-competence N1 existante', () => {
    const w = getWeightsForSousCompetence('N1', '1A');
    expect(w).toEqual({ orale: 20, ecrite: 15, pratique: 0, savoirEtre: 5 });
  });

  test('retourne les poids d\'une sous-competence N2 2A avec ecrite=28', () => {
    const w = getWeightsForSousCompetence('N2', '2A');
    expect(w).toEqual({ orale: 8, ecrite: 28, pratique: 0, savoirEtre: 4 });
  });

  test('retourne les poids d\'une sous-competence N2 2B', () => {
    const w = getWeightsForSousCompetence('N2', '2B');
    expect(w).toEqual({ orale: 6, ecrite: 7, pratique: 20, savoirEtre: 7 });
  });

  test('retourne null pour un code invalide', () => {
    expect(getWeightsForSousCompetence('N1', 'ZZ')).toBeNull();
  });

  test('retourne null pour un niveau invalide', () => {
    expect(getWeightsForSousCompetence('N4', '1A')).toBeNull();
  });

  test('sous-competence 4 (competence unique sans C prefixe)', () => {
    const w = getWeightsForSousCompetence('N1', '4');
    expect(w).toBeDefined();
    expect(w.orale).toBeGreaterThan(0);
  });
});

describe('getNoteToCode', () => {
  test('A+ pour note >= 18', () => {
    expect(getNoteToCode(18)).toBe('A+');
    expect(getNoteToCode(19.5)).toBe('A+');
    expect(getNoteToCode(20)).toBe('A+');
  });

  test('A pour 15 <= note < 18', () => {
    expect(getNoteToCode(15)).toBe('A');
    expect(getNoteToCode(16)).toBe('A');
    expect(getNoteToCode(17.99)).toBe('A');
  });

  test('ECA pour 11 <= note < 15', () => {
    expect(getNoteToCode(11)).toBe('ECA');
    expect(getNoteToCode(13)).toBe('ECA');
    expect(getNoteToCode(14.99)).toBe('ECA');
  });

  test('NA pour note < 11', () => {
    expect(getNoteToCode(0)).toBe('NA');
    expect(getNoteToCode(5)).toBe('NA');
    expect(getNoteToCode(10)).toBe('NA');
    expect(getNoteToCode(10.99)).toBe('NA');
  });

  test('retourne null pour des entrees invalides', () => {
    expect(getNoteToCode(null)).toBeNull();
    expect(getNoteToCode(undefined)).toBeNull();
    expect(getNoteToCode(NaN)).toBeNull();
  });
});

describe('getUAsForPeriode et getPeriodeForUA', () => {
  test('getUAsForPeriode retourne les bonnes UA pour chaque trimestre', () => {
    expect(getUAsForPeriode('Trimestre 1')).toEqual(['UA1', 'UA2', 'UA3']);
    expect(getUAsForPeriode('Trimestre 2')).toEqual(['UA4', 'UA5', 'UA6']);
    expect(getUAsForPeriode('Trimestre 3')).toEqual(['UA7', 'UA8']);
  });

  test('getUAsForPeriode retourne tableau vide pour periode inconnue', () => {
    expect(getUAsForPeriode('Trimestre 4')).toEqual([]);
  });

  test('getPeriodeForUA retourne le bon trimestre pour chaque UA', () => {
    expect(getPeriodeForUA('UA1')).toBe('Trimestre 1');
    expect(getPeriodeForUA('UA3')).toBe('Trimestre 1');
    expect(getPeriodeForUA('UA4')).toBe('Trimestre 2');
    expect(getPeriodeForUA('UA6')).toBe('Trimestre 2');
    expect(getPeriodeForUA('UA7')).toBe('Trimestre 3');
    expect(getPeriodeForUA('UA8')).toBe('Trimestre 3');
  });

  test('getPeriodeForUA retourne null pour UA inconnue', () => {
    expect(getPeriodeForUA('UA9')).toBeNull();
  });
});
