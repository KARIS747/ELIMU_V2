import { state, t, LISTE_FRANCOPHONE, LISTE_ANGLOPHONE } from './state.js';
import {
  cacherErreur, afficherErreur, parseMatieresJson, getMatieresPourPreset,
  getMatieresSelectionnees, renderMatiereCheckbox, toggleMatieresSection
} from './helpers.js';
import { chargerClasses } from './classes.js';

export async function ouvrirFormulaire(classeId = null) {
  state.classeEnCoursId = classeId;
  state.matieresPersonnalisees = [];
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

  await _remplirSelectProfPrincipal(classeId, null);

  if (classeId) {
    title.textContent = t('classes.modal_edit');
    btnSave.textContent = t('common.save');
    const classe = state.toutesLesClasses.find(c => c.id === classeId);
    if (classe) {
      if (nomInput) nomInput.value = classe.nom_classe || '';
      if (niveauInput) niveauInput.value = classe.niveau || '';
      if (systemeInput) systemeInput.value = classe.systeme_educatif || 'francophone';

      const niveauV2Sel = document.getElementById('cf-niveau-v2');
      if (niveauV2Sel && classe.niveau_v2) {
        niveauV2Sel.value = classe.niveau_v2;
        niveauV2Sel.style.display = 'none';
      }

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
        const customBtn = Array.from(document.querySelectorAll('.preset-btn')).find(b => b.dataset.val === '');
        if (customBtn) {
          customBtn.classList.remove('btn-secondary');
          customBtn.classList.add('btn-primary');
        }
        if (niveauV2Sel) {
          niveauV2Sel.style.display = 'block';
        }
        toggleMatieresSection(null);
      } else {
        toggleMatieresSection(classe.niveau_v2);
      }

      const matieres = parseMatieresJson(classe.matieres_json);
      const nomsMat = matieres.map(m => m.nom);

      const parDefaut = [...LISTE_FRANCOPHONE, ...LISTE_ANGLOPHONE].flatMap(g => g.matieres);
      state.matieresPersonnalisees = nomsMat.filter(n => !parDefaut.includes(n));

      remplirCheckboxesMatieres(nomsMat);
      await _remplirSelectProfPrincipal(classeId, classe.professeur_principal_id || null);
    }
  } else {
    title.textContent = t('classes.modal_add');
    btnSave.textContent = t('classes.btn_create');
    const niveauV2Sel = document.getElementById('cf-niveau-v2');
    if (niveauV2Sel) { niveauV2Sel.value = 'N1'; niveauV2Sel.style.display = 'none'; }

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

export function fermerFormulaire() {
  const modal = document.getElementById('modal-classe');
  if (modal) modal.style.display = 'none';
  state.classeEnCoursId = null;
}

async function _remplirSelectProfPrincipal(classeId, selectedId = null) {
  const sel = document.getElementById('cf-prof-principal');
  if (!sel) return;
  sel.innerHTML = `<option value="">\u2014 ${t('classes.option_no_head')} \u2014</option>`;
  try {
    const profs = await window.elimuAPI.getProfesseursList(classeId);
    if (Array.isArray(profs)) {
      profs.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${esc(p.prenom)} ${esc(p.nom)}${p.matiere_principale ? ' \u2014 ' + esc(p.matiere_principale) : ''}`;
        if (selectedId && p.id == selectedId) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Erreur chargement professeurs:', e);
  }
}

export async function remplirCheckboxesMatieres(selectionnees = []) {
  const container = document.getElementById('matieres-checkboxes');
  if (!container) return;

  const systeme = document.getElementById('cf-systeme')?.value || 'francophone';
  const liste = systeme === 'francophone' ? LISTE_FRANCOPHONE : LISTE_ANGLOPHONE;

  let html = '';

  if (state.matieresPersonnalisees.length > 0) {
    html += `<div style="grid-column:1/-1; font-size:11px; font-weight:700; color:var(--purple-fifa);
                         text-transform:uppercase; margin-top:10px; border-bottom:1px solid rgba(168,85,247,0.2);
                         padding-bottom:4px; margin-bottom:4px;">
                ${t('classes.custom_subjects')}
             </div>`;
    state.matieresPersonnalisees.forEach(m => {
      html += renderMatiereCheckbox(m, selectionnees.includes(m), true);
    });
  }

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

  container.querySelectorAll('.btn-del-custom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nom = btn.dataset.nom;
      state.matieresPersonnalisees = state.matieresPersonnalisees.filter(n => n !== nom);
      const sel = getMatieresSelectionnees().filter(n => n !== nom);
      remplirCheckboxesMatieres(sel);
    });
  });
}

export async function sauvegarderClasse() {
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
    const defaultMatieres = getMatieresPourPreset(preset, systeme);

    if (state.classeEnCoursId) {
      const classe = state.toutesLesClasses.find(c => c.id === state.classeEnCoursId);
      const existant = parseMatieresJson(classe?.matieres_json || '[]');
      const existantMap = new Map(existant.map(m => [m.nom, m]));

      matieresJson = defaultMatieres.map(dm => {
        const ex = existantMap.get(dm.nom);
        if (ex) {
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
    const nomsMatieres = getMatieresSelectionnees();
    if (state.classeEnCoursId) {
      const classe = state.toutesLesClasses.find(c => c.id === state.classeEnCoursId);
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

  const result = state.classeEnCoursId
    ? await window.elimuAPI.updateClass(state.classeEnCoursId, data)
    : await window.elimuAPI.addClass(data);

  btnSave.disabled = false;
  btnSave.textContent = state.classeEnCoursId ? t('common.save') : t('classes.btn_create');

  if (result?.error) { afficherErreur('cf-error', result.error); return; }

  showToast(t('classes.save_success'), 'success');
  window.elimuAPI.logAudit(state.classeEnCoursId ? 'UPDATE_CLASSE' : 'ADD_CLASSE', t(state.classeEnCoursId ? 'classes.audit_updated' : 'classes.audit_added', { nom }), state._state?.user?.id);
  fermerFormulaire();
  await chargerClasses();
}

export async function ouvrirImportListe(classeId) {
  const classe = state.toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;
  const modal = document.getElementById('modal-import-liste');
  if (!modal) return;
  const title = document.getElementById('import-liste-title');
  const resultEl = document.getElementById('import-liste-result');
  if (title) title.textContent = `${t('classes.import_list_title')} \u2014 ${classe.nom_classe}`;
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

export async function executerImportListe(classeId, filePath, mode) {
  return await window.elimuAPI.importListeEleves(filePath, classeId, mode, window.appState.user?.id);
}

export async function ouvrirImportAbsences(classeId) {
  const classe = state.toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;
  const modal = document.getElementById('modal-import-absences');
  if (!modal) return;
  const titleEl = document.getElementById('import-abs-title');
  if (titleEl) titleEl.textContent = `${t('classes.import_abs_title')} \u2014 ${classe.nom_classe}`;
  modal.dataset.classeId = classeId;
  modal._fileContent = null;
  document.getElementById('import-abs-filename').textContent = '';
  document.getElementById('import-abs-result').style.display = 'none';
  document.getElementById('btn-import-abs-ok').disabled = true;
  modal.style.display = 'flex';
}

export function attacherEvenementsImportAbsences() {
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
    document.getElementById('import-abs-filename').textContent = `\u2705 ${filePath.split(/[/\\]/).pop()}`;
    document.getElementById('btn-import-abs-ok').disabled = false;
  });

  document.getElementById('btn-import-abs-ok')?.addEventListener('click', async () => {
    const classeId   = parseInt(modal.dataset.classeId);
    const csvContent = modal._fileContent;
    if (!csvContent || !classeId) return;
    const btn = document.getElementById('btn-import-abs-ok');
    btn.disabled = true; btn.textContent = '\u23f3 ' + t('common.waiting');
    const result = await window.elimuAPI.importAbsencesCSV({ classeId, csvContent });
    btn.disabled = false; btn.textContent = '\u2705 ' + t('common.import_excel');
    const resultEl = document.getElementById('import-abs-result');
    resultEl.style.display = 'block';
    if (result?.success) {
      const lignes = [];
      if (result.nbMisAJour > 0) lignes.push(`\u2705 ${result.nbMisAJour} ` + t('classes.import_abs_result_updated'));
      if (result.nbErreurs > 0)  lignes.push(`\u26a0\ufe0f ${result.nbErreurs} ` + t('classes.import_abs_result_errors'));
      if (result.erreurs?.length) {
        lignes.push('<div style="margin-top:6px;font-size:11px;opacity:0.8;">' +
          result.erreurs.map(e => `\u2022 ${esc(e)}`).join('<br>') + '</div>');
      }
      resultEl.className = 'backup-info success';
      resultEl.innerHTML = lignes.join('<br>') || '\u2705 ' + t('common.success');
      showToast(`\u2705 ${result.nbMisAJour} ` + t('classes.import_abs_result_updated'), 'success');
    } else {
      resultEl.className = 'backup-info';
      resultEl.textContent = `\u274c ${result?.error || t('common.error')}`;
      showToast(t('common.error'), 'error');
    }
  });
}
