import { state } from './state.js';
import { formatMontant, formatDate, statutBadge, _masquerErreurPaiement, _afficherErreurPaiement } from './helpers.js';
import { _chargerKpis, _chargerDashboard } from './dashboard.js';
import { _chargerImpayes, _chargerTranches, _chargerHistorique } from './tranches.js';

async function _ouvrirModalePaiement(eleveId = null, trancheId = null) {
  const modal = document.getElementById('modal-paiement');
  if (!modal) return;
  modal.style.display = 'flex';

  document.getElementById('pay-classe').value = '';
  document.getElementById('pay-eleve').value  = '';
  document.getElementById('pay-montant').value = '';
  document.getElementById('pay-reference').value = '';
  document.getElementById('pay-notes').value = '';
  document.getElementById('pay-mode').value = 'especes';
  document.getElementById('pay-tranches-list').innerHTML =
    `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">${window.t('finance.pay_select_student_hint')}</div>`;
  document.getElementById('pay-total-selectionne').textContent = '0 FCFA';
  _masquerErreurPaiement();

  if (eleveId) {
    try {
      const eleveInfo = await _getEleveClasse(eleveId);
      if (eleveInfo && eleveInfo.classe_id) {
        const classeSelect = document.getElementById('pay-classe');
        if (classeSelect) {
          classeSelect.value = eleveInfo.classe_id;
          const eleves = await window.elimuAPI.getEleves(parseInt(eleveInfo.classe_id));
          const selEleve = document.getElementById('pay-eleve');
          if (selEleve) {
            selEleve.innerHTML = `<option value="">— ${window.t('finance.pay_select_student')} —</option>` +
              (Array.isArray(eleves) ? eleves : []).map(e =>
                `<option value="${e.id}">${window.esc(e.prenom)} ${window.esc(e.nom)}</option>`
              ).join('');
            selEleve.value = eleveId;

            await _chargerTranchesEleve(eleveId, trancheId);
          }
        }
      }
    } catch (err) {
      console.error('Erreur ouverture modale paiement:', err);
    }
  }
}

async function _getEleveClasse(eleveId) {
  try {
    const detail = await window.elimuAPI.getEleveDetail(eleveId);
    return detail?.eleve || null;
  } catch {
    return null;
  }
}

function _fermerModalePaiement() {
  const modal = document.getElementById('modal-paiement');
  if (modal) modal.style.display = 'none';
}

