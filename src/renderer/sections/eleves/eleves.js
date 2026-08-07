
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
      const code = moy !== null ? window.curriculum.getNoteToCode(moy) : null;
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
        <div class="card-name">${esc(eleve.nom)} ${esc(eleve.prenom)}</div>
        ${eleve.matricule ? `<div class="card-class" style="font-size:10px;color:var(--text-muted);">${esc(eleve.matricule)}</div>` : ''}
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
  set('ef-matricule', e.matricule);
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
    matricule: document.getElementById('ef-matricule')?.value.trim() || null,
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
/** Retourne la couleur CSS associée à un code qualitatif */
function couleurQual(code) {
  switch (code) {
    case 'A+':  return 'var(--green-fifa)';
    case 'A':   return '#69f0ae';
    case 'ECA': return 'var(--yellow-fifa)';
    default:    return 'var(--red-fifa)';
  }
}

async function rafraichirProfil(eleveId, title, content) {
  // Charger détail élève
  const detail = await window.elimuAPI.getEleveDetail(eleveId);

  if (!detail?.eleve) {
    if (content) content.innerHTML = `<p style="color:var(--red-fifa);text-align:center;padding:20px;">${t('common.error')}</p>`;
    return;
  }

  const { eleve, notes: toutesNotes } = detail;
  if (title) title.textContent = `${eleve.nom} ${eleve.prenom}`;

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
          const poids = window.curriculum.getWeightsForSousCompetence(eleve.niveau_v2, item.code);
          if (!poids) return null;
          let total = 0, totalPoids = 0;
          for (const t of ['orale', 'ecrite', 'pratique', 'savoirEtre']) {
            const val = item.notes[t];
            const p = poids[t];
            if (val != null && p > 0) { total += val; totalPoids += p; }
          }
          return totalPoids > 0 ? (total / totalPoids) * 20 : null;
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
    const code = moy !== null ? window.curriculum.getNoteToCode(moy) : null;
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
          ${esc(eleve.nom)} ${esc(eleve.prenom)}
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin:4px 0 8px;
                    text-transform:uppercase;letter-spacing:0.8px;">
          ${esc(eleve.nom_classe || t('common.no_class'))}
        </div>
        ${eleve.matricule ? `<div style="font-size:10px;color:var(--text-muted);margin:-4px 0 4px;">Matricule: ${esc(eleve.matricule)}</div>` : ''}
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

      <!-- Zone droite : Notes -->
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

      section.innerHTML = `<div class="ua-grid">${
        Object.keys(parUA).sort().map(ua => {
          const comps = parUA[ua];
          return `
            <div class="ua-card">
              <div class="ua-title">${esc(ua)}</div>
              <div>${Object.keys(comps).sort().map(code => {
                const { agg, subs } = comps[code];
                const aggNote = agg ? agg.note : null;
                const aggQual = aggNote !== null ? window.curriculum.getNoteToCode(aggNote) : '—';
                const aggCol = aggQual === 'A+' ? 'var(--green-fifa)' : aggQual === 'A' ? '#69f0ae' : aggQual === 'ECA' ? 'var(--yellow-fifa)' : aggQual === 'NA' ? 'var(--red-fifa)' : 'var(--text-muted)';

                const niveauV2 = eleve.niveau_v2;
                const subsHtml = subs.map(s => {
                  const poids = window.curriculum.getWeightsForSousCompetence(niveauV2, code);
                  const maxPts = poids ? (poids[s.sous_type] || 0) : 20;
                  if (maxPts === 0) return '';
                  const noteReelle = s.note;
                  const noteSur20 = maxPts > 0 ? (s.note / maxPts) * 20 : 0;
                  const sq = window.curriculum.getNoteToCode(noteSur20);
                  const sc = sq === 'A+' ? '#00e676' : sq === 'A' ? '#69f0ae' : sq === 'ECA' ? '#f0b429' : '#ff4757';
                  return `<span class="sub-chip">
                    <span class="sub-chip-label">${labels[s.sous_type] || s.sous_type}:</span>
                    <span class="sub-chip-value" style="color:${sc};">${noteReelle.toFixed(1)}</span>
                    <span class="sub-chip-max">/${maxPts}</span>
                    <span class="sub-chip-qual" style="background:${sc}22;color:${sc};">${sq}</span>
                  </span>`;
                }).filter(Boolean).join('');

                const hasSubs = subsHtml.length > 0;

                return `
                  <div class="sc-row${hasSubs ? ' sc-has-subs' : ''}" data-code="${esc(code)}">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <span class="sc-code">${esc(code)}</span>
                      ${hasSubs ? '<span class="sc-expand">▼</span>' : ''}
                    </div>
                    <span class="agg-badge" style="background:${aggCol}22;color:${aggCol};">${aggQual}</span>
                  </div>
                  ${hasSubs ? `<div class="subs-container hidden">${subsHtml}</div>` : ''}`;
                }).join('')}
              </div>
            </div>`;
        }).join('')
      }</div>`;

    content.querySelectorAll('.sc-has-subs').forEach(el => {
      el.addEventListener('click', () => {
        const next = el.nextElementSibling;
        if (next) {
          next.classList.toggle('hidden');
          el.querySelector('.sc-expand')?.classList.toggle('open');
        }
      });
    });
    }
  };

  document.getElementById('profil-periode')?.addEventListener('change', renderNotes);
  if (!estQualitatifProfil) {
    document.getElementById('profil-sequence')?.addEventListener('change', renderNotes);
  }
  renderNotes();
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
  if (!confirm(t('eleves.delete_confirm').replace('{name}', `${eleve?.nom} ${eleve?.prenom}`))) return;

  const result = await window.elimuAPI.deleteEleve(id);
  if (result?.error) {
    showToast(t('common.error') + ' : ' + result.error, 'error');
  } else {
    showToast(t('eleves.delete_success'), 'success');
    window.elimuAPI.logAudit('DELETE_ELEVE', `Élève supprimé : ${eleve?.nom} ${eleve?.prenom} (ID: ${id})`, _state?.user?.id);
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

  // ★ Export liste élèves PDF
  document.getElementById('btn-export-liste-eleves')?.addEventListener('click', ouvrirModaleExportListe);
  document.getElementById('modal-export-liste-close')?.addEventListener('click', fermerModaleExportListe);
  document.getElementById('modal-export-liste-cancel')?.addEventListener('click', fermerModaleExportListe);
  document.getElementById('modal-export-liste')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-export-liste')) fermerModaleExportListe();
  });
  document.getElementById('export-liste-ok')?.addEventListener('click', executerExportListe);
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

