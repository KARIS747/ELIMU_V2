import { t } from '../../../locales/index.js';

export async function init(state) {
  // Chargement lazy au clic sur l'onglet
}

/**
 * Traduit un code d'action brut en libellé français lisible.
 */
function traduireAction(action) {
  if (!action) return t('params.audit_action_unknown');
  const a = action.toUpperCase();
  if (a.includes('CONNEXION') || a.includes('LOGIN'))    return t('params.audit_action_login');
  if (a.includes('DECONNEXION') || a.includes('LOGOUT')) return t('params.audit_action_logout');
  if (a.includes('CREATE_USER') || (a.includes('CREAT') && a.includes('USER'))) return t('params.audit_action_create_user');
  if (a.includes('UPDATE_USER') || (a.includes('MODIF') && a.includes('USER'))) return t('params.audit_action_update_user');
  if (a.includes('DELETE_USER'))                          return t('params.audit_action_delete_user');
  if (a.includes('IMPORT'))                               return t('params.audit_action_import');
  if (a.includes('EXPORT'))                               return t('params.audit_action_export');
  if (a.includes('BACKUP') || a.includes('SAUVEGARDE'))  return t('params.audit_action_backup');
  if (a.includes('RESTORE') || a.includes('RESTAUR'))    return t('params.audit_action_restore');
  if (a.includes('PAIEMENT') || a.includes('PAYMENT'))   return t('params.audit_action_payment');
  if (a.includes('NOTE') && a.includes('ADD'))           return t('params.audit_action_add_note');
  if (a.includes('NOTE') && a.includes('UPDATE'))        return t('params.audit_action_update_note');
  if (a.includes('NOTE') && a.includes('DELETE'))        return t('params.audit_action_delete_note');
  if (a.includes('ELEVE') && a.includes('ADD'))          return t('params.audit_action_add_eleve');
  if (a.includes('ELEVE') && a.includes('UPDATE'))       return t('params.audit_action_update_eleve');
  if (a.includes('ELEVE') && a.includes('DELETE'))       return t('params.audit_action_delete_eleve');
  if (a.includes('PROFESSEUR') || a.includes('ENSEIGNANT') || a.includes('TEACHER')) return t('params.audit_action_professeur');
  if (a.includes('ABSENCE'))                             return t('params.audit_action_absence');
  if (a.includes('BULLETIN'))                            return t('params.audit_action_bulletin');
  if (a.includes('NOUVELLE_ANNEE') || a.includes('NEW_YEAR')) return t('params.audit_action_new_year');
  if (a.includes('PARAMETRES') || a.includes('CONFIG'))  return t('params.audit_action_config');
  return '📋 ' + action.charAt(0).toUpperCase() + action.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formaterDate(timestamp) {
  if (!timestamp) return '—';
  try {
    const d = new Date(timestamp);
    return d.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch { return String(timestamp); }
}

function tronquer(texte, maxLen = 60) {
  if (!texte) return '—';
  const tStr = String(texte);
  return tStr.length > maxLen ? tStr.slice(0, maxLen) + '…' : tStr;
}

/**
 * Charge et affiche les logs d'audit avec rendu optimisé
 */
export async function chargerAuditOnglet() {
  const container = document.getElementById('audit-tab-content');
  if (!container) return;

  container.innerHTML = `<div style="text-align:center; padding:32px;">
    <div class="spinner" style="margin:0 auto;"></div>
    <div style="font-size:13px; color:var(--text-muted); margin-top:12px;">${t('params.audit_tab_loading')}</div>
  </div>`;

  try {
    const logs = await window.elimuAPI.getAuditLogs(100);
    
    if (!Array.isArray(logs) || logs.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">
        ${t('params.audit_tab_empty')}</div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    const tableWrapper = document.createElement('div');
    tableWrapper.style.overflowX = 'auto';

    const table = document.createElement('table');
    table.className = 'audit-table';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Date &amp; heure</th>
        <th>Utilisateur</th>
        <th>Action</th>
        <th>Détails</th>
      </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    logs.forEach(log => {
      const tr = document.createElement('tr');
      const detailsFull = log.details || '';
      const detailsTrunc = tronquer(log.details, 70);

      tr.innerHTML = `
        <td style="white-space:nowrap;">${formaterDate(log.timestamp)}</td>
        <td>
          <span style="background:var(--bg-secondary); border:1px solid var(--border-color);
                       color:var(--blue-fifa); padding:2px 8px; border-radius:10px; font-size:11px;">
            ${esc(log.nom_utilisateur || t('common.waiting'))}
          </span>
        </td>
        <td style="font-weight:600; color:var(--text-primary);">${traduireAction(log.action)}</td>
        <td style="color:var(--text-secondary);" title="${esc(detailsFull)}">${esc(detailsTrunc)}</td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    fragment.appendChild(tableWrapper);

    const footer = document.createElement('div');
    footer.style.cssText = `font-size:11px; color:var(--text-muted); text-align:right; padding:8px 12px; border-top:1px solid var(--border-color);`;
    footer.textContent = t('params.audit_tab_entries').replace('{count}', logs.length);
    fragment.appendChild(footer);

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });

  } catch (err) {
    console.error('Erreur chargerAuditOnglet:', err);
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--red-fifa);">
      ${t('params.audit_tab_error')}</div>`;
  }
}
