/**
 * locales/index.js — Gestionnaire de traductions Elimu
 *
 * API publique :
 *   t(key, fallback?)          → string traduit
 *   setLocale(locale)          → change la langue et sauvegarde dans localStorage
 *   getCurrentLocale()         → retourne la locale active ('fr' | 'en')
 *   translatePage()            → applique les traductions à tous les éléments data-i18n*
 */

import fr from './fr.js';
import en from './en.js';

// ── Dictionnaires disponibles ─────────────────────────────
const LOCALES = { fr, en };
const STORAGE_KEY = 'elimu-locale';
const GEN_STORAGE_KEY = 'elimu-gen-locale';
const DEFAULT_LOCALE = 'fr';

// ── Locale active (initialisée depuis localStorage) ───────
let currentLocale = localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
if (!LOCALES[currentLocale]) currentLocale = DEFAULT_LOCALE;

let currentGenLocale = localStorage.getItem(GEN_STORAGE_KEY) || DEFAULT_LOCALE;
if (!LOCALES[currentGenLocale]) currentGenLocale = DEFAULT_LOCALE;

// ─────────────────────────────────────────────────────────
// t(key, fallback?) — Retourne la chaîne traduite
// ─────────────────────────────────────────────────────────
export function t(key, fallback) {
  const dict = LOCALES[currentLocale] || LOCALES[DEFAULT_LOCALE];
  if (dict[key] !== undefined) return dict[key];

  // Fallback sur la locale par défaut si absent
  if (currentLocale !== DEFAULT_LOCALE && LOCALES[DEFAULT_LOCALE][key] !== undefined) {
    return LOCALES[DEFAULT_LOCALE][key];
  }

  // Derniers recours : fallback explicite ou la clé elle-même
  return fallback !== undefined ? fallback : key;
}

// ─────────────────────────────────────────────────────────
// tGen(key, fallback?) — Version de t() pour la langue de génération
// ─────────────────────────────────────────────────────────
export function tGen(key, fallback) {
  const dict = LOCALES[currentGenLocale] || LOCALES[DEFAULT_LOCALE];
  if (dict[key] !== undefined) return dict[key];

  if (currentGenLocale !== DEFAULT_LOCALE && LOCALES[DEFAULT_LOCALE][key] !== undefined) {
    return LOCALES[DEFAULT_LOCALE][key];
  }

  return fallback !== undefined ? fallback : key;
}

// ─────────────────────────────────────────────────────────
// getCurrentLocale() → 'fr' | 'en'
// ─────────────────────────────────────────────────────────
export function getCurrentLocale() {
  return currentLocale;
}

// ─────────────────────────────────────────────────────────
// getCurrentGenLocale() → 'fr' | 'en' (Langue des PDF/Excel)
// ─────────────────────────────────────────────────────────
export function getCurrentGenLocale() {
  return currentGenLocale;
}

// ─────────────────────────────────────────────────────────
// setLocale(locale) — Change la langue et persiste dans localStorage
// ─────────────────────────────────────────────────────────
export function setLocale(locale) {
  if (!LOCALES[locale]) {
    console.warn(`[i18n] Locale inconnue : "${locale}". Locale disponibles :`, Object.keys(LOCALES));
    return;
  }
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.setAttribute('lang', locale);
}

// ─────────────────────────────────────────────────────────
// setGenLocale(locale) — Change la langue de génération
// ─────────────────────────────────────────────────────────
export function setGenLocale(locale) {
  if (!LOCALES[locale]) return;
  currentGenLocale = locale;
  localStorage.setItem(GEN_STORAGE_KEY, locale);
}

// ─────────────────────────────────────────────────────────
// translatePage() — Parcourt le DOM et applique les traductions
//
// Attributs reconnus :
//   data-i18n            → remplace textContent
//   data-i18n-placeholder → remplace l'attribut placeholder
//   data-i18n-title       → remplace l'attribut title
//   data-i18n-html        → remplace innerHTML (usage sparingly)
// ─────────────────────────────────────────────────────────
export function translatePage() {
  // data-i18n → textContent (uniquement si pas d'enfants pour ne pas casser les selects dynamiques)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = t(key);
    if (translated !== key) {
      if (el.children.length === 0) {
        el.textContent = translated;
      }
    }
  });

  // data-i18n-placeholder → placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translated = t(key);
    if (translated !== key) el.placeholder = translated;
  });

  // data-i18n-title → title attribute
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translated = t(key);
    if (translated !== key) el.title = translated;
  });

  // data-i18n-html → innerHTML (DANGER : À utiliser uniquement pour des clés statiques sans données utilisateur)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    const translated = t(key);
    // SÉCURITÉ : Ne jamais injecter de HTML si la traduction contient des balises suspectes (simple garde-fou)
    if (translated !== key) {
      if (translated.includes('<script') || translated.includes('onerror=')) {
        console.error(`[i18n] Tentative d'injection suspecte détectée dans la clé : ${key}`);
        el.textContent = translated;
      } else {
        el.innerHTML = translated;
      }
    }
  });

  // Mettre à jour l'attribut lang de la balise <html>
  document.documentElement.setAttribute('lang', currentLocale);
}

// ─────────────────────────────────────────────────────────
// Exposition globale (pour les sections sans import ES module)
// ─────────────────────────────────────────────────────────
window.i18n = { t, tGen, setLocale, getCurrentLocale, translatePage, getCurrentGenLocale, setGenLocale };
