import { t } from '../../../locales/index.js';

let utilisateurs       = [];
let utilisateurEditId  = null;
let _state             = null;
let _utilisateursEventsAttaches = false;

// Cache pour les assignations (Classes & Matières)
let cachedClasses = null;
let cachedMatieres = null;

export async function init(state) {
  _state = state;
}

/**
 * Charge la liste des utilisateurs avec un rendu optimisé (DocumentFragment + 60FPS)
 */
export async function chargerUtilisateurs() {
  const container = document.getElementById('utilisateurs-list');
  if (!container) return;

  // État de chargement
  container.innerHTML = `<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div></div>`;

  try {
    const result = await window.elimuAPI.getUtilisateurs?.();
    utilisateurs = Array.isArray(result) ? result : [];
  } catch(e) {
    console.error('Erreur lors du chargement des utilisateurs:', e);
    container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red-fifa);">
      ❌ ${t('common.error')} : ${esc(e.message)}</div>`;
    return;
  }

  if (!utilisateurs.length) {
    container.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);">
      ${t('params.users_list_empty')}</div>`;
    return;
  }

  const roleLabel = { 
    admin:      t('params.users_role_admin'), 
    enseignant: t('params.users_role_teacher'), 
    secretaire: t('params.users_role_secretary'),
    comptable:  t('role.comptable')
  };
  const roleColor = { 
    admin: 'var(--yellow-fifa)', 
    enseignant: 'var(--blue-fifa)', 
    secretaire: 'var(--purple-fifa)', 
    comptable: 'var(--green-fifa)' 
  };

  const fragment = document.createDocumentFragment();

  utilisateurs.forEach(u => {
    const item = document.createElement('div');
    const color = roleColor[u.role] || 'var(--border-color)';
    const initial = (u.nom_complet || u.nom_utilisateur || '?')[0].toUpperCase();

    item.style.cssText = `display:flex; align-items:center; gap:12px; padding:12px 14px;
                          border-bottom:1px solid var(--border-color);
                          opacity:${u.actif ? '1' : '0.5'};`;

    item.innerHTML = `
      <div style="width:38px; height:38px; border-radius:50%; flex-shrink:0;
                  background:${color}22; border:2px solid ${color};
                  display:flex; align-items:center; justify-content:center;
                  font-size:16px; font-weight:700; color:${color};">
        ${esc(initial)}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="font-weight:600; font-size:13px; color:var(--text-primary);">
          ${esc(u.nom_complet || u.nom_utilisateur)}
          ${!u.actif ? `<span style="font-size:10px; color:var(--red-fifa); margin-left:6px;">${t('params.users_status_disabled')}</span>` : ''}
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:1px;">
          @${esc(u.nom_utilisateur)} ·
          <span style="color:${color};">${esc(roleLabel[u.role] || u.role)}</span>
          ${u.role === 'enseignant' && u.classes_ids?.length
            ? ` · ${u.classes_ids.length} classe(s) · ${u.matieres_ids?.length || 0} matière(s)`
            : ''}
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button class="btn btn-sm btn-secondary btn-edit-user" data-id="${u.id}"
                style="padding:4px 8px; display:flex; align-items:center; justify-content:center;" title="${t('common.edit')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        ${u.role !== 'admin' || utilisateurs.filter(x => x.role === 'admin' && x.actif).length > 1
          ? `<button class="btn btn-sm btn-danger btn-del-user" data-id="${u.id}"
                     style="padding:4px 8px; display:flex; align-items:center; justify-content:center;" title="${t('common.delete')}">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
             </button>`
          : '<span style="width:32px;"></span>'}
      </div>
    `;

    // Attachement d'événements
    item.querySelector('.btn-edit-user').addEventListener('click', () => ouvrirFormulaireUtilisateur(u.id));
    const btnDel = item.querySelector('.btn-del-user');
    if (btnDel) btnDel.addEventListener('click', () => supprimerUtilisateur(u.id));

    fragment.appendChild(item);
  });

  // Injection fluide dans le DOM
  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

/**
 * Ouvre le formulaire d'ajout/édition
 */
