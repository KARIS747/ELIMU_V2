import { state } from './state.js';
import {
  toggleMatieresSection, filtrerCheckboxesMatieres, getMatieresSelectionnees
} from './helpers.js';
import { afficherKPIs, afficherClasses, filtrerClasses } from './liste.js';
import { fermerConfigClasse, sauvegarderConfig, attacherEvenementsConfigGroupes } from './config.js';
import {
  ouvrirFormulaire, fermerFormulaire, sauvegarderClasse, remplirCheckboxesMatieres,
  executerImportListe, attacherEvenementsImportAbsences
} from './form.js';
import { fermerDetail } from './detail.js';

export async function init(appState) {
  state._state = appState;
  const raw = await window.elimuAPI.getMatieres();
  state.toutesLesMatieres = Array.isArray(raw) ? raw : [];

  const root = document.getElementById('classes-root');
  if (root && !root._eventsAttached) {
    attacherEvenements();
    root._eventsAttached = true;
  }

  await chargerClasses();
  if (!state.toutesLesMatieres.length) {
    setTimeout(async () => {
      const retry = await window.elimuAPI.getMatieres();
      state.toutesLesMatieres = Array.isArray(retry) ? retry : [];
    }, 600);
  }
}

export async function chargerClasses() {
  const grid = document.getElementById('classes-grid');
  if (!grid) return;
  grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:center;padding:40px;">
    <div class="spinner"></div></div>`;
  const _cls = await window.elimuAPI.getClasses();
  state.toutesLesClasses = Array.isArray(_cls) ? _cls : [];
  await syncGlobal();
  afficherKPIs(state.toutesLesClasses);
  afficherClasses(state.toutesLesClasses);
}

export async function syncGlobal() {
  const _raw = await window.elimuAPI.getClasses();
  const classes = Array.isArray(_raw) ? _raw : [];
  state.toutesLesClasses = classes;
  if (window.appState) window.appState.classes = classes;
  document.dispatchEvent(new CustomEvent('elimu:classes-updated', { detail: { classes } }));
}

function attacherEvenements() {
  document.getElementById('btn-add-classe')?.addEventListener('click', () => ouvrirFormulaire(null));
  document.getElementById('modal-classe-close')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-classe-cancel')?.addEventListener('click', fermerFormulaire);
  document.getElementById('modal-classe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-classe')) fermerFormulaire();
  });
  document.getElementById('modal-classe-save')?.addEventListener('click', sauvegarderClasse);

  const PRESET_MAP = {
    SIL:  { niveau: 'Primaire', niveau_v2: 'N1' },
    CP:   { niveau: 'Primaire', niveau_v2: 'N1' },
    CE1:  { niveau: 'Primaire', niveau_v2: 'N2' },
    CE2:  { niveau: 'Primaire', niveau_v2: 'N2' },
    CM1:  { niveau: 'Primaire', niveau_v2: 'N2' },
    CM2:  { niveau: 'Primaire', niveau_v2: 'N3' },
  };

  document.querySelectorAll('.preset-btn')?.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.val;
      const lvl = btn.dataset.lvl;
      const nomInput    = document.getElementById('cf-nom');
      const niveauSel   = document.getElementById('cf-niveau');
      const niveauV2Sel = document.getElementById('cf-niveau-v2');

      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');

      if (val === '') {
        if (nomInput) nomInput.value = '';
        if (niveauV2Sel) niveauV2Sel.style.display = 'block';
        toggleMatieresSection(null);
        remplirCheckboxesMatieres([]);
        return;
      }

      if (nomInput) nomInput.value = val;
      if (niveauV2Sel) {
        niveauV2Sel.value = lvl;
        niveauV2Sel.style.display = 'none';
      }

      const preset = PRESET_MAP[val];
      if (preset && niveauSel) {
        niveauSel.value = preset.niveau;
      }

      toggleMatieresSection(lvl);
    });
  });

  document.getElementById('cf-systeme')?.addEventListener('change', (e) => {
    if (state.classeEnCoursId) {
      if (confirm(t('classes.change_system_confirm'))) {
        state.matieresPersonnalisees = [];
        remplirCheckboxesMatieres([]);
      } else {
        const classe = state.toutesLesClasses.find(c => c.id === state.classeEnCoursId);
        e.target.value = classe?.systeme_educatif || 'francophone';
      }
    } else {
      state.matieresPersonnalisees = [];
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
      if (!state.matieresPersonnalisees.includes(nom)) {
        state.matieresPersonnalisees.push(nom);
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
  document.getElementById('modal-import-liste-cancel')?.addEventListener('click', () => {
    if (modalImport) modalImport.style.display = 'none';
  });
  modalImport?.addEventListener('click', e => {
    if (e.target === modalImport) modalImport.style.display = 'none';
  });

  document.getElementById('btn-download-modele-import')?.addEventListener('click', async () => {
    const classeId = parseInt(modalImport.dataset.classeId);
    if (!classeId) return;
    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportModeleImport(classeId, state._state?.user?.id, lang);
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
    document.getElementById('import-liste-filename').textContent = `\u2705 ${filePath.split(/[/\\]/).pop()}`;
    document.getElementById('btn-import-liste-ok').disabled = false;
  });
  document.getElementById('btn-import-liste-ok')?.addEventListener('click', async () => {
    const classeId = parseInt(modalImport.dataset.classeId);
    const filePath = modalImport._filePath;
    const mode = document.getElementById('import-mode-ecrase')?.checked ? 'ecrase' : 'ajoute';
    if (!filePath || !classeId) return;
    const btn = document.getElementById('btn-import-liste-ok');
    btn.disabled = true; btn.textContent = '\u23f3 ' + t('common.waiting');
    const result = await executerImportListe(classeId, filePath, mode);
    btn.disabled = false; btn.textContent = '\u2705 ' + t('common.import_excel');
    const resultEl = document.getElementById('import-liste-result');
    if (resultEl) {
      resultEl.style.display = 'block';
      if (result.success) {
        const lignes = [];
        if (result.nbAjoutes > 0)   lignes.push(`\u2705 ${result.nbAjoutes} ` + t('classes.import_list_result_added'));
        if (result.nbRemplaces > 0) lignes.push(`\ud83d\udd04 ${result.nbRemplaces} ` + t('classes.import_list_result_replaced'));
        if (result.nbIgnores > 0)   lignes.push(`\u23ed\ufe0f ${result.nbIgnores} ` + t('classes.import_list_result_ignored'));
        if (result.nbErreurs > 0)   lignes.push(`\u26a0\ufe0f ${result.nbErreurs} ` + t('classes.import_list_result_errors'));
        resultEl.className = 'backup-info success';
        resultEl.innerHTML = lignes.join('<br>');
        showToast(t('common.success'), 'success');
        await chargerClasses();
      } else {
        resultEl.className = 'backup-info';
        resultEl.textContent = `\u274c ${result.error || t('common.error')}`;
        showToast(t('common.error'), 'error');
      }
    }
  });

  attacherEvenementsImportAbsences();
}

export { init as default };
