
/**
 * eleves.js - Gestion des élèves avec synchronisation globale
 */

import { t } from '../../locales/index.js';

/**
 * Formate un numéro de téléphone avec l'indicatif (ex: +237 690000000)
 */
function formatPhoneNumber(indicatif, numero) {
  // Garder uniquement les chiffres du numéro
  const cleanNum = String(numero || '').replace(/\D/g, '');
  if (!cleanNum) return '';
  return `${indicatif} ${cleanNum}`;
}

let tousLesEleves = [];
let filtreClasseId = null;
let filtreSexe     = '';
let eleveEnCoursId = null;
let paginePage = 1;          // page courante
let paginationInfo = null;   // { total, page, limit, pages }
let rechercheActuelle = '';  // texte de recherche en cours
let debounceTimer     = null;
let _state = null;

// ============================================================
// POINT D'ENTRÉE
// ============================================================

export async function init(state) {
  _state = state;
  attacherEvenements();
  remplirFiltreClasses(state.classes || []);
  await chargerEleves();

  // ★ ÉCOUTER les mises à jour de classes (si on modifie une classe
  //   pendant qu'on est dans la section élèves)
  document.addEventListener('elimu:classes-updated', onClassesUpdated);
}

/**
 * Quand les classes changent (ajout/modif/suppression depuis section Classes),
 * on met à jour uniquement le select de filtre sans tout recharger
 */
function onClassesUpdated(e) {
  const classes = e.detail?.classes || window.appState?.classes || [];
  remplirFiltreClasses(classes);

  // Mettre à jour aussi le select dans le formulaire d'ajout d'élève
  const selectForm = document.getElementById('ef-classe');
  if (selectForm) {
    const valActuelle = selectForm.value;
    const options = classes.map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`).join('');
    selectForm.innerHTML = `<option value="">${t('common.no_class')}</option>` + options;
    // Restaurer la sélection si elle existe encore
    if (valActuelle) selectForm.value = valActuelle;
  }
}

// ============================================================
// CHARGEMENT ET SYNCHRONISATION GLOBALE
// ============================================================

async function chargerEleves(classeId = null, page = 1) {
  const grid = document.getElementById('eleves-grid');
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px;">
    <div class="spinner"></div></div>`;

  const result = await window.elimuAPI.getElevesPagines(classeId, rechercheActuelle, page, 50, filtreSexe);
  if (result?.error || !result?.eleves) {
    // Fallback sur getEleves original si getElevesPagines échoue
    const _elv = await window.elimuAPI.getEleves(classeId);
    tousLesEleves = Array.isArray(_elv) ? _elv : [];
    paginationInfo = null;
  } else {
    tousLesEleves = result.eleves;
    paginationInfo = result.pagination;
    paginePage = page;
  }
  afficherEleves(tousLesEleves);
  _rendrePagination();
}

/**
 * Après toute modification, recharge depuis la BD et synchronise l'état global
 */
async function syncApresModification() {
  // Recharger la page courante depuis la BD
  const result = await window.elimuAPI.getElevesPagines(filtreClasseId, rechercheActuelle, paginePage, 50, filtreSexe);
  if (result?.eleves) {
    tousLesEleves = result.eleves;
    paginationInfo = result.pagination;
  } else {
    const _el = await window.elimuAPI.getEleves(filtreClasseId);
    tousLesEleves = Array.isArray(_el) ? _el : [];
    paginationInfo = null;
  }
  afficherEleves(tousLesEleves);
  _rendrePagination();

  // Recharger aussi les classes (les compteurs d'élèves peuvent avoir changé)
  const _cu = await window.elimuAPI.getClasses(); const classesUpdated = Array.isArray(_cu) ? _cu : [];
  if (window.appState) {
    window.appState.classes = classesUpdated;
  }

  // Notifier la section classes si elle est ouverte
  document.dispatchEvent(new CustomEvent('elimu:eleves-updated', {
    detail: { eleves: tousLesEleves }
  }));

  // Notifier la section parents que les liaisons peuvent avoir changé
  document.dispatchEvent(new CustomEvent('elimu:parents-updated'));
}

// ============================================================
// AFFICHAGE GRILLE ÉLÈVES
// ============================================================

function afficherEleves(eleves) {
  const grid = document.getElementById('eleves-grid');
  if (!grid) return;

  if (!eleves.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:18px;color:var(--text-secondary);">
          ${t('eleves.empty_title')}
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:6px;">
          ${t('eleves.empty_desc')}
        </div>
      </div>`;
    return;
  }

  // Utilisation de DocumentFragment pour une performance maximale (60 FPS)
  const fragment = document.createDocumentFragment();
  
  eleves.forEach(eleve => {
    const initiales = esc((eleve.prenom[0] + eleve.nom[0]).toUpperCase());
    const moy = eleve.moyenne_generale ? parseFloat(eleve.moyenne_generale) : null;
    const niveauV2 = eleve.niveau_v2 || null;
    const estQualitatif = niveauV2 === 'N1' || niveauV2 === 'N2';
    const sexeLabel = eleve.sexe ? (eleve.sexe === 'M' ? '♂' : '♀') : '';

    // ── Affichage du score selon le niveau ─────────────────────────
    let scoreHTML, couleurScore, etoiles;
    if (estQualitatif) {
      // N1 / N2 : Affichage du code qualitatif le plus représentatif
      const code = moy !== null ? getQualitativeCode(moy) : null;
      couleurScore = code ? couleurQual(code) : 'var(--text-muted)';
      scoreHTML = code
        ? `<span style="font-size:13px;font-weight:800;letter-spacing:1px;">${code}</span>`
        : `<span style="font-size:20px;">—</span>`;
      etoiles = genererEtoilesQual(code);
    } else {
      // N3 / Personnalisé : Affichage numérique sur 20
      couleurScore = !moy ? 'var(--text-muted)' : moy >= 14 ? 'var(--green-fifa)' : moy >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
      scoreHTML = moy ? moy.toFixed(1) : '—';
      etoiles = genererEtoiles(moy);
    }

    // ── Badge niveau (petit label discret en haut à droite) ────────
    const niveauBadge = niveauV2
      ? `<span style="position:absolute;top:5px;right:5px;font-size:9px;font-weight:700;
                    background:${estQualitatif ? 'rgba(33,150,243,0.18)' : 'rgba(0,230,118,0.12)'};
                    color:${estQualitatif ? 'var(--blue-fifa)' : 'var(--green-fifa)'};
                    border-radius:4px;padding:1px 5px;text-transform:uppercase;
                    letter-spacing:0.5px;">${niveauV2}</span>`
      : `<span style="position:absolute;top:5px;right:5px;font-size:12px;opacity:0.5;">${sexeLabel}</span>`;

    const card = document.createElement('div');
    card.className = 'eleve-card';
    card.dataset.id = eleve.id;
    card.innerHTML = `
        <div class="card-score" style="color:${esc(couleurScore)};">
          ${scoreHTML}
        </div>
        ${niveauBadge}
        <div class="card-avatar">${initiales}</div>
        <div class="card-name">${esc(eleve.prenom)} ${esc(eleve.nom)}</div>
        <div class="card-class">${esc(eleve.nom_classe || t('eleves.card_no_class'))}</div>
        <div style="display:flex;justify-content:center;gap:2px;margin-bottom:6px;">${etoiles}</div>
        <div class="card-actions">
          <button type="button" class="btn btn-sm btn-secondary"
                  data-action="voir" data-id="${esc(eleve.id)}" title="${t('common.search')}">Voir</button>
          <button type="button" class="btn btn-sm btn-secondary"
                  data-action="edit" data-id="${esc(eleve.id)}" title="${t('common.edit')}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger"
                  data-action="del" data-id="${esc(eleve.id)}" title="${t('common.delete')}">Suppr</button>
        </div>`;
    fragment.appendChild(card);
  });

  // Injection fluide via requestAnimationFrame pour éviter les saccades
  requestAnimationFrame(() => {
    grid.innerHTML = '';
    grid.appendChild(fragment);
  });

  // Délégation d'événements sur la grille (une seule fois)
  if (!grid.dataset.listenerAttached) {
    grid.addEventListener('click', gererClicGrille);
    grid.dataset.listenerAttached = 'true';
  }
}

