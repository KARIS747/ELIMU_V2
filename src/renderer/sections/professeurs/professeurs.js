/**
 * professeurs.js — Comptes Enseignants PWA (V2)
 * Creation, suspension et gestion des acces PWA
 */

'use strict';

import { t } from '../../locales/index.js';

let _profPage = 1;
let _profLimit = 20;
let _profTotal = 0;
let _profEditId = null;
let _toutesClasses = [];
let _state = null;
let _currentViewProfId = null;

// ═══════════════════════════════════════════════════════════
// POINT D'ENTREE
// ═══════════════════════════════════════════════════════════

export async function init(state) {
  _state = state;
  _toutesClasses = state?.classes || [];
  _setupEvents();
  await chargerProfesseurs();
}

// ═══════════════════════════════════════════════════════════
// CHARGEMENT
// ═══════════════════════════════════════════════════════════

async function chargerProfesseurs() {
  const grid = document.getElementById('profs-grid');
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px;">
    <div class="spinner"></div></div>`;

  const recherche = document.getElementById('search-profs')?.value?.trim() || '';
  const actifSeulement = document.getElementById('filter-actifs-only')?.checked ?? true;

  try {
    const result = await window.elimuAPI.getProfesseurs({
      recherche, actifSeulement, page: _profPage, limit: _profLimit
    });

    const profs = result?.professeurs || [];
    _profTotal = result?.total || 0;

    _afficherKpis(result?.stats || {});
    _afficherGrille(profs);
    _afficherPagination();
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:10px;">
      <div style="color:var(--red-fifa);font-size:32px;font-weight:700;">!</div>
      <span>${t('common.error')} : ${esc(e.message)}</span>
    </div>`;
  }
}

// ── KPIs ──────────────────────────────────────────────────

function _afficherKpis(stats) {
  const container = document.getElementById('profs-kpis');
  if (!container) return;

  const total = _profTotal;
  const actifs = stats.nbActifs || 0;
  const suspendus = stats.nbSuspendus || 0;

  container.innerHTML = [
    { val: total, label: t('profs.kpi_total'), color: 'var(--blue-fifa)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' },
    { val: actifs, label: t('profs.kpi_active'), color: 'var(--green-fifa)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' },
    { val: suspendus, label: t('profs.kpi_suspended'), color: 'var(--yellow-fifa)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>' }
  ].map(k => `
    <div class="stat-card animate-in" style="display:flex; align-items:center; gap:15px; padding:15px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px;">
      <div class="stat-icon" style="color:${k.color}; width:45px; height:45px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.03); border-radius:10px;">${k.icon}</div>
      <div>
        <div class="stat-value" style="font-family:'Rajdhani',sans-serif; font-size:22px; font-weight:700; color:${k.color};">${k.val}</div>
        <div class="stat-label" style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:600; letter-spacing:0.5px;">${k.label}</div>
      </div>
    </div>
  `).join('');
}

// ── Grille des cartes ──────────────────────────────────────

