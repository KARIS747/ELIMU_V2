/**
 * financeUtils.js – Helpers pour la section finance
 */

const { run } = require('../database/db');
const { getLocalDateString } = require('./dateUtils');

function formatMontant(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ') + ' FCFA';
}

/**
 * Met à jour les statuts des tranches en retard.
 * @param {string} ecoleId
 */
function majStatutsTransches(ecoleId) {
  const today = getLocalDateString();
  run(
    `UPDATE tranches SET statut = 'en_retard'
     WHERE statut = 'en_attente' AND date_echeance < ? AND ecole_id = ?`,
    [today, ecoleId || '']
  );
}

function genererNumeroRecu(existingNumbers = [], dateStr = null) {
  const today = dateStr || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let max = 0;
  if (existingNumbers.length) {
    const regex = new RegExp(`REC-${today}-(\\d+)$`);
    for (const num of existingNumbers) {
      const match = num.match(regex);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  }
  const next = (max + 1).toString().padStart(5, '0');
  return `REC-${today}-${next}`;
}

function calculerTauxRecouvrement(totalDu, totalEncaisse) {
  if (!totalDu || totalDu <= 0) return 0;
  return parseFloat(((totalEncaisse / totalDu) * 100).toFixed(2));
}

function getStatutTranche(statut, dateEcheance, aujourdhui) {
  if (statut === 'paye') return 'paye';
  if (dateEcheance < aujourdhui) return 'en_retard';
  return 'en_attente';
}

module.exports = {
  formatMontant,
  majStatutsTransches,
  genererNumeroRecu,
  calculerTauxRecouvrement,
  getStatutTranche
};
