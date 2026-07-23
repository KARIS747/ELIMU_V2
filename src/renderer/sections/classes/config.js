import { state, t } from './state.js';
import { parseMatieresJson, estClassePreset } from './helpers.js';
import { chargerClasses } from './classes.js';

export async function ouvrirConfigClasse(classeId) {
  const classe = state.toutesLesClasses.find(c => c.id === classeId);
  if (!classe) return;

  state.configClasseId    = classeId;
  state.configGroupeSelIdx = null;

  document.getElementById('config-classe-title').textContent =
    `${t('classes.config_title')} \u2014 ${classe.nom_classe}`;

  const existant = parseMatieresJson(classe.matieres_json);

  state.configMatieres = existant.map(ex => {
    const globalMat = state.toutesLesMatieres.find(tm => tm.nom_matiere === ex.nom);
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
  state.configGroupes = Array.from(groupesSet).map(nom => ({ nom }));

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

export function fermerConfigClasse() {
  document.getElementById('modal-config-classe').style.display = 'none';
  state.configClasseId    = null;
  state.configGroupeSelIdx = null;
}

export function afficherConfigMatieres() {
  const container = document.getElementById('config-matieres-list');
  if (!container) return;

  const classe = state.toutesLesClasses.find(c => c.id === state.configClasseId);
  const isPreset = classe ? estClassePreset(classe.nom_classe) : false;

  const tipEl = document.getElementById('config-tip');
  if (tipEl) {
    if (isPreset) {
      tipEl.textContent = t('classes.config_tip_preset');
    } else {
      tipEl.textContent = t('classes.config_tip_custom');
    }
  }

  if (!state.configMatieres.length) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">
      ${t('classes.config_no_subjects')}</div>`;
    return;
  }

  const optsGroupe = [
    `<option value="">\u2014 ${t('classes.config_preview_no_groups')} \u2014</option>`,
    ...state.configGroupes.map(g =>
      `<option value="${esc(g.nom)}">${esc(g.nom)}</option>`)
  ].join('');

  container.innerHTML = state.configMatieres.map((m, i) => `
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
      state.configMatieres[i].actif = e.target.checked;
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
      state.configMatieres[parseInt(e.target.dataset.i)].coefficient = isNaN(v) ? 1 : Math.max(0.5, v);
    })
  );
  container.querySelectorAll('.mat-ens').forEach(inp =>
    inp.addEventListener('input', e => {
      state.configMatieres[parseInt(e.target.dataset.i)].enseignant = e.target.value;
    })
  );
  container.querySelectorAll('.mat-groupe').forEach(sel =>
    sel.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i);
      state.configMatieres[i].groupe = e.target.value;
      afficherApercuGroupesConfig();
    })
  );
  container.querySelectorAll('.mat-principal').forEach(radio =>
    radio.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i);
      state.configMatieres.forEach((m, idx) => m.principal = (idx === i));
    })
  );
}

export function afficherConfigGroupes() {
  const container = document.getElementById('config-groupes-list');
  if (!container) return;

  if (!state.configGroupes.length) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px;">
      ${t('classes.config_group_empty')}</div>`;
    return;
  }

  container.innerHTML = state.configGroupes.map((g, i) => `
    <div class="groupe-config-row" style="cursor:pointer;
         border-color:${state.configGroupeSelIdx === i ? 'rgba(0,230,118,0.4)' : 'var(--border-color)'};
         background:${state.configGroupeSelIdx === i ? 'rgba(0,230,118,0.06)' : 'var(--bg-secondary)'};"
         data-gi="${i}">
      <span style="font-size:16px;">\ud83d\udcc2</span>
      <div style="flex:1; font-size:13px; font-weight:600; color:var(--text-primary);">${esc(g.nom)}</div>
      <span style="font-size:11px; color:var(--text-muted);">
        ${state.configMatieres.filter(m => m.actif && m.groupe === g.nom).length} ${t('classes.subjects_short')}
      </span>
    </div>
  `).join('');

  container.querySelectorAll('[data-gi]').forEach(el => {
    el.addEventListener('click', () => ouvrirEditeurGroupeConfig(parseInt(el.dataset.gi)));
  });
}

export function ouvrirEditeurGroupeConfig(index) {
  state.configGroupeSelIdx = index;
  const g = state.configGroupes[index];
  const editeur = document.getElementById('config-groupe-editeur');
  editeur.style.display = 'block';
  document.getElementById('config-groupe-nom').value = g.nom;

  const container = document.getElementById('config-groupe-matieres');
  container.innerHTML = state.configMatieres
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
        <span style="font-size:11px; color:var(--text-muted);">\u00d7${m.coefficient}</span>
      </label>
    `).join('');

  afficherConfigGroupes();
}

