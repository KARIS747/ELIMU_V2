/**
 * renderer.js - Point d'entrée du processus renderer
 * v2 : Multi-rôles (admin, enseignant, secretaire)
 *      Sidebar filtrée selon le rôle connecté
 *      Verrouillage global pour éviter les actions concurrentes
 *      + Déconnexion par rechargement de la fenêtre (pour nettoyer les instances Chart.js)
 *      + Internationalisation (i18n) FR / EN
 */

// ============================================================
// IMPORT I18N — chemin corrigé (deux niveaux)
// ============================================================
import { t, tGen, setLocale, getCurrentLocale, translatePage, getCurrentGenLocale, setGenLocale } from '../../locales/index.js';

// Exposer globalement pour les sections qui n'utilisent pas ES modules
window.t             = t;
window.tGen          = tGen;
window.setLocale     = setLocale;
window.getCurrentLocale = getCurrentLocale;
window.translatePage = translatePage;
window.getCurrentGenLocale = getCurrentGenLocale;
window.setGenLocale = setGenLocale;

// ============================================================
// ÉTAT GLOBAL
// ============================================================
const appState = {
  user: null,
  currentSection: null,
  classes: [],
  matieres: []
};

window.appState    = appState;
window.navigateTo  = navigateTo;

// ============================================================
// VERROUILLAGE GLOBAL (bloque l'interface pendant opérations longues)
// ============================================================
let isProcessing = false;
let processingOverlay = null;

function showProcessingOverlay(message) {
  message = message || t('common.processing');
  // Supprimer l'ancien s'il existe par erreur
  const old = document.getElementById('processing-overlay');
  if (old) old.remove();

  isProcessing = true;
  processingOverlay = document.createElement('div');
  processingOverlay.id = 'processing-overlay';
  processingOverlay.style.position = 'fixed';
  processingOverlay.style.top = '0';
  processingOverlay.style.left = '0';
  processingOverlay.style.width = '100%';
  processingOverlay.style.height = '100%';
  processingOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  processingOverlay.style.zIndex = '10000';
  processingOverlay.style.display = 'flex';
  processingOverlay.style.alignItems = 'center';
  processingOverlay.style.justifyContent = 'center';
  processingOverlay.style.flexDirection = 'column';
  processingOverlay.style.backdropFilter = 'blur(4px)';
  processingOverlay.innerHTML = `
    <div style="background: var(--bg-card); padding: 32px; border-radius: 20px; text-align: center; border: 1px solid var(--border-color); box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
      <div class="spinner" style="margin: 0 auto 16px;"></div>
      <div style="color: var(--text-primary); font-weight: 600;">${message}</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">${t('common.waiting')}</div>
    </div>
  `;
  document.body.appendChild(processingOverlay);
}

function hideProcessingOverlay() {
  const el = document.getElementById('processing-overlay');
  if (el) el.remove();
  processingOverlay = null;
  isProcessing = false;
}

async function withProcessingLock(action, message) {
  message = message || t('common.processing');
  if (isProcessing) {
    showToast(t('toast.processing_wait'), 'warning');
    return null;
  }
  showProcessingOverlay(message);
  try {
    const result = await action();
    return result;
  } catch (error) {
    console.error(error);
    showToast(t('common.error') + ' : ' + error.message, 'error');
    return null;
  } finally {
    hideProcessingOverlay();
  }
}

// Exposer globalement pour les sections
window.showProcessingOverlay = showProcessingOverlay;
window.hideProcessingOverlay = hideProcessingOverlay;
window.withProcessingLock = withProcessingLock;

// ============================================================
// UTILITAIRES INTERFACE
// ============================================================

function createEyeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
  return svg;
}

function attachPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  let wrapper = input.parentElement;
  
  // Si le parent est un .input-group (qui contient un label), on crée un wrapper spécifique pour l'input
  // pour que le centrage vertical (top: 50%) se fasse par rapport à l'input et non au bloc entier.
  if (wrapper.classList.contains('input-group') || wrapper.tagName === 'DIV') {
    const newWrapper = document.createElement('div');
    newWrapper.className = 'password-wrapper';
    newWrapper.style.position = 'relative';
    newWrapper.style.width = '100%';
    wrapper.insertBefore(newWrapper, input);
    newWrapper.appendChild(input);
    wrapper = newWrapper;
  } else if (!wrapper.classList.contains('password-wrapper')) {
    wrapper.style.position = 'relative';
    wrapper.classList.add('password-wrapper');
  }
  
  // Supprimer l’ancien toggle s’il existe
  const oldToggle = wrapper.querySelector('.password-toggle');
  if (oldToggle) oldToggle.remove();
  
  // Créer le bouton
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.setAttribute('tabindex', '-1');
  toggle.style.position = 'absolute';
  toggle.style.right = '10px';
  toggle.style.top = '50%';
  toggle.style.transform = 'translateY(-50%)';
  toggle.style.background = 'transparent';
  toggle.style.border = 'none';
  toggle.style.cursor = 'pointer';
  toggle.style.padding = '0';
  toggle.style.display = 'flex';
  toggle.style.alignItems = 'center';
  toggle.style.justifyContent = 'center';
  toggle.style.zIndex = '2';
  
  // Ajouter l’icône SVG
  const icon = createEyeIcon();
  toggle.appendChild(icon);
  
  // Gestion du clic
  toggle.addEventListener('click', () => {
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    // Changer l’icône selon le mode
    if (type === 'text') {
      // Icône œil barré (masqué)
      icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
    } else {
      icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
  });
  
  wrapper.appendChild(toggle);
}

// ============================================================
// SECTIONS PAR RÔLE
// ============================================================

