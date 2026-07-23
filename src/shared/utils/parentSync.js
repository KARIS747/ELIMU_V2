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
 * @param {string} ecoleId 
 */
async function syncParentEleve(eleveId, nomParent, telephoneParent, logger, ecoleId) {
  if (!telephoneParent || !telephoneParent.trim()) {
    await run('DELETE FROM parents_eleves WHERE eleve_id = ?', [eleveId]);
    return;
  }

  const tel = telephoneParent.trim();
  const nom = nomParent ? nomParent.trim() : '';
  const eid = ecoleId || '';

  try {
    let parent = await get(
      'SELECT id, nom_parent FROM parents WHERE telephone = ? AND ecole_id = ?',
      [tel, eid]
    );

    if (!parent) {
      const charSet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let rawPassword = '';
      for (let i = 0; i < 8; i++) {
        rawPassword += charSet.charAt(Math.floor(Math.random() * charSet.length));
      }
      const hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

      const result = await run(
        'INSERT INTO parents (telephone, mot_de_passe_hash, nom_parent, ecole_id) VALUES (?, ?, ?, ?)',
        [tel, hash, nomParent, eid]
      );
      parent = { id: result.lastID, nom_parent: nom };
      logger.info(`Parent créé automatiquement pour le téléphone ${tel}`);
    } else if (nom && (!parent.nom_parent || parent.nom_parent === '')) {
      await run('UPDATE parents SET nom_parent = ? WHERE id = ? AND ecole_id = ?', [nom, parent.id, eid]);
    }

    await run('DELETE FROM parents_eleves WHERE eleve_id = ?', [eleveId]);

    await run(
      'INSERT OR IGNORE INTO parents_eleves (parent_id, eleve_id, ecole_id) VALUES (?, ?, ?)',
      [parent.id, eleveId, eid]
    );

  } catch (error) {
    logger.error(`Erreur lors de la synchronisation parent pour l'élève ${eleveId}:`, error);
    throw error;
  }
}

module.exports = { syncParentEleve };
