/**
 * pdf/pyramideAge.js — Export PDF « Pyramide des âges »
 * Courbe de points : abscisse = années de naissance des élèves,
 * ordonnée = effectif (gradué de 5 en 5). Filtrable par sexe.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const { loadConfig, drawAdminHeader, drawLogoFiligrane } = require('./helpers');
const { getDocTranslator } = require('./locales');

const BLEU = (cfg) => cfg.couleur_primaire || '#1a3c6e';
const OR = '#C9A227';

/**
 * Extrait l'année de naissance d'une date (YYYY-MM-DD ou DD/MM/YYYY…).
 * Retourne null si introuvable ou hors plage raisonnable.
 */
function anneeNaissance(dateNaissance, anneeCourante) {
  if (!dateNaissance || typeof dateNaissance !== 'string') return null;
  const m = dateNaissance.match(/(19|20)\d{2}/);
  if (!m) return null;
  const annee = parseInt(m[0], 10);
  if (annee < 1900 || annee > (anneeCourante || new Date().getFullYear()) + 1) return null;
  return annee;
}

/**
 * Répartition des naissances par année (pure, testable).
 * @param {Array<{date_naissance?: string, sexe?: string}>} eleves
 * @param {'T'|'M'|'F'} sexe - filtre : 'T' = tous, 'M' garçons, 'F' filles
 * @returns {{ parAnnee: Object<number, number>, parSexe: {M: Object, F: Object}, total: number, sansDate: number }}
 */
function repartitionNaissances(eleves, sexe = 'T') {
  const parAnnee = {};
  const parSexe = { M: {}, F: {} };
  let sansDate = 0;
  const anneeCourante = new Date().getFullYear();

  for (const el of eleves) {
    const s = (el && el.sexe) || 'T';
    const envM = sexe === 'T' || sexe === 'M';
    const envF = sexe === 'T' || sexe === 'F';
    const annee = anneeNaissance(el.date_naissance, anneeCourante);

    if ((!envM && s === 'M') || (!envF && s === 'F')) continue;
    if (annee === null) {
      sansDate += 1;
      continue;
    }
    parAnnee[annee] = (parAnnee[annee] || 0) + 1;
    if (s === 'M' || s === 'F') parSexe[s][annee] = (parSexe[s][annee] || 0) + 1;
  }

  const total = Object.values(parAnnee).reduce((a, b) => a + b, 0);
  return { parAnnee, parSexe, total, sansDate };
}

/**
 * Génère le PDF « Pyramide des âges » d'une classe.
 * @param {Array<{date_naissance?: string, sexe?: string}>} eleves
 * @param {{ classe: string, annee: string, sexe: 'T'|'M'|'F' }} options
 * @param {string} outputPath
 * @param {'fr'|'en'} [lang]
 */
