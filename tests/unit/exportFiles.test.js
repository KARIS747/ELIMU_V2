const {
  calcMoyMatiere,
  calcMoyGenerale,
  parseMatieresJson,
  getMention,
  getMentionColor,
  calcTotauxGroupe,
  ordinal,
  getSanctionAbsence,
} = require('../../src/shared/utils/pdf/helpers');

const {
  formatMontant,
  genererNumeroRecu,
  calculerTauxRecouvrement,
  getStatutTranche
} = require('../../src/shared/utils/financeUtils');

// Configuration fictive pour les tests de mentions
const mockCfgNumerique = {
  notation_type: 'numerique',
  mentions_config: JSON.stringify([
    { min: 16, max: 20, label: 'Très Bien', couleur: '#00a854' },
    { min: 14, max: 15.99, label: 'Bien', couleur: '#52c41a' },
    { min: 12, max: 13.99, label: 'Assez Bien', couleur: '#faad14' },
    { min: 10, max: 11.99, label: 'Passable', couleur: '#fa8c16' },
    { min: 0, max: 9.99, label: 'Insuffisant', couleur: '#f5222d' }
  ])
};

const mockCfgLettres = { notation_type: 'lettres' };
const mockCfgMentions = { notation_type: 'mentions' };

describe('calcMoyMatiere', () => {
  test('calcule la moyenne pondérée avec deux séquences', () => {
    expect(calcMoyMatiere(15, 18, 0.4, 0.6)).toBe(16.8);
  });
  test('retourne la séquence 1 si seule présente', () => {
    expect(calcMoyMatiere(14, null, 0.4, 0.6)).toBe(14);
  });
  test('retourne la séquence 2 si seule présente', () => {
    expect(calcMoyMatiere(null, 12, 0.4, 0.6)).toBe(12);
  });
  test('retourne null si aucune note', () => {
    expect(calcMoyMatiere(null, null, 0.4, 0.6)).toBe(null);
  });
});

describe('calcMoyGenerale', () => {
  test('calcule la moyenne pondérée de plusieurs matières', () => {
    const matieres = [
      { moy: 15, coef: 2 },
      { moy: 10, coef: 1 },
      { moy: 18, coef: 3 }
    ];
    expect(calcMoyGenerale(matieres)).toBe(15.67);
  });
  test('retourne null si aucune matière avec note', () => {
    const matieres = [
      { moy: null, coef: 2 },
      { moy: null, coef: 1 }
    ];
    expect(calcMoyGenerale(matieres)).toBe(null);
  });
  test('ignore les matières sans note', () => {
    const matieres = [
      { moy: 12, coef: 2 },
      { moy: null, coef: 1 },
      { moy: 16, coef: 3 }
    ];
    expect(calcMoyGenerale(matieres)).toBe(14.4);
  });
});

describe('parseMatieresJson', () => {
  test('parse ancien format (tableau de strings)', () => {
    const json = JSON.stringify(['Maths', 'Français']);
    const result = parseMatieresJson(json);
    expect(result).toEqual([
      { id: null, nom: 'Maths', coefficient: 1, enseignant: '', groupe: '' },
      { id: null, nom: 'Français', coefficient: 1, enseignant: '', groupe: '' }
    ]);
  });
  test('parse nouveau format enrichi', () => {
    const json = JSON.stringify([
      { id: 1, nom: 'Maths', coefficient: 3, enseignant: 'M. Dupont', groupe: 'Sciences' }
    ]);
    const result = parseMatieresJson(json);
    expect(result).toEqual([
      { id: 1, nom: 'Maths', coefficient: 3, enseignant: 'M. Dupont', groupe: 'Sciences' }
    ]);
  });
  test('retourne tableau vide pour JSON invalide', () => {
    expect(parseMatieresJson(null)).toEqual([]);
    expect(parseMatieresJson('')).toEqual([]);
    expect(parseMatieresJson('{invalid}')).toEqual([]);
  });
});

describe('getMention', () => {
  test('notation numérique avec mentions', () => {
    expect(getMention(18, mockCfgNumerique)).toBe('Très Bien');
    expect(getMention(14.5, mockCfgNumerique)).toBe('Bien');
    expect(getMention(12.5, mockCfgNumerique)).toBe('Assez Bien');
    expect(getMention(10.5, mockCfgNumerique)).toBe('Passable');
    expect(getMention(8, mockCfgNumerique)).toBe('Insuffisant');
    expect(getMention(null, mockCfgNumerique)).toBe('—');
  });
  test('notation lettres', () => {
    expect(getMention(18, mockCfgLettres)).toBe('A+');
    expect(getMention(14, mockCfgLettres)).toBe('A');
    expect(getMention(12, mockCfgLettres)).toBe('B');
    expect(getMention(10, mockCfgLettres)).toBe('C');
    expect(getMention(8, mockCfgLettres)).toBe('D');
    expect(getMention(5, mockCfgLettres)).toBe('F');
  });
  test('notation mentions africaines', () => {
    expect(getMention(18, mockCfgMentions)).toBe('TB');
    expect(getMention(15, mockCfgMentions)).toBe('B');
    expect(getMention(13, mockCfgMentions)).toBe('AB');
    expect(getMention(11, mockCfgMentions)).toBe('P');
    expect(getMention(8, mockCfgMentions)).toBe('I');
  });
});

