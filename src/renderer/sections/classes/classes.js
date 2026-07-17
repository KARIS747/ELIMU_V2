/**
 * classes.js - Gestion des classes avec configuration par classe
 *
 * Chaque classe possède dans matieres_json un tableau d'objets :
 * [{ id, nom, coefficient, enseignant, groupe }, ...]
 *
 * Les coefficients, enseignants et groupes sont PROPRES à chaque classe.
 */

import { t } from '../../locales/index.js';
import { CLASS_TEMPLATES } from './templates.js';

let _state            = null;

// Helper to check if a class is a preset (fixed curriculum)
function estClassePreset(nomClasse) {
  return ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].includes(nomClasse);
}

// Get the fixed list of subjects for preset classes
function getMatieresPourPreset(preset, systeme = 'francophone') {
  if (preset === 'SIL' || preset === 'CP') {
    const competences = CLASS_TEMPLATES.template_SIL.competences;
    const list = [];
    competences.forEach(comp => {
      comp.sous_competences.forEach(sc => {
        list.push({
          id: null,
          nom: sc.nom,
          coefficient: 1,
          enseignant: '',
          groupe: comp.nom,
          principal: false
        });
      });
    });
    return list;
  }
  
  if (preset === 'CE1' || preset === 'CE2') {
    const competences = CLASS_TEMPLATES.template_CE1.competences;
    const list = [];
    competences.forEach(comp => {
      comp.sous_competences.forEach(sc => {
        list.push({
          id: null,
          nom: sc.nom,
          coefficient: 1,
          enseignant: '',
          groupe: comp.nom,
          principal: false
        });
      });
    });
    return list;
  }

  if (preset === 'CM1' || preset === 'CM2') {
    const list = [];
    const subjects = [
      { nom: 'Dictée', groupe: 'Français' },
      { nom: 'Question / Vocabulaire', groupe: 'Français' },
      { nom: 'Etude de Texte', groupe: 'Français' },
      { nom: 'Production d\'écrits', groupe: 'Français' },
      { nom: 'Ecriture et Présentation', groupe: 'Français' },
      { nom: 'Copie', groupe: 'Français' },
      { nom: 'Connaissance du Français', groupe: 'Français' },
      { nom: 'Calcul rapide', groupe: 'Mathématiques' },
      { nom: 'Exercices / Mathématiques', groupe: 'Mathématiques' },
      { nom: 'Problèmes', groupe: 'Mathématiques' },
      { nom: 'Connaissances Gén. / Ed. Civique', groupe: 'Eveil & Environnement' },
      { nom: 'Science éduc. à l\'environnement', groupe: 'Eveil & Environnement' },
      { nom: 'Lecture', groupe: 'Lecture & Expression' },
      { nom: 'Langage / Hygiène', groupe: 'Lecture & Expression' },
      { nom: 'Chant et récitation', groupe: 'Lecture & Expression' },
      { nom: 'Activités Pratiques / Dessin', groupe: 'Activités Pratiques & Sport' },
      { nom: 'EPS (Education Physique et Sportive)', groupe: 'Activités Pratiques & Sport' },
      { nom: 'Informatique', groupe: 'Informatique' },
      { nom: 'Grammar and Vocabulary', groupe: 'Anglais (Bilingue)' },
      { nom: 'Reading Comprehension', groupe: 'Anglais (Bilingue)' },
      { nom: 'Dictation (Anglais)', groupe: 'Anglais (Bilingue)' },
      { nom: 'Reading', groupe: 'Anglais (Bilingue)' }
    ];
    subjects.forEach(s => {
      list.push({
        id: null,
        nom: s.nom,
        coefficient: 1,
        enseignant: '',
        groupe: s.groupe,
        principal: false
      });
    });
    return list;
  }
  
  return [];
}
let toutesLesClasses  = [];
let toutesLesMatieres = [];
let classeEnCoursId   = null;

// Listes de matières par défaut par système
const LISTE_FRANCOPHONE = [
  { groupe: 'Langues & Littérature', matieres: ['Français', 'Anglais', 'Littérature', 'Langues Nationales', 'Latin', 'Grec', 'Allemand', 'Espagnol', 'Chinois', 'Italien'] },
  { groupe: 'Sciences', matieres: ['Mathématiques', 'Maths Techniques', 'Physique', 'Chimie', 'SVT', 'Sciences de la Vie et de la Terre', 'Sciences Physiques', 'Informatique', 'TIC', 'Biologie', 'Géologie'] },
  { groupe: 'Sciences Humaines', matieres: ['Histoire', 'Géographie', 'Éducation à la Citoyenneté (ECM)', 'Philosophie', 'Éducation Civique', 'Droit', 'Économie', 'Comptabilité', 'Sociologie'] },
  { groupe: 'Arts, Sport & Vie', matieres: ['Arts Plastiques', 'Musique', 'EPS (Sport)', 'Travail Manuel', 'Économie Sociale et Familiale', 'Cuisine', 'Couture', 'Éducation à la Santé', 'Morale'] }
];

const LISTE_ANGLOPHONE = [
  { groupe: 'Languages & Arts', matieres: ['English Language', 'English Literature', 'French', 'Latin', 'Fine Arts', 'Music', 'German', 'Spanish', 'Language Arts'] },
  { groupe: 'Sciences & Math', matieres: ['Mathematics', 'Further Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Integrated Science', 'ICT', 'Technical Drawing', 'Anatomy'] },
  { groupe: 'Humanities', matieres: ['History', 'Geography', 'Religious Studies', 'Civics', 'Citizenship', 'Philosophy', 'Economics', 'Commerce', 'Social Studies', 'Logic'] },
  { groupe: 'Vocational & Life', matieres: ['Physical Education', 'Manual Labor', 'Home Economics', 'Accounting', 'Office Practice', 'Food and Nutrition', 'Textiles', 'Health Education', 'Woodwork'] }
];

// État temporaire pour la création/édition de classe
let matieresPersonnalisees = []; 

// État de la modale config
let configClasseId    = null;
let configMatieres    = [];  // [ { id, nom, actif, coefficient, enseignant, groupe, principal } ]
let configGroupes     = [];  // [ { nom } ]
let configGroupeSelIdx = null;

// ============================================================
// POINT D'ENTRÉE
// ============================================================

export async function init(state) {
  _state = state;
  const raw = await window.elimuAPI.getMatieres();
  toutesLesMatieres = Array.isArray(raw) ? raw : [];
  
  const root = document.getElementById('classes-root');
  if (root && !root._eventsAttached) {
    attacherEvenements();
    root._eventsAttached = true;
  }

  await chargerClasses();
  if (!toutesLesMatieres.length) {
    setTimeout(async () => {
      const retry = await window.elimuAPI.getMatieres();
      toutesLesMatieres = Array.isArray(retry) ? retry : [];
    }, 600);
  }
}

// ============================================================
// CHARGEMENT + SYNCHRONISATION GLOBALE
// ============================================================