const TOUTES_SECTIONS = {
  dashboard:     { titleKey: 'nav.dashboard',      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>', roles: ['admin', 'comptable'] },
  classes:       { titleKey: 'nav.classes',         icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', roles: ['admin'] },
  eleves:        { titleKey: 'nav.eleves',          icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>', roles: ['admin', 'comptable'] },
  professeurs:   { titleKey: 'nav.professeurs',     icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>', roles: ['admin'] },
  parents:       { titleKey: 'nav.parents',         icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>', roles: ['admin'] },
  import_export: { titleKey: 'nav.import_export',   icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 15 16 10 11 15"></polyline><line x1="16" y1="10" x2="16" y2="21"></line><path d="M8 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"></path><polyline points="10 9 7 6 10 3"></polyline><line x1="7" y1="6" x2="21" y2="6"></line></svg>', roles: ['admin'] },
  finance:       { titleKey: 'nav.finance',          icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',  roles: ['admin', 'comptable'] },
  parametres:    { titleKey: 'nav.parametres',      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',  roles: ['admin'] }
};

/**
 * Retourne la liste des sections accessibles pour un rôle donné,
 * avec le title résolu via i18n.
 */
function getSectionsForRole(role) {
  const r = role || 'admin';
  return Object.fromEntries(
    Object.entries(TOUTES_SECTIONS)
      .filter(([, s]) => s.roles.includes(r))
      .map(([id, s]) => [id, { ...s, title: t(s.titleKey) }])
  );
}

// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Appliquer la langue sauvegardée dès le démarrage
  translatePage();
  await initLogin();
  await checkLicenseExpiry();
  
  // ── Rendre l'interface visible (évite le flash de chargement) ──
  document.body.style.opacity = '1';
});

async function checkLicenseExpiry() {
  try {
    const status = await window.elimuAPI.getLicenseStatus();
    if (!status || !status.isValid || !status.expiry || status.isDev) return;

    const expiryDate = new Date(status.expiry);
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
      const banner = document.getElementById('license-banner');
      const bannerText = document.getElementById('license-banner-text');
      
      if (banner && bannerText) {
        if (diffDays <= 0) {
          bannerText.textContent = t('licence.expiry_today');
        } else {
          bannerText.textContent = t('licence.expiry_warning').replace('{days}', diffDays);
        }
        banner.classList.remove('hidden');
      }
    }
  } catch (error) {
    console.error('Erreur lors de la vérification de l\'expiration de la licence:', error);
  }
}

async function initLogin() {
  const loginCard = document.getElementById('login-card');
  try {
    const firstLaunch = await window.elimuAPI.isFirstLaunch();
    if (firstLaunch) {
      renderFirstLaunchForm(loginCard);
    } else {
      renderLoginForm(loginCard);
    }
  } catch (error) {
    loginCard.innerHTML = `
      <div style="color:var(--red-fifa);text-align:center;padding:20px;">
         ${t('common.error')} : ${error.message}
      </div>`;
  }
}

// ============================================================
// FORMULAIRES D'AUTHENTIFICATION
// ============================================================

function renderLoginForm(container) {
  container.innerHTML = `
    <h2>${t('login.title')}</h2>
    <p>${t('login.subtitle')}</p>
    <div id="login-error" class="login-error"></div>
    <div class="input-group">
      <label>${t('login.username')}</label>
      <input type="text" id="inp-username" class="input"
             placeholder="${t('login.placeholder_username')}" autocomplete="username">
    </div>
    <div class="input-group">
      <label>${t('login.password')}</label>
      <input type="password" id="inp-password" class="input"
             placeholder="${t('login.placeholder_password')}" autocomplete="current-password">
    </div>
    <button class="btn btn-primary w-full" id="btn-login" type="button"
            style="margin-top:8px;justify-content:center;padding:12px;">
      ${t('login.submit')}
    </button>
    <div style="text-align:center;margin-top:12px;">
      <button type="button" id="btn-mot-de-passe-oublie"
              style="background:none;border:none;color:var(--text-muted);font-size:12px;
                     cursor:pointer;text-decoration:underline;padding:4px;">
        ${t('login.forgot')}
      </button>
    </div>
  `;
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('inp-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('btn-mot-de-passe-oublie').addEventListener('click', () => {
    renderMotDePasseOublieEtape1(container);
  });
  attachPasswordToggle('inp-password');
  document.getElementById('inp-username').focus();
}

function renderFirstLaunchForm(container) {
  const QUESTIONS = [
    'Quel est le nom de votre premier animal de compagnie ?',
    'Quelle est la ville de naissance de votre mère ?',
    "Quel est le prénom de votre meilleur(e) ami(e) d'enfance ?",
    'Quel est le nom de votre école primaire ?',
    'Quelle est votre équipe de sport préférée ?',
    'Quel est le modèle de votre premier téléphone portable ?',
  ];
  const optionsHTML = QUESTIONS.map(q => `<option value="${q}">${q}</option>`).join('');

  container.innerHTML = `
    <h2>${t('firstlaunch.title')}</h2>
    <p>${t('firstlaunch.subtitle')}</p>
    <div id="login-error" class="login-error"></div>
    <div class="input-group">
      <label>${t('firstlaunch.username')}</label>
      <input type="text" id="inp-username" class="input" placeholder="Ex: directeur">
    </div>
    <div class="input-group">
      <label>${t('firstlaunch.password')}</label>
      <input type="password" id="inp-password" class="input" placeholder="${t('login.placeholder_password')}">
    </div>
    <div class="input-group">
      <label>${t('firstlaunch.confirm')}</label>
      <input type="password" id="inp-confirm" class="input" placeholder="${t('login.placeholder_password')}">
    </div>
    <div style="margin-top:16px;padding:14px;background:rgba(45,110,224,0.08);
                border:1px solid rgba(45,110,224,0.2);border-radius:10px;">
      <div style="font-size:12px;color:var(--blue-fifa);font-weight:600;
                  text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
        ${t('firstlaunch.security')}
      </div>
      <div class="input-group" style="margin-bottom:10px;">
        <label style="font-size:12px;">${t('firstlaunch.question')}</label>
        <select id="inp-question" class="input" style="font-size:13px;">
          <option value="">— ${t('firstlaunch.question')} —</option>
          ${optionsHTML}
        </select>
      </div>
      <div class="input-group" style="margin-bottom:0;">
        <label style="font-size:12px;">${t('firstlaunch.answer')}</label>
        <input type="text" id="inp-reponse" class="input" placeholder="${t('common.search').replace('...','...')}"
               style="font-size:13px;" autocomplete="off">
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">
        ${t('firstlaunch.optional')}
      </div>
    </div>
    <button class="btn btn-primary w-full" id="btn-login" type="button"
            style="margin-top:16px;justify-content:center;padding:12px;">
      ${t('firstlaunch.submit')}
    </button>
  `;
  attachPasswordToggle('inp-password');
  attachPasswordToggle('inp-confirm');
  document.getElementById('btn-login').addEventListener('click', handleCreateAdmin);
  document.getElementById('inp-username').focus();
}

// ============================================================
// HANDLERS AUTHENTIFICATION
// ============================================================

async function handleLogin() {
  const btn      = document.getElementById('btn-login');
  const username = document.getElementById('inp-username').value.trim();
  const password = document.getElementById('inp-password').value;
  if (!username || !password) { showLoginError('Veuillez remplir tous les champs'); return; }

  btn.disabled    = true;
  btn.textContent = t('login.submitting');

  const result = await window.elimuAPI.login(username, password);

  if (result.success) {
    appState.user = result.user;
    await showApp();
  } else {
    btn.disabled    = false;
    btn.textContent = t('login.submit');
    showLoginError(result.error || 'Identifiants incorrects');
  }
}

async function handleCreateAdmin() {
  const btn      = document.getElementById('btn-login');
  const username = document.getElementById('inp-username').value.trim();
  const password = document.getElementById('inp-password').value;
  const confirm  = document.getElementById('inp-confirm').value;
  const question = document.getElementById('inp-question')?.value || null;
  const reponse  = document.getElementById('inp-reponse')?.value.trim() || null;

  if (!username || !password || !confirm) { showLoginError('Veuillez remplir tous les champs obligatoires'); return; }
  if (password !== confirm)               { showLoginError('Les mots de passe ne correspondent pas'); return; }
  if (password.length < 6)               { showLoginError('Le mot de passe doit avoir au moins 6 caractères'); return; }
  if (question && !reponse)              { showLoginError('Veuillez saisir votre réponse secrète'); return; }

  btn.disabled    = true;
  btn.textContent = t('firstlaunch.creating');

  const result = await window.elimuAPI.createAdmin(username, password, question, reponse);

  if (result.success) {
    appState.user = result.user;
    await showApp();
    showToast(t('firstlaunch.success'), 'success');
  } else {
    btn.disabled    = false;
    btn.textContent = t('firstlaunch.submit');
    showLoginError(result.error || 'Erreur lors de la création');
  }
}

function showLoginError(message) {
  const el = document.getElementById('login-error');
  if (el) {
    el.textContent = ' ' + message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4000);
  }
}

// ============================================================
// MOT DE PASSE OUBLIÉ
// ============================================================

function renderMotDePasseOublieEtape1(container) {
  container.innerHTML = `
    <h2>${t('forgot.title1')}</h2>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
      ${t('forgot.desc1')}
    </p>
    <div id="login-error" class="login-error"></div>
    <div class="input-group">
      <label>${t('login.username')}</label>
      <input type="text" id="inp-username-reset" class="input"
             placeholder="${t('login.placeholder_username')}" autocomplete="username">
    </div>
    <button class="btn btn-primary w-full" id="btn-verif-username" type="button"
            style="margin-top:8px;justify-content:center;padding:12px;">
      ${t('forgot.continue')}
    </button>
    <div style="text-align:center;margin-top:12px;">
      <button type="button" id="btn-retour-login"
              style="background:none;border:none;color:var(--text-muted);font-size:12px;
                     cursor:pointer;text-decoration:underline;padding:4px;">
        ${t('forgot.back')}
      </button>
    </div>
  `;
  document.getElementById('btn-retour-login').addEventListener('click', () => renderLoginForm(container));

  const go = async () => {
    const username = document.getElementById('inp-username-reset').value.trim();
    if (!username) { showLoginError("Veuillez saisir votre nom d'utilisateur"); return; }
    const btn = document.getElementById('btn-verif-username');
    btn.disabled = true; btn.textContent = t('common.loading');
    const result = await window.elimuAPI.getQuestionSecrete(username);
    if (result.success) {
      renderMotDePasseOublieEtape2(container, username, result.question);
    } else {
      btn.disabled = false; btn.textContent = t('forgot.continue');
      showLoginError(result.error || 'Erreur');
    }
  };
  document.getElementById('btn-verif-username').addEventListener('click', go);
  document.getElementById('inp-username-reset').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.getElementById('inp-username-reset').focus();
}

function renderMotDePasseOublieEtape2(container, username, question) {
  container.innerHTML = `
    <h2>${t('forgot.title2')}</h2>
    <div style="background:rgba(45,110,224,0.08);border:1px solid rgba(45,110,224,0.2);
                border-radius:10px;padding:12px 14px;margin-bottom:16px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${t('login.username')}</div>
      <div style="font-weight:600;color:var(--text-primary);font-size:14px;">${esc(username)}</div>
    </div>
    <div id="login-error" class="login-error"></div>
    <div class="input-group">
      <label>${esc(question)}</label>
      <input type="text" id="inp-reponse-reset" class="input"
             placeholder="Votre réponse..." autocomplete="off">
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        La réponse n'est pas sensible à la casse.
      </div>
    </div>
    <button class="btn btn-primary w-full" id="btn-verif-reponse" type="button"
            style="margin-top:8px;justify-content:center;padding:12px;">
      ${t('forgot.verify')}
    </button>
    <div style="text-align:center;margin-top:12px;">
      <button type="button" id="btn-retour-etape1"
              style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;text-decoration:underline;padding:4px;">
        ← Retour
      </button>
    </div>
  `;
  document.getElementById('btn-retour-etape1').addEventListener('click', () => renderMotDePasseOublieEtape1(container));
  const go = async () => {
    const reponse = document.getElementById('inp-reponse-reset').value.trim();
    if (!reponse) { showLoginError('Veuillez saisir votre réponse'); return; }
    renderMotDePasseOublieEtape3(container, username, reponse);
  };
  document.getElementById('btn-verif-reponse').addEventListener('click', go);
  document.getElementById('inp-reponse-reset').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.getElementById('inp-reponse-reset').focus();
}

function renderMotDePasseOublieEtape3(container, username, reponseSecrete) {
  container.innerHTML = `
    <h2>${t('forgot.title3')}</h2>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:16px;">
      Choisissez un nouveau mot de passe pour <strong>${esc(username)}</strong>.
    </p>
    <div id="login-error" class="login-error"></div>
    <div class="input-group">
      <label>${t('forgot.newpwd')}</label>
      <input type="password" id="inp-new-password" class="input"
             placeholder="${t('login.placeholder_password')}" autocomplete="new-password">
    </div>
    <div class="input-group">
      <label>${t('forgot.confirmpwd')}</label>
      <input type="password" id="inp-confirm-password" class="input"
             placeholder="${t('login.placeholder_password')}" autocomplete="new-password">
    </div>
    <button class="btn btn-primary w-full" id="btn-save-password" type="button"
            style="margin-top:8px;justify-content:center;padding:12px;">
      ${t('forgot.save')}
    </button>
    <div style="text-align:center;margin-top:12px;">
      <button type="button" id="btn-retour-etape2"
              style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;text-decoration:underline;padding:4px;">
        ← Retour
      </button>
    </div>
  `;
  document.getElementById('btn-retour-etape2').addEventListener('click', () => renderMotDePasseOublieEtape1(container));

  const go = async () => {
    const newPwd  = document.getElementById('inp-new-password').value;
    const confirm = document.getElementById('inp-confirm-password').value;
    if (!newPwd || !confirm) { showLoginError('Veuillez remplir les deux champs'); return; }
    if (newPwd.length < 6)   { showLoginError('Le mot de passe doit avoir au moins 6 caractères'); return; }
    if (newPwd !== confirm)  { showLoginError('Les mots de passe ne correspondent pas'); return; }
    const btn = document.getElementById('btn-save-password');
    btn.disabled = true; btn.textContent = 'Enregistrement...';
    const result = await window.elimuAPI.reinitialiserMotDePasse(username, reponseSecrete, newPwd);
    if (result.success) {
      container.innerHTML = `
        <div style="text-align:center;padding:20px 0;">
          <div style="font-size:48px;margin-bottom:12px;"></div>
          <h2 style="color:var(--green-fifa);margin-bottom:8px;">${t('forgot.success_title')}</h2>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
            ${t('forgot.success_desc')}
          </p>
          <button class="btn btn-primary" id="btn-aller-login" type="button"
                  style="justify-content:center;padding:10px 24px;">${t('forgot.go_login')}</button>
        </div>`;
      document.getElementById('btn-aller-login').addEventListener('click', () => renderLoginForm(container));
    } else {
      btn.disabled = false; btn.textContent = t('forgot.save');
      showLoginError(result.error || 'Erreur');
      if (result.error === 'Réponse incorrecte') {
        setTimeout(() => renderMotDePasseOublieEtape1(container), 1500);
      }
    }
  };
  document.getElementById('btn-save-password').addEventListener('click', go);
  document.getElementById('inp-confirm-password').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  document.getElementById('inp-new-password').focus();
}

// ============================================================
// AFFICHAGE DE L'APPLICATION APRÈS LOGIN
// ============================================================

async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  const appEl = document.getElementById('app');
  appEl.classList.remove('hidden');
  appEl.style.display = ''; // Retirer le display:none inline

  const user = appState.user;

  const initial  = (user.nom_complet || user.nom_utilisateur)[0].toUpperCase();
  const avatarEl = document.getElementById('user-avatar');
  const nameEl   = document.getElementById('user-name');
  if (avatarEl) avatarEl.textContent = initial;
  if (nameEl)   nameEl.textContent   = user.nom_complet || user.nom_utilisateur;

  const roleEl = document.getElementById('user-role');
  if (roleEl) {
    const labels = {
      admin:      t('role.admin'),
      enseignant: t('role.enseignant'),
      secretaire: t('role.secretaire'),
      comptable:  t('role.comptable')
    };
    roleEl.textContent = labels[user.role] || 'Utilisateur';
  }

  await refreshGlobalCache();
  buildSidebar();
  setupNavigation();

  const startSection = 'dashboard';
  await navigateTo(startSection);
}

// ============================================================
// SIDEBAR DYNAMIQUE
// ============================================================

function buildSidebar() {
  const role     = appState.user?.role || 'admin';
  const sections = getSectionsForRole(role);
  const nav      = document.querySelector('.sidebar-nav');
  if (!nav) return;

  const groupes = [
    { titreKey: 'nav.principal',     items: ['dashboard'] },
    { titreKey: 'nav.academique',    items: ['classes', 'eleves', 'import_export', 'parents','professeurs'] },
    { titreKey: 'nav.finance',       items: ['finance'] },
    { titreKey: 'nav.configuration', items: ['parametres'] }
  ];

  nav.innerHTML = groupes.map(g => {
    const itemsHTML = g.items
      .filter(id => sections[id])
      .map(id => `
        <div class="nav-item" data-section="${id}">
          <span class="nav-icon">${sections[id].icon}</span>
          <span>${sections[id].title}</span>
        </div>`)
      .join('');
    if (!itemsHTML) return '';
    return `<div class="nav-section-title">${t(g.titreKey)}</div>${itemsHTML}`;
  }).join('');
}

window.buildSidebar = buildSidebar;

async function refreshGlobalCache() {
  try {
    const [classes, matieres] = await Promise.all([
      window.elimuAPI.getClasses(),
      window.elimuAPI.getMatieres()
    ]);
    appState.classes  = Array.isArray(classes)  ? classes  : [];
    appState.matieres = Array.isArray(matieres) ? matieres : [];
    window.appState   = appState;
  } catch (e) {
    console.error('Erreur refreshGlobalCache:', e);
  }
}
window.refreshGlobalCache = refreshGlobalCache;

// ============================================================
// NAVIGATION AVEC VERROUILLAGE
// ============================================================

function setupNavigation() {
  const navListener = (e) => {
    if (isProcessing) {
      e.preventDefault();
      e.stopPropagation();
      showToast(t('toast.processing_wait'), 'warning');
      return false;
    }
    const item = e.target.closest('.nav-item');
    if (item?.dataset.section) navigateTo(item.dataset.section);
  };
  document.querySelector('.sidebar-nav')?.addEventListener('click', navListener);
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);

  // Sidebar toggle (responsive)
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn && sidebar && backdrop) {
    const closeSidebar = () => {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    };
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('open');
    });
    backdrop.addEventListener('click', closeSidebar);
    document.querySelector('.sidebar-nav')?.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item')) closeSidebar();
    });
  }
}

