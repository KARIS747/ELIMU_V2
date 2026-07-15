/**
 * notes.js - Saisie manuelle des notes
 *
 * Pour les enseignants : uniquement leurs classes et matières assignées
 * Pour les admins      : toutes les classes et matières
 */

let toutesLesClasses  = [];
let toutesLesMatieres = [];
let elevesEnCours     = [];
let classeSelectId    = null;
let matiereSelectId   = null;
let _state            = null;
let mentionsConfig    = [];

export async function init(state) {
  _state = state;
  const user = state?.user;

  try {
    // Utiliser les données du cache global si disponibles pour éviter les appels redondants
    if (state?.classes?.length && state?.matieres?.length) {
      toutesLesClasses  = [...state.classes];
      toutesLesMatieres = [...state.matieres];
      console.log("Notes.js : Utilisation du cache global");
    } else {
      const [_cls, _mat] = await Promise.all([
        window.elimuAPI.getClasses().catch(e => { console.error("Erreur getClasses:", e); return []; }),
        window.elimuAPI.getMatieres().catch(e => { console.error("Erreur getMatieres:", e); return []; })
      ]);
      toutesLesClasses  = Array.isArray(_cls) ? _cls : [];
      toutesLesMatieres = Array.isArray(_mat) ? _mat : [];
      
      if (_cls?.error) window.showToast?.(`Erreur classes: ${_cls.error}`, 'error');
    }

    const _conf = await window.elimuAPI.getBulletinConfig().catch(e => { console.error("Erreur getBulletinConfig:", e); return null; });
    
    if (_conf && _conf.mentions_config) {
      try { mentionsConfig = JSON.parse(_conf.mentions_config); } catch (e) {
        console.error("Erreur parse mentions_config:", e);
      }
    }
  } catch (error) {
    console.error("Erreur globale init Notes:", error);
  }

  if (!mentionsConfig || !mentionsConfig.length) {
    mentionsConfig = [
      { min: 16, max: 20,   label: 'Très Bien',   couleur: '#00a854' },
      { min: 14, max: 15.99, label: 'Bien',        couleur: '#52c41a' },
      { min: 12, max: 13.99, label: 'Assez Bien',  couleur: '#faad14' },
      { min: 10, max: 11.99, label: 'Passable',    couleur: '#fa8c16' },
      { min: 0,  max: 9.99,  label: 'Insuffisant', couleur: '#f5222d' }
    ];
  }

  // Filtrer selon le rôle
  if (user?.role === 'enseignant') {
    const classesAutorisees  = (user.classes_ids  || []).map(id => String(id));
    const matieresAutorisees = (user.matieres_ids || []).map(id => String(id));
    
    const avant = toutesLesClasses.length;
    toutesLesClasses  = toutesLesClasses.filter(c => classesAutorisees.includes(String(c.id)));
    toutesLesMatieres = toutesLesMatieres.filter(m => matieresAutorisees.includes(String(m.id)));
    
    if (toutesLesClasses.length === 0 && avant > 0) {
      window.showToast?.("Aucune classe ne vous est assignée.", "warning");
    }
  }

  remplirSelectClasses();
  
  const root = document.getElementById('notes-root');
  if (root && !root._eventsAttached) {
    attacherEvenements();
    root._eventsAttached = true;
  }
}

// ============================================================
// REMPLISSAGE DES SELECTS
// ============================================================

function remplirSelectClasses() {
  const sel = document.getElementById('notes-classe');
  if (!sel) return;

  if (!toutesLesClasses.length) {
    sel.innerHTML = `<option value="">${window.t('notes.no_class_assigned') || 'Aucune classe assignée'}</option>`;
    return;
  }

  sel.innerHTML = `<option value="">${window.t('notes.select_class') || '— Choisir une classe —'}</option>` +
    toutesLesClasses.map(c =>
      `<option value="${c.id}">${esc(c.nom_classe)} (${esc(c.niveau || '')})</option>`
    ).join('');
}

