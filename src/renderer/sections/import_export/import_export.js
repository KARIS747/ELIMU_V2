/**
 * import_export.js
 * Import Excel notes + absences · Export bulletins PDF · Export listes Excel
 */

import { t } from '../../locales/index.js';

let selectedFilePath    = null;
let absSelectedFilePath = null;
let classes             = [];
let toutesLesMatieres   = [];
let tousLesEleves       = [];
let state               = null;

// ============================================================
// INIT
// ============================================================

export async function init(st) {
  state = st;

  const [classesBrutes, matieresBrutes, elevesBruts] = await Promise.all([
    window.elimuAPI.getClasses(),
    window.elimuAPI.getMatieres(),
    window.elimuAPI.getEleves()
  ]);

  classes           = Array.isArray(classesBrutes)  ? classesBrutes  : [];
  toutesLesMatieres = Array.isArray(matieresBrutes) ? matieresBrutes : [];
  tousLesEleves     = Array.isArray(elevesBruts)    ? elevesBruts    : [];

  remplirSelects();
  setupOnglets();
  setupEvents();
  chargerResumeConfig();
}

// ============================================================
// REMPLISSAGE DES SELECTS
// ============================================================

function remplirSelects() {
  ['import-classe', 'abs-import-classe', 'export-classe-bulletins', 'bordereau-classe', 'export-eleve-classe'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    classes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = esc(c.nom_classe);
      el.appendChild(opt);
    });
  });

  const exportEleveClasse = document.getElementById('export-eleve-classe');
  if (exportEleveClasse) {
    exportEleveClasse.addEventListener('change', () => {
      const filtre = document.getElementById('search-eleve')?.value || '';
      remplirSelectEleves(exportEleveClasse.value, filtre);
    });
  }

  remplirSelectEleves('', '');

  const bordereauType = document.getElementById('bordereau-type');
  const groupMatiere = document.getElementById('group-matiere');
  const groupSequence = document.getElementById('group-sequence');
  
  bordereauType?.addEventListener('change', (e) => {
    const isNotes = e.target.value === 'notes';
    // Vérifier aussi le niveau de la classe
    const classeId = document.getElementById('bordereau-classe')?.value;
    const c = classes.find(cl => cl.id === parseInt(classeId));
    const isV2 = c && (c.niveau_v2 === 'N1' || c.niveau_v2 === 'N2');
    groupMatiere.style.display = (isNotes && !isV2) ? 'block' : 'none';
    groupSequence.style.display = (isNotes && !isV2) ? 'block' : 'none';
  });

  const importClasse  = document.getElementById('import-classe');
  const importMatiere = document.getElementById('import-matiere');
  const bordereauClasse = document.getElementById('bordereau-classe');
  const bordereauMatiere = document.getElementById('bordereau-matiere');

  if (importClasse) {
    importClasse.addEventListener('change', () => {
      updateMatieres(importClasse, importMatiere);
      toggleImportFieldsForNiveau(importClasse.value);
    });
    if (importMatiere) {
      importMatiere.innerHTML = `<option value="" disabled selected>← ${t('ie.import_select_class_first')}</option>`;
      importMatiere.disabled = true;
    }
  }

  if (bordereauClasse) {
    bordereauClasse.addEventListener('change', () => {
      updateMatieres(bordereauClasse, bordereauMatiere);
      toggleBordereauFieldsForNiveau(bordereauClasse.value);
      // Re-déclencher le type selection pour la visibilité matière/séquence
      bordereauType?.dispatchEvent(new Event('change'));
    });
    if (bordereauMatiere) {
      bordereauMatiere.innerHTML = `<option value="" disabled selected>— ${t('ie.select_subject_dash')} —</option>`;
      bordereauMatiere.disabled = true;
    }
  }
}

/**
 * Remplit le sélecteur d'élèves avec optimisation (DocumentFragment + rAF)
 */
