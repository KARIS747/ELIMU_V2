import { state } from './state.js';
import { formatMontant, formatDate, statutBadge, modeLabel } from './helpers.js';
import { _ouvrirModalePaiement, _imprimerRecu } from './paiement.js';

async function _chargerTranches() {
  const tbody = document.getElementById('fin-tbody-tranches');
  const paginationDiv = document.getElementById('fin-tranches-pagination');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;"><div class="spinner" style="margin:0 auto;"></div><div style="margin-top:10px; color:var(--text-muted); font-size:12px;">Recherche en cours...</div></td></tr>';
  if (paginationDiv) paginationDiv.innerHTML = '';

  try {
    const classeId      = document.getElementById('fin-filter-classe')?.value || null;
    const statut        = document.getElementById('fin-filter-statut')?.value  || null;
    const search        = document.getElementById('fin-search-eleve')?.value?.trim() || null;
    const numero_tranche = document.getElementById('fin-filter-numero-tranche')?.value || null;
    const frais_type_id = document.getElementById('fin-filter-frais-type')?.value || null;

    state._trancheFilters = { classeId, statut, search, numero_tranche, frais_type_id };

    const result = await window.elimuAPI.financeGetTranches({
      classeId, statut, search, numero_tranche, frais_type_id,
      page: state._tranchePage, limit: state._trancheLimit
    });

    if (result?.error) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red-fifa);">⚠️ ${window.t('finance.error_load')} : ${window.esc(result.error)}</td></tr>`;
      return;
    }

    const tranches = result?.tranches || [];
    state._trancheTotal = result?.total || 0;

    if (!tranches.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">${window.t('finance.no_tranches')}</td></tr>`;
      if (paginationDiv) paginationDiv.innerHTML = '';
      return;
    }

    const fragment = document.createDocumentFragment();

    tranches.forEach(t => {
      const tr = document.createElement('tr');
      const color = t.statut === 'paye' ? 'var(--green-fifa)' : t.statut === 'en_retard' ? 'var(--red-fifa)' : 'var(--yellow-fifa)';

      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(t.prenom)} ${window.esc(t.nom)}</td>
        <td style="color:var(--text-muted);">${window.esc(t.nom_classe || '—')}</td>
        <td>${window.esc(t.nom_frais)}</td>
        <td style="text-align:center;">T${t.numero_tranche}</td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; font-weight:700; color:${color};">
          ${formatMontant(t.montant)}
        </td>
        <td>${formatDate(t.date_echeance)}</td>
        <td>${statutBadge(t.statut)}</td>
        <td>
          ${t.statut !== 'paye' ? `
          <button class="btn btn-sm btn-primary btn-payer-tranche"
                  data-eleve-id="${t.eleve_id}"
                  data-tranche-id="${t.id}"
                  title="${window.t('finance.btn_new_payment')}">
            💳 ${window.t('finance.status_paid')}
          </button>` : ''}
        </td>
      `;

      const btnPayer = tr.querySelector('.btn-payer-tranche');
      if (btnPayer) {
        btnPayer.addEventListener('click', () => {
          _ouvrirModalePaiement(parseInt(t.eleve_id), parseInt(t.id));
        });
      }
      fragment.appendChild(tr);
    });

    requestAnimationFrame(() => {
      tbody.innerHTML = '';
      tbody.appendChild(fragment);

      if (paginationDiv && state._trancheTotal > state._trancheLimit) {
        const totalPages = Math.ceil(state._trancheTotal / state._trancheLimit);
        const pagFrag = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `display:flex; gap:8px; justify-content:center;`;

        if (state._tranchePage > 1) {
          const btnPrev = document.createElement('button');
          btnPrev.className = 'btn btn-sm btn-secondary';
          btnPrev.textContent = '◀';
          btnPrev.onclick = () => { state._tranchePage--; _chargerTranches(); };
          wrapper.appendChild(btnPrev);
        }

        const span = document.createElement('span');
        span.style.cssText = `padding:4px 12px; background:var(--bg-secondary); border-radius:6px; font-size:12px;`;
        span.textContent = `Page ${state._tranchePage} / ${totalPages}`;
        wrapper.appendChild(span);

        if (state._tranchePage < totalPages) {
          const btnNext = document.createElement('button');
          btnNext.className = 'btn btn-sm btn-secondary';
          btnNext.textContent = '▶';
          btnNext.onclick = () => { state._tranchePage++; _chargerTranches(); };
          wrapper.appendChild(btnNext);
        }

        pagFrag.appendChild(wrapper);
        paginationDiv.innerHTML = '';
        paginationDiv.appendChild(pagFrag);
      } else if (paginationDiv) {
        paginationDiv.innerHTML = '';
      }
    });

  } catch (e) {
    console.error('Erreur _chargerTranches:', e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red-fifa);">⚠️ ${window.t('finance.error_load')} : ${window.esc(e.message)}</td></tr>`;
  }
}