async function chargerClasses() {
  const grid = document.getElementById('classes-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px;">
    <div class="spinner"></div></div>`;
  const _cls = await window.elimuAPI.getClasses();
  toutesLesClasses = Array.isArray(_cls) ? _cls : [];
  await syncGlobal();
  afficherKPIs(toutesLesClasses);
  afficherClasses(toutesLesClasses);
}

async function syncGlobal() {
  const _raw = await window.elimuAPI.getClasses();
  const classes = Array.isArray(_raw) ? _raw : [];
  toutesLesClasses = classes;
  if (window.appState) window.appState.classes = classes;
  document.dispatchEvent(new CustomEvent('elimu:classes-updated', { detail: { classes } }));
}

// ============================================================
// PARSING matieres_json — nouveau format enrichi
// ============================================================

/**
 * Parse matieres_json → tableau d'objets enrichis
 * Supporte l'ancien format (tableau de strings) et le nouveau (tableau d'objets)
 */
function parseMatieresJson(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      if (typeof item === 'string') {
        // Ancien format : juste un nom de matière
        return { id: null, nom: item, coefficient: 1, enseignant: '', groupe: '', principal: false };
      }
      return {
        id:          item.id          || null,
        nom:         item.nom         || item.nom_matiere || '',
        coefficient: item.coefficient !== undefined ? item.coefficient : 1,
        enseignant:  item.enseignant  || '',
        groupe:      item.groupe      || '',
        principal:   item.principal   || false
      };
    }).filter(m => m.nom);
  } catch { return []; }
}

/** Retourne juste les noms pour l'affichage des tags */
function getNomsMatieres(json) {
  return parseMatieresJson(json).map(m => m.nom);
}

// ============================================================
// AFFICHAGE KPIs
// ============================================================

function afficherKPIs(classes) {
  const container = document.getElementById('classes-kpis');
  if (!container) return;
  
  const totalEleves = classes.reduce((s, c) => s + (c.nb_eleves || 0), 0);
  const moyennes = classes.filter(c => c.moyenne_generale).map(c => c.moyenne_generale);
  const moyGlobale = moyennes.length
    ? (moyennes.reduce((s, m) => s + parseFloat(m), 0) / moyennes.length).toFixed(1)
    : null;

  // Calculer le nombre de matières UNIQUES réellement utilisées dans toutes les classes
  const matieresUtilisees = new Set();
  classes.forEach(c => {
    const noms = getNomsMatieres(c.matieres_json);
    noms.forEach(n => matieresUtilisees.add(n));
  });

  const icons = {
    classes: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`,
    eleves: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    moyenne: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    matieres: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`
  };

  container.innerHTML = [
    { icon: icons.classes, val: classes.length,                        label: t('classes.kpi_classes'),              color: 'rgba(45,110,224,0.15)',  valColor: '#2d6ee0' },
    { icon: icons.eleves, val: totalEleves,                           label: t('classes.kpi_eleves'),      color: 'rgba(0,230,118,0.12)',   valColor: 'var(--green-fifa)' },
    { icon: icons.moyenne, val: moyGlobale ? `${moyGlobale}/20` : '—', label: t('classes.kpi_moyenne_etab'), color: 'rgba(156,77,255,0.12)',  valColor: 'var(--purple-fifa)' },
    { icon: icons.matieres, val: matieresUtilisees.size,               label: t('classes.kpi_matieres'), color: 'rgba(255,183,77,0.12)', valColor: 'var(--yellow-fifa)' }
  ].map(k => `
    <div class="stat-card animate-in">
      <div class="stat-icon" style="background:${k.color}; color:${k.valColor}; display:flex; align-items:center; justify-content:center;">${k.icon}</div>
      <div>
        <div class="stat-value" style="color:${k.valColor};">${k.val}</div>
        <div class="stat-label">${k.label}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// AFFICHAGE GRILLE CLASSES
// ============================================================

function afficherClasses(classes) {
  const grid = document.getElementById('classes-grid');
  if (!grid) return;

  if (!classes.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;opacity:0.4;"></div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:18px;color:var(--text-secondary);">
          ${t('classes.empty_title')}
        </div>
        <div style="font-size:13px;color:var(--text-muted);margin-top:6px;">
          ${t('classes.empty_desc')}
        </div>
      </div>`;
    return;
  }

  grid.innerHTML = classes.map(c => {
    const matieres = getNomsMatieres(c.matieres_json);
    const moy = c.moyenne_generale ? parseFloat(c.moyenne_generale) : null;
    const couleurMoy   = !moy ? 'var(--text-muted)' : moy >= 14 ? 'var(--green-fifa)' : moy >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
    const pct = moy ? Math.min((moy / 20) * 100, 100) : 0;

    const tagsMatieres = matieres.length
      ? matieres.slice(0, 4).map(m => `<span class="matiere-tag">${esc(m)}</span>`).join('') +
        (matieres.length > 4 ? `<span class="matiere-tag">+${matieres.length - 4}</span>` : '')
      : `<span style="font-size:12px;color:var(--text-muted);">${esc(t('classes.badge_no_subject'))}</span>`;

    // Trouver le prof principal (depuis la jointure DB en priorité, sinon matieres_json)
    let profPrincipal = '';
    if (c.prof_principal_nom) {
      profPrincipal = `${c.prof_principal_prenom || ''} ${c.prof_principal_nom}`.trim();
    } else {
      try {
        const mJson = JSON.parse(c.matieres_json || '[]');
        const pp = mJson.find(m => m.principal);
        if (pp) profPrincipal = pp.enseignant || '';
      } catch {}
    }

    const bandColor = c.niveau === 'Primaire'
      ? 'linear-gradient(90deg,#00e676,#22d3ee)'
      : c.niveau === 'Secondaire'
      ? 'linear-gradient(90deg,#3d8ef8,#a855f7)'
      : c.niveau === 'Superieur'
      ? 'linear-gradient(90deg,#f0b429,#ff4757)'
      : 'linear-gradient(90deg,var(--green-fifa),var(--blue-fifa))';

    // Badge niveau_v2 (N1/N2/N3) avec couleur spécifique
    const niveauV2 = c.niveau_v2;
    const niveauV2Label = niveauV2 === 'N1' ? 'SIL/CP'
      : niveauV2 === 'N2' ? 'CE1/CE2'
      : niveauV2 === 'N3' ? 'CM1/CM2'
      : null;
    const niveauV2Color = niveauV2 === 'N1' ? 'rgba(0,230,118,0.15)'
      : niveauV2 === 'N2' ? 'rgba(61,142,248,0.15)'
      : niveauV2 === 'N3' ? 'rgba(168,85,247,0.15)'
      : null;
    const niveauV2TextColor = niveauV2 === 'N1' ? 'var(--green-fifa)'
      : niveauV2 === 'N2' ? 'var(--blue-fifa)'
      : niveauV2 === 'N3' ? 'var(--purple-fifa)'
      : null;

    // Pour N1/N2, notation qualitative — ne pas afficher la moyenne /20
    const isQualitative = niveauV2 === 'N1' || niveauV2 === 'N2';
    const moyAffiche = isQualitative
      ? `<span style="font-size:11px;">${t('classes.stats_qualitative')}</span>`
      : (moy ? moy.toFixed(1) : '—');
    const couleurMoyAffiche = isQualitative ? 'var(--yellow-fifa)' : couleurMoy;
    const pctAffiche = isQualitative ? 0 : pct;

    return `
      <div class="classe-card animate-in" data-id="${c.id}">

        <div class="card-band" style="background:${bandColor};"></div>

        <div class="card-inner">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px;">
            <div class="classe-nom">${esc(c.nom_classe)}</div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-left:8px;margin-top:4px;flex-shrink:0;">
              <span style="background:rgba(255,255,255,0.06);border:1px solid var(--border-color);
                           color:var(--text-muted);font-size:9px;padding:3px 8px;border-radius:20px;
                           font-weight:700;letter-spacing:1px;text-transform:uppercase;">
                ${esc(c.niveau) || '—'}
              </span>
              ${niveauV2Label ? `<span style="background:${niveauV2Color};border:1px solid ${niveauV2TextColor}33;
                           color:${niveauV2TextColor};font-size:9px;padding:3px 8px;border-radius:20px;
                           font-weight:700;letter-spacing:0.5px;">
                ${niveauV2Label}
              </span>` : ''}
            </div>
          </div>

          <div class="classe-stats">
            <div class="stat-item">
              <div class="stat-val" style="color:var(--text-primary);">${c.nb_eleves || 0}</div>
              <div class="stat-lbl">${t('classes.stats_eleves')}</div>
            </div>
            <div class="stat-item">
              <div class="stat-val" style="color:${couleurMoyAffiche};">${moyAffiche}</div>
              <div class="stat-lbl">${t('classes.stats_moyenne')}</div>
            </div>
            <div class="stat-item">
              <div class="stat-val" style="color:var(--blue-fifa);">${matieres.length}</div>
              <div class="stat-lbl">${t('classes.stats_matieres')}</div>
            </div>
          </div>

          <div class="progress-bar-wrap">
            <div class="progress-bar-fill" style="width:${pctAffiche}%;background:${bandColor};"></div>
          </div>

          <div class="matieres-tags">${tagsMatieres}</div>

          ${profPrincipal ? `
          <div class="badge-prof-principal">
            <span></span><span>${esc(profPrincipal)}</span>
          </div>` : ''}
        </div>

        <div class="classe-actions">
          <div class="action-row">
            <button type="button" class="btn btn-sm btn-secondary" data-action="voir"   data-id="${c.id}"> ${t('classes.btn_view_students')}</button>
            <button type="button" class="btn btn-sm btn-secondary" data-action="config" data-id="${c.id}"> ${t('classes.btn_config')}</button>
            <button type="button" class="btn btn-sm btn-secondary" data-action="import" data-id="${c.id}"> ${t('classes.btn_import_list')}</button>
          </div>
          <div class="action-row" style="justify-content:flex-end;">
            <button type="button" class="btn btn-sm btn-secondary" data-action="edit" data-id="${c.id}"> ${t('classes.btn_edit')}</button>
            <button type="button" class="btn btn-sm btn-danger"    data-action="del"  data-id="${c.id}"> ${t('classes.btn_delete')}</button>
          </div>
        </div>

      </div>`;
  }).join('');

  grid.addEventListener('click', gererClicGrille);
}

function gererClicGrille(e) {
  const btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    const id = parseInt(btn.dataset.id);
    if (btn.dataset.action === 'voir')       ouvrirDetail(id);
    else if (btn.dataset.action === 'config') ouvrirConfigClasse(id);
    else if (btn.dataset.action === 'import') ouvrirImportListe(id);
    else if (btn.dataset.action === 'import-abs') ouvrirImportAbsences(id);
    else if (btn.dataset.action === 'edit')  ouvrirFormulaire(id);
    else if (btn.dataset.action === 'del')   supprimerClasse(id);
    return;
  }
  const carte = e.target.closest('.classe-card');
  if (carte) ouvrirDetail(parseInt(carte.dataset.id));
}

// ============================================================
// MODALE CONFIGURATION CLASSE
// ============================================================

async function ouvrirConfigClasse(classeId) {
  const classe = toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;

  configClasseId    = classeId;
  configGroupeSelIdx = null;

  document.getElementById('config-classe-title').textContent =
    `${t('classes.config_title')} — ${classe.nom_classe}`;

  const existant = parseMatieresJson(classe.matieres_json);

  // Construire la liste uniquement avec les matières déjà sélectionnées pour cette classe
  configMatieres = existant.map(ex => {
    const globalMat = toutesLesMatieres.find(tm => tm.nom_matiere === ex.nom);
    return {
      id:          globalMat ? globalMat.id : (ex.id || null),
      nom:         ex.nom,
      actif:       true,
      coefficient: ex.coefficient,
      enseignant:  ex.enseignant,
      groupe:      ex.groupe,
      principal:   ex.principal
    };
  });

  const groupesSet = new Set(existant.map(m => m.groupe).filter(g => g && g.trim()));
  configGroupes = Array.from(groupesSet).map(nom => ({ nom }));

  const isPreset = estClassePreset(classe.nom_classe);
  const tabGroupesBtn = document.querySelector('[data-config-tab="groupes"]');
  if (tabGroupesBtn) {
    tabGroupesBtn.style.display = isPreset ? 'none' : 'block';
  }

  document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.config-tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-config-tab="matieres"]').classList.add('active');
  document.getElementById('config-tab-matieres').classList.add('active');
  document.getElementById('config-groupe-editeur').style.display = 'none';

  afficherConfigMatieres();
  afficherConfigGroupes();
  afficherApercuGroupesConfig();

  document.getElementById('modal-config-classe').style.display = 'flex';
}

function fermerConfigClasse() {
  document.getElementById('modal-config-classe').style.display = 'none';
  configClasseId    = null;
  configGroupeSelIdx = null;
}

// ── Affichage liste matières dans la modale config ──────────

function afficherConfigMatieres() {
  const container = document.getElementById('config-matieres-list');
  if (!container) return;

  const classe = toutesLesClasses.find(c => c.id === configClasseId);
  const isPreset = classe ? estClassePreset(classe.nom_classe) : false;

  const tipEl = document.getElementById('config-tip');
  if (tipEl) {
    if (isPreset) {
      tipEl.textContent = t('classes.config_tip_preset');
    } else {
      tipEl.textContent = t('classes.config_tip_custom');
    }
  }

  if (!configMatieres.length) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">
      ${t('classes.config_no_subjects')}</div>`;
    return;
  }

  const optsGroupe = [
    `<option value="">— ${t('classes.config_preview_no_groups')} —</option>`,
    ...configGroupes.map(g =>
      `<option value="${esc(g.nom)}">${esc(g.nom)}</option>`)
  ].join('');

  container.innerHTML = configMatieres.map((m, i) => `
    <div class="mat-config-row" data-mat-index="${i}"
         style="grid-template-columns:28px 1fr 80px 140px 100px 160px;">
      <input type="checkbox" class="mat-actif" data-i="${i}" ${m.actif ? 'checked' : ''} ${isPreset ? 'disabled' : ''}>
      <div style="font-size:13px; color:${m.actif ? 'var(--text-primary)' : 'var(--text-muted)'}; font-weight:${m.actif ? '600' : '400'};">
        ${esc(m.nom)}
      </div>
      <input type="number" class="mat-coef" data-i="${i}"
             value="${m.coefficient}" min="0.5" max="20" step="0.5"
             ${m.actif && !isPreset ? '' : 'disabled'}
             title="${t('classes.config_col_coeff')}">
      <input type="text" class="mat-ens" data-i="${i}"
             value="${esc(m.enseignant)}" placeholder="${t('classes.config_col_teacher')}"
             ${m.actif ? '' : 'disabled'}>
      <div style="text-align:center;">
        <input type="radio" class="mat-principal" name="prof-principal" data-i="${i}"
               ${m.principal ? 'checked' : ''}
               ${m.actif ? '' : 'disabled'}
               style="accent-color:var(--purple-fifa); width:16px; height:16px; cursor:pointer;"
               title="${t('classes.config_col_principal')}">
      </div>
      <select class="mat-groupe" data-i="${i}" ${m.actif && !isPreset ? '' : 'disabled'}>
        ${optsGroupe.replace(`value="${esc(m.groupe)}"`, `value="${esc(m.groupe)}" selected`)}
      </select>
    </div>
  `).join('');

  container.querySelectorAll('.mat-actif').forEach(cb =>
    cb.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i);
      configMatieres[i].actif = e.target.checked;
      const row = container.querySelector(`[data-mat-index="${i}"]`);
      row.querySelectorAll('input:not([type=checkbox]), select').forEach(el => {
        el.disabled = !e.target.checked;
      });
      const nomEl = row.querySelector('div');
      if (nomEl) {
        nomEl.style.color = e.target.checked ? 'var(--text-primary)' : 'var(--text-muted)';
        nomEl.style.fontWeight = e.target.checked ? '600' : '400';
      }
      afficherApercuGroupesConfig();
    })
  );
  container.querySelectorAll('.mat-coef').forEach(inp =>
    inp.addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      configMatieres[parseInt(e.target.dataset.i)].coefficient = isNaN(v) ? 1 : Math.max(0.5, v);
    })
  );
  container.querySelectorAll('.mat-ens').forEach(inp =>
    inp.addEventListener('input', e => {
      configMatieres[parseInt(e.target.dataset.i)].enseignant = e.target.value;
    })
  );
  container.querySelectorAll('.mat-groupe').forEach(sel =>
    sel.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i);
      configMatieres[i].groupe = e.target.value;
      afficherApercuGroupesConfig();
    })
  );
  container.querySelectorAll('.mat-principal').forEach(radio =>
    radio.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i);
      configMatieres.forEach((m, idx) => m.principal = (idx === i));
    })
  );
}

