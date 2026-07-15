/**
 * professeurs.js — Section Professeurs d'Elimu
 * Gestion du corps enseignant (CRUD) + liaison avec les classes
 */

'use strict';

import { t } from '../../locales/index.js';

// ── État local ────────────────────────────────────────────
let _profPage       = 1;
let _profLimit      = 20;
let _profTotal      = 0;
let _profEditId     = null;   // null = création, number = édition
let _toutesClasses  = [];     // liste complète des classes pour les checkboxes
let _state          = null;

// ═══════════════════════════════════════════════════════════
// POINT D'ENTRÉE
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

  const recherche     = document.getElementById('search-profs')?.value?.trim() || '';
  const actifSeulement = document.getElementById('filter-actifs-only')?.checked ?? true;

  try {
    const result = await window.elimuAPI.getProfesseurs({
      recherche, actifSeulement, page: _profPage, limit: _profLimit
    });

    const profs = result?.professeurs || [];
    _profTotal  = result?.total || 0;

    _afficherKpis(result?.stats || {}, actifSeulement);
    _afficherGrille(profs);
    _afficherPagination();
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:10px;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red-fifa)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
      <span>${t('common.error')} : ${esc(e.message)}</span>
    </div>`;
  }
}

// ── KPIs ──────────────────────────────────────────────────

function _afficherKpis(stats, actifSeulement) {
  const container = document.getElementById('profs-kpis');
  if (!container) return;

  const totalProfs = _profTotal;
  const nbActifs = stats.nbActifs || 0;
  const nbFemmes = stats.nbFemmes || 0;

  const icons = {
    total: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    active: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    female: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"></circle><path d="M18 21v-2a4 4 0 0 0-4-4H10a4 4 0 0 0-4 4v2"></path><path d="M12 13v8"></path><path d="M9 18h6"></path></svg>`
  };

  container.innerHTML = [
    { icon: icons.total, val: totalProfs, label: t('profs.kpi_total'), color: 'var(--blue-fifa)' },
    { icon: icons.active, val: nbActifs, label: t('common.active'), color: 'var(--green-fifa)' },
    { icon: icons.female, val: nbFemmes, label: t('common.female') || 'Femmes', color: 'var(--purple-fifa)' }
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
    const initiales = esc(((p.prenom || '?')[0] + (p.nom || '?')[0]).toUpperCase());
    const isFemme = p.sexe === 'F';
    const avatarColor = isFemme ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'linear-gradient(135deg, var(--purple-fifa), var(--blue-fifa))';
    
    const badgeClasses = p.nb_classes > 0
      ? `<div class="prof-badge-classes"> ${t('profs.card_classes').replace('{count}', esc(p.nb_classes))}</div>`
      : `<div class="prof-badge-classes" style="background:rgba(255,183,77,0.1);border-color:rgba(255,183,77,0.2);color:var(--yellow-fifa);">${t('profs.card_no_class')}</div>`;

    return `
      <div class="prof-card animate-in" data-id="${esc(p.id)}">
        <div class="prof-card-band" style="background:${avatarColor};"></div>
        <div class="prof-card-inner">
          <div style="display:flex; align-items:flex-start; gap:15px;">
            <div class="prof-avatar" style="background:${avatarColor}; margin-bottom:0;">${initiales}</div>
            <div style="flex:1;">
              <div class="prof-nom">${esc(p.civilite || '')} ${esc(p.prenom)} ${esc(p.nom)}</div>
              ${p.matiere_principale
                ? `<div class="prof-matiere"> ${esc(p.matiere_principale)}</div>`
                : `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${t('profs.card_no_subject')}</div>`
              }
            </div>
          </div>
          
          <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:5px;">
             ${badgeClasses}
             ${p.specialite ? `<div style="font-size:10px; background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:4px; color:var(--text-secondary); border:1px solid var(--border-color);">${esc(p.specialite)}</div>` : ''}
          </div>
          
          ${!p.actif ? `<div class="prof-badge-inactif">${t('profs.card_inactive')}</div>` : ''}
          
          <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--border-color); display:flex; align-items:center; gap:10px; color:var(--text-muted); font-size:11px;">
             ${p.telephone ? `<span style="display:flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg> ${esc(p.telephone)}</span>` : ''}
             ${p.ville ? `<span style="display:flex;align-items:center;gap:4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> ${esc(p.ville)}</span>` : ''}
          </div>
        </div>
        <div class="prof-card-actions" style="background:rgba(0,0,0,0.15);">
          <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${esc(p.id)}">${t('common.edit')}</button>
          <button class="btn btn-sm btn-danger"    data-action="del"  data-id="${esc(p.id)}" style="max-width:40px; display:flex; align-items:center; justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // Clic sur la carte (sauf boutons) → profil détaillé
  grid.querySelectorAll('.prof-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      ouvrirProfilProfesseur(parseInt(card.dataset.id));
    });
  });

  grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      ouvrirModaleProfesseur(parseInt(btn.dataset.id));
    });
  });

  grid.querySelectorAll('[data-action="del"]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      supprimerProfesseur(parseInt(btn.dataset.id));
    });
  });
}

