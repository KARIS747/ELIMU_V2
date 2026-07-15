import { t } from '../../../locales/index.js';
import { chargerListeBackups } from './sauvegarde.js';

let anneesScolaires  = [];
let anneeEditId      = null;
let _state           = null;
let _anneesEventsOk  = false;

export async function init(state) {
  _state = state;
}

/**
 * Charge la liste des années depuis le backend et rafraîchit l'affichage.
 */
export async function chargerAnneesScolaires() {
  const container = document.getElementById('annees-list');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:32px;">
    <div class="spinner" style="margin:0 auto;"></div></div>`;

  try {
    const rows = await window.elimuAPI.getAnneesScolaires?.({ includeArchived: true });
    anneesScolaires = Array.isArray(rows) ? rows : [];

    const active = anneesScolaires.find(a => a.active);
    const banner = document.getElementById('annees-active-label');
    if (banner) banner.textContent = active?.libelle || t('params.annees_none');

    afficherAnneesScolaires();
  } catch (err) {
    console.error('Erreur chargerAnneesScolaires:', err);
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--red-fifa);">
      ❌ ${t('common.error')} : ${esc(err.message)}</div>`;
  }
}

/**
 * Rendu optimisé des années scolaires (DocumentFragment + 60FPS)
 */
function afficherAnneesScolaires() {
  const container = document.getElementById('annees-list');
  if (!container) return;

  if (!anneesScolaires.length) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">
      ${t('params.annees_list_empty')}</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  
  // Création de la structure de table
  const tableWrapper = document.createElement('div');
  tableWrapper.style.overflowX = 'auto';
  
  const table = document.createElement('table');
  table.style.cssText = `width:100%; border-collapse:collapse; font-size:13px;`;
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">${t('common.name')}</th>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">Début</th>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">Fin</th>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">Statut</th>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">Archive</th>
      <th style="text-align:left; padding:10px 12px; background:var(--bg-secondary);
                 color:var(--text-muted); font-weight:600; font-size:11px;
                 text-transform:uppercase; letter-spacing:0.5px;
                 border-bottom:1px solid var(--border-color);">Actions</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  
  anneesScolaires.forEach(a => {
    const tr = document.createElement('tr');
    
    const badgeActif = a.active
      ? `<span style="background:rgba(0,230,118,0.15); border:1px solid rgba(0,230,118,0.35);
                     color:var(--green-fifa); font-size:11px; padding:2px 9px; border-radius:10px;">${t('params.annees_badge_active')}</span>`
      : '';
    const badgeArchive = a.archived
      ? `<span style="background:rgba(255,183,77,0.1); border:1px solid rgba(255,183,77,0.3);
                     color:var(--yellow-fifa); font-size:11px; padding:2px 9px; border-radius:10px;">${t('params.annees_badge_archived')}</span>`
      : '';

    const btnActiverHtml = !a.active
      ? `<button class="btn btn-sm btn-secondary btn-annee-activer" data-id="${a.id}"
                 title="${t('params.annees_btn_activate')}" style="padding:4px 10px;">${t('params.annees_btn_activate')}</button>`
      : `<span style="color:var(--green-fifa); font-size:13px; padding:4px 10px;">${t('params.annees_status_current')}</span>`;

    tr.innerHTML = `
      <td style="font-weight:700; color:var(--text-primary); font-size:14px; padding:10px 12px; border-bottom:1px solid var(--border-color);">
        ${esc(a.libelle)}
      </td>
      <td style="font-size:12px; color:var(--text-muted); padding:10px 12px; border-bottom:1px solid var(--border-color);">${esc(a.date_debut || '—')}</td>
      <td style="font-size:12px; color:var(--text-muted); padding:10px 12px; border-bottom:1px solid var(--border-color);">${esc(a.date_fin   || '—')}</td>
      <td style="padding:10px 12px; border-bottom:1px solid var(--border-color);">${badgeActif}</td>
      <td style="padding:10px 12px; border-bottom:1px solid var(--border-color);">${badgeArchive}</td>
      <td style="padding:10px 12px; border-bottom:1px solid var(--border-color);">
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          ${btnActiverHtml}
          <button class="btn btn-sm btn-secondary btn-annee-edit" data-id="${a.id}"
                  style="padding:4px 10px;">${t('common.edit')}</button>
          ${!a.active
            ? `
              <button class="btn btn-sm btn-danger btn-annee-delete" data-id="${a.id}"
                       style="padding:4px 8px;" title="${t('common.delete')} (Archive)">A</button>
              <button class="btn btn-sm btn-danger btn-annee-hard-delete" data-id="${a.id}"
                       style="padding:4px 8px; background:#d32f2f;" title="Supprimer DEFINITIVEMENT">X</button>
              `
            : ''}
        </div>
      </td>
    `;

    // Listeners
    const btnActiver = tr.querySelector('.btn-annee-activer');
    if (btnActiver) btnActiver.addEventListener('click', () => activerAnnee(a.id));
    
    tr.querySelector('.btn-annee-edit').addEventListener('click', () => ouvrirModalAnnee(a.id));
    
    const btnDel = tr.querySelector('.btn-annee-delete');
    if (btnDel) btnDel.addEventListener('click', () => supprimerAnnee(a.id));
    
    const btnHardDel = tr.querySelector('.btn-annee-hard-delete');
    if (btnHardDel) btnHardDel.addEventListener('click', () => supprimerAnneeDefinitif(a.id));

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  fragment.appendChild(tableWrapper);

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

async function activerAnnee(id) {
  if (!confirm(t('params.annees_activate_confirm'))) return;
  try {
    const result = await window.elimuAPI.setAnneeActive?.({ id });
    if (result?.success) {
      showToast(t('params.annees_activate_success').replace('{name}', esc(result.libelle)), 'success');
      // Redémarrage complet via le main process
      setTimeout(() => {
        window.elimuAPI.relaunchApp?.();
      }, 1000);
    } else {
      showToast('❌ ' + (result?.error || t('common.error')), 'error');
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

export function ouvrirModalAnnee(id = null) {
  anneeEditId = id;
  const modal  = document.getElementById('modal-annee');
  const titre  = document.getElementById('modal-annee-titre');
  const errEl  = document.getElementById('modal-annee-error');

  if (errEl) errEl.style.display = 'none';

  if (id) {
    const a = anneesScolaires.find(x => x.id === id);
    if (!a) return;
    titre.textContent = `${t('common.edit')} : ${a.libelle}`;
    document.getElementById('annee-libelle').value   = a.libelle;
    document.getElementById('annee-debut').value     = a.date_debut || '';
    document.getElementById('annee-fin').value       = a.date_fin   || '';
    document.getElementById('annee-archived').checked = !!a.archived;
  } else {
    titre.textContent = t('params.annees_modal_add');
    document.getElementById('annee-libelle').value   = '';
    document.getElementById('annee-debut').value     = '';
    document.getElementById('annee-fin').value       = '';
    document.getElementById('annee-archived').checked = false;
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('annee-libelle')?.focus(), 60);
}

function fermerModalAnnee() {
  const modal = document.getElementById('modal-annee');
  if (modal) modal.style.display = 'none';
  anneeEditId = null;
}

async function supprimerAnnee(id) {
  const a = anneesScolaires.find(x => x.id === id);
  if (!confirm(t('params.annees_delete_confirm').replace('{name}', esc(a?.libelle)))) return;
  try {
    const result = await window.elimuAPI.deleteAnneeScolaire?.({ id });
    if (result?.success) {
      const msg = result.archived
        ? t('params.annees_toast_archived').replace('{name}', esc(a?.libelle))
        : t('params.annees_toast_deleted').replace('{name}', esc(a?.libelle));
      showToast(msg, 'success');
      await chargerAnneesScolaires();
    } else {
      showToast('❌ ' + (result?.error || t('common.error')), 'error');
    }
  } catch (err) {
    showToast('❌ ' + err.message, 'error');
  }
}

async function supprimerAnneeDefinitif(id) {
  const a = anneesScolaires.find(x => x.id === id);
  if (!a) return;

  const modal = document.getElementById('modal-hard-delete-confirm');
  const input = document.getElementById('hard-delete-input');
  const label = document.getElementById('hard-delete-year-name');
  const btnCancel = document.getElementById('hard-delete-cancel');
  const btnConfirm = document.getElementById('hard-delete-confirm-btn');

  if (!modal || !input || !btnConfirm) {
    if (!confirm(`🚨 ATTENTION : Suppression DÉFINITIVE de l'année "${a.libelle}" ?`)) return;
    try {
      const result = await window.elimuAPI.deleteAnneeScolaireDefinitive?.({ id });
      if (result?.success) {
        showToast(`✅ Année "${esc(a.libelle)}" supprimée.`, 'success');
        await chargerAnneesScolaires();
      }
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
    return;
  }

  label.textContent = a.libelle;
  input.value = '';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 60);

  // Nettoyage des anciens écouteurs via clonage (méthode simple pour éviter les doublons)
  const newBtnConfirm = btnConfirm.cloneNode(true);
  btnConfirm.parentNode.replaceChild(newBtnConfirm, btnConfirm);

  const newBtnCancel = btnCancel.cloneNode(true);
  btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

  const fermer = () => { modal.style.display = 'none'; };

  newBtnCancel.addEventListener('click', fermer);
  modal.addEventListener('click', (e) => { if (e.target === modal) fermer(); });

  newBtnConfirm.addEventListener('click', async () => {
    const validation = input.value.trim();
    if (validation !== a.libelle) {
      input.style.borderColor = '#d32f2f';
      input.style.boxShadow = '0 0 10px rgba(211,47,47,0.3)';
      setTimeout(() => {
        input.style.borderColor = '#d32f2f50';
        input.style.boxShadow = 'none';
      }, 1000);
      return;
    }

    newBtnConfirm.disabled = true;
    newBtnConfirm.textContent = '⏳';

    try {
      const result = await window.elimuAPI.deleteAnneeScolaireDefinitive?.({ id });
      newBtnConfirm.disabled = false;
      newBtnConfirm.textContent = 'DÉTRUIRE LES DONNÉES';

      if (result?.success) {
        fermer();
        showToast(`✅ Année "${esc(a.libelle)}" supprimée définitivement (${result.totalDeleted} enregistrements).`, 'success');
        await chargerAnneesScolaires();
      } else {
        showToast('❌ ' + (result?.error || 'Erreur lors de la suppression'), 'error');
      }
    } catch (err) {
      newBtnConfirm.disabled = false;
      showToast('❌ ' + err.message, 'error');
    }
  });
}

export function resetEventsAnnees() {
  _anneesEventsOk = false;
}

export function attacherEvenementsAnnees() {
  if (_anneesEventsOk) return;
  _anneesEventsOk = true;

  document.getElementById('btn-add-annee')?.addEventListener('click', () => ouvrirModalAnnee(null));
  document.getElementById('modal-annee-cancel')?.addEventListener('click', fermerModalAnnee);

  document.getElementById('modal-annee')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-annee')) fermerModalAnnee();
  });

  document.getElementById('modal-annee-save')?.addEventListener('click', async () => {
    const errEl   = document.getElementById('modal-annee-error');
    const libelle  = document.getElementById('annee-libelle')?.value?.trim();
    const debut    = document.getElementById('annee-debut')?.value || null;
    const fin      = document.getElementById('annee-fin')?.value   || null;
    const archived = document.getElementById('annee-archived')?.checked;

    if (!libelle) {
      if (errEl) {
        errEl.textContent    = '⚠️ ' + t('params.annees_error_libelle_empty');
        errEl.style.display  = 'block';
      }
      return;
    }

    const btnSave = document.getElementById('modal-annee-save');
    btnSave.disabled    = true;
    btnSave.textContent = '⏳ ' + t('common.processing');

    try {
      let result;
      if (anneeEditId) {
        result = await window.elimuAPI.updateAnneeScolaire?.({
          id: anneeEditId, libelle, date_debut: debut, date_fin: fin, archived
        });
      } else {
        result = await window.elimuAPI.addAnneeScolaire?.({
          libelle, date_debut: debut, date_fin: fin
        });
      }

      btnSave.disabled    = false;
      btnSave.textContent = t('common.save');

      if (result?.success) {
        fermerModalAnnee();
        await chargerAnneesScolaires();
        showToast(anneeEditId ? t('params.annees_save_success') : t('params.annees_add_success'), 'success');
      } else {
        if (errEl) {
          errEl.textContent   = '❌ ' + (result?.error || t('common.error'));
          errEl.style.display = 'block';
        }
      }
    } catch (err) {
      btnSave.disabled = false;
      if (errEl) {
        errEl.textContent = '❌ ' + err.message;
        errEl.style.display = 'block';
      }
    }
  });

  // Procédure "Nouvelle Année Scolaire" (Reset)
  document.getElementById('btn-nouvelle-annee')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('nouvelle-annee-status');
    if (!confirm(t('params.new_year_confirm_1'))) return;
    if (!confirm(t('params.new_year_confirm_2'))) return;
    
    const btn = document.getElementById('btn-nouvelle-annee');
    btn.disabled = true;
    btn.textContent = '⏳ ' + t('params.new_year_status_waiting');
    if (statusEl) statusEl.style.display = 'none';

    try {
      const result = await window.elimuAPI.nouvelleAnneeScolaire(_state?.user?.id);
      btn.disabled = false;
      btn.textContent = '🔄 ' + t('params.new_year_btn_label');
      if (statusEl) {
        statusEl.style.display = 'block';
        if (result?.success) {
          statusEl.className = 'backup-info success';
          const nomBackup = result.backupPath?.split(/[\/\\]/).pop() || '';
          statusEl.innerHTML =
            `✅ ${t('params.new_year_result_success')}<br>
             <span style="font-size:11px; color:var(--text-muted);">
               ${t('params.new_year_result_backup')} : ${esc(nomBackup)}<br>
               ${t('params.new_year_result_hint')}
             </span>`;
          showToast(t('params.new_year_toast_success'), 'success');
          chargerListeBackups();
        } else {
          statusEl.className = 'backup-info';
          statusEl.textContent = `❌ ${t('common.error')} : ${esc(result?.error || t('common.waiting'))}`;
          showToast(t('common.error'), 'error');
        }
      }
    } catch (err) {
      btn.disabled = false;
      showToast('❌ ' + err.message, 'error');
    }
  });

  // ── Préparateur nouvelle année ───────────────────────────
  document.getElementById('btn-preparer-annee')?.addEventListener('click', () => ouvrirPreparateur());

  document.getElementById('preparer-cancel')?.addEventListener('click', fermerPreparateur);
  document.getElementById('preparer-close-x')?.addEventListener('click', fermerPreparateur);
  document.getElementById('modal-preparer-annee')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-preparer-annee')) fermerPreparateur();
  });

  document.getElementById('preparer-source')?.addEventListener('change', construireTableauMapping);
  document.getElementById('btn-preparer-auto')?.addEventListener('click', remplirAuto);
  document.getElementById('btn-preparer-redoublement')?.addEventListener('click', ouvrirRedoublement);
  document.getElementById('preparer-launch')?.addEventListener('click', lancerMigration);

  // Modale redoublement
  document.getElementById('redoublement-cancel')?.addEventListener('click', fermerRedoublement);
  document.getElementById('redoublement-save')?.addEventListener('click', sauvegarderRedoublement);

  // Modale créer classe inline
  document.getElementById('inline-classe-cancel')?.addEventListener('click', fermerCreateClasse);
  document.getElementById('inline-classe-save')?.addEventListener('click', sauvegarderClasseInline);
}

