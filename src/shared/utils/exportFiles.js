/**
 * utils/exportFiles.js — Utilitaires d'export
 */
const { ipcMain } = require('electron');
const path        = require('path');
const fs          = require('fs');
const PDFDocument = require('pdfkit');
const { loadConfig } = require('./pdf/helpers');
const { exportBulletinTrimestre, exportBulletinClassePDF } = require('./pdf/bulletinTrimestre');
const { exportBulletinRecap, exportRecapClassePDF } = require('./pdf/bulletinRecap');
const { exportExcel } = require('./excel/exportExcel');
const { exportExcelRentree } = require('./excel/exportExcelRentree');
const { exportModeleAbsences } = require('./modeleAbsences');
const { exportModeleNotes } = require('./modeleNotes');

/**
 * Dessine l'en-tête administratif type bulletin sur un document PDF
 */
function drawAdminHeader(doc, cfg, yStart) {
  const LEFT = 50;
  const pageW = 500;
  const colW = pageW / 3;
  const logoSize = 60;
  const logoX = LEFT + colW + (colW - logoSize) / 2;
  const logoY = yStart;
  const coulPrimaire = '#1a1e2c';

  // Colonne gauche (Français)
  const republiqueFR = cfg.republique_fr || 'RÉPUBLIQUE DU CAMEROUN';
  const deviseEtatFR = cfg.devise_etat_fr || 'Paix - Travail - Patrie';
  const ministereFR  = cfg.ministere_fr  || 'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES';
  const delegReg     = cfg.delegation_regionale || 'Délégation Régionale du Centre';
  const delegDept    = cfg.delegation_departementale || 'Délégation Départementale du Mfoundi';
  const nomEtab      = cfg.etab_nom || 'Établissement Scolaire';
  const devise       = cfg.etab_devise || 'Discipline - Travail - Succès';

  const ministereFRLignes = ministereFR.length > 25
    ? [ministereFR.substring(0, ministereFR.lastIndexOf(' ', 25) || 25),
       ministereFR.substring(ministereFR.lastIndexOf(' ', 25) + 1 || 25)]
    : [ministereFR];

  const txtFR = [
    { text: republiqueFR, bold: true, size: 7, color: coulPrimaire },
    { text: deviseEtatFR, bold: false, size: 6.5, color: '#333333' },
    { text: '--------', bold: false, size: 6, color: '#aaaaaa' },
  ];
  ministereFRLignes.forEach(l => txtFR.push({ text: l, bold: true, size: 6.5, color: coulPrimaire }));
  txtFR.push({ text: '--------', bold: false, size: 6, color: '#aaaaaa' });
  if (delegReg) txtFR.push({ text: delegReg.toUpperCase(), bold: true, size: 6, color: coulPrimaire });
  if (delegDept) txtFR.push({ text: delegDept.toUpperCase(), bold: true, size: 6, color: coulPrimaire });
  txtFR.push(
    { text: '--------', bold: false, size: 6, color: '#aaaaaa' },
    { text: nomEtab.toUpperCase(), bold: true, size: 6.5, color: '#111111' }
  );
  if (devise) txtFR.push({ text: `"${devise}"`, bold: false, size: 6, color: '#555555' });

  let yFR = yStart;
  for (const ligne of txtFR) {
    doc.font(ligne.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(ligne.size).fillColor(ligne.color)
       .text(ligne.text, LEFT, yFR, { width: colW - 4, align: 'center' });
    yFR += ligne.size + 1.8;
  }

  // Colonne droite (Anglais)
  const republiqueEN = cfg.republique_en || 'REPUBLIC OF CAMEROON';
  const deviseEtatEN = cfg.devise_etat_en || 'Peace - Work - Fatherland';
  const ministereEN  = cfg.ministere_en || 'MINISTRY OF SECONDARY EDUCATION';
  
  const ministereENLignes = ministereEN.length > 25
    ? [ministereEN.substring(0, ministereEN.lastIndexOf(' ', 25) || 25),
       ministereEN.substring(ministereEN.lastIndexOf(' ', 25) + 1 || 25)]
    : [ministereEN];

  const delegRegEN  = cfg.delegation_regionale_en || '';
  const delegDeptEN = cfg.delegation_departementale_en || '';

  const txtEN = [
    { text: republiqueEN, bold: true, size: 7, color: coulPrimaire },
    { text: deviseEtatEN, bold: false, size: 6.5, color: '#333333' },
    { text: '--------', bold: false, size: 6, color: '#aaaaaa' },
  ];
  ministereENLignes.forEach(l => txtEN.push({ text: l, bold: true, size: 6.5, color: coulPrimaire }));
  txtEN.push({ text: '--------', bold: false, size: 6, color: '#aaaaaa' });
  
  if (delegRegEN) txtEN.push({ text: delegRegEN.toUpperCase(), bold: true, size: 6, color: coulPrimaire });
  if (delegDeptEN) txtEN.push({ text: delegDeptEN.toUpperCase(), bold: true, size: 6, color: coulPrimaire });

  txtEN.push(
    { text: '--------', bold: false, size: 6, color: '#aaaaaa' },
    { text: (cfg.etab_nom_en || nomEtab).toUpperCase(), bold: true, size: 6.5, color: '#111111' }
  );

  let yEN = yStart;
  const colDroiteX = LEFT + colW * 2;
  for (const ligne of txtEN) {
    doc.font(ligne.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(ligne.size).fillColor(ligne.color)
       .text(ligne.text, colDroiteX, yEN, { width: colW - 2, align: 'center' });
    yEN += ligne.size + 1.8;
  }

  // Logo
  if (cfg.logo_bulletin || cfg.etab_logo) {
    try {
      const logoData = cfg.logo_bulletin || cfg.etab_logo;
      const imgBuf = Buffer.from(logoData.split(',')[1], 'base64');
      doc.image(imgBuf, logoX, logoY + 2, { fit: [logoSize, logoSize], align: 'center' });
    } catch (e) {
      doc.rect(logoX, logoY + 2, logoSize, logoSize).stroke('#cccccc');
    }
  } else {
    doc.rect(logoX, logoY + 2, logoSize, logoSize).stroke('#cccccc');
  }

  const yFinal = Math.max(yFR, yEN, logoY + logoSize) + 10;
  doc.moveTo(LEFT, yFinal).lineTo(LEFT + pageW, yFinal).strokeColor(coulPrimaire).lineWidth(1.5).stroke();
  return yFinal + 15;
}

/**
 * Génère un bordereau de notes PDF
 */
async function generateBordereauPDF(eleves, options, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const { getDocTranslator } = require('./pdf/locales');
  const t = getDocTranslator(lang);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = drawAdminHeader(doc, cfg, 40);
      // Titre du document
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
           .text(t('tally_grades_title'), 50, y, { width: 500, align: 'center' });
        y += 20;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#444444')
           .text(`${options.classe}  |  ${options.matiere}  |  ${options.trimestre} - Séq ${options.sequence}`, 50, y, { width: 500, align: 'center' });
        y += 25;

        // Tableau
        const tableTop = y;
        const colNo = 30, colNom = 300, colNote = 80, colSig = 90;
        const rowH = 20;

        // En-tête tableau
        doc.rect(50, tableTop, 500, rowH).fill('#1a1e2c');
        doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text(t('col_num_short'), 55, tableTop + 6);
        doc.text(t('col_name_fullname'), 85, tableTop + 6);
        doc.text(t('col_grade_20'), 385, tableTop + 6, { width: colNote, align: 'center' });
        doc.text(t('col_signature'), 465, tableTop + 6, { width: colSig, align: 'center' });

        let currentY = tableTop + rowH;
        doc.fillColor('#000000').font('Helvetica');

        eleves.forEach((el, index) => {
          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
          }
          
          // Lignes et bordures
          doc.rect(50, currentY, 500, rowH).strokeColor('#eeeeee').lineWidth(0.5).stroke();
          doc.moveTo(50 + colNo, currentY).lineTo(50 + colNo, currentY + rowH).stroke();
          doc.moveTo(50 + colNo + colNom, currentY).lineTo(50 + colNo + colNom, currentY + rowH).stroke();
          doc.moveTo(50 + colNo + colNom + colNote, currentY).lineTo(50 + colNo + colNom + colNote, currentY + rowH).stroke();

          doc.fontSize(8.5).text(String(index + 1), 55, currentY + 6);
          doc.text(`${el.nom.toUpperCase()} ${el.prenom}`, 85, currentY + 6, { width: colNom - 10, ellipsis: true });
          
          currentY += rowH;
        });

        doc.end();

      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Génère un bordereau d'absences PDF
 */
async function generateBordereauAbsencesPDF(eleves, options, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const { getDocTranslator } = require('./pdf/locales');
  const t = getDocTranslator(lang);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const y = drawAdminHeader(doc, cfg, 40);
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
          .text(t('tally_absences_title'), 50, y, { width: 500, align: 'center' });
      const y2 = y + 20;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#444444')
          .text(`${options.classe}  |  ${options.trimestre}  |  Année : ${options.annee}`, 50, y2, { width: 500, align: 'center' });
      const tableTop = y2 + 25;

      const colNo = 30, colNom = 340, colAbs = 130;
      const rowH = 22;

      doc.rect(50, tableTop, 500, rowH).fill('#1a1e2c');
      doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
      doc.text(t('col_num_short'), 55, tableTop + 7);
      doc.text(t('col_name_fullname'), 85, tableTop + 7);
      doc.text(t('col_abs_hours'), 395, tableTop + 7, { width: colAbs, align: 'center' });

      let currentY = tableTop + rowH;
      doc.fillColor('#000000').font('Helvetica');

      eleves.forEach((el, index) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 50;
        }

        doc.rect(50, currentY, 500, rowH).strokeColor('#eeeeee').lineWidth(0.5).stroke();
        doc.moveTo(50 + colNo, currentY).lineTo(50 + colNo, currentY + rowH).stroke();
        doc.moveTo(50 + colNo + colNom, currentY).lineTo(50 + colNo + colNom, currentY + rowH).stroke();

        doc.fontSize(9).text(String(index + 1), 55, currentY + 7);
        doc.text(`${el.nom.toUpperCase()} ${el.prenom}`, 85, currentY + 7, { width: colNom - 10, ellipsis: true });

        currentY += rowH;
      });

      doc.end();

      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }

  });
}