function exportPyramideAgePDF(eleves, options, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const t = getDocTranslator(lang);
  const primaire = BLEU(cfg);
  const { classe, annee, sexe = 'T' } = options;
  const repart = repartitionNaissances(eleves, sexe);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const LEFT = 50;
      const pageW = doc.page.width - 100; // marges 50/50
      const RIGHT = LEFT + pageW;

      // ── En-tête officielle (République, ministère, établissement, logo) ──
      const yHeader = drawAdminHeader(doc, cfg, 30, lang, false);

      // ── Titre ──
      let y = yHeader + 6;
      doc.font('Helvetica-Bold').fontSize(16).fillColor(primaire)
        .text(t('pyramide_title'), LEFT, y, { align: 'center', width: pageW });
      y += 22;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#333333')
        .text(t('pyramide_sous_titre'), LEFT, y, { align: 'center', width: pageW });
      y += 17;
      doc.font('Helvetica').fontSize(9.5).fillColor('#444444')
        .text(
          `${classe ? classe.toUpperCase() : ''}${classe && annee ? ' — ' : ''}${annee || ''}`,
          LEFT, y, { align: 'center', width: pageW }
        );
      y += 13;
      doc.moveTo(LEFT + 120, y).lineTo(RIGHT - 120, y).strokeColor(OR).lineWidth(1.2).stroke();
      y += 14;

      // ── Bloc informations ──
      const infos = [];
      infos.push(`${t('pyramide_effectif')} : ${repart.total}`);
      if (sexe !== 'T') infos.push(`${t('pyramide_sexe')} : ${sexe === 'M' ? t('pyramide_garcons') : t('pyramide_filles')}`);
      doc.font('Helvetica').fontSize(10).fillColor('#222222')
        .text(infos.join('     '), LEFT, y, { align: 'center', width: pageW });
      y += 24;

      // ── Zone du graphe ──
      const xLeft = 72;
      const xRight = RIGHT - 22;
      const yBottom = y + 235;
      const yTop = yBottom - 220;
      const chartW = xRight - xLeft;
      const chartH = yBottom - yTop;

      const annees = Object.keys(repart.parAnnee).map(Number).sort((a, b) => a - b);
      const yPrem = annees.length ? annees[0] : new Date().getFullYear();
      const yDern = annees.length ? annees[annees.length - 1] : yPrem;
      const maxEff = Math.max(5, ...annees.map(a => repart.parAnnee[a]));
      const yMax = Math.max(5, Math.ceil(maxEff / 5) * 5);

      const xOf = (an) => (yDern > yPrem
        ? xLeft + ((an - yPrem) / (yDern - yPrem)) * chartW
        : xLeft + chartW / 2);
      const yOf = (n) => yBottom - (n / yMax) * chartH;

      // Grille horizontale (graduation de 5 en 5)
      for (let v = 0; v <= yMax; v += 5) {
        const gy = yOf(v);
        doc.moveTo(xLeft, gy).lineTo(xRight, gy).strokeColor('#e6e6e6').lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(7).fillColor('#888888')
          .text(String(v), xLeft - 7, gy - 3, { width: 26, align: 'right' });
      }

      // Axes
      doc.moveTo(xLeft, yBottom).lineTo(xRight, yBottom).strokeColor('#333333').lineWidth(1).stroke();
      doc.moveTo(xLeft, yTop).lineTo(xLeft, yBottom).strokeColor('#333333').lineWidth(1).stroke();

      // Libellés des années
      for (const an of annees) {
        const ax = xOf(an);
        doc.moveTo(ax, yBottom).lineTo(ax, yBottom + 4).strokeColor('#666666').lineWidth(0.8).stroke();
        doc.font('Helvetica').fontSize(8).fillColor('#333333')
          .text(String(an), ax - 12, yBottom + 6, { width: 24, align: 'center' });
      }

      // Légende des axes
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555')
        .text(t('pyramide_axe_y'), LEFT, yTop - 14, { width: 60, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555')
        .text(t('pyramide_axe_x'), RIGHT - 70, yBottom + 22, { width: 60, align: 'center' });

      // ── Courbes ──
      const drawCurve = (dist, color, label, labelAbove) => {
        const pts = annees.map(a => ({ x: xOf(a), y: yOf(dist[a] || 0), n: dist[a] || 0 }));
        if (!pts.length) return;

        // Aire translucide sous la courbe
        doc.save();
        doc.fillOpacity(0.14)
          .path(`M ${pts[0].x},${yBottom}`)
          .path(pts.map(p => `L ${p.x},${p.y}`).join(' '))
          .lineTo(pts[pts.length - 1].x, yBottom)
          .lineTo(pts[0].x, yBottom)
          .fill(color);
        doc.restore();

        // Ligne de la courbe
        doc.save();
        doc.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) doc.lineTo(pts[i].x, pts[i].y);
        doc.strokeColor(color).lineWidth(2).stroke();
        doc.restore();

        // Points + valeurs
        for (const p of pts) {
          doc.save();
          doc.circle(p.x, p.y, 3.5).fillColor('#ffffff').strokeColor(color).lineWidth(1.6).stroke();
          doc.restore();
          const dy = labelAbove ? -9 : 9;
          doc.font('Helvetica').fontSize(7).fillColor('#444444')
            .text(String(p.n), p.x - 8, p.y + dy, { width: 16, align: 'center' });
        }
      };

      if (sexe === 'M') {
        drawCurve(repart.parSexe.M || {}, primaire, t('pyramide_garcons'), true);
      } else if (sexe === 'F') {
        drawCurve(repart.parSexe.F || {}, OR, t('pyramide_filles'), true);
      } else if (repart.total === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#888888')
          .text(t('pyramide_sans_date'), xLeft, yTop + chartH / 2 - 5, { align: 'center', width: chartW });
      } else {
        drawCurve(repart.parSexe.M || {}, primaire, t('pyramide_garcons'), true);
        drawCurve(repart.parSexe.F || {}, OR, t('pyramide_filles'), false);
      }

      // ── Légende ──
      const legY = yBottom + 26;
      const legItems = [];
      if (sexe !== 'F') legItems.push({ c: primaire, l: t('pyramide_garcons') });
      if (sexe !== 'M') legItems.push({ c: OR, l: t('pyramide_filles') });
      let lx = xRight;
      for (let i = legItems.length - 1; i >= 0; i--) {
        const it = legItems[i];
        const w = 10 + it.l.length * 4.6 + 8;
        lx -= w;
        doc.rect(lx, legY, 10, 10).fill(it.c).stroke('#999');
        doc.font('Helvetica').fontSize(8).fillColor('#333333').text(it.l, lx + 13, legY + 1);
        lx -= 14;
      }

      // ── Pied de page ──
      const fy = 770;
      doc.moveTo(LEFT, fy).lineTo(RIGHT, fy).strokeColor(OR).lineWidth(1).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#666666')
        .text((cfg.etab_nom || '').toUpperCase(), LEFT, fy + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#666666')
        .text(`${t('pyramide_edite_le')} ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')}   ${t('pyramide_page')} ${doc.page}`, LEFT, fy + 8, { align: 'right', width: pageW });

      drawLogoFiligrane(doc, cfg, { opacity: 0.18 });

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, total: repart.total }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { repartitionNaissances, anneeNaissance, exportPyramideAgePDF };