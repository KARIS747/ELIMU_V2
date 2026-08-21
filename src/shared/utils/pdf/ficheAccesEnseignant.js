/**
 * pdf/ficheAccesEnseignant.js — Fiche d'accès enseignant (PDF A5)
 * Utilisée à la création d'un compte et via « Imprimer la fiche d'accès ».
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const { loadConfig, drawLogoFiligrane } = require('./helpers');
const { getDocTranslator } = require('./locales');

/**
 * Génère la fiche d'accès enseignant.
 * @param {{ nomComplet: string, identifiant: string, motDePasse?: string,
 *           codeEcole?: string, matiere?: string, classes?: string[] }} data
 * @param {string} outputPath
 * @param {'fr'|'en'} [lang]
 */
function exportFicheAccesPDF(data, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const t = getDocTranslator(lang);
  const NAVY = cfg.couleur_primaire || '#1a3c6e';
  const OR = '#C9A227';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A5', margin: 36 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const M = 36;
      const W = doc.page.width - M * 2;
      const RIGHT = M + W;

      // ── Bandeau titre ──
      const bandH = 54;
      doc.roundedRect(M, 36, W, bandH, 8).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff')
         .text('ÉLIMU', M, 44, { align: 'center', width: W });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(OR)
         .text(t('fiche_title'), M, 69, { align: 'center', width: W, characterSpacing: 1.5 });

      // ── Nom de l'établissement ──
      let y = 36 + bandH + 14;
      if (cfg.etab_nom) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#222222')
           .text(cfg.etab_nom.toUpperCase(), M, y, { align: 'center', width: W });
        y += 20;
      }

      // ── Carte informations ──
      const rows = [
        { label: t('fiche_nom_complet'), value: data.nomComplet || '—' },
        { label: t('fiche_identifiant'), value: data.identifiant || '—' }
      ];
      if (data.matiere) rows.push({ label: t('fiche_matiere'), value: data.matiere });
      if (Array.isArray(data.classes) && data.classes.length) {
        rows.push({ label: t('fiche_classes'), value: data.classes.join(', ') });
      }

      const rowH = 26;
      const cardH = rows.length * rowH + 8;
      doc.roundedRect(M, y, W, cardH, 6).fill('#f7f8fa').stroke('#e2e5ea');
      rows.forEach((r, i) => {
        const ry = y + 4 + i * rowH;
        if (i > 0) {
          doc.moveTo(M + 10, ry).lineTo(RIGHT - 10, ry)
             .strokeColor('#e2e5ea').lineWidth(0.6).stroke();
        }
        doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#8a9099')
           .text(r.label.toUpperCase(), M + 12, ry + 9, { width: 92 });
        const longVal = String(r.value).length > 38;
        doc.font('Helvetica-Bold').fontSize(longVal ? 9 : 11).fillColor('#1d2330')
           .text(r.value, M + 110, ry + (longVal ? 7 : 6), { width: W - 122 });
      });
      y += cardH + 16;

      // ── Code école + Mot de passe côte à côte ──
      const halfW = W / 2 - 6;
      doc.roundedRect(M, y, halfW, 52, 6).fillAndStroke('#eef3fa', NAVY);
      doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#5a6b85')
         .text(t('fiche_code_ecole').toUpperCase(), M, y + 8, { width: halfW, align: 'center' });
      const codeStr = String(data.codeEcole || '—');
      const codeSize = codeStr.length <= 16 ? 13 : codeStr.length <= 24 ? 10 : 7.5;
      doc.font('Courier-Bold').fontSize(codeSize).fillColor(NAVY)
         .text(codeStr, M, y + (codeSize >= 10 ? 23 : 27), { width: halfW, align: 'center' });

      const px = M + W / 2 + 6;
      doc.lineWidth(1.2).dash(3, { space: 2 });
      doc.roundedRect(px, y, halfW, 52, 6).fillAndStroke('#fffbf0', OR);
      doc.undash();
      doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#a08420')
         .text(t('fiche_mdp').toUpperCase(), px, y + 8, { width: halfW, align: 'center' });
      doc.font('Courier-Bold').fontSize(16).fillColor('#7a6410')
         .text(String(data.motDePasse || '—'), px, y + 21, { width: halfW, align: 'center' });

      // ── Pied de page ──
      const fy = doc.page.height - 36 - 34;
      doc.moveTo(M, fy).lineTo(RIGHT, fy).strokeColor(OR).lineWidth(1).stroke();
      doc.font('Helvetica-Oblique').fontSize(7.2).fillColor('#777777')
         .text(t('fiche_note_securite'), M, fy + 6, { align: 'center', width: W });
      doc.font('Helvetica').fontSize(7.2).fillColor('#999999')
         .text(`${t('fiche_edite_le')} ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')}`,
           M, fy + 19, { align: 'center', width: W });

      drawLogoFiligrane(doc, cfg, { opacity: 0.1 });

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { exportFicheAccesPDF };