async function ouvrirProfilProfesseur(profId) {
  const modal = document.getElementById('modal-prof-view');
  if (!modal) return;

  try {
    const detail = await window.elimuAPI.getProfesseurDetail(profId);
    if (!detail?.professeur) throw new Error(t('profs.not_found') || 'Professeur introuvable');

    const p = detail.professeur;
    const initiales = esc(((p.prenom || '?')[0] + (p.nom || '?')[0]).toUpperCase());
    const isFemme = p.sexe === 'F';
    const avatarColor = isFemme ? 'linear-gradient(135deg, #ec4899, #8b5cf6)' : 'linear-gradient(135deg, var(--purple-fifa), var(--blue-fifa))';

    // Remplissage En-tête
    const avatar = document.getElementById('view-prof-avatar');
    avatar.textContent = initiales;
    avatar.style.background = avatarColor;
    
    document.getElementById('view-prof-civilite').textContent = p.civilite || '';
    document.getElementById('view-prof-nom-complet').textContent = `${esc(p.prenom)} ${esc(p.nom)}`;
    document.getElementById('view-prof-matiere').textContent = esc(p.matiere_principale || t('profs.card_no_subject'));
    
    const status = document.getElementById('view-prof-status');
    status.textContent = p.actif ? (t('common.active') || 'ACTIF') : (t('common.inactive') || 'INACTIF');
    status.className = p.actif ? 'prof-badge-classes' : 'prof-badge-inactif';
    status.style.marginTop = '0';

    // Colonne Gauche
    document.getElementById('view-prof-phone').textContent = p.telephone || '—';
    document.getElementById('view-prof-email').textContent = p.email || '—';
    document.getElementById('view-prof-adresse').textContent = `${esc(p.adresse || '')} ${esc(p.ville || '')}`.trim() || '—';
    document.getElementById('view-prof-total-eleves').textContent = detail.totalEleves || 0;

    // Colonne Droite
    document.getElementById('view-prof-specialite').textContent = esc(p.specialite || '—');
    document.getElementById('view-prof-diplome').textContent = esc(p.diplome_max || '—');
    
    // Ancienneté
    let anciennete = t('profs.new_arrival') || 'Nouvel arrivant';
    if (p.date_embauche) {
      const years = new Date().getFullYear() - new Date(p.date_embauche).getFullYear();
      if (years > 0) anciennete = `${years} an(s) de service`;
    }
    document.getElementById('view-prof-anciennete').textContent = anciennete;

    // Liste des classes
    const classesList = document.getElementById('view-prof-classes-list');
    classesList.innerHTML = (detail.classes || []).map(c => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px; padding:10px; display:flex; align-items:center; gap:10px;">
        <div style="width:30px; height:30px; border-radius:6px; background:rgba(61,142,248,0.1); color:var(--blue-fifa); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">${esc(c.niveau)}</div>
        <div style="flex:1;">
           <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${esc(c.nom_classe)}</div>
           <div style="font-size:10px; color:var(--text-muted);">${esc(c.nb_eleves)} élèves</div>
        </div>
      </div>
    `).join('') || `<div style="grid-column:1/-1; color:var(--text-muted); text-align:center; padding:10px;">${t('profs.card_no_class')}</div>`;

    // Actions
    document.getElementById('btn-view-prof-edit').onclick = () => {
       modal.style.display = 'none';
       ouvrirModaleProfesseur(profId);
    };

    modal.style.display = 'flex';
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function fermerProfilProfesseur() {
  const modal = document.getElementById('modal-prof-view');
  if (modal) modal.style.display = 'none';
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
    Page ${_profPage} / ${totalPages} <span style="color:var(--text-muted);">(${_profTotal} profs)</span>
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
// MODALE PROFESSEUR (création / édition)
// ═══════════════════════════════════════════════════════════

async function ouvrirModaleProfesseur(profId = null) {
  _profEditId = profId;
  const modal = document.getElementById('modal-prof');
  const title = document.getElementById('modal-prof-title');
  if (!modal) return;

  // Réinitialiser les champs
  document.getElementById('pf-civilite').value      = 'M.';
  document.getElementById('pf-sexe').value          = 'M';
  document.getElementById('pf-nom').value           = '';
  document.getElementById('pf-prenom').value        = '';
  document.getElementById('pf-telephone').value     = '';
  document.getElementById('pf-email').value         = '';
  document.getElementById('pf-matiere').value       = '';
  document.getElementById('pf-specialite').value    = '';
  document.getElementById('pf-diplome').value       = 'Licence';
  document.getElementById('pf-adresse').value       = '';
  document.getElementById('pf-ville').value         = '';
  document.getElementById('pf-date-embauche').value = '';
  document.getElementById('pf-actif').checked       = true;
  if (document.getElementById('pf-classes-count')) document.getElementById('pf-classes-count').textContent = '0 class(es)';
  _cacherErreur();

  // Remplir les checkboxes de classes
  await _remplirClassesCheckboxes([]);

  if (profId) {
    title.textContent = t('profs.modal_edit');
    try {
      const detail = await window.elimuAPI.getProfesseurDetail(profId);
      if (detail?.professeur) {
        const p = detail.professeur;
        document.getElementById('pf-civilite').value      = p.civilite || 'M.';
        document.getElementById('pf-sexe').value          = p.sexe     || 'M';
        document.getElementById('pf-nom').value           = p.nom      || '';
        document.getElementById('pf-prenom').value        = p.prenom   || '';
        document.getElementById('pf-telephone').value     = p.telephone || '';
        document.getElementById('pf-email').value         = p.email    || '';
        document.getElementById('pf-matiere').value       = p.matiere_principale || '';
        document.getElementById('pf-specialite').value    = p.specialite || '';
        document.getElementById('pf-diplome').value       = p.diplome_max || 'Licence';
        document.getElementById('pf-adresse').value       = p.adresse   || '';
        document.getElementById('pf-ville').value         = p.ville     || '';
        document.getElementById('pf-date-embauche').value = p.date_embauche || '';
        document.getElementById('pf-actif').checked       = !!p.actif;

        const classeIds = (detail.classes || []).map(c => c.id);
        await _remplirClassesCheckboxes(classeIds);
        if (document.getElementById('pf-classes-count')) document.getElementById('pf-classes-count').textContent = `${classeIds.length} class(es)`;
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
  const modal = document.getElementById('modal-prof');
  if (modal) modal.style.display = 'none';
  _profEditId = null;
  _cacherErreur();
}

async function _remplirClassesCheckboxes(selectedIds = []) {
  const container = document.getElementById('pf-classes-list');
  if (!container) return;

  // Rafraîchir la liste si nécessaire
  if (!_toutesClasses.length) {
    try {
      const raw = await window.elimuAPI.getClasses();
      _toutesClasses = Array.isArray(raw) ? raw : [];
    } catch {}
  }

  if (!_toutesClasses.length) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">
      ${t('classes.config_no_subjects')}</div>`;
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
        return;
      }
      const cb = item.querySelector('input[type=checkbox]');
      if (cb) { cb.checked = !cb.checked; item.classList.toggle('selected', cb.checked); }
    });
  });
}

