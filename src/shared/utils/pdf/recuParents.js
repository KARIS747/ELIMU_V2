/**
 * shared/utils/pdf/recuParents.js - Génération PDF des fiches parents
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { getDocTranslator } = require('./locales');

async function genererFichesParentsPDF(parents, savePath, printLink, onProgress, lang = 'fr') {
  const t = getDocTranslator(lang);
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(savePath);
    doc.pipe(stream);

    doc.fontSize(16).text(t('parent_card_title'), { align: 'center' });
    doc.moveDown();

    parents.forEach((p, index) => {
      // Pour 2 parents par page (format simple)
      if (index > 0 && index % 2 === 0) doc.addPage();
      
      const y = (index % 2) * 350 + 100;
      doc.rect(50, y, 500, 300).stroke();
      doc.fontSize(12).text(`${t('parent_label')} : ${p.nom_parent || t('unnamed_parent')}`, 70, y + 20);
      doc.text(`${t('phone_label')} : ${p.telephone}`, 70, y + 40);
      doc.text(`${t('access_code_label')} : ${p.mot_de_passe_clair || t('generate_via_app')}`, 70, y + 60);
      doc.text(`${t('children_label')} :`, 70, y + 90);
      
      p.eleves.forEach((e, i) => {
        doc.text(`- ${e.prenom} ${e.nom} (${e.classe_nom})`, 90, y + 110 + (i * 20));
      });
      
      doc.text(`${t('portal_link_label')} : ${printLink}`, 70, y + 250);
      
      if (onProgress) onProgress(index + 1, parents.length);
    });

    doc.end();
    stream.on('finish', () => resolve({ success: true }));
    stream.on('error', reject);
  });
}

module.exports = { genererFichesParentsPDF };
