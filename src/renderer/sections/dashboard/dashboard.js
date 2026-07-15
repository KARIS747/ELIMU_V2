/**
 * dashboard.js - Module du tableau de bord Elimu
 * Graphiques style FIFA :
 * - Jauge demi-cercle (performance globale)
 * - Radar (forces par matière)
 * - Top 5 élèves avec médailles
 * - Liste des élèves en difficulté
 */

// Instances Chart.js (pour nettoyage lors des rechargements)
let gaugeChart = null;
let radarChart = null;
let evolutionChart = null;
let currentClasses = [];
let currentNiveauV2 = null;

/**
 * Initialisation de la section Dashboard
 * Appelé par le renderer lors de la navigation
 */
export async function init(state) {
  await loadChartJS();
  currentClasses = state.classes || [];
  populateClassSelect(currentClasses);
  await loadDashboard(null, 'Tous', 0);

  document.getElementById('dash-classe-select')?.addEventListener('change', reloadDashboard);
  document.getElementById('dash-refresh')?.addEventListener('click', reloadDashboard);
  document.getElementById('dash-periode')?.addEventListener('change', reloadDashboard);
  document.getElementById('dash-sequence')?.addEventListener('change', reloadDashboard);
}

async function reloadDashboard() {
  const select = document.getElementById('dash-classe-select');
  const classeId = select?.value ? parseInt(select.value) : null;
  const periode = document.getElementById('dash-periode')?.value || 'Tous';

  // Détecter le niveau_v2 de la classe sélectionnée
  if (classeId) {
    const classe = currentClasses.find(c => c.id === classeId);
    currentNiveauV2 = classe?.niveau_v2 || null;
  } else {
    currentNiveauV2 = null; // Vue globale = mode quantitatif par défaut
  }

  // Gérer le sélecteur de séquence selon le niveau
  const seqSelect = document.getElementById('dash-sequence');
  if (seqSelect) {
    if (currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2') {
      seqSelect.value = "0"; // Réinitialiser à "Toutes"
      seqSelect.disabled = true;
      seqSelect.style.opacity = "0.5";
      seqSelect.style.cursor = "not-allowed";
      seqSelect.setAttribute('title', "Les évaluations N1/N2 se font par Unité d'Apprentissage (UA), les séquences ne s'appliquent pas.");
    } else {
      seqSelect.disabled = false;
      seqSelect.style.opacity = "1";
      seqSelect.style.cursor = "default";
      seqSelect.removeAttribute('title');
    }
  }

  const sequence = parseInt(seqSelect?.value) || 0;
  await loadDashboard(classeId, periode, sequence);
}

function destroyAllCharts() {
  if (gaugeChart) {
    try { gaugeChart.destroy(); } catch(e) {}
    gaugeChart = null;
  }
  if (radarChart) {
    try { radarChart.destroy(); } catch(e) {}
    radarChart = null;
  }
  if (evolutionChart) {
    try { evolutionChart.destroy(); } catch(e) {}
    evolutionChart = null;
  }
}

async function loadDashboard(classeId, periode, sequence) {
  try {
    destroyAllCharts();

    const [stats, evolution] = await Promise.all([
      window.elimuAPI.getDashboardStats(classeId, periode, sequence),
      window.elimuAPI.getEvolutionStats(classeId)
    ]);

    if (stats.error) {
      showToast('Erreur de chargement des statistiques', 'error');
      return;
    }

    updateKPIs(stats);
    renderGauge(stats.moyenne || 0);
    renderRadar(stats.parMatiere || []);
    renderTop5(stats.top5 || []);
    renderAlertes(stats.alertes || []);
    renderAbsences(stats.absences || { top: [], assidus: [] });
    renderEvolution(Array.isArray(evolution) ? evolution : []);

    const classeSelect = document.getElementById('dash-classe-select');
    const label = classeId
      ? classeSelect?.options[classeSelect.selectedIndex]?.text || 'Classe'
      : (window.t('dashboard.establishment') || 'Établissement');
    const niveauLabel = document.getElementById('dash-niveau-label');
    if (niveauLabel) niveauLabel.textContent = label;

  } catch (error) {
    console.error('Erreur loadDashboard:', error);
    showToast('Erreur lors du chargement du dashboard', 'error');
  }
}

