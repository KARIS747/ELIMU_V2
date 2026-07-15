/**
 * pdf/bulletinRecap.js — Export PDF du bulletin récapitulatif annuel
 * Résume les 3 trimestres, moyenne annuelle, rang, absences totales
 * et décision de passage en classe supérieure
 * Version synchrone pour better-sqlite3
 */

const PDFDocument = require('pdfkit');
const { get, all } = require('../../database/db');
const {
  loadConfig,
  getMention,
  getMentionColor,
  ordinalLang,
  calcMoyMatiere,
  calcMoyGenerale,
  drawAdminHeader
} = require('./helpers');
const { getDocTranslator } = require('./locales');

/**
 * Prépare les données pour un bulletin récapitulatif annuel
 */
function prepareBulletinRecapData(eleveId, lang = 'fr') {
  const eleve = get(`
    SELECT e.*, c.nom_classe, c.id AS classe_id, c.matieres_json AS matieres_json_classe
    FROM eleves e
    LEFT JOIN classes c ON c.id = e.classe_id
    WHERE e.id = ?
  `, [eleveId]);
  if (!eleve) return null;

  const cfg = loadConfig();
  const poids1 = parseFloat(cfg.calc_poids_seq1 || 40) / 100;
  const poids2 = parseFloat(cfg.calc_poids_seq2 || 60) / 100;

  const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

  const notesByPeriode = {};
  for (const p of PERIODES) {
    const s1 = all(`SELECT m.nom_matiere, m.coefficient, n.note, m.id AS matiere_id
      FROM notes n JOIN matieres m ON m.id = n.matiere_id
      WHERE n.eleve_id = ? AND n.periode = ? AND n.sequence = 1`, [eleveId, p]);
    const s2 = all(`SELECT m.nom_matiere, m.coefficient, n.note, m.id AS matiere_id
      FROM notes n JOIN matieres m ON m.id = n.matiere_id
      WHERE n.eleve_id = ? AND n.periode = ? AND n.sequence = 2`, [eleveId, p]);

    const map = new Map();
    [...s1, ...s2].forEach(n => {
      if (!map.has(n.matiere_id)) {
        const configM = (() => {
          try {
            const mj = JSON.parse(eleve.matieres_json_classe || '[]');
            return mj.find(m => m.nom === n.nom_matiere);
          } catch { return null; }
        })();
        map.set(n.matiere_id, {
          nom: n.nom_matiere,
          coef: configM?.coefficient ?? (n.coefficient || 1),
          seq1: null, seq2: null
        });
      }
    });
    s1.forEach(n => { const m = map.get(n.matiere_id); if (m) m.seq1 = n.note; });
    s2.forEach(n => { const m = map.get(n.matiere_id); if (m) m.seq2 = n.note; });

    notesByPeriode[p] = Array.from(map.values()).map(m => ({
      ...m,
      moy: calcMoyMatiere(m.seq1, m.seq2, poids1, poids2)
    })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  const moyParTrimestre = {};
  for (const p of PERIODES) {
    moyParTrimestre[p] = calcMoyGenerale(notesByPeriode[p]);
  }

  const moys = PERIODES.map(p => moyParTrimestre[p]).filter(m => m !== null);
  const moyAnnuelle = moys.length > 0
    ? Math.round(moys.reduce((s, m) => s + m, 0) / moys.length * 100) / 100
    : null;

  let rangAnnuel = null, nbElevesClasse = 0;
  const tousEleves = all(`SELECT id FROM eleves WHERE classe_id = ?`, [eleve.classe_id]);
  nbElevesClasse = tousEleves.length;

  const moyennesEleves = [];
  for (const e of tousEleves) {
    const allNotes = all(
      `SELECT n.note, m.coefficient FROM notes n JOIN matieres m ON m.id = n.matiere_id
       WHERE n.eleve_id = ?`, [e.id]);
    const moy = allNotes.length
      ? Math.round(allNotes.reduce((s, n) => s + n.note * n.coefficient, 0) /
          allNotes.reduce((s, n) => s + n.coefficient, 0) * 100) / 100
      : null;
    moyennesEleves.push({ id: e.id, moy });
  }
  moyennesEleves.sort((a, b) => (b.moy || 0) - (a.moy || 0));
  const pos = moyennesEleves.findIndex(e => e.id === eleveId);
  if (pos >= 0) rangAnnuel = pos + 1;

  const absRows = all(`SELECT periode, heures FROM heures_absence WHERE eleve_id = ?`, [eleveId]);
  const absParTrimestre = { 'Trimestre 1': 0, 'Trimestre 2': 0, 'Trimestre 3': 0 };
  absRows.forEach(r => { absParTrimestre[r.periode] = r.heures; });
  const totalAbsences = Object.values(absParTrimestre).reduce((s, h) => s + h, 0);

  return {
    eleve, cfg, notesByPeriode, moyParTrimestre, moyAnnuelle,
    rangAnnuel, nbElevesClasse, absParTrimestre, totalAbsences
  };
}

/**
 * Dessine un bulletin récapitulatif annuel sur une page
 */
function drawBulletinRecap(doc, data, lang = 'fr') {
  const { eleve, cfg, notesByPeriode, moyParTrimestre, moyAnnuelle, rangAnnuel, nbElevesClasse, absParTrimestre, totalAbsences } = data;
  const t = getDocTranslator(lang);
  const PERIODES = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];

  const seuil = parseFloat(cfg.seuil_alerte || 10);
  const passage = moyAnnuelle !== null ? moyAnnuelle >= seuil : null;
  const annee = cfg.annee_scolaire || `${new Date().getFullYear()-1}/${new Date().getFullYear()}`;
  const nomEtab   = cfg.etab_nom || 'Établissement';

  const params = {};
  try {
    const pRows = all('SELECT cle, valeur FROM parametres');
    pRows.forEach(r => (params[r.cle] = r.valeur));
  } catch (e) {}

  const nomDir    = cfg.directeur_nom || '';
  const titreDir  = cfg.directeur_titre || (lang === 'en' ? 'The Principal' : 'Le Directeur');
  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';

  const profPrincipalRow = get(`SELECT nom, prenom FROM professeurs p JOIN classes c ON c.professeur_principal_id = p.id WHERE c.id = ?`, [eleve.classe_id]);
  const profFull = profPrincipalRow ? `${profPrincipalRow.nom.toUpperCase()} ${profPrincipalRow.prenom}` : '—';

  const pageW = 595 - 60;
  const LEFT  = 30;
  let y = 28;

  // Filigrane
  const filigraneTexte = cfg.filigrane_texte || params.abreviation_etab || nomEtab;
  doc.save();
  doc.opacity(0.19);
  doc.fillColor('#a8a8a8');
  doc.font('Helvetica-Bold').fontSize(72);
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2 - 10;
  doc.rotate(45, { origin: [centerX, centerY] });
  doc.text(filigraneTexte.toUpperCase(), centerX - 340, centerY - 50, { width: 700, align: 'center', lineBreak: false });
  doc.restore();

  doc.rect(LEFT, y, pageW, 2).fill(coulPrimaire);
  y += 6;
  
  // En-tête administratif partagé
  y = drawAdminHeader(doc, cfg, y, lang);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(t('bulletin_recap_title'), LEFT, y, { width: pageW, align: 'center' });
  y += 14;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#333').text(`${t('school_year')} : ${annee}`, LEFT, y, { width: pageW, align: 'center' });
  y += 14;
  doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#ccc').lineWidth(0.5).stroke();
  y += 8;

  const carteH = 44;
  doc.rect(LEFT, y, pageW, carteH).stroke('#333').lineWidth(0.5);
  const cellH = carteH / 2;
  const col1W = pageW * 0.50, col2W = pageW * 0.25, col3W = pageW - col1W - col2W;
  doc.moveTo(LEFT + col1W, y).lineTo(LEFT + col1W, y + carteH).stroke('#333');
  doc.moveTo(LEFT + col1W + col2W, y).lineTo(LEFT + col1W + col2W, y + carteH).stroke('#333');
  doc.moveTo(LEFT, y + cellH).lineTo(LEFT + pageW, y + cellH).stroke('#333');
  
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(t('name_firstname') + ' :', LEFT + 3, y + 3);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(`${eleve.nom.toUpperCase()} ${eleve.prenom.toUpperCase()}`, LEFT + 3, y + 11, { width: col1W - 6, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(t('birth_date') + ' :', LEFT + col1W + 3, y + 3);
  const naiss = eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString(locale) : '—';
  doc.font('Helvetica').fontSize(8).fillColor('#111').text(naiss, LEFT + col1W + 3, y + 11, { width: col2W - 6 });
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(t('class') + ' :', LEFT + col1W + col2W + 3, y + 3);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#111').text(eleve.nom_classe || '—', LEFT + col1W + col2W + 3, y + 11, { width: col3W - 6 });

  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(t('head_teacher') + ' :', LEFT + 3, y + cellH + 3);
  doc.font('Helvetica').fontSize(8).fillColor('#111').text(profFull || '—', LEFT + 3, y + cellH + 11, { width: col1W - 6, ellipsis: true });
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(t('class_size') + ' :', LEFT + col1W + 3, y + cellH + 3);
  doc.font('Helvetica').fontSize(8).fillColor('#111').text(String(nbElevesClasse || '—'), LEFT + col1W + 3, y + cellH + 11);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#555').text(lang === 'en' ? 'ANNUAL RANK :' : 'RANG ANNUEL :', LEFT + col1W + col2W + 3, y + cellH + 3);
  if (rangAnnuel) doc.font('Helvetica-Bold').fontSize(9).fillColor(coulPrimaire).text(`${ordinalLang(rangAnnuel, lang)} / ${nbElevesClasse}`, LEFT + col1W + col2W + 3, y + cellH + 10, { width: col3W - 6 });
  else doc.font('Helvetica').fontSize(8).fillColor('#111').text('—', LEFT + col1W + col2W + 3, y + cellH + 11);
  y += carteH + 8;

  const colMat = pageW * 0.38, colT = (pageW - colMat) / 4;
  const headH = 22, rowH = 18;
  doc.rect(LEFT, y, pageW, headH).fill(coulPrimaire);
  const headers = [t('subject') + 's', t('quarter') + ' 1', t('quarter') + ' 2', t('quarter') + ' 3', t('col_annual_avg')];
  const widths = [colMat, colT, colT, colT, colT];
  let cx = LEFT;
  headers.forEach((h, i) => {
    if (i > 0) doc.moveTo(cx, y + 3).lineTo(cx, y + headH - 3).strokeColor('rgba(255,255,255,0.3)').lineWidth(0.5).stroke();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7).text(h, cx + 2, y + (headH - 8) / 2, { width: widths[i] - 4, align: 'center' });
    cx += widths[i];
  });
  y += headH;

  const allMatiereNames = new Set();
  PERIODES.forEach(p => notesByPeriode[p].forEach(m => allMatiereNames.add(m.nom)));
  const matieresUniques = Array.from(allMatiereNames).sort((a, b) => a.localeCompare(b, 'fr'));

  matieresUniques.forEach((nom, idx) => {
    const bg = idx % 2 === 0 ? '#ffffff' : '#f5f7fb';
    doc.rect(LEFT, y, pageW, rowH).fill(bg);
    doc.rect(LEFT, y, 2.5, rowH).fill('#cccccc');
    cx = LEFT;
    doc.fillColor('#111').font('Helvetica').fontSize(7.5).text(nom, cx + 5, y + (rowH - 7) / 2, { width: colMat - 8, ellipsis: true });
    cx += colMat;
    PERIODES.forEach(p => {
      doc.moveTo(cx, y).lineTo(cx, y + rowH).strokeColor('#dde3ec').lineWidth(0.4).stroke();
      const mat = notesByPeriode[p].find(m => m.nom === nom);
      const moy = mat?.moy ?? null;
      if (moy !== null) doc.fillColor(getMentionColor(moy, cfg)).font('Helvetica-Bold').fontSize(8.5).text(moy.toFixed(2), cx, y + (rowH - 8) / 2, { width: colT, align: 'center' });
      else doc.fillColor('#ccc').font('Helvetica').fontSize(7.5).text('—', cx, y + (rowH - 7) / 2, { width: colT, align: 'center' });
      cx += colT;
    });
    doc.moveTo(cx, y).lineTo(cx, y + rowH).strokeColor('#dde3ec').lineWidth(0.4).stroke();
    const moysAnn = PERIODES.map(p => notesByPeriode[p].find(m => m.nom === nom)?.moy).filter(v => v !== null && v !== undefined);
    if (moysAnn.length > 0) {
      const moyAnn = Math.round(moysAnn.reduce((s, v) => s + v, 0) / moysAnn.length * 100) / 100;
      const mc = getMentionColor(moyAnn, cfg);
      doc.save().fillOpacity(0.1).rect(cx, y, colT, rowH).fill(mc).restore();
      doc.fillColor(mc).font('Helvetica-Bold').fontSize(9).text(moyAnn.toFixed(2), cx, y + (rowH - 8) / 2, { width: colT, align: 'center' });
    } else doc.fillColor('#ccc').font('Helvetica').fontSize(7.5).text('—', cx, y + (rowH - 7) / 2, { width: colT, align: 'center' });
    doc.moveTo(LEFT, y + rowH).lineTo(LEFT + pageW, y + rowH).strokeColor('#dde3ec').lineWidth(0.3).stroke();
    y += rowH;
  });

  doc.rect(LEFT, y, pageW, 24).fill('#dce4f0');
  doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#b0bcd8').lineWidth(0.5).stroke();
  doc.moveTo(LEFT, y + 24).lineTo(LEFT + pageW, y + 24).strokeColor('#b0bcd8').lineWidth(0.5).stroke();
  cx = LEFT;
  doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(8).text(t('general_average'), cx + 5, y + 8, { width: colMat - 8 });
  cx += colMat;
  PERIODES.forEach(p => {
    doc.moveTo(cx, y + 2).lineTo(cx, y + 22).strokeColor('#b0bcd8').lineWidth(0.4).stroke();
    const moy = moyParTrimestre[p];
    if (moy !== null) doc.fillColor(getMentionColor(moy, cfg)).font('Helvetica-Bold').fontSize(10).text(moy.toFixed(2), cx, y + 7, { width: colT, align: 'center' });
    else doc.fillColor('#aaa').font('Helvetica').fontSize(8).text('—', cx, y + 8, { width: colT, align: 'center' });
    cx += colT;
  });
  doc.moveTo(cx, y + 2).lineTo(cx, y + 22).strokeColor('#b0bcd8').lineWidth(0.4).stroke();
  if (moyAnnuelle !== null) {
    const mc = getMentionColor(moyAnnuelle, cfg);
    doc.save().fillOpacity(0.15).rect(cx, y, colT, 24).fill(mc).restore();
    doc.fillColor(mc).font('Helvetica-Bold').fontSize(11).text(moyAnnuelle.toFixed(2), cx, y + 6, { width: colT, align: 'center' });
  }
  y += 30;

  doc.rect(LEFT, y, pageW, 22).fill('#fff8f0');
  doc.rect(LEFT, y, 3, 22).fill('#ff9800');
  doc.fillColor('#7a4a00').font('Helvetica-Bold').fontSize(8).text(t('unjustified_absences') + ' :', LEFT + 8, y + 7);
  cx = LEFT + 185;
  PERIODES.forEach((p, i) => {
    const h = absParTrimestre[p] || 0;
    const col = h === 0 ? '#2e7d32' : h < 10 ? '#e65100' : '#b71c1c';
    doc.fillColor('#555').font('Helvetica').fontSize(7.5).text(`T${i + 1}:`, cx, y + 7);
    doc.fillColor(col).font('Helvetica-Bold').fontSize(8).text(`${h}h`, cx + 14, y + 7);
    cx += 55;
  });
  const colTotal = totalAbsences === 0 ? '#2e7d32' : totalAbsences < 20 ? '#e65100' : '#b71c1c';
  doc.fillColor('#555').font('Helvetica').fontSize(7.5).text('Total:', cx, y + 7);
  doc.fillColor(colTotal).font('Helvetica-Bold').fontSize(8).text(`${totalAbsences}h`, cx + 24, y + 7);
  y += 28;

  const decisionH = 36, decisionColor = passage ? '#1b5e20' : '#b71c1c', decisionBg = passage ? '#f0fff4' : '#fff0f0', decisionBorderLeft = passage ? '#43a047' : '#e53935';
  doc.rect(LEFT, y, pageW, decisionH).fill(decisionBg);
  doc.rect(LEFT, y, 4, decisionH).fill(decisionBorderLeft);
  doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor(decisionBorderLeft).lineWidth(0.5).stroke();
  doc.moveTo(LEFT, y + decisionH).lineTo(LEFT + pageW, y + decisionH).strokeColor(decisionBorderLeft).lineWidth(0.5).stroke();
  doc.fillColor(decisionColor).font('Helvetica-Bold').fontSize(9).text(t('decision').toUpperCase() + ' :', LEFT + 10, y + 6);
  if (moyAnnuelle !== null) {
    const mention = getMention(moyAnnuelle, cfg);
    const labelPassage = lang === 'en' ? (passage ? 'PROMOTED' : 'NOT PROMOTED') : (passage ? 'ADMIS(E)' : 'NON ADMIS(E)');
    const decisText = `${labelPassage} ${lang === 'en' ? 'TO HIGHER CLASS' : 'EN CLASSE SUPÉRIEURE'} — ${t('average')} : ${moyAnnuelle.toFixed(2)}/20 — ${mention}`;
    doc.fillColor(decisionColor).font('Helvetica-Bold').fontSize(8.5).text(decisText, LEFT + 10, y + 19, { width: pageW - 20 });
  } else doc.fillColor('#999').font('Helvetica').fontSize(8).text(lang === 'en' ? 'No grades available for this school year' : 'Aucune note disponible pour cette année scolaire', LEFT + 10, y + 19);
  y += decisionH + 10;

  y = Math.max(y, 680);
  doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#d0d8e4').lineWidth(0.5).stroke();
  y += 6;
  const sigH = 52, sig3W = pageW / 3;
  doc.rect(LEFT, y, sig3W - 6, sigH).stroke('#d0d8e4');
  doc.fillColor('#555').font('Helvetica-Bold').fontSize(7).text(lang === 'en' ? 'The Class Teacher' : 'Le Professeur Principal', LEFT + 3, y + 5, { width: sig3W - 12, align: 'center' });
  if (profFull) doc.fillColor('#333').font('Helvetica').fontSize(7.5).text(profFull, LEFT + 3, y + 16, { width: sig3W - 12, align: 'center' });
  doc.fillColor('#aaa').font('Helvetica').fontSize(6.5).text('(Signature)', LEFT + 3, y + 40, { width: sig3W - 12, align: 'center' });
  
  const sigDirX = LEFT + sig3W + 3;
  doc.rect(sigDirX, y, sig3W - 6, sigH).stroke('#d0d8e4');
  doc.fillColor('#555').font('Helvetica-Bold').fontSize(7).text(titreDir, sigDirX + 3, y + 5, { width: sig3W - 12, align: 'center' });
  if (cfg.directeur_nom) doc.fillColor('#333').font('Helvetica').fontSize(7.5).text(cfg.directeur_nom, sigDirX + 3, y + 16, { width: sig3W - 12, align: 'center' });
  doc.fillColor('#aaa').font('Helvetica').fontSize(6.5).text(t('seal_and_signature'), sigDirX + 3, y + 40, { width: sig3W - 12, align: 'center' });
  
  const sigParX = LEFT + sig3W * 2 + 3;
  doc.rect(sigParX, y, sig3W - 3, sigH).stroke('#d0d8e4');
  doc.fillColor('#555').font('Helvetica-Bold').fontSize(7).text(t('parent_signature'), sigParX + 3, y + 5, { width: sig3W - 9, align: 'center' });
  doc.fillColor('#aaa').font('Helvetica').fontSize(6.5).text('(Signature)', sigParX + 3, y + 40, { width: sig3W - 9, align: 'center' });
  y += sigH + 8;
  doc.fillColor('#cccccc').font('Helvetica').fontSize(6).text(`${t('generated_by_elimu')} — ${new Date().toLocaleDateString(locale)}`, LEFT, y, { width: pageW, align: 'center' });
}

/**
 * Exporte un bulletin récapitulatif annuel
 */
function exportBulletinRecap(eleveId, outputPath, onProgress, anneeId, lang = 'fr') {
  return new Promise((resolve, reject) => {
    try {
      const data = prepareBulletinRecapData(eleveId, lang);
      if (!data) return resolve({ success: false, error: 'Données élève non trouvées' });
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const stream = require('fs').createWriteStream(outputPath);
      doc.pipe(stream);
      drawBulletinRecap(doc, data, lang);
      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', reject);
    } catch (err) { reject(err); }
  });
}

/**
 * Exporte tous les récapitulatifs annuels d'une classe dans UN SEUL fichier PDF
 */
function exportRecapClassePDF(elevesIds, outputPath, anneeId, lang = 'fr', onProgress = null) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const stream = require('fs').createWriteStream(outputPath);
      doc.pipe(stream);
      let count = 0;
      for (const id of elevesIds) {
        const data = prepareBulletinRecapData(id, lang);
        if (data) {
          if (count > 0) doc.addPage();
          drawBulletinRecap(doc, data, lang);
        }
        count++;
        if (onProgress) onProgress(count, elevesIds.length);
      }
      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, count }));
      stream.on('error', reject);
    } catch (err) { reject(err); }
  });
}

module.exports = { exportBulletinRecap, exportRecapClassePDF };
