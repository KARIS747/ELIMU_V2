import { state } from './state.js';
import { formatMontant, formatDate, _setVal, _afficherErreurFrais, _masquerErreurFrais, _remplirSelectsClasse, finConfirm } from './helpers.js';
import { _chargerKpis } from './dashboard.js';

async function _chargerFraisTypes() {
  const container = document.getElementById('fin-frais-types-list');
  if (!container) return;

  try {
    const rows = await window.elimuAPI.financeGetFraisTypes();
    state._fraisTypes = Array.isArray(rows) ? rows : [];
    _remplirSelectsClasse();

    if (!state._fraisTypes.length) {
      container.innerHTML = `
        <div style="text-align:center; padding:30px; color:var(--text-muted);">
          <div style="font-size:40px; margin-bottom:12px; opacity:0.3;">💳</div>
          <div>${window.t('finance.no_data')}</div>
        </div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    const table = document.createElement('table');
    table.className = 'fin-table';

    table.innerHTML = `
      <thead>
        <tr>
          <th>${window.t('common.name')}</th><th>${window.t('finance.th_amount')}</th><th>${window.t('finance.th_tranche')}</th>
          <th>${window.t('finance.fee_period_label')}</th><th>${window.t('finance.fee_start_date')}</th><th>${window.t('finance.th_status')}</th><th>${window.t('common.actions')}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    state._fraisTypes.forEach(f => {
      const tr = document.createElement('tr');
      const periodLabel = f.periodicite_mois === 1 ? window.t('finance.period_monthly')
                        : f.periodicite_mois === 3 ? window.t('finance.period_quarterly')
                        : f.periodicite_mois === 6 ? window.t('finance.period_biannual')
                        : window.t('finance.period_annual');

      const scopeNoms = (f.classe_ids || [])
        .map(cid => state._classes.find(c => String(c.id) === String(cid))?.nom_classe)
        .filter(Boolean);
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(f.nom)}
          ${scopeNoms.length ? `<div style="font-size:11px; font-weight:500; color:var(--blue-fifa); margin-top:2px;">🎯 ${scopeNoms.map(window.esc).join(', ')}</div>` : ''}
        </td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; color:var(--green-fifa);">
          ${formatMontant(f.montant_par_tranche)}
        </td>
        <td style="text-align:center;">${f.nombre_tranches}</td>
        <td>${window.esc(periodLabel)}</td>
        <td>${formatDate(f.date_premiere_echeance)}</td>
        <td><span class="statut-badge ${f.actif ? 'badge-paye' : 'badge-retard'}">${f.actif ? window.t('common.active') : window.t('common.inactive')}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-sm btn-secondary btn-edit-frais" data-id="${f.id}" title="${window.t('common.edit')}" style="padding:4px 8px; display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn btn-sm btn-danger btn-del-frais" data-id="${f.id}" title="${window.t('common.delete')}" style="padding:4px 8px; display:flex; align-items:center; justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-frais').addEventListener('click', () => _ouvrirFormFrais(parseInt(f.id)));
      tr.querySelector('.btn-del-frais').addEventListener('click', () => _supprimerFrais(parseInt(f.id)));

      tbody.appendChild(tr);
    });

    fragment.appendChild(table);

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });

  } catch (e) {
    console.error('Erreur _chargerFraisTypes:', e);
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:20px;">${window.t('finance.error_load')}</p>`;
  }
}

