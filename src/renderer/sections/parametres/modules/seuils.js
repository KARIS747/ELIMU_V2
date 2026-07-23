import { t } from '../../../locales/index.js';

let parametres = {};

export async function init(state) {
  try {
    const result = await window.elimuAPI.getParametres();
    parametres = (result && !result.error) ? result : {};
  } catch (error) {
    console.error('Erreur chargement paramètres (Seuils):', error);
    parametres = {};
  }
  remplirFormulairesSeuils();
  attacherEvenementsSeuils();
}

function remplirFormulairesSeuils() {
  const periodeActive = document.getElementById('periode-active');
  const uaActive      = document.getElementById('ua-active');
  if (periodeActive) periodeActive.value = parametres.periode_active || 'Trimestre 1';
  if (uaActive)      uaActive.value      = parametres.ua_active      || 'UA1';
}

function attacherEvenementsSeuils() {
  document.getElementById('btn-save-seuils')?.addEventListener('click', async () => {
    const data = {
      periode_active: document.getElementById('periode-active')?.value || 'Trimestre 1',
      ua_active:      document.getElementById('ua-active')?.value      || 'UA1',
    };
    const result = await window.elimuAPI.saveParametres(data);
    if (result?.success) {
      parametres = { ...parametres, ...data };
      showToast(t('params.toast_save_success'), 'success');
    } else {
      showToast(result?.error || t('common.error'), 'error');
    }
  });
}