function remplirSelectEleves(classeId = '', filtre = '') {
  const select = document.getElementById('export-eleve');
  if (!select) return;

  const cid = parseInt(classeId);
  const filtreLower = filtre.toLowerCase().trim();

  // Filtrage
  let elevesFiltres = tousLesEleves;
  if (cid) {
    elevesFiltres = elevesFiltres.filter(e => e.classe_id === cid);
  }
  if (filtreLower !== '') {
    elevesFiltres = elevesFiltres.filter(e =>
      `${e.prenom} ${e.nom}`.toLowerCase().includes(filtreLower)
    );
  }

  // État du sélecteur
  if (!cid && elevesFiltres.length > 100) {
    // Trop d'élèves si aucune classe n'est choisie
    select.innerHTML = `<option value="">— ${t('ie.select_class_first')} —</option>`;
    select.disabled = true;
    return;
  }

  select.disabled = false;
  const placeholder = cid 
    ? `— ${t('ie.export_select_student_dash')} (${elevesFiltres.length}) —`
    : `— ${t('ie.export_select_student_dash')} —`;
  
  select.innerHTML = `<option value="">${placeholder}</option>`;

  // Rendu optimisé
  const fragment = document.createDocumentFragment();
  
  elevesFiltres.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${esc(e.prenom)} ${esc(e.nom)} — ${esc(e.nom_classe || '?')}`;
    fragment.appendChild(opt);
  });

  requestAnimationFrame(() => {
    select.appendChild(fragment);
    if (elevesFiltres.length === 1) {
      select.value = elevesFiltres[0].id;
    }
  });
}

function updateMatieres(selectClasse, selectMatiere) {
  if (!selectMatiere) return;
  const classeId = parseInt(selectClasse?.value);
  if (!classeId) {
    selectMatiere.innerHTML = `<option value="" disabled selected>← ${t('ie.import_select_class_first')}</option>`;
    selectMatiere.disabled = true;
    return;
  }

  const classe = classes.find(c => c.id === classeId);
  let matieresClasse = [];
  try {
    const parsed = JSON.parse(classe?.matieres_json || '[]');
    matieresClasse = parsed.map(item =>
      typeof item === 'string' ? item : (item.nom || item.nom_matiere || '')
    ).filter(Boolean);
  } catch { matieresClasse = []; }

  selectMatiere.innerHTML = `<option value="" disabled selected>— ${t('ie.import_select_subject_dash')} —</option>`;
  selectMatiere.disabled = false;

  const listeSource = matieresClasse.length > 0
    ? toutesLesMatieres.filter(m => matieresClasse.includes(m.nom_matiere))
    : toutesLesMatieres;

  if (matieresClasse.length > 0 && listeSource.length === 0) {
    selectMatiere.appendChild(new Option('⚠️ ' + t('ie.import_not_found_all_shown'), '', true, false));
    toutesLesMatieres.forEach(m => selectMatiere.appendChild(new Option(esc(m.nom_matiere), m.id)));
  } else {
    if (matieresClasse.length === 0) {
      selectMatiere.appendChild(new Option('⚠️ ' + t('ie.import_no_subject_assigned'), '', true, false));
    }
    listeSource.forEach(m => selectMatiere.appendChild(new Option(esc(m.nom_matiere), m.id)));
  }
}

// ============================================================
// ONGLETS
// ============================================================

function setupOnglets() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${tabId}`)?.classList.add('active');
    });
  });
}

// ============================================================
// RÉSUMÉ CONFIG BULLETIN
// ============================================================