async function navigateTo(sectionId) {
  const role     = appState.user?.role || 'admin';
  const sections = getSectionsForRole(role);
  if (!sections[sectionId]) return;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = sections[sectionId].title;

  const actionsEl = document.getElementById('topbar-actions');
  if (actionsEl) actionsEl.innerHTML = '';

  appState.currentSection = sectionId;
  window.appState = appState;

  const contentArea = document.getElementById('content-area');
  contentArea.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  try {
    const htmlPath = `sections/${sectionId}/${sectionId}.html`;
    let htmlOk = false;
    try {
      const response = await fetch(htmlPath);
      if (response.ok) {
        contentArea.innerHTML = await response.text();
        htmlOk = true;
      }
    } catch {}

    if (!htmlOk) {
      contentArea.innerHTML = `
        <div class="empty-state animate-in">
          <div class="empty-icon">${sections[sectionId].icon}</div>
          <h3>${sections[sectionId].title}</h3>
          <p>Section en cours de développement</p>
        </div>`;
      return;
    }

    // Appliquer les traductions après injection du HTML de la section
    translatePage();

    try {
      const jsPath = `../../sections/${sectionId}/${sectionId}.js?t=${Date.now()}`;
      const module = await import(jsPath);
      if (module?.init) {
        await refreshGlobalCache();
        await module.init(window.appState);
      }
    } catch (e) {
      console.warn(`Module JS non trouvé pour "${sectionId}" :`, e.message);
    }

    // Émettre l'événement de section chargée (pour la salutation, etc.)
    document.dispatchEvent(new CustomEvent('elimu:section-loaded', { detail: { sectionId } }));

  } catch (error) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"></div>
        <h3>${t('common.error')}</h3>
        <p>${error.message}</p>
      </div>`;
    console.error(`Erreur section ${sectionId}:`, error);
  }
}

// ============================================================
// DÉCONNEXION AVEC RECHARGEMENT DE LA FENÊTRE
// ============================================================
function handleLogout() {
  if (!confirm(t('logout.confirm'))) return;
  // Demander au main process de redémarrer totalement l'application
  window.elimuAPI.relaunchApp?.();
}

// ============================================================
// UTILITAIRES GLOBAUX
// ============================================================

/**
 * Échappe les caractères HTML pour éviter les injections XSS
 */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
window.esc = esc;

window.showToast = function(message, type = 'info', duration = 3000) {
  const icons = { 
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>', 
    error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>', 
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>', 
    info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>' 
  };
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast     = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${esc(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
};

window.getNoteColor = function(note) {
  if (note === null || note === undefined) return 'muted';
  if (note >= 14) return 'green';
  if (note >= 10) return 'yellow';
  return 'red';
};

window.getStars = function(moyenne) {
  const count = !moyenne ? 0 :
    moyenne >= 18 ? 5 : moyenne >= 15 ? 4 :
    moyenne >= 12 ? 3 : moyenne >= 9  ? 2 : 1;
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="star ${i < count ? 'active' : ''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg></span>`
  ).join('');
};

