import { state } from './state.js';
import { formatMontant, formatDate, modeLabel, _setKpi } from './helpers.js';
import { _imprimerRecu } from './paiement.js';

async function _chargerKpis() {
  try {
    const stats = await window.elimuAPI.financeGetStats();
    if (!stats) return;

    _setKpi('fin-kpi-du',       formatMontant(stats.total_du));
    _setKpi('fin-kpi-encaisse', formatMontant(stats.total_encaisse));
    _setKpi('fin-kpi-impayes',  formatMontant(stats.total_impayes));

    const taux = stats.total_du > 0
      ? (stats.total_encaisse / stats.total_du) * 100
      : 0;
    _setKpi('fin-kpi-taux', `${taux.toFixed(2)}%`);

    const fill = document.getElementById('fin-recouvrement-fill');
    if (fill) {
      setTimeout(() => {
        fill.style.width = `${Math.min(taux, 100)}%`;
        fill.style.background = taux >= 80 ? 'var(--green-fifa)'
                               : taux >= 50 ? 'var(--yellow-fifa)'
                               : 'var(--red-fifa)';
      }, 200);
    }
  } catch (e) {
    console.error('Erreur KPIs finance:', e);
  }
}

async function _chargerDashboard() {
  try {
    await Promise.all([
      _chargerGraphiqueMois(),
      _chargerTopImpayes(),
      _chargerDerniersPaiements()
    ]);
  } catch (err) {
    console.error('Erreur dashboard finance:', err);
  }
}

async function _chargerGraphiqueMois() {
  try {
    const data = await window.elimuAPI.financeGetEncaissementsParMois();
    if (!Array.isArray(data)) return;

    const ctx = document.getElementById('fin-chart-mois');
    if (!ctx) return;

    if (state._chartMois) state._chartMois.destroy();

    const labels  = data.map(d => d.mois);
    const valeurs = data.map(d => d.total);

    if (window.Chart) {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const tickColor = isLight ? '#526070' : '#6b7a99';
      const gridColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)';

      state._chartMois = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: window.t('finance.chart_monthly'),
            data: valeurs,
            borderColor: 'rgba(0,230,118,0.9)',
            backgroundColor: 'rgba(0,230,118,0.05)',
            borderWidth: 3,
            pointRadius: 5,
            pointBackgroundColor: 'rgba(0,230,118,1)',
            pointBorderColor: isLight ? '#ffffff' : '#1c2333',
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            tension: 0.3,
            fill: true,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`
              }
            },
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => `${v.toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`,
                color: tickColor,
                stepSize: 50000
              },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: tickColor },
              grid: { display: false }
            }
          }
        }
      });
    }
  } catch (e) {
    console.error('Graphique mois:', e);
  }
}

async function _chargerTopImpayes() {
  const container = document.getElementById('fin-top-impayes');
  if (!container) return;

  try {
    const top = await window.elimuAPI.financeGetTopImpayes(5);

    if (!Array.isArray(top) || !top.length) {
      container.innerHTML = `<p style="text-align:center;color:var(--green-fifa);padding:16px;font-size:13px;">${window.t('finance.no_unpaid')}</p>`;
      return;
    }

    const nbRetard = document.getElementById('fin-nb-retard');
    if (nbRetard) nbRetard.textContent = top.length;

    const fragment = document.createDocumentFragment();

    top.forEach((t, i) => {
      const item = document.createElement('div');
      item.style.cssText = `display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-color);`;

      item.innerHTML = `
        <div style="width:28px; height:28px; border-radius:50%; background:rgba(255,71,87,0.12);
                    border:1px solid rgba(255,71,87,0.3); display:flex; align-items:center;
                    justify-content:center; font-size:11px; font-weight:700; color:var(--red-fifa);
                    flex-shrink:0;">${i + 1}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:13px; color:var(--text-primary);">
            ${window.esc(t.nom)} ${window.esc(t.prenom)}
          </div>
          <div style="font-size:11px; color:var(--text-muted);">${window.esc(t.nom_classe || '—')}</div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div style="font-family:'Rajdhani',sans-serif; font-size:16px; font-weight:700; color:var(--red-fifa);">
            ${formatMontant(t.total_impaye)}
          </div>
          <div style="font-size:10px; color:var(--text-muted);">${t.nb_tranches} tranche(s)</div>
        </div>
      `;
      fragment.appendChild(item);
    });

    requestAnimationFrame(() => {
      container.innerHTML = '';
      container.appendChild(fragment);
    });

  } catch (e) {
    console.error('Erreur _chargerTopImpayes:', e);
    container.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px;">${window.t('finance.error_load')}</p>`;
  }
}

async function _chargerDerniersPaiements() {
  const tbody = document.getElementById('fin-tbody-recents');
  if (!tbody) return;

  try {
    const paiements = await window.elimuAPI.financeGetPaiements({ limit: 10 });

    if (!Array.isArray(paiements) || !paiements.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">${window.t('finance.no_payments')}</td></tr>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    paiements.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-family:'Rajdhani',sans-serif; font-size:13px; color:var(--blue-fifa);">
          ${window.esc(p.recu_numero || `P-${p.id}`)}
        </span></td>
        <td style="font-weight:600; color:var(--text-primary);">${window.esc(p.prenom)} ${window.esc(p.nom)}</td>
        <td style="color:var(--text-muted);">${window.esc(p.nom_classe || '—')}</td>
        <td style="font-family:'Rajdhani',sans-serif; font-size:15px; color:var(--green-fifa); font-weight:700;">
          ${formatMontant(p.montant)}
        </td>
        <td>${window.esc(modeLabel(p.mode))}</td>
        <td>${formatDate(p.date)}</td>
        <td>
          <button class="btn btn-sm btn-secondary btn-print-recu" data-id="${p.id}" title="${window.t('finance.receipt_pdf_success')}">🖨️</button>
        </td>
      `;
      tr.querySelector('.btn-print-recu').addEventListener('click', () => _imprimerRecu(parseInt(p.id)));
      fragment.appendChild(tr);
    });

    requestAnimationFrame(() => {
      tbody.innerHTML = '';
      tbody.appendChild(fragment);
    });

  } catch (e) {
    console.error('Erreur _chargerDerniersPaiements:', e);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">${window.t('common.error')}</td></tr>`;
  }
}

export { _chargerKpis, _chargerDashboard, _chargerGraphiqueMois, _chargerTopImpayes, _chargerDerniersPaiements };