/**
 * Génère une liste d'élèves d'une classe en PDF (avec matricule, date de naissance, sexe)
 */
async function exportListeElevesPDF(eleves, options, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const { getDocTranslator } = require('./pdf/locales');
  const t = getDocTranslator(lang);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = drawAdminHeader(doc, cfg, 40);

      doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111')
        .text(t('liste_eleves_title'), 50, y, { width: 500, align: 'center' });
      const y2 = y + 22;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#444444')
        .text(options.classe || '', 50, y2, { width: 500, align: 'center' });
      const y3 = y2 + 16;
      if (options.annee) {
        doc.font('Helvetica').fontSize(9).fillColor('#666666')
          .text(`${t('annee')} : ${options.annee}`, 50, y3, { width: 500, align: 'center' });
      }

      const tableTop = y3 + 22;
      const colNo = 30, colMat = 90, colNom = 240, colNaissance = 90, colSexe = 50;
      const rowH = 20;

      const drawHeader = (top) => {
        doc.rect(50, top, 500, rowH).fill('#1a3c6e');
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text(t('col_num_short'), 50, top + 7, { width: colNo, align: 'center' });
        doc.text(t('liste_eleves_col_matricule'), 50 + colNo, top + 7, { width: colMat, align: 'center' });
        doc.text(t('col_name_fullname'), 50 + colNo + colMat, top + 7, { width: colNom, align: 'center' });
        doc.text(t('liste_eleves_col_naissance'), 50 + colNo + colMat + colNom, top + 7, { width: colNaissance, align: 'center' });
        doc.text(t('liste_eleves_col_sexe'), 50 + colNo + colMat + colNom + colNaissance, top + 7, { width: colSexe, align: 'center' });
        return top + rowH;
      };

      let currentY = drawHeader(tableTop);
      doc.fillColor('#000000').font('Helvetica');

      const total = eleves.length;
      eleves.forEach((el, index) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = drawHeader(50);
        }

        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(50, currentY, 500, rowH).fill('#f4f6fb');
        }
        doc.rect(50, currentY, 500, rowH).strokeColor('#dddddd').lineWidth(0.5).stroke();
        doc.moveTo(50 + colNo, currentY).lineTo(50 + colNo, currentY + rowH).stroke();
        doc.moveTo(50 + colNo + colMat, currentY).lineTo(50 + colNo + colMat, currentY + rowH).stroke();
        doc.moveTo(50 + colNo + colMat + colNom, currentY).lineTo(50 + colNo + colMat + colNom, currentY + rowH).stroke();
        doc.moveTo(50 + colNo + colMat + colNom + colNaissance, currentY).lineTo(50 + colNo + colMat + colNom + colNaissance, currentY + rowH).stroke();

        doc.fontSize(9).fillColor('#000000');
        doc.text(String(index + 1), 50, currentY + 6, { width: colNo, align: 'center' });
        doc.text(el.matricule || '—', 50 + colNo, currentY + 6, { width: colMat, align: 'center', ellipsis: true });
        doc.text(`${el.nom.toUpperCase()} ${el.prenom}`, 50 + colNo + colMat, currentY + 6, { width: colNom, align: 'left', ellipsis: true });
        doc.text(el.date_naissance || '—', 50 + colNo + colMat + colNom, currentY + 6, { width: colNaissance, align: 'center', ellipsis: true });
        doc.text(el.sexe || '—', 50 + colNo + colMat + colNom + colNaissance, currentY + 6, { width: colSexe, align: 'center', ellipsis: true });

        currentY += rowH;
      });

      if (total > 0) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333')
          .text(`${t('col_total')} : ${total}`, 50, currentY + 8);
      }

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, total }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Génère une liste des enseignants en PDF (avec téléphone, email, matière, statut)
 */