window.formatDate = function(dateStr) {
  if (!dateStr) return '—';
  const locale = getCurrentLocale() === 'en' ? 'en-GB' : 'fr-FR';
  try { return new Date(dateStr).toLocaleDateString(locale); }
  catch { return dateStr; }
};

window.canAccess = function(sectionId) {
  const role = appState.user?.role || 'admin';
  return !!getSectionsForRole(role)[sectionId];
};

window.isAdmin = function() {
  return appState.user?.role === 'admin';
};

// ============================================================
// SÉLECTEUR DE THÈME & LANGUE (Quick Settings)
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const initDropdown = (btnId, menuId) => {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
      });
      document.addEventListener('click', () => menu.classList.remove('show'));
      menu.addEventListener('click', (e) => e.stopPropagation());
    }
  };

  initDropdown('btn-quick-settings', 'quick-settings-menu');
  initDropdown('btn-quick-settings-login', 'quick-settings-menu-login');

  // --- THÈMES ---
  const themeBtns = document.querySelectorAll('.theme-btn, .theme-btn-quick');
  const updateThemeUI = (theme) => {
    themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
  };

  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeUI(currentTheme);

  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      document.body.classList.add('theme-transitioning');
      setTimeout(() => document.body.classList.remove('theme-transitioning'), 400);
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('elimu-theme', theme);
      updateThemeUI(theme);
    });
  });

  // --- LANGUES ---
  const langBtns = document.querySelectorAll('.lang-btn-quick');
  const updateLangUI = (lang) => {
    langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  };

  updateLangUI(getCurrentLocale());

  langBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang = btn.dataset.lang;
      if (lang === getCurrentLocale()) return;
      
      await setLocale(lang);
      updateLangUI(lang);
      
      // Traduire les éléments statiques du DOM (placeholders, etc.)
      translatePage();
      
      // Reconstruction de la sidebar (pour les titres des menus)
      if (appState.user) {
        buildSidebar();
      }

      // Recharger la section active pour mettre à jour tout le contenu dynamique
      if (appState.currentSection) {
        navigateTo(appState.currentSection);
      } else {
        // Si on est sur l'écran de login, le rafraîchir
        initLogin();
      }
      
      // Notification
      const msg = lang === 'fr' ? 'Langue changée en Français' : 'Language changed to English';
      if (window.showToast) window.showToast(msg, 'success');
    });
  });

  // --- LANGUE DE GÉNÉRATION ---
  const genLangBtns = document.querySelectorAll('.gen-lang-btn-quick');
  const updateGenLangUI = (lang) => {
    genLangBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
  };

  updateGenLangUI(getCurrentGenLocale());

  genLangBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      if (lang === getCurrentGenLocale()) return;
      
      setGenLocale(lang);
      updateGenLangUI(lang);
      
      // Notification
      const msg = lang === 'fr' ? 'Langue de génération : Français' : 'Generation language: English';
      if (window.showToast) window.showToast(msg, 'success');
    });
  });

  // Ripple effect
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${e.clientX - rect.left - size / 2}px;
      top:  ${e.clientY - rect.top  - size / 2}px;
    `;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });

  // Salutation dynamique dans le dashboard
  const updateGreeting = () => {
    const el = document.getElementById('dash-greeting');
    if (!el) return;
    const h = new Date().getHours();
    const name = window.appState?.user?.nom_complet
              || window.appState?.user?.nom_utilisateur
              || '';
    const greetKey = h < 12 ? 'dashboard.greeting_morning'
                   : h < 18 ? 'dashboard.greeting_afternoon'
                   : 'dashboard.greeting_evening';
    el.textContent = `${t(greetKey)}${name ? ', ' + name.split(' ')[0] : ''}`;
  };

  document.addEventListener('elimu:section-loaded', updateGreeting);
});
