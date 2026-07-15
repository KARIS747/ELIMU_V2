/**
 * parametres.js - Gestion des paramètres de l'application Elimu (Refactorisé)
 */

import { init as initGeneral } from './modules/general.js';
import { init as initSeuils } from './modules/seuils.js';
import { init as initSauvegarde, chargerListeBackups, chargerAudit } from './modules/sauvegarde.js';
import { chargerBulletinConfig } from './modules/bulletin.js';
import { chargerReglesAbsences } from './modules/absences.js';
import { chargerUtilisateurs, attacherEvenementsUtilisateurs, resetEventsUtilisateurs } from './modules/utilisateurs.js';
import { chargerAuditOnglet } from './modules/audit.js';
import { chargerAnneesScolaires, attacherEvenementsAnnees, resetEventsAnnees } from './modules/annees.js';
import { initUpdate } from './modules/update.js';

let reglesAbsencesChargees = false;
let bulletinCharge          = false;
let updateInitialise       = false;

export async function init(state) {
  // Réinitialiser les drapeaux d'événements car le DOM a été recréé par renderer.js
  resetEventsAnnees();
  resetEventsUtilisateurs();
  reglesAbsencesChargees = false;
  bulletinCharge = false;
  updateInitialise = false;

  // Initialisation des modules de base (chargés immédiatement)
  await Promise.all([
    initGeneral(state),
    initSeuils(state),
    initSauvegarde(state)
  ]);

  attacherEvenementsTabs();
}

/**
 * Gestion de la navigation par onglets avec chargement lazy des données.
 */
function attacherEvenementsTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  
  tabs.forEach(btn => {
    btn.addEventListener('click', async () => {
      const tabName = btn.dataset.tab;
      
      // 1. UI : Activer le bouton et le contenu
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const activeContent = document.getElementById(`tab-${tabName}`);
      if (activeContent) activeContent.classList.add('active');

      // 2. Chargement lazy selon l'onglet
      switch (tabName) {
        case 'sauvegarde':
          // On rafraîchit toujours la liste des backups et le mini-audit
          await Promise.all([chargerListeBackups(), chargerAudit()]);
          break;
          
        case 'bulletin':
          if (!bulletinCharge) {
            await chargerBulletinConfig();
            bulletinCharge = true;
          }
          break;

        case 'absences':
          if (!reglesAbsencesChargees) {
            await chargerReglesAbsences();
            reglesAbsencesChargees = true;
          }
          break;

        case 'utilisateurs':
          attacherEvenementsUtilisateurs();
          await chargerUtilisateurs();
          break;

        case 'audit':
          await chargerAuditOnglet();
          break;

        case 'annees':
          await chargerAnneesScolaires();
          attacherEvenementsAnnees();
          break;

        case 'update':
          if (!updateInitialise) {
            await initUpdate();
            updateInitialise = true;
          }
          break;
      }
    });
  });

  // Bouton de rafraîchissement spécifique à l'onglet Audit
  document.getElementById('btn-refresh-audit-tab')?.addEventListener('click', chargerAuditOnglet);
}