async function exportListeProfesseursPDF(enseignants, options, outputPath, lang = 'fr') {
  const cfg = loadConfig();
  const { getDocTranslator } = require('./pdf/locales');
  const t = getDocTranslator(lang);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = drawAdminHeader(doc, cfg, 40);

      doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111')
        .text(t('liste_enseignants_title'), 50, y, { width: 500, align: 'center' });
      const y2 = y + 22;
      if (options.annee) {
        doc.font('Helvetica').fontSize(9).fillColor('#666666')
          .text(`${t('annee')} : ${options.annee}`, 50, y2, { width: 500, align: 'center' });
      }

      const tableTop = y2 + 22;
      const colNo = 30, colNom = 240, colTel = 100;
      const rowH = 20;

      const drawHeader = (top) => {
        doc.rect(50, top, 500, rowH).fill('#1a3c6e');
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text(t('col_num_short'), 50, top + 7, { width: colNo, align: 'center' });
        doc.text(t('col_name_fullname'), 50 + colNo, top + 7, { width: colNom, align: 'center' });
        doc.text(t('liste_profs_col_phone'), 50 + colNo + colNom, top + 7, { width: colTel, align: 'center' });
        return top + rowH;
      };

      let currentY = drawHeader(tableTop);
      doc.fillColor('#000000').font('Helvetica');

      const total = enseignants.length;
      enseignants.forEach((el, index) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = drawHeader(50);
        }

        const isEven = index % 2 === 0;
        if (isEven) {
          doc.rect(50, currentY, 500, rowH).fill('#f4f6fb');
        }
        doc.rect(50, currentY, 500, rowH).strokeColor('#dddddd').lineWidth(0.5).stroke();
        doc.moveTo(50 + colNo, currentY).lineTo(50 + colNo, currentY + rowH).stroke();
        doc.moveTo(50 + colNo + colNom, currentY).lineTo(50 + colNo + colNom, currentY + rowH).stroke();

        doc.fontSize(9).fillColor('#000000');
        doc.text(String(index + 1), 50, currentY + 6, { width: colNo, align: 'center' });
        doc.text(`${(el.nom || '').toUpperCase()} ${el.prenom || ''}`, 50 + colNo, currentY + 6, { width: colNom, align: 'left', ellipsis: true });
        doc.text(el.telephone || '—', 50 + colNo + colNom, currentY + 6, { width: colTel, align: 'center', ellipsis: true });

        currentY += rowH;
      });

      if (total > 0) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#333333')
          .text(`${t('col_total')} : ${total}`, 50, currentY + 8);
      }

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, total }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Génère un bordereau d'émargement PDF (N°, Nom, Signature)
 */