// ============================================================
// EXPORT LISTE ÉLÈVES (PDF)
// ============================================================

function ouvrirModaleExportListe() {
  const modal = document.getElementById('modal-export-liste');
  const select = document.getElementById('export-liste-classe');
  if (!modal || !select) return;
  const classes = window.appState?.classes || [];
  const options = classes.map(c => `<option value="${c.id}">${esc(c.nom_classe)}</option>`).join('');
  select.innerHTML = `<option value="">${t('eleves.select_classe_placeholder')}</option>` + options;
  modal.style.display = 'flex';
}

function fermerModaleExportListe() {
  const modal = document.getElementById('modal-export-liste');
  if (modal) modal.style.display = 'none';
}

async function executerExportListe() {
  const select = document.getElementById('export-liste-classe');
  const btn = document.getElementById('export-liste-ok');
  const classeId = select?.value ? parseInt(select.value) : null;
  if (!classeId) {
    showToast(t('eleves.export_liste_no_classe'), 'error');
    return;
  }
  if (btn) { btn.disabled = true; }
  try {
    const lang = window.appState?.lang || 'fr';
    const result = await window.elimuAPI.exportListeEleves(classeId, _state?.user?.id, lang);
    if (result?.canceled) return;
    if (result?.error) {
      showToast(t('common.error') + ' : ' + result.error, 'error');
      return;
    }
    if (result?.success) {
      showToast(t('eleves.export_liste_success') + ' (' + (result.total || 0) + ')', 'success');
      fermerModaleExportListe();
    }
  } catch (err) {
    showToast(t('common.error') + ' : ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
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