function updateKPIs(stats) {
  const estQualitatif = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  const setColor = (id, color) => {
    const el = document.getElementById(id);
    if (el) el.style.color = color;
  };
  setEl('kpi-eleves', stats.nbEleves || 0);
  setEl('kpi-garcons', stats.statsSexe?.garcons || 0);
  setEl('kpi-filles', stats.statsSexe?.filles || 0);

  // Moyenne : code qualitatif (N1/N2) ou note /20 (N3)
  if (stats.moyenne) {
    if (estQualitatif) {
      const code = getQualitativeCode(stats.moyenne);
      setEl('kpi-moyenne', code);
      setColor('kpi-moyenne', couleurQual(code));
    } else {
      setEl('kpi-moyenne', `${stats.moyenne}/20`);
      setColor('kpi-moyenne', stats.moyenne >= 14 ? 'var(--green-fifa)' : stats.moyenne >= 10 ? 'var(--yellow-fifa)' : 'var(--red-fifa)');
    }
  } else {
    setEl('kpi-moyenne', 'N/A');
    setColor('kpi-moyenne', 'var(--text-muted)');
  }

  // Meilleur élève avec score
  if (stats.top5?.[0]) {
    const top = stats.top5[0];
    const score = formatScore(top.moyenne, estQualitatif);
    setEl('kpi-top', `${top.prenom} ${top.nom}`.substring(0, 10) + ` (${score})`);
  } else {
    setEl('kpi-top', 'N/A');
  }

  setEl('kpi-alertes', stats.alertes?.length || 0);
}

function renderGauge(moyenne) {
  const canvas = document.getElementById('gauge-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const estQualitatif = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';

  if (gaugeChart) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gaugeChart = null;
  }
  const pct = (moyenne / 20) * 100;

  // Couleurs adaptées au mode d'évaluation
  let color;
  if (estQualitatif) {
    const code = getQualitativeCode(moyenne);
    color = (code === 'A+' || code === 'A') ? '#00ff91' : code === 'ECA' ? '#ffdc00' : '#ff2e63';
  } else {
    color = moyenne >= 14 ? '#00ff91' : moyenne >= 10 ? '#ffdc00' : '#ff2e63';
  }
  drawGaugeManual(ctx, canvas.width, canvas.height, pct, color);

  // Valeur centrale : code qualitatif ou nombre
  const gaugeValue = document.getElementById('gauge-value');
  if (gaugeValue) {
    gaugeValue.style.color = color;
    if (estQualitatif) {
      gaugeValue.textContent = getQualitativeCode(moyenne) || '—';
      gaugeValue.style.fontSize = '36px';
    } else {
      gaugeValue.style.fontSize = '48px';
      animateNumber(gaugeValue, 0, moyenne || 0, 800, 1);
    }
  }

  // Label d'échelle dynamique
  const scaleLabel = document.getElementById('gauge-scale-label');
  if (scaleLabel) {
    scaleLabel.textContent = estQualitatif ? 'Niveau' : '/20';
  }

  // Mention sous la jauge
  const gaugeMention = document.getElementById('gauge-mention');
  if (gaugeMention) {
    if (estQualitatif) {
      const code = getQualitativeCode(moyenne);
      const mentions = { 'A+': 'Expert', 'A': 'Acquis', 'ECA': 'En Cours d\'Acquisition', 'NA': 'Non Acquis' };
      gaugeMention.textContent = mentions[code] || '';
      gaugeMention.style.color = color;
    } else {
      const mention = moyenne >= 16 ? 'Très Bien' : moyenne >= 14 ? 'Bien' : moyenne >= 12 ? 'Assez Bien' : moyenne >= 10 ? 'Passable' : moyenne > 0 ? 'Insuffisant' : '';
      gaugeMention.textContent = mention;
    }
  }
}

