/**
 * dateUtils.js - Gestion robuste des dates en évitant les décalages ISO/UTC
 * 
 * Ce module permet d'extraire la date locale au format YYYY-MM-DD ou YYYYMMDD
 * sans subir le décalage de fuseau horaire propre à toISOString().
 */

/**
 * Retourne la date locale au format YYYY-MM-DD
 * @param {Date} [date] - Date optionnelle (par défaut: maintenant)
 * @returns {string} ex: "2026-05-18"
 */
function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retourne la date locale au format YYYYMMDD (Compact)
 * @param {Date} [date] - Date optionnelle (par défaut: maintenant)
 * @returns {string} ex: "20260518"
 */
function getLocalDateStringCompact(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Retourne un timestamp formaté pour les noms de fichiers (YYYY-MM-DD_HH-mm-ss)
 * @param {Date} [date] - Date optionnelle
 * @returns {string}
 */
function getLocalTimestampForFile(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

module.exports = {
  getLocalDateString,
  getLocalDateStringCompact,
  getLocalTimestampForFile
};