async function _chargerImpayes(reset = true) {
  if (state._impayesLoading) return;

  const tbody       = document.getElementById('fin-tbody-impayes');
  const btnPlus     = document.getElementById('fin-load-more-impayes');
  if (!tbody) return;

  if (reset) {
    state._impayesPage    = 1;
    state._impayesHasMore = true;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';
    if (btnPlus) btnPlus.style.display = 'none';
  }

  state._impayesLoading = true;

  try {
    const classeId     = document.getElementById('fin-impayes-filter-classe')?.value || null;
    const fraisTypeId  = document.getElementById('fin-impayes-filter-frais')?.value || null;
    const numeroTranche = document.getElementById('fin-impayes-filter-numero')?.value || null;

    const result = await window.elimuAPI.financeGetImpayes({
      classeId, fraisTypeId, numeroTranche, page: state._impayesPage, limit: 50
    });

    const impayes = Array.isArray(result?.impayes) ? result.impayes : [];
    const total   = result?.total || 0;
    const loaded  = (state._impayesPage - 1) * 50 + impayes.length;
    state._impayesHasMore = loaded < total;

    if (state._impayesPage === 1 && !impayes.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--green-fifa);">${window.t('finance.no_unpaid')}</td></tr>`;
      if (btnPlus) btnPlus.style.display = 'none';
      return;
    }

    const frag = document.createDocumentFragment();

    impayes.forEach(i => {
      const tr = document.createElement('tr');
      const dateColor = new Date(i.date_echeance) < new Date() ? 'var(--red-fifa)' : 'var(--text-muted)';

      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(i.prenom)} ${window.esc(i.nom)}</td>
        <td>${window.esc(i.nom_classe || '—')}</td>
        <td style="color:var(--text-muted);">${window.esc(i.nom_parent || '—')}</td>
        <td>
          ${i.telephone_parent
            ? `<a href="https://wa.me/${i.telephone_parent.replace(/\D/g,'')}?text=Bonjour%2C%20nous%20vous%20contactons%20concernant%20les%20frais%20scolaires%20de%20${encodeURIComponent(i.prenom + ' ' + i.nom)}"
                  target="_blank" style="color:var(--green-fifa); text-decoration:none;">
                📱 ${window.esc(i.telephone_parent)}
              </a>`
            : '—'}
        </td>
        <td>${window.esc(i.nom_frais)}</td>
        <td style="text-align:center;">T${i.numero_tranche}</td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; color:var(--red-fifa); font-weight:700;">
          ${formatMontant(i.montant)}
        </td>
        <td style="color:${dateColor};">
          ${formatDate(i.date_echeance)}
        </td>
        <td>
          <button class="btn btn-sm btn-primary btn-payer-impaye" data-eleve-id="${i.eleve_id}" data-tranche-id="${i.id}">
            💳 ${window.t('finance.status_paid')}
          </button>
        </td>
      `;

      tr.querySelector('.btn-payer-impaye').addEventListener('click', () =>
        _ouvrirModalePaiement(parseInt(i.eleve_id), parseInt(i.id))
      );
      frag.appendChild(tr);
    });

    requestAnimationFrame(() => {
      if (state._impayesPage === 1) tbody.innerHTML = '';
      tbody.appendChild(frag);
      if (btnPlus) btnPlus.style.display = state._impayesHasMore ? 'inline-flex' : 'none';
    });

  } catch (e) {
    console.error('_chargerImpayes:', e);
    if (state._impayesPage === 1) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">${window.t('finance.error_load')}</td></tr>`;
    }
    showToast('❌ ' + window.t('finance.error_load'), 'error');
  } finally {
    state._impayesLoading = false;
  }
}

async function _chargerPlusImpayes() {
  if (!state._impayesHasMore || state._impayesLoading) return;
  state._impayesPage++;
  await _chargerImpayes(false);
}

async function _chargerHistorique() {
  const tbody = document.getElementById('fin-tbody-historique');
  if (!tbody) return;

  try {
    const jours   = parseInt(document.getElementById('fin-hist-periode')?.value) || 30;
    const classeId = document.getElementById('fin-hist-classe')?.value || null;
    const paiements = await window.elimuAPI.financeGetPaiements({ jours, classeId, limit: 100 });

    if (!Array.isArray(paiements) || !paiements.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">${window.t('finance.no_payments')}</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    paiements.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family:'Rajdhani',sans-serif; color:var(--blue-fifa);">
          ${window.esc(p.recu_numero || `P-${p.id}`)}
        </td>
        <td>${formatDate(p.date)}</td>
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(p.prenom)} ${window.esc(p.nom)}</td>
        <td style="color:var(--text-muted);">${window.esc(p.nom_classe || '—')}</td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; color:var(--green-fifa); font-weight:700;">
          ${formatMontant(p.montant)}
        </td>
        <td>${window.esc(modeLabel(p.mode))}</td>
        <td style="color:var(--text-muted);">${window.esc(p.nom_caissier || '—')}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-print-recu" data-id="${p.id}" title="${window.t('finance.receipt_pdf_success')}">🖨️</button>
        </td>
      `;
      tr.querySelector('.btn-print-recu').addEventListener('click', () => _imprimerRecu(parseInt(p.id)));
      fragment.appendChild(tr);
    });

    requestAnimationFrame(() => {
      tbody.innerHTML = '';
      tbody.appendChild(fragment);
    });

  } catch (e) {
    console.error('Erreur _chargerHistorique:', e);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">${window.t('common.error')}</td></tr>`;
  }
}

export { _chargerTranches, _chargerImpayes, _chargerPlusImpayes, _chargerHistorique };
