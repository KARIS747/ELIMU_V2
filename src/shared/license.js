const crypto = require('crypto');
const os = require('os');

/**
 * license.js - Utilitaire de gestion des licences (Hardware ID, Vérification)
 * Aucun émoji n'est utilisé dans les textes visibles.
 *
 * IMPORTANT SÉCURITÉ (build) :
 *  - Le secret de signature ne doit JAMAIS être codé en dur dans le dépôt,
 *    qui est public. Il est injecté au moment du build par
 *    scripts/inject-secret.js dans src/shared/license.secret.js
 *    (fichier gitignoré, jamais commité).
 *  - Ordre de résolution du secret :
 *      1. Variable d'environnement ELIMU_LICENCE_SECRET (tests / dev)
 *      2. Fichier injecté au build (license.secret.js)
 *      3. Secret historique (compatibilité avec les clés déjà émises
 *         uniquement — il est public et seules les anciennes clés l'utilisent).
 */

/**
 * Secret historique, public dans le dépôt GitHub public. Conservé UNIQUEMENT
 * pour vérifier les clés déjà émises avant le passage au build secret.
 * Toute NOUVELLE clé doit être signée avec le secret injecté au build.
 */
function _getLegacySecret() {
  const parts = [
    'eLimU',
    Buffer.from('X1MzY3IzdF8=', 'base64').toString(), // _S3cr3t_
    (2000 + 25).toString(), // 2025
    '!'
  ];
  return parts.join('') + os.platform().substring(0, 1);
}

// Secret injecté au build (fichier généré par scripts/inject-secret.js).
let _injectedSecret = null;
try {
  _injectedSecret = require('./license.secret.js');
} catch (_) {
  _injectedSecret = null;
}

/**
 * Retourne le secret de signature utilisé pour émettre/vérifier les clés.
 * Privilégie l'environnement, puis le fichier injecté au build, puis le
 * secret historique.
 */
function _getDynamicSecret() {
  if (process.env.ELIMU_LICENCE_SECRET) return process.env.ELIMU_LICENCE_SECRET;
  if (typeof _injectedSecret === 'string' && _injectedSecret.length > 0) {
    return _injectedSecret;
  }
  return _getLegacySecret();
}

/**
 * Calcule la signature HMAC-SHA256 d'une clé.
 * @param {string} secret - Secret de signature
 * @param {string} dataToSign - Portion de la clé à signer
 * @param {number} [len=16] - Longueur de la signature en chars hex
 * @returns {string} Signature hexadécimale majuscule
 *
 * NOTE : le Licence Manager (portal) signe en 16 hex (64 bits). L'ancien
 * générateur signait en 8 hex (32 bits). La vérification accepte les deux.
 */
function _hmacForSecret(secret, dataToSign, len = 16) {
  return crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex')
    .substring(0, len)
    .toUpperCase();
}

/**
 * Calcule le HWID stable à partir d'un identifiant persistant.
 * Volontairement SANS hostname ni MAC : l'ID ne change plus avec le Wi-Fi,
 * un hotspot, un VPN ou un renommage du PC. Format inchangé (HWID-XXXX-...).
 */
function hwidFromStableId(stableId) {
  const hash = crypto.createHash('sha256').update(String(stableId)).digest('hex').toUpperCase();
  const parts = hash.match(/.{1,4}/g);
  return `HWID-${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
}

/**
 * Retourne le Hardware ID stable de la machine (insensible réseau).
 * @param {string|null} userDataDir - Dossier userData forcé (tests uniquement).
 */
function getStableHardwareId(userDataDir = null) {
  const { getStableMachineId } = require('./machineId');
  return hwidFromStableId(getStableMachineId(userDataDir));
}

/**
 * Génère un identifiant machine unique (Hardware ID).
 * → HWID STABLE (fichier persistant + ID natif OS). Ne dépend plus du réseau :
 * activer le Wi-Fi, un hotspot ou un VPN ne change plus l'identifiant affiché.
 */
function generateHardwareId() {
  try {
    return getStableHardwareId();
  } catch (_) {
    return getLegacyHardwareId();
  }
}

/**
 * Ancien calcul (MAC + hostname) — conservé UNIQUEMENT pour valider les
 * licences déjà émises avant la migration. Ne plus l'utiliser pour afficher
 * ou émettre un HWID.
 */
function getLegacyHardwareId() {
  const networkInterfaces = os.networkInterfaces();
  let mac = '';

  // Trier les noms d'interfaces pour avoir un choix déterministe
  const interfaceNames = Object.keys(networkInterfaces).sort();

  interfaceNames.some((interfaceName) => {
    return networkInterfaces[interfaceName].some((iface) => {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac;
        return true;
      }
      return false;
    });
  });

  const hostname = os.hostname();
  const rawId = `${mac}-${hostname}`;
  
  // Hash SHA-256
  const hash = crypto.createHash('sha256').update(rawId).digest('hex').toUpperCase();
  
  // Formater : HWID-XXXX-XXXX-XXXX-XXXX
  const parts = hash.match(/.{1,4}/g);
  return `HWID-${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
}

/**
 * Retourne tous les HWIDs HISTORIQUES possibles pour cette machine
 * (un par interface réseau valide, ancien calcul MAC + hostname).
 * Utilisé UNIQUEMENT en fallback de vérification pour les licences émises
 * avant la migration vers le HWID stable. Ne pas utiliser pour afficher.
 */
function getAllPossibleHardwareIds() {
  const networkInterfaces = os.networkInterfaces();
  const hostname = os.hostname();
  const hwids = new Set();

  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        const rawId = `${iface.mac}-${hostname}`;
        const hash = crypto.createHash('sha256').update(rawId).digest('hex').toUpperCase();
        const parts = hash.match(/.{1,4}/g);
        hwids.add(`HWID-${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`);
      }
    });
  });

  return Array.from(hwids);
}

