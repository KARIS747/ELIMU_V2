/**
 * parents.js — Section Parents d'Elimu
 */

'use strict';

import { t } from '../../locales/index.js';

// ── État local ────────────────────────────────────────────
let _state   = null;
let _parents = [];
let _currentPage = 1;
let _limit = 20;
let _totalParents = 0;

// ═══════════════════════════════════════════════════════════
// POINT D'ENTRÉE
// ═══════════════════════════════════════════════════════════

export async function init(state) {
  _state = state;
  _setupEvents();
  _remplirSelectClasses(state?.classes || []);
  
  // Remplir sélecteur de l'onglet export
  const exportSelect = document.getElementById('export-fiches-classe');
  if (exportSelect) {
      exportSelect.innerHTML = '<option value="" data-i18n="common.all_classes">' + t('common.all_classes') + '</option>' + 
          (state?.classes || []).map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`).join('');
  }

  await chargerParents();
  _chargerConfigSynchro();

  // Écouter les mises à jour venant de la section élèves
  document.addEventListener('elimu:parents-updated', chargerParents);
}

function _remplirSelectClasses(classes) {
  const select = document.getElementById('filter-parents-classe');
  if (!select) return;
  
  const options = classes.map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`);
  select.innerHTML = `<option value="" data-i18n="common.all_classes">${t('common.all_classes')}</option>` + options.join('');
}

// ═══════════════════════════════════════════════════════════
// CHARGEMENT ET AFFICHAGE
// ═══════════════════════════════════════════════════════════

async function chargerParents() {
  const grid = document.getElementById('parents-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><div class="spinner"></div></div>';

  const recherche = document.getElementById('search-parents')?.value?.trim() || '';
  const classeId  = document.getElementById('filter-parents-classe')?.value || null;

  try {
    const result = await window.elimuAPI.getParents({ 
      recherche, 
      classeId, 
      page: _currentPage, 
      limit: _limit 
    });

    _parents = result.parents || [];
    _totalParents = result.total || 0;

    afficherCartes(_parents);
    afficherPagination();
  } catch (error) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--red-fifa);">
      ${t('common.error')} : ${esc(error.message)}</div>`;
  }
}

function afficherPagination() {
  const container = document.getElementById('parents-pagination');
  if (!container) return;

  const totalPages = Math.ceil(_totalParents / _limit);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <button class="btn btn-sm btn-secondary" ${ _currentPage === 1 ? 'disabled' : '' } id="prev-page">◀</button>
    <span style="font-size: 12px; color: var(--text-muted); align-self: center;">
      ${t('common.page')} ${_currentPage} / ${totalPages} (${_totalParents} parents)
    </span>
    <button class="btn btn-sm btn-secondary" ${ _currentPage === totalPages ? 'disabled' : '' } id="next-page">▶</button>
  `;

  container.innerHTML = html;

  document.getElementById('prev-page')?.addEventListener('click', () => {
    if (_currentPage > 1) { _currentPage--; chargerParents(); }
  });

  document.getElementById('next-page')?.addEventListener('click', () => {
    if (_currentPage < totalPages) { _currentPage++; chargerParents(); }
  });
}