function drawGaugeManual(ctx, w, h, pct, color) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.75;
  const radius = Math.min(w, h) * 0.42;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;

  // Rail de fond
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = '#2d3650';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Zones colorées d'arrière-plan (plus discrètes mais vibrantes)
  const zones = [
    { end: 0.5, color: 'rgba(255, 46, 99, 0.15)' },
    { end: 0.7, color: 'rgba(255, 220, 0, 0.15)' },
    { end: 1.0, color: 'rgba(0, 255, 145, 0.15)' }
  ];
  zones.forEach(zone => {
    ctx.beginPath();
    const prevEnd = zones.indexOf(zone) === 0 ? startAngle : startAngle + (zones[zones.indexOf(zone) - 1].end * Math.PI);
    ctx.arc(cx, cy, radius, prevEnd, startAngle + (zone.end * Math.PI));
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 16;
    ctx.stroke();
  });

  const targetAngle = startAngle + (pct / 100) * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, targetAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;

  for (let i = 0; i <= 10; i++) {
    const angle = startAngle + (i / 10) * Math.PI;
    const inner = radius - 25;
    const outer = radius - 10;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.strokeStyle = '#3d4a6a';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.stroke();
  }

  ctx.fillStyle = '#6b7a99';
  ctx.font = '11px Inter';
  ctx.textAlign = 'center';
  ctx.fillText('0', cx - radius - 10, cy + 15);
  ctx.fillText('20', cx + radius + 10, cy + 15);
}

function renderRadar(parMatiere) {
  const canvas = document.getElementById('radar-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (radarChart) {
    try { radarChart.destroy(); } catch(e) {}
    radarChart = null;
  }

  if (!parMatiere || parMatiere.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';

  // Trier par moyenne décroissante
  const sorted = [...parMatiere].sort((a, b) => (b.moyenne || 0) - (a.moyenne || 0));
  
  const labels = sorted.map(m => {
    let nom = m.nom_matiere || 'Matière';
    if (nom.length > 25) nom = nom.substring(0, 22) + '…';
    return nom;
  });
  const data = sorted.map(m => m.moyenne || 0);

  // Couleurs plus vives et modernes
  const colors = data.map(moy => {
    if (moy >= 14) return 'rgba(0, 255, 145, 0.85)';  // Vert néon vif
    if (moy >= 10) return 'rgba(255, 220, 0, 0.85)';   // Jaune vif
    return 'rgba(255, 46, 99, 0.85)';                // Rose/Rouge néon
  });
  const borderColors = data.map(moy => {
    if (moy >= 14) return '#00ff91';
    if (moy >= 10) return '#ffdc00';
    return '#ff2e63';
  });

  // Ajuster la hauteur du canvas dynamiquement selon le nombre de matières
  const container = document.getElementById('forces-container');
  if (container) {
    const rowHeight = 60; // Augmenté de 45 à 60 pour plus d'espace vertical
    const visibleRows = 4.5; // Un peu plus de 4 pour suggérer le scroll
    const totalHeight = Math.max(250, data.length * rowHeight);
    
    // Reset styles de centrage pour le scroll
    container.style.display = 'block';
    container.style.overflowY = 'auto';
    container.style.overflowX = 'hidden';
    container.style.height = `${(4 * rowHeight) + 40}px`; // Hauteur fixe pour le container
    container.style.padding = '0 10px';
    
    // Le canvas doit avoir une hauteur explicite pour Chart.js avec maintainAspectRatio: false
    canvas.style.height = `${totalHeight}px`;
    canvas.style.width = '100%';

    // Note explicative si beaucoup de matières
    let noteEl = container.querySelector('.chart-note');
    if (data.length > 4) {
      if (!noteEl) {
        noteEl = document.createElement('div');
        noteEl.className = 'chart-note';
        noteEl.style = 'position:sticky; bottom:0; left:0; width:100%; text-align:center; padding:8px; font-size:11px; color:var(--green-fifa); background:linear-gradient(transparent, var(--bg-card) 40%); pointer-events:none; font-weight:700; text-transform:uppercase; letter-spacing:1px; z-index:10;';
        container.appendChild(noteEl);
      }
      noteEl.textContent = t('dashboard.scroll_note') || '↕ Faire défiler pour voir toutes les matières';
    } else if (noteEl) {
      noteEl.remove();
    }
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  // Utilisation de couleurs Hex explicites car Chart.js ne résout pas toujours les variables CSS sur le canvas
  const tickColor = isLight ? '#0f1923' : '#f0f4fa'; 
  const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';
  const mutedColor = isLight ? '#526070' : '#8b949e';

  radarChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: t('dashboard.radar_x_label') || 'Moyenne /20',
        data: data,
        backgroundColor: colors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 5,
        barPercentage: 0.7, 
        categoryPercentage: 0.8,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 10, bottom: 30, left: 5, right: 15 }
      },
      plugins: {
        tooltip: {
          backgroundColor: '#2a3147',
          titleColor: '#f0f4fa',
          bodyColor: '#a0b3d9',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => {
              const estQ = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';
              return estQ ? ` ${getQualitativeCode(ctx.raw)} (${ctx.raw.toFixed(1)})` : ` ${ctx.raw.toFixed(1)} / 20`;
            }
          }
        },
        legend: { display: false }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: (currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2') ? (t('dashboard.radar_x_label_qual') || 'Niveau de compétence') : (t('dashboard.radar_x_label') || 'Moyenne /20'),
            color: mutedColor,
            font: { size: 10, weight: '600' }
          },
          min: 0,
          max: 20,
          ticks: { color: mutedColor, font: { size: 10 } },
          grid: { color: gridColor }
        },
        y: {
          ticks: {
            font: { size: 11, weight: '600' },
            color: tickColor, 
            autoSkip: false,
            padding: 8
          },
          grid: { display: false }
        }
      },
      animation: {
        duration: 800,
        easing: 'easeOutQuart'
      }
    }
  });
}

