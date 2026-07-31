/**
 * financeUtils.js — Fonctions utilitaires partagées pour le module Finance
 */

const { run, get, all } = require('../../shared/database/db');
const { getLocalDateString, getLocalDateStringCompact } = require('../../shared/utils/dateUtils');
const { majStatutsTransches } = require('../../shared/utils/financeUtils');

/**
 * Génère un numéro de reçu séquentiel de la forme REC-AAAAMMJJ-NNNNN.
 * @param {string} ecoleId
 * @returns {string}
 */
function genererNumeroRecu(ecoleId) {
  const dateStr = getLocalDateStringCompact();
  const last = get(
    `SELECT recu_numero FROM paiements WHERE recu_numero LIKE ? AND ecole_id = ? ORDER BY id DESC LIMIT 1`,
    [`REC-${dateStr}-%`, ecoleId || '']
  );
  let compteur = 1;
  if (last && last.recu_numero) {
    const match = last.recu_numero.match(/-(\d+)$/);
    if (match) compteur = parseInt(match[1]) + 1;
  }
  const suffix = String(compteur).padStart(5, '0');
  return `REC-${dateStr}-${suffix}`;
}

/**
 * Génère automatiquement les tranches de paiement
 * @param {number} eleveId
 * @param {number} anneeId
 * @param {object} logger
 * @param {string} ecoleId
 */
function genererTranchesPourEleve(eleveId, anneeId, logger, ecoleId) {
  try {
    const eid = ecoleId || '';
    const fraisActifs = all(`SELECT * FROM frais_types WHERE actif = 1 AND ecole_id = ?`, [eid]);
    if (!fraisActifs || !fraisActifs.length) {
      logger.info(`genererTranchesPourEleve(${eleveId}) : aucun type de frais actif, skip.`);
      return { success: true, nbGeneres: 0 };
    }

    let nbGeneres = 0;
    for (const ft of fraisActifs) {
      const dateDebut = new Date(ft.date_premiere_echeance);
      let date = new Date(dateDebut);
      for (let t = 1; t <= ft.nombre_tranches; t++) {
        try {
          run(
            `INSERT OR IGNORE INTO tranches
               (frais_type_id, eleve_id, numero_tranche, montant, date_echeance, statut, annee_scolaire_id, ecole_id)
             VALUES (?, ?, ?, ?, ?, 'en_attente', ?, ?)`,
            [ft.id, eleveId, t, ft.montant_par_tranche, getLocalDateString(date), anneeId, eid]
          );
          nbGeneres++;
        } catch (insertErr) {
          logger.warn(
            `genererTranchesPourEleve: tranche ${t} frais ${ft.id} élève ${eleveId} — ${insertErr.message}`
          );
        }
        date.setMonth(date.getMonth() + ft.periodicite_mois);
      }
    }

    logger.info(
      `✅ genererTranchesPourEleve(${eleveId}) : ${nbGeneres} tranche(s) générée(s) pour ${fraisActifs.length} type(s) de frais.`
    );
    return { success: true, nbGeneres };
  } catch (e) {
    logger.error(`Erreur genererTranchesPourEleve(${eleveId}):`, e);
    return { success: false, message: e.message };
  }
}

module.exports = { majStatutsTransches, genererNumeroRecu, genererTranchesPourEleve };
