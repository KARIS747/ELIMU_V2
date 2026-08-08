/**
 * pdf/listesAffichables.js — Listes affichables (format paysage)
 * Listes destinées à être affichées en classe pour consultation et
 * contestation des notes par les élèves.
 *
 * - N1/N2 : une liste par UA, chaque sous-compétence affiche la note sur la
 *           somme des points (Σ(poids)) : « 27/40 » (somme directe des
 *           sous-notes / somme des poids) — sans détail orale/écrite/pratique.
 * - N3    : une liste par matière pour la séquence choisie (notes /20).
 *
 * L'en-tête officiel de l'établissement (logo) est réutilisé via
 * `drawAdminHeader` de `helpers.js` (identique aux bulletins).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { loadConfig, drawAdminHeader } = require('./helpers');
const { getDocTranslator } = require('./locales');

const SOUS_TYPES = ['orale', 'ecrite', 'pratique', 'savoirEtre'];

/**
 * Construit la liste ordonnée des colonnes (sous-compétences) + groupes
 * (compétences) depuis le curriculum, pour N1/N2.
 */
function buildColumnsN12(lvl, CURRICULUM_TEMPLATES) {
  const tmpl = CURRICULUM_TEMPLATES[lvl];
  const columns = [];
  const compGroups = [];
  if (!tmpl || !tmpl.competences) return { columns, compGroups };
  for (const [compCode, comp] of Object.entries(tmpl.competences)) {
    const scs = Object.entries(comp.sousCompetences || {});
    if (scs.length === 0) continue;
    compGroups.push({ code: compCode, nom: comp.nom, count: scs.length });
    for (const [scCode, sc] of scs) {
      columns.push({
        code: scCode,
        compCode,
        nom: sc.nom || scCode,
        total: sc.total || 0
      });
    }
  }
  return { columns, compGroups };
}

/**
 * Dessine l'en-tête de tableau N1/N2 (groupes de compétences + codes SC).
 * @returns {number} y après l'en-tête
 */