function remplirSelectMatieres(classeId) {
  const sel = document.getElementById('notes-matiere');
  if (!sel) return;

  sel.disabled = true;
  sel.innerHTML = `<option value="">Chargement...</option>`;

  // Utiliser == pour éviter les problèmes de type string vs number
  const classe = toutesLesClasses.find(c => c.id == classeId);
  if (!classe) {
    sel.innerHTML = `<option value="">Classe non trouvée</option>`;
    return;
  }

  // Matières de la classe (depuis matieres_json)
  let matieresClasse = [];
  try {
    const parsed = typeof classe.matieres_json === 'string' 
      ? JSON.parse(classe.matieres_json || '[]') 
      : (classe.matieres_json || []);
    
    matieresClasse = parsed.map(item => {
      if (typeof item === 'string') return { nom: item, id: null };
      return { nom: item.nom || item.nom_matiere || '', id: item.id };
    }).filter(m => m.nom);
  } catch (e) {
    console.error("Erreur parsing matieres_json:", e);
  }

  // Pour les enseignants : filtrer aux matières autorisées
  const user = _state?.user; // Utiliser le _state passé à init
  if (user?.role === 'enseignant' && user.matieres_ids?.length) {
    const idsAutorises = (user.matieres_ids || []).map(id => String(id));
    // Ici on filtre soit par ID si présent, soit par correspondance de nom avec toutesLesMatieres
    matieresClasse = matieresClasse.filter(m => {
      const global = toutesLesMatieres.find(gm => gm.nom_matiere === m.nom);
      const mId = m.id || global?.id;
      return idsAutorises.includes(String(mId));
    });
  }

  if (!matieresClasse.length) {
    sel.innerHTML = `<option value="">${window.t('classes.badge_no_subject') || 'Aucune matière'}</option>`;
    return;
  }

  // Résoudre les IDs depuis la table globale si nécessaire
  sel.innerHTML = `<option value="">${window.t('notes.select_matiere') || '— Choisir une matière —'}</option>` +
    matieresClasse.map(m => {
      const global = toutesLesMatieres.find(gm => gm.nom_matiere === m.nom);
      const id = m.id || global?.id;
      return id
        ? `<option value="${id}">${esc(m.nom)}</option>`
        : ''; 
    }).filter(Boolean).join('');

  sel.disabled = false;
}

// ============================================================
// CHARGEMENT DES ÉLÈVES + NOTES EXISTANTES
// ============================================================