/**
 * Vérifie la validité d'une clé de licence
 * @param {string} key - La clé de licence
 * @param {string} hwid - Le Hardware ID actuel de la machine
 * @param {string} [todayOverride] - Optionnel : Date au format YYYYMMDD pour la vérification
 */
function verifyLicense(key, hwid, todayOverride = null) {
  if (!key || typeof key !== 'string') return false;

  const parts = key.split('-');
  if (parts.length < 4 || parts[0] !== 'ELIMU') return false;

  // Format : ELIMU-YYYYMMDD-HWID-XXXX-XXXX-XXXX-XXXX-SIGNATURE
  // Le HWID peut contenir des tirets, donc on doit reconstruire les parties
  
  const expiry = parts[1]; // YYYYMMDD
  
  // Extraire la signature (dernière partie)
  const signature = parts[parts.length - 1];
  
  // Reconstruire la partie à signer : ELIMU-{expiry}-{hwid}
  const dataToSign = parts.slice(0, parts.length - 1).join('-');
  
  // Calculer la signature attendue : le portail signe en 16 hex (64 bits),
// l'ancien générateur en 8 hex (32 bits), et l'ancien secret historique reste
// accepté pour les clés déjà émises.
  const currentSecret = _getDynamicSecret();
  const legacySecret = _getLegacySecret();

  const signatureOk =
    signature === _hmacForSecret(currentSecret, dataToSign, 16) ||
    signature === _hmacForSecret(currentSecret, dataToSign, 8) ||
    (currentSecret !== legacySecret &&
      (signature === _hmacForSecret(legacySecret, dataToSign, 16) ||
        signature === _hmacForSecret(legacySecret, dataToSign, 8)));

  // 1. Vérifier la signature
  if (!signatureOk) return false;

  // 2. Vérifier le HWID (sauf si la clé est universelle)
  const keyHwid = parts.slice(2, parts.length - 1).join('-');

  if (keyHwid !== 'UNIVERSAL') {
    // On vérifie d'abord le HWID (stable) passé en paramètre
    if (keyHwid !== hwid) {
      // Rétro-compatibilité à vie : les clés émises avant la migration
      // (basées sur MAC + hostname) restent acceptées sur la même machine.
      // On vérifie donc aussi tous les HWIDs historiques possibles.
      const allPossible = getAllPossibleHardwareIds();
      if (!allPossible.includes(keyHwid)) return false;
    }
  }

  // 3. Vérifier la date d'expiration
  let today = todayOverride;
  
  if (!today) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    today = `${year}${month}${day}`;
  }
  
  if (today > expiry) return false;

  return true;
}

/**
 * Extrait la date d'expiration d'une clé (format YYYYMMDD) et retourne un objet Date
 */
function extractExpiryFromKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-');
  if (parts.length < 2) return null;
  
  const expiryStr = parts[1];
  if (!/^\d{8}$/.test(expiryStr)) return null;
  
  const year = parseInt(expiryStr.substring(0, 4));
  const month = parseInt(expiryStr.substring(4, 6)); // 1..12
  const day = parseInt(expiryStr.substring(6, 8));

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(year, month - 1, day);
}

module.exports = {
  generateHardwareId,
  getStableHardwareId,
  hwidFromStableId,
  getLegacyHardwareId,
  getAllPossibleHardwareIds,
  verifyLicense,
  extractExpiryFromKey
};