// ============================================================
// PRÉPARATEUR NOUVELLE ANNÉE SCOLAIRE (Migration d'élèves)
// ============================================================

let _toutesClasses    = [];
let _seuilRedoublement = 10;
let _redoublementActif = false;
let _pendingSelectId   = null;

async function ouvrirPreparateur() {
  const modal = document.getElementById('modal-preparer-annee');
  if (!modal) return;

  ['preparer-error', 'preparer-result', 'preparer-progress'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('preparer-launch').disabled = false;

  const selectSrc  = document.getElementById('preparer-source');
  const selectDest = document.getElementById('preparer-dest');
  if (selectSrc && selectDest) {
    selectSrc.innerHTML  = '';
    selectDest.innerHTML = '';

    const rows = anneesScolaires.length ? anneesScolaires
      : (await window.elimuAPI.getAnneesScolaires?.({ includeArchived: true }) || []);

    rows.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.libelle;
      selectSrc.appendChild(opt.cloneNode(true));
      selectDest.appendChild(opt);
    });

    const active = rows.find(a => a.active);
    if (active) selectSrc.value = active.id;

    const sorted = [...rows].sort((a, b) => b.id - a.id);
    const dest = sorted.find(a => !a.active) || sorted[0];
    if (dest) selectDest.value = dest.id;
  }

  await chargerClassesPourMapping();
  modal.style.display = 'flex';
}