async function chargerNotes() {
  const classeId  = parseInt(document.getElementById('notes-classe')?.value);
  const matiereId = parseInt(document.getElementById('notes-matiere')?.value);
  const periode   = document.getElementById('notes-periode')?.value  || 'Trimestre 1';
  const sequence  = parseInt(document.getElementById('notes-sequence')?.value || '1');

  if (!classeId || !matiereId) {
    showToast('⚠️ Choisissez une classe et une matière', 'warning');
    return;
  }

  classeSelectId  = classeId;
  matiereSelectId = matiereId;

  const zone = document.getElementById('notes-zone');
  zone.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

  // Charger élèves + notes existantes en parallèle
  const [_eleves, _notes] = await Promise.all([
    window.elimuAPI.getEleves(classeId),
    window.elimuAPI.getNotesByClasse(classeId, matiereId)
  ]);

  elevesEnCours = Array.isArray(_eleves) ? _eleves : [];
  const notesExistantes = Array.isArray(_notes) ? _notes : [];

  if (!elevesEnCours.length) {
    zone.innerHTML = `
      <div class="card" style="text-align:center; padding:40px; display:flex; flex-direction:column; align-items:center;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px; opacity:0.2; color:var(--text-muted);">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
          <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
        </svg>
        <div style="color:var(--text-secondary);">Aucun élève dans cette classe</div>
      </div>`;
    return;
  }

  const classe = toutesLesClasses.find(c => c.id == classeId);
  const matiere = toutesLesMatieres.find(m => m.id == matiereId);

  // Map notes by student ID for the selected period & sequence
  const notesMap = new Map();
  notesExistantes.forEach(n => {
    if (n.periode === periode && n.sequence === sequence) {
      notesMap.set(n.eleve_id, n.note);
    }
  });

  const nbTotal = elevesEnCours.length;
  const nbNotes = elevesEnCours.filter(e => notesMap.has(e.id)).length;
  const pctComplete = nbTotal > 0 ? Math.round((nbNotes / nbTotal) * 100) : 0;

  // Check if we should lock down the UI (Station de Pilotage mode)
  const isReadOnly = (classe?.systeme_educatif !== 'francophone' || classe?.niveau_v2 !== null); 
  // Niveaux V2 (N1, N2, N3) sont gérés par la PWA, le Desktop est read-only.
  // Note: For now, I am restricting it based on niveau_v2 which is our new V2 indicator.

  zone.innerHTML = `
    <div class="card" style="padding:0; overflow:hidden; display:flex; flex-direction:column; max-height:700px;">

      <!-- En-tête Collant -->
      <div style="padding:16px 20px; background:var(--bg-card); border-bottom:1px solid var(--border-color); 
                  position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-family:'Rajdhani',sans-serif; font-size:18px; font-weight:700; color:var(--text-primary);">
            ${esc(classe?.nom_classe || '')} — ${esc(matiere?.nom_matiere || '')}
            ${isReadOnly ? '<span style="margin-left:8px; font-size:12px; background:rgba(255,183,77,0.1); color:var(--yellow-fifa); padding:2px 8px; border-radius:10px;">Mode Pilotage (Lecture seule)</span>' : ''}
          </div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
            ${esc(periode)} · Séquence ${sequence} ·
            <span id="notes-stats-header" style="color:${nbNotes === nbTotal ? 'var(--green-fifa)' : 'var(--yellow-fifa)'};">
              ${nbNotes}/${nbTotal} notes saisies (${pctComplete}%)
            </span>
          </div>
        </div>
        ${!isReadOnly ? `
        <div style="display:flex; gap:10px; align-items:center;">
          <div id="notes-moyenne-live" style="font-size:13px; font-weight:600; color:var(--blue-fifa); margin-right:10px; padding:4px 10px; background:rgba(45,110,224,0.1); border-radius:6px;">
            Moyenne : —
          </div>
          <button class="btn btn-secondary" id="btn-tout-vider" type="button" style="padding:6px 12px; font-size:12px;">Tout vider</button>
          <button class="btn btn-primary"   id="btn-enregistrer" type="button">💾 Enregistrer les notes</button>
        </div>
        ` : ''}
        
        <!-- Barre de progression intégrée -->
        <div style="position:absolute; bottom:-1px; left:0; right:0; height:2px; background:var(--bg-secondary);">
          <div id="notes-progress-bar" style="height:100%; width:${pctComplete}%; background:${pctComplete === 100 ? 'var(--green-fifa)' : 'var(--blue-fifa)'}; transition:width 0.3s, background 0.3s;"></div>
        </div>
      </div>

      <!-- Tableau (Scrollable) -->
      <div style="overflow-y:auto; flex:1;">
        <table class="notes-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Nom et Prénom</th>
              <th style="width:110px; text-align:center;">Note /20</th>
              <th style="width:120px; text-align:center;">Appréciation</th>
              ${!isReadOnly ? '<th style="width:80px; text-align:center;">Action</th>' : ''}
            </tr>
          </thead>
          <tbody id="notes-tbody">
            ${elevesEnCours.map((eleve, i) => {
              const noteExistante = notesMap.get(eleve.id);
              const noteVal = noteExistante !== undefined ? noteExistante : '';
              const cls = noteVal === '' ? '' : (noteVal > 20 || noteVal < 0) ? 'note-rouge' : noteVal >= 14 ? 'note-verte' : noteVal >= 10 ? 'note-jaune' : 'note-rouge';
              const appreciation = (noteVal === '' || noteVal > 20 || noteVal < 0) ? '—' : getAppreciation(noteVal);
              return `
                <tr data-eleve-id="${eleve.id}">
                  <td style="color:var(--text-muted); font-size:12px;">${i + 1}</td>
                  <td>
                    <div style="font-weight:600; color:var(--text-primary);">
                      ${esc(eleve.nom.toUpperCase())} ${esc(eleve.prenom)}
                    </div>
                  </td>
                  <td style="text-align:center;">
                    <input type="number" class="note-input ${cls}"
                           data-eleve-id="${eleve.id}"
                           value="${noteVal}"
                           ${isReadOnly ? 'disabled' : 'min="0" max="20" step="0.25"'}
                           placeholder="—">
                  </td>
                  <td style="text-align:center;" class="td-appreciation-${eleve.id}">
                    ${(noteVal !== '' && noteVal <= 20 && noteVal >= 0) ? `<span class="note-badge" style="background:${getBadgeBg(noteVal)}; color:${getBadgeColor(noteVal)};">${esc(appreciation)}</span>` : (noteVal > 20 || noteVal < 0) ? '<span style="color:var(--red-fifa); font-size:11px; font-weight:600;">Hors limites</span>' : '<span style="color:var(--text-muted);">—</span>'}
                  </td>
                  ${!isReadOnly ? `
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-danger btn-effacer-note"
                            data-eleve-id="${eleve.id}"
                            style="padding:3px 8px; font-size:11px;"
                            title="Effacer cette note">✕</button>
                  </td>` : ''}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

    </div>`;

  attacherEvenementsTableau(periode, sequence);
  majStats();
}

// ============================================================
// ÉVÉNEMENTS DU TABLEAU
// ============================================================

function attacherEvenementsTableau(periode, sequence) {
  const tbody = document.getElementById('notes-tbody');
  if (!tbody) return;

  // Mise à jour live des appréciations et couleurs
  tbody.querySelectorAll('.note-input').forEach(inp => {
    inp.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      const eleveId = e.target.dataset.eleveId;
      const tdAppr  = document.querySelector(`.td-appreciation-${esc(eleveId)}`);
      
      e.target.className = 'note-input';
      if (!isNaN(val)) {
        if (val < 0 || val > 20) {
          e.target.classList.add('note-rouge');
          if (tdAppr) tdAppr.innerHTML = '<span style="color:var(--red-fifa); font-size:11px; font-weight:600;">Hors limites</span>';
        } else {
          if (val >= 14) e.target.classList.add('note-verte');
          else if (val >= 10) e.target.classList.add('note-jaune');
          else e.target.classList.add('note-rouge');

          // Mettre à jour appréciation via config dynamique
          if (tdAppr) {
            const app = getAppreciation(val);
            tdAppr.innerHTML = `<span class="note-badge" style="background:${esc(getBadgeBg(val))}; color:${esc(getBadgeColor(val))};">${esc(app)}</span>`;
          }
        }
      } else {
        if (tdAppr) tdAppr.innerHTML = '<span style="color:var(--text-muted);">—</span>';
      }
      majStats();
    });

    // Navigation clavier entre les inputs
    inp.addEventListener('keydown', e => {
      const all = Array.from(tbody.querySelectorAll('.note-input'));
      const idx = all.indexOf(e.target);
      if (idx === -1) return;

      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < all.length - 1) all[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) all[idx - 1].focus();
      }
    });
  });

  // Effacer une note individuelle
  tbody.querySelectorAll('.btn-effacer-note').forEach(btn => {
    btn.addEventListener('click', e => {
      const eleveId = btn.dataset.eleveId;
      const inp = tbody.querySelector(`.note-input[data-eleve-id="${eleveId}"]`);
      if (inp) {
        inp.value = '';
        inp.className = 'note-input';
        const tdAppr = document.querySelector(`.td-appreciation-${eleveId}`);
        if (tdAppr) tdAppr.innerHTML = '<span style="color:var(--text-muted);">—</span>';
        majStats();
      }
    });
  });

  // Tout vider
  document.getElementById('btn-tout-vider')?.addEventListener('click', () => {
    if (!confirm('Vider toutes les notes affichées ?\nLes notes déjà enregistrées en base ne seront pas supprimées.')) return;
    tbody.querySelectorAll('.note-input').forEach(inp => {
      inp.value = '';
      inp.className = 'note-input';
    });
    tbody.querySelectorAll('[class^="td-appreciation-"]').forEach(td => {
      td.innerHTML = '<span style="color:var(--text-muted);">—</span>';
    });
    majStats();
  });

  // Enregistrer (boutons haut et bas)
  const handleSave = () => enregistrerNotes(periode, sequence);
  document.getElementById('btn-enregistrer')?.addEventListener('click', handleSave);
  document.getElementById('btn-enregistrer-bas')?.addEventListener('click', handleSave);
}

function majStats() {
  const inputs = document.querySelectorAll('#notes-tbody .note-input');
  let nbSaisis = 0, somme = 0;
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    if (!isNaN(v) && v >= 0 && v <= 20) { nbSaisis++; somme += v; }
  });
  
  const nbTotal = elevesEnCours.length;
  const pct     = Math.round((nbSaisis / nbTotal) * 100);
  const moy     = nbSaisis > 0 ? (somme / nbSaisis).toFixed(2) : '—';
  
  // Mise à jour de la moyenne live
  const moyEl = document.getElementById('notes-moyenne-live');
  if (moyEl) moyEl.textContent = `Moyenne : ${moy}`;

  // Mise à jour du texte de stats dans l'en-tête
  const statsEl = document.getElementById('notes-stats-header');
  if (statsEl) {
    statsEl.textContent = `${nbSaisis}/${nbTotal} notes saisies (${pct}%)`;
    statsEl.style.color = (nbSaisis === nbTotal) ? 'var(--green-fifa)' : 'var(--yellow-fifa)';
  }

  // Mise à jour de la barre de progression
  const bar = document.getElementById('notes-progress-bar');
  if (bar) {
    bar.style.width = `${pct}%`;
    bar.style.background = (pct === 100) ? 'var(--green-fifa)' : 'var(--blue-fifa)';
  }
}

// ============================================================
// ENREGISTREMENT EN BASE
// ============================================================

async function enregistrerNotes(periode, sequence) {
  const inputs = document.querySelectorAll('#notes-tbody .note-input');
  const notes  = [];
  const erreurs = [];

  inputs.forEach(inp => {
    const eleveId = parseInt(inp.dataset.eleveId);
    const valStr  = inp.value.trim();
    if (valStr === '') return; 

    const note = parseFloat(valStr);
    if (isNaN(note) || note < 0 || note > 20) {
      const eleve = elevesEnCours.find(e => e.id === eleveId);
      erreurs.push(`${eleve?.nom || '?'} : note invalide (${valStr})`);
      return;
    }
    notes.push({ eleve_id: eleveId, note });
  });

  if (erreurs.length) {
    showToast(`⚠️ ${erreurs.length} note(s) invalide(s)`, 'error');
    return;
  }

  if (!notes.length) {
    showToast('⚠️ Aucune note à enregistrer', 'warning');
    return;
  }

  const btn = document.getElementById('btn-enregistrer');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  const result = await window.elimuAPI.saveNotes({
    notes,
    matiere_id:     matiereSelectId,
    classe_id:      classeSelectId,
    periode,
    sequence,
    utilisateur_id: _state?.user?.id
  });

  if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer les notes'; }

  if (result?.success) {
    showToast(`${result.nbSauvegardes} note(s) enregistrée(s)`, 'success');
    await chargerNotes();
  } else {
    showToast(result?.error || 'Erreur', 'error');
  }
}

// ============================================================
// UTILITAIRES APPRÉCIATIONS
// ============================================================

function getAppreciation(note) {
  if (isNaN(note) || note < 0 || note > 20) return '—';
  const m = mentionsConfig.find(item => note >= item.min && note <= item.max);
  return m ? m.label : '—';
}

function getBadgeColor(note) {
  if (isNaN(note) || note < 0 || note > 20) return 'var(--text-muted)';
  const m = mentionsConfig.find(item => note >= item.min && note <= item.max);
  return m ? m.couleur : '#f5222d';
}

function getBadgeBg(note) {
  const color = getBadgeColor(note);
  return color.startsWith('#') ? color + '22' : 'rgba(0,0,0,0.1)';
}

// ============================================================
// ÉVÉNEMENTS PRINCIPAUX
// ============================================================

function attacherEvenements() {
  const selClasse   = document.getElementById('notes-classe');
  const selMatiere  = document.getElementById('notes-matiere');
  const btnCharger  = document.getElementById('btn-notes-charger');

  const verifierEtatBouton = () => {
    if (btnCharger) {
      const classId = selClasse?.value;
      const matiereId = selMatiere?.value;
      btnCharger.disabled = !classId || !matiereId;
    }
  };

  selClasse?.addEventListener('change', () => {
    const id = parseInt(selClasse.value);
    if (id) {
      remplirSelectMatieres(id);
    } else {
      if (selMatiere) {
        selMatiere.disabled = true;
        selMatiere.innerHTML = `<option value="">${window.t('notes.select_matiere') || '— Choisir d\'abord une classe —'}</option>`;
      }
    }
    verifierEtatBouton();
  });

  selMatiere?.addEventListener('change', verifierEtatBouton);

  btnCharger?.addEventListener('click', chargerNotes);
}