// ── Affichage groupes dans la modale config ─────────────────

function afficherConfigGroupes() {
  const container = document.getElementById('config-groupes-list');
  if (!container) return;

  if (!configGroupes.length) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">
      ${t('classes.config_group_empty')}</div>`;
    return;
  }

  container.innerHTML = configGroupes.map((g, i) => `
    <div class="groupe-config-row" style="cursor:pointer;
         border-color:${configGroupeSelIdx === i ? 'rgba(0,230,118,0.4)' : 'var(--border-color)'};
         background:${configGroupeSelIdx === i ? 'rgba(0,230,118,0.06)' : 'var(--bg-secondary)'};"
         data-gi="${i}">
      <span style="font-size:16px;">🗂️</span>
      <div style="flex:1; font-size:13px; font-weight:600; color:var(--text-primary);">${esc(g.nom)}</div>
      <span style="font-size:11px; color:var(--text-muted);">
        ${configMatieres.filter(m => m.actif && m.groupe === g.nom).length} ${t('classes.subjects_short')}
      </span>
    </div>
  `).join('');

  container.querySelectorAll('[data-gi]').forEach(el => {
    el.addEventListener('click', () => ouvrirEditeurGroupeConfig(parseInt(el.dataset.gi)));
  });
}

function ouvrirEditeurGroupeConfig(index) {
  configGroupeSelIdx = index;
  const g = configGroupes[index];
  const editeur = document.getElementById('config-groupe-editeur');
  editeur.style.display = 'block';
  document.getElementById('config-groupe-nom').value = g.nom;

  const container = document.getElementById('config-groupe-matieres');
  container.innerHTML = configMatieres
    .filter(m => m.actif)
    .map(m => `
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer;
                    padding:5px 6px; border-radius:6px;"
             onmouseover="this.style.background='var(--bg-hover)'"
             onmouseout="this.style.background=''">
        <input type="checkbox" value="${esc(m.nom)}"
               ${m.groupe === g.nom ? 'checked' : ''}
               style="accent-color:var(--green-fifa); width:14px; height:14px;">
        <span style="font-size:13px; color:var(--text-primary); flex:1;">${esc(m.nom)}</span>
        <span style="font-size:11px; color:var(--text-muted);">×${m.coefficient}</span>
      </label>
    `).join('');

  afficherConfigGroupes();
}

function attacherEvenementsConfigGroupes() {
  document.getElementById('btn-add-groupe-config')?.addEventListener('click', () => {
    const nom = `${t('classes.group_default')} ${configGroupes.length + 1}`;
    configGroupes.push({ nom });
    afficherConfigGroupes();
    ouvrirEditeurGroupeConfig(configGroupes.length - 1);
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
  });

  document.getElementById('btn-save-groupe-config')?.addEventListener('click', () => {
    if (configGroupeSelIdx === null) return;
    const ancienNom = configGroupes[configGroupeSelIdx].nom;
    const nouveauNom = document.getElementById('config-groupe-nom')?.value?.trim();
    if (!nouveauNom) { showToast('⚠️ ' + t('classes.config_group_name'), 'error'); return; }

    configGroupes[configGroupeSelIdx].nom = nouveauNom;
    configMatieres.forEach(m => {
      if (m.groupe === ancienNom) m.groupe = nouveauNom;
    });

    const checks = document.querySelectorAll('#config-groupe-matieres input[type=checkbox]');
    checks.forEach(cb => {
      const mat = configMatieres.find(m => m.nom === cb.value);
      if (mat) mat.groupe = cb.checked ? nouveauNom : (mat.groupe === nouveauNom ? '' : mat.groupe);
    });

    afficherConfigGroupes();
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
    showToast(t('classes.save_success'), 'success');
  });

  document.getElementById('btn-delete-groupe-config')?.addEventListener('click', () => {
    if (configGroupeSelIdx === null) return;
    const nom = configGroupes[configGroupeSelIdx].nom;
    if (!confirm(t('classes.config_group_delete') + ` "${nom}" ?`)) return;
    configMatieres.forEach(m => { if (m.groupe === nom) m.groupe = ''; });
    configGroupes.splice(configGroupeSelIdx, 1);
    configGroupeSelIdx = null;
    document.getElementById('config-groupe-editeur').style.display = 'none';
    afficherConfigGroupes();
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
    showToast(t('classes.delete_success'), 'success');
  });
}

function afficherApercuGroupesConfig() {
  const container = document.getElementById('config-groupes-apercu');
  if (!container) return;

  const actives = configMatieres.filter(m => m.actif);
  if (!configGroupes.length) {
    container.innerHTML = `<span style="color:var(--text-muted);">
      ${t('classes.config_preview_no_groups')} — ${actives.length} ${t('classes.stats_matieres')}.</span>`;
    return;
  }

  const nonAssignees = actives.filter(m => !m.groupe);

  container.innerHTML = [
    ...configGroupes.map(g => {
      const mats = actives.filter(m => m.groupe === g.nom);
      return `<span style="margin-right:12px;">
        <strong style="color:var(--text-primary);">📂 ${esc(g.nom)}</strong>
        <span style="color:var(--text-muted); font-size:11px; margin-left:4px;">
          (${mats.map(m => esc(m.nom)).join(', ') || t('common.nodata')})
        </span>
      </span>`;
    }),
    nonAssignees.length
      ? `<span style="color:var(--yellow-fifa); font-size:11px;">
           ${t('classes.config_preview_ungrouped')} ${nonAssignees.map(m => esc(m.nom)).join(', ')}
         </span>`
      : ''
  ].filter(Boolean).join('<br style="margin:4px 0;">');
}

// ── Sauvegarde de la configuration ──────────────────────────

async function sauvegarderConfig() {
  if (!configClasseId) return;

  const classe = toutesLesClasses.find(c => c.id === configClasseId);
  if (!classe) return;

  const nouvMatieres = configMatieres
    .filter(m => m.actif)
    .map(m => ({
      id:          m.id,
      nom:         m.nom,
      coefficient: m.coefficient,
      enseignant:  m.enseignant,
      groupe:      m.groupe,
      principal:   m.principal || false
    }));

  const result = await window.elimuAPI.updateClass(configClasseId, {
    nom_classe:       classe.nom_classe,
    niveau:           classe.niveau,
    niveau_v2:        classe.niveau_v2 || null,
    systeme_educatif: classe.systeme_educatif || 'francophone',
    matieres:         nouvMatieres
  });

  if (result?.error || !result?.success) {
    showToast(t('common.error') + ' : ' + (result?.error || t('common.waiting')), 'error');
    return;
  }

  showToast(t('classes.save_success'), 'success');
  fermerConfigClasse();
  await chargerClasses();
}

// ============================================================
// IMPORT LISTE ÉLÈVES
// ============================================================

async function ouvrirImportListe(classeId) {
  const classe = toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;
  const modal = document.getElementById('modal-import-liste');
  if (!modal) return;
  const title = document.getElementById('import-liste-title');
  const resultEl = document.getElementById('import-liste-result');
  if (title) title.textContent = `${t('classes.import_list_title')} — ${classe.nom_classe}`;
  if (resultEl) resultEl.style.display = 'none';
  modal.dataset.classeId = classeId;
  const modeEcrase = document.getElementById('import-mode-ecrase');
  const modeAjoute = document.getElementById('import-mode-ajoute');
  if (modeEcrase) modeEcrase.checked = false;
  if (modeAjoute) modeAjoute.checked = true;
  document.getElementById('import-liste-filename').textContent = '';
  document.getElementById('btn-import-liste-ok').disabled = true;
  modal._filePath = null;
  modal.style.display = 'flex';
}

async function executerImportListe(classeId, filePath, mode) {
  return await window.elimuAPI.importListeEleves(filePath, classeId, mode, window.appState.user?.id);
}

// ============================================================
// IMPORT ABSENCES CSV
// ============================================================

async function ouvrirImportAbsences(classeId) {
  const classe = toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;
  const modal = document.getElementById('modal-import-absences');
  if (!modal) return;
  const titleEl = document.getElementById('import-abs-title');
  if (titleEl) titleEl.textContent = `${t('classes.import_abs_title')} — ${classe.nom_classe}`;
  modal.dataset.classeId = classeId;
  modal._fileContent = null;
  document.getElementById('import-abs-filename').textContent = '';
  document.getElementById('import-abs-result').style.display = 'none';
  document.getElementById('btn-import-abs-ok').disabled = true;
  modal.style.display = 'flex';
}

function attacherEvenementsImportAbsences() {
  const modal = document.getElementById('modal-import-absences');
  if (!modal) return;

  document.getElementById('modal-import-absences-close')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  document.getElementById('btn-import-abs-cancel')?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('import-abs-dropzone')?.addEventListener('click', async () => {
    const filePath = await window.elimuAPI.selectFile();
    if (!filePath) return;
    const content = await window.elimuAPI.readTextFile(filePath);
    if (!content || content.error) { showToast(t('common.error'), 'error'); return; }
    modal._fileContent = content;
    document.getElementById('import-abs-filename').textContent = `✅ ${filePath.split(/[/\\]/).pop()}`;
    document.getElementById('btn-import-abs-ok').disabled = false;
  });

  document.getElementById('btn-import-abs-ok')?.addEventListener('click', async () => {
    const classeId   = parseInt(modal.dataset.classeId);
    const csvContent = modal._fileContent;
    if (!csvContent || !classeId) return;
    const btn = document.getElementById('btn-import-abs-ok');
    btn.disabled = true; btn.textContent = '⏳ ' + t('common.waiting');
    const result = await window.elimuAPI.importAbsencesCSV({ classeId, csvContent });
    btn.disabled = false; btn.textContent = '✅ ' + t('common.import_excel');
    const resultEl = document.getElementById('import-abs-result');
    resultEl.style.display = 'block';
    if (result?.success) {
      const lignes = [];
      if (result.nbMisAJour > 0) lignes.push(`✅ ${result.nbMisAJour} ` + t('classes.import_abs_result_updated'));
      if (result.nbErreurs > 0)  lignes.push(`⚠️ ${result.nbErreurs} ` + t('classes.import_abs_result_errors'));
      if (result.erreurs?.length) {
        lignes.push('<div style="margin-top:6px;font-size:11px;opacity:0.8;">' +
          result.erreurs.map(e => `• ${esc(e)}`).join('<br>') + '</div>');
      }
      resultEl.className = 'backup-info success';
      resultEl.innerHTML = lignes.join('<br>') || '✅ ' + t('common.success');
      showToast(`✅ ${result.nbMisAJour} ` + t('classes.import_abs_result_updated'), 'success');
    } else {
      resultEl.className = 'backup-info';
      resultEl.textContent = `❌ ${result?.error || t('common.error')}`;
      showToast(t('common.error'), 'error');
    }
  });
}

// ============================================================
// MODALE FORMULAIRE CLASSE (créer / renommer)
// ============================================================

async function ouvrirFormulaire(classeId = null) {
  classeEnCoursId = classeId;
  matieresPersonnalisees = []; // Reset
  const modal  = document.getElementById('modal-classe');
  const title  = document.getElementById('modal-classe-title');
  const btnSave = document.getElementById('modal-classe-save');
  if (!modal) return;

  const nomInput    = document.getElementById('cf-nom');
  const niveauInput = document.getElementById('cf-niveau');
  const systemeInput = document.getElementById('cf-systeme');
  
  if (nomInput) nomInput.value = '';
  if (niveauInput) niveauInput.value = '';
  if (systemeInput) systemeInput.value = 'francophone';
  
  document.getElementById('cf-search-matieres').value = '';
  document.getElementById('cf-custom-matiere').value = '';
  
  cacherErreur('cf-error');

  // Charger et remplir le select des professeurs (on passe classeId)
  await _remplirSelectProfPrincipal(classeId, null);

  if (classeId) {
    title.textContent = t('classes.modal_edit');
    btnSave.textContent = t('common.save');
    const classe = toutesLesClasses.find(c => c.id === classeId);
    if (classe) {
      if (nomInput) nomInput.value = classe.nom_classe || '';
      if (niveauInput) niveauInput.value = classe.niveau || '';
      if (systemeInput) systemeInput.value = classe.systeme_educatif || 'francophone';

      // Restaurer niveau_v2 dans le select caché
      const niveauV2Sel = document.getElementById('cf-niveau-v2');
      if (niveauV2Sel && classe.niveau_v2) {
        niveauV2Sel.value = classe.niveau_v2;
        niveauV2Sel.style.display = 'none';
      }

      // Highlight the correct preset button
      let foundPreset = false;
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
        if (b.dataset.val === classe.nom_classe) {
          b.classList.remove('btn-secondary');
          b.classList.add('btn-primary');
          foundPreset = true;
        }
      });

      if (!foundPreset) {
        // Personnalisé
        const customBtn = Array.from(document.querySelectorAll('.preset-btn')).find(b => b.dataset.val === '');
        if (customBtn) {
          customBtn.classList.remove('btn-secondary');
          customBtn.classList.add('btn-primary');
        }
        if (niveauV2Sel) {
          niveauV2Sel.style.display = 'block';
        }
        toggleMatieresSection(null); // Show manual subjects checklist
      } else {
        toggleMatieresSection(classe.niveau_v2); // Hide manual subjects checklist and show info banner
      }
      
      const matieres = parseMatieresJson(classe.matieres_json);
      const nomsMat = matieres.map(m => m.nom);
      
      // Identifier les matières "personnalisées"
      const parDefaut = [...LISTE_FRANCOPHONE, ...LISTE_ANGLOPHONE].flatMap(g => g.matieres);
      matieresPersonnalisees = nomsMat.filter(n => !parDefaut.includes(n));
      
      remplirCheckboxesMatieres(nomsMat);
      await _remplirSelectProfPrincipal(classeId, classe.professeur_principal_id || null);
    }
  } else {
    title.textContent = t('classes.modal_add');
    btnSave.textContent = t('classes.btn_create');
    // Nouvelle classe : état "en attente" → prompt visible, matières et bandeau cachés
    const niveauV2Sel = document.getElementById('cf-niveau-v2');
    if (niveauV2Sel) { niveauV2Sel.value = 'N1'; niveauV2Sel.style.display = 'none'; }
    
    // Réinitialiser les boutons de preset
    document.querySelectorAll('.preset-btn').forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-secondary');
    });
    
    toggleMatieresSection('waiting');
    remplirCheckboxesMatieres([]);
  }

  modal.style.display = 'flex';
  setTimeout(() => document.getElementById('cf-nom')?.focus(), 50);
}

function fermerFormulaire() {
  const modal = document.getElementById('modal-classe');
  if (modal) modal.style.display = 'none';
  classeEnCoursId = null;
}

async function _remplirSelectProfPrincipal(classeId, selectedId = null) {
  const sel = document.getElementById('cf-prof-principal');
  if (!sel) return;
  sel.innerHTML = `<option value="">— ${t('classes.option_no_head')} —</option>`;
  try {
    const profs = await window.elimuAPI.getProfesseursList(classeId);
    if (Array.isArray(profs)) {
      profs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${esc(p.prenom)} ${esc(p.nom)}${p.matiere_principale ? ' — ' + esc(p.matiere_principale) : ''}`;
        if (selectedId && p.id == selectedId) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Erreur chargement professeurs:', e);
  }
}

