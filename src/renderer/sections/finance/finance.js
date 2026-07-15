/**
 * finance.js — Section Finance d'Elimu
 * Version avec pagination, montant automatique et graphique linéaire amélioré
 */

'use strict';

// ── Formatage ─────────────────────────────────────────────
function formatMontant(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString('fr-FR').replace(/\s/g, ' ') + ' FCFA';
}

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString('fr-FR'); } catch { return str; }
}

function statutBadge(statut) {
  const map = {
    paye:       { cls: 'badge-paye',    label: window.t('finance.status_paid') },
    en_attente: { cls: 'badge-attente', label: window.t('finance.status_pending') },
    en_retard:  { cls: 'badge-retard',  label: window.t('finance.status_late') }
  };
  const s = map[statut] || { cls: 'badge-attente', label: statut };
  return `<span class="statut-badge ${s.cls}">${s.label}</span>`;
}

function modeLabel(mode) {
  const m = { especes:window.t('finance.mode_cash'), cheque:window.t('finance.mode_cheque'), virement:window.t('finance.mode_transfer'), mobile_money:window.t('finance.mode_mobile'), autre:window.t('finance.mode_other') };
  return m[mode] || mode || '—';
}

// ── État local ────────────────────────────────────────────
let _classes        = [];
let _fraisTypes     = [];
let _fraisEditId    = null;
let _chartMois      = null;
let _tranchePage    = 1;
let _trancheTotal   = 0;
let _trancheLimit   = 30;
let _trancheFilters = { classeId: null, statut: null, search: null };
let _searchTimeout  = null;
let _state          = null;

// Variables de pagination des impayés
let _impayesPage    = 1;
let _impayesHasMore = true;
let _impayesLoading = false;

// ── Loader Global ─────────────────────────────────────────
function showFinLoader(text = 'Traitement en cours...', progress = null, countText = '') {
  const loader = document.getElementById('fin-global-loader');
  const txt = document.getElementById('fin-loader-text');
  const bar = document.getElementById('fin-loader-bar');
  const pct = document.getElementById('fin-loader-percent');
  const cnt = document.getElementById('fin-loader-count');

  if (loader) {
    loader.style.display = 'flex';
    if (txt) txt.textContent = text;
    if (bar && progress !== null) {
      bar.style.width = `${progress}%`;
    }
    if (pct) pct.textContent = progress !== null ? `${Math.round(progress)}%` : '';
    if (cnt) cnt.textContent = countText || '';
  }
}