async function chargerResumeConfig() {
  const container = document.getElementById('bulletin-config-resume');
  if (!container) return;

  const cfg = await window.elimuAPI.getBulletinConfig();
  if (!cfg || cfg.error) {
    container.innerHTML = `<div style="color:var(--text-muted);">${t('ie.config_not_available')}</div>`;
    return;
  }

  const notation = cfg.notation_type === 'mentions' ? t('ie.notation_mentions')
    : cfg.notation_type === 'lettres' ? t('ie.notation_letters')
    : t('ie.notation_numeric');

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:8px; background:${esc(cfg.couleur_primaire||'#1a3c6e')}; flex-shrink:0;"></div>
        <div>
          <div style="font-weight:600; color:var(--text-primary);">${esc(cfg.etab_nom || t('ie.config_etab_not_configured'))}</div>
          <div style="font-size:11px; color:var(--text-muted);">${esc(cfg.etab_devise || '')}</div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px;">
        <div style="background:var(--bg-secondary); padding:8px; border-radius:6px;">
          <div style="color:var(--text-muted);">${t('ie.config_notation_label')}</div>
          <div style="color:var(--text-primary); font-weight:600;">${esc(notation)}</div>
        </div>
        <div style="background:var(--bg-secondary); padding:8px; border-radius:6px;">
          <div style="color:var(--text-muted);">${t('ie.config_weight_label')}</div>
          <div style="color:var(--text-primary); font-weight:600;">Seq1 ${cfg.calc_poids_seq1||40}% / Seq2 ${cfg.calc_poids_seq2||60}%</div>
        </div>
        <div style="background:var(--bg-secondary); padding:8px; border-radius:6px;">
          <div style="color:var(--text-muted);">${t('ie.config_region_label')}</div>
          <div style="color:var(--text-primary); font-weight:600; font-size:11px;">${esc(cfg.delegation_regionale || t('ie.config_region_not_configured'))}</div>
        </div>
        <div style="background:var(--bg-secondary); padding:8px; border-radius:6px;">
          <div style="color:var(--text-muted);">${t('ie.config_year_label')}</div>
          <div style="color:var(--text-primary); font-weight:600;">${esc(cfg.annee_scolaire || '—')}</div>
        </div>
      </div>
      <div style="padding:8px 10px; background:rgba(0,230,118,0.06); border:1px solid rgba(0,230,118,0.2);
           border-radius:6px; font-size:11px; color:var(--text-muted);">
        ${t('ie.config_hint')}
      </div>
    </div>
  `;
}

// ============================================================
// ÉVÉNEMENTS
// ============================================================

function setupEvents() {

  // ── Import Notes — dropzone ────────────────────────────────
  const dropzone = document.getElementById('import-dropzone');
  if (dropzone) {
    dropzone.addEventListener('click', async () => {
      const filePath = await window.elimuAPI.selectFile();
      if (filePath) {
        selectedFilePath = filePath;
        const filename = filePath.split(/[/\\]/).pop();
        document.getElementById('import-filename').textContent = `${esc(filename)}`;
        checkImportReady();
      }
    });
    dropzone.addEventListener('mouseenter', () => {
      dropzone.style.borderColor = 'var(--green-fifa)';
      dropzone.style.background  = 'rgba(0,230,118,0.04)';
    });
    dropzone.addEventListener('mouseleave', () => {
      dropzone.style.borderColor = 'var(--border-color)';
      dropzone.style.background  = 'transparent';
    });
  }

  ['import-classe', 'import-matiere'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', checkImportReady);
  });

  // ── Import Notes — bouton ──────────────────────────────────
  document.getElementById('btn-import')?.addEventListener('click', async () => {
    const classeId  = document.getElementById('import-classe')?.value;
    const matiereId = document.getElementById('import-matiere')?.value;
    const periode   = document.getElementById('import-periode')?.value  || 'Trimestre 1';
    const sequence  = parseInt(document.getElementById('import-sequence')?.value) || 1;
    const isV2 = isV2File(selectedFilePath);

    if (!selectedFilePath || !classeId || (!isV2 && !matiereId)) {
      showToast(t('ie.toast_select_all'), 'warning');
      return;
    }

    const btn = document.getElementById('btn-import');
    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.import_btn_waiting');
    showIELoader(t('ie.import_title'), t('common.processing'), 50);

    const result = await window.elimuAPI.importExcel(
      selectedFilePath, parseInt(classeId), isV2 ? null : parseInt(matiereId),
      periode, sequence, window.appState.user?.id
    );

    btn.disabled = false; btn.textContent = t('ie.import_btn_notes');
    hideIELoader();
    afficherResultatImport(result);
  });

  document.getElementById('btn-close-result')?.addEventListener('click', () => {
    document.getElementById('import-result')?.classList.add('hidden');
  });

  // ── Import Absences — dropzone ─────────────────────────────
  const absDropzone = document.getElementById('abs-import-dropzone');
  if (absDropzone) {
    absDropzone.addEventListener('click', async () => {
      const filePath = await window.elimuAPI.selectFile();
      if (filePath) {
        absSelectedFilePath = filePath;
        const filename = filePath.split(/[/\\]/).pop();
        document.getElementById('abs-import-filename').textContent = `✅ ${esc(filename)}`;
        checkAbsImportReady();
      }
    });
    absDropzone.addEventListener('mouseenter', () => {
      absDropzone.style.borderColor = 'var(--yellow-fifa)';
      absDropzone.style.background  = 'rgba(255,183,77,0.04)';
    });
    absDropzone.addEventListener('mouseleave', () => {
      absDropzone.style.borderColor = 'var(--border-color)';
      absDropzone.style.background  = 'transparent';
    });
  }

  document.getElementById('abs-import-classe')?.addEventListener('change', checkAbsImportReady);

  // ── Import Absences — bouton ───────────────────────────────
  document.getElementById('btn-abs-import')?.addEventListener('click', async () => {
    const classeId = document.getElementById('abs-import-classe')?.value;
    const periode  = document.getElementById('abs-import-periode')?.value || 'all';
    if (!absSelectedFilePath || !classeId) {
      showToast(t('ie.import_abs_select_all'), 'warning');
      return;
    }

    const btn     = document.getElementById('btn-abs-import');
    const resultEl = document.getElementById('abs-import-result');

    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.import_abs_btn_waiting');
    if (resultEl) resultEl.style.display = 'none';
    showIELoader(t('ie.abs_import_title'), t('common.processing'), 50);

    const result = await window.elimuAPI.importAbsencesExcel({
      classeId: parseInt(classeId),
      filePath: absSelectedFilePath,
      periode: periode
    });

    btn.disabled = false; btn.textContent = t('ie.import_abs_btn_abs');
    hideIELoader();

    if (resultEl) {
      resultEl.style.display = 'block';
      if (result?.success) {
        const lignes = [];
        if (result.nbMisAJour > 0) lignes.push(`✅ ${result.nbMisAJour} ` + t('ie.import_abs_result_updated'));
        if (result.nbErreurs > 0)  lignes.push(`⚠️ ${result.nbErreurs} ` + t('ie.import_abs_result_ignored'));
        if (result.erreurs?.length) {
          lignes.push('<div style="margin-top:6px;font-size:11px;opacity:0.8;">' +
            result.erreurs.map(e => `• ${esc(e)}`).join('<br>') + '</div>');
        }
        resultEl.className = 'backup-info success';
        resultEl.innerHTML = lignes.join('<br>') || '✅ ' + t('ie.import_abs_result_success');
        showToast(`✅ ${result.nbMisAJour} ` + t('ie.import_abs_result_updated'), 'success');
      } else {
        resultEl.className = 'backup-info';
        resultEl.textContent = `❌ ${result?.error || t('ie.import_abs_result_error')}`;
        showToast(t('ie.import_abs_toast_error'), 'error');
      }
    }
  });

  // ── Télécharger modèle absences ────────────────────────────
  document.getElementById('btn-dl-modele-abs')?.addEventListener('click', async () => {
    const classeId = document.getElementById('abs-import-classe')?.value;
    const periode  = document.getElementById('abs-import-periode')?.value || 'all';
    if (!classeId) {
      showToast('⚠️ ' + t('ie.model_abs_toast_select_class'), 'warning');
      return;
    }

    const btn = document.getElementById('btn-dl-modele-abs');
    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.model_abs_btn_waiting');

    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportModeleAbsences(parseInt(classeId), state?.user?.id, periode, lang);

    btn.disabled = false; btn.textContent = t('ie.model_abs_btn_label');

    if (result?.canceled) return;
    showToast(
      result?.success ? '✅ ' + t('ie.model_abs_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Télécharger modèle notes ───────────────────────────────
  document.getElementById('btn-dl-modele-notes')?.addEventListener('click', async () => {
    const classeId = document.getElementById('import-classe')?.value;
    if (!classeId) {
      showToast('⚠️ ' + t('ie.model_abs_toast_select_class'), 'warning');
      return;
    }
    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportModeleNotes(classeId, state?.user?.id, lang);
    showToast(
      result?.success ? '✅ ' + t('ie.model_notes_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Export bordereau (Notes ou Absences) ────────────────────
  document.getElementById('btn-export-bordereau')?.addEventListener('click', async () => {
    const type      = document.getElementById('bordereau-type')?.value;
    const classeId  = document.getElementById('bordereau-classe')?.value;
    const periode   = document.getElementById('bordereau-periode')?.value || 'Trimestre 1';

    if (!classeId) {
      showToast(t('ie.toast_select_all'), 'warning');
      return;
    }

    const btn = document.getElementById('btn-export-bordereau');
    btn.disabled = true; btn.textContent = '⏳ ' + t('common.processing');
    showIELoader(t('ie.tab_bordereau_combined'), t('common.processing'), 50);

    let result;
    const lang = window.getCurrentGenLocale();

    if (type === 'absences') {
      result = await window.elimuAPI.exportBordereauAbsences(
        parseInt(classeId), periode, state?.user?.id, lang
      );
    } else if (type === 'emargement') {
      result = await window.elimuAPI.exportBordereauEmargement(
        parseInt(classeId), 
        periode, 
        state?.user?.id,
        {
          title: tGen('ie.pdf_tally_emargement'),
          colNo: tGen('ie.column_no'),
          colName: tGen('ie.column_name'),
          colSignature: tGen('ie.column_signature'),
          labelAnnee: tGen('school_year')
        }
      );
    } else {
      const matiereId = document.getElementById('bordereau-matiere')?.value;
      const sequence  = document.getElementById('bordereau-sequence')?.value || '1';
      if (!matiereId) {
        showToast(t('ie.toast_select_all'), 'warning');
        btn.disabled = false; btn.textContent = t('ie.btn_generate_bordereau_combined');
        hideIELoader();
        return;
      }
      result = await window.elimuAPI.exportBordereau(
        parseInt(classeId), parseInt(matiereId), periode, sequence, state?.user?.id, lang
      );
    }

    btn.disabled = false; btn.textContent = t('ie.btn_generate_bordereau_combined');
    hideIELoader();
    if (result?.canceled) return;

    if (result?.success) {
      showToast('✅ Bordereau généré avec succès !', 'success');
    } else {
      showToast(result?.error || t('common.error'), 'error');
    }
  });

  // ── Export bulletin individuel ─────────────────────────────

  // ── Export bulletin individuel ─────────────────────────────
  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    const eleveId = document.getElementById('export-eleve')?.value;
    if (!eleveId) { showToast(t('ie.export_indiv_toast_select'), 'warning'); return; }

    const periode   = document.getElementById('export-pdf-periode')?.value || 'Trimestre 1';
    const btn       = document.getElementById('btn-export-pdf');
    const statusEl  = document.getElementById('export-ind-status');

    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.export_indiv_btn_waiting');
    showIELoader(t('ie.bulletin_ind_title'), t('common.processing'), 50);

    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportPDF(
      parseInt(eleveId), periode, 1, state?.user?.id, lang
    );

    btn.disabled = false; btn.textContent = t('ie.export_indiv_btn_pdf');
    hideIELoader();
    if (result?.canceled) return;

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className     = result?.success ? 'backup-info success' : 'backup-info';
      statusEl.textContent   = result?.success
        ? '✅ ' + t('ie.export_indiv_result_success')
        : `❌ ${result?.error || t('common.error')}`;
    }
    showToast(
      result?.success ? '📄 ' + t('ie.export_indiv_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Export bulletin récapitulatif annuel ───────────────────
  document.getElementById('btn-export-recap')?.addEventListener('click', async () => {
    const eleveId = document.getElementById('export-eleve')?.value;
    if (!eleveId) { showToast(t('ie.export_indiv_toast_select'), 'warning'); return; }

    const btn     = document.getElementById('btn-export-recap');
    const statusEl = document.getElementById('export-ind-status');

    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.export_recap_btn_waiting');
    showIELoader(t('ie.export_recap_btn_label'), t('common.processing'), 50);

    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportBulletinRecap(
      parseInt(eleveId), state?.user?.id, lang
    );

    btn.disabled = false; btn.textContent = t('ie.export_recap_btn_label');
    hideIELoader();
    if (result?.canceled) return;

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className     = result?.success ? 'backup-info success' : 'backup-info';
      statusEl.textContent   = result?.success
        ? '✅ ' + t('ie.export_recap_result_success')
        : `❌ ${result?.error || t('common.error')}`;
    }
    showToast(
      result?.success ? '📋 ' + t('ie.export_recap_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Export récapitulatifs annuels toute une classe (avec progression et verrou) ──
  document.getElementById('btn-export-recap-classe')?.addEventListener('click', async () => {
    const classeId = document.getElementById('export-classe-bulletins')?.value;
    if (!classeId) {
      showToast(t('ie.export_class_toast_select'), 'warning');
      return;
    }

    const btn = document.getElementById('btn-export-recap-classe');
    let statusEl = document.getElementById('export-classe-recap-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'export-classe-recap-status';
      statusEl.style.display = 'none';
      statusEl.className = 'backup-info';
      btn.parentNode.appendChild(statusEl);
    }

    btn.disabled = true;
    btn.textContent = '⏳ ' + t('ie.export_class_recap_btn_waiting');
    statusEl.style.display = 'none';
    
    showIELoader(t('ie.export_class_recap_btn_label'), t('ie.export_class_bulletin_progress_preparing'), 0, '0 / ?');

    const onProgress = (data) => {
      if (data.type === 'recapClasse') {
        const percent = (data.completed / data.total) * 100;
        showIELoader(
          t('ie.export_class_recap_btn_label'),
          t('ie.export_class_recap_progress_active').replace('{completed}', data.completed).replace('{total}', data.total),
          percent,
          `${data.completed} / ${data.total}`
        );
      }
    };
    window.elimuAPI.onExportProgress(onProgress);
    const cleanup = () => {
      window.elimuAPI.removeExportProgressListener();
      hideIELoader();
    };

    try {
      const lang = window.getCurrentGenLocale();
      const result = await window.elimuAPI.exportRecapClasse(parseInt(classeId), state?.user?.id, lang);
      cleanup();

      btn.disabled = false;
      btn.textContent = t('ie.export_class_recap_btn_label');

      if (result?.canceled) return;

      statusEl.style.display = 'block';
      if (result?.success) {
        statusEl.className = 'backup-info success';
        statusEl.innerHTML = `✅ ${t('ie.export_class_recap_result_success')}`;
        showToast(`✅ ${result.nbEleves} ` + t('ie.export_class_recap_toast_success'), 'success');
      } else {
        statusEl.className = 'backup-info';
        statusEl.textContent = `❌ ${result?.error || t('common.error')}`;
        showToast(result?.error || t('common.error'), 'error');
      }
    } catch (err) {
      cleanup();
      btn.disabled = false;
      btn.textContent = t('ie.export_class_recap_btn_label');
      statusEl.style.display = 'block';
      statusEl.className = 'backup-info';
      statusEl.textContent = `❌ ${err.message}`;
      showToast(err.message, 'error');
    }
  });

  // ── Export bulletins toute une classe (avec progression et verrou) ──
  document.getElementById('btn-export-classe')?.addEventListener('click', async () => {
    const classeId = document.getElementById('export-classe-bulletins')?.value;
    const periode  = document.getElementById('export-classe-periode')?.value || 'Trimestre 1';

    if (!classeId) {
      showToast(t('ie.export_class_toast_select'), 'warning');
      return;
    }

    const btn       = document.getElementById('btn-export-classe');
    const statusEl  = document.getElementById('export-classe-status');

    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.export_class_bulletin_btn_waiting');
    if (statusEl) statusEl.style.display = 'none';

    showIELoader(t('ie.export_class_bulletin_btn_label'), t('ie.export_class_bulletin_progress_preparing'), 0, '0 / ?');

    const onProgress = (data) => {
      if (data.type === 'bulletinClasse') {
        const percent = (data.completed / data.total) * 100;
        showIELoader(
          t('ie.export_class_bulletin_btn_label'),
          t('ie.export_class_bulletin_progress_active').replace('{completed}', data.completed).replace('{total}', data.total),
          percent,
          `${data.completed} / ${data.total}`
        );
      }
    };
    window.elimuAPI.onExportProgress(onProgress);
    const cleanup = () => {
      window.elimuAPI.removeExportProgressListener();
      hideIELoader();
    };

    try {
      const lang = window.getCurrentGenLocale();
      const result = await window.elimuAPI.exportBulletinClasse(parseInt(classeId), periode, state?.user?.id, lang);
      cleanup();

      btn.disabled = false; btn.textContent = t('ie.export_class_bulletin_btn_label');

      if (result?.canceled) return;

      if (statusEl) {
        statusEl.style.display = 'block';
        if (result?.success) {
          statusEl.className = 'backup-info success';
          statusEl.innerHTML = `✅ ${t('ie.export_class_bulletin_result_success')}`;
        } else {
          statusEl.className = 'backup-info';
          statusEl.textContent = `❌ ${result?.error || t('common.error')}`;
        }
      }
      showToast(
        result?.success ? `✅ ${result.nbEleves} ` + t('ie.export_class_bulletin_toast_success') : result?.error || t('common.error'),
        result?.success ? 'success' : 'error'
      );
    } catch (err) {
      cleanup();
      btn.disabled = false; btn.textContent = t('ie.export_class_bulletin_btn_label');
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.className = 'backup-info';
        statusEl.textContent = `❌ ${err.message}`;
      }
      showToast(err.message, 'error');
    }
  });

  // ── Export Excel liste classe ──────────────────────────────
  document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
    const classeId = document.getElementById('export-classe-xl')?.value;
    if (!classeId) { showToast(t('ie.export_xl_toast_select'), 'warning'); return; }
    const btn = document.getElementById('btn-export-excel');
    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.export_xl_btn_waiting');
    showIELoader(t('ie.excel_full_title'), t('common.processing'), 50);

    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportExcel(parseInt(classeId), state?.user?.id, lang);
    btn.disabled = false; btn.textContent = t('ie.export_xl_btn_label');
    hideIELoader();

    if (result?.canceled) return;
    showToast(
      result?.success ? `✅ ${result.nbEleves || ''} ` + t('ie.export_xl_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Export Excel rentrée ───────────────────────────────────
  document.getElementById('btn-export-rentree')?.addEventListener('click', async () => {
    const classeId = document.getElementById('export-classe-rentree')?.value;
    if (!classeId) { showToast(t('ie.export_xl_toast_select'), 'warning'); return; }
    const btn = document.getElementById('btn-export-rentree');
    btn.disabled = true; btn.textContent = '⏳ ' + t('ie.export_rentree_btn_waiting');
    showIELoader(t('ie.excel_rentree_title'), t('common.processing'), 50);

    const lang = window.getCurrentGenLocale();
    const result = await window.elimuAPI.exportExcelRentree(parseInt(classeId), state?.user?.id, lang);
    btn.disabled = false; btn.textContent = t('ie.export_rentree_btn_label');
    hideIELoader();

    if (result?.canceled) return;
    showToast(
      result?.success ? `✅ ${result.nbEleves || ''} ` + t('ie.export_rentree_toast_success') : result?.error || t('common.error'),
      result?.success ? 'success' : 'error'
    );
  });

  // ── Recherche d'élève ──────────────────────────────────────
  document.getElementById('btn-search-eleve')?.addEventListener('click', () => {
    const cid = document.getElementById('export-eleve-classe')?.value || '';
    const filtre = document.getElementById('search-eleve')?.value || '';
    remplirSelectEleves(cid, filtre);
  });
  const searchInput = document.getElementById('search-eleve');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const cid = document.getElementById('export-eleve-classe')?.value || '';
      remplirSelectEleves(cid, e.target.value);
    });
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const cid = document.getElementById('export-eleve-classe')?.value || '';
        remplirSelectEleves(cid, searchInput.value);
      }
    });
  }
}

// ============================================================
// HELPERS
// ============================================================

function isV2File(filePath) {
  if (!filePath) return false;
  const filename = filePath.split(/[/\\]/).pop();
  return /^ELIMU_([^_]+)_([^_]+)_([^_]+)_([^_]+)_([^\.]+)\.xlsx$/i.test(filename);
}

function toggleImportFieldsForNiveau(classeId) {
  if (!classeId) return;
  const c = classes.find(cl => cl.id === parseInt(classeId));
  const isV2 = c && (c.niveau_v2 === 'N1' || c.niveau_v2 === 'N2');
  
  const seqGroup = document.getElementById('import-sequence')?.closest('.input-group');
  if (seqGroup) seqGroup.style.display = isV2 ? 'none' : 'block';
  
  const matGroup = document.getElementById('import-matiere')?.closest('.input-group');
  if (matGroup) matGroup.style.display = isV2 ? 'none' : 'block';
}

function toggleBordereauFieldsForNiveau(classeId) {
  if (!classeId) return;
  const c = classes.find(cl => cl.id === parseInt(classeId));
  const isV2 = c && (c.niveau_v2 === 'N1' || c.niveau_v2 === 'N2');
  
  const grpMat = document.getElementById('group-matiere');
  const grpSeq = document.getElementById('group-sequence');
  if (grpMat) grpMat.style.display = isV2 ? 'none' : 'block';
  if (grpSeq) grpSeq.style.display = isV2 ? 'none' : 'block';
}

function checkImportReady() {
  const classeId  = document.getElementById('import-classe')?.value;
  const matiereId = document.getElementById('import-matiere')?.value;
  const btn = document.getElementById('btn-import');
  const isV2 = isV2File(selectedFilePath);
  
  if (btn) btn.disabled = !(classeId && selectedFilePath && (isV2 || matiereId));

  // Masquer dynamiquement le choix de la matière s'il s'agit d'un import UA V2
  const matSelect = document.getElementById('import-matiere');
  const matGroup = matSelect?.closest('.input-group');
  if (matGroup) {
    matGroup.style.display = isV2 ? 'none' : 'block';
  }
}

function checkAbsImportReady() {
  const classeId = document.getElementById('abs-import-classe')?.value;
  const btn = document.getElementById('btn-abs-import');
  if (btn) btn.disabled = !(classeId && absSelectedFilePath);
}

function afficherResultatImport(result) {
  const container = document.getElementById('import-result');
  const content   = document.getElementById('import-result-content');
  if (!container || !content) return;

  const statut  = result.statut || (result.success ? 'Succès' : 'Échec');
  const couleur = statut === 'Succès' ? 'var(--green-fifa)'
    : statut === 'Partiel' ? 'var(--yellow-fifa)' : 'var(--red-fifa)';

  content.innerHTML = `
    <div style="display:flex; gap:16px; margin-bottom:16px;">
      <div class="stat-card" style="flex:1;">
        <div class="stat-icon" style="background:rgba(0,230,118,0.15);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 11"></polyline></svg></div>
        <div><div class="stat-value" style="color:var(--green-fifa);">${result.nbImportes || 0}</div>
        <div class="stat-label">${t('ie.import_result_stat_imported')}</div></div>
      </div>
      <div class="stat-card" style="flex:1;">
        <div class="stat-icon" style="background:rgba(255,82,82,0.15);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
        <div><div class="stat-value" style="color:var(--red-fifa);">${result.nbErreurs || 0}</div>
        <div class="stat-label">${t('ie.import_result_stat_errors')}</div></div>
      </div>
      <div class="stat-card" style="flex:1;">
        <div class="stat-icon" style="background:rgba(45,110,224,0.15);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg></div>
        <div><div class="stat-value" style="color:${couleur}; font-size:16px;">${esc(statut)}</div>
        <div class="stat-label">${t('ie.import_result_stat_status')}</div></div>
      </div>
    </div>
    ${result.erreurs?.length ? `
    <div style="background:rgba(255,82,82,0.06); border:1px solid rgba(255,82,82,0.2);
         border-radius:8px; padding:12px; margin-bottom:10px;">
      <div style="font-weight:600; color:var(--red-fifa); margin-bottom:8px;">${t('ie.import_result_title_errors')}</div>
      ${result.erreurs.map(e => `<div style="font-size:12px; color:var(--text-muted);">• ${esc(e)}</div>`).join('')}
    </div>` : ''}
    ${result.avertissements?.length ? `
    <div style="background:rgba(255,183,77,0.06); border:1px solid rgba(255,183,77,0.2);
         border-radius:8px; padding:12px;">
      <div style="font-weight:600; color:var(--yellow-fifa); margin-bottom:8px;">${t('ie.import_result_title_warnings')}</div>
      ${result.avertissements.map(a => `<div style="font-size:12px; color:var(--text-muted);">• ${esc(a)}</div>`).join('')}
    </div>` : ''}
  `;

  container.classList.remove('hidden');
  showToast(
    statut === 'Succès'  ? `${t('ie.import_toast_success').replace('{count}', result.nbImportes)}` :
    statut === 'Partiel' ? `${t('ie.import_toast_partial').replace('{count}', result.nbImportes).replace('{erreurs}', result.nbErreurs)}` :
    t('ie.import_toast_error'),
    statut === 'Succès' ? 'success' : statut === 'Partiel' ? 'warning' : 'error'
  );
}

// ── Loader Global ─────────────────────────────────────────
function showIELoader(title = '', text = 'Veuillez patienter...', progress = null, countText = '') {
  const loader = document.getElementById('ie-global-loader');
  const tit = document.getElementById('ie-loader-title');
  const txt = document.getElementById('ie-loader-text');
  const bar = document.getElementById('ie-loader-bar');
  const pct = document.getElementById('ie-loader-percent');
  const cnt = document.getElementById('ie-loader-count');

  if (loader) {
    loader.style.display = 'flex';
    if (tit) tit.textContent = title || t('common.processing');
    if (txt) txt.textContent = text;
    if (bar) {
      bar.style.width = progress !== null ? `${progress}%` : '0%';
    }
    if (pct) pct.textContent = progress !== null ? `${Math.round(progress)}%` : '';
    if (cnt) cnt.textContent = countText || '';
  }
}

function hideIELoader() {
  const loader = document.getElementById('ie-global-loader');
  if (loader) loader.style.display = 'none';
}