async function remplirCheckboxesMatieres(selectionnees = []) {
  const container = document.getElementById('matieres-checkboxes');
  if (!container) return;

  const systeme = document.getElementById('cf-systeme')?.value || 'francophone';
  const liste = systeme === 'francophone' ? LISTE_FRANCOPHONE : LISTE_ANGLOPHONE;

  let html = '';

  // 1. Matières personnalisées (si présentes)
  if (matieresPersonnalisees.length > 0) {
    html += `<div style="grid-column:1/-1; font-size:11px; font-weight:700; color:var(--purple-fifa); 
                         text-transform:uppercase; margin-top:10px; border-bottom:1px solid rgba(168,85,247,0.2); 
                         padding-bottom:4px; margin-bottom:4px;">
                ${t('classes.custom_subjects')}
             </div>`;
    matieresPersonnalisees.forEach(m => {
      html += renderMatiereCheckbox(m, selectionnees.includes(m), true);
    });
  }

  // 2. Matières par défaut par groupe
  liste.forEach(groupe => {
    html += `<div style="grid-column:1/-1; font-size:11px; font-weight:700; color:var(--text-muted); 
                         text-transform:uppercase; margin-top:10px; border-bottom:1px solid var(--border-color); 
                         padding-bottom:4px; margin-bottom:4px;" class="matiere-groupe-title">
                ${esc(groupe.groupe)}
             </div>`;
    groupe.matieres.forEach(m => {
      html += renderMatiereCheckbox(m, selectionnees.includes(m));
    });
  });

  container.innerHTML = html;
  
  // Attacher événement de suppression pour les personnalisées
  container.querySelectorAll('.btn-del-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nom = btn.dataset.nom;
      matieresPersonnalisees = matieresPersonnalisees.filter(n => n !== nom);
      const sel = getMatieresSelectionnees().filter(n => n !== nom);
      remplirCheckboxesMatieres(sel);
    });
  });
}

