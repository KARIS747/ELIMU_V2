/**
 * Tests unitaires pour les fonctions métier de la section finance
 */

const {
  formatMontant,
  genererNumeroRecu,
  calculerTauxRecouvrement,
  getStatutTranche
} = require('../../src/shared/utils/financeUtils');

describe('Finance Utils', () => {
  test('formatMontant', () => {
    // Remplacement de l'espace insécable par un espace normal pour éviter les problèmes d'affichage PDF
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