async function _chargerTranchesEleve(eleveId, preselectTrancheId = null) {
  const container = document.getElementById('pay-tranches-list');
  if (!container) return;
  container.innerHTML = '<div class="loader"><div class="spinner" style="width:24px;height:24px;margin:0 auto;"></div></div>';

  try {
    const tranches = await window.elimuAPI.financeGetTranchesParEleve(eleveId);
    const impayees = Array.isArray(tranches) ? tranches.filter(t => t.statut !== 'paye') : [];

    if (!impayees.length) {
      container.innerHTML = `<p style="color:var(--green-fifa);text-align:center;padding:12px;font-size:13px;">${window.t('finance.no_unpaid')}</p>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    impayees.forEach(t => {
      const item = document.createElement('div');
      item.className = `tranche-checkbox-item ${preselectTrancheId === t.id ? 'selected' : ''}`;
      item.dataset.trancheId = t.id;
      item.dataset.montant = t.montant;

      item.innerHTML = `
        <input type="checkbox" value="${t.id}" data-montant="${t.montant}" ${preselectTrancheId === t.id ? 'checked' : ''}
               style="accent-color:var(--green-fifa); width:15px; height:15px;">
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">
            ${window.esc(t.nom_frais)} — ${window.t('finance.th_tranche')} ${t.numero_tranche}
          </div>
          <div style="font-size:11px; color:var(--text-muted);">
            ${window.t('finance.th_due_date')} : ${formatDate(t.date_echeance)} · ${statutBadge(t.statut)}
          </div>
        </div>
        <div style="font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:var(--yellow-fifa);">
          ${formatMontant(t.montant)}
        </div>
      `;

      const cb = item.querySelector('input[type=checkbox]');
      cb.addEventListener('change', () => {
        item.classList.toggle('selected', cb.checked);
        _majTotalPaiement();
      });

      item.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return;
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
      });

      fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
      _majTotalPaiement();
    });

  } catch (e) {
    console.error('Erreur _chargerTranchesEleve:', e);
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;">${window.t('finance.error_load')}</p>`;
  }
}

function _majTotalPaiement() {
  let total = 0;
  document.querySelectorAll('#pay-tranches-list input[type=checkbox]:checked').forEach(cb => {
    total += parseFloat(cb.dataset.montant) || 0;
  });
  const totalEl = document.getElementById('pay-total-selectionne');
  if (totalEl) totalEl.textContent = formatMontant(total);
  const payMontant = document.getElementById('pay-montant');
  if (payMontant) payMontant.value = total;
}

async function _enregistrerPaiement() {
  _masquerErreurPaiement();
  const eleveId  = parseInt(document.getElementById('pay-eleve')?.value);
  let montant    = parseFloat(document.getElementById('pay-montant')?.value);
  const mode     = document.getElementById('pay-mode')?.value;
  const date     = document.getElementById('pay-date')?.value;
  const reference = document.getElementById('pay-reference')?.value?.trim() || null;
  const notes    = document.getElementById('pay-notes')?.value?.trim() || null;

  if (!eleveId)  { _afficherErreurPaiement(window.t('finance.pay_select_student')); return; }
  if (!montant || montant <= 0) { _afficherErreurPaiement(window.t('finance.pay_amount_label')); return; }
  if (!date)     { _afficherErreurPaiement(window.t('finance.pay_date_label')); return; }

  const trancheIds = Array.from(
    document.querySelectorAll('#pay-tranches-list input[type=checkbox]:checked')
  ).map(cb => parseInt(cb.value));

  let totalTranches = 0;
  for (const cb of document.querySelectorAll('#pay-tranches-list input[type=checkbox]:checked')) {
    totalTranches += parseFloat(cb.dataset.montant) || 0;
  }

  if (totalTranches > 0 && Math.abs(montant - totalTranches) > 0.01) {
    const confirmMsg = window.t('common.processing')
      .replace('{amount}', formatMontant(montant))
      .replace('{total}', formatMontant(totalTranches));

    if (!confirm(confirmMsg)) return;
    montant = totalTranches;
    document.getElementById('pay-montant').value = montant;
  }

  const btn = document.getElementById('btn-save-paiement');
  btn.disabled = true;
  btn.textContent = '⏳ ' + window.t('common.processing');

  try {
    const result = await window.elimuAPI.financeEnregistrerPaiement({
      eleve_id:    eleveId,
      montant,
      date,
      mode,
      reference,
      notes,
      tranche_ids: trancheIds,
      utilisateur_id: state._state?.user?.id
    });

    btn.disabled = false;
    btn.textContent = window.t('finance.btn_save_payment');

    if (result?.success) {
      _fermerModalePaiement();
      showToast(window.t('finance.payment_success').replace('{num}', result.recu_numero), 'success');

      if (result.paiement_id) {
        setTimeout(() => {
          if (confirm(window.t('finance.payment_confirm_print').replace('{num}', result.recu_numero))) {
            _imprimerRecu(result.paiement_id);
          }
        }, 300);
      }

      await Promise.all([_chargerKpis(), _chargerDashboard(), _chargerImpayes(), _chargerTranches(), _chargerHistorique()]);
    } else {
      _afficherErreurPaiement(result?.error || window.t('common.error'));
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = window.t('finance.btn_save_payment');
    _afficherErreurPaiement(err.message);
  }
}

async function _imprimerRecu(paiementId) {
  try {
    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.financeGetRecuPDF(paiementId, lang);
    if (result?.canceled) return;
    if (result?.success) {
      showToast(window.t('finance.receipt_pdf_success'), 'success');
    } else {
      showToast('❌ ' + (result?.error || window.t('finance.receipt_pdf_error')), 'error');
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

export { _ouvrirModalePaiement, _getEleveClasse, _fermerModalePaiement, _chargerTranchesEleve, _majTotalPaiement, _enregistrerPaiement, _imprimerRecu };