function renderMatiereCheckbox(nom, checked, isCustom = false) {
  return `
    <label class="matiere-checkbox-item" data-nom="${esc(nom).toLowerCase()}" title="${esc(nom)}">
      <input type="checkbox" name="matiere" value="${esc(nom)}" ${checked ? 'checked' : ''}>
      <span style="font-size:12px; color:var(--text-primary); flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${esc(nom)}
      </span>
      ${isCustom ? `<button type="button" class="btn-del-custom" data-nom="${esc(nom)}" 
                             style="background:none; border:none; color:var(--red-fifa); cursor:pointer; padding:0 4px;">✕</button>` : ''}
    </label>
  `;
}

function filtrerCheckboxesMatieres(recherche) {
  const q = recherche.toLowerCase().trim();
  const items = document.querySelectorAll('.matiere-checkbox-item');
  const groups = document.querySelectorAll('.matiere-groupe-title');
  
  items.forEach(item => {
    const nom = item.dataset.nom;
    if (!q || nom.includes(q)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });

  // Masquer les titres de groupes vides
  groups.forEach(group => {
    let hasVisible = false;
    let next = group.nextElementSibling;
    while (next && !next.classList.contains('matiere-groupe-title')) {
      if (next.classList.contains('matiere-checkbox-item') && next.style.display !== 'none') {
        hasVisible = true;
        break;
      }
      next = next.nextElementSibling;
    }
    group.style.display = hasVisible || !q ? 'block' : 'none';
  });
}

function getMatieresSelectionnees() {
  return Array.from(
    document.querySelectorAll('#matieres-checkboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}

async function sauvegarderClasse() {
  cacherErreur('cf-error');
  const nom     = document.getElementById('cf-nom')?.value.trim();
  const niveau  = document.getElementById('cf-niveau')?.value;
  const systeme = document.getElementById('cf-systeme')?.value;

  if (!nom)    { afficherErreur('cf-error', t('classes.label_name')); return; }
  if (!niveau) { afficherErreur('cf-error', t('classes.label_level'));     return; }

  let matieresJson = [];
  const activePresetBtn = document.querySelector('.preset-btn.btn-primary');
  const preset = activePresetBtn ? activePresetBtn.dataset.val : '';

  if (preset && preset !== '') {
    // Fixed preset class (SIL, CP, CE1, CE2, CM1, CM2)
    const defaultMatieres = getMatieresPourPreset(preset, systeme);
    
    if (classeEnCoursId) {
      const classe = toutesLesClasses.find(c => c.id === classeEnCoursId);
      const existant = parseMatieresJson(classe?.matieres_json || '[]');
      const existantMap = new Map(existant.map(m => [m.nom, m]));
      
      matieresJson = defaultMatieres.map(dm => {
        const ex = existantMap.get(dm.nom);
        if (ex) {
          // Preserve teacher & principal status; enforce preset coefficient & group
          return {
            id: ex.id,
            nom: dm.nom,
            coefficient: dm.coefficient,
            enseignant: ex.enseignant || '',
            groupe: dm.groupe,
            principal: ex.principal || false
          };
        }
        return dm;
      });
    } else {
      matieresJson = defaultMatieres;
    }
  } else {
    // Custom class (Personnalisé)
    const nomsMatieres = getMatieresSelectionnees();
    if (classeEnCoursId) {
      const classe = toutesLesClasses.find(c => c.id === classeEnCoursId);
      const existant = parseMatieresJson(classe?.matieres_json || '[]');
      const existantMap = new Map(existant.map(m => [m.nom, m]));

      matieresJson = nomsMatieres.map(nom => {
        const ex = existantMap.get(nom);
        if (ex) return ex;
        return { id: null, nom, coefficient: 1, enseignant: '', groupe: '', principal: false };
      });
    } else {
      matieresJson = nomsMatieres.map(nom => {
        return { id: null, nom, coefficient: 1, enseignant: '', groupe: '', principal: false };
      });
    }
  }

  const data = {
    nom_classe: nom,
    niveau: niveau,
    niveau_v2: document.getElementById('cf-niveau-v2')?.value || null,
    systeme_educatif: systeme,
    matieres: matieresJson,
    professeur_principal_id: parseInt(document.getElementById('cf-prof-principal')?.value) || null
  };

  const btnSave = document.getElementById('modal-classe-save');
  btnSave.disabled = true;
  btnSave.textContent = t('common.processing');

  const result = classeEnCoursId
    ? await window.elimuAPI.updateClass(classeEnCoursId, data)
    : await window.elimuAPI.addClass(data);

  btnSave.disabled = false;
  btnSave.textContent = classeEnCoursId ? t('common.save') : t('classes.btn_create');

  if (result?.error) { afficherErreur('cf-error', result.error); return; }

  showToast(t('classes.save_success'), 'success');
  window.elimuAPI.logAudit(classeEnCoursId ? 'UPDATE_CLASSE' : 'ADD_CLASSE', t(classeEnCoursId ? 'classes.audit_updated' : 'classes.audit_added', { nom }), _state?.user?.id);
  fermerFormulaire();
  await chargerClasses();
}

// ============================================================
// MODALE DÉTAIL CLASSE
// ============================================================

async function ouvrirDetail(classeId) {
  const modal   = document.getElementById('modal-detail');
  const content = document.getElementById('detail-content');
  const title   = document.getElementById('detail-title');
  if (!modal || !content) return;

  const classe = toutesLesClasses.find(c => c.id === classeId);
  if (title && classe) title.textContent = classe.nom_classe;

  content.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;">
    <div class="spinner"></div></div>`;
  modal.style.display = 'flex';

  const _e = await window.elimuAPI.getEleves(classeId);
  const eleves = Array.isArray(_e) ? _e : [];
  const matieres = getNomsMatieres(classe?.matieres_json || '[]');

  if (!eleves.length) {
    content.innerHTML = `
      <div style="text-align:center;padding:40px;">
        <div style="font-size:40px;margin-bottom:12px;opacity:0.4;"></div>
        <div style="color:var(--text-secondary);font-size:14px;">${t('classes.detail_no_students')}</div>
        <div style="color:var(--text-muted);font-size:12px;margin-top:6px;">
          ${t('classes.detail_go_to_students')}
        </div>
      </div>`;
    return;
  }

  const moyennes = eleves.filter(e => e.moyenne_generale).map(e => parseFloat(e.moyenne_generale));
  const moyClasse = moyennes.length
    ? (moyennes.reduce((s, m) => s + m, 0) / moyennes.length).toFixed(1)
    : null;
  const nbEnDifficulte = eleves.filter(e => e.moyenne_generale && e.moyenne_generale < 10).length;

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;">
      ${[
        { val: eleves.length, label: t('classes.detail_label_students'), color: 'var(--text-primary)' },
        { val: moyClasse ? moyClasse + '/20' : '—', label: t('classes.detail_label_average'),
          color: moyClasse >= 10 ? 'var(--green-fifa)' : 'var(--red-fifa)' },
        { val: nbEnDifficulte, label: t('classes.detail_label_difficult'),
          color: nbEnDifficulte > 0 ? 'var(--red-fifa)' : 'var(--green-fifa)' }
      ].map(k => `
        <div style="background:var(--bg-secondary);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:700;color:${k.color};">${k.val}</div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">${k.label}</div>
        </div>`).join('')}
    </div>

    ${matieres.length ? `
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
         ${t('classes.detail_subjects_title')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${matieres.map(m => `<span class="matiere-tag">${esc(m)}</span>`).join('')}
      </div>
    </div>` : ''}

    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
       ${t('classes.detail_ranking_title')}
    </div>
    <div style="max-height:340px;overflow-y:auto;padding-right:4px;">
      ${[...eleves]
        .sort((a, b) => (b.moyenne_generale || 0) - (a.moyenne_generale || 0))
        .map((eleve, i) => {
          const initiales = (eleve.prenom[0] + eleve.nom[0]).toUpperCase();
          const moy = eleve.moyenne_generale ? parseFloat(eleve.moyenne_generale) : null;
          const couleur = !moy ? 'var(--text-muted)' : moy >= 14 ? 'var(--green-fifa)' : moy >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)';
          const medaille = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
          return `
            <div class="eleve-list-item">
              <div style="font-size:16px;width:24px;text-align:center;flex-shrink:0;">
                ${medaille || `<span style="font-size:11px;color:var(--text-muted);">${i + 1}</span>`}
              </div>
              <div class="eleve-avatar-sm">${initiales}</div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:13.5px;color:var(--text-primary);">
                  ${esc(eleve.prenom)} ${esc(eleve.nom)}
                </div>
              </div>
              <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;
                          color:${couleur};flex-shrink:0;">
                ${moy ? moy.toFixed(1) : '—'}
              </div>
            </div>`;
        }).join('')}
    </div>`;
}

function fermerDetail() {
  const modal = document.getElementById('modal-detail');
  if (modal) modal.style.display = 'none';
}

// ============================================================
// SUPPRESSION
// ============================================================

async function supprimerClasse(id) {
  const classe = toutesLesClasses.find(c => c.id === id);
  const nbEleves = classe?.nb_eleves || 0;
  const msg = nbEleves > 0
    ? t('classes.delete_confirm_with_eleves').replace('{name}', classe?.nom_classe).replace('{count}', nbEleves)
    : t('classes.delete_confirm').replace('{name}', classe?.nom_classe);
  if (!confirm(msg)) return;
  const result = await window.elimuAPI.deleteClass(id);
  if (result?.error) { showToast(t('common.error') + ' : ' + result.error, 'error'); }
  else { showToast(t('classes.delete_success'), 'success'); await chargerClasses(); }
}

// ============================================================
// FILTRE ET RECHERCHE
// ============================================================

function filtrerClasses() {
  const q      = document.getElementById('search-classes')?.value.toLowerCase().trim() || '';
  const niveau = document.getElementById('filter-niveau')?.value || '';
  const filtrees = toutesLesClasses.filter(c =>
    (!q      || c.nom_classe.toLowerCase().includes(q)) &&
    (!niveau || c.niveau === niveau)
  );
  afficherClasses(filtrees);
}

// ============================================================
// ÉVÉNEMENTS
// ============================================================

function attacherEvenements() {
  document.getElementById('btn-add-classe')?.addEventListener('click', () => ouvrirFormulaire(null));
  document.getElementById('modal-classe-close')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-classe-cancel')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-classe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-classe')) fermerFormulaire();
  });
  document.getElementById('modal-classe-save')?.addEventListener('click', sauvegarderClasse);
  
  // Gestion des presets de classes (SIL, CP, CE1, CE2, CM1, CM2)
  // Mapping preset -> niveau (Primaire/Secondaire/Supérieur) + niveau_v2 (N1/N2/N3)
  const PRESET_MAP = {
    SIL:  { niveau: 'Primaire', niveau_v2: 'N1' },
    CP:   { niveau: 'Primaire', niveau_v2: 'N1' },
    CE1:  { niveau: 'Primaire', niveau_v2: 'N2' },
    CE2:  { niveau: 'Primaire', niveau_v2: 'N2' },
    CM1:  { niveau: 'Primaire', niveau_v2: 'N3' },
    CM2:  { niveau: 'Primaire', niveau_v2: 'N3' },
  };

  document.querySelectorAll('.preset-btn')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      const lvl = btn.dataset.lvl;
      const nomInput    = document.getElementById('cf-nom');
      const niveauSel   = document.getElementById('cf-niveau');
      const niveauV2Sel = document.getElementById('cf-niveau-v2');

      // Marquer le bouton actif
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');

      if (val === '') {
        // Mode personnalisé : afficher le sélecteur niveau_v2 + la section matières
        if (nomInput) nomInput.value = '';
        if (niveauV2Sel) niveauV2Sel.style.display = 'block';
        toggleMatieresSection(null); // affiche matières
        remplirCheckboxesMatieres([]);
        return;
      }

      if (nomInput) nomInput.value = val;
      if (niveauV2Sel) {
        niveauV2Sel.value = lvl;
        niveauV2Sel.style.display = 'none';
      }

      // Auto-remplir niveau Primaire/Secondaire/Supérieur
      const preset = PRESET_MAP[val];
      if (preset && niveauSel) {
        niveauSel.value = preset.niveau;
      }

      // Afficher/cacher la section matières selon le niveau V2
      toggleMatieresSection(lvl);
    });
  });

  // Événements éducation system
  document.getElementById('cf-systeme')?.addEventListener('change', (e) => {
    if (classeEnCoursId) {
      if (confirm(t('classes.change_system_confirm'))) {
        matieresPersonnalisees = [];
        remplirCheckboxesMatieres([]);
      } else {
        // Rétablir l'ancien système
        const classe = toutesLesClasses.find(c => c.id === classeEnCoursId);
        e.target.value = classe?.systeme_educatif || 'francophone';
      }
    } else {
      matieresPersonnalisees = [];
      remplirCheckboxesMatieres([]);
    }
  });

  document.getElementById('cf-search-matieres')?.addEventListener('input', (e) => {
    filtrerCheckboxesMatieres(e.target.value);
  });

  document.getElementById('cf-btn-add-custom')?.addEventListener('click', () => {
    const input = document.getElementById('cf-custom-matiere');
    const nom = input?.value.trim();
    if (nom) {
      if (!matieresPersonnalisees.includes(nom)) {
        matieresPersonnalisees.push(nom);
        // On garde les sélections actuelles
        const selectionnees = getMatieresSelectionnees();
        if (!selectionnees.includes(nom)) selectionnees.push(nom);
        remplirCheckboxesMatieres(selectionnees);
        input.value = '';
      } else {
        showToast(t('classes.duplicate_subject'), 'warn');
      }
    }
  });

  document.getElementById('modal-detail-close')?.addEventListener('click', fermerDetail);
  document.getElementById('modal-detail')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-detail')) fermerDetail();
  });
  document.getElementById('search-classes')?.addEventListener('input', filtrerClasses);
  document.getElementById('filter-niveau')?.addEventListener('change', filtrerClasses);

  document.querySelectorAll('.config-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.config-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`config-tab-${btn.dataset.configTab}`)?.classList.add('active');
    });
  });

  document.getElementById('modal-config-close')?.addEventListener('click', fermerConfigClasse);
  document.getElementById('btn-config-cancel')?.addEventListener('click', fermerConfigClasse);
  document.getElementById('modal-config-classe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-config-classe')) fermerConfigClasse();
  });
  document.getElementById('btn-config-save')?.addEventListener('click', sauvegarderConfig);

  attacherEvenementsConfigGroupes();

  const modalImport = document.getElementById('modal-import-liste');
  document.getElementById('modal-import-liste-close')?.addEventListener('click', () => {
    if (modalImport) modalImport.style.display = 'none';
  });
  modalImport?.addEventListener('click', e => {
    if (e.target === modalImport) modalImport.style.display = 'none';
  });

  document.getElementById('btn-download-modele-import')?.addEventListener('click', async () => {
    const classeId = parseInt(modalImport.dataset.classeId);
    if (!classeId) return;
    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportModeleImport(classeId, _state?.user?.id, lang);
    if (result?.success) {
      showToast(t('common.success'), 'success');
    } else if (result?.error) {
      showToast(result.error, 'error');
    }
  });

  document.getElementById('import-liste-dropzone')?.addEventListener('click', async () => {
    const filePath = await window.elimuAPI.selectFile();
    if (!filePath) return;
    modalImport._filePath = filePath;
    document.getElementById('import-liste-filename').textContent = `✅ ${filePath.split(/[/\\]/).pop()}`;
    document.getElementById('btn-import-liste-ok').disabled = false;
  });
  document.getElementById('btn-import-liste-ok')?.addEventListener('click', async () => {
    const classeId = parseInt(modalImport.dataset.classeId);
    const filePath = modalImport._filePath;
    const mode = document.getElementById('import-mode-ecrase')?.checked ? 'ecrase' : 'ajoute';
    if (!filePath || !classeId) return;
    const btn = document.getElementById('btn-import-liste-ok');
    btn.disabled = true; btn.textContent = '⏳ ' + t('common.waiting');
    const result = await executerImportListe(classeId, filePath, mode);
    btn.disabled = false; btn.textContent = '✅ ' + t('common.import_excel');
    const resultEl = document.getElementById('import-liste-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      if (result.success) {
        const lignes = [];
        if (result.nbAjoutes > 0)   lignes.push(`✅ ${result.nbAjoutes} ` + t('classes.import_list_result_added'));
        if (result.nbRemplaces > 0) lignes.push(`🔄 ${result.nbRemplaces} ` + t('classes.import_list_result_replaced'));
        if (result.nbIgnores > 0)   lignes.push(`⏭️ ${result.nbIgnores} ` + t('classes.import_list_result_ignored'));
        if (result.nbErreurs > 0)   lignes.push(`⚠️ ${result.nbErreurs} ` + t('classes.import_list_result_errors'));
        resultEl.className = 'backup-info success';
        resultEl.innerHTML = lignes.join('<br>');
        showToast(t('common.success'), 'success');
        await chargerClasses();
      } else {
        resultEl.className = 'backup-info';
        resultEl.textContent = `❌ ${result.error || t('common.error')}`;
        showToast(t('common.error'), 'error');
      }
    }
  });

  attacherEvenementsImportAbsences();
}

