import { state, t } from './state.js';
import { getNomsMatieres } from './helpers.js';
import { ouvrirDetail, supprimerClasse } from './detail.js';
import { ouvrirConfigClasse } from './config.js';
import { ouvrirImportListe, ouvrirImportAbsences, ouvrirFormulaire } from './form.js';

export function afficherKPIs(classes) {
  const container = document.getElementById('classes-kpis');
  if (!container) return;

  const totalEleves = classes.reduce((s, c) => s + (c.nb_eleves || 0), 0);
  const moyennes = classes.filter(c => c.moyenne_generale).map(c => c.moyenne_generale);
  const moyGlobale = moyennes.length
    ? (moyennes.reduce((s, m) => s + parseFloat(m), 0) / moyennes.length).toFixed(1)
    : null;

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
    { icon: icons.moyenne, val: moyGlobale ? `${moyGlobale}/20` : '\u2014', label: t('classes.kpi_moyenne_etab'), color: 'rgba(156,77,255,0.12)',  valColor: 'var(--purple-fifa)' },
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

export function afficherClasses(classes) {
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

    const isQualitative = niveauV2 === 'N1' || niveauV2 === 'N2';
    const moyAffiche = isQualitative
      ? `<span style="font-size:11px;">${t('classes.stats_qualitative')}</span>`
      : (moy ? moy.toFixed(1) : '\u2014');
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
                ${esc(c.niveau) || '\u2014'}
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

export function gererClicGrille(e) {
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

export function filtrerClasses() {
  const q      = document.getElementById('search-classes')?.value.toLowerCase().trim() || '';
  const niveau = document.getElementById('filter-niveau')?.value || '';
  const filtrees = state.toutesLesClasses.filter(c =>
    (!q      || c.nom_classe.toLowerCase().includes(q)) &&
    (!niveau || c.niveau === niveau)
  );
  afficherClasses(filtrees);
}
