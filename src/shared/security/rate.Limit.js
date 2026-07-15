/**
 * rateLimit.js - Protection contre les attaques par force brute
 * Stocke en mémoire les tentatives échouées par utilisateur.
 * Blocage temporaire après un seuil d'échecs.
 */

// Configuration
const MAX_ATTEMPTS = 5;           // Nombre max de tentatives avant blocage
const BLOCK_DURATION = 5 * 60 * 1000; // 5 minutes en millisecondes

// Structure de données : Map<username, { count, firstAttempt }>
const attempts = new Map();

/**
 * Vérifie si un utilisateur est actuellement bloqué
 * @param {string} username
 * @returns {boolean}
 */
function isBlocked(username) {
    const record = attempts.get(username);
    if (!record) return false;

    const now = Date.now();
    if (now - record.firstAttempt > BLOCK_DURATION) {
        // Le délai est écoulé, on réinitialise
        attempts.delete(username);
        return false;
    }

    return record.count >= MAX_ATTEMPTS;
}

/**
 * Enregistre une tentative échouée pour un utilisateur
 * @param {string} username
 */
function recordFailedAttempt(username) {
    const now = Date.now();
    const record = attempts.get(username);

    if (!record) {
        attempts.set(username, { count: 1, firstAttempt: now });
    } else {
        record.count++;
        attempts.set(username, record);
    }
}

/**
 * Réinitialise le compteur pour un utilisateur (connexion réussie)
 * @param {string} username
 */
function resetAttempts(username) {
    attempts.delete(username);
}

/**
 * Retourne le nombre de tentatives restantes avant blocage
 * @param {string} username
 * @returns {number}
 */
function getRemainingAttempts(username) {
    const record = attempts.get(username);
    if (!record) return MAX_ATTEMPTS;
    return Math.max(0, MAX_ATTEMPTS - record.count);
}

module.exports = {
    isBlocked,
    recordFailedAttempt,
    resetAttempts,
    getRemainingAttempts,
    MAX_ATTEMPTS,
    BLOCK_DURATION
};