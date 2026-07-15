/**
 * parentSync.js — Utilitaire de synchronisation automatique entre élèves et parents
 */

const { run, get } = require('../database/db');
const bcrypt = require('bcryptjs');
const BCRYPT_ROUNDS = 10;

/**
 * Synchronise un élève avec son parent via le numéro de téléphone.
 * - Crée le parent s'il n'existe pas.
 * - Lie l'élève au parent.
 * - Met à jour le nom du parent si nécessaire.
 * 
 * @param {number} eleveId 
 * @param {string} nomParent 
 * @param {string} telephoneParent 
 * @param {object} logger 
 */
async function syncParentEleve(eleveId, nomParent, telephoneParent, logger) {
  if (!telephoneParent || !telephoneParent.trim()) {
    // Si pas de téléphone, on s'assure qu'il n'y a plus de liaison (facultatif selon métier)
    await run('DELETE FROM parents_eleves WHERE eleve_id = ?', [eleveId]);
    return;
  }

  const tel = telephoneParent.trim();
  const nom = nomParent ? nomParent.trim() : '';

  try {
    // 1. Trouver ou créer le parent
    let parent = await get('SELECT id, nom_parent FROM parents WHERE telephone = ?', [tel]);

    if (!parent) {
      // Générer un mot de passe par défaut
      const charSet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let rawPassword = '';
      for (let i = 0; i < 8; i++) {
        rawPassword += charSet.charAt(Math.floor(Math.random() * charSet.length));
      }
      const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

      const result = await run(
        'INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent) VALUES (?, ?, ?)',
        [tel, hash, nomParent]
      );
      parent = { id: result.lastID, nom_parent: nom };
      logger.info(`Parent créé automatiquement pour le téléphone ${tel}`);
    } else if (nom && (!parent.nom_parent || parent.nom_parent === '')) {
      // Mettre à jour le nom si on en a un maintenant
      await run('UPDATE parents SET nom_parent = ? WHERE id = ?', [nom, parent.id]);
    }

    // 2. Mettre à jour la liaison dans parents_eleves
    // Supprimer les anciennes liaisons pour cet élève (un élève n'a qu'un numéro parent dans la table eleves)
    await run('DELETE FROM parents_eleves WHERE eleve_id = ?', [eleveId]);
    
    // Créer la nouvelle liaison
    await run('INSERT OR IGNORE INTO parents_eleves (parent_id, eleve_id) VALUES (?, ?)', [parent.id, eleveId]);

  } catch (error) {
    logger.error(`Erreur lors de la synchronisation parent pour l'élève ${eleveId}:`, error);
    throw error;
  }
}

module.exports = { syncParentEleve };
