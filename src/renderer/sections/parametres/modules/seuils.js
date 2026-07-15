import { t } from '../../../locales/index.js';

let parametres = {};

export async function init(state) {
  await chargerParametresDepuisBD();
  await synchroniserAvecBulletin();
  remplirFormulairesSeuils();
  attacherEvenementsSeuils();
}

async function chargerParametresDepuisBD() {
  try {
    const result = await window.elimuAPI.getParametres();
    parametres = (result && !result.error) ? result : {};
  } catch (error) {
    console.error('Erreur chargement paramètres (Seuils):', error);
    parametres = {};
  }
}

async function synchroniserAvecBulletin() {
  try {
    const bConfig = await window.elimuAPI.getBulletinConfig();
    if (bConfig?.mentions_config) {
      const mentions = JSON.parse(bConfig.mentions_config);
      // On cherche la mention "Passable" ou celle autour de 10 pour le seuil d'alerte
      const mAlerte = mentions.find(m => m.label.toLowerCase().includes('passable') || (m.min >= 10 && m.min < 12));
      // On cherche "Excellent" ou "Très Bien" pour le seuil d'excellence
      const mExcellence = mentions.find(m => m.label.toLowerCase().includes('excellent') || m.label.toLowerCase().includes('très bien') || m.min >= 14);

      if (mAlerte) parametres.seuil_alerte_suggere = mAlerte.min;
      if (mExcellence) parametres.seuil_excellent_suggere = mExcellence.min;
    }
  } catch (e) {
    console.error('Erreur synchronisation seuils:', e);
  }
}

function remplirFormulairesSeuils() {
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  
  const noteMax        = document.getElementById('note-max');
  const seuilAlerte    = document.getElementById('seuil-alerte');
  const seuilExcellent = document.getElementById('seuil-excellent');
  const periodeActive  = document.getElementById('periode-active');
  const uaActive       = document.getElementById('ua-active');

  if (noteMax)        noteMax.value        = parametres.note_max        || 20;
  if (seuilAlerte)    seuilAlerte.value    = parametres.seuil_alerte    || 10;
  if (seuilExcellent) seuilExcellent.value = parametres.seuil_excellent || 14;
  if (periodeActive)  periodeActive.value  = parametres.periode_active  || 'Trimestre 1';
  if (uaActive)       uaActive.value       = parametres.ua_active       || 'UA1';

  // Afficher suggestions si différences
  verifierDifferences();
  mettreAJourPreview();
}

function verifierDifferences() {
  const check = (id, suggere) => {
    const el = document.getElementById(id);
    if (!el || suggere === undefined) return;
    const diff = Math.abs(parseFloat(el.value) - suggere) > 0.01;
    el.style.borderColor = diff ? 'var(--yellow-fifa)' : '';
    el.title = diff ? `Suggestion bulletin : ${suggere}` : '';
  };
  check('seuil-alerte', parametres.seuil_alerte_suggere);
  check('seuil-excellent', parametres.seuil_excellent_suggere);
}

function mettreAJourPreview() {
  const alerte    = document.getElementById('seuil-alerte')?.value   || 10;
  const excellent = document.getElementById('seuil-excellent')?.value || 14;
  ['preview-alerte', 'preview-alerte2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = alerte;
  });
  const pe = document.getElementById('preview-excellent');
  if (pe) pe.textContent = excellent;
}

function attacherEvenementsSeuils() {
  document.getElementById('seuil-alerte')?.addEventListener('input', mettreAJourPreview);
  document.getElementById('seuil-excellent')?.addEventListener('input', mettreAJourPreview);

  document.getElementById('btn-save-seuils')?.addEventListener('click', async () => {
    const data = {
      note_max:        parseFloat(document.getElementById('note-max')?.value)        || 20,
      seuil_alerte:    parseFloat(document.getElementById('seuil-alerte')?.value)    || 10,
      seuil_excellent: parseFloat(document.getElementById('seuil-excellent')?.value) || 14,
      periode_active:  document.getElementById('periode-active')?.value || 'Trimestre 1',
      ua_active:       document.getElementById('ua-active')?.value || 'UA1',
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