function fermerPreparateur() {
  const modal = document.getElementById('modal-preparer-annee');
  if (modal) modal.style.display = 'none';
}

async function chargerClassesPourMapping() {
  try {
    const classes = await window.elimuAPI.getClasses?.();
    _toutesClasses = Array.isArray(classes) ? classes : [];
    construireTableauMapping();
  } catch (err) { console.error(err); }
}

function construireTableauMapping() {
  const container = document.getElementById('preparer-mapping-container');
  if (!container) return;

  if (!_toutesClasses.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:48px 20px; color:var(--text-muted);
                  font-size:14px; background:var(--bg-secondary); border-radius:16px; border:1px dashed var(--border-color);">
        <div style="font-size:32px; margin-bottom:12px;">📂</div>
        Aucune classe trouvée.
      </div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  const header = document.createElement('div');
  header.style.cssText = `display:grid; grid-template-columns:1fr 40px 1.2fr; padding:0 18px 8px; font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;`;
  header.innerHTML = `<span>Classe actuelle</span><span></span><span>Promotion vers</span>`;
  fragment.appendChild(header);

  const optsHtml = _toutesClasses.map(d =>
    `<option value="${d.id}">${esc(d.nom_classe)}${d.niveau ? ' — ' + esc(d.niveau) : ''}</option>`
  ).join('');

  _toutesClasses.forEach(c => {
    const row = document.createElement('div');
    row.style.cssText = `display:grid; grid-template-columns:1fr 40px 1.2fr; align-items:center; gap:0; 
                         background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; 
                         margin-bottom:8px; overflow:hidden; transition:all 0.2s;`;
    
    row.onmouseover = () => { row.style.borderColor = 'var(--blue-fifa)'; row.style.transform = 'translateX(4px)'; };
    row.onmouseout = () => { row.style.borderColor = 'var(--border-color)'; row.style.transform = 'none'; };

    row.innerHTML = `
      <div style="padding:14px 18px; display:flex; flex-direction:column; gap:2px;">
        <span style="font-size:14px; font-weight:700; color:var(--text-primary);">${esc(c.nom_classe)}</span>
        ${c.niveau ? `<span style="font-size:11px; color:var(--text-muted); font-weight:500; text-transform:uppercase;">${esc(c.niveau)}</span>` : ''}
      </div>
      <div style="display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:14px;">➜</div>
      <div style="padding:10px 14px; background:rgba(255,255,255,0.02); border-left:1px solid var(--border-color);">
        <select class="input select-dest-classe" data-source-id="${c.id}"
                style="width:100%; font-size:13px; padding:8px 12px; height:38px; background:var(--bg-secondary); border-radius:8px; border-color:var(--border-color);">
          <option value="">— Choisir destination —</option>
          <optgroup label="Classes existantes">${optsHtml}</optgroup>
          <optgroup label="Actions spéciales">
            <option value="archive" style="color:var(--yellow-fifa);">📦 Archiver (Fin de cycle)</option>
            <option value="__new__" style="color:var(--blue-fifa);">➕ Créer une nouvelle classe...</option>
          </optgroup>
        </select>
      </div>
    `;

    const sel = row.querySelector('.select-dest-classe');
    sel.addEventListener('change', () => {
      if (sel.value === '__new__') {
        _pendingSelectId = c.id;
        ouvrirCreateClasse();
      }
    });

    fragment.appendChild(row);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

function suggererClasseDestination(nomSource) {
  const match = nomSource.match(/^(\D*)(\d+)(ème|e|eme)?(\s?.*)$/i);
  if (!match) return null;
  const prefixe = match[1];
  const num     = parseInt(match[2]);
  const suffixe = match[3] || '';
  const reste   = match[4];
  const cibleNum = num - 1;
  if (cibleNum < 1) return null;
  const candidat = `${prefixe}${cibleNum}${suffixe}${reste}`.trim().toLowerCase();
  return _toutesClasses.find(c => c.nom_classe.trim().toLowerCase() === candidat) || null;
}

function remplirAuto() {
  document.querySelectorAll('.select-dest-classe').forEach(sel => {
    const sourceId = parseInt(sel.dataset.sourceId);
    const source   = _toutesClasses.find(c => c.id === sourceId);
    if (!source) return;
    const suggestion = suggererClasseDestination(source.nom_classe);
    sel.value = suggestion ? suggestion.id : 'archive';
  });
}

// ── Redoublement & Création Inline ───────────────────────────

function ouvrirRedoublement() {
  const modal = document.getElementById('modal-redoublement');
  if (!modal) return;
  document.getElementById('redoublement-actif').checked = _redoublementActif;
  document.getElementById('redoublement-seuil').value = _seuilRedoublement;
  document.getElementById('redoublement-seuil-group').style.display = _redoublementActif ? '' : 'none';
  modal.style.display = 'flex';

  document.getElementById('redoublement-actif').onchange = (e) => {
    document.getElementById('redoublement-seuil-group').style.display = e.target.checked ? '' : 'none';
  };
}

function fermerRedoublement() {
  const modal = document.getElementById('modal-redoublement');
  if (modal) modal.style.display = 'none';
}

function sauvegarderRedoublement() {
  _redoublementActif  = document.getElementById('redoublement-actif').checked;
  _seuilRedoublement  = parseFloat(document.getElementById('redoublement-seuil').value) || 10;
  fermerRedoublement();
  const badge = document.getElementById('redoublement-badge');
  if (badge) {
    badge.textContent = `Redoublement : seuil ${_seuilRedoublement}/20`;
    badge.style.display = _redoublementActif ? 'inline-block' : 'none';
  }
}

function ouvrirCreateClasse() {
  const modal = document.getElementById('modal-create-classe-inline');
  if (!modal) return;
  document.getElementById('inline-classe-nom').value = '';
  document.getElementById('inline-classe-niveau').value = '';
  const errEl = document.getElementById('inline-classe-error');
  if (errEl) errEl.style.display = 'none';
  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('inline-classe-nom')?.focus(), 60);
}

function fermerCreateClasse() {
  const modal = document.getElementById('modal-create-classe-inline');
  if (modal) modal.style.display = 'none';
  if (_pendingSelectId) {
    const sel = document.querySelector(`.select-dest-classe[data-source-id="${_pendingSelectId}"]`);
    if (sel) sel.value = '';
    _pendingSelectId = null;
  }
}

async function sauvegarderClasseInline() {
  const nom = document.getElementById('inline-classe-nom')?.value?.trim();
  const niveau = document.getElementById('inline-classe-niveau')?.value?.trim();
  const errEl = document.getElementById('inline-classe-error');

  if (!nom) {
    if (errEl) { errEl.textContent = 'Le nom est obligatoire.'; errEl.style.display = 'block'; }
    return;
  }

  const btn = document.getElementById('inline-classe-save');
  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const result = await window.elimuAPI.addClass?.({ nom_classe: nom, niveau, matieres: [] });
    btn.disabled = false;
    btn.textContent = 'Créer';

    if (result?.success) {
      _toutesClasses.push({ id: result.id, nom_classe: nom, niveau });
      construireTableauMapping();
      if (_pendingSelectId) {
        const sel = document.querySelector(`.select-dest-classe[data-source-id="${_pendingSelectId}"]`);
        if (sel) sel.value = result.id;
        _pendingSelectId = null;
      }
      document.getElementById('modal-create-classe-inline').style.display = 'none';
      showToast('Classe créée', 'success');
    } else {
      if (errEl) { errEl.textContent = '❌ ' + (result?.error || 'Erreur'); errEl.style.display = 'block'; }
    }
  } catch (err) {
    btn.disabled = false;
    if (errEl) { errEl.textContent = '❌ ' + err.message; errEl.style.display = 'block'; }
  }
}

async function lancerMigration() {
  const sourceAnneeId = parseInt(document.getElementById('preparer-source')?.value);
  const destAnneeId   = parseInt(document.getElementById('preparer-dest')?.value);
  const errEl  = document.getElementById('preparer-error');
  const resEl  = document.getElementById('preparer-result');

  if (errEl) errEl.style.display = 'none';
  if (resEl) resEl.style.display = 'none';

  if (!sourceAnneeId || !destAnneeId || sourceAnneeId === destAnneeId) {
    if (errEl) { errEl.textContent = '⚠️ Sélectionnez deux années différentes.'; errEl.style.display = 'block'; }
    return;
  }

  const mapping = {};
  document.querySelectorAll('.select-dest-classe').forEach(sel => {
    if (!sel.value) return;
    mapping[sel.dataset.sourceId] = sel.value === 'archive' ? { type: 'archive' } : { type: 'classe', targetId: parseInt(sel.value) };
  });

  if (!Object.keys(mapping).length) {
    if (errEl) { errEl.textContent = '⚠️ Configurez au moins une correspondance.'; errEl.style.display = 'block'; }
    return;
  }

  if (!confirm(`Lancer la migration ? Cette opération est irréversible.`)) return;

  const btn = document.getElementById('preparer-launch');
  btn.disabled = true;
  btn.textContent = '⏳ Migration en cours...';

  const progEl = document.getElementById('preparer-progress');
  const barEl = document.getElementById('preparer-progress-bar');
  if (progEl) progEl.style.display = 'block';
  if (barEl) barEl.style.width = '30%';

  try {
    const result = await window.elimuAPI.preparerNouvelleAnnee?.({
      sourceAnneeId, destAnneeId, mapping, seuilRedoublement: _seuilRedoublement, redoublementActif: _redoublementActif
    });
    btn.disabled = false;
    btn.textContent = 'Lancer la migration';
    if (barEl) barEl.style.width = '100%';

    if (result?.success) {
      if (progEl) progEl.style.display = 'none';
      
      // Affichage du succès dans la modale
      const corpsCentral = document.querySelector('#modal-preparer-annee [style*="flex:1; overflow-y:auto"]');
      const footer = document.querySelector('#modal-preparer-annee [style*="padding:24px 48px; border-top"]');
      
      if (corpsCentral) {
        corpsCentral.innerHTML = `
          <div style="text-align:center; padding:60px 20px; animation: modalIn 0.5s ease;">
            <div style="width:80px; height:80px; background:var(--green-fifa); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; font-size:40px; box-shadow:0 10px 30px rgba(0,230,118,0.3);">
              ✓
            </div>
            <h2 style="font-family:'Rajdhani',sans-serif; font-size:28px; color:var(--text-primary); margin-bottom:12px; text-transform:uppercase;">Migration Réussie !</h2>
            <p style="color:var(--text-muted); font-size:16px; margin-bottom:32px;">
              <strong>${result.nbCopies}</strong> élèves ont été transférés avec succès vers la nouvelle année scolaire.
            </p>
            <button class="btn btn-primary" style="padding:12px 32px; font-size:14px;" onclick="document.getElementById('modal-preparer-annee').style.display='none'; location.reload();">
              Terminer & Recharger
            </button>
          </div>
        `;
      }
      if (footer) footer.style.display = 'none';

      showToast(`Migration réussie : ${result.nbCopies} élève(s) copié(s)`, 'success');
    } else {
      if (progEl) progEl.style.display = 'none';
      if (errEl) { errEl.textContent = '❌ ' + (result?.error || 'Erreur'); errEl.style.display = 'block'; }
    }
  } catch (err) {
    btn.disabled = false;
    if (progEl) progEl.style.display = 'none';
    if (errEl) { errEl.textContent = '❌ ' + err.message; errEl.style.display = 'block'; }
  }
}
