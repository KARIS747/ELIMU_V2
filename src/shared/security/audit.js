/**
 * audit.js - Module de journalisation des actions sensibles
 * 
 * Enregistre toutes les actions importantes dans la table audit_log.
 * Permet à M. Karis de voir qui a fait quoi et quand.
 */

const os = require('os');

/**
 * Enregistre une action dans le journal d'audit
 * @param {number|null} utilisateurId - ID de l'utilisateur connecté
 * @param {string} action - Type d'action (ex: "CONNEXION", "IMPORT_EXCEL")
 * @param {string} details - Détails supplémentaires sur l'action
 */
async function logAudit(utilisateurId, action, details = '', ecoleId = '') {
  try {
    const { getDatabase, get } = require('../database/db');
    const db = getDatabase();

    // Essayer de récupérer ecole_id depuis la base si non fourni
    if (!ecoleId) {
      try {
        const row = get("SELECT valeur FROM parametres WHERE cle = 'ecole_id'");
        if (row) ecoleId = row.valeur;
      } catch (_) {}
    }

    // Récupération de l'adresse IP locale pour identifier le poste
    const networkInterfaces = os.networkInterfaces();
    let ipLocale = '127.0.0.1';
    for (const name of Object.keys(networkInterfaces)) {
      for (const iface of networkInterfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipLocale = iface.address;
          break;
        }
      }
    }

    db.prepare(`
      INSERT INTO audit_log (utilisateur_id, action, details, adresse_ip_locale, ecole_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(utilisateurId, action, details, ipLocale, ecoleId);
  } catch (error) {
    // On ne veut pas que l'audit bloque l'application
    console.error('Erreur audit log (non bloquant):', error);
  }
}

module.exports = { logAudit };