export function ouvrirFormulaireUtilisateur(id = null) {
  utilisateurEditId = id;
  const card    = document.getElementById('utilisateur-form-card');
  const titre   = document.getElementById('utilisateur-form-titre');
  const pwdHint = document.getElementById('uf-password-hint');
  if (!card) return;

  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Reset des assignations avant chargement
  remplirCheckboxesAssignations([], []);

  if (id) {
    const u = utilisateurs.find(x => x.id === id);
    if (!u) return;
    titre.textContent = `${t('common.edit')} : ${u.nom_complet || u.nom_utilisateur}`;
    if (pwdHint) pwdHint.style.display = 'block';
    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal('uf-username', u.nom_utilisateur);
    document.getElementById('uf-username').disabled = true;
    setVal('uf-nom-complet', u.nom_complet);
    setVal('uf-password', '');
    document.getElementById('uf-role').value = u.role;
    document.getElementById('uf-actif').checked = !!u.actif;
    
    remplirCheckboxesAssignations(u.classes_ids || [], u.matieres_ids || []);
    majVisibiliteAssignations(u.role);
  } else {
    titre.textContent = t('params.user_modal_add');
    if (pwdHint) pwdHint.style.display = 'none';
    document.getElementById('uf-username').value = '';
    document.getElementById('uf-username').disabled = false;
    document.getElementById('uf-nom-complet').value = '';
    document.getElementById('uf-password').value = '';
    document.getElementById('uf-role').value = 'enseignant';
    document.getElementById('uf-actif').checked = true;
    majVisibiliteAssignations('enseignant');
  }

  const errEl = document.getElementById('uf-error');
  if (errEl) errEl.style.display = 'none';
}

function majVisibiliteAssignations(role) {
  const assignDiv = document.getElementById('uf-assignations');
  if (assignDiv) assignDiv.style.display = role === 'enseignant' ? 'block' : 'none';
}

/**
 * Remplit les listes de classes et matières avec mise en cache
 */
async function remplirCheckboxesAssignations(classesIds, matieresIds) {
  const cContainer = document.getElementById('uf-classes-check');
  const mContainer = document.getElementById('uf-matieres-check');
  if (!cContainer || !mContainer) return;

  try {
    // Utilisation du cache si disponible
    if (!cachedClasses || !cachedMatieres) {
      const [resC, resM] = await Promise.all([
        window.elimuAPI.getClasses(),
        window.elimuAPI.getMatieres()
      ]);
      cachedClasses = Array.isArray(resC) ? resC : [];
      cachedMatieres = Array.isArray(resM) ? resM : [];
    }

    // Rendu des Classes via DocumentFragment
    const fragmentC = document.createDocumentFragment();
    cachedClasses.forEach(c => {
      const label = document.createElement('label');
      label.style.cssText = `display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 6px; border-radius:6px;`;
      label.onmouseover = () => { label.style.background = 'var(--bg-hover)'; };
      label.onmouseout = () => { label.style.background = ''; };
      label.innerHTML = `
        <input type="checkbox" value="${c.id}" ${classesIds.includes(c.id) ? 'checked' : ''}
               style="accent-color:var(--blue-fifa); width:14px; height:14px;">
        <span style="font-size:13px; color:var(--text-primary);">${esc(c.nom_classe)}</span>
      `;
      fragmentC.appendChild(label);
    });
    cContainer.innerHTML = '';
    cContainer.appendChild(fragmentC);

    // Rendu des Matières via DocumentFragment
    const fragmentM = document.createDocumentFragment();
    cachedMatieres.forEach(m => {
      const label = document.createElement('label');
      label.style.cssText = `display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 6px; border-radius:6px;`;
      label.onmouseover = () => { label.style.background = 'var(--bg-hover)'; };
      label.onmouseout = () => { label.style.background = ''; };
      label.innerHTML = `
        <input type="checkbox" value="${m.id}" ${matieresIds.includes(m.id) ? 'checked' : ''}
               style="accent-color:var(--green-fifa); width:14px; height:14px;">
        <span style="font-size:13px; color:var(--text-primary);">${esc(m.nom_matiere)}</span>
      `;
      fragmentM.appendChild(label);
    });
    mContainer.innerHTML = '';
    mContainer.appendChild(fragmentM);

  } catch (err) {
    console.error('Erreur remplissage assignations:', err);
  }
}