function _ouvrirFormFrais(id = null) {
  state._fraisEditId = id;
  const card   = document.getElementById('fin-frais-form-card');
  const titre  = document.getElementById('fin-frais-form-titre');
  if (!card) return;

  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Cases à cocher de portée (persistée sur le type de frais).
  // Vide = toutes les classes.
  const scopeIds = id
    ? (state._fraisTypes.find(x => x.id === id)?.classe_ids || []).map(String)
    : [];
  const scopeBox = document.getElementById('ff-classes-scope');
  if (scopeBox) {
    scopeBox.innerHTML = state._classes.map(c => `
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer;
             font-size:12.5px; padding:5px 10px; border:1px solid var(--border-color);
             border-radius:6px; white-space:nowrap;">
        <input type="checkbox" class="ff-scope-chk" value="${c.id}"
               style="accent-color:var(--green-fifa); width:14px; height:14px;"
               ${scopeIds.includes(String(c.id)) ? 'checked' : ''}>
        <span>${window.esc(c.nom_classe)}</span>
      </label>`).join('') || `<span style="font-size:12px; color:var(--text-muted);">${window.t('finance.no_class_available')}</span>`;
  }

  if (id) {
    const f = state._fraisTypes.find(x => x.id === id);
    if (!f) return;
    titre.textContent = `${window.t('common.edit')} : ${f.nom}`;
    _setVal('ff-nom',           f.nom);
    _setVal('ff-montant',       f.montant_par_tranche);
    _setVal('ff-nb-tranches',   f.nombre_tranches);
    _setVal('ff-periodicite',   f.periodicite_mois);
    _setVal('ff-date-debut',    f.date_premiere_echeance);
    _setVal('ff-destinataire',  f.destinataire);
    const chk = document.getElementById('ff-actif');
    if (chk) chk.checked = !!f.actif;
  } else {
    titre.textContent = window.t('finance.fee_form_title');
    ['ff-nom','ff-montant'].forEach(id => _setVal(id, ''));
    _setVal('ff-nb-tranches', '3');
    _setVal('ff-periodicite', '3');
    _setVal('ff-destinataire', 'etablissement');
    const chk = document.getElementById('ff-actif');
    if (chk) chk.checked = true;
    _setVal('ff-date-debut', new Date().toISOString().split('T')[0]);
  }

  _majApercuTranches();
  _masquerErreurFrais();
}

function _fermerFormFrais() {
  // Libère le focus AVANT de masquer : évite qu'un popup natif orphelin
  // (calendrier, liste déroulante) coince le focus clavier de la page.
  try {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  } catch (_) { /* ignore */ }
  const card = document.getElementById('fin-frais-form-card');
  if (card) card.style.display = 'none';
  state._fraisEditId = null;
  _masquerErreurFrais();
}

function _majApercuTranches() {
  const preview = document.getElementById('ff-tranches-preview');
  if (!preview) return;
  const nb      = parseInt(document.getElementById('ff-nb-tranches')?.value) || 1;
  const montant = parseFloat(document.getElementById('ff-montant')?.value)   || 0;
  const periodicite = parseInt(document.getElementById('ff-periodicite')?.value) || 3;
  const debut   = document.getElementById('ff-date-debut')?.value;

  if (!debut || !montant) { preview.innerHTML = ''; return; }

  const fragment = document.createDocumentFragment();
  let date = new Date(debut);
  for (let i = 1; i <= Math.min(nb, 12); i++) {
    const chip = document.createElement('div');
    chip.style.cssText = `background:var(--bg-secondary); border:1px solid var(--border-color); border-radius:8px; padding:8px 12px; font-size:11px;`;

    chip.innerHTML = `
      <div style="color:var(--text-muted); margin-bottom:2px; font-weight:600;">${window.t('finance.th_tranche')} ${i}</div>
      <div style="color:var(--green-fifa); font-family:'Rajdhani',sans-serif; font-size:14px;">
        ${formatMontant(montant)}
      </div>
      <div style="color:var(--text-muted); margin-top:2px;">${formatDate(date.toISOString().split('T')[0])}</div>
    `;
    fragment.appendChild(chip);
    date.setMonth(date.getMonth() + periodicite);
  }

  requestAnimationFrame(() => {
    preview.innerHTML = '';
    preview.appendChild(fragment);
  });
}

async function _supprimerFrais(id) {
  const f = state._fraisTypes.find(x => x.id === id);
  if (!(await finConfirm(window.t('finance.fee_delete_confirm').replace('{name}', f?.nom)))) return;

  try {
    const res = await window.elimuAPI.financeDeleteFraisType(id);
    if (res?.success) {
      showToast(window.t('finance.fee_delete_success'), 'success');
      await _chargerFraisTypes();
      await _chargerKpis();
    } else {
      showToast('❌ ' + (res?.error || window.t('common.error')), 'error');
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

export { _chargerFraisTypes, _ouvrirFormFrais, _fermerFormFrais, _majApercuTranches, _supprimerFrais };