describe('getMentionColor', () => {
  test('retourne couleur associée à la mention', () => {
    expect(getMentionColor(18, mockCfgNumerique)).toBe('#00a854');
    expect(getMentionColor(14.5, mockCfgNumerique)).toBe('#52c41a');
    expect(getMentionColor(12.5, mockCfgNumerique)).toBe('#faad14');
    expect(getMentionColor(10.5, mockCfgNumerique)).toBe('#fa8c16');
    expect(getMentionColor(8, mockCfgNumerique)).toBe('#f5222d');
    expect(getMentionColor(null, mockCfgNumerique)).toBe('#999999');
  });
});

describe('calcTotauxGroupe', () => {
  test('calcule totaux d’un groupe de matières', () => {
    const matieres = [
      { moy: 15, coef: 2 },
      { moy: 10, coef: 1 },
      { moy: 18, coef: 3 }
    ];
    const result = calcTotauxGroupe(matieres);
    expect(result.totalNxC).toBe(15*2 + 10*1 + 18*3);
    expect(result.totalCoef).toBe(6);
    expect(result.moyGroupe).toBe(15.67);
  });
  test('ignore les matières sans moyenne', () => {
    const matieres = [
      { moy: 12, coef: 2 },
      { moy: null, coef: 1 },
      { moy: 16, coef: 3 }
    ];
    const result = calcTotauxGroupe(matieres);
    expect(result.totalCoef).toBe(5);
    expect(result.moyGroupe).toBe((12*2 + 16*3) / 5);
  });
});

describe('ordinal', () => {
  test('retourne "1er" pour 1', () => {
    expect(ordinal(1)).toBe('1er');
  });
  test('retourne "2ème" pour 2', () => {
    expect(ordinal(2)).toBe('2ème');
  });
  test('retourne "3ème" pour 3', () => {
    expect(ordinal(3)).toBe('3ème');
  });
  test('retourne "10ème" pour 10', () => {
    expect(ordinal(10)).toBe('10ème');
  });
});

describe('getSanctionAbsence', () => {
  const regles = [
    { de: 0, a: 5, sanction: 'Observation' },
    { de: 5, a: 10, sanction: 'Avertissement' },
    { de: 10, a: 999, sanction: 'Exclusion' }
  ];
  test('retourne la sanction correspondant aux heures', () => {
    expect(getSanctionAbsence(3, regles)).toEqual(regles[0]);
    expect(getSanctionAbsence(7, regles)).toEqual(regles[1]);
    expect(getSanctionAbsence(15, regles)).toEqual(regles[2]);
  });
  test('retourne null si aucune règle ne correspond', () => {
    expect(getSanctionAbsence(0, [])).toBe(null);
    expect(getSanctionAbsence(5, null)).toBe(null);
  });
});

// ========== TESTS FINANCE (helpers) avec espace normal ==========
describe('Finance Utils', () => {
  test('formatMontant', () => {
    // Espace normal au lieu d'insécable
    expect(formatMontant(15000)).toBe('15 000 FCFA');
    expect(formatMontant(0)).toBe('0 FCFA');
    expect(formatMontant(null)).toBe('—');
    expect(formatMontant(1234567)).toBe('1 234 567 FCFA');
  });

  test('genererNumeroRecu (sans historique)', () => {
    const dateStr = '20250409';
    const num = genererNumeroRecu([], dateStr);
    expect(num).toBe('REC-20250409-00001');
  });

  test('genererNumeroRecu avec historique', () => {
    const dateStr = '20250409';
    const existing = ['REC-20250409-00001', 'REC-20250409-00002', 'REC-20250408-00099'];
    const num = genererNumeroRecu(existing, dateStr);
    expect(num).toBe('REC-20250409-00003');
  });

  test('calculerTauxRecouvrement', () => {
    expect(calculerTauxRecouvrement(100000, 50000)).toBe(50);
    expect(calculerTauxRecouvrement(0, 50000)).toBe(0);
    expect(calculerTauxRecouvrement(100000, 0)).toBe(0);
    expect(calculerTauxRecouvrement(null, 50000)).toBe(0);
  });

  test('getStatutTranche', () => {
    const today = '2025-04-09';
    expect(getStatutTranche('paye', '2025-01-01', today)).toBe('paye');
    expect(getStatutTranche('en_attente', '2025-05-01', today)).toBe('en_attente');
    expect(getStatutTranche('en_attente', '2025-03-01', today)).toBe('en_retard');
  });
});
