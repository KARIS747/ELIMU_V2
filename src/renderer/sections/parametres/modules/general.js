import { t, setLocale, getCurrentLocale, translatePage } from '../../../locales/index.js';

let parametres = {};

export async function init(state) {
  await chargerParametresDepuisBD();
  remplirFormulaireGeneral();
  attacherEvenementsGeneral();
  initLicenceInfo();
  initCloudSyncInfo();
}

async function initLicenceInfo() {
  try {
    const status = await window.elimuAPI.getLicenseStatus();
    const statusText = document.getElementById('licence-status-text');
    const expiryRow = document.getElementById('licence-expiry-row');
    const expiryDate = document.getElementById('licence-expiry-date');
    const hwidVal = document.getElementById('licence-hwid-val');

    if (hwidVal) hwidVal.textContent = status.hwid;

    if (statusText) {
      if (status.isValid) {
        statusText.textContent = status.isDev ? 'Mode Développement' : t('common.active');
        statusText.style.color = 'var(--green-fifa)';
        
        if (status.expiry && expiryRow && expiryDate) {
          expiryRow.style.display = 'block';
          expiryDate.textContent = new Date(status.expiry).toLocaleDateString(getCurrentLocale());
        }
      } else {
        statusText.textContent = status.expiry ? t('licence.error_expired') : t('licence.status_none');
        statusText.style.color = 'var(--red-fifa)';
      }
    }

    // Copier HWID
    document.getElementById('btn-copy-hwid-params')?.addEventListener('click', () => {
      navigator.clipboard.writeText(status.hwid);
      showToast(t('licence.copy_hwid'), 'success');
    });

    // Renouveler / Changer licence
    document.getElementById('btn-renew-licence')?.addEventListener('click', () => {
      // Rediriger vers l'écran de licence
      window.location.href = 'license-screen/license.html';
    });

  } catch (error) {
    console.error('Erreur initialisation info licence:', error);
  }
}

async function initCloudSyncInfo() {
  const statusText = document.getElementById('cloud-sync-status');
  const lastSyncText = document.getElementById('cloud-last-sync');
  const btnSyncNow = document.getElementById('btn-sync-cloud-now');

  const url = parametres.portail_url;
  const apiKey = parametres.portail_api_key;
  const lastSync = parametres.derniere_synchro_portail;

  if (lastSyncText) {
    if (lastSync) {
      try {
        const date = new Date(lastSync);
        if (!isNaN(date.getTime())) {
          lastSyncText.textContent = date.toLocaleString(getCurrentLocale());
        } else {
          lastSyncText.textContent = lastSync;
        }
      } catch {
        lastSyncText.textContent = lastSync;
      }
    } else {
      lastSyncText.textContent = '—';
    }
  }

  if (!url || !apiKey) {
    if (statusText) {
      statusText.textContent = t('parents.sync_error_config') || 'Non configuré (Portail non lié)';
      statusText.style.color = 'var(--yellow-fifa)';
    }
    if (btnSyncNow) btnSyncNow.disabled = true;
    return;
  }

  if (statusText) {
    statusText.textContent = t('params.general.cloud_checking') || 'Vérification...';
    statusText.style.color = 'var(--text-muted)';
  }

  try {
    const check = await window.elimuAPI.testPortalConnection(url, apiKey);
    if (statusText) {
      if (check?.success) {
        statusText.textContent = t('params.general.cloud_connected') || 'Connecté (PostgreSQL Neon)';
        statusText.style.color = 'var(--green-fifa)';
        if (btnSyncNow) btnSyncNow.disabled = false;
      } else {
        statusText.textContent = t('params.general.cloud_disconnected') || 'Erreur de connexion';
        statusText.style.color = 'var(--red-fifa)';
        if (btnSyncNow) btnSyncNow.disabled = true;
      }
    }
  } catch (err) {
    console.error(err);
    if (statusText) {
      statusText.textContent = t('params.general.cloud_disconnected') || 'Erreur de connexion';
      statusText.style.color = 'var(--red-fifa)';
    }
    if (btnSyncNow) btnSyncNow.disabled = true;
  }

  if (btnSyncNow) {
    // Eviter les écouteurs en doublon
    const newBtn = btnSyncNow.cloneNode(true);
    btnSyncNow.parentNode.replaceChild(newBtn, btnSyncNow);

    newBtn.addEventListener('click', async () => {
      newBtn.disabled = true;
      newBtn.textContent = t('params.general.cloud_sync_in_progress') || 'Synchronisation...';
      if (statusText) {
        statusText.textContent = t('params.general.cloud_sync_in_progress') || 'Synchronisation...';
        statusText.style.color = 'var(--text-muted)';
      }

      try {
        const syncResult = await window.elimuAPI.exportToPortal(url, apiKey);
        if (syncResult?.success) {
          showToast(t('params.general.cloud_sync_success') || 'Synchronisation cloud réussie !', 'success');
          await chargerParametresDepuisBD();
          initCloudSyncInfo();
        } else {
          showToast((t('params.general.cloud_sync_error') || 'Échec de la synchronisation') + ': ' + (syncResult?.error || ''), 'error');
          initCloudSyncInfo();
        }
      } catch (err) {
        console.error(err);
        showToast((t('params.general.cloud_sync_error') || 'Échec de la synchronisation') + ': ' + err.message, 'error');
        initCloudSyncInfo();
      }
    });
  }
}

async function chargerParametresDepuisBD() {
  try {
    const result = await window.elimuAPI.getParametres();
    parametres = (result && !result.error) ? result : {};
  } catch (error) {
    console.error('Erreur chargement paramètres (General):', error);
    parametres = {};
  }
}

function remplirFormulaireGeneral() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('etablissement-nom',         parametres.nom_etablissement);
  setVal('etablissement-abreviation', parametres.abreviation_etab);
  setVal('etablissement-adresse',     parametres.adresse);
  setVal('etablissement-tel',         parametres.telephone);
  setVal('etablissement-email',       parametres.email);
}

function attacherEvenementsGeneral() {
  document.getElementById('btn-save-general')?.addEventListener('click', async () => {
    const data = {
      nom_etablissement: document.getElementById('etablissement-nom')?.value?.trim(),
      abreviation_etab:  document.getElementById('etablissement-abreviation')?.value?.trim(),
      adresse:           document.getElementById('etablissement-adresse')?.value?.trim(),
      telephone:         document.getElementById('etablissement-tel')?.value?.trim(),
      email:             document.getElementById('etablissement-email')?.value?.trim(),
    };
    const result = await window.elimuAPI.saveParametres(data);
    if (result?.success) {
      parametres = { ...parametres, ...data };
      showToast(t('params.toast_save_success'), 'success');
      // Mettre à jour l'info de synchro si le paramètre a changé
      initCloudSyncInfo();
    } else {
      showToast(result?.error || t('common.error'), 'error');
    }
  });
}