// ============================================================
// UTILITAIRES
// ============================================================

function afficherErreur(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

function cacherErreur(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/**
 * Affiche ou cache la section de sélection manuelle des matières selon le niveau V2.
 *
 * @param {string|null} niveauV2
 *   - 'waiting' : état initial, aucun preset sélectionné → affiche le prompt
 *   - null      : mode personnalisé → affiche les matières
 *   - 'N1'|'N2'|'N3' : compétences ou matières officielles de preset → affiche le bandeau info
 */
function toggleMatieresSection(niveauV2) {
  const sectionMatieres = document.getElementById('cf-matieres-section');
  const infoCompetences = document.getElementById('cf-competences-info');
  const presetPrompt    = document.getElementById('cf-preset-prompt');
  const detailEl        = document.getElementById('cf-competences-detail');

  const infoTitle       = infoCompetences ? infoCompetences.querySelector('div') : null;
  const infoBody        = infoCompetences ? infoCompetences.querySelector('div:nth-child(2)') : null;

  const isWaiting    = niveauV2 === 'waiting';
  const isPreset      = niveauV2 === 'N1' || niveauV2 === 'N2' || niveauV2 === 'N3';
  const showMatieres = !isPreset && !isWaiting;

  if (sectionMatieres) sectionMatieres.style.display = showMatieres ? 'block' : 'none';
  if (infoCompetences) infoCompetences.style.display = isPreset     ? 'block' : 'none';
  if (presetPrompt)    presetPrompt.style.display    = isWaiting    ? 'block' : 'none';

  // Détail du curriculum dans le bandeau
  if (infoCompetences && isPreset) {
    if (niveauV2 === 'N1' || niveauV2 === 'N2') {
      infoCompetences.style.background = 'rgba(0,230,118,0.06)';
      infoCompetences.style.borderColor = 'rgba(0,230,118,0.2)';
      if (infoTitle) {
        infoTitle.style.color = 'var(--green-fifa)';
        infoTitle.textContent = t('classes.curriculum_title');
      }
      if (infoBody) {
        infoBody.innerHTML = t('classes.curriculum_body_qualitative') +
          '<br><span id="cf-competences-detail" style="color:var(--text-muted);">' +
          (niveauV2 === 'N1' ? t('classes.curriculum_detail_n1') : t('classes.curriculum_detail_n2')) +
          '</span>';
      }
    } else if (niveauV2 === 'N3') {
      infoCompetences.style.background = 'rgba(168,85,247,0.06)';
      infoCompetences.style.borderColor = 'rgba(168,85,247,0.2)';
      if (infoTitle) {
        infoTitle.style.color = 'var(--purple-fifa)';
        infoTitle.textContent = t('classes.curriculum_title_n3');
      }
      if (infoBody) {
        infoBody.innerHTML = t('classes.curriculum_body_quantitative') +
          '<br><span style="color:var(--text-muted);">' + t('classes.curriculum_detail_n3') + '</span>';
      }
    }
  }
}
