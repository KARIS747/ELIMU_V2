/**
 * tests/unit/pyramideAge.test.js — Répartition des naissances (pyramide des âges)
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

jest.mock('../../src/shared/utils/pdf/helpers', () => {
  const actual = jest.requireActual('../../src/shared/utils/pdf/helpers');
  return {
    ...actual,
    loadConfig: jest.fn(() => ({
      pays: 'RÉPUBLIQUE DU CAMEROUN',
      ministere: 'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES',
      etab_nom: 'ÉCOLE DE TEST',
      couleur_primaire: '#1a3c6e'
    }))
  };
});

const {
  repartitionNaissances,
  anneeNaissance,
  exportPyramideAgePDF
} = require('../../src/shared/utils/pdf/pyramideAge');

describe('anneeNaissance', () => {
  test('parse une date YYYY-MM-DD', () => {
    expect(anneeNaissance('2015-03-12', 2026)).toBe(2015);
  });

  test('parse une date DD/MM/YYYY', () => {
    expect(anneeNaissance('12/03/2016', 2026)).toBe(2016);
  });

  test('retourne null sur date vide, invalide ou absente', () => {
    expect(anneeNaissance(null, 2026)).toBeNull();
    expect(anneeNaissance('', 2026)).toBeNull();
    expect(anneeNaissance('inconnue', 2026)).toBeNull();
  });

  test('rejette une année future hors plage', () => {
    expect(anneeNaissance('2030-01-01', 2026)).toBeNull();
  });
});

describe('repartitionNaissances', () => {
  const eleves = [
    { date_naissance: '2015-02-01', sexe: 'M' },
    { date_naissance: '2015-03-01', sexe: 'F' },
    { date_naissance: '2016-05-05', sexe: 'M' },
    { date_naissance: '2016-07-07', sexe: 'F' },
    { date_naissance: '2016-08-08', sexe: 'M' },
    { date_naissance: null, sexe: 'F' },
    { date_naissance: 'zzz', sexe: 'M' }
  ];

  test('tous sexes : parAnnee, parSexe, sansDate', () => {
    const r = repartitionNaissances(eleves, 'T');
    expect(r.total).toBe(5);
    expect(r.sansDate).toBe(2);
    expect(r.parAnnee[2015]).toBe(2);
    expect(r.parAnnee[2016]).toBe(3);
    expect(r.parSexe.M[2015]).toBe(1);
    expect(r.parSexe.F[2015]).toBe(1);
    expect(r.parSexe.M[2016]).toBe(2);
    expect(r.parSexe.F[2016]).toBe(1);
  });

  test('filtre garçons (M)', () => {
    const r = repartitionNaissances(eleves, 'M');
    expect(r.total).toBe(3);
    expect(r.parAnnee[2015]).toBe(1);
    expect(r.parAnnee[2016]).toBe(2);
    expect(r.parSexe.F[2015]).toBeUndefined();
  });

  test('filtre filles (F)', () => {
    const r = repartitionNaissances(eleves, 'F');
    expect(r.total).toBe(2);
    expect(r.parAnnee[2015]).toBe(1);
    expect(r.parAnnee[2016]).toBe(1);
  });

  test('liste vide', () => {
    const r = repartitionNaissances([], 'T');
    expect(r.total).toBe(0);
    expect(r.parAnnee).toEqual({});
    expect(r.sansDate).toBe(0);
  });
});

describe('exportPyramideAgePDF', () => {
  test('génère un fichier PDF avec la courbe', async () => {
    const eleves = [
      { date_naissance: '2013-02-01', sexe: 'M' },
      { date_naissance: '2014-06-10', sexe: 'M' },
      { date_naissance: '2014-09-20', sexe: 'M' },
      { date_naissance: '2015-01-15', sexe: 'F' },
      { date_naissance: '2015-05-05', sexe: 'F' },
      { date_naissance: '2016-03-03', sexe: 'M' }
    ];
    const out = path.join(os.tmpdir(), `pyramide_test_${Date.now()}.pdf`);
    const res = await exportPyramideAgePDF(
      eleves,
      { classe: 'CM2 A', annee: '2025/2026', sexe: 'T' },
      out,
      'fr'
    );
    expect(res.success).toBe(true);
    expect(res.total).toBe(6);
    const taille = fs.statSync(out).size;
    expect(taille).toBeGreaterThan(500);
    fs.unlinkSync(out);
  });
});