function gererClicGrille(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'voir') ouvrirProfil(id);
    else if (btn.dataset.action === 'edit') ouvrirFormulaire(id);
    else if (btn.dataset.action === 'del') supprimerEleve(id);
    return;
  }
  const carte = e.target.closest('.eleve-card');
  if (carte) ouvrirProfil(parseInt(carte.dataset.id));
}

// ============================================================
// MODALE FORMULAIRE ÉLÈVE (AJOUT / MODIFICATION)
// ============================================================

function ouvrirFormulaire(eleveId = null) {
  eleveEnCoursId = eleveId;
  const modal = document.getElementById('modal-eleve');
  const title = document.getElementById('modal-eleve-title');
  const btnSave = document.getElementById('modal-eleve-save');
  if (!modal) return;

  reinitialiserFormulaire();
  cacherErreurForm();

  // Peupler le select des classes depuis le cache global
  const classes = window.appState?.classes || [];
  const selectClasse = document.getElementById('ef-classe');
  if (selectClasse) {
    selectClasse.innerHTML = `<option value="">${t('common.no_class')}</option>` +
      classes.map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`).join('');
  }

  // Mettre à jour le badge info classe
  majClasseInfo();

  if (eleveId) {
    title.textContent = t('eleves.modal_edit');
    btnSave.textContent = t('common.save');
    chargerDonneesFormulaire(eleveId);
  } else {
    title.textContent = t('eleves.modal_add');
    btnSave.textContent = t('eleves.btn_save');
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('ef-nom')?.focus(), 50);
}

function fermerFormulaire() {
  const modal = document.getElementById('modal-eleve');
  if (modal) modal.style.display = 'none';
  eleveEnCoursId = null;
  reinitialiserFormulaire();
}

function reinitialiserFormulaire() {
  ['ef-nom', 'ef-prenom', 'ef-parent', 'ef-tel', 'ef-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const n = document.getElementById('ef-naissance'); if (n) n.value = '';
  const c = document.getElementById('ef-classe'); if (c) c.value = '';
  const s = document.getElementById('ef-sexe'); if (s) s.value = 'M';
  // Cacher le badge info classe
  const info = document.getElementById('ef-classe-info');
  if (info) { info.style.display = 'none'; info.innerHTML = ''; }
}

async function chargerDonneesFormulaire(eleveId) {
  const detail = await window.elimuAPI.getEleveDetail(eleveId);
  if (!detail?.eleve) return;
  const e = detail.eleve;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('ef-nom', e.nom);
  set('ef-prenom', e.prenom);
  set('ef-naissance', e.date_naissance);
  set('ef-parent', e.nom_parent);
  set('ef-email', e.email_parent);
  set('ef-sexe', e.sexe || 'M');

  // Gérer le téléphone et l'indicatif (format: +XXX XXXXXXXX)
  const telComplet = e.telephone_parent || '';
  const match = telComplet.match(/^(\+\d+)\s+(.*)$/);
  if (match) {
    set('ef-indicatif', match[1]);
    set('ef-tel', match[2]);
  } else {
    // Si pas de format standard, on met tout dans le champ tel et +237 par défaut
    set('ef-indicatif', '+237');
    set('ef-tel', telComplet.replace(/^\+237\s*/, ''));
  }

  // Sélectionner la bonne classe
  const selectClasse = document.getElementById('ef-classe');
  if (selectClasse && e.classe_id) {
    selectClasse.value = e.classe_id;
    majClasseInfo();
  }
}

async function sauvegarderEleve() {
  cacherErreurForm();
  const nom = document.getElementById('ef-nom')?.value.trim();
  const prenom = document.getElementById('ef-prenom')?.value.trim();

  if (!nom || !prenom) {
    afficherErreurForm(t('profs.error_no_name'));
    return;
  }

  const data = {
    nom,
    prenom,
    date_naissance: document.getElementById('ef-naissance')?.value || null,
    sexe: document.getElementById('ef-sexe')?.value || 'M',
    classe_id: document.getElementById('ef-classe')?.value || null,
    nom_parent: document.getElementById('ef-parent')?.value.trim() || null,
    telephone_parent: formatPhoneNumber(
      document.getElementById('ef-indicatif')?.value || '+237',
      document.getElementById('ef-tel')?.value
    ) || null,
    email_parent: document.getElementById('ef-email')?.value.trim() || null
  };

  const btnSave = document.getElementById('modal-eleve-save');
  btnSave.disabled = true;
  btnSave.textContent = t('common.processing');

  const result = eleveEnCoursId
    ? await window.elimuAPI.updateEleve(eleveEnCoursId, data)
    : await window.elimuAPI.addEleve(data);

  btnSave.disabled = false;
  btnSave.textContent = eleveEnCoursId ? t('common.save') : t('eleves.btn_save');

  if (result?.error) {
    afficherErreurForm(t('common.error') + ' : ' + result.error);
    return;
  }

  showToast(eleveEnCoursId ? t('eleves.save_success_update') : t('eleves.save_success_add'), 'success');
  const action = eleveEnCoursId ? 'UPDATE_ELEVE' : 'ADD_ELEVE';
  window.elimuAPI.logAudit(action, `${eleveEnCoursId ? 'Élève modifié' : 'Élève ajouté'} : ${nom} ${prenom}`, _state?.user?.id);
  
  fermerFormulaire();

  // ★ SYNCHRONISATION après modification
  await syncApresModification();
}

// ============================================================
// MODALE PROFIL ÉLÈVE
// ============================================================

const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

// ID de l'élève dont le profil est ouvert (pour les sauvegardes inline)
let profilEleveId = null;

async function ouvrirProfil(eleveId) {
  profilEleveId = eleveId;
  const modal   = document.getElementById('modal-profil');
  const content = document.getElementById('profil-content');
  const title   = document.getElementById('profil-title');
  if (!modal || !content) return;

  content.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;">
    <div class="spinner"></div></div>`;
  modal.style.display = 'flex';

  await rafraichirProfil(eleveId, title, content);
}

/**
 * Convertit une note numérique en code qualitatif MINEDUB.
 * ATTENTION : ne s'applique QU'AUX niveaux N1 (SIL/CP) et N2 (CE1/CE2).
 * Seuils officiels (curriculum.js) :
 *   A+  ≥ 18
 *   A   ≥ 15
 *   ECA ≥ 11
 *   NA  ≤ 10
 */
function getQualitativeCode(note) {
  if (note >= 18) return 'A+';
  if (note >= 15) return 'A';
  if (note >= 11) return 'ECA';
  return 'NA';
}

/** Retourne la couleur CSS associée à un code qualitatif */
function couleurQual(code) {
  switch (code) {
    case 'A+':  return 'var(--green-fifa)';
    case 'A':   return '#69f0ae';
    case 'ECA': return 'var(--yellow-fifa)';
    default:    return 'var(--red-fifa)';
  }
}

const CURRICULUM_POIDS = {
  'N1': {
    '1A':  { orale: 20, ecrite: 15, pratique: 0,  savoirEtre: 5 },
    '1B':  { orale: 20, ecrite: 15, pratique: 0,  savoirEtre: 5 },
    '1C':  { orale: 10, ecrite: 5,  pratique: 3,  savoirEtre: 2 },
    '2A':  { orale: 5,  ecrite: 20, pratique: 0,  savoirEtre: 5 },
    '2B':  { orale: 5,  ecrite: 15, pratique: 5,  savoirEtre: 5 },
    '3A':  { orale: 3,  ecrite: 3,  pratique: 10, savoirEtre: 4 },
    '3B':  { orale: 5,  ecrite: 5,  pratique: 8,  savoirEtre: 2 },
    '4':   { orale: 5,  ecrite: 3,  pratique: 10, savoirEtre: 2 },
    '5':   { orale: 4,  ecrite: 10, pratique: 20, savoirEtre: 6 },
    '6A1': { orale: 2,  ecrite: 2,  pratique: 12, savoirEtre: 4 },
    '6A2': { orale: 3,  ecrite: 15, pratique: 0,  savoirEtre: 2 },
    '6B':  { orale: 2,  ecrite: 4,  pratique: 12, savoirEtre: 2 },
  },
  'N2': {
    '1A':  { orale: 12, ecrite: 15, pratique: 0,  savoirEtre: 3 },
    '1B':  { orale: 12, ecrite: 15, pratique: 0,  savoirEtre: 3 },
    '1C':  { orale: 10, ecrite: 8,  pratique: 2,  savoirEtre: 0 },
    '2A':  { orale: 8,  ecrite: 28, pratique: 0,  savoirEtre: 4 },
    '2B':  { orale: 6,  ecrite: 7,  pratique: 20, savoirEtre: 7 },
    '3A':  { orale: 3,  ecrite: 8,  pratique: 5,  savoirEtre: 4 },
    '3B':  { orale: 3,  ecrite: 9,  pratique: 5,  savoirEtre: 3 },
    '4':   { orale: 5,  ecrite: 2,  pratique: 11, savoirEtre: 2 },
    '5':   { orale: 4,  ecrite: 10, pratique: 20, savoirEtre: 6 },
    '6A1': { orale: 2,  ecrite: 2,  pratique: 12, savoirEtre: 4 },
    '6A2': { orale: 3,  ecrite: 15, pratique: 0,  savoirEtre: 2 },
    '6B':  { orale: 2,  ecrite: 4,  pratique: 12, savoirEtre: 2 },
  }
};

function getPoids(niveauV2, code) {
  return CURRICULUM_POIDS[niveauV2]?.[code] || null;
}

async function rafraichirProfil(eleveId, title, content) {
  // Charger détail élève + heures d'absence en parallèle
  const [detail, heures] = await Promise.all([
    window.elimuAPI.getEleveDetail(eleveId),
    window.elimuAPI.getHeuresAbsence(eleveId)
  ]);

  if (!detail?.eleve) {
    if (content) content.innerHTML = `<p style="color:var(--red-fifa);text-align:center;padding:20px;">${t('common.error')}</p>`;
    return;
  }

  const { eleve, notes: toutesNotes } = detail;
  if (title) title.textContent = `${eleve.prenom} ${eleve.nom}`;

  // ── Heures d'absence par trimestre (objet ou valeur par défaut) ─
  const hAbs = (heures && !heures.error) ? heures : { 'Trimestre 1': 0, 'Trimestre 2': 0, 'Trimestre 3': 0 };

  // ── Calcul de la moyenne générale ───────────────────────────────
  const estQualitatifProfil = eleve.niveau_v2 === 'N1' || eleve.niveau_v2 === 'N2';
  let moy = null;
  if (toutesNotes.length) {
    if (estQualitatifProfil) {
      const aggNotes = toutesNotes.filter(n => !n.sous_type && n.ua);
      if (aggNotes.length > 0) {
        moy = aggNotes.reduce((s, n) => s + n.note, 0) / aggNotes.length;
      } else {
        const parCode = {};
        toutesNotes.forEach(n => {
          if (n.sous_type && n.ua && n.sous_competence_code) {
            const key = n.ua + '|' + n.sous_competence_code;
            if (!parCode[key]) parCode[key] = { code: n.sous_competence_code, notes: {} };
            parCode[key].notes[n.sous_type] = n.note;
          }
        });
        const aggs = Object.values(parCode).map(item => {
          const poids = getPoids(eleve.niveau_v2, item.code);
          if (!poids) return null;
          let total = 0, totalPoids = 0;
          for (const t of ['orale', 'ecrite', 'pratique', 'savoirEtre']) {
            const val = item.notes[t];
            const p = poids[t];
            if (val != null && p > 0) { total += val * p; totalPoids += p; }
          }
          return totalPoids > 0 ? total / totalPoids : null;
        }).filter(v => v !== null);
        moy = aggs.length ? aggs.reduce((s, v) => s + v, 0) / aggs.length : null;
      }
    } else {
      // Pour N3 / Personnalisé, moyenne pondérée par les coefficients des matières
      let totalPoints = 0;
      let totalCoefficients = 0;
      toutesNotes.forEach(n => {
        const coeff = (n.coefficient !== undefined && n.coefficient !== null) ? parseFloat(n.coefficient) : 1.0;
        totalPoints += n.note * coeff;
        totalCoefficients += coeff;
      });
      moy = totalCoefficients > 0 ? totalPoints / totalCoefficients : null;
    }
  }
  const initiales = esc((eleve.prenom[0] + eleve.nom[0]).toUpperCase());

  let couleurScore, scoreAffiche, etoiles;
  if (estQualitatifProfil) {
    const code = moy !== null ? getQualitativeCode(moy) : null;
    couleurScore = code ? couleurQual(code) : 'var(--text-muted)';
    scoreAffiche = code || '—';
    etoiles = genererEtoilesQual(code);
  } else {
    couleurScore = !moy ? 'var(--text-muted)' : moy >= 14 ? 'var(--green-fifa)' : moy >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
    scoreAffiche = moy ? moy.toFixed(1) : '—';
    etoiles = genererEtoiles(moy);
  }

  // ── HTML principal ──────────────────────────────────────────────
  content.innerHTML = `
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start;">

      <!-- Carte identité -->
      <div style="background:var(--profil-card-bg, linear-gradient(160deg,#2a3147,#1a1e2c));
                  border:1px solid var(--border-color);border-radius:16px;
                  padding:20px;text-align:center;min-width:168px;flex-shrink:0;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:${estQualitatifProfil ? '28px' : '36px'};font-weight:800;
                    color:${couleurScore};margin-bottom:8px;letter-spacing:${estQualitatifProfil ? '2px' : '0'};">
          ${scoreAffiche}
        </div>
        ${estQualitatifProfil ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;">Niveau qualitatif</div>` : ''}
        <div style="width:62px;height:62px;border-radius:50%;
                    background:linear-gradient(135deg,var(--purple-fifa),var(--blue-fifa));
                    display:flex;align-items:center;justify-content:center;
                    font-size:24px;font-weight:700;color:white;margin:0 auto 10px;">
          ${initiales}
        </div>
        <div style="font-weight:700;font-size:14px;color:var(--text-primary);">
          ${esc(eleve.prenom)} ${esc(eleve.nom)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin:4px 0 8px;
                    text-transform:uppercase;letter-spacing:0.8px;">
          ${esc(eleve.nom_classe || t('common.no_class'))}
        </div>
        <div style="display:flex;justify-content:center;gap:2px;">${etoiles}</div>
        ${eleve.niveau_v2 ? `<div style="font-size:9px;font-weight:700;margin-top:6px;padding:2px 8px;border-radius:4px;
          background:${estQualitatifProfil ? 'rgba(33,150,243,0.18)' : 'rgba(0,230,118,0.12)'};
          color:${estQualitatifProfil ? 'var(--blue-fifa)' : 'var(--green-fifa)'};
          text-transform:uppercase;letter-spacing:0.5px;">${eleve.niveau_v2}</div>` : ''}
        ${eleve.nom_parent || eleve.telephone_parent || eleve.date_naissance ? `
        <div style="margin-top:12px;border-top:1px solid var(--border-color);padding-top:10px;text-align:left;">
          ${eleve.nom_parent ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">Parent: ${esc(eleve.nom_parent)}</div>` : ''}
          ${eleve.telephone_parent ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">Tel: ${esc(eleve.telephone_parent)}</div>` : ''}
          ${eleve.date_naissance ? `<div style="font-size:11px;color:var(--text-muted);">Né le: ${esc(eleve.date_naissance)}</div>` : ''}
        </div>` : ''}
      </div>

      <!-- Zone droite : Notes + Absences -->
      <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:16px;">

        <!-- Filtres notes -->
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="profil-periode" class="input" style="flex:1;">
            <option value="">${t('eleves.profil_notes_filter_periode')}</option>
            ${PERIODES.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          ${!estQualitatifProfil ? `
          <select id="profil-sequence" class="input" style="flex:1;">
            <option value="0">${t('eleves.profil_notes_filter_sequence')}</option>
            <option value="1">${t('dashboard.sequence1')}</option>
            <option value="2">${t('dashboard.sequence2')}</option>
          </select>` : ''}
        </div>

        <!-- Notes par matière -->
        <div id="profil-notes-section"></div>

        <!-- ─── Absences par trimestre ─────────────────────── -->
        <div style="border-top:1px solid var(--border-color);padding-top:14px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:600;
                        color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">
              ${t('eleves.profil_absences_title')}
            </div>
            <button type="button" class="btn btn-sm btn-secondary" id="btn-abs-save-all"
                    style="font-size:11px;padding:4px 10px;">
              ${t('eleves.profil_absences_save_all')}
            </button>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
            ${PERIODES.map(p => {
              const h = hAbs[p] || 0;
              const col = h === 0 ? 'var(--green-fifa)' : h < 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
              const bg  = h === 0 ? 'rgba(0,230,118,0.06)' : h < 10 ? 'rgba(255,183,77,0.06)' : 'rgba(255,82,82,0.06)';
              const borderCol = h === 0 ? 'rgba(0,230,118,0.25)' : h < 10 ? 'rgba(255,183,77,0.3)' : 'rgba(255,82,82,0.3)';
              return `
                <div style="background:${bg};border:1px solid ${borderCol};
                            border-radius:10px;padding:12px;">
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;
                              letter-spacing:0.5px;margin-bottom:8px;font-weight:600;">${p}</div>
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <input type="number"
                           id="abs-h-${p.replace(/ /g, '-')}"
                           class="input abs-input" min="0" max="9999" step="0.5"
                           data-periode="${p}"
                           value="${h}"
                           style="flex:1;text-align:center;font-family:'Rajdhani',sans-serif;
                                  font-size:22px;font-weight:700;color:${col};
                                  padding:6px 4px;border-color:${col}44;background:${col}0d;">
                    <span style="font-size:11px;color:var(--text-muted);flex-shrink:0;">${t('eleves.profil_absences_total_hours')}</span>
                  </div>
                  <div class="abs-sanction-label" id="abs-sanction-${p.replace(/ /g, '-')}"
                       style="font-size:10px;color:var(--text-muted);min-height:14px;line-height:1.4;">
                  </div>
                  <button type="button"
                          class="btn btn-sm btn-secondary abs-save-btn"
                          data-periode="${p}"
                          style="width:100%;margin-top:8px;font-size:11px;padding:5px;">
                    ${t('eleves.profil_absences_save')}
                  </button>
                </div>`;
            }).join('')}
          </div>

          <!-- Résumé total absences -->
          <div id="abs-total-recap" style="padding:8px 12px;border-radius:8px;
               background:var(--bg-secondary);border:1px solid var(--border-color);
               font-size:12px;color:var(--text-muted);display:flex;gap:16px;flex-wrap:wrap;">
          </div>

          <div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5;">
            ${t('eleves.profil_absences_hint')}
          </div>
        </div>
      </div>
    </div>`;

  // ── Rendu des notes filtrable ────────────────────────────────
  const renderNotes = () => {
    const periode   = document.getElementById('profil-periode')?.value;
    const sequence  = parseInt(document.getElementById('profil-sequence')?.value) || 0;
    let filtrees    = toutesNotes;
    if (periode)      filtrees = filtrees.filter(n => n.periode   === periode);
    if (sequence > 0) filtrees = filtrees.filter(n => n.sequence  === sequence);

    const section = document.getElementById('profil-notes-section');
    if (!section) return;

    if (!filtrees.length) {
      section.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">${t('eleves.profil_absences_placeholder')}</p>`;
      return;
    }

    if (!estQualitatifProfil) {
      // --- RENDU CLASSIQUE N3 (Matières) ---
      const parMatiere = {};
      filtrees.forEach(n => {
        if (!parMatiere[n.nom_matiere]) parMatiere[n.nom_matiere] = [];
        parMatiere[n.nom_matiere].push(n);
      });
      section.innerHTML = Object.keys(parMatiere).map(mat => {
        const notes    = parMatiere[mat];
        const moyMat   = notes.reduce((s, n) => s + n.note, 0) / notes.length;
        const col      = moyMat >= 14 ? 'var(--green-fifa)' : moyMat >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
        const pct      = (moyMat / 20) * 100;
        return `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="font-size:12.5px;color:var(--text-secondary);">${esc(mat)}</span>
              <span style="font-weight:700;color:${col};font-size:13px;">${moyMat.toFixed(2)}/20</span>
            </div>
            <div style="height:6px;background:var(--bg-secondary);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${col};border-radius:3px;"></div>
            </div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:3px;">
              ${notes.map(n => `Séq ${n.sequence} : <strong style="color:${col};">${n.note}</strong>`).join(' · ')}
            </div>
          </div>`;
      }).join('');
    } else {
      // --- RENDU N1/N2 (UA et Compétences avec sous-types) ---
      const SOUS_TYPES = ['orale', 'ecrite', 'pratique', 'savoirEtre'];
      const labels = { orale: 'Orale', ecrite: 'Écrite', pratique: 'Pratique', savoirEtre: 'Savoir-Être' };

      // Séparer lignes agrégées (aggregate) des sous-types
      const parUA = {};
      filtrees.forEach(n => {
        const ua = n.ua || 'Inconnu';
        if (!parUA[ua]) parUA[ua] = {};
        const code = n.sous_competence_code || 'Inconnu';
        if (!parUA[ua][code]) parUA[ua][code] = { agg: null, subs: [] };
        if (!n.sous_type) {
          parUA[ua][code].agg = n;
        } else {
          parUA[ua][code].subs.push(n);
        }
      });

      section.innerHTML = Object.keys(parUA).sort().map(ua => {
        const comps = parUA[ua];
        return `
          <div style="margin-bottom:14px; background:var(--bg-secondary); border-radius:12px; padding:10px; border:1px solid var(--border-color);">
            <div style="font-family:'Rajdhani',sans-serif; font-weight:700; color:var(--blue-fifa); font-size:12px; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
              ${esc(ua)}
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              ${Object.keys(comps).sort().map(code => {
                const { agg, subs } = comps[code];
                const aggNote = agg ? agg.note : null;
                const aggQual = aggNote !== null ? getQualitativeCode(aggNote) : '—';
                const aggCol = aggQual === 'A+' ? 'var(--green-fifa)' : aggQual === 'A' ? '#69f0ae' : aggQual === 'ECA' ? 'var(--yellow-fifa)' : aggQual === 'NA' ? 'var(--red-fifa)' : 'var(--text-muted)';

                const niveauV2 = eleve.niveau_v2;
                const subsHtml = subs.map(s => {
                  const poids = getPoids(niveauV2, code);
                  const maxPts = poids ? (poids[s.sous_type] || 0) : 20;
                  if (maxPts === 0) return '';
                  const noteReelle = (s.note / 20) * maxPts;
                  const sq = getQualitativeCode(s.note);
                  const sc = sq === 'A+' ? '#00e676' : sq === 'A' ? '#69f0ae' : sq === 'ECA' ? '#f0b429' : '#ff4757';
                  return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);">
                    ${labels[s.sous_type] || s.sous_type}:
                    <strong style="color:${sc};">${noteReelle.toFixed(1)}</strong>
                    <span style="font-size:8px;opacity:0.5;">/${maxPts}</span>
                    <span style="background:${sc}22;color:${sc};padding:0 4px;border-radius:3px;font-weight:700;font-size:9px;">${sq}</span>
                  </span>`;
                }).filter(Boolean).join('');

                return `
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; padding:5px 8px; border-bottom:1px solid rgba(255,255,255,0.04); border-radius:6px; cursor:pointer; transition:background 0.15s;"
                       onclick="this.nextElementSibling?.classList?.toggle('hidden')"
                       onmouseover="this.style.background='var(--bg-hover)'"
                       onmouseout="this.style.background='transparent'">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="color:var(--text-secondary); font-weight:600;">${esc(code)}</span>
                      <span style="font-size:8px; color:var(--text-muted); opacity:0.6;">▼</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span class="note-badge" style="background:${aggCol}22; color:${aggCol}; font-size:11px; font-weight:800; letter-spacing:0.5px;">${aggQual}</span>
                    </div>
                  </div>
                   <div class="hidden" style="padding:6px 8px 8px 20px; background:rgba(0,0,0,0.08); border-radius:0 0 6px 6px; margin-top:-1px;">
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                      ${subsHtml}
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>`;
      }).join('');
    }
  };

  document.getElementById('profil-periode')?.addEventListener('change', renderNotes);
  if (!estQualitatifProfil) {
    document.getElementById('profil-sequence')?.addEventListener('change', renderNotes);
  }
  renderNotes();


  // ── Charger le barème d'absences ────────────────────────────
  let reglesAbsences = [];
  try {
    const reglesResult = await window.elimuAPI.getReglesAbsences?.();
    reglesAbsences = Array.isArray(reglesResult) ? reglesResult : [];
  } catch {}

  // ── Fonction utilitaire : trouver la sanction selon les heures ──
  const getSanction = (heures) => {
    if (!reglesAbsences.length || heures === 0) return null;
    const sorted = [...reglesAbsences].sort((a, b) => a.de - b.de);
    return sorted.find(r => heures >= r.de && heures <= (r.a >= 999 ? Infinity : r.a)) || null;
  };

  const GRAVITE_COLORS = {
    observation:   '#ffb74d',
    avertissement: '#ff9800',
    grave:         '#ff5252',
    critique:      '#b71c1c'
  };

  // ── Mise à jour couleurs + sanction live à la saisie ─────────
  const majCouleurInput = (inp) => {
    const h   = parseFloat(inp.value) || 0;
    const col = h === 0 ? 'var(--green-fifa)' : h < 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
    inp.style.color       = col;
    inp.style.borderColor = col + '44';
    inp.style.background  = col + '0d';

    // Mettre à jour la sanction suggérée
    const periode    = inp.dataset.periode;
    const labelId    = `abs-sanction-${periode.replace(/ /g, '-')}`;
    const labelEl    = document.getElementById(labelId);
    if (labelEl) {
      const sanction = getSanction(h);
      if (sanction) {
        const gc = GRAVITE_COLORS[sanction.gravite] || '#ff9800';
        labelEl.innerHTML = `<span style="color:${gc};font-weight:600;">${t('eleves.profil_absences_sanction').replace('{sanction}', esc(sanction.sanction))}</span>`;
      } else {
        labelEl.textContent = h === 0 ? t('eleves.profil_absences_no_sanction') : '';
      }
    }
  };

  content.querySelectorAll('.abs-input').forEach(inp => {
    majCouleurInput(inp); // Initialisation
    inp.addEventListener('input', () => majCouleurInput(inp));
  });

  // ── Récap total ──────────────────────────────────────────────
  const majRecap = () => {
    const recap = document.getElementById('abs-total-recap');
    if (!recap) return;
    let total = 0;
    PERIODES.forEach(p => {
      const v = parseFloat(document.getElementById(`abs-h-${p.replace(/ /g, '-')}`)?.value) || 0;
      total += v;
    });
    const col = total === 0 ? 'var(--green-fifa)' : total < 20 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
    recap.innerHTML = `
      <span>${t('eleves.profil_absences_total_annual')}</span>
      <strong style="color:${col};">${total}${t('eleves.profil_absences_total_hours')}</strong>
    `;
  };
  content.querySelectorAll('.abs-input').forEach(inp =>
    inp.addEventListener('input', majRecap)
  );
  majRecap();

  // ── Bouton "Tout enregistrer" ────────────────────────────────
  document.getElementById('btn-abs-save-all')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-abs-save-all');
    btn.disabled = true; btn.textContent = '⏳...';
    let ok = 0, erreur = 0;
    for (const periode of PERIODES) {
      const inputId = `abs-h-${periode.replace(/ /g, '-')}`;
      const heures  = parseFloat(document.getElementById(inputId)?.value) || 0;
      const result  = await window.elimuAPI.saveHeuresAbsence({ eleve_id: eleveId, periode, heures });
      if (result?.error) erreur++; else ok++;
    }
    btn.disabled = false; btn.textContent = t('eleves.profil_absences_save_all');
    if (erreur === 0) showToast(t('eleves.profil_absences_all_saved').replace('{ok}', ok), 'success');
    else showToast(t('eleves.profil_absences_all_error').replace('{erreur}', erreur), 'error');
  });

  // ── Boutons "Enregistrer" individuels ────────────────────────
  content.querySelectorAll('.abs-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const periode = btn.dataset.periode;
      const inputId = `abs-h-${periode.replace(/ /g, '-')}`;
      const heures  = parseFloat(document.getElementById(inputId)?.value) || 0;

      btn.disabled    = true;
      btn.textContent = '⏳';

      const result = await window.elimuAPI.saveHeuresAbsence({
        eleve_id: eleveId,
        periode,
        heures
      });

      btn.disabled    = false;
      btn.textContent = t('eleves.profil_absences_save');

      if (result?.error) {
        showToast(t('common.error') + ' : ' + result.error, 'error');
      } else {
        showToast(t('eleves.profil_absences_saved').replace('{periode}', periode).replace('{heures}', heures), 'success');
      }
    });
  });
}

function fermerProfil() {
  const modal = document.getElementById('modal-profil');
  if (modal) modal.style.display = 'none';
  profilEleveId = null;
}

// ============================================================
// SUPPRESSION
// ============================================================

async function supprimerEleve(id) {
  const eleve = tousLesEleves.find(e => e.id === id);
  if (!confirm(t('eleves.delete_confirm').replace('{name}', `${eleve?.prenom} ${eleve?.nom}`))) return;

  const result = await window.elimuAPI.deleteEleve(id);
  if (result?.error) {
    showToast(t('common.error') + ' : ' + result.error, 'error');
  } else {
    showToast(t('eleves.delete_success'), 'success');
    window.elimuAPI.logAudit('DELETE_ELEVE', `Élève supprimé : ${eleve?.prenom} ${eleve?.nom} (ID: ${id})`, _state?.user?.id);
    // ★ SYNCHRONISATION après suppression
    await syncApresModification();
  }
}

// ============================================================
// PAGINATION
// ============================================================

function _rendrePagination() {
  // Supprimer l'ancienne pagination si elle existe
  document.getElementById('eleves-pagination')?.remove();
  if (!paginationInfo || paginationInfo.pages <= 1) return;

  const { page, pages, total, limit } = paginationInfo;
  const debut = (page - 1) * limit + 1;
  const fin   = Math.min(page * limit, total);

  const div = document.createElement('div');
  div.id = 'eleves-pagination';
  div.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin-top:20px;flex-wrap:wrap;';
  div.innerHTML = `
    <span style="font-size:12px;color:var(--text-muted);">${debut}–${fin} sur ${total}</span>
    <button class="btn btn-sm btn-secondary" id="pg-prev" ${page <= 1 ? 'disabled' : ''}>◀</button>
    <span style="font-size:13px;color:var(--text-primary);font-family:'Rajdhani',sans-serif;font-weight:700;">
      ${page} / ${pages}
    </span>
    <button class="btn btn-sm btn-secondary" id="pg-next" ${page >= pages ? 'disabled' : ''}>▶</button>`;

  const grid = document.getElementById('eleves-grid');
  grid?.after(div);

  div.querySelector('#pg-prev')?.addEventListener('click', () => chargerEleves(filtreClasseId, paginePage - 1));
  div.querySelector('#pg-next')?.addEventListener('click', () => chargerEleves(filtreClasseId, paginePage + 1));
}

// ============================================================
// RECHERCHE + FILTRE CLASSE
// ============================================================

function filtrerEleves() {
  rechercheActuelle = document.getElementById('search-eleves')?.value.trim() || '';
  paginePage = 1;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    chargerEleves(filtreClasseId, 1);
  }, 350);
}

// ============================================================
// ÉVÉNEMENTS (tous attachés après chargement du DOM)
// ============================================================

function attacherEvenements() {
  document.getElementById('btn-add-eleve')?.addEventListener('click', () => ouvrirFormulaire(null));

  document.getElementById('modal-eleve-close')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-eleve-cancel')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-eleve')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-eleve')) fermerFormulaire();
  });
  document.getElementById('modal-eleve-save')?.addEventListener('click', sauvegarderEleve);

  document.getElementById('modal-profil-close')?.addEventListener('click', fermerProfil);
  document.getElementById('modal-profil')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-profil')) fermerProfil();
  });

  document.getElementById('search-eleves')?.addEventListener('input', filtrerEleves);

  document.getElementById('ef-tel')?.addEventListener('input', (e) => {
    // Nettoyer la saisie : ne garder que les chiffres
    const val = e.target.value.replace(/\D/g, '');
    // Limiter à 12 chiffres (suffisant pour la plupart des pays africains + France)
    e.target.value = val.substring(0, 12);
  });

  // ★ Badge info classe dans le formulaire d'ajout/édition
  document.getElementById('ef-classe')?.addEventListener('change', majClasseInfo);

  document.getElementById('filter-classe')?.addEventListener('change', async e => {
    filtreClasseId = e.target.value ? parseInt(e.target.value) : null;
    paginePage = 1;
    await chargerEleves(filtreClasseId, 1);
  });

  document.getElementById('filter-sexe')?.addEventListener('change', async e => {
    filtreSexe = e.target.value || '';
    paginePage = 1;
    await chargerEleves(filtreClasseId, 1);
  });
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Met à jour le badge info sous le select de classe dans le formulaire.
 * Affiche le système d'évaluation (Qualitatif N1/N2, Quantitatif N3, Personnalisé).
 */
function majClasseInfo() {
  const select = document.getElementById('ef-classe');
  const info = document.getElementById('ef-classe-info');
  if (!select || !info) return;

  const classeId = parseInt(select.value);
  if (!classeId) {
    info.style.display = 'none';
    info.innerHTML = '';
    return;
  }

  const classes = window.appState?.classes || [];
  const classe = classes.find(c => c.id === classeId);
  if (!classe) {
    info.style.display = 'none';
    return;
  }

  const nv = classe.niveau_v2;
  let label, bgColor, textColor;

  if (nv === 'N1' || nv === 'N2') {
    label = `📋 ${nv} — Évaluation qualitative (NA / ECA / A / A+) · 8 UA · 320 pts`;
    bgColor = 'rgba(33,150,243,0.12)';
    textColor = 'var(--blue-fifa)';
  } else if (nv === 'N3') {
    label = `📊 ${nv} — Évaluation quantitative (notes /20) · 3 trimestres · 6 séquences`;
    bgColor = 'rgba(0,230,118,0.10)';
    textColor = 'var(--green-fifa)';
  } else {
    label = `🔧 Personnalisé — Configuration libre des matières et coefficients`;
    bgColor = 'rgba(255,183,77,0.10)';
    textColor = 'var(--yellow-fifa)';
  }

  info.style.display = 'block';
  info.style.background = bgColor;
  info.style.color = textColor;
  info.style.fontWeight = '600';
  info.innerHTML = label;
}

function remplirFiltreClasses(classes) {
  const select = document.getElementById('filter-classe');
  if (!select) return;
  const options = classes.map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`).join('');
  select.innerHTML = `<option value="">${t('eleves.filter_class')}</option>` + options;
}

function genererEtoiles(moyenne) {
  const n = !moyenne ? 0 : moyenne >= 18 ? 5 : moyenne >= 15 ? 4 : moyenne >= 12 ? 3 : moyenne >= 9 ? 2 : 1;
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="font-size:12px;color:${i < n ? 'var(--gold)' : 'var(--text-muted)'};">★</span>`
  ).join('');
}

function genererEtoilesQual(code) {
  const mapping = { 'A+': 5, 'A': 4, 'ECA': 3, 'NA': 1 };
  const n = mapping[code] || 0;
  return Array.from({ length: 5 }, (_, i) =>
    `<span style="font-size:12px;color:${i < n ? 'var(--gold)' : 'var(--text-muted)'};">★</span>`
  ).join('');
}

function afficherErreurForm(msg) {
  const el = document.getElementById('form-error');
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function cacherErreurForm() {
  const el = document.getElementById('form-error');
  if (el) el.style.display = 'none';
}