export function attacherEvenementsConfigGroupes() {
  document.getElementById('btn-add-groupe-config')?.addEventListener('click', () => {
    const nom = `${t('classes.group_default')} ${state.configGroupes.length + 1}`;
    state.configGroupes.push({ nom });
    afficherConfigGroupes();
    ouvrirEditeurGroupeConfig(state.configGroupes.length - 1);
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
  });

  document.getElementById('btn-save-groupe-config')?.addEventListener('click', () => {
    if (state.configGroupeSelIdx === null) return;
    const ancienNom = state.configGroupes[state.configGroupeSelIdx].nom;
    const nouveauNom = document.getElementById('config-groupe-nom')?.value?.trim();
    if (!nouveauNom) { showToast('\u26a0\ufe0f ' + t('classes.config_group_name'), 'error'); return; }

    state.configGroupes[state.configGroupeSelIdx].nom = nouveauNom;
    state.configMatieres.forEach(m => {
      if (m.groupe === ancienNom) m.groupe = nouveauNom;
    });

    const checks = document.querySelectorAll('#config-groupe-matieres input[type=checkbox]');
    checks.forEach(cb => {
      const mat = state.configMatieres.find(m => m.nom === cb.value);
      if (mat) mat.groupe = cb.checked ? nouveauNom : (mat.groupe === nouveauNom ? '' : mat.groupe);
    });

    afficherConfigGroupes();
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
    showToast(t('classes.save_success'), 'success');
  });

  document.getElementById('btn-delete-groupe-config')?.addEventListener('click', () => {
    if (state.configGroupeSelIdx === null) return;
    const nom = state.configGroupes[state.configGroupeSelIdx].nom;
    if (!confirm(t('classes.config_group_delete') + ` "${nom}" ?`)) return;
    state.configMatieres.forEach(m => { if (m.groupe === nom) m.groupe = ''; });
    state.configGroupes.splice(state.configGroupeSelIdx, 1);
    state.configGroupeSelIdx = null;
    document.getElementById('config-groupe-editeur').style.display = 'none';
    afficherConfigGroupes();
    afficherConfigMatieres();
    afficherApercuGroupesConfig();
    showToast(t('classes.delete_success'), 'success');
  });
}

export function afficherApercuGroupesConfig() {
  const container = document.getElementById('config-groupes-apercu');
  if (!container) return;

  const actives = state.configMatieres.filter(m => m.actif);
  if (!state.configGroupes.length) {
    container.innerHTML = `<span style="color:var(--text-muted);">
      ${t('classes.config_preview_no_groups')} \u2014 ${actives.length} ${t('classes.stats_matieres')}.</span>`;
    return;
  }

  const nonAssignees = actives.filter(m => !m.groupe);

  container.innerHTML = [
    ...state.configGroupes.map(g => {
      const mats = actives.filter(m => m.groupe === g.nom);
      return `<span style="margin-right:12px;">
        <strong style="color:var(--text-primary);">\ud83d\udcc2 ${esc(g.nom)}</strong>
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

export async function sauvegarderConfig() {
  if (!state.configClasseId) return;

  const classe = state.toutesLesClasses.find(c => c.id === state.configClasseId);
  if (!classe) return;

  const nouvMatieres = state.configMatieres
    .filter(m => m.actif)
    .map(m => ({
      id:          m.id,
      nom:         m.nom,
      coefficient: m.coefficient,
      enseignant:  m.enseignant,
      groupe:      m.groupe,
      principal:   m.principal || false
    }));

  const result = await window.elimuAPI.updateClass(state.configClasseId, {
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