function fermerFormulaireUtilisateur() {
  const card = document.getElementById('utilisateur-form-card');
  if (card) card.style.display = 'none';
  utilisateurEditId = null;
}

async function supprimerUtilisateur(id) {
  const u = utilisateurs.find(x => x.id === id);
  if (!confirm(t('params.users_delete_confirm').replace('{name}', esc(u?.nom_complet || u?.nom_utilisateur)))) return;
  
  try {
    const result = await window.elimuAPI.deleteUtilisateur?.(id);
    if (result?.success) {
      showToast(t('params.users_delete_success'), 'success');
      await chargerUtilisateurs();
    } else {
      showToast('❌ ' + (result?.error || t('common.error')), 'error');
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

export function resetEventsUtilisateurs() {
  _utilisateursEventsAttaches = false;
}

export function attacherEvenementsUtilisateurs() {
  if (_utilisateursEventsAttaches) return;
  _utilisateursEventsAttaches = true;

  document.getElementById('btn-add-utilisateur')?.addEventListener('click', () => ouvrirFormulaireUtilisateur(null));
  document.getElementById('btn-refresh-utilisateurs')?.addEventListener('click', () => {
    cachedClasses = null; // Forcer le rafraîchissement du cache au refresh manuel
    cachedMatieres = null;
    chargerUtilisateurs();
  });
  
  document.getElementById('btn-cancel-utilisateur')?.addEventListener('click', fermerFormulaireUtilisateur);
  document.getElementById('btn-cancel-utilisateur-bas')?.addEventListener('click', fermerFormulaireUtilisateur);

  document.getElementById('uf-role')?.addEventListener('change', e => {
    majVisibiliteAssignations(e.target.value);
  });

  document.getElementById('btn-save-utilisateur')?.addEventListener('click', async () => {
    const errEl   = document.getElementById('uf-error');
    const username = document.getElementById('uf-username')?.value?.trim();
    const nomComplet = document.getElementById('uf-nom-complet')?.value?.trim();
    const password = document.getElementById('uf-password')?.value;
    const role    = document.getElementById('uf-role')?.value;
    const actif   = document.getElementById('uf-actif')?.checked;

    if (!nomComplet) {
      if (errEl) { errEl.textContent = '⚠️ ' + t('params.users_error_name_empty'); errEl.style.display = 'block'; }
      return;
    }

    const classesIds  = Array.from(document.querySelectorAll('#uf-classes-check input:checked')).map(cb => parseInt(cb.value));
    const matieresIds = Array.from(document.querySelectorAll('#uf-matieres-check input:checked')).map(cb => parseInt(cb.value));

    try {
      let result;
      if (utilisateurEditId) {
        result = await window.elimuAPI.updateUtilisateur?.(utilisateurEditId, {
          nom_complet: nomComplet,
          role, actif, classes_ids: classesIds, matieres_ids: matieresIds,
          mot_de_passe: password || ''
        });
      } else {
        if (!username) {
          if (errEl) { errEl.textContent = '⚠️ ' + t('params.users_error_username_empty'); errEl.style.display = 'block'; }
          return;
        }
        if (!password || password.length < 6) {
          if (errEl) { errEl.textContent = '⚠️ ' + t('params.users_error_password_short'); errEl.style.display = 'block'; }
          return;
        }
        result = await window.elimuAPI.createUtilisateur?.(
          {
            nom_utilisateur: username,
            mot_de_passe: password,
            nom_complet: nomComplet,
            role,
            classes_ids: classesIds,
            matieres_ids: matieresIds
          },
          _state?.user?.id
        );
      }

      if (result?.success) {
        fermerFormulaireUtilisateur();
        await chargerUtilisateurs();
        showToast(utilisateurEditId ? t('params.users_save_success') : t('params.users_add_success'), 'success');
      } else {
        if (errEl) { errEl.textContent = '❌ ' + (result?.error || t('common.error')); errEl.style.display = 'block'; }
      }
    } catch (err) {
      if (errEl) { errEl.textContent = '❌ ' + err.message; errEl.style.display = 'block'; }
    }
  });
}
