import { state, t, CLASS_TEMPLATES, LISTE_FRANCOPHONE, LISTE_ANGLOPHONE } from './state.js';

export function estClassePreset(nomClasse) {
  return ['SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'].includes(nomClasse);
}

export function getMatieresPourPreset(preset, systeme = 'francophone') {
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

  if (preset === 'CE1' || preset === 'CE2' || preset === 'CM1') {
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

  if (preset === 'CM2') {
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

export function parseMatieresJson(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      if (typeof item === 'string') {
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

export function getNomsMatieres(json) {
  return parseMatieresJson(json).map(m => m.nom);
}

export function renderMatiereCheckbox(nom, checked, isCustom = false) {
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

export function filtrerCheckboxesMatieres(recherche) {
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

export function getMatieresSelectionnees() {
  return Array.from(
    document.querySelectorAll('#matieres-checkboxes input[type="checkbox"]:checked')
  ).map(cb => cb.value);
}

export function afficherErreur(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = '⚠️ ' + msg; el.style.display = 'block'; }
}

export function cacherErreur(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

export function toggleMatieresSection(niveauV2) {
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