function renderTop5(top5) {
  const container = document.getElementById('top5-container');
  if (!container) return;
  if (!top5.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><h3>Aucune donnée</h3><p>Importez des notes pour voir le classement</p></div>`;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  const estQualitatif = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';
  const medals = ['1', '2', '3', '4', '5'];

  top5.forEach((eleve, i) => {
    const color = getNoteColor(eleve.moyenne, estQualitatif);
    const stars = getStars(eleve.moyenne, estQualitatif);
    const scoreDisplay = formatScore(eleve.moyenne, estQualitatif);
    
    const div = document.createElement('div');
    div.className = 'top5-item';
    div.style = 'display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; cursor: pointer; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); transition: var(--transition);';
    div.onclick = () => window.navigateTo('eleves');
    
    div.innerHTML = `
      <div style="font-size: 16px; font-weight: 700; width: 30px; height: 30px; border-radius: 50%; background: var(--bg-card); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); color: var(--text-secondary);">${medals[i]}</div>
      <div style="flex:1;">
        <div style="font-weight:600; color:var(--text-primary); font-size:13.5px;">${esc(eleve.prenom)} ${esc(eleve.nom)}</div>
        <div class="stars" style="margin-top:2px;">${stars}</div>
      </div>
      <div class="score-circle ${esc(color)}">${esc(scoreDisplay)}</div>
    `;
    
    div.onmouseover = () => { div.style.background = 'rgba(255,255,255,0.05)'; div.style.transform = 'translateX(4px)'; };
    div.onmouseout = () => { div.style.background = 'rgba(255,255,255,0.02)'; div.style.transform = 'translateX(0)'; };
    
    fragment.appendChild(div);
  });

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

function renderAlertes(alertes) {
  const container = document.getElementById('alertes-container');
  const countEl = document.getElementById('alertes-count');
  if (!container) return;
  if (countEl) countEl.textContent = alertes.length;
  if (!alertes.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon" style="color:var(--green-fifa);"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div><h3 style="color:var(--green-fifa);">Excellent !</h3><p>Aucun élève en difficulté détecté</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  alertes.forEach(eleve => {
    const div = document.createElement('div');
    div.style = 'display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; background: rgba(255,82,82,0.06); border: 1px solid rgba(255,82,82,0.2);';
    div.innerHTML = `
      <span style="color:var(--red-fifa); display: flex; align-items: center; justify-content: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      </span>
      <div style="flex:1;">
        <div style="font-weight:600; color:var(--text-primary); font-size:13.5px;">${esc(eleve.prenom)} ${esc(eleve.nom)}</div>
        <div style="font-size:11px; color:var(--text-muted);">Nécessite un suivi</div>
      </div>
      <div class="score-circle red">${esc(formatScore(eleve.moyenne, currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2'))}</div>
    `;
    fragment.appendChild(div);
  });

  requestAnimationFrame(() => {
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

function renderAbsences(data) {
  const topContainer = document.getElementById('abs-top-container');
  const assidusContainer = document.getElementById('abs-assidus-container');

  if (topContainer) {
    if (!data.top?.length) {
      topContainer.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><h3>RAS</h3><p>Aucune absence enregistrée</p></div>`;
    } else {
      const fragment = document.createDocumentFragment();
      data.top.forEach(eleve => {
        const h = eleve.total_heures || 0;
        const color = h > 20 ? 'red' : h > 10 ? 'yellow' : 'blue';
        const div = document.createElement('div');
        div.className = 'top5-item';
        div.style = 'display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; background: rgba(255,82,82,0.03); border: 1px solid var(--border-color);';
        div.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:600; color:var(--text-primary); font-size:13px;">${esc(eleve.prenom)} ${esc(eleve.nom)}</div>
            <div style="font-size:10px; color:var(--text-muted);">${window.t('eleves.profil_absences_total_hours')}</div>
          </div>
          <div class="score-circle ${esc(color)}">${esc(h)}h</div>
        `;
        fragment.appendChild(div);
      });
      requestAnimationFrame(() => {
        topContainer.innerHTML = '';
        topContainer.appendChild(fragment);
      });
    }
  }

  if (assidusContainer) {
    if (!data.assidus?.length) {
      assidusContainer.innerHTML = `<div class="empty-state"><div class="empty-icon"></div><h3>—</h3></div>`;
    } else {
      const fragment = document.createDocumentFragment();
      data.assidus.forEach(eleve => {
        const h = eleve.total_heures || 0;
        const color = h === 0 ? 'green' : 'blue';
        const div = document.createElement('div');
        div.className = 'top5-item';
        div.style = 'display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 8px; margin-bottom: 6px; background: rgba(0,230,118,0.03); border: 1px solid var(--border-color);';
        div.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:600; color:var(--text-primary); font-size:13px;">${esc(eleve.prenom)} ${esc(eleve.nom)}</div>
            <div style="font-size:10px; color:var(--text-muted);">${h === 0 ? window.t('eleves.profil_absences_no_sanction') : window.t('eleves.profil_absences_total_hours')}</div>
          </div>
          <div class="score-circle ${esc(color)}">${esc(h)}h</div>
        `;
        fragment.appendChild(div);
      });
      requestAnimationFrame(() => {
        assidusContainer.innerHTML = '';
        assidusContainer.appendChild(fragment);
      });
    }
  }
}

function renderEvolution(data) {
  const canvas = document.getElementById('evolution-chart');
  const emptyEl = document.getElementById('evolution-empty');
  if (!canvas) return;

  if (evolutionChart) {
    try { evolutionChart.destroy(); } catch(e) {}
    evolutionChart = null;
  }

  if (!data.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  const isN1N2 = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';
  let labels, valeurs;
  if (isN1N2) {
    // N1/N2 : évolution par trimestre (moyenne des UA du trimestre)
    const ORDRE_TRIM = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
    labels = [];
    valeurs = [];
    ORDRE_TRIM.forEach(p => {
      const row = data.find(r => r.periode === p);
      if (row) { labels.push(p.replace('Trimestre ', 'T')); valeurs.push(row.moyenne); }
    });
  } else {
    // N3 : évolution par (periode, sequence) dans l'ordre canonique
    const ORDRE = [['Trimestre 1',1],['Trimestre 1',2],['Trimestre 2',1],['Trimestre 2',2],['Trimestre 3',1],['Trimestre 3',2]];
    labels = [];
    valeurs = [];
    ORDRE.forEach(([periode, seq]) => {
      const row = data.find(r => r.periode === periode && r.sequence === seq);
      if (row) { labels.push(`T${periode.slice(-1)} S${seq}`); valeurs.push(row.moyenne); }
    });
  }
  if (!labels.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'flex';
    return;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const tickColor = isLight ? '#526070' : '#6b7a99';
  const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(45,54,80,0.6)';
  const labelColor = isLight ? '#263345' : '#a0b3d9';

  evolutionChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Moyenne pondérée',
        data: valeurs,
        borderColor: '#00ff91',
        backgroundColor: 'rgba(0, 255, 145, 0.1)',
        borderWidth: 3,
        pointBackgroundColor: valeurs.map(v => {
          if (currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2') {
            return v >= 15 ? '#00ff91' : v >= 11 ? '#ffdc00' : '#ff2e63';
          }
          return v >= 14 ? '#00ff91' : v >= 10 ? '#ffdc00' : '#ff2e63';
        }),
        pointBorderColor: isLight ? '#fff' : '#1a1e2c',
        pointBorderWidth: 2,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutCubic' },
      scales: {
        y: { min: 0, max: 20, ticks: { color: tickColor, font: { size: 11 }, callback: v => {
          if (currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2') return `${v} · ${getQualitativeCode(v)}`;
          return `${v}/20`;
        } }, grid: { color: gridColor } },
        x: { ticks: { color: labelColor, font: { size: 11 } }, grid: { color: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(45,54,80,0.3)' } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { 
          backgroundColor: '#2a3147', 
          titleColor: '#f0f4fa', 
          bodyColor: '#a0b3d9', 
          borderColor: '#00ff91', 
          borderWidth: 1, 
          callbacks: { label: ctx => {
          const estQ = currentNiveauV2 === 'N1' || currentNiveauV2 === 'N2';
          return estQ ? ` ${getQualitativeCode(ctx.raw)} (${ctx.raw})` : ` ${ctx.raw}/20`;
        } } 
        }
      }
    }
  });
}

function populateClassSelect(classes) {
  const select = document.getElementById('dash-classe-select');
  if (!select) return;

  const fragment = document.createDocumentFragment();
  
  // Option par défaut
  const optDefault = document.createElement('option');
  optDefault.value = '';
  optDefault.textContent = ` ${window.t('dashboard.all_establishment') || 'Tout l\'établissement'}`;
  fragment.appendChild(optDefault);

  (classes || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${esc(c.nom_classe)} (${esc(c.nb_eleves || 0)} élèves)`;
    fragment.appendChild(opt);
  });

  requestAnimationFrame(() => {
    select.innerHTML = '';
    select.appendChild(fragment);
  });
}

function animateNumber(el, from, to, duration, decimals = 0) {
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function loadChartJS() {
  if (window.Chart) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '../../node_modules/chart.js/dist/chart.umd.js';
    script.onerror = () => {
      const fallback = document.createElement('script');
      fallback.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js';
      fallback.onload = resolve;
      fallback.onerror = reject;
      document.head.appendChild(fallback);
    };
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// ── Fonctions utilitaires V2 (notation duale) ──────────────────────────

/**
 * Convertit une note numérique (0-20) en code qualitatif (N1/N2)
 * NA (0-10), ECA (11-14), A (15-17), A+ (18-20)
 */
function getQualitativeCode(note) {
  if (note === null || note === undefined || isNaN(note)) return null;
  if (note >= 18) return 'A+';
  if (note >= 15) return 'A';
  if (note >= 11) return 'ECA';
  return 'NA';
}

/** Couleur CSS pour un code qualitatif */
function couleurQual(code) {
  switch(code) {
    case 'A+': case 'A': return 'var(--green-fifa)';
    case 'ECA': return 'var(--yellow-fifa)';
    case 'NA': return 'var(--red-fifa)';
    default: return 'var(--text-muted)';
  }
}

/** Classe CSS de couleur (green/yellow/red) selon la moyenne */
function getNoteColor(moyenne, estQualitatif) {
  if (moyenne === null || moyenne === undefined) return '';
  if (estQualitatif) {
    const code = getQualitativeCode(moyenne);
    if (code === 'A+' || code === 'A') return 'green';
    if (code === 'ECA') return 'yellow';
    return 'red';
  }
  if (moyenne >= 14) return 'green';
  if (moyenne >= 10) return 'yellow';
  return 'red';
}

/** Génère les étoiles HTML (5 étoiles, pleines ou vides) */
function getStars(moyenne, estQualitatif) {
  if (moyenne === null || moyenne === undefined) return '';
  let count;
  if (estQualitatif) {
    const code = getQualitativeCode(moyenne);
    count = code === 'A+' ? 5 : code === 'A' ? 4 : code === 'ECA' ? 3 : 1;
  } else {
    count = moyenne >= 18 ? 5 : moyenne >= 15 ? 4 : moyenne >= 12 ? 3 : moyenne >= 9 ? 2 : 1;
  }
  return Array.from({length: 5}, (_, i) =>
    `<span style="color:${i < count ? '#ffd700' : '#3d4a6a'}; font-size:11px;">★</span>`
  ).join('');
}

/** Formate le score pour affichage : code qualitatif ou note numérique */
function formatScore(moyenne, estQualitatif) {
  if (moyenne === null || moyenne === undefined) return '—';
  if (estQualitatif) return getQualitativeCode(moyenne) || '—';
  return typeof moyenne === 'number' ? moyenne.toFixed(1) : String(moyenne);
}