function afficherCartes(parents) {
  const grid = document.getElementById('parents-grid');
  if (!grid) return;

  if (parents.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">
      ${t('common.nodata')}</div>`;
    return;
  }

  grid.innerHTML = parents.map(p => {
    const initial = (p.nom_parent || p.telephone || '?')[0].toUpperCase();
    const nbEleves = p.eleves ? p.eleves.length : 0;
    
    // On affiche juste un aperçu des enfants dans la carte
    const aperçuEleves = (p.eleves || []).slice(0, 2).map(e => `
      <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
        <span class="child-tag-mini">${esc(e.classe_nom)}</span> ${esc(e.prenom)} ${esc(e.nom)}
      </div>
    `).join('');

    return `
      <div class="parent-card animate-in" data-id="${p.id}">
        <div class="parent-card-band" style="background:linear-gradient(90deg, var(--purple-fifa), var(--blue-fifa));"></div>
        <div class="parent-card-inner btn-view-parent" data-id="${p.id}" style="cursor: pointer;">
          <div class="parent-avatar">${initial}</div>
          <div class="parent-phone">${esc(p.telephone)}</div>
          <div class="parent-name">${esc(p.nom_parent || t('parents.card_no_parent_name'))}</div>
          
          <div class="parent-children-badge">
             ${t('parents.card_children')} (${nbEleves})
          </div>
          <div style="margin-top: 8px;">
            ${aperçuEleves}
            ${nbEleves > 2 ? `<div style="font-size: 10px; color: var(--text-muted); font-style: italic; margin-top: 4px;">+ ${nbEleves - 2} ${t('common.others')}</div>` : ''}
          </div>
        </div>
        <div class="parent-card-actions">
          <button class="btn btn-sm btn-secondary btn-regen-mdp" data-id="${p.id}" style="width: 100%;">
            ${t('parents.btn_regenerate')}
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Events
  grid.querySelectorAll('.btn-view-parent').forEach(btn => {
    btn.addEventListener('click', (e) => {
      ouvrirModalParent(parseInt(btn.dataset.id));
    });
  });

  grid.querySelectorAll('.btn-regen-mdp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      genererMotDePasse(parseInt(btn.dataset.id));
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════

function ouvrirModalParent(parentId) {
  const parent = _parents.find(p => p.id === parentId);
  if (!parent) return;

  const modal = document.getElementById('modal-parent-detail');
  const avatar = document.getElementById('modal-parent-avatar');
  const phone = document.getElementById('modal-parent-phone');
  const name = document.getElementById('modal-parent-name');
  const password = document.getElementById('modal-parent-password');
  const childrenContainer = document.getElementById('modal-parent-children');

  avatar.textContent = (parent.nom_parent || parent.telephone || '?')[0].toUpperCase();
  phone.textContent = parent.telephone;
  name.textContent = parent.nom_parent || t('parents.account_details');
  
  // Initialiser masqué
  password.textContent = '••••••••';
  password.style.letterSpacing = '4px';
  password.style.color = 'var(--text-muted)';
  
  childrenContainer.innerHTML = (parent.eleves || []).map(e => `
    <div class="child-item" style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
      <span class="child-tag-mini">${esc(e.classe_nom)}</span>
      <span style="font-size: 13px; font-weight: 500;">${esc(e.prenom)} ${esc(e.nom)}</span>
    </div>
  `).join('');

  // Boutons modale
  const btnRegen = document.getElementById('btn-modal-regen-mdp');
  const btnToggle = document.getElementById('btn-toggle-password');

  // SÉCURITÉ : On cache le bouton "Afficher" car on ne stocke plus le mot de passe (Option 2)
  if (btnToggle) btnToggle.style.display = 'none';

  btnRegen.onclick = () => genererMotDePasse(parentId, true);
  
  modal.style.display = 'flex';
}

async function genererMotDePasse(parentId, isFromModal = false) {
  if (!confirm(t('parents.confirm_regenerate') || 'Voulez-vous générer un nouvel accès ? L\'ancien sera invalidé.')) return;
  
  try {
    const res = await window.elimuAPI.generateParentPassword(parentId);
    if (res.success) {
      const p = _parents.find(x => x.id === parentId);
      if (p) {
        // En mémoire seulement pour cette session
        p.mot_de_passe_clair = res.password;
        window.elimuAPI.logAudit('GENERATE_PARENT_PASSWORD', `Accès réinitialisé pour parent ${p.telephone}`, _state?.user?.id);
      }

      if (isFromModal) {
        const password = document.getElementById('modal-parent-password');
        password.textContent = res.password;
        password.style.letterSpacing = '2px';
        password.style.color = 'var(--purple-fifa)';
        
        // Notification visuelle forte
        showToast(t('parents.password_generated_once') || 'Nouveau mot de passe généré. Notez-le bien !', 'success');
      } else {
        const msg = (t('parents.generate_password_message') || 'Voici les nouveaux identifiants :\n\nTéléphone : {phone}\nMot de passe : {password}\n\nNotez ce code, il ne sera plus affiché.')
          .replace('{phone}', p.telephone)
          .replace('{password}', res.password);
        alert(`${t('parents.generate_password_title') || 'Accès Réinitialisé'}\n\n${msg}`);
      }

      // 🔄 AUTOMATISATION : Lancer l'impression immédiatement
      await imprimerFiche(parentId, res.password);

    } else {
      alert(` ${t('common.error')} : ${res.error}`);
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function imprimerFiche(parentId, passwordOverride = null) {
  try {
    const lang = window.getCurrentGenLocale();
    const res = await window.elimuAPI.printParentCard(parentId, lang, passwordOverride);
    if (res.success) {
      showToast(t('parents.toast_print_success') || 'Fiche enregistrée.', 'success');
    } else if (!res.canceled) {
      showToast(res.error, 'error');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// SYNCHRONISATION
// ═══════════════════════════════════════════════════════════

// ── Loader Global ─────────────────────────────────────────
function showSyncLoader(title = '', text = 'Veuillez patienter...', progress = null, countText = '') {
  const loader = document.getElementById('sync-global-loader');
  const tit = document.getElementById('sync-loader-title');
  const txt = document.getElementById('sync-loader-text');
  const bar = document.getElementById('sync-loader-bar');
  const pct = document.getElementById('sync-loader-percent');
  const cnt = document.getElementById('sync-loader-count');
  const progContainer = document.getElementById('sync-loader-progress-container');
  const statsContainer = document.getElementById('sync-loader-stats');

  if (loader) {
    loader.style.display = 'flex';
    if (tit) tit.textContent = title;
    if (txt) txt.textContent = text;
    
    // Afficher la progression seulement si on a une valeur > 0
    if (progress !== null && progress > 0) {
      if (progContainer) progContainer.style.display = 'block';
      if (statsContainer) statsContainer.style.display = 'flex';
      if (bar) bar.style.width = progress + '%';
      if (pct) pct.textContent = Math.round(progress) + '%';
      if (cnt) cnt.textContent = countText;
    } else {
      // Sinon on cache la barre pour ne pas rester bloqué à 0%
      if (progContainer) progContainer.style.display = 'none';
      if (statsContainer) statsContainer.style.display = 'none';
    }
  }
}

function hideSyncLoader() {
  const loader = document.getElementById('sync-global-loader');
  if (loader) loader.style.display = 'none';
}

async function exporterVersPortail() {
  const btn = document.getElementById('btn-start-sync');
  const status = document.getElementById('sync-status');
  
  const params = await window.elimuAPI.getParametres();
  if (!params.portail_url || !params.portail_api_key) {
    showToast(t('common.error') + ' : ' + t('parents.sync_error_config'), 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = ' ' + t('common.processing');
  if (status) {
    status.style.display = 'block';
    status.className = 'info-badge';
    status.textContent = t('common.processing');
  }

  // Utilisation du loader sans barre au début (car on est à 0%)
  showSyncLoader(t('parents.sync_btn_export') || 'Synchronisation', t('common.processing'));

  const onProgress = (data) => {
    if (data.type === 'portalSync') {
      // La barre s'affichera d'elle-même dès que data.percent > 0
      showSyncLoader(t('parents.sync_btn_export') || 'Synchronisation', data.message, data.percent);
    }
  };
  window.elimuAPI.onExportProgress(onProgress);

  try {
    const url = document.getElementById('sync-url').value;
    const apiKey = document.getElementById('sync-api-key').value;
    const res = await window.elimuAPI.exportToPortal(url, apiKey);
    
    if (res.success) {
      if (status) {
        status.className = 'success-badge';
        status.textContent = t('parents.sync_success');
      }
      window.elimuAPI.logAudit('SYNC_PORTAL', 'Synchronisation réussie avec le portail', _state?.user?.id);
      const lastSyncEl = document.getElementById('last-sync-date');
      if (lastSyncEl) lastSyncEl.textContent = new Date().toLocaleString();
      showToast(t('parents.sync_success'), 'success');
    } else {
      if (status) {
        status.className = 'error-badge';
        status.textContent = t('parents.sync_error').replace('{error}', res.error);
      }
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    window.elimuAPI.removeExportProgressListener();
    hideSyncLoader();
    btn.disabled = false;
    btn.textContent = t('parents.sync_btn_export');
  }
}

async function restaurerDepuisPortail() {
  if (!confirm(t('parents.sync_confirm_restore') || "ATTENTION : Cela va supprimer toutes vos données locales et les remplacer par celles du cloud. Voulez-vous continuer ?")) {
    return;
  }

  const btn = document.getElementById('btn-restore-sync');
  const status = document.getElementById('sync-status');
  
  const url = document.getElementById('sync-url').value;
  const apiKey = document.getElementById('sync-api-key').value;

  if (!url || !apiKey) {
    showToast(t('parents.sync_error_config'), 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = '...';
  if (status) {
    status.style.display = 'block';
    status.className = 'info-badge';
    status.textContent = t('common.processing');
  }

  // Utilisation du loader global standardisé
  showSyncLoader(t('parents.sync_btn_restore') || 'Restauration Cloud', t('common.processing'), 0);

  const onProgress = (data) => {
    if (data.type === 'portalRestore') {
      showSyncLoader(t('parents.sync_btn_restore') || 'Restauration Cloud', data.message, data.percent);
    }
  };
  window.elimuAPI.onExportProgress(onProgress);

  try {
    const res = await window.elimuAPI.restoreFromPortal(url, apiKey);
    if (res.success) {
      if (status) {
        status.className = 'success-badge';
        status.textContent = t('parents.sync_restore_success') || "Restauration terminée !";
      }
      
      showSyncLoader(t('parents.sync_btn_restore') || 'Restauration Cloud', 'Finalisation et redémarrage...', 100);

      alert(t('parents.sync_restore_alert') || "Restauration réussie. L'application va redémarrer pour appliquer les changements.");
      
      // Redémarrage propre (ferme les connexions DB et relance l'app)
      if (window.elimuAPI.relaunchApp) {
        window.elimuAPI.relaunchApp();
      } else {
        window.location.reload();
      }
    } else {
      if (status) {
        status.className = 'error-badge';
        status.textContent = t('parents.sync_error').replace('{error}', res.error);
      }
      hideSyncLoader();
    }
  } catch (error) {
    hideSyncLoader();
    showToast(error.message, 'error');
  } finally {
    window.elimuAPI.removeExportProgressListener();
    btn.disabled = false;
    btn.textContent = t('parents.sync_btn_restore') || "Restaurer";
  }
}

async function _chargerConfigSynchro() {
  try {
    const params = await window.elimuAPI.getParametres();
    if (params) {
      document.getElementById('sync-url').value = params.portail_url || '';
      document.getElementById('sync-api-key').value = params.portail_api_key || '';
      if (params.derniere_synchro_portail) {
        document.getElementById('last-sync-date').textContent = new Date(params.derniere_synchro_portail).toLocaleString();
      }
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// ÉVÉNEMENTS
// ═══════════════════════════════════════════════════════════

function _setupEvents() {
  // Modale
  const modal = document.getElementById('modal-parent-detail');
  const closeBtn = modal?.querySelector('.close-modal');
  if (closeBtn) {
    closeBtn.onclick = () => modal.style.display = 'none';
  }
  window.onclick = (event) => {
    if (event.target === modal) modal.style.display = 'none';
  };

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      
      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      const content = document.getElementById(tabId);
      if (content) content.style.display = 'block';
    });
  });

  // Recherche
  let searchTimer;
  const searchInput = document.getElementById('search-parents');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        _currentPage = 1;
        chargerParents();
      }, 400);
    });
  }

  // Filtre par classe
  const filterClasse = document.getElementById('filter-parents-classe');
  if (filterClasse) {
    filterClasse.addEventListener('change', () => {
      _currentPage = 1;
      chargerParents();
    });
  }

  // Synchro
  document.getElementById('btn-start-sync')?.addEventListener('click', exporterVersPortail);
  document.getElementById('btn-restore-sync')?.addEventListener('click', restaurerDepuisPortail);
  
  document.getElementById('btn-save-sync-config')?.addEventListener('click', async () => {
    const url = document.getElementById('sync-url').value.trim();
    const apiKey = document.getElementById('sync-api-key').value.trim();
    
    await window.elimuAPI.saveParametres({
      'portail_url': url,
      'portail_api_key': apiKey
    });
    showToast(t('common.save_success'), 'success');
  });
  
  document.getElementById('btn-test-sync-conn')?.addEventListener('click', async () => {
    const url = document.getElementById('sync-url').value.trim();
    const apiKey = document.getElementById('sync-api-key').value.trim();
    
    if (!url || !apiKey) {
      showToast(t('parents.sync_error_config'), 'warning');
      return;
    }

    const btn = document.getElementById('btn-test-sync-conn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳...';

    try {
      const res = await window.elimuAPI.testPortalConnection(url, apiKey);
      if (res.success) {
        showToast(t('parents.sync_test_success'), 'success');
      } else {
        showToast(res.error || t('parents.sync_error'), 'error');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  document.getElementById('btn-generate-all-passwords')?.addEventListener('click', async () => {
    if (confirm(t('parents.confirm_generate_all'))) {
      const btn = document.getElementById('btn-generate-all-passwords');
      btn.disabled = true;
      
      // Reset et Affichage loader standardisé
      showSyncLoader(
        t('parents.generating') || 'Génération et Export', 
        t('common.initializing') || 'Initialisation...', 
        0, 
        '0 / ?'
      );
      
      // Écouter la progression
      window.elimuAPI.onParentGenerationProgress((data) => {
        showSyncLoader(
          t('parents.generating') || 'Génération et Export',
          t('common.processing') || 'Traitement en cours...',
          data.percent,
          `${data.current} / ${data.total}`
        );
      });
      
      try {
        const res = await window.elimuAPI.generateAllParentPasswords();
        if (res.success) {
          let msg = t('parents.generate_all_success').replace('{count}', res.count);
          if (res.pdfGenerated) {
            msg += "\n\n" + (t('parents.pdf_bulk_success') || "Le fichier PDF contenant les accès a été enregistré avec succès.");
          }
          showToast(msg, 'success');
          await chargerParents();
        } else {
          showToast(t('common.error') + ' : ' + res.error, 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        window.elimuAPI.removeParentGenerationProgressListener();
        hideSyncLoader();
        btn.disabled = false;
        btn.textContent = t('parents.btn_generate_all');
      }
    }
  });
}
