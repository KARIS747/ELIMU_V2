import { t } from '../../../locales/index.js';

let _state = null;

export async function init(state) {
  _state = state;
  try {
    const params = await window.elimuAPI.getParametres();
    const folderInput = document.getElementById('backup-folder');
    if (folderInput) folderInput.value = params.backup_folder || '';
  } catch (err) { console.error(err); }

  attacherEvenementsSauvegarde();
  chargerListeBackups();
  chargerAudit();
}

export async function chargerListeBackups() {
  const container = document.getElementById('backup-liste');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:20px;"><div class="spinner" style="margin:0 auto;"></div></div>`;

  try {
    const folder = document.getElementById('backup-folder')?.value;
    const fichiers = await window.elimuAPI.backupListe(folder);

    if (!Array.isArray(fichiers) || fichiers.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('params.backups_list_empty')}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    fichiers.forEach(f => {
      const item = document.createElement('div');
      item.style.cssText = `display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border-color);`;
      
      const date = new Date(f.date).toLocaleString('fr-FR');
      const label = f.auto ? t('params.backups_type_auto') : t('params.backups_type_manual');
      const couleur = f.nom.includes('fin_annee') ? 'var(--yellow-fifa)' : 'var(--text-muted)';
      const badge = f.nom.includes('fin_annee')
        ? `<span style="background:rgba(255,183,77,0.15); border:1px solid rgba(255,183,77,0.3);
                       color:var(--yellow-fifa); font-size:10px; padding:2px 7px; border-radius:10px;
                       margin-left:6px;">${t('params.backups_badge_end_year')}</span>`
        : '';

      item.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:600; color:var(--text-primary);
                      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${esc(f.nom)}">
            ${esc(f.nom)}${badge}
          </div>
          <div style="font-size:11px; color:${couleur}; margin-top:2px;">
            ${esc(label)} · ${date}
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); flex-shrink:0; text-align:right;">
          ${f.taille} Ko
        </div>
      `;
      fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red-fifa);">❌ Error</div>`;
  }
}

export async function chargerAudit() {
  const container = document.getElementById('audit-list');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:20px;"><div class="spinner" style="margin:0 auto;"></div></div>`;

  try {
    const logs = await window.elimuAPI.getAuditLogs(50);
    if (!Array.isArray(logs) || logs.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('params.audit_list_empty')}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    logs.forEach(log => {
      const item = document.createElement('div');
      item.style.cssText = `display:flex; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid var(--border-color);`;
      const date = new Date(log.timestamp).toLocaleString('fr-FR');

      item.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; color:var(--text-primary);">${esc(log.action)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px; overflow:hidden;
                      text-overflow:ellipsis; white-space:nowrap;" title="${esc(log.details || '')}">
            ${esc(log.details || '—')}
          </div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); flex-shrink:0; text-align:right;">
          ${date}<br>
          <span style="color:var(--blue-fifa);">${esc(log.nom_utilisateur || t('common.waiting'))}</span>
        </div>
      `;
      fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });
  } catch (err) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--red-fifa);">❌ Error</div>`;
  }
}

function attacherEvenementsSauvegarde() {
  document.getElementById('btn-choose-backup-folder')?.addEventListener('click', async () => {
    try {
      const folder = await window.elimuAPI.selectBackupFolder();
      if (folder) {
        document.getElementById('backup-folder').value = folder;
        await window.elimuAPI.saveParametres({ backup_folder: folder });
        showToast(t('params.backup_folder_updated'), 'success');
      }
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  document.getElementById('btn-backup')?.addEventListener('click', async () => {
    const folder = document.getElementById('backup-folder').value;
    if (!folder) {
      showToast(t('params.backup_error_no_folder'), 'warning');
      return;
    }
    const btn = document.getElementById('btn-backup');
    const statusEl = document.getElementById('backup-status');
    btn.disabled = true;
    btn.textContent = '⏳ ' + t('params.backup_status_waiting');

    try {
      const result = await window.elimuAPI.backup(_state?.user?.id, folder);
      btn.disabled = false;
      btn.textContent = t('params.backup_create_btn');
      if (result?.success) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.className = 'backup-info success';
          statusEl.textContent = `${t('params.backup_status_success')} : ${result.path}`;
        }
        showToast(t('params.backup_toast_success'), 'success');
        chargerListeBackups();
      } else {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.className = 'backup-info';
          statusEl.textContent = `${t('common.error')} : ${result?.error || t('common.waiting')}`;
        }
        showToast(t('common.error'), 'error');
      }
    } catch (err) {
      btn.disabled = false;
      showToast('❌ ' + err.message, 'error');
    }
  });

  document.getElementById('btn-restore')?.addEventListener('click', async () => {
    if (!confirm(t('params.restore_confirm'))) return;
    const btn = document.getElementById('btn-restore');
    const statusEl = document.getElementById('restore-status');
    const folder = document.getElementById('backup-folder')?.value;

    btn.disabled = true;
    btn.textContent = t('common.processing') + '...';

    try {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'backup-info';
        statusEl.textContent = '🛡️ Sauvegarde de sécurité avant restauration...';
      }
      if (folder) await window.elimuAPI.backup(_state?.user?.id, folder);

      btn.textContent = t('params.restore_status_waiting');
      const result = await window.elimuAPI.restore(_state?.user?.id);
      btn.disabled = false;
      btn.textContent = t('params.restore_btn_label');

      if (result?.canceled) {
        if (statusEl) statusEl.style.display = 'none';
        return;
      }

      if (result?.success) {
        if (statusEl) {
          statusEl.className = 'backup-info success';
          statusEl.textContent = t('params.restore_status_success');
        }
        showToast(t('params.restore_toast_success'), 'success');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        if (statusEl) {
          statusEl.className = 'backup-info';
          statusEl.textContent = `${t('common.error')} : ${result?.error || t('common.waiting')}`;
        }
        showToast(t('common.error'), 'error');
      }
    } catch (err) {
      btn.disabled = false;
      showToast('❌ ' + err.message, 'error');
    }
  });

  document.getElementById('btn-refresh-audit')?.addEventListener('click', chargerAudit);
  document.getElementById('btn-refresh-backups')?.addEventListener('click', chargerListeBackups);
}
