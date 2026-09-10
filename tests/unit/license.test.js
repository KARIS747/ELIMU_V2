const crypto = require('crypto');
const os = require('os');

const LICENSE_PATH = '../../src/shared/license';

// Reproduit le secret historique (public) pour les tests de compatibilité.
function legacySecret() {
  const parts = ['eLimU', Buffer.from('X1MzY3IzdF8=', 'base64').toString(), '2025', '!'];
  return parts.join('') + os.platform().substring(0, 1);
}

// Construit une clé complète : ELIMU-{expiry}-{hwid}-{SIGNATURE}
// La signature couvre TOUTE la partie ELIMU-{expiry}-{hwid} (comme verifyLicense).
// Le Licence Manager (portal) signe en 16 hex (64 bits) ; les anciennes clés
// étaient signées en 8 hex.
function makeKey(expiry, hwid, secret, sigLen = 16) {
  const dataToSign = `ELIMU-${expiry}-${hwid}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex')
    .substring(0, sigLen)
    .toUpperCase();
  return `${dataToSign}-${sig}`;
}

describe('verifyLicense avec secret injecté/env', () => {
  const SECRET = 'ELIMU_TEST_SECRET_0123456789';

  beforeAll(() => {
    process.env.ELIMU_LICENCE_SECRET = SECRET;
    delete require.cache[require.resolve(LICENSE_PATH)];
  });

  afterAll(() => {
    delete process.env.ELIMU_LICENCE_SECRET;
  });

  test('accepte une clé signée avec le secret courant (16 hex, schéma portail)', () => {
    const key = makeKey('20301231', 'UNIVERSAL', SECRET);
    expect(require(LICENSE_PATH).verifyLicense(key, 'x', '20260101')).toBe(true);
  });

  test('accepte une clé signée en 8 hex avec le secret courant (ancien format)', () => {
    const key = makeKey('20301231', 'UNIVERSAL', SECRET, 8);
    expect(require(LICENSE_PATH).verifyLicense(key, 'x', '20260101')).toBe(true);
  });

  test('rejette une clé signée avec un mauvais secret', () => {
    const key = makeKey('20301231', 'UNIVERSAL', 'Mauvais_Secret_01234');
    expect(require(LICENSE_PATH).verifyLicense(key, 'x', '20260101')).toBe(false);
  });

  test('rejette une clé expirée', () => {
    const key = makeKey('20240101', 'UNIVERSAL', SECRET);
    expect(require(LICENSE_PATH).verifyLicense(key, 'x', '20260101')).toBe(false);
  });

  test('accepte une clé émise avec le secret historique (16 et 8 hex, compatibilité)', () => {
    const key16 = makeKey('20301231', 'UNIVERSAL', legacySecret(), 16);
    expect(require(LICENSE_PATH).verifyLicense(key16, 'x', '20260101')).toBe(true);
    const key8 = makeKey('20301231', 'UNIVERSAL', legacySecret(), 8);
    expect(require(LICENSE_PATH).verifyLicense(key8, 'x', '20260101')).toBe(true);
  });

  test('rejette un format inconnu', () => {
    expect(require(LICENSE_PATH).verifyLicense('ELIMU-20260101', 'x', '20260101')).toBe(false);
    expect(require(LICENSE_PATH).verifyLicense(null, 'x', '20260101')).toBe(false);
  });

  test('rejette une clé dont le HWID ne correspond pas', () => {
    const key = makeKey('20301231', 'HWID-AAAA-BBBB', SECRET);
    expect(require(LICENSE_PATH).verifyLicense(key, 'HWID-CCCC-DDDD', '20260101')).toBe(false);
  });
});

describe('HWID stable — insensible au Wi-Fi / VPN', () => {
  const fs = require('fs');
  const path = require('path');

  function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'elimu-hwid-'));
  }

  // Deux états réseau simulés : Ethernet seul, puis Wi-Fi activé (nouvelle interface en tête)
  const NET_ETH_ONLY = {
    eth0: [{ mac: 'AA:BB:CC:DD:EE:01', internal: false }],
    lo: [{ mac: '00:00:00:00:00:00', internal: true }]
  };
  const NET_WIFI_ON = {
    'Wi-Fi': [{ mac: 'AA:BB:CC:DD:EE:02', internal: false }],
    eth0: [{ mac: 'AA:BB:CC:DD:EE:01', internal: false }],
    lo: [{ mac: '00:00:00:00:00:00', internal: true }]
  };

  test('le HWID stable ne change pas quand le Wi-Fi s’active', () => {
    const dir = tmpDir();
    const lic = require(LICENSE_PATH);
    const spyNet = jest.spyOn(os, 'networkInterfaces');

    spyNet.mockReturnValue(NET_ETH_ONLY);
    const before = lic.getStableHardwareId(dir);

    spyNet.mockReturnValue(NET_WIFI_ON);
    const after = lic.getStableHardwareId(dir);

    spyNet.mockRestore();
    expect(before).toMatch(/^HWID-[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(after).toBe(before);
  });

  test('l’ancien calcul change avec le Wi-Fi (démontre le bug corrigé)', () => {
    const lic = require(LICENSE_PATH);
    const spyNet = jest.spyOn(os, 'networkInterfaces');
    const spyHost = jest.spyOn(os, 'hostname').mockReturnValue('PC-ECOLE');

    spyNet.mockReturnValue(NET_ETH_ONLY);
    const before = lic.getLegacyHardwareId();

    spyNet.mockReturnValue(NET_WIFI_ON);
    const after = lic.getLegacyHardwareId();

    spyNet.mockRestore();
    spyHost.mockRestore();
    expect(after).not.toBe(before);
  });

  test('verifyLicense accepte une clé émise pour le HWID stable', () => {
    process.env.ELIMU_LICENCE_SECRET = 'ELIMU_TEST_SECRET_0123456789';
    delete require.cache[require.resolve(LICENSE_PATH)];
    const lic = require(LICENSE_PATH);
    const dir = tmpDir();
    const stable = lic.getStableHardwareId(dir);
    const key = makeKey('20301231', stable, 'ELIMU_TEST_SECRET_0123456789');
    expect(lic.verifyLicense(key, stable, '20260101')).toBe(true);
    delete process.env.ELIMU_LICENCE_SECRET;
  });

  test('verifyLicense accepte une ancienne clé MAC (rétro-compat à vie)', () => {
    process.env.ELIMU_LICENCE_SECRET = 'ELIMU_TEST_SECRET_0123456789';
    delete require.cache[require.resolve(LICENSE_PATH)];
    const lic = require(LICENSE_PATH);
    const dir = tmpDir();

    // Clé émise à l’époque avec l’ancien calcul (Ethernet seul)
    const spyNet = jest.spyOn(os, 'networkInterfaces');
    const spyHost = jest.spyOn(os, 'hostname').mockReturnValue('PC-ECOLE');
    spyNet.mockReturnValue(NET_ETH_ONLY);
    const legacyHwid = lic.getLegacyHardwareId();
    const key = makeKey('20301231', legacyHwid, 'ELIMU_TEST_SECRET_0123456789');

    // Vérification aujourd’hui : Wi-Fi actif + nouveau HWID stable affiché
    spyNet.mockReturnValue(NET_WIFI_ON);
    const stable = lic.getStableHardwareId(dir);
    expect(stable).not.toBe(legacyHwid);
    expect(lic.verifyLicense(key, stable, '20260101')).toBe(true);

    spyNet.mockRestore();
    spyHost.mockRestore();
    delete process.env.ELIMU_LICENCE_SECRET;
  });
});

describe('extractExpiryFromKey', () => {
  const { extractExpiryFromKey } = require(LICENSE_PATH);

  test('extrait une date valide', () => {
    const date = extractExpiryFromKey('ELIMU-20261231-HWID-AAAA-SIG');
    expect(date).not.toBeNull();
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(11);
    expect(date.getDate()).toBe(31);
  });

  test('retourne null pour un mois invalide', () => {
    expect(extractExpiryFromKey('ELIMU-20261301-HWID-AAAA-SIG')).toBeNull();
  });

  test('retourne null pour un jour invalide', () => {
    expect(extractExpiryFromKey('ELIMU-20260132-HWID-AAAA-SIG')).toBeNull();
  });

  test('retourne null pour une séquence non numérique', () => {
    expect(extractExpiryFromKey('ELIMU-ABCDEF01-HWID-AAAA-SIG')).toBeNull();
  });

  test('retourne null si la clé est vide', () => {
    expect(extractExpiryFromKey('')).toBeNull();
  });
});