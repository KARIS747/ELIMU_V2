import { state, t } from './state.js';
import { getNomsMatieres } from './helpers.js';
import { chargerClasses } from './classes.js';

export async function ouvrirDetail(classeId) {
  const modal   = document.getElementById('modal-detail');
  const content = document.getElementById('detail-content');
  const title   = document.getElementById('detail-title');
  if (!modal || !content) return;

  const classe = state.toutesLesClasses.find(c => c.id === classeId);
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

  const estQualitative = classe?.niveau_v2 === 'N1' || classe?.niveau_v2 === 'N2';
  const notationLabel = estQualitative
    ? t('classes.detail_notation_qualitative')
    : t('classes.detail_notation_quantitative');

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
      ${[
        { val: eleves.length, label: t('classes.detail_label_students'), color: 'var(--text-primary)' },
        { val: moyClasse ? moyClasse + '/20' : '\u2014', label: t('classes.detail_label_average'),
          color: moyClasse >= 10 ? 'var(--green-fifa)' : 'var(--red-fifa)' },
        { val: nbEnDifficulte, label: t('classes.detail_label_difficult'),
          color: nbEnDifficulte > 0 ? 'var(--red-fifa)' : 'var(--green-fifa)' }
      ].map(k => `
        <div style="background:var(--bg-secondary);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-family:'Rajdhani',sans-serif;font-size:22px;font-weight:700;color:${k.color};">${k.val}</div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">${k.label}</div>
        </div>`).join('')}
      <div style="background:var(--bg-secondary);border-radius:10px;padding:12px;text-align:center;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:700;color:${estQualitative ? 'var(--green-fifa)' : 'var(--purple-fifa)'};">${notationLabel}</div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">${t('classes.detail_label_notation')}</div>
      </div>
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
          const medaille = i === 0 ? '\ud83e\udd47' : i === 1 ? '\ud83e\udd48' : i === 2 ? '\ud83e\udd49' : '';
          return `
            <div class="eleve-list-item">
              <div style="font-size:16px;width:24px;text-align:center;flex-shrink:0;">
                ${medaille || `<span style="font-size:11px;color:var(--text-muted);">${i + 1}</span>`}
              </div>
              <div class="eleve-avatar-sm">${initiales}</div>
              <div style="flex:1;">
                <div style="font-weight:600;font-size:13.5px;color:var(--text-primary);">
                  ${esc(eleve.nom)} ${esc(eleve.prenom)}
                </div>
              </div>
              <div style="font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;
                          color:${couleur};flex-shrink:0;">
                ${moy ? moy.toFixed(1) : '\u2014'}
              </div>
            </div>`;
        }).join('')}
    </div>`;
}

export function fermerDetail() {
  const modal = document.getElementById('modal-detail');
  if (modal) modal.style.display = 'none';
}

export async function supprimerClasse(id) {
  const classe = state.toutesLesClasses.find(c => c.id === id);
  const nbEleves = classe?.nb_eleves || 0;
  const msg = nbEleves > 0
    ? t('classes.delete_confirm_with_eleves').replace('{name}', classe?.nom_classe).replace('{count}', nbEleves)
    : t('classes.delete_confirm').replace('{name}', classe?.nom_classe);
  if (!confirm(msg)) return;
  const result = await window.elimuAPI.deleteClass(id);
  if (result?.error) { showToast(t('common.error') + ' : ' + result.error, 'error'); }
  else { showToast(t('classes.delete_success'), 'success'); await chargerClasses(); }
}
