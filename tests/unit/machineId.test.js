const fs = require('fs');
const os = require('os');
const path = require('path');

const MACHINEID_PATH = '../../src/shared/machineId';

function freshModule() {
  delete require.cache[require.resolve(MACHINEID_PATH)];
  return require(MACHINEID_PATH);
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'elimu-mid-'));
}

describe('machineId — identifiant stable', () => {
  test('getStableMachineId est idempotent et persiste dans machine.id', () => {
    const dir = tmpDir();
    const { getStableMachineId, MACHINE_ID_FILENAME } = freshModule();
    const first = getStableMachineId(dir);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(7);
    expect(fs.existsSync(path.join(dir, MACHINE_ID_FILENAME))).toBe(true);
    // Second appel → même valeur (lecture fichier)
    expect(getStableMachineId(dir)).toBe(first);
  });

  test('une valeur fichier existante est réutilisée telle quelle', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'machine.id'), '  ABCDEF12-3456-7890-abcd-ef1234567890\n', 'utf8');
    const { getStableMachineId } = freshModule();
    expect(getStableMachineId(dir)).toBe('abcdef12-3456-7890-abcd-ef1234567890');
  });

  test('un fichier invalide est ignoré et régénéré', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'machine.id'), 'pas-un-id-valide!!!', 'utf8');
    const { getStableMachineId } = freshModule();
    const id = getStableMachineId(dir);
    expect(id).not.toBe('pas-un-id-valide!!!');
    expect(id.length).toBeGreaterThan(7);
  });

  test('readOsMachineId ne lève jamais (null si indisponible)', () => {
    const { readOsMachineId } = freshModule();
    let val;
    expect(() => { val = readOsMachineId(); }).not.toThrow();
    expect(val === null || typeof val === 'string').toBe(true);
  });
});