function hideFinLoader() {
  const loader = document.getElementById('fin-global-loader');
  if (loader) loader.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// POINT D'ENTRÉE
// ═══════════════════════════════════════════════════════════

export async function init(state) {
  _state = state;
  _classes = state?.classes || [];
  _fraisTypes = [];

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

// ═══════════════════════════════════════════════════════════
// ONGLETS INTERNES
// ═══════════════════════════════════════════════════════════

function _setupTabs() {
  document.querySelectorAll('.fin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.fin-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(`fin-tab-${btn.dataset.finTab}`);
      if (pane) pane.classList.add('active');
      if (btn.dataset.finTab === 'tranches') {
        _tranchePage = 1;
        _chargerTranches();
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════

async function _chargerKpis() {
  try {
    const stats = await window.elimuAPI.financeGetStats();
    if (!stats) return;

    _setKpi('fin-kpi-du',       formatMontant(stats.total_du));
    _setKpi('fin-kpi-encaisse', formatMontant(stats.total_encaisse));
    _setKpi('fin-kpi-impayes',  formatMontant(stats.total_impayes));

    const taux = stats.total_du > 0
      ? (stats.total_encaisse / stats.total_du) * 100
      : 0;
    _setKpi('fin-kpi-taux', `${taux.toFixed(2)}%`);

    const fill = document.getElementById('fin-recouvrement-fill');
    if (fill) {
      setTimeout(() => {
        fill.style.width = `${Math.min(taux, 100)}%`;
        fill.style.background = taux >= 80 ? 'var(--green-fifa)'
                               : taux >= 50 ? 'var(--yellow-fifa)'
                               : 'var(--red-fifa)';
      }, 200);
    }
  } catch (e) {
    console.error('Erreur KPIs finance:', e);
  }
}

function _setKpi(id, valeur) {
  const el = document.getElementById(id);
  if (el) { el.textContent = valeur; el.classList.add('kpi-animate'); }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

async function _chargerDashboard() {
  try {
    await Promise.all([
      _chargerGraphiqueMois(),
      _chargerTopImpayes(),
      _chargerDerniersPaiements()
    ]);
  } catch (err) {
    console.error('Erreur dashboard finance:', err);
  }
}

// Graphique linéaire amélioré (courbe)
async function _chargerGraphiqueMois() {
  try {
    const data = await window.elimuAPI.financeGetEncaissementsParMois();
    if (!Array.isArray(data)) return;

    const ctx = document.getElementById('fin-chart-mois');
    if (!ctx) return;

    if (_chartMois) _chartMois.destroy();

    const labels  = data.map(d => d.mois);
    const valeurs = data.map(d => d.total);

    if (window.Chart) {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const tickColor = isLight ? '#526070' : '#6b7a99';
      const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';

      _chartMois = new window.Chart(ctx, {
        type: 'line',   // ← passage en courbe
        data: {
          labels,
          datasets: [{
            label: window.t('finance.chart_monthly'),
            data: valeurs,
            borderColor: 'rgba(0,230,118,0.9)',
            backgroundColor: 'rgba(0,230,118,0.05)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: 'rgba(0,230,118,1)',
            pointBorderColor: isLight ? '#ffffff' : '#1c2333',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            tension: 0.3,          // courbe légèrement arrondie
            fill: true,            // remplissage sous la courbe
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`
              }
            },
            legend: {
              display: false       // légende masquée (plus épuré)
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => `${v.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`,
                color: tickColor,
                stepSize: 50000   // à adapter selon tes données
              },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: tickColor },
              grid: { display: false }
            }
          }
        }
      });
    }
  } catch (e) {
    console.error('Graphique mois:', e);
  }
}

/**
 * Charge les 5 plus gros impayés avec rendu optimisé (DocumentFragment + 60FPS)
 */
async function _chargerTopImpayes() {
  const container = document.getElementById('fin-top-impayes');
  if (!container) return;
  
  try {
    const top = await window.elimuAPI.financeGetTopImpayes(5);
    
    if (!Array.isArray(top) || !top.length) {
      container.innerHTML = `<p style="text-align:center;color:var(--green-fifa);padding:16px;font-size:13px;">${window.t('finance.no_unpaid')}</p>`;
      return;
    }
    
    const nbRetard = document.getElementById('fin-nb-retard');
    if (nbRetard) nbRetard.textContent = top.length;

    const fragment = document.createDocumentFragment();

    top.forEach((t, i) => {
      const item = document.createElement('div');
      item.style.cssText = `display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-color);`;
      
      item.innerHTML = `
        <div style="width:28px; height:28px; border-radius:50%; background:rgba(255,71,87,0.12);
                    border:1px solid rgba(255,71,87,0.3); display:flex; align-items:center;
                    justify-content:center; font-size:11px; font-weight:700; color:var(--red-fifa);
                    flex-shrink:0;">${i + 1}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:13px; color:var(--text-primary);">
            ${window.esc(t.nom)} ${window.esc(t.prenom)}
          </div>
          <div style="font-size:11px; color:var(--text-muted);">${window.esc(t.nom_classe || '—')}</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div style="font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:var(--red-fifa);">
            ${formatMontant(t.total_impaye)}
          </div>
          <div style="font-size:10px; color:var(--text-muted);">${t.nb_tranches} tranche(s)</div>
        </div>
      `;
      fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });

  } catch (e) {
    console.error('Erreur _chargerTopImpayes:', e);
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px;">${window.t('finance.error_load')}</p>`;
  }
}

/**
 * Charge les derniers paiements avec rendu optimisé (DocumentFragment + 60FPS)
 */
async function _chargerDerniersPaiements() {
  const tbody = document.getElementById('fin-tbody-recents');
  if (!tbody) return;
  
  try {
    const paiements = await window.elimuAPI.financeGetPaiements({ limit: 10 });
    
    if (!Array.isArray(paiements) || !paiements.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">${window.t('finance.no_payments')}</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    paiements.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-family:'Rajdhani',sans-serif; font-size:13px; color:var(--blue-fifa);">
          ${window.esc(p.recu_numero || `P-${p.id}`)}
        </span></td>
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(p.prenom)} ${window.esc(p.nom)}</td>
        <td style="color:var(--text-muted);">${window.esc(p.nom_classe || '—')}</td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; color:var(--green-fifa); font-weight:700;">
          ${formatMontant(p.montant)}
        </td>
        <td>${window.esc(modeLabel(p.mode))}</td>
        <td>${formatDate(p.date)}</td>
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
    console.error('Erreur _chargerDerniersPaiements:', e);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">${window.t('common.error')}</td></tr>`;
  }
}

// ═══════════════════════════════════════════════════════════
// TYPES DE FRAIS
// ═══════════════════════════════════════════════════════════

async function _chargerFraisTypes() {
  const container = document.getElementById('fin-frais-types-list');
  if (!container) return;
  
  try {
    const rows = await window.elimuAPI.financeGetFraisTypes();
    _fraisTypes = Array.isArray(rows) ? rows : [];
    _remplirSelectsClasse(); // Mettre à jour les filtres dépendant des frais

    if (!_fraisTypes.length) {
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

    _fraisTypes.forEach(f => {
      const tr = document.createElement('tr');
      const periodLabel = f.periodicite_mois === 1 ? window.t('finance.period_monthly') 
                        : f.periodicite_mois === 3 ? window.t('finance.period_quarterly') 
                        : f.periodicite_mois === 6 ? window.t('finance.period_biannual') 
                        : window.t('finance.period_annual');
      
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(f.nom)}</td>
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
  _fraisEditId = id;
  const card   = document.getElementById('fin-frais-form-card');
  const titre  = document.getElementById('fin-frais-form-titre');
  if (!card) return;

  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (id) {
    const f = _fraisTypes.find(x => x.id === id);
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

  const selClasse = document.getElementById('ff-cible-classe');
  if (selClasse) {
    selClasse.innerHTML = `<option value="">— ${window.t('finance.all_classes_short_dash')} —</option>` +
      _classes.map(c => `<option value="${c.id}">${window.esc(c.nom_classe)}</option>`).join('');
  }
}

function _fermerFormFrais() {
  const card = document.getElementById('fin-frais-form-card');
  if (card) card.style.display = 'none';
  _fraisEditId = null;
  _masquerErreurFrais();
}

/**
 * Mise à jour de l'aperçu des tranches avec rendu optimisé
 */
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
  const f = _fraisTypes.find(x => x.id === id);
  if (!confirm(window.t('finance.fee_delete_confirm').replace('{name}', f?.nom))) return;
  
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

function _afficherErreurFrais(msg) {
  const el = document.getElementById('ff-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function _masquerErreurFrais() {
  const el = document.getElementById('ff-error');
  if (el) el.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// TRANCHES & PAIEMENTS (avec pagination et rendu optimisé)
// ═══════════════════════════════════════════════════════════

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
    
    _trancheFilters = { classeId, statut, search, numero_tranche, frais_type_id };
    
    const result = await window.elimuAPI.financeGetTranches({
      classeId, statut, search, numero_tranche, frais_type_id,
      page: _tranchePage, limit: _trancheLimit
    });
    
    if (result?.error) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--red-fifa);">⚠️ ${window.t('finance.error_load')} : ${window.esc(result.error)}</td></tr>`;
      return;
    }

    const tranches = result?.tranches || [];
    _trancheTotal = result?.total || 0;
    
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
      
      // Pagination
      if (paginationDiv && _trancheTotal > _trancheLimit) {
        const totalPages = Math.ceil(_trancheTotal / _trancheLimit);
        const pagFrag = document.createDocumentFragment();
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `display:flex; gap:8px; justify-content:center;`;
        
        if (_tranchePage > 1) {
          const btnPrev = document.createElement('button');
          btnPrev.className = 'btn btn-sm btn-secondary';
          btnPrev.textContent = '◀';
          btnPrev.onclick = () => { _tranchePage--; _chargerTranches(); };
          wrapper.appendChild(btnPrev);
        }
        
        const span = document.createElement('span');
        span.style.cssText = `padding:4px 12px; background:var(--bg-secondary); border-radius:6px; font-size:12px;`;
        span.textContent = `Page ${_tranchePage} / ${totalPages}`;
        wrapper.appendChild(span);
        
        if (_tranchePage < totalPages) {
          const btnNext = document.createElement('button');
          btnNext.className = 'btn btn-sm btn-secondary';
          btnNext.textContent = '▶';
          btnNext.onclick = () => { _tranchePage++; _chargerTranches(); };
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

// ═══════════════════════════════════════════════════════════
// IMPAYÉS
// ═══════════════════════════════════════════════════════════

async function _chargerImpayes(reset = true) {
  if (_impayesLoading) return;

  const tbody       = document.getElementById('fin-tbody-impayes');
  const btnPlus     = document.getElementById('fin-load-more-impayes');
  if (!tbody) return;

  // Réinitialisation si demandée
  if (reset) {
    _impayesPage    = 1;
    _impayesHasMore = true;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;"><div class="spinner" style="margin:0 auto;"></div></td></tr>';
    if (btnPlus) btnPlus.style.display = 'none';
  }

  _impayesLoading = true;

  try {
    const classeId     = document.getElementById('fin-impayes-filter-classe')?.value || null;
    const fraisTypeId  = document.getElementById('fin-impayes-filter-frais')?.value || null;
    const numeroTranche = document.getElementById('fin-impayes-filter-numero')?.value || null;

    const result = await window.elimuAPI.financeGetImpayes({
      classeId, fraisTypeId, numeroTranche, page: _impayesPage, limit: 50
    });

    const impayes = Array.isArray(result?.impayes) ? result.impayes : [];
    const total   = result?.total || 0;
    const loaded  = (_impayesPage - 1) * 50 + impayes.length;
    _impayesHasMore = loaded < total;

    if (_impayesPage === 1 && !impayes.length) {
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
      if (_impayesPage === 1) tbody.innerHTML = '';
      tbody.appendChild(frag);
      if (btnPlus) btnPlus.style.display = _impayesHasMore ? 'inline-flex' : 'none';
    });

  } catch (e) {
    console.error('_chargerImpayes:', e);
    if (_impayesPage === 1) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">${window.t('finance.error_load')}</td></tr>`;
    }
    showToast('❌ ' + window.t('finance.error_load'), 'error');
  } finally {
    _impayesLoading = false;
  }
}

async function _chargerPlusImpayes() {
  if (!_impayesHasMore || _impayesLoading) return;
  _impayesPage++;
  await _chargerImpayes(false);
}

// ═══════════════════════════════════════════════════════════
// HISTORIQUE DES PAIEMENTS (rendu optimisé 60FPS)
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// MODALE PAIEMENT (avec chargement séquentiel optimisé)
// ═══════════════════════════════════════════════════════════

async function _ouvrirModalePaiement(eleveId = null, trancheId = null) {
  const modal = document.getElementById('modal-paiement');
  if (!modal) return;
  modal.style.display = 'flex';

  // Réinitialiser
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
          // Charger les élèves de la classe
          const eleves = await window.elimuAPI.getEleves(parseInt(eleveInfo.classe_id));
          const selEleve = document.getElementById('pay-eleve');
          if (selEleve) {
            selEleve.innerHTML = `<option value="">— ${window.t('finance.pay_select_student')} —</option>` +
              (Array.isArray(eleves) ? eleves : []).map(e =>
                `<option value="${e.id}">${window.esc(e.prenom)} ${window.esc(e.nom)}</option>`
              ).join('');
            selEleve.value = eleveId;
            
            // Charger les tranches
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

/**
 * Charge les tranches d'un élève spécifique avec rendu optimisé (DocumentFragment)
 */
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

function _afficherErreurPaiement(msg) {
  const el = document.getElementById('pay-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function _masquerErreurPaiement() {
  const el = document.getElementById('pay-error');
  if (el) el.style.display = 'none';
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
      utilisateur_id: _state?.user?.id
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

// ═══════════════════════════════════════════════════════════
// REÇU PDF
// ═══════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════

function _remplirSelectsClasse() {
  const ids = [
    'fin-filter-classe', 'fin-impayes-filter-classe',
    'fin-hist-classe', 'pay-classe', 'ff-cible-classe'
  ];
  
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    const options = _classes.map(c => `<option value="${c.id}">${window.esc(c.nom_classe)}</option>`).join('');
    el.innerHTML = (id === 'pay-classe'
      ? `<option value="">— ${window.t('finance.all_classes_short_dash')} —</option>`
      : `<option value="">${window.t('common.all_classes')}</option>`) + options;
    if (current && _classes.some(c => c.id == current)) el.value = current;
  });

  // Remplir le filtre des types de frais
  const filterFrais = document.getElementById('fin-filter-frais-type');
  if (filterFrais) {
    filterFrais.innerHTML = `<option value="">${window.t('common.all')}</option>` +
      _fraisTypes.map(f => `<option value="${f.id}">${window.esc(f.nom)}</option>`).join('');
  }

  // Remplir le filtre des types de frais dans l'onglet Impayés
  const filterImpayesFrais = document.getElementById('fin-impayes-filter-frais');
  if (filterImpayesFrais) {
    const current = filterImpayesFrais.value;
    filterImpayesFrais.innerHTML = `<option value="">Tous les frais</option>` +
      _fraisTypes.map(f => `<option value="${f.id}">${window.esc(f.nom)}</option>`).join('');
    if (current && _fraisTypes.some(f => f.id == current)) filterImpayesFrais.value = current;
  }
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

// ═══════════════════════════════════════════════════════════
// ÉVÉNEMENTS PRINCIPAUX
// ═══════════════════════════════════════════════════════════

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
      const result = _fraisEditId
        ? await window.elimuAPI.financeUpdateFraisType(_fraisEditId, data)
        : await window.elimuAPI.financeAddFraisType(data);

      btn.disabled = false;
      btn.textContent = window.t('common.save');

      if (result?.success) {
        showToast(window.t('finance.fee_save_success'), 'success');
        window.elimuAPI.logAudit(_fraisEditId ? 'UPDATE_FINANCE_TYPE' : 'ADD_FINANCE_TYPE', `Type de frais ${nom} ${_fraisEditId ? 'modifié' : 'ajouté'}`, _state?.user?.id);
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
    if (!_fraisEditId) { showToast(window.t('finance.fee_save_success'), 'warning'); return; }
    const cible    = document.getElementById('ff-cible')?.value || 'all';
    const classeId = document.getElementById('ff-cible-classe')?.value || null;

    showFinLoader(`Génération des tranches pour ${cible === 'all' ? 'tous les élèves' : 'la classe sélectionnés'}...`);
    try {
      const result = await window.elimuAPI.financeGenererTranches({
        frais_type_id: _fraisEditId,
        cible, id_cible: classeId ? parseInt(classeId) : null
      });
      hideFinLoader();

      if (result?.success) {
        showToast(window.t('finance.tranche_generate_success').replace('{count}', result.nbGeneres), 'success');
        window.elimuAPI.logAudit('GENERATE_TRANCHES', `Génération de ${result.nbGeneres} tranches pour type ID ${_fraisEditId}`, _state?.user?.id);
        await _chargerKpis();
      } else {
        showToast('❌ ' + (result?.error || window.t('common.error')), 'error');
      }
    } catch (err) {
      hideFinLoader();
      showToast('❌ ' + err.message, 'error');
    }
  });

  // Nouveau : Génération Globale (tous les frais actifs pour tous les élèves)
  document.getElementById('btn-generer-tout-auto')?.addEventListener('click', async () => {
    if (!confirm("Voulez-vous générer TOUTES les tranches manquantes pour TOUS les types de frais actifs et TOUS les élèves ? Cette opération peut prendre quelques secondes.")) return;
    
    showFinLoader("Génération globale en cours...");
    
    try {
      let totalGeneres = 0;
      const typesActifs = _fraisTypes.filter(f => f.actif);
      
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

  // Recherche dynamique avec Debounce
  document.getElementById('fin-search-eleve')?.addEventListener('input', () => {
    if (_searchTimeout) clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => {
      _tranchePage = 1;
      _chargerTranches();
    }, 400); // 400ms de délai
  });

  // Rechargement immédiat sur changement de filtres
  ['fin-filter-classe', 'fin-filter-statut', 'fin-filter-frais-type'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      _tranchePage = 1;
      _chargerTranches();
    });
  });

  document.getElementById('btn-fin-filter')?.addEventListener('click', async () => {
    _tranchePage = 1;
    await _chargerTranches();
  });

  // Filtre par numéro de tranche → réinitialise la page et recharge
  document.getElementById('fin-filter-numero-tranche')?.addEventListener('change', async () => {
    _tranchePage = 1;
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

  // Export impayés de la classe actuellement filtrée (depuis l'onglet Impayés)
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
  
  // Bouton "Charger plus d'impayés"
  document.getElementById('fin-load-more-impayes')?.addEventListener('click', _chargerPlusImpayes);

  document.getElementById('btn-voir-tous-paiements')?.addEventListener('click', () => {
    document.querySelector('.fin-tab-btn[data-fin-tab="historique"]')?.click();
  });

  document.getElementById('btn-fin-hist-filter')?.addEventListener('click', _chargerHistorique);
  
  // NOUVEAU : Événements filtre Impayés
  document.getElementById('btn-fin-impayes-filter-apply')?.addEventListener('click', () => _chargerImpayes(true));
  ['fin-impayes-filter-classe', 'fin-impayes-filter-frais', 'fin-impayes-filter-numero'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => _chargerImpayes(true));
  });
}