function _afficherGrille(profs) {
  const grid = document.getElementById('profs-grid');
  if (!grid) return;

  if (!profs.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="margin-bottom:16px;opacity:0.2;color:var(--text-muted);display:flex;justify-content:center;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:18px;color:var(--text-secondary);">
          ${t('profs.empty_title')}
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:6px;">
          ${t('profs.empty_desc')}
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = profs.map(p => {
    const prenom = p.prenom || '';
    const nom = p.nom || '';
    const initiales = ((prenom[0] || '') + (nom[0] || '')).toUpperCase() || '?';
    const hasAccount = !!p.username;

    const bandClass = !p.actif ? 'inactive' : (p.suspendu ? 'suspended' : 'active');
    const avatarClass = p.suspendu ? 'prof-avatar suspended' : 'prof-avatar';

    const badges = [];
    if (p.nb_classes > 0) {
      badges.push(`<div class="prof-badge-classes">${t('profs.card_classes').replace('{count}', p.nb_classes)}</div>`);
    } else {
      badges.push(`<div class="prof-badge-classes" style="background:rgba(255,183,77,0.1);border-color:rgba(255,183,77,0.2);color:var(--yellow-fifa);">${t('profs.card_no_class')}</div>`);
    }
    if (p.suspendu) {
      badges.push(`<div class="prof-badge-suspended">${t('profs.card_inactive')}</div>`);
    } else if (!p.actif) {
      badges.push(`<div class="prof-badge-inactive">${t('common.inactive')}</div>`);
    }

    const lastLogin = p.derniere_connexion
      ? `<div class="prof-last-login">${t('profs.last_login')} : ${new Date(p.derniere_connexion).toLocaleDateString()}</div>`
      : (hasAccount ? `<div class="prof-last-login">${t('profs.never_connected')}</div>` : '');

    return `
      <div class="prof-card animate-in" data-id="${p.id}">
        <div class="prof-card-band ${bandClass}"></div>
        <div class="prof-card-inner">
          <div style="display:flex; align-items:flex-start; gap:15px;">
            <div class="${avatarClass}">${initiales}</div>
            <div style="flex:1;">
              <div class="prof-nom">${esc(prenom)} ${esc(nom)}</div>
              ${hasAccount ? `<div class="prof-username">${esc(p.username)}</div>` : `<div class="prof-username" style="color:var(--red-fifa);">${t('profs.no_account')}</div>`}
              ${p.matiere_principale
                ? `<div class="prof-matiere">${esc(p.matiere_principale)}</div>`
                : `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${t('profs.card_no_subject')}</div>`
              }
            </div>
          </div>

          <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">
            ${badges.join('')}
          </div>

          ${lastLogin}
        </div>
        <div class="prof-card-actions" style="background:rgba(0,0,0,0.15);">
          <button class="btn btn-sm btn-secondary" data-action="view" data-id="${p.id}">${t('common.view')}</button>
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${p.id}">${t('common.edit')}</button>
          ${hasAccount && p.suspendu
            ? `<button class="btn btn-sm btn-secondary" data-action="reactivate" data-id="${p.id}" style="color:var(--green-fifa);">${t('profs.btn_reactivate')}</button>`
            : ''}
          ${hasAccount && !p.suspendu
            ? `<button class="btn btn-sm btn-secondary" data-action="suspend" data-id="${p.id}" style="color:var(--yellow-fifa);">${t('profs.btn_suspend')}</button>`
            : ''}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.prof-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      ouvrirDetailCompte(parseInt(card.dataset.id));
    });
  });

  grid.querySelectorAll('[data-action="view"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); ouvrirDetailCompte(parseInt(btn.dataset.id)); });
  });
  grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); ouvrirModaleProfesseur(parseInt(btn.dataset.id)); });
  });
  grid.querySelectorAll('[data-action="suspend"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); suspendreCompte(parseInt(btn.dataset.id)); });
  });
  grid.querySelectorAll('[data-action="reactivate"]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); reactiverCompte(parseInt(btn.dataset.id)); });
  });
}

// ═══════════════════════════════════════════════════════════
// MODALE DETAIL COMPTE (Compte + Journal)
// ═══════════════════════════════════════════════════════════

async function ouvrirDetailCompte(profId) {
  _currentViewProfId = profId;
  const modal = document.getElementById('modal-prof-view');
  if (!modal) return;

  try {
    const detail = await window.elimuAPI.getProfesseurDetail(profId);
    if (!detail?.professeur) throw new Error('Professeur introuvable');

    const p = detail.professeur;
    const prenom = p.prenom || '';
    const nom = p.nom || '';
    const initiales = ((prenom[0] || '') + (nom[0] || '')).toUpperCase() || '?';
    const hasAccount = !!p.username;

    // En-tete
    document.getElementById('view-prof-avatar').textContent = initiales;
    document.getElementById('view-prof-nom-complet').textContent = `${esc(prenom)} ${esc(nom)}`;
    document.getElementById('view-prof-username').textContent = hasAccount ? esc(p.username) : t('profs.no_account');
    document.getElementById('view-prof-matiere').textContent = esc(p.matiere_principale || t('profs.card_no_subject'));

    const statusBadge = document.getElementById('view-prof-status-badge');
    if (p.suspendu) {
      statusBadge.textContent = t('profs.status_suspended');
      statusBadge.style.background = 'rgba(255,193,7,0.1)';
      statusBadge.style.border = '1px solid rgba(255,193,7,0.2)';
      statusBadge.style.color = 'var(--yellow-fifa)';
    } else if (hasAccount) {
      statusBadge.textContent = t('profs.status_active');
      statusBadge.style.background = 'rgba(0,230,118,0.1)';
      statusBadge.style.border = '1px solid rgba(0,230,118,0.2)';
      statusBadge.style.color = 'var(--green-fifa)';
    } else {
      statusBadge.textContent = t('profs.no_account');
      statusBadge.style.background = 'rgba(255,71,87,0.1)';
      statusBadge.style.border = '1px solid rgba(255,71,87,0.2)';
      statusBadge.style.color = 'var(--red-fifa)';
    }

    // Boutons suspendre/reactiver
    document.getElementById('btn-view-prof-suspend').style.display = (hasAccount && !p.suspendu) ? 'inline-flex' : 'none';
    document.getElementById('btn-view-prof-reactivate').style.display = (hasAccount && p.suspendu) ? 'inline-flex' : 'none';

    // Panel Compte
    document.getElementById('view-prof-phone').textContent = p.telephone || '—';
    document.getElementById('view-prof-email').textContent = p.email || '—';
    document.getElementById('view-prof-username-detail').textContent = hasAccount ? esc(p.username) : '—';
    document.getElementById('view-prof-last-login').textContent = p.derniere_connexion
      ? new Date(p.derniere_connexion).toLocaleString() : t('profs.never_connected');
    document.getElementById('view-prof-created-at').textContent = p.date_creation_compte
      ? new Date(p.date_creation_compte).toLocaleDateString() : '—';
    document.getElementById('view-prof-impact').textContent = detail.totalEleves || 0;

    // Classes
    const classesList = document.getElementById('view-prof-classes-list');
    classesList.innerHTML = (detail.classes || []).map(c => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px;">
        <div style="width:30px; height:30px; border-radius:6px; background:rgba(61,142,248,0.1); color:var(--blue-fifa); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${esc(c.niveau)}</div>
        <div style="flex:1;">
          <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${esc(c.nom_classe)}</div>
          <div style="font-size:10px; color:var(--text-muted);">${c.nb_eleves} eleves</div>
        </div>
      </div>
    `).join('') || `<div style="grid-column:1/-1; color:var(--text-muted); text-align:center; padding:10px;">${t('profs.card_no_class')}</div>`;

    // Panel Journal
    await _chargerHistoriqueConnexions(profId);

    // Basculer sur l'onglet Compte
    _activerOnglet('account');

    modal.style.display = 'flex';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function _chargerHistoriqueConnexions(profId) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  const displayNoHistory = () => {
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--text-muted);padding:40px;">${t('profs.no_login_history')}</td></tr>`;
  };

  try {
    const history = await window.elimuAPI.getTeacherLoginHistory(profId);
    if (!history?.length) { displayNoHistory(); return; }

    tbody.innerHTML = history.map(h => `
      <tr>
        <td>${new Date(h.date_connexion).toLocaleString()}</td>
        <td>${esc(h.details || '—')}</td>
      </tr>
    `).join('');
  } catch {
    displayNoHistory();
  }
}

function _activerOnglet(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.detail-tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.getElementById(`detail-panel-${tabName}`)?.classList.add('active');
}

function fermerDetailCompte() {
  document.getElementById('modal-prof-view').style.display = 'none';
  _currentViewProfId = null;
}

// ═══════════════════════════════════════════════════════════
// SUSPENDRE / REACTIVER
// ═══════════════════════════════════════════════════════════

async function suspendreCompte(id) {
  let nom = '';
  try {
    const detail = await window.elimuAPI.getProfesseurDetail(id);
    nom = detail?.professeur ? `${detail.professeur.prenom} ${detail.professeur.nom}` : `ID ${id}`;
  } catch {}

  if (!confirm(t('profs.suspend_confirm').replace('{name}', nom))) return;

  const res = await window.elimuAPI.suspendTeacherAccount(id);
  if (res?.success) {
    showToast(t('common.success'), 'success');
    await chargerProfesseurs();
    if (_currentViewProfId === id) ouvrirDetailCompte(id);
  } else {
    showToast(res?.error || t('common.error'), 'error');
  }
}

async function reactiverCompte(id) {
  let nom = '';
  try {
    const detail = await window.elimuAPI.getProfesseurDetail(id);
    nom = detail?.professeur ? `${detail.professeur.prenom} ${detail.professeur.nom}` : `ID ${id}`;
  } catch {}

  if (!confirm(t('profs.reactivate_confirm').replace('{name}', nom))) return;

  const res = await window.elimuAPI.reactivateTeacherAccount(id);
  if (res?.success) {
    showToast(t('common.success'), 'success');
    await chargerProfesseurs();
    if (_currentViewProfId === id) ouvrirDetailCompte(id);
  } else {
    showToast(res?.error || t('common.error'), 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// REINITIALISER MOT DE PASSE
// ═══════════════════════════════════════════════════════════

async function reinitialiserMotDePasse(profId) {
  let nom = '';
  try {
    const detail = await window.elimuAPI.getProfesseurDetail(profId);
    nom = detail?.professeur ? `${detail.professeur.prenom} ${detail.professeur.nom}` : `ID ${profId}`;
  } catch {}

  if (!confirm(t('profs.reset_password_confirm').replace('{name}', nom))) return;

  const res = await window.elimuAPI.resetTeacherPassword(profId);
  if (res?.success) {
    showToast(t('profs.password_reset_done').replace('{password}', res.password), 'success', 8000);
  } else {
    showToast(res?.error || t('common.error'), 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// IMPRIMER FICHE ACCES
// ═══════════════════════════════════════════════════════════

async function imprimerFicheAcces(profId) {
  try {
    const res = await window.elimuAPI.printTeacherAccessCard(profId);
    if (!res?.success && !res?.canceled) {
      showToast(res?.error || t('common.error'), 'error');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── Pagination ─────────────────────────────────────────────

function _afficherPagination() {
  const paginationDiv = document.getElementById('profs-pagination');
  if (!paginationDiv) return;

  if (_profTotal <= _profLimit) { paginationDiv.innerHTML = ''; return; }

  const totalPages = Math.ceil(_profTotal / _profLimit);
  let html = '<div style="display:flex;gap:8px;justify-content:center;">';
  if (_profPage > 1) {
    html += `<button class="btn btn-sm btn-secondary" data-page="${_profPage - 1}" style="padding:4px 8px;">&lt;</button>`;
  }
  html += `<span style="padding:4px 12px;background:var(--bg-secondary);border-radius:6px;font-size:13px;">
    Page ${_profPage} / ${totalPages} <span style="color:var(--text-muted);">(${_profTotal} comptes)</span>
  </span>`;
  if (_profPage < totalPages) {
    html += `<button class="btn btn-sm btn-secondary" data-page="${_profPage + 1}" style="padding:4px 8px;">&gt;</button>`;
  }
  html += '</div>';
  paginationDiv.innerHTML = html;

  paginationDiv.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      _profPage = parseInt(btn.dataset.page);
      chargerProfesseurs();
    });
  });
}

// ═══════════════════════════════════════════════════════════
// MODALE PROFESSEUR (creation / edition)
// ═══════════════════════════════════════════════════════════

async function ouvrirModaleProfesseur(profId = null) {
  _profEditId = profId;
  const modal = document.getElementById('modal-prof');
  const title = document.getElementById('modal-prof-title');
  if (!modal) return;

  // Reinitialiser
  document.getElementById('pf-nom').value = '';
  document.getElementById('pf-prenom').value = '';
  document.getElementById('pf-telephone').value = '';
  document.getElementById('pf-email').value = '';
  document.getElementById('pf-matiere').value = '';
  if (document.getElementById('pf-classes-count')) document.getElementById('pf-classes-count').textContent = '0 classe(s)';
  document.getElementById('password-generated-block').style.display = 'none';
  document.getElementById('generated-password').textContent = '**********';
  _cacherErreur();

  await _remplirClassesCheckboxes([]);

  if (profId) {
    title.textContent = t('profs.modal_edit');
    try {
      const detail = await window.elimuAPI.getProfesseurDetail(profId);
      if (detail?.professeur) {
        const p = detail.professeur;
        document.getElementById('pf-nom').value = p.nom || '';
        document.getElementById('pf-prenom').value = p.prenom || '';
        document.getElementById('pf-telephone').value = p.telephone || '';
        document.getElementById('pf-email').value = p.email || '';
        document.getElementById('pf-matiere').value = p.matiere_principale || '';

        const classeIds = (detail.classes || []).map(c => c.id);
        await _remplirClassesCheckboxes(classeIds);
        if (document.getElementById('pf-classes-count')) document.getElementById('pf-classes-count').textContent = `${classeIds.length} classe(s)`;

        // Si le compte existe deja, on affiche l'identifiant
        if (p.username) {
          document.getElementById('password-generated-block').style.display = 'block';
          document.getElementById('generated-password').textContent = t('profs.no_account');
          document.querySelector('#password-generated-block .pw-value').style.color = 'var(--text-muted)';
          document.querySelector('#password-generated-block .pw-value').style.fontSize = '14px';
        }
      }
    } catch (e) {
      showToast(t('common.error') + ' : ' + e.message, 'error');
    }
  } else {
    title.textContent = t('profs.modal_add');
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('pf-nom')?.focus(), 50);
}

function fermerModaleProfesseur() {
  document.getElementById('modal-prof').style.display = 'none';
  _profEditId = null;
  _cacherErreur();
}

async function _remplirClassesCheckboxes(selectedIds = []) {
  const container = document.getElementById('pf-classes-list');
  if (!container) return;

  if (!_toutesClasses.length) {
    try {
      const raw = await window.elimuAPI.getClasses();
      _toutesClasses = Array.isArray(raw) ? raw : [];
    } catch {}
  }

  if (!_toutesClasses.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">
      ${t('classes.config_no_subjects') || 'Aucune classe'}</div>`;
    return;
  }

  container.innerHTML = _toutesClasses.map(c => {
    const checked = selectedIds.includes(c.id);
    return `
      <div class="classe-check-item ${checked ? 'selected' : ''}" data-classe-id="${c.id}">
        <input type="checkbox" value="${c.id}" ${checked ? 'checked' : ''}
               style="accent-color:var(--green-fifa);width:15px;height:15px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${esc(c.nom_classe)}</div>
          <div style="font-size:11px;color:var(--text-muted);">${esc(c.niveau || '—')}</div>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.classe-check-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.type === 'checkbox') {
        item.classList.toggle('selected', e.target.checked);
        _majCompteurClasses();
        return;
      }
      const cb = item.querySelector('input[type=checkbox]');
      if (cb) { cb.checked = !cb.checked; item.classList.toggle('selected', cb.checked); _majCompteurClasses(); }
    });
  });
}

function _majCompteurClasses() {
  const count = document.querySelectorAll('#pf-classes-list input[type=checkbox]:checked').length;
  const el = document.getElementById('pf-classes-count');
  if (el) el.textContent = `${count} classe(s)`;
}

function _getClassesSelectionnees() {
  return Array.from(
    document.querySelectorAll('#pf-classes-list input[type=checkbox]:checked')
  ).map(cb => parseInt(cb.value));
}

async function sauvegarderProfesseur() {
  _cacherErreur();

  const nom = document.getElementById('pf-nom')?.value?.trim();
  const prenom = document.getElementById('pf-prenom')?.value?.trim();
  if (!nom) { _afficherErreur(t('profs.error_no_name')); return; }
  if (!prenom) { _afficherErreur(t('profs.error_no_firstname')); return; }

  const btnSave = document.getElementById('btn-prof-save');
  btnSave.disabled = true;
  btnSave.textContent = t('common.processing');

  try {
    if (_profEditId) {
      // Edition : mettre a jour professeur existant (pas de modif compte via cette modale)
      const data = {
        nom,
        prenom,
        telephone: document.getElementById('pf-telephone')?.value?.trim() || null,
        email: document.getElementById('pf-email')?.value?.trim() || null,
        matiere_principale: document.getElementById('pf-matiere')?.value?.trim() || null
      };
      const res = await window.elimuAPI.updateProfesseur(_profEditId, data);
      if (!res?.success) { _afficherErreur(res?.error || t('common.error')); return; }

      const classeIds = _getClassesSelectionnees();
      await window.elimuAPI.updateClassesEnseignees(_profEditId, classeIds);

      showToast(t('profs.save_success_update'), 'success');
    } else {
      // Creation : creer compte enseignant (utilisateur + professeur)
      const data = {
        nom,
        prenom,
        telephone: document.getElementById('pf-telephone')?.value?.trim() || null,
        email: document.getElementById('pf-email')?.value?.trim() || null,
        matiere_principale: document.getElementById('pf-matiere')?.value?.trim() || null
      };
      const res = await window.elimuAPI.createTeacherAccount(data);
      if (!res?.success) { _afficherErreur(res?.error || t('common.error')); return; }

      // Afficher le mot de passe genere
      const pwBlock = document.getElementById('password-generated-block');
      const pwEl = document.getElementById('generated-password');
      pwBlock.style.display = 'block';
      pwEl.textContent = res.password;
      pwEl.style.color = 'var(--yellow-fifa)';
      pwEl.style.fontSize = '22px';
      document.querySelector('#password-generated-block .pw-value').style.fontSize = '22px';

      // Lier les classes
      const classeIds = _getClassesSelectionnees();
      if (classeIds.length) {
        await window.elimuAPI.updateClassesEnseignees(res.prof_id, classeIds);
      }

      showToast(t('profs.save_success_add').replace('{username}', res.username), 'success');

      // Desactiver le formulaire pour forcer la lecture du mot de passe
      document.querySelectorAll('#form-prof input, #form-prof button').forEach(el => { if (el !== pwBlock && el.id !== 'btn-prof-cancel' && el.id !== 'modal-prof-close') el.disabled = true; });
      btnSave.disabled = true;
      btnSave.textContent = t('common.saved');
      return;
    }

    fermerModaleProfesseur();
    _profPage = 1;
    await chargerProfesseurs();
  } catch (e) {
    _afficherErreur(t('common.error') + ' : ' + e.message);
  } finally {
    if (!_profEditId) {
      btnSave.disabled = false;
      btnSave.textContent = t('common.save');
    }
  }
}

// ═══════════════════════════════════════════════════════════
// IMPORT DEPUIS EXCEL
// ═══════════════════════════════════════════════════════════

function ouvrirImportProfesseurs() {
  const modal = document.getElementById('modal-import-profs');
  const resultEl = document.getElementById('import-profs-result');
  const filename = document.getElementById('import-profs-filename');
  const btnOk = document.getElementById('btn-import-profs-ok');
  const warning = document.getElementById('import-profs-warning');
  if (!modal) return;

  if (resultEl) { resultEl.style.display = 'none'; resultEl.textContent = ''; }
  if (filename) { filename.textContent = ''; }
  if (btnOk) { btnOk.disabled = true; btnOk.textContent = t('common.import_excel'); }
  if (warning) { warning.style.display = 'none'; }

  document.querySelector('input[name="import-profs-mode"][data-mode="ajouter"]').checked = true;

  const dropzone = document.getElementById('import-profs-dropzone');
  if (dropzone) dropzone._filePath = null;

  modal.style.display = 'flex';
}

function fermerImportProfesseurs() {
  document.getElementById('modal-import-profs').style.display = 'none';
}

async function executerImportProfesseurs() {
  const dropzone = document.getElementById('import-profs-dropzone');
  const filePath = dropzone?._filePath;
  const resultEl = document.getElementById('import-profs-result');
  const btnOk = document.getElementById('btn-import-profs-ok');
  if (!filePath) return;

  const mode = document.querySelector('input[name="import-profs-mode"]:checked')?.dataset?.mode || 'ajouter';

  if (mode === 'remplacer') {
    if (!confirm(t('profs.import_warning_replace'))) return;
  }

  btnOk.disabled = true;
  btnOk.textContent = t('common.waiting');
  if (resultEl) resultEl.style.display = 'none';

  try {
    const result = await window.elimuAPI.importListeProfesseurs(
      filePath,
      mode,
      _state?.user?.id
    );

    if (resultEl) {
      resultEl.style.display = 'block';
      const lignes = [];

      if (result?.success) {
        if (result.nbAjoutes > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"> + ${result.nbAjoutes} ${t('profs.import_result_added')}</span>`);
        if (result.nbIgnores > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"> = ${result.nbIgnores} ${t('profs.import_result_ignored')}</span>`);
        if (result.nbErreurs > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"> ! ${result.nbErreurs} ${t('profs.import_result_errors')}</span>`);
        if (result.erreurs?.length) {
          lignes.push(
            '<div style="margin-top:6px;font-size:11px;opacity:0.8;">' +
            result.erreurs.slice(0, 5).map(e => `• ${esc(e)}`).join('<br>') +
            (result.erreurs.length > 5 ? `<br>• … et ${result.erreurs.length - 5} autre(s)` : '') +
            '</div>'
          );
        }
        resultEl.style.background = 'rgba(0,230,118,0.08)';
        resultEl.style.border = '1px solid rgba(0,230,118,0.25)';
        resultEl.style.color = 'var(--green-fifa)';
        resultEl.innerHTML = lignes.join('<br>') || t('common.success');

        showToast(t('profs.import_success').replace('{count}', result.nbAjoutes), 'success');
        _profPage = 1;
        await chargerProfesseurs();
        setTimeout(() => { fermerImportProfesseurs(); }, 2200);
      } else {
        resultEl.style.background = 'rgba(255,71,87,0.08)';
        resultEl.style.border = '1px solid rgba(255,71,87,0.25)';
        resultEl.style.color = 'var(--red-fifa)';
        resultEl.innerHTML = `<span>${result?.error || t('profs.import_error')}</span>`;
        showToast(t('profs.import_error'), 'error');
      }
    }
  } catch (e) {
    showToast(t('common.error') + ' : ' + e.message, 'error');
  } finally {
    btnOk.disabled = false;
    btnOk.textContent = t('common.import_excel');
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════

function _afficherErreur(msg) {
  const el = document.getElementById('pf-error');
  if (el) { el.innerHTML = `<span>${msg}</span>`; el.style.display = 'block'; }
}

function _cacherErreur() {
  const el = document.getElementById('pf-error');
  if (el) el.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// EVENEMENTS
// ═══════════════════════════════════════════════════════════

function _setupEvents() {
  document.getElementById('btn-add-prof')?.addEventListener('click', () => ouvrirModaleProfesseur(null));

  // Detail modal
  document.getElementById('modal-prof-view-close')?.addEventListener('click', fermerDetailCompte);
  document.getElementById('modal-prof-view')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-prof-view')) fermerDetailCompte();
  });

  // Tabs
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => _activerOnglet(tab.dataset.tab));
  });

  // Actions dans le detail
  document.getElementById('btn-view-prof-suspend')?.addEventListener('click', () => {
    if (_currentViewProfId) suspendreCompte(_currentViewProfId);
  });
  document.getElementById('btn-view-prof-reactivate')?.addEventListener('click', () => {
    if (_currentViewProfId) reactiverCompte(_currentViewProfId);
  });
  document.getElementById('btn-view-prof-reset-pw')?.addEventListener('click', () => {
    if (_currentViewProfId) reinitialiserMotDePasse(_currentViewProfId);
  });
  document.getElementById('btn-view-prof-print')?.addEventListener('click', () => {
    if (_currentViewProfId) imprimerFicheAcces(_currentViewProfId);
  });
  document.getElementById('btn-view-prof-edit')?.addEventListener('click', () => {
    if (_currentViewProfId) {
      fermerDetailCompte();
      ouvrirModaleProfesseur(_currentViewProfId);
    }
  });

  // Modale professeur (CRUD)
  document.getElementById('modal-prof-close')?.addEventListener('click', fermerModaleProfesseur);
  document.getElementById('btn-prof-cancel')?.addEventListener('click', fermerModaleProfesseur);
  document.getElementById('modal-prof')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-prof')) fermerModaleProfesseur();
  });
  document.getElementById('btn-prof-save')?.addEventListener('click', sauvegarderProfesseur);

  // Modale import Excel
  document.getElementById('btn-import-profs')?.addEventListener('click', ouvrirImportProfesseurs);
  document.getElementById('modal-import-profs-close')?.addEventListener('click', fermerImportProfesseurs);
  document.getElementById('btn-import-profs-cancel')?.addEventListener('click', fermerImportProfesseurs);
  document.getElementById('modal-import-profs')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-import-profs')) fermerImportProfesseurs();
  });

  document.getElementById('import-profs-dropzone')?.addEventListener('click', async () => {
    const filePath = await window.elimuAPI.selectFile();
    if (!filePath) return;
    const dropzone = document.getElementById('import-profs-dropzone');
    const filename = document.getElementById('import-profs-filename');
    const btnOk = document.getElementById('btn-import-profs-ok');
    dropzone._filePath = filePath;
    if (filename) filename.textContent = filePath.split(/[/\\]/).pop();
    if (btnOk) btnOk.disabled = false;
    const resultEl = document.getElementById('import-profs-result');
    if (resultEl) resultEl.style.display = 'none';
  });

  document.querySelectorAll('input[name="import-profs-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const warning = document.getElementById('import-profs-warning');
      if (!warning) return;
      const mode = document.querySelector('input[name="import-profs-mode"]:checked')?.dataset?.mode;
      warning.style.display = mode === 'remplacer' ? 'block' : 'none';
    });
  });

  document.getElementById('btn-import-profs-ok')?.addEventListener('click', executerImportProfesseurs);

  document.getElementById('btn-import-profs-template')?.addEventListener('click', async () => {
    try {
      const lang = window.getCurrentGenLocale();
      const res = await window.elimuAPI.exportModeleImportProfesseurs(lang);
      if (res.success) {
        showToast(t('common.success'), 'success');
      } else if (!res.canceled) {
        showToast(t('common.error') + ' : ' + res.error, 'error');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  });

  // Recherche
  let searchTimer = null;
  document.getElementById('search-profs')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { _profPage = 1; chargerProfesseurs(); }, 350);
  });

  document.getElementById('filter-actifs-only')?.addEventListener('change', () => {
    _profPage = 1;
    chargerProfesseurs();
  });
}
