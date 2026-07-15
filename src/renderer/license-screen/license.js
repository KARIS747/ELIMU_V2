/**
 * license.js - Logique de l'écran d'activation
 */

import { t, translatePage, setLocale } from '../locales/index.js';

const hwidDisplay = document.getElementById('hwid-display');
const copyBtn     = document.getElementById('copy-hwid');
const licenseInput = document.getElementById('license-key');
const activateBtn = document.getElementById('activate-btn');
const errorMsg    = document.getElementById('error-msg');
const successMsg  = document.getElementById('success-msg');
const langBtns    = {
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

    // Charger le HWID
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

// Copier le HWID
copyBtn?.addEventListener('click', () => {
  navigator.clipboard.writeText(currentHwid);
  const originalText = copyBtn.textContent;
  copyBtn.textContent = t('toast.copy_success', 'Copié !');
  setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
});

// Activer la licence
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