function drawHeaderN12(doc, t, LEFT, pageW, columns, compGroups, colNoW, colNomW, colMoyW, y) {
  const scStart = LEFT + colNoW + colNomW;          // début de la zone des sous-compétences
  const scW = pageW - colNoW - colNomW - colMoyW;   // largeur zone SC
  const colW = scW / columns.length;
  const moyStart = LEFT + pageW - colMoyW;
  const fsGroup = 6.5;

  // Hauteur ligne 1 : s'adapte au nom de compétence le plus long (taille réelle),
  // pour ne jamais tronquer un titre en plein milieu d'une phrase.
  let headH1 = 16;
  compGroups.forEach(g => {
    const h = doc.font('Helvetica-Bold').fontSize(fsGroup).heightOfString(g.nom.toUpperCase(), { width: g.count * colW - 4 });
    if (h + 4 > headH1) headH1 = h + 4;
  });
  const headH2 = 13;
  const headH = headH1 + headH2;

  doc.save();

  // Ligne 1 : groupes (compétences) — noms complets, centrés dans leur bande
  doc.rect(scStart, y, scW, headH1).fill('#1a3c6e');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fsGroup);
  let x = scStart;
  for (const g of compGroups) {
    const wdt = g.count * colW;
    doc.text(g.nom.toUpperCase(), x + 2, y + 2, { width: wdt - 4, align: 'center', lineBreak: true });
    doc.moveTo(x, y).lineTo(x, y + headH1).strokeColor('#32537e').lineWidth(0.6).stroke();
    x += wdt;
  }

  // Ligne 2 : codes des sous-compétences
  const y2 = y + headH1;
  doc.rect(scStart, y2, scW, headH2).fill('#dce3f0');
  doc.fillColor('#111').font('Helvetica-Bold');
  x = scStart;
  for (const c of columns) {
    doc.fontSize(8).text(c.code, x, y2 + 3, { width: colW, align: 'center' });
    x += colW;
    doc.moveTo(x, y2).lineTo(x, y2 + headH2).strokeColor('#9fb3d0').lineWidth(0.6).stroke();
  }

  // Bloc N° + Nom
  doc.rect(LEFT, y, colNoW + colNomW, headH).fill('#0e2a4d');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
    .text(t('col_num_short'), LEFT, y + headH / 2 - 4, { width: colNoW, align: 'center' });
  doc.fontSize(7).text(t('col_name_fullname'), LEFT + colNoW, y + headH / 2 - 4, { width: colNomW, align: 'center' });

  // Bloc MOY
  doc.rect(moyStart, y, colMoyW, headH).fill('#0e2a4d');
  doc.font('Helvetica-Bold').fontSize(8)
    .text(t('liste_aff_moy20'), moyStart, y + headH / 2 - 7, { width: colMoyW, align: 'center' });

  doc.restore();

  // Séparateurs verticaux garment alignés avec les colonnes de données
  doc.moveTo(LEFT + colNoW, y).lineTo(LEFT + colNoW, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();
  doc.moveTo(scStart, y).lineTo(scStart, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();
  doc.moveTo(moyStart, y).lineTo(moyStart, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();

  return y + headH;
}

/**
 * Dessine l'en-tête de tableau N3 (matières).
 * @returns {number} y après l'en-tête
 */
function drawHeaderN3(doc, t, LEFT, pageW, matieres, colNoW, colNomW, colMoyW, y) {
  const tableW = pageW;
  const scStart = LEFT + colNoW + colNomW;          // début de la zone des matières
  const scW = tableW - colNoW - colNomW - colMoyW;  // largeur zone matières
  const colW = scW / matieres.length;
  const moyStart = LEFT + pageW - colMoyW;

  // Hauteur en-tête : maximise selon le nom de matière le plus long (2 lignes max)
  const fsMat = 7;
  let need2 = false;
  matieres.forEach(m => {
    const est = Math.ceil(doc.font('Helvetica-Bold').fontSize(fsMat).widthOfString(m.nom.toUpperCase()) / Math.max(colW - 2, 1));
    if (est > 1) need2 = true;
  });
  const headH = need2 ? 26 : 20;

  doc.save();

  // Bloc N° + Nom
  doc.rect(LEFT, y, colNoW + colNomW, headH).fill('#0e2a4d');
  doc.fillColor('#fff').font('Helvetica-Bold');
  doc.fontSize(8).text(t('col_num_short'), LEFT, y + headH / 2 - 4, { width: colNoW, align: 'center' });
  doc.fontSize(7).text(t('col_name_fullname'), LEFT + colNoW, y + headH / 2 - 4, { width: colNomW, align: 'center' });

  // Zone matières
  doc.rect(scStart, y, scW, headH).fill('#1a3c6e');
  let x = scStart;
  matieres.forEach((m, mi) => {
    const textH = doc.fontSize(fsMat).heightOfString(m.nom.toUpperCase(), { width: colW - 2 });
    doc.text(m.nom.toUpperCase(), x + 1, y + (headH - textH) / 2 - 4, { width: colW - 2, align: 'center', lineBreak: true });
    doc.fontSize(6).text(`(${t('coeff')} ${m.coef})`, x + 1, y + (headH - textH) / 2 + textH - 2, { width: colW - 2, align: 'center' });
    x += colW;
    if (mi < matieres.length - 1) {
      doc.moveTo(x, y).lineTo(x, y + headH).strokeColor('#32537e').lineWidth(0.6).stroke();
    }
  });

  // Bloc MOY
  doc.rect(moyStart, y, colMoyW, headH).fill('#0e2a4d');
  doc.font('Helvetica-Bold').fontSize(8).text(t('liste_aff_moy20'), moyStart, y + headH / 2 - 4, { width: colMoyW, align: 'center' });

  doc.restore();

  doc.moveTo(LEFT + colNoW, y).lineTo(LEFT + colNoW, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();
  doc.moveTo(scStart, y).lineTo(scStart, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();
  doc.moveTo(moyStart, y).lineTo(moyStart, y + headH).strokeColor('#5b7bb0').lineWidth(0.6).stroke();
  doc.moveTo(LEFT, y + 1).lineTo(LEFT + pageW, y + 1).strokeColor('#5b7bb0').lineWidth(0.6).stroke();

  return y + headH;
}

function pageBottom(doc) {
  return doc.page.height - doc.page.margins.bottom - 40;
}

/**
 * Liste affichable N1/N2 — format paysage.
 * docData : {
 *   niveauV2, classe, trimestre, annee,
 *   uas: [ 'UA1', ... ],
 *   columns, compGroups,
 *   tables: [ { ua, cells: { eleveId: { scCode: {total, poids} } }, moyMap: { eleveId: number } } ],
 *   students: [ { id, nom, prenom, matricule } ]
 * }
 */
async function exportListeAffichableN12PDF(docData, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const t = getDocTranslator(lang);
  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const LEFT = doc.page.margins.left;
      const colNoW = 33;
      const colNomW = 150;
      const colMoyW = 52;
      const rowH = 18;

      docData.tables.forEach((table, ti) => {
        if (ti > 0) doc.addPage();
        let y = drawAdminHeader(doc, cfg, 28, lang, false);

        doc.font('Helvetica-Bold').fontSize(13).fillColor('#111')
          .text(t('liste_aff_title'), LEFT, y, { width: pageW, align: 'center' });
        y += 19;
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#444')
          .text(`${docData.classe}  |  ${docData.trimestre}  |  ${t('liste_aff_ua')} ${table.ua}  |  ${t('annee')} : ${docData.annee}`, LEFT, y, { width: pageW, align: 'center' });
        y += 13;
        doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#ccc').lineWidth(0.5).stroke();
        y += 6;

        // En-tête tableau
        y = drawHeaderN12(doc, t, LEFT, pageW, docData.columns, docData.compGroups, colNoW, colNomW, colMoyW, y);

        const colW = (pageW - colNoW - colNomW - colMoyW) / docData.columns.length;
        const cells = table.cells;
        const moyMap = table.moyMap || {};

        let firstOnPage = true;
        const drawHead = () => {
          if (!firstOnPage) {
            doc.addPage();
            y = drawAdminHeader(doc, cfg, 28, lang, false);
            y += 10;
            y = drawHeaderN12(doc, t, LEFT, pageW, docData.columns, docData.compGroups, colNoW, colNomW, colMoyW, y);
          }
          firstOnPage = false;
        };

        docData.students.forEach((st, idx) => {
          if (y + rowH > pageBottom(doc)) drawHead();
          const isEven = idx % 2 === 0;
          const rowTop = y;
          if (isEven) doc.rect(LEFT, rowTop, pageW, rowH).fill('#f4f7fc');
          doc.rect(LEFT, rowTop, pageW, rowH).strokeColor('#d5dce8').lineWidth(0.5).stroke();
          doc.moveTo(LEFT + colNoW, rowTop).lineTo(LEFT + colNoW, rowTop + rowH).stroke();
          doc.moveTo(LEFT + colNoW + colNomW, rowTop).lineTo(LEFT + colNoW + colNomW, rowTop + rowH).stroke();
          doc.moveTo(LEFT + pageW - colMoyW, rowTop).lineTo(LEFT + pageW - colMoyW, rowTop + rowH).stroke();

          doc.fillColor('#111').font('Helvetica').fontSize(8.5)
            .text(String(idx + 1), LEFT, rowTop + 5, { width: colNoW, align: 'center' });
          doc.font('Helvetica-Bold').fontSize(7.5)
            .text(`${st.nom.toUpperCase()} ${st.prenom}`, LEFT + colNoW + 4, rowTop + 5, { width: colNomW - 6, ellipsis: true });

          const scCells = cells[st.id] || {};
          let x = LEFT + colNoW + colNomW;
          docData.columns.forEach((c, colIdx) => {
            const cell = scCells[c.code];
            if (cell && cell.poids > 0) {
              const totalFmt = Math.round(cell.total * 10) / 10;
              doc.fillColor('#0f1d33').font('Helvetica-Bold').fontSize(8)
                .text(`${totalFmt}/${cell.poids}`, x, rowTop + 5, { width: colW, align: 'center' });
            } else {
              doc.fillColor('#b9c2d0').font('Helvetica').fontSize(7.5)
                .text('—', x, rowTop + 5, { width: colW, align: 'center' });
            }
            x += colW;
            if (colIdx < docData.columns.length - 1) {
              doc.moveTo(x, rowTop).lineTo(x, rowTop + rowH).strokeColor('#d5dce8').lineWidth(0.4).stroke();
            }
          });

          const moy = moyMap[st.id];
          if (moy != null) {
            doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(8.5)
              .text(Math.round(moy * 10) / 10, LEFT + pageW - colMoyW, rowTop + 5, { width: colMoyW, align: 'center' });
          } else {
            doc.fillColor('#b9c2d0').font('Helvetica').fontSize(7.5)
              .text('—', LEFT + pageW - colMoyW, rowTop + 5, { width: colMoyW, align: 'center' });
          }
          y += rowH;
        });

        y += 12;
        doc.font('Helvetica-Oblique').fontSize(7).fillColor('#666')
          .text(t('liste_aff_legend'), LEFT, y, { width: pageW, align: 'left' });
      });

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, nbUas: docData.tables.length }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Liste affichable N3 — format paysage.
 * docData : {
 *   classe, trimestre, sequence, annee,
 *   matieres: [ { matiere_id, nom, coef } ],
 *   rows: [ { eleve: { id, nom, prenom }, notes: { matiere_id: note } , moy } ]
 * }
 */
async function exportListeAffichableN3PDF(docData, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const t = getDocTranslator(lang);
  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const LEFT = doc.page.margins.left;
      const colNoW = 33;
      const colNomW = 150;
      const colMoyW = 52;
      const rowH = 18;

      let y = drawAdminHeader(doc, cfg, 28, lang, false);

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111')
        .text(t('liste_aff_title'), LEFT, y, { width: pageW, align: 'center' });
      y += 19;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#444')
        .text(`${docData.classe}  |  ${docData.trimestre}  |  ${t('liste_aff_sequence')} ${docData.sequence}  |  ${t('annee')} : ${docData.annee}`, LEFT, y, { width: pageW, align: 'center' });
      y += 13;
      doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#ccc').lineWidth(0.5).stroke();
      y += 6;

      y = drawHeaderN3(doc, t, LEFT, pageW, docData.matieres, colNoW, colNomW, colMoyW, y);

      const colW = (pageW - colNoW - colNomW - colMoyW) / docData.matieres.length;
      let firstOnPage = true;
      const drawHead = () => {
        if (!firstOnPage) {
          doc.addPage();
          y = drawAdminHeader(doc, cfg, 28, lang, false);
          y += 10;
          y = drawHeaderN3(doc, t, LEFT, pageW, docData.matieres, colNoW, colNomW, colMoyW, y);
        }
        firstOnPage = false;
      };

      docData.rows.forEach((row, idx) => {
        if (y + rowH > pageBottom(doc)) drawHead();
        const isEven = idx % 2 === 0;
        const rowTop = y;
        if (isEven) doc.rect(LEFT, rowTop, pageW, rowH).fill('#f4f7fc');
        doc.rect(LEFT, rowTop, pageW, rowH).strokeColor('#d5dce8').lineWidth(0.5).stroke();
        doc.moveTo(LEFT + colNoW, rowTop).lineTo(LEFT + colNoW, rowTop + rowH).stroke();
        doc.moveTo(LEFT + colNoW + colNomW, rowTop).lineTo(LEFT + colNoW + colNomW, rowTop + rowH).stroke();
        doc.moveTo(LEFT + pageW - colMoyW, rowTop).lineTo(LEFT + pageW - colMoyW, rowTop + rowH).stroke();

        doc.fillColor('#111').font('Helvetica').fontSize(8.5)
          .text(String(idx + 1), LEFT, rowTop + 5, { width: colNoW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.5)
          .text(`${row.eleve.nom.toUpperCase()} ${row.eleve.prenom}`, LEFT + colNoW + 4, rowTop + 5, { width: colNomW - 6, ellipsis: true });

        let x = LEFT + colNoW + colNomW;
        docData.matieres.forEach((m, mi) => {
          const note = row.notes[m.matiere_id];
          if (note != null) {
            doc.fillColor('#0f1d33').font('Helvetica-Bold').fontSize(8)
              .text(Math.round(note * 100) / 100, x, rowTop + 5, { width: colW, align: 'center' });
          } else {
            doc.fillColor('#b9c2d0').font('Helvetica').fontSize(7.5)
              .text('—', x, rowTop + 5, { width: colW, align: 'center' });
          }
          x += colW;
          if (mi < docData.matieres.length - 1) {
            doc.moveTo(x, rowTop).lineTo(x, rowTop + rowH).strokeColor('#d5dce8').lineWidth(0.4).stroke();
          }
        });

        if (row.moy != null) {
          doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(8.5)
            .text(Math.round(row.moy * 100) / 100, LEFT + pageW - colMoyW, rowTop + 5, { width: colMoyW, align: 'center' });
        } else {
          doc.fillColor('#b9c2d0').font('Helvetica').fontSize(7.5)
            .text('—', LEFT + pageW - colMoyW, rowTop + 5, { width: colMoyW, align: 'center' });
        }
        y += rowH;
      });

      y += 12;
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#666')
        .text(t('liste_aff_legend_n3'), LEFT, y, { width: pageW, align: 'left' });

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, nbEleves: docData.rows.length }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Prépare les données d'une liste affichable N1/N2.
 * rows : notes avec { eleve_id, ua, sous_competence_code, sous_type, note }
 * (sous_type IS NOT NULL, échelle réelle).
 */
function buildDocDataN12(rows, students, opts) {
  const { lvl, uas, CURRICULUM_TEMPLATES, getWeightsForSousCompetence } = opts;
  const { columns, compGroups } = buildColumnsN12(lvl, CURRICULUM_TEMPLATES);
  const tmpl = CURRICULUM_TEMPLATES[lvl];

  const tables = uas.map(ua => {
    // cells[eleve_id][scCode] = { total, poids }
    const cells = {};
    // moyMap[eleve_id] = moyenne /20 (même formule pondérée que le bulletin)
    const moyMap = {};

    const byStudent = {};
    rows.filter(r => r.ua === ua).forEach(r => {
      if (!byStudent[r.eleve_id]) byStudent[r.eleve_id] = [];
      byStudent[r.eleve_id].push(r);
    });

    for (const [eleveId, subRows] of Object.entries(byStudent)) {
      const id = Number(eleveId);
      // Σ(poids) par sous-compétence (somme directe)
      const byKey = {};
      for (const r of subRows) {
        const k = `${r.sous_competence_code}|${r.sous_type}`;
        if (!byKey[k]) byKey[k] = [];
        byKey[k].push(r.note);
      }
      const scAgg = {};
      for (const c of columns) {
        const w = getWeightsForSousCompetence(lvl, c.code);
        if (!w) continue;
        let total = 0;
        let poids = 0;
        for (const type of SOUS_TYPES) {
          const vals = byKey[`${c.code}|${type}`] || [];
          if (vals.length > 0) {
            vals.forEach(v => { total += v; });
            poids += w[type] || 0;
          }
        }
        if (poids > 0) scAgg[c.code] = { total, poids };
      }

      // Moyenne /20 (même formule pondérée que le bulletin)
      let totalGeneral = 0;
      let totalGeneralMaxScale = 0;
      for (const comp of Object.values(tmpl.competences)) {
        let compObtained = 0;
        let compMax = 0;
        for (const [scCode, sc] of Object.entries(comp.sousCompetences)) {
          const cell = scAgg[scCode];
          if (!cell) continue;
          const scAvgOn20 = (cell.total / cell.poids) * 20;
          compObtained += (scAvgOn20 / 20) * sc.total;
          compMax += sc.total;
        }
        totalGeneral += compObtained;
        totalGeneralMaxScale += compMax;
      }
      const moy = totalGeneralMaxScale > 0 ? (totalGeneral / totalGeneralMaxScale) * 20 : null;
      if (moy !== null) moyMap[id] = moy;

      if (Object.keys(scAgg).length > 0) cells[id] = scAgg;
    }

    return { ua, cells, moyMap };
  });

  return {
    columns, compGroups, tables,
    students: students.map(st => ({ id: st.id, nom: st.nom, prenom: st.prenom })),
    classe: opts.classe, trimestre: opts.trimestre, annee: opts.annee
  };
}

/**
 * Prépare les données d'une liste affichable N3.
 * rows : notes avec { eleve_id, matiere_id, note } pour la séquence choisie.
 */
function buildDocDataN3(rows, students, opts) {
  const matieres = opts.matieres.map(m => ({ matiere_id: m.matiere_id, nom: m.nom, coef: m.coef }));
  const rowsByStudent = {};
  rows.forEach(r => {
    if (!rowsByStudent[r.eleve_id]) rowsByStudent[r.eleve_id] = [];
    rowsByStudent[r.eleve_id].push(r);
  });

  const studentsRows = students.map(st => {
    const notes = {};
    let totalNxC = 0;
    let totalCoef = 0;
    for (const m of matieres) {
      const r = (rowsByStudent[st.id] || []).find(x => x.matiere_id === m.matiere_id);
      if (r && r.note != null) {
        notes[m.matiere_id] = r.note;
        totalNxC += r.note * m.coef;
        totalCoef += m.coef;
      }
    }
    const moy = totalCoef > 0 ? totalNxC / totalCoef : null;
    return { eleve: { id: st.id, nom: st.nom, prenom: st.prenom }, notes, moy };
  }).filter(r => Object.keys(r.notes).length > 0);

  return {
    matieres,
    rows: studentsRows,
    classe: opts.classe,
    trimestre: opts.trimestre,
    sequence: opts.sequence,
    annee: opts.annee
  };
}

module.exports = {
  exportListeAffichableN12PDF,
  exportListeAffichableN3PDF,
  buildColumnsN12,
  buildDocDataN12,
  buildDocDataN3
};