function _getClassesSelectionnees() {
  return Array.from(
    document.querySelectorAll('#pf-classes-list input[type=checkbox]:checked')
  ).map(cb => parseInt(cb.value));
}

async function sauvegarderProfesseur() {
  _cacherErreur();

  const nom    = document.getElementById('pf-nom')?.value?.trim();
  const prenom = document.getElementById('pf-prenom')?.value?.trim();
  if (!nom)    { _afficherErreur(t('profs.error_no_name'));    return; }
  if (!prenom) { _afficherErreur(t('profs.error_no_firstname')); return; }

  const data = {
    civilite:           document.getElementById('pf-civilite').value,
    sexe:               document.getElementById('pf-sexe').value,
    nom,
    prenom,
    telephone:          document.getElementById('pf-telephone')?.value?.trim()     || null,
    email:              document.getElementById('pf-email')?.value?.trim()          || null,
    matiere_principale: document.getElementById('pf-matiere')?.value?.trim()       || null,
    specialite:         document.getElementById('pf-specialite')?.value?.trim()    || null,
    diplome_max:        document.getElementById('pf-diplome').value,
    adresse:            document.getElementById('pf-adresse')?.value?.trim()       || null,
    ville:              document.getElementById('pf-ville')?.value?.trim()         || null,
    date_embauche:      document.getElementById('pf-date-embauche')?.value         || null,
    actif:              document.getElementById('pf-actif')?.checked ? 1 : 0
  };

  const btnSave = document.getElementById('btn-prof-save');
  btnSave.disabled = true;
  btnSave.textContent = t('common.processing');

  try {
    let profId = _profEditId;

    if (_profEditId) {
      const res = await window.elimuAPI.updateProfesseur(_profEditId, data);
      if (!res?.success) { _afficherErreur(res?.error || t('common.error')); return; }
    } else {
      const res = await window.elimuAPI.addProfesseur(data);
      if (!res?.success) { _afficherErreur(res?.error || t('common.error')); return; }
      profId = res.id;
    }

    // Mettre à jour les classes enseignées
    const classeIds = _getClassesSelectionnees();
    await window.elimuAPI.updateClassesEnseignees(profId, classeIds);

    showToast(_profEditId ? t('profs.save_success_update') : t('profs.save_success_add'), 'success');
    fermerModaleProfesseur();
    _profPage = 1;
    await chargerProfesseurs();
  } catch (e) {
    _afficherErreur(t('common.error') + ' : ' + e.message);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = t('common.save');
  }
}

