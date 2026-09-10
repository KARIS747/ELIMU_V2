import { state } from './state.js';

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

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function _setKpi(id, valeur) {
  const el = document.getElementById(id);
  if (el) { el.textContent = valeur; el.classList.add('kpi-animate'); }
}

function _afficherErreurFrais(msg) {
  const el = document.getElementById('ff-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function _masquerErreurFrais() {
  const el = document.getElementById('ff-error');
  if (el) el.style.display = 'none';
}

function _afficherErreurPaiement(msg) {
  const el = document.getElementById('pay-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function _masquerErreurPaiement() {
  const el = document.getElementById('pay-error');
  if (el) el.style.display = 'none';
}

function _remplirSelectsClasse() {
  const ids = [
    'fin-filter-classe', 'fin-impayes-filter-classe',
    'fin-hist-classe', 'pay-classe'
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    const options = state._classes.map(c => `<option value="${c.id}">${window.esc(c.nom_classe)}</option>`).join('');
    el.innerHTML = (id === 'pay-classe'
      ? `<option value="">— ${window.t('finance.all_classes_short_dash')} —</option>`
      : `<option value="">${window.t('common.all_classes')}</option>`) + options;
    if (current && state._classes.some(c => c.id == current)) el.value = current;
  });

  const filterFrais = document.getElementById('fin-filter-frais-type');
  if (filterFrais) {
    filterFrais.innerHTML = `<option value="">${window.t('common.all')}</option>` +
      state._fraisTypes.map(f => `<option value="${f.id}">${window.esc(f.nom)}</option>`).join('');
  }

  const filterImpayesFrais = document.getElementById('fin-impayes-filter-frais');
  if (filterImpayesFrais) {
    const current = filterImpayesFrais.value;
    filterImpayesFrais.innerHTML = `<option value="">Tous les frais</option>` +
      state._fraisTypes.map(f => `<option value="${f.id}">${window.esc(f.nom)}</option>`).join('');
    if (current && state._fraisTypes.some(f => f.id == current)) filterImpayesFrais.value = current;
  }
}

export { formatMontant, formatDate, statutBadge, modeLabel, showFinLoader, hideFinLoader, _setVal, _setKpi, _afficherErreurFrais, _masquerErreurFrais, _afficherErreurPaiement, _masquerErreurPaiement, _remplirSelectsClasse };
