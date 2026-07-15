/**
 * shared/security/access.js - Middleware de sécurité pour IPC
 */

const { get } = require('../database/db');

/**
 * Vérifie si l'utilisateur a le rôle requis
 * @param {number} userId 
 * @param {string|string[]} roles 
 */
async function hasRole(userId, roles) {
  if (!userId) return false;
  const user = get('SELECT role FROM utilisateurs WHERE id = ?', [userId]);
  if (!user) return false;
  
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  return allowedRoles.includes(user.role);
}

module.exports = { hasRole };