async function generateBordereauEmargementPDF(eleves, options, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = drawAdminHeader(doc, cfg, 40);
      // Titre du document
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
           .text(options.title || 'BORDEREAU D\'ÉMARGEMENT', 50, y, { width: 500, align: 'center' });
        y += 20;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#444444')
           .text(`${options.classe}  |  ${options.trimestre}  |  ${options.labelAnnee || 'Année'} : ${options.annee}`, 50, y, { width: 500, align: 'center' });
        y += 25;

        // Tableau
        const tableTop = y;
        const colNo = 40, colNom = 300, colSig = 160;
        const rowH = 25; // Un peu plus haut pour la signature

        // En-tête tableau
        doc.rect(50, tableTop, 500, rowH).fill('#1a1e2c');
        doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text(options.colNo || 'N°', 55, tableTop + 8);
        doc.text(options.colName || 'NOMS ET PRÉNOMS', 95, tableTop + 8);
        doc.text(options.colSignature || 'SIGNATURE', 395, tableTop + 8, { width: colSig, align: 'center' });

        let currentY = tableTop + rowH;
        doc.fillColor('#000000').font('Helvetica');

        eleves.forEach((el, index) => {
          if (currentY > 730) {
            doc.addPage();
            currentY = 50;
            // Réafficher l'en-tête du tableau sur la nouvelle page
            doc.rect(50, currentY, 500, rowH).fill('#1a1e2c');
            doc.fontSize(9).fillColor('#ffffff').font('Helvetica-Bold');
            doc.text(options.colNo || 'N°', 55, currentY + 8);
            doc.text(options.colName || 'NOMS ET PRÉNOMS', 95, currentY + 8);
            doc.text(options.colSignature || 'SIGNATURE', 395, currentY + 8, { width: colSig, align: 'center' });
            currentY += rowH;
            doc.fillColor('#000000').font('Helvetica');
          }
          
          // Lignes et bordures
          doc.rect(50, currentY, 500, rowH).strokeColor('#cccccc').lineWidth(0.5).stroke();
          doc.moveTo(50 + colNo, currentY).lineTo(50 + colNo, currentY + rowH).stroke();
          doc.moveTo(50 + colNo + colNom, currentY).lineTo(50 + colNo + colNom, currentY + rowH).stroke();

          doc.fontSize(9).text(String(index + 1), 55, currentY + 8);
          doc.text(`${el.nom.toUpperCase()} ${el.prenom}`, 95, currentY + 8, { width: colNom - 10, ellipsis: true });
          
          currentY += rowH;
        });

        doc.end();

      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { 
  loadConfig,
  generateBordereauPDF, 
  generateBordereauAbsencesPDF,
  generateBordereauEmargementPDF,
  exportListeElevesPDF,
  exportListeProfesseursPDF,
  exportBulletinTrimestre,
  exportBulletinClassePDF,
  exportBulletinRecap,
  exportRecapClassePDF,
  exportExcel,
  exportExcelRentree,
  exportModeleAbsences,
  exportModeleNotes
};
