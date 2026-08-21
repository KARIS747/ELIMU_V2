/**
 * license.js - Logique de l'écran d'activation
 * Flux principal : glisser-déposer un fichier d'installation (elimu-installation.json)
 * Repli : activation manuelle avec une clé de licence seule
 */

import { t, translatePage, setLocale } from '../locales/index.js';

// ── Éléments bundle ──
const dropzone     = document.getElementById('dropzone');
const bundleInput  = document.getElementById('bundle-input');
const successBox   = document.getElementById('success-box');
const successSchool = document.getElementById('success-school');
const successExpiry = document.getElementById('success-expiry');
const successDetail = document.getElementById('success-detail');
const errorMsg     = document.getElementById('error-msg');

// ── Éléments repli manuel ──
const toggleManual = document.getElementById('toggle-manual');
const manualSection = document.getElementById('manual-section');
const hwidDisplay = document.getElementById('hwid-display');
const copyBtn     = document.getElementById('copy-hwid');
const licenseInput = document.getElementById('license-key');
const activateBtn = document.getElementById('activate-btn');
const successMsg  = document.getElementById('success-msg');

const langBtns = {
  fr: document.getElementById('lang-fr'),
  en: document.getElementById('lang-en')
};

let currentHwid = '';

async function init() {
  try {
    // Détecter la langue via l'URL
    const urlParams = new URLSearchParams(window.location.search);
    let lang = urlParams.get('lang');

    // Si pas de langue dans l'URL, on essaie de détecter via le navigateur
    if (!lang) {
      const sysLang = navigator.language.split('-')[0];
      lang = (sysLang === 'en' || sysLang === 'fr') ? sysLang : 'en'; // Par défaut anglais si inconnu
    }

    if (lang && (lang === 'fr' || lang === 'en')) {
      setLocale(lang);
      updateLangButtons(lang);
    }

    // Charger le HWID (utilisé par le repli manuel)
    currentHwid = await window.elimuAPI.getHardwareId();
    if (hwidDisplay) hwidDisplay.textContent = currentHwid;

    // Appliquer les traductions
    translatePage();

  } catch (error) {
    console.error('Erreur initialisation licence:', error);
  }
}

// Gérer le changement de langue manuel
Object.entries(langBtns).forEach(([lang, btn]) => {
  btn?.addEventListener('click', () => {
    setLocale(lang);
    translatePage();
    updateLangButtons(lang);
  });
});

function updateLangButtons(activeLang) {
  Object.entries(langBtns).forEach(([lang, btn]) => {
    if (btn) {
      if (lang === activeLang) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

// ─────────────────────────────────────────────
// BUNDLE D'INSTALLATION (glisser-déposer)
// ─────────────────────────────────────────────

// Empêcher la navigation Electron si un fichier est lâché hors de la dropzone
['dragover', 'drop'].forEach(evtName => {
  window.addEventListener(evtName, (e) => e.preventDefault());
});

dropzone?.addEventListener('click', () => bundleInput?.click());
dropzone?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    bundleInput?.click();
  }
});
dropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.add('dragover');
});
dropzone?.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
});
dropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) importBundleFile(file);
});

bundleInput?.addEventListener('change', () => {
  const file = bundleInput.files?.[0];
  if (file) importBundleFile(file);
  bundleInput.value = '';
});

async function importBundleFile(file) {
  hideError();
  dropzone.style.opacity = '0.6';
  dropzone.style.pointerEvents = 'none';

  try {
    const filePath = file.path || (file.webkitRelativePath ?? '');
    if (!filePath) {
      showBundleError(t('licence.error_file'));
      return;
    }

    const result = await window.elimuAPI.importLicenseBundle(filePath);

    if (result.success) {
      showBundleSuccess(result);
    } else {
      showBundleError(bundleErrorText(result.error));
    }
  } catch (error) {
    console.error('Erreur import bundle:', error);
    showBundleError(t('common.error'));
  } finally {
    dropzone.style.opacity = '';
    dropzone.style.pointerEvents = '';
  }
}

function bundleErrorText(code) {
  switch (code) {
    case 'file':    return t('licence.error_file');
    case 'format':  return t('licence.error_format');
    case 'invalid': return t('licence.error_invalid');
    case 'hwid':    return t('licence.error_hwid');
    case 'expired': return t('licence.error_expired');
    default:        return t('common.error');
  }
}

function showBundleSuccess(result) {
  dropzone.style.display = 'none';
  toggleManual.parentElement.style.display = 'none';

  const school = result.schoolName || t('licence.success_school_default', 'Votre établissement');
  successSchool.textContent = school;
  successExpiry.textContent = t('licence.status_valid', 'Licence valide jusqu’au {date}').replace('{date}', result.expiry);

  const parts = [];
  const count = (result.applied || []).length;
  parts.push(t('licence.success_configured', '{count} paramètres configurés').replace('{count}', count));
  if (result.skipped && result.skipped.length > 0) {
    parts.push(t('licence.success_identity_kept', 'Identité de l\'établissement existante conservée'));
  }
  successDetail.textContent = parts.join(' · ');

  successBox.style.display = 'block';

  // La fenêtre se ferme automatiquement côté main process (événement license:activated).
  // Filet de sécurité : redirection vers le login si la fenêtre est toujours ouverte.
  setTimeout(() => { window.location.href = '../index.html'; }, 2500);
}

function showBundleError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}

// ─────────────────────────────────────────────
// REPLI MANUEL (clé seule)
// ─────────────────────────────────────────────

toggleManual?.addEventListener('click', () => {
  const visible = manualSection.style.display !== 'none';
  manualSection.style.display = visible ? 'none' : 'block';
  toggleManual.textContent = visible
    ? t('licence.manual_toggle')
    : t('licence.manual_hide', 'Masquer la saisie manuelle');
});

// Copier le HWID
copyBtn?.addEventListener('click', () => {
  navigator.clipboard.writeText(currentHwid);
  const originalText = copyBtn.textContent;
  copyBtn.textContent = t('toast.copy_success', 'Copié !');
  setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
});

// Activer la licence (manuel)
activateBtn?.addEventListener('click', async () => {
  const key = licenseInput.value.trim();
  if (!key) return;

  activateBtn.disabled = true;
  if (errorMsg) errorMsg.style.display = 'none';

  try {
    const result = await window.elimuAPI.saveLicense({ key });

    if (result.success) {
      if (successMsg) successMsg.style.display = 'block';
      setTimeout(() => {
        // Rediriger vers l'écran de login
        window.location.href = '../index.html';
      }, 2000);
    } else {
      activateBtn.disabled = false;
      if (errorMsg) {
        errorMsg.style.display = 'block';
        if (result.error === 'expired') {
          errorMsg.textContent = t('licence.error_expired');
        } else if (result.error === 'invalid') {
          errorMsg.textContent = t('licence.error_invalid');
        } else {
          errorMsg.textContent = t('common.error');
        }
      }
    }
  } catch (error) {
    activateBtn.disabled = false;
    if (errorMsg) {
      errorMsg.style.display = 'block';
      errorMsg.textContent = t('common.error');
    }
  }
});

init();
