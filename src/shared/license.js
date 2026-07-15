const crypto = require('crypto');
const os = require('os');

/**
 * license.js - Utilitaire de gestion des licences (Hardware ID, Vérification)
 * Aucun émoji n'est utilisé dans les textes visibles.
 */

/**
 * Génère le secret de manière dynamique pour compliquer le reverse-engineering.
 * Le secret n'est jamais stocké en clair dans une seule variable.
 */
function _getDynamicSecret() {
  const parts = [
    'eLimU',
    Buffer.from('X1MzY3IzdF8=', 'base64').toString(), // _S3cr3t_
    (2000 + 25).toString(), // 2025
    '!'
  ];
  // On ajoute un fragment du nom de l'OS pour lier le secret à la plateforme
  return parts.join('') + os.platform().substring(0, 1);
}

/**
 * Génère un identifiant machine unique (Hardware ID)
 * Basé sur la première adresse MAC non interne (triée par nom d'interface) et le nom d'hôte.
 */
function generateHardwareId() {
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
 * Retourne tous les HWIDs possibles pour cette machine (un par interface réseau valide)
 * Utile pour la vérification quand l'ordre des interfaces change (ex: connexion VPN, Hotspot).
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
  
  // Calculer la signature attendue
  const expectedSignature = crypto
    .createHmac('sha256', _getDynamicSecret())
    .update(dataToSign)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  // 1. Vérifier la signature
  if (signature !== expectedSignature) return false;

  // 2. Vérifier le HWID (sauf si la clé est universelle)
  const keyHwid = parts.slice(2, parts.length - 1).join('-');
  
  if (keyHwid !== 'UNIVERSAL') {
    // On vérifie d'abord le HWID principal passé en paramètre
    if (keyHwid !== hwid) {
      // Si ça ne match pas, on vérifie tous les autres HWIDs possibles de la machine
      // (au cas où l'ordre des interfaces réseau a changé, ex: hotspot mobile)
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
  const month = parseInt(expiryStr.substring(4, 6)) - 1;
  const day = parseInt(expiryStr.substring(6, 8));
  
  return new Date(year, month, day);
}

module.exports = { generateHardwareId, getAllPossibleHardwareIds, verifyLicense, extractExpiryFromKey };
