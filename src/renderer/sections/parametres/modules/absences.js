import { t } from '../../../locales/index.js';

let reglesAbsences = [];
let parametres = {};

function reglesParDefaut() {
  return [
    { de: 0,  a: 5,   sanction: t('params.abs_rule_default_1'),  gravite: 'observation'   },
    { de: 5,  a: 10,  sanction: t('params.abs_rule_default_2'),       gravite: 'avertissement' },
    { de: 10, a: 20,  sanction: t('params.abs_rule_default_3'),    gravite: 'grave'         },
    { de: 20, a: 30,  sanction: t('params.abs_rule_default_4'), gravite: 'critique' },
    { de: 30, a: 999, sanction: t('params.abs_rule_default_5'),    gravite: 'critique' },
  ];
}

export async function init(state) {
  // Chargement lazy au clic sur l'onglet
}

export async function chargerReglesAbsences() {
  try {
    const [pResult, rResult] = await Promise.all([
      window.elimuAPI.getParametres(),
      window.elimuAPI.getReglesAbsences?.()
    ]);
    
    parametres = (pResult && !pResult.error) ? pResult : {};
    
    if (Array.isArray(rResult) && rResult.length > 0 && !rResult.error) {
      reglesAbsences = rResult;
    } else {
      reglesAbsences = reglesParDefaut();
    }
  } catch (err) {
    console.error('Erreur chargerReglesAbsences:', err);
    reglesAbsences = reglesParDefaut();
  }

  const p = parametres;
  const setV = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
  setV('abs-duree-cours',  p.abs_duree_cours  || 1);
  setV('abs-seuil-alerte', p.abs_seuil_alerte || 10);
  const comptEl = document.getElementById('abs-comptage');
  if (comptEl) comptEl.value = p.abs_comptage || 'non_justifiees';

  afficherReglesAbsences();
  attacherEvenementsAbsences();
}

/**
 * Rendu optimisé des règles d'absences (DocumentFragment + 60FPS)
 */
function afficherReglesAbsences() {
  const container = document.getElementById('regles-absences-list');
  if (!container) return;

  reglesAbsences.sort((a, b) => a.de - b.de);

  if (!reglesAbsences.length) {
    container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">
      ${t('params.abs_palier_empty')}</div>`;
    majApercuBareme();
    return;
  }

  const gravites = [
    { value: 'observation',   label: '🟡 ' + t('params.abs_grav_observation'),          couleur: '#ffb74d' },
    { value: 'avertissement', label: '🟠 ' + t('params.abs_grav_warning'),        couleur: '#ff9800' },
    { value: 'grave',         label: '🔴 ' + t('params.abs_grav_serious'),       couleur: '#ff5252' },
    { value: 'critique',      label: '🚨 ' + t('params.abs_grav_critical'), couleur: '#b71c1c' },
  ];

  const fragment = document.createDocumentFragment();

  reglesAbsences.forEach((r, i) => {
    const item = document.createElement('div');
    const g = gravites.find(x => x.value === r.gravite) || gravites[0];
    const optsGraviteHtml = gravites.map(x =>
      `<option value="${x.value}" ${x.value === r.gravite ? 'selected' : ''}>${x.label}</option>`
    ).join('');
    const bg = i % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-card)';

    item.style.cssText = `display:grid; grid-template-columns:100px 100px 1fr 170px 38px;
                          gap:8px; padding:8px 12px; align-items:center;
                          background:${bg}; border-bottom:1px solid var(--border-color);`;
    item.dataset.index = i;

    item.innerHTML = `
      <input type="number" class="input rabs-de" data-i="${i}"
             value="${r.de}" min="0" max="998" step="1"
             style="padding:5px 8px; font-size:12px; text-align:center;">
      <input type="number" class="input rabs-a" data-i="${i}"
             value="${r.a >= 999 ? '' : r.a}" min="1" max="999" step="1"
             placeholder="∞"
             style="padding:5px 8px; font-size:12px; text-align:center;">
      <input type="text" class="input rabs-sanction" data-i="${i}"
             value="${esc(r.sanction)}"
             placeholder="${t('common.waiting')}"
             style="padding:5px 8px; font-size:12px;">
      <select class="input rabs-gravite" data-i="${i}"
              style="padding:5px 8px; font-size:12px;
                     color:${g.couleur}; border-color:${g.couleur}55; background:${g.couleur}11;">
        ${optsGraviteHtml}
      </select>
      <button type="button" class="btn btn-sm btn-danger rabs-delete" data-i="${i}"
              style="padding:5px 8px;" title="${t('common.delete')}">🗑️</button>
    `;

    // Listeners
    item.querySelector('.rabs-de').addEventListener('change', e => {
      reglesAbsences[i].de = parseFloat(e.target.value) || 0;
      majApercuBareme();
    });
    item.querySelector('.rabs-a').addEventListener('change', e => {
      const v = parseFloat(e.target.value);
      reglesAbsences[i].a = isNaN(v) ? 999 : v;
      majApercuBareme();
    });
    item.querySelector('.rabs-sanction').addEventListener('input', e => {
      reglesAbsences[i].sanction = e.target.value;
      majApercuBareme();
    });
    item.querySelector('.rabs-gravite').addEventListener('change', e => {
      const gSel = gravites.find(x => x.value === e.target.value) || gravites[0];
      reglesAbsences[i].gravite = e.target.value;
      e.target.style.color = gSel.couleur;
      e.target.style.borderColor = gSel.couleur + '55';
      e.target.style.background = gSel.couleur + '11';
      majApercuBareme();
    });
    item.querySelector('.rabs-delete').addEventListener('click', () => {
      if (reglesAbsences.length <= 1) {
        showToast('⚠️ ' + t('params.abs_palier_at_least_one'), 'error'); return;
      }
      reglesAbsences.splice(i, 1);
      afficherReglesAbsences();
    });

    fragment.appendChild(item);
  });

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
    majApercuBareme();
  });
}

/**
 * Mise à jour de l'aperçu visuel du barème
 */
function majApercuBareme() {
  const preview  = document.getElementById('abs-bareme-preview');
  if (!preview) return;
  const duree    = parseFloat(document.getElementById('abs-duree-cours')?.value)  || 1;
  const comptage = document.getElementById('abs-comptage')?.value || 'non_justifiees';
  const typeLabel = comptage === 'toutes' ? 'abs.' : 'abs. N.J.';

  if (!reglesAbsences.length) {
    preview.innerHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">
      ${t('params.abs_palier_empty')}</div>`;
    return;
  }

  const gravites = [
    { value: 'observation',   label: 'Observation',          couleur: '#ffb74d' },
    { value: 'avertissement', label: 'Avertissement',        couleur: '#ff9800' },
    { value: 'grave',         label: 'Sanction grave',       couleur: '#ff5252' },
    { value: 'critique',      label: 'Exclusion / Critique', couleur: '#b71c1c' },
  ];

  const sorted = [...reglesAbsences].sort((a, b) => a.de - b.de);
  const fragment = document.createDocumentFragment();

  sorted.forEach(r => {
    const g = gravites.find(x => x.value === r.gravite) || gravites[0];
    const absMin = duree > 0 ? Math.ceil(r.de / duree) : r.de;
    const absMaxV = r.a >= 999 ? null : (duree > 0 ? Math.ceil(r.a / duree) : r.a);
    const labelH = r.a >= 999 ? `≥ ${r.de} h` : `${r.de} – ${r.a} h`;
    const labelAbs = absMaxV === null ? `≥ ${absMin} ${typeLabel}` : `${absMin} – ${absMaxV} ${typeLabel}`;

    const card = document.createElement('div');
    card.style.cssText = `display:flex; align-items:flex-start; gap:10px; padding:8px 10px;
                          border-radius:8px; border:1px solid ${g.couleur}33;
                          background:${g.couleur}0d;`;
    card.innerHTML = `
      <div style="width:9px; height:9px; border-radius:50%; background:${g.couleur};
                  flex-shrink:0; margin-top:4px;"></div>
      <div style="flex:1; min-width:0;">
        <div style="font-size:12px; font-weight:700; color:${g.couleur};">
          ${esc(labelH)}
          <span style="font-weight:400; color:var(--text-muted); font-size:10px; margin-left:5px;">
            ≈ ${esc(labelAbs)}
          </span>
        </div>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:1px;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"
             title="${esc(r.sanction)}">
          ${esc(r.sanction) || '—'}
        </div>
      </div>
    `;
    fragment.appendChild(card);
  });

  requestAnimationFrame(() => {
    preview.innerHTML = '';
    preview.appendChild(fragment);
  });
}

function attacherEvenementsAbsences() {
  document.getElementById('abs-duree-cours')?.addEventListener('input', majApercuBareme);
  document.getElementById('abs-comptage')?.addEventListener('change', majApercuBareme);

  document.getElementById('btn-add-regle-absence')?.addEventListener('click', () => {
    const maxA = reglesAbsences.reduce((m, r) => Math.max(m, r.a >= 999 ? 0 : r.a), 0);
    reglesAbsences.push({
      de:       maxA > 0 ? maxA : reglesAbsences.length * 10,
      a:        999,
      sanction: t('params.abs_palier_new'),
      gravite:  'observation'
    });
    afficherReglesAbsences();
    document.getElementById('regles-absences-list')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  });

  document.getElementById('btn-reset-absences')?.addEventListener('click', () => {
    if (!confirm(t('params.abs_reset_confirm'))) return;
    reglesAbsences = reglesParDefaut();
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV('abs-duree-cours', 1);
    setV('abs-seuil-alerte', 10);
    const cpt = document.getElementById('abs-comptage');
    if (cpt) cpt.value = 'non_justifiees';
    afficherReglesAbsences();
    showToast(t('params.abs_reset_success'), 'success');
  });

  document.getElementById('btn-save-absences')?.addEventListener('click', async () => {
    reglesAbsences.sort((a, b) => a.de - b.de);
    for (let i = 0; i < reglesAbsences.length; i++) {
      const r = reglesAbsences[i];
      if (isNaN(r.de) || r.de < 0) {
        showToast(`⚠️ Palier ${i + 1} : ` + t('params.abs_error_palier_invalid'), 'error'); return;
      }
      if (!r.sanction?.trim()) {
        showToast(`⚠️ Palier ${i + 1} : ` + t('params.abs_error_sanction_empty'), 'error'); return;
      }
      if (i > 0 && r.de !== reglesAbsences[i - 1].a) {
        showToast(`⚠️ Continuité : Le palier ${i + 1} doit commencer à ${reglesAbsences[i-1].a}h.`, 'error');
        return;
      }
    }
    const duree    = parseFloat(document.getElementById('abs-duree-cours')?.value)  || 1;
    const seuil    = parseFloat(document.getElementById('abs-seuil-alerte')?.value) || 10;
    const comptage = document.getElementById('abs-comptage')?.value || 'non_justifiees';

    try {
      const [rParams, rRegles] = await Promise.all([
        window.elimuAPI.saveParametres({
          abs_duree_cours: String(duree), abs_seuil_alerte: String(seuil), abs_comptage: comptage
        }),
        window.elimuAPI.saveReglesAbsences(reglesAbsences)
      ]);

      if (rParams?.success && rRegles?.success) {
        parametres.abs_duree_cours = String(duree);
        parametres.abs_seuil_alerte = String(seuil);
        parametres.abs_comptage = comptage;
        showToast(t('params.abs_save_success'), 'success');
      } else {
        showToast(rParams?.error || rRegles?.error || t('common.error'), 'error');
      }
    } catch (err) {
      showToast('❌ ' + err.message, 'error');
    }
  });
}
