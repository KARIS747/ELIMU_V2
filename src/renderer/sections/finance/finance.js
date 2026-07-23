'use strict';

import { state } from './state.js';
import { _remplirSelectsClasse, showFinLoader, hideFinLoader, _afficherErreurFrais, _masquerErreurFrais } from './helpers.js';
import { _chargerKpis, _chargerDashboard } from './dashboard.js';
import { _ouvrirFormFrais, _fermerFormFrais, _majApercuTranches, _chargerFraisTypes } from './fraisTypes.js';
import { _chargerTranches, _chargerImpayes, _chargerPlusImpayes, _chargerHistorique } from './tranches.js';
import { _ouvrirModalePaiement, _fermerModalePaiement, _chargerTranchesEleve, _majTotalPaiement, _enregistrerPaiement } from './paiement.js';

export async function init(appState) {
  state._state = appState;
  state._classes = appState?.classes || [];
  state._fraisTypes = [];

  _remplirSelectsClasse();
  _setupTabs();

  try {
    await Promise.all([
      _chargerKpis(),
      _chargerFraisTypes(),
      _chargerDashboard(),
      _chargerImpayes(),
      _chargerHistorique()
    ]);
  } catch (err) {
    console.error('Erreur initialisation finance:', err);
  }

  _setupEvents();

  const today = new Date().toISOString().split('T')[0];
  const payDate = document.getElementById('pay-date');
  if (payDate) payDate.value = today;

  const payMontant = document.getElementById('pay-montant');
  if (payMontant) payMontant.readOnly = true;
}

function _setupTabs() {
  document.querySelectorAll('.fin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fin-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(`fin-tab-${btn.dataset.finTab}`);
      if (pane) pane.classList.add('active');
      if (btn.dataset.finTab === 'tranches') {
        state._tranchePage = 1;
        _chargerTranches();
      }
    });
  });
}

function _setupEvents() {
  document.getElementById('btn-fin-nouveau-paiement')?.addEventListener('click', () => {
    _ouvrirModalePaiement();
  });

  document.getElementById('modal-paiement-close')?.addEventListener('click', _fermerModalePaiement);

  document.getElementById('btn-pay-select-all')?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#pay-tranches-list input[type=checkbox]');
    if (!checkboxes.length) return;
    const someUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
    checkboxes.forEach(cb => {
      cb.checked = someUnchecked;
      const item = cb.closest('.tranche-checkbox-item');
      if (item) item.classList.toggle('selected', cb.checked);
    });
    _majTotalPaiement();
  });
  document.getElementById('btn-cancel-paiement')?.addEventListener('click', _fermerModalePaiement);
  document.getElementById('modal-paiement')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-paiement')) _fermerModalePaiement();
  });

  document.getElementById('pay-classe')?.addEventListener('change', async e => {
    const classeId = e.target.value || null;
    const selEleve = document.getElementById('pay-eleve');
    if (!selEleve) return;
    selEleve.innerHTML = `<option value="">${window.t('common.loading')}</option>`;
    try {
      const eleves = await window.elimuAPI.getEleves(classeId ? parseInt(classeId) : null);
      selEleve.innerHTML = `<option value="">— ${window.t('finance.pay_select_student')} —</option>` +
        (Array.isArray(eleves) ? eleves : []).map(e =>
          `<option value="${e.id}">${window.esc(e.prenom)} ${window.esc(e.nom)}</option>`
        ).join('');
    } catch {
      selEleve.innerHTML = `<option value="">— ${window.t('common.error')} —</option>`;
    }
  });

  document.getElementById('pay-eleve')?.addEventListener('change', async e => {
    const eleveId = parseInt(e.target.value);
    if (!eleveId) return;
    await _chargerTranchesEleve(eleveId);
  });

  document.getElementById('btn-save-paiement')?.addEventListener('click', _enregistrerPaiement);

  document.getElementById('btn-add-frais-type')?.addEventListener('click', () => _ouvrirFormFrais(null));
  document.getElementById('btn-cancel-frais')?.addEventListener('click', _fermerFormFrais);
  document.getElementById('btn-cancel-frais-bas')?.addEventListener('click', _fermerFormFrais);

  ['ff-nb-tranches','ff-montant','ff-periodicite','ff-date-debut'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _majApercuTranches);
  });

  document.getElementById('ff-cible')?.addEventListener('change', e => {
    const selClasse = document.getElementById('ff-cible-classe');
    if (selClasse) selClasse.style.display = e.target.value === 'classe' ? 'block' : 'none';
  });

  document.getElementById('btn-save-frais')?.addEventListener('click', async () => {
    _masquerErreurFrais();
    const btn = document.getElementById('btn-save-frais');
    const nom      = document.getElementById('ff-nom')?.value?.trim();
    const montant  = parseFloat(document.getElementById('ff-montant')?.value);
    const nbTranches = parseInt(document.getElementById('ff-nb-tranches')?.value);
    const periode  = parseInt(document.getElementById('ff-periodicite')?.value);
    const dateDebut = document.getElementById('ff-date-debut')?.value;
    const destin   = document.getElementById('ff-destinataire')?.value;
    const actif    = document.getElementById('ff-actif')?.checked ? 1 : 0;

    if (!nom)    { _afficherErreurFrais(window.t('finance.fee_name_label')); return; }
    if (!montant || montant <= 0) { _afficherErreurFrais(window.t('finance.fee_amount_label')); return; }
    if (!nbTranches || nbTranches < 1) { _afficherErreurFrais(window.t('finance.fee_tranches_label')); return; }
    if (!dateDebut) { _afficherErreurFrais(window.t('finance.fee_start_date')); return; }

    btn.disabled = true;
    btn.textContent = window.t('common.processing');

    const data = {
      nom, montant_par_tranche: montant, nombre_tranches: nbTranches,
      periodicite_mois: periode, date_premiere_echeance: dateDebut,
      destinataire: destin, actif
    };

    try {
      const result = state._fraisEditId
        ? await window.elimuAPI.financeUpdateFraisType(state._fraisEditId, data)
        : await window.elimuAPI.financeAddFraisType(data);

      btn.disabled = false;
      btn.textContent = window.t('common.save');

      if (result?.success) {
        showToast(window.t('finance.fee_save_success'), 'success');
        window.elimuAPI.logAudit(state._fraisEditId ? 'UPDATE_FINANCE_TYPE' : 'ADD_FINANCE_TYPE', `Type de frais ${nom} ${state._fraisEditId ? 'modifié' : 'ajouté'}`, state._state?.user?.id);
        _fermerFormFrais();
        await _chargerFraisTypes();
      } else {
        _afficherErreurFrais(result?.error || window.t('common.error'));
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = window.t('common.save');
      _afficherErreurFrais(err.message);
    }
  });

  document.getElementById('btn-generer-tranches')?.addEventListener('click', async () => {
    if (!state._fraisEditId) { showToast(window.t('finance.fee_save_success'), 'warning'); return; }
    const cible    = document.getElementById('ff-cible')?.value || 'all';
    const classeId = document.getElementById('ff-cible-classe')?.value || null;

    showFinLoader(`Génération des tranches pour ${cible === 'all' ? 'tous les élèves' : 'la classe sélectionnés'}...`);
    try {
      const result = await window.elimuAPI.financeGenererTranches({
        frais_type_id: state._fraisEditId,
        cible, id_cible: classeId ? parseInt(classeId) : null
      });
      hideFinLoader();

      if (result?.success) {
        showToast(window.t('finance.tranche_generate_success').replace('{count}', result.nbGeneres), 'success');
        window.elimuAPI.logAudit('GENERATE_TRANCHES', `Génération de ${result.nbGeneres} tranches pour type ID ${state._fraisEditId}`, state._state?.user?.id);
        await _chargerKpis();
      } else {
        showToast('❌ ' + (result?.error || window.t('common.error')), 'error');
      }
    } catch (err) {
      hideFinLoader();
      showToast('❌ ' + err.message, 'error');
    }
  });

  document.getElementById('btn-generer-tout-auto')?.addEventListener('click', async () => {
    if (!confirm("Voulez-vous générer TOUTES les tranches manquantes pour TOUS les types de frais actifs et TOUS les élèves ? Cette opération peut prendre quelques secondes.")) return;

    showFinLoader("Génération globale en cours...");

    try {
      let totalGeneres = 0;
      const typesActifs = state._fraisTypes.filter(f => f.actif);

      if (!typesActifs.length) {
        hideFinLoader();
        showToast("Aucun type de frais actif trouvé.", "warning");
        return;
      }

      for (let i = 0; i < typesActifs.length; i++) {
        const ft = typesActifs[i];
        const prog = Math.round(((i + 1) / typesActifs.length) * 100);
        showFinLoader(`Génération : ${ft.nom}`, prog, `${i + 1} / ${typesActifs.length}`);

        const result = await window.elimuAPI.financeGenererTranches({
          frais_type_id: ft.id,
          cible: 'all'
        });
        if (result?.success) totalGeneres += result.nbGeneres;
      }

      hideFinLoader();
      showToast(`Génération terminée : ${totalGeneres} nouvelles tranches créées.`, "success");
      await _chargerKpis();
      if (document.getElementById('fin-tab-tranches').classList.contains('active')) {
        _chargerTranches();
      }
    } catch (err) {
      hideFinLoader();
      showToast('❌ ' + err.message, 'error');
    }
  });

  document.getElementById('fin-search-eleve')?.addEventListener('input', () => {
    if (state._searchTimeout) clearTimeout(state._searchTimeout);
    state._searchTimeout = setTimeout(() => {
      state._tranchePage = 1;
      _chargerTranches();
    }, 400);
  });

  ['fin-filter-classe', 'fin-filter-statut', 'fin-filter-frais-type'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      state._tranchePage = 1;
      _chargerTranches();
    });
  });

  document.getElementById('btn-fin-filter')?.addEventListener('click', async () => {
    state._tranchePage = 1;
    await _chargerTranches();
  });

  document.getElementById('fin-filter-numero-tranche')?.addEventListener('change', async () => {
    state._tranchePage = 1;
    await _chargerTranches();
  });

  document.getElementById('btn-export-impayes-xl')?.addEventListener('click', async () => {
    try {
      const lang = window.getCurrentGenLocale();
      const result = await window.elimuAPI.financeExportImpayes(null, lang);
      if (result?.canceled) return;
      showToast(result?.success ? window.t('finance.export_unpaid_success') : '❌ ' + (result?.error || window.t('common.error')),
                result?.success ? 'success' : 'error');
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  document.getElementById('btn-fin-export-impayes')?.addEventListener('click', async () => {
    try {
      const lang = window.getCurrentGenLocale();
      const result = await window.elimuAPI.financeExportImpayes(null, lang);
      if (result?.canceled) return;
      showToast(result?.success ? window.t('finance.export_unpaid_success') : '❌ ' + (result?.error || window.t('common.error')),
                result?.success ? 'success' : 'error');
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  document.getElementById('btn-export-impayes-courant')?.addEventListener('click', async () => {
    try {
      const classeId = document.getElementById('fin-impayes-filter-classe')?.value || null;
      const lang = window.getCurrentGenLocale();
      const result = await window.elimuAPI.financeExportImpayes(classeId ? parseInt(classeId) : null, lang);
      if (result?.canceled) return;
      showToast(result?.success ? window.t('finance.export_unpaid_class_success').replace('{count}', result.nbImpayes) : '❌ ' + (result?.error || window.t('common.error')),
                result?.success ? 'success' : 'error');
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  document.getElementById('btn-export-impayes-pdf-courant')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-export-impayes-pdf-courant');
    if (!btn) return;

    const classeId     = document.getElementById('fin-impayes-filter-classe')?.value || null;
    const fraisTypeId  = document.getElementById('fin-impayes-filter-frais')?.value || null;
    const numeroTranche = document.getElementById('fin-impayes-filter-numero')?.value || null;
    const lang = window.getCurrentGenLocale();

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '⏳ ...';

    try {
      const result = await window.elimuAPI.financeExportImpayesPDF({
        classeId, fraisTypeId, numeroTranche, lang
      });

      btn.disabled = false;
      btn.innerHTML = oldHtml;

      if (result?.canceled) return;
      if (result?.success) {
        showToast(`${result.count} impayés exportés en PDF`, 'success');
      } else {
        showToast('❌ ' + (result?.error || window.t('common.error')), 'error');
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
      showToast('❌ ' + err.message, 'error');
    }
  });

  document.getElementById('fin-load-more-impayes')?.addEventListener('click', _chargerPlusImpayes);

  document.getElementById('btn-voir-tous-paiements')?.addEventListener('click', () => {
    document.querySelector('.fin-tab-btn[data-fin-tab="historique"]')?.click();
  });

  document.getElementById('btn-fin-hist-filter')?.addEventListener('click', _chargerHistorique);

  document.getElementById('btn-fin-impayes-filter-apply')?.addEventListener('click', () => _chargerImpayes(true));
  ['fin-impayes-filter-classe', 'fin-impayes-filter-frais', 'fin-impayes-filter-numero'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => _chargerImpayes(true));
  });
}