// ═══════════════════════════════════════════════════════════
// SUPPRESSION
// ═══════════════════════════════════════════════════════════

async function supprimerProfesseur(id) {
  const grid = document.getElementById('profs-grid');
  const card = grid?.querySelector(`.prof-card[data-id="${id}"]`);
  const nom  = card?.querySelector('.prof-nom')?.textContent || `ID ${id}`;

  if (!confirm(t('profs.delete_confirm').replace('{name}', nom))) return;

  const result = await window.elimuAPI.deleteProfesseur(id);
  if (result?.success) {
    showToast(t('profs.delete_success'), 'success');
    await chargerProfesseurs();
  } else {
    showToast(t('common.error') + ' : ' + (result?.error || t('common.error')), 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// IMPORT DEPUIS EXCEL
// ═══════════════════════════════════════════════════════════

function ouvrirImportProfesseurs() {
  const modal     = document.getElementById('modal-import-profs');
  const resultEl  = document.getElementById('import-profs-result');
  const filename  = document.getElementById('import-profs-filename');
  const btnOk     = document.getElementById('btn-import-profs-ok');
  const warning   = document.getElementById('import-profs-warning');
  if (!modal) return;

  // Réinitialiser
  if (resultEl)  { resultEl.style.display = 'none'; resultEl.textContent = ''; }
  if (filename)  { filename.textContent = ''; }
  if (btnOk)     { btnOk.disabled = true; btnOk.textContent = t('common.import_excel'); }
  if (warning)   { warning.style.display = 'none'; }

  // Remettre le mode par défaut sur "ajouter"
  const modeAjouter = document.getElementById('import-profs-mode-ajouter');
  if (modeAjouter) modeAjouter.checked = true;

  // Supprimer le chemin mémorisé sur le dropzone
  const dropzone = document.getElementById('import-profs-dropzone');
  if (dropzone) dropzone._filePath = null;

  modal.style.display = 'flex';
}

function fermerImportProfesseurs() {
  const modal = document.getElementById('modal-import-profs');
  if (modal) modal.style.display = 'none';
}

async function executerImportProfesseurs() {
  const dropzone  = document.getElementById('import-profs-dropzone');
  const filePath  = dropzone?._filePath;
  const resultEl  = document.getElementById('import-profs-result');
  const btnOk     = document.getElementById('btn-import-profs-ok');
  if (!filePath) return;

  const mode = document.querySelector('input[name="import-profs-mode"]:checked')?.value || 'ajouter';

  // Confirmation pour le mode REMPLACER
  if (mode === 'remplacer') {
    if (!confirm(t('profs.import_warning_replace').replace('<strong>', '').replace('</strong>', '').replace('<em>', '').replace('</em>', ''))) return;
  }

  btnOk.disabled    = true;
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
        if (result.nbAjoutes  > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${result.nbAjoutes} ` + t('profs.import_result_added') + '</span>');
        if (result.nbIgnores  > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg> ${result.nbIgnores} ` + t('profs.import_result_ignored') + '</span>');
        if (result.nbErreurs  > 0) lignes.push(`<span style="display:flex;align-items:center;gap:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> ${result.nbErreurs} ` + t('profs.import_result_errors') + '</span>');
        if (result.erreurs?.length) {
          lignes.push(
            '<div style="margin-top:6px;font-size:11px;opacity:0.8;">' +
            result.erreurs.slice(0, 5).map(e => `• ${esc(e)}`).join('<br>') +
            (result.erreurs.length > 5 ? `<br>• … et ${result.erreurs.length - 5} autre(s)` : '') +
            '</div>'
          );
        }
        resultEl.className = '';
        resultEl.style.background   = 'rgba(0,230,118,0.08)';
        resultEl.style.border       = '1px solid rgba(0,230,118,0.25)';
        resultEl.style.color        = 'var(--green-fifa)';
        resultEl.style.borderRadius = '8px';
        resultEl.style.padding      = '10px 14px';
        resultEl.innerHTML = lignes.join('<br>') || '✅ ' + t('common.success');

        showToast(t('profs.import_success').replace('{count}', result.nbAjoutes), 'success');
        _profPage = 1;
        await chargerProfesseurs();
        setTimeout(() => { fermerImportProfesseurs(); }, 2200);

      } else {
        resultEl.style.background   = 'rgba(255,71,87,0.08)';
        resultEl.style.border       = '1px solid rgba(255,71,87,0.25)';
        resultEl.style.color        = 'var(--red-fifa)';
        resultEl.style.borderRadius = '8px';
        resultEl.style.padding      = '10px 14px';
        resultEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          <span>${result?.error || t('profs.import_error')}</span>
        </div>`;
        showToast(t('profs.import_error'), 'error');
      }
    }
  } catch (e) {
    showToast(t('common.error') + ' : ' + e.message, 'error');
  } finally {
    btnOk.disabled    = false;
    btnOk.textContent = '✅ ' + t('common.import_excel');
  }
}

// ═══════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════

function _afficherErreur(msg) {
  const el = document.getElementById('pf-error');
  if (el) { 
    el.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <span>${msg}</span>
    </div>`; 
    el.style.display = 'block'; 
  }
}

function _cacherErreur() {
  const el = document.getElementById('pf-error');
  if (el) el.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
// ÉVÉNEMENTS
// ═══════════════════════════════════════════════════════════

function _setupEvents() {
  document.getElementById('btn-add-prof')?.addEventListener('click', () => ouvrirModaleProfesseur(null));

  // ── Modale Profil (Vue) ────────────────────────────────────
  document.getElementById('modal-prof-view-close')?.addEventListener('click', fermerProfilProfesseur);
  document.getElementById('btn-view-prof-close')?.addEventListener('click', fermerProfilProfesseur);
  document.getElementById('modal-prof-view')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-prof-view')) fermerProfilProfesseur();
  });

  // ── Modale professeur (CRUD) ───────────────────────────────
  document.getElementById('modal-prof-close')?.addEventListener('click', fermerModaleProfesseur);
  document.getElementById('btn-prof-cancel')?.addEventListener('click', fermerModaleProfesseur);
  document.getElementById('modal-prof')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-prof')) fermerModaleProfesseur();
  });
  document.getElementById('btn-prof-save')?.addEventListener('click', sauvegarderProfesseur);

  // ── Modale import Excel ────────────────────────────────────
  document.getElementById('btn-import-profs')?.addEventListener('click', ouvrirImportProfesseurs);

  document.getElementById('modal-import-profs-close')?.addEventListener('click', fermerImportProfesseurs);
  document.getElementById('btn-import-profs-cancel')?.addEventListener('click', fermerImportProfesseurs);
  document.getElementById('modal-import-profs')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-import-profs')) fermerImportProfesseurs();
  });

  // Clic sur la dropzone → sélectionner un fichier
  document.getElementById('import-profs-dropzone')?.addEventListener('click', async () => {
    const filePath = await window.elimuAPI.selectFile();
    if (!filePath) return;
    const dropzone = document.getElementById('import-profs-dropzone');
    const filename = document.getElementById('import-profs-filename');
    const btnOk    = document.getElementById('btn-import-profs-ok');
    dropzone._filePath = filePath;
    if (filename) filename.textContent = `✅ ${filePath.split(/[/\\]/).pop()}`;
    if (btnOk)    btnOk.disabled = false;
    // Cacher un éventuel résultat précédent
    const resultEl = document.getElementById('import-profs-result');
    if (resultEl) resultEl.style.display = 'none';
  });

  // Afficher/masquer l'avertissement selon le mode choisi
  document.querySelectorAll('input[name="import-profs-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const warning = document.getElementById('import-profs-warning');
      if (!warning) return;
      const mode = document.querySelector('input[name="import-profs-mode"]:checked')?.value;
      warning.style.display = mode === 'remplacer' ? 'block' : 'none';
    });
  });

  document.getElementById('btn-import-profs-ok')?.addEventListener('click', executerImportProfesseurs);

  // Générer modèle Excel
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

  // ── Recherche avec debounce ────────────────────────────────
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
