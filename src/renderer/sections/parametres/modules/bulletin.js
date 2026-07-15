import { t } from '../../../locales/index.js';

let bulletinConfig = {};
let mentionsData   = [];

export async function init(state) {
  // Le chargement est lazy (au clic sur l'onglet)
}

/**
 * Charge la configuration des bulletins
 */
export async function chargerBulletinConfig() {
  try {
    const result = await window.elimuAPI.getBulletinConfig();
    bulletinConfig = (result && !result.error) ? result : {};
    mentionsData   = parseMentionsConfig(bulletinConfig.mentions_config);
    remplirFormulaireBulletin();
    attacherEvenementsBulletin();
  } catch (err) {
    console.error('Erreur chargerBulletinConfig:', err);
    showToast(t('common.error'), 'error');
  }
}

function parseMentionsConfig(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr : mentionsParDefaut();
  } catch { return mentionsParDefaut(); }
}

function mentionsParDefaut() {
  return [
    { min: 16,    max: 20,    label: t('params.bulletin_mention_very_good'),   couleur: '#00a854' },
    { min: 14,    max: 15.99, label: t('params.bulletin_mention_good'),         couleur: '#52c41a' },
    { min: 12,    max: 13.99, label: t('params.bulletin_mention_fairly_good'),   couleur: '#faad14' },
    { min: 10,    max: 11.99, label: t('params.bulletin_mention_passing'),     couleur: '#fa8c16' },
    { min: 0,     max: 9.99,  label: t('params.bulletin_mention_insufficient'),  couleur: '#f5222d' }
  ];
}

function remplirFormulaireBulletin() {
  const c = bulletinConfig;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const chk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val !== '0'; };

  set('bul-etab-nom',                  c.etab_nom);
  set('bul-etab-devise',               c.etab_devise);
  set('bul-etab-adresse',              c.etab_adresse);
  set('bul-etab-tel',                  c.etab_telephone);
  set('bul-dir-nom',                   c.directeur_nom);
  set('bul-dir-titre',                 c.directeur_titre);
  set('bul-modele',                    c.style_modele || 'officiel');
  set('bul-pied-texte',                c.pied_texte);
  set('bul-notation-type',             c.notation_type || 'numerique');
  set('bul-poids-seq1',                c.calc_poids_seq1 || '40');
  set('bul-poids-seq2',                c.calc_poids_seq2 || '60');

  set('bul-delegation-regionale',      c.delegation_regionale);
  set('bul-delegation-departementale', c.delegation_departementale);
  set('bul-annee-scolaire',            c.annee_scolaire);
  set('bul-pays',                      c.pays);
  set('bul-ministere',                 c.ministere);
  set('bul-devise-nationale',          c.devise_nationale);

  set('bul-republique-en',                c.republique_en);
  set('bul-devise-etat-en',               c.devise_etat_en);
  set('bul-ministere-en',                 c.ministere_en);
  set('bul-delegation-regionale-en',      c.delegation_regionale_en);
  set('bul-delegation-departementale-en', c.delegation_departementale_en);
  set('bul-etab-nom-en',                  c.etab_nom_en);
  set('bul-etab-devise-en',               c.etab_devise_en);

  const cp = c.couleur_primaire   || '#1a3c6e';
  const cs = c.couleur_secondaire || '#c8a415';
  const setCouleur = (pickerId, hexId, val) => {
    const picker = document.getElementById(pickerId);
    const hex    = document.getElementById(hexId);
    if (picker) picker.value = val;
    if (hex)    hex.value    = val;
  };
  setCouleur('bul-couleur-primaire',   'bul-couleur-primaire-hex',   cp);
  setCouleur('bul-couleur-secondaire', 'bul-couleur-secondaire-hex', cs);

  chk('bul-entete-bilingue',       c.entete_bilingue  !== undefined ? c.entete_bilingue  : '1');
  chk('col-coefficient',           c.col_coefficient  !== undefined ? c.col_coefficient  : '1');
  chk('col-seq1',                  c.col_seq1         !== undefined ? c.col_seq1         : '1');
  chk('col-seq2',                  c.col_seq2         !== undefined ? c.col_seq2         : '1');
  chk('col-moyenne',               c.col_moyenne      !== undefined ? c.col_moyenne      : '1');
  chk('col-moy-classe',            c.col_moy_classe   || '0');
  chk('col-appreciation',          c.col_appreciation !== undefined ? c.col_appreciation : '1');
  chk('bul-pied-signature',        c.pied_signature   !== undefined ? c.pied_signature   : '1');
  chk('bul-afficher-absences',     c.afficher_absences !== undefined ? c.afficher_absences : '1');
  chk('bul-rang-general',          c.afficher_rang_general !== undefined ? c.afficher_rang_general : '1');
  chk('bul-appreciation-generale', c.afficher_appreciation_generale !== undefined ? c.afficher_appreciation_generale : '1');
  chk('bul-appreciation-auto',     c.appreciation_auto !== undefined ? c.appreciation_auto : '1');

  if (c.etab_logo && c.etab_logo.startsWith('data:')) {
    const prev = document.getElementById('logo-preview');
    if (prev) prev.innerHTML = `<img src="${c.etab_logo}" style="width:100%;height:100%;object-fit:contain;">`;
    const removeBtn = document.getElementById('btn-remove-logo');
    if (removeBtn) removeBtn.style.display = 'block';
  } else {
    const prev = document.getElementById('logo-preview');
    if (prev) prev.innerHTML = '';
    const removeBtn = document.getElementById('btn-remove-logo');
    if (removeBtn) removeBtn.style.display = 'none';
  }

  afficherMentions();
  mettreAJourApercuCouleurs();
  mettreAJourApercuNotation();
}

/**
 * Rendu optimisé des mentions (DocumentFragment)
 */
function afficherMentions() {
  const container = document.getElementById('mentions-list');
  if (!container) return;
  
  const fragment = document.createDocumentFragment();
  
  mentionsData.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'mention-row';
    row.dataset.index = i;
    
    row.innerHTML = `
      <input type="number" placeholder="Min" value="${m.min}" min="0" max="20" step="0.5"
             class="input mention-min" style="padding:4px 8px; font-size:12px;">
      <input type="number" placeholder="Max" value="${m.max}" min="0" max="20" step="0.5"
             class="input mention-max" style="padding:4px 8px; font-size:12px;">
      <input type="text" placeholder="Label" value="${esc(m.label)}" 
             class="input mention-label" style="padding:4px 8px; font-size:12px; flex:1;">
      <input type="color" value="${m.couleur}" class="mention-couleur" 
             style="width:32px; height:32px; padding:2px; border:1px solid var(--border-color); border-radius:4px; cursor:pointer;">
      <button class="btn btn-sm btn-danger btn-remove-mention" data-i="${i}" title="${t('common.delete')}">×</button>
    `;

    row.querySelector('.mention-min').addEventListener('change', e => { 
      mentionsData[i].min = parseFloat(e.target.value) || 0; 
      mettreAJourApercuNotation(); 
    });
    row.querySelector('.mention-max').addEventListener('change', e => { 
      mentionsData[i].max = parseFloat(e.target.value) || 0; 
      mettreAJourApercuNotation(); 
    });
    row.querySelector('.mention-label').addEventListener('input', e => { 
      mentionsData[i].label = e.target.value; 
      mettreAJourApercuNotation(); 
    });
    row.querySelector('.mention-couleur').addEventListener('input', e => { 
      mentionsData[i].couleur = e.target.value; 
      mettreAJourApercuNotation(); 
    });
    row.querySelector('.btn-remove-mention').addEventListener('click', () => {
      mentionsData.splice(i, 1);
      afficherMentions();
      mettreAJourApercuNotation();
    });

    fragment.appendChild(row);
  });

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

function mettreAJourApercuCouleurs() {
  const cp = document.getElementById('bul-couleur-primaire')?.value || '#1a3c6e';
  const cs = document.getElementById('bul-couleur-secondaire')?.value || '#c8a415';
  const header = document.getElementById('apercu-header');
  const moy    = document.getElementById('apercu-moy');
  if (header) header.style.background = cp;
  if (moy)    moy.style.color = cs;
}

/**
 * Rendu optimisé de l'aperçu de notation
 */
function mettreAJourApercuNotation() {
  const container = document.getElementById('notation-preview');
  if (!container) return;
  const type = document.getElementById('bul-notation-type')?.value || 'numerique';
  
  const fragment = document.createDocumentFragment();

  if (type === 'numerique') {
    mentionsData.forEach(m => {
      const span = document.createElement('span');
      span.className = 'mention-badge';
      span.style.cssText = `background:${m.couleur}22; border:1px solid ${m.couleur}44; color:${m.couleur}; padding:2px 8px; border-radius:4px; font-size:11px; margin-right:4px; margin-bottom:4px; display:inline-block;`;
      span.textContent = `${m.min}-${m.max} → ${m.label}`;
      fragment.appendChild(span);
    });
  } else if (type === 'lettres') {
    const lettres = [{l:'A+',c:'#00a854'},{l:'A',c:'#52c41a'},{l:'B',c:'#faad14'},{l:'C',c:'#fa8c16'},{l:'D',c:'#ff7a45'},{l:'F',c:'#f5222d'}];
    lettres.forEach(x => {
      const span = document.createElement('span');
      span.className = 'mention-badge';
      span.style.cssText = `background:${x.c}22; border:1px solid ${x.c}44; color:${x.c}; padding:2px 8px; border-radius:4px; font-size:11px; margin-right:4px; margin-bottom:4px; display:inline-block;`;
      span.textContent = x.l;
      fragment.appendChild(span);
    });
  } else {
    const ms = [{l:'A+',c:'#00a854'},{l:'A',c:'#52c41a'},{l:'CA',c:'#faad14'},{l:'NA',c:'#f5222d'},{l:'R',c:'#cf1322'}];
    ms.forEach(x => {
      const span = document.createElement('span');
      span.className = 'mention-badge';
      span.style.cssText = `background:${x.c}22; border:1px solid ${x.c}44; color:${x.c}; padding:2px 8px; border-radius:4px; font-size:11px; margin-right:4px; margin-bottom:4px; display:inline-block;`;
      span.textContent = x.l;
      fragment.appendChild(span);
    });
  }

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

function getConfigBulletin() {
  const chk = (id) => document.getElementById(id)?.checked ? '1' : '0';
  const val = (id) => document.getElementById(id)?.value || '';
  const poids1 = parseInt(val('bul-poids-seq1')) || 40;
  const poids2 = parseInt(val('bul-poids-seq2')) || 60;

  return {
    etab_nom:                    val('bul-etab-nom'),
    etab_devise:                 val('bul-etab-devise'),
    etab_adresse:                val('bul-etab-adresse'),
    etab_telephone:              val('bul-etab-tel'),
    directeur_nom:               val('bul-dir-nom'),
    directeur_titre:             val('bul-dir-titre') || 'Le Directeur',
    style_modele:                val('bul-modele'),
    entete_bilingue:             chk('bul-entete-bilingue'),
    couleur_primaire:            val('bul-couleur-primaire'),
    couleur_secondaire:          val('bul-couleur-secondaire'),
    couleur_entete:              val('bul-couleur-primaire'),
    notation_type:               val('bul-notation-type'),
    mentions_config:             JSON.stringify(mentionsData),
    col_coefficient:             chk('col-coefficient'),
    col_seq1:                    chk('col-seq1'),
    col_seq2:                    chk('col-seq2'),
    col_moyenne:                 chk('col-moyenne'),
    col_moy_classe:              chk('col-moy_classe'),
    col_appreciation:            chk('col-appreciation'),
    calc_poids_seq1:             String(poids1),
    calc_poids_seq2:             String(poids2),
    pied_texte:                  val('bul-pied-texte'),
    pied_signature:              chk('bul-pied-signature'),
    afficher_absences:           chk('bul-afficher-absences'),
    afficher_rang_general:       chk('bul-rang-general'),
    afficher_appreciation_generale: chk('bul-appreciation-generale'),
    appreciation_auto:           chk('bul-appreciation-auto'),
    delegation_regionale:              val('bul-delegation-regionale'),
    delegation_departementale:         val('bul-delegation-departementale'),
    annee_scolaire:                    val('bul-annee-scolaire'),
    pays:                              val('bul-pays'),
    ministere:                         val('bul-ministere'),
    devise_nationale:                  val('bul-devise-nationale'),
    republique_en:                     val('bul-republique-en'),
    devise_etat_en:                    val('bul-devise-etat-en'),
    ministere_en:                      val('bul-ministere-en'),
    delegation_regionale_en:           val('bul-delegation-regionale-en'),
    delegation_departementale_en:      val('bul-delegation-departementale-en'),
    etab_nom_en:                       val('bul-etab-nom-en'),
    etab_devise_en:                    val('bul-etab-devise-en'),
  };
}

function attacherEvenementsBulletin() {
  const syncCouleur = (pickerId, hexId) => {
    document.getElementById(pickerId)?.addEventListener('input', e => {
      const hex = document.getElementById(hexId);
      if (hex) hex.value = e.target.value;
      mettreAJourApercuCouleurs();
    });
    document.getElementById(hexId)?.addEventListener('input', e => {
      const picker = document.getElementById(pickerId);
      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value) && picker) picker.value = e.target.value;
      mettreAJourApercuCouleurs();
    });
  };
  syncCouleur('bul-couleur-primaire',   'bul-couleur-primaire-hex');
  syncCouleur('bul-couleur-secondaire', 'bul-couleur-secondaire-hex');

  const checkPoids = () => {
    const p1 = parseInt(document.getElementById('bul-poids-seq1')?.value) || 0;
    const p2 = parseInt(document.getElementById('bul-poids-seq2')?.value) || 0;
    const warn = document.getElementById('poids-warning');
    if (warn) warn.style.display = (p1 + p2 !== 100) ? 'block' : 'none';
    if (p1 >= 0 && p1 <= 100) {
      const seq2El = document.getElementById('bul-poids-seq2');
      if (seq2El && document.activeElement?.id === 'bul-poids-seq1') seq2El.value = 100 - p1;
    }
  };
  document.getElementById('bul-poids-seq1')?.addEventListener('input', checkPoids);
  document.getElementById('bul-poids-seq2')?.addEventListener('input', checkPoids);

  document.getElementById('bul-notation-type')?.addEventListener('change', () => {
    const type = document.getElementById('bul-notation-type')?.value;
    const editor = document.getElementById('mentions-editor');
    if (editor) editor.style.display = type === 'numerique' ? 'block' : 'none';
    mettreAJourApercuNotation();
  });

  document.getElementById('btn-add-mention')?.addEventListener('click', () => {
    mentionsData.push({ min: 0, max: 0, label: t('common.nodata'), couleur: '#888888' });
    afficherMentions();
  });

  document.getElementById('btn-upload-logo')?.addEventListener('click', async () => {
    try {
      const result = await window.elimuAPI.uploadLogo();
      if (result?.success && result.dataUrl) {
        bulletinConfig.etab_logo = result.dataUrl;
        const prev = document.getElementById('logo-preview');
        if (prev) prev.innerHTML = `<img src="${result.dataUrl}" style="width:100%;height:100%;object-fit:contain;">`;
        document.getElementById('btn-remove-logo').style.display = 'block';
        const saveResult = await window.elimuAPI.saveBulletinConfig({ etab_logo: result.dataUrl });
        if (saveResult?.success) {
          showToast(t('params.bulletin_toast_logo_success'), 'success');
        } else {
          showToast(t('params.bulletin_toast_logo_error'), 'warning');
        }
      }
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  document.getElementById('btn-remove-logo')?.addEventListener('click', async () => {
    try {
      bulletinConfig.etab_logo = '';
      const prev = document.getElementById('logo-preview');
      if (prev) prev.innerHTML = '';
      document.getElementById('btn-remove-logo').style.display = 'none';
      const saveResult = await window.elimuAPI.saveBulletinConfig({ etab_logo: '' });
      if (saveResult?.success) {
        showToast(t('params.bulletin_toast_logo_deleted'), 'success');
      } else {
        showToast(t('common.error'), 'error');
      }
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  });

  const sauvegarder = async () => {
    const p1 = parseInt(document.getElementById('bul-poids-seq1')?.value) || 0;
    const p2 = parseInt(document.getElementById('bul-poids-seq2')?.value) || 0;
    if (p1 + p2 !== 100) {
      showToast('⚠️ ' + t('params.bulletin_toast_weight_100'), 'warning');
      return;
    }
    const config = getConfigBulletin();
    try {
      const result = await window.elimuAPI.saveBulletinConfig(config);
      if (result?.success) {
        bulletinConfig = { ...bulletinConfig, ...config };
        if (window.invalidateBulletinConfigCache) window.invalidateBulletinConfigCache();
        showToast(t('params.bulletin_toast_save_success'), 'success');
      } else {
        showToast(result?.error || t('common.error'), 'error');
      }
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  };

  document.getElementById('btn-save-bulletin-bas')?.addEventListener('click', sauvegarder);

  document.getElementById('btn-reset-bulletin')?.addEventListener('click', async () => {
    if (!confirm(t('params.bulletin_reset_confirm'))) return;
    mentionsData = mentionsParDefaut();
    bulletinConfig = {};
    remplirFormulaireBulletin();
    showToast(t('params.bulletin_reset_success'), 'success');
  });

  document.getElementById('btn-preview-bulletin')?.addEventListener('click', () => {
    showToast(t('params.bulletin_preview_info'), 'info');
  });
}
