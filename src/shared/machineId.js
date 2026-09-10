const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

/**
 * machineId.js — Identifiant machine STABLE (insensible au Wi-Fi / VPN / dock).
 *
 * Stratégie (sans dépendance lourde, sans hostname) :
 *   1. Fichier persistant `machine.id` dans userData (source de vérité, créé une fois).
 *   2. Lecture OS native (MachineGuid Windows, /etc/machine-id Linux, IOPlatformUUID macOS).
 *   3. Fallback : UUIDv4 aléatoire persisté dans `machine.id`.
 *
 * Le HWID affiché ne change donc plus quand on active le Wi-Fi, un hotspot ou un VPN.
 */

const MACHINE_ID_FILENAME = 'machine.id';

function _userDataDir() {
  try {
    // Contexte Electron (main process)
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch (_) { /* pas dans Electron : fallback */ }
  return path.join(os.homedir(), '.elimu');
}

function _machineIdFile(customDir = null) {
  return path.join(customDir || _userDataDir(), MACHINE_ID_FILENAME);
}

function _readFileId(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (/^[0-9a-fA-F-]{8,64}$/.test(raw)) return raw.toLowerCase();
  } catch (_) { /* absent ou illisible */ }
  return null;
}

function _writeFileId(filePath, id) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${id}\n`, 'utf8');
}

/**
 * Tente de lire un identifiant natif du système d'exploitation.
 * Retourne null si indisponible (jamais d'exception propagée).
 */
function readOsMachineId() {
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      const out = execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }
      );
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/i);
      if (m && m[1]) return m[1].trim().toLowerCase();
    } else if (platform === 'linux') {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try {
          const raw = fs.readFileSync(p, 'utf8').trim().toLowerCase();
          if (/^[0-9a-f]{16,64}$/.test(raw)) return raw;
        } catch (_) { /* essayer le suivant */ }
      }
    } else if (platform === 'darwin') {
      const out = execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice | awk \'/IOPlatformUUID/ {print $NF}\'',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, shell: '/bin/sh' }
      );
      const cleaned = (out || '').replace(/["\s]/g, '').toLowerCase();
      if (/^[0-9a-f-]{8,64}$/.test(cleaned)) return cleaned;
    }
  } catch (_) { /* OS illisible : fallback */ }
  return null;
}

/**
 * Retourne l'identifiant machine stable, en le créant/persistant si besoin.
 * @param {string|null} customDir - Dossier userData forcé (tests uniquement).
 */
function getStableMachineId(customDir = null) {
  const filePath = _machineIdFile(customDir);

  // 1. Fichier persistant = source de vérité
  const fromFile = _readFileId(filePath);
  if (fromFile) return fromFile;

  // 2. Identifiant natif OS → on le persiste pour figer à vie
  //    (même si l'OS le régénère un jour, le fichier garde l'ancien)
  const osId = readOsMachineId();
  if (osId) {
    try { _writeFileId(filePath, osId); } catch (_) { /* disque non inscriptible : mémoire */ }
    return osId;
  }

  // 3. Dernier recours : UUID aléatoire persisté
  const fresh = crypto.randomUUID();
  try { _writeFileId(filePath, fresh); } catch (_) { /* mémoire uniquement */ }
  return fresh;
}

module.exports = { getStableMachineId, readOsMachineId, MACHINE_ID_FILENAME };
