/**
 * utils/pdf/exportImpayes.js — Génération du PDF des impayés avec en-tête officiel
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const { loadConfig, drawAdminHeader } = require('./helpers');
const { get, all } = require('../../database/db');
const { getDocTranslator } = require('./locales');
const { majStatutsTransches } = require('../financeUtils');

/**
 * Génère un document PDF listant les impayés d'une classe ou de tout l'établissement
 * @param {string} outputPath Chemin de sortie du PDF
 * @param {Object} options Filtres (classeId, anneeId, fraisTypeId, numeroTranche)
 * @returns {Promise<Object>} Résultat de l'opération
 */
async function exportImpayesPDF(outputPath, options) {
  const { classeId, anneeId, fraisTypeId, numeroTranche, ecoleId = '', lang = 'fr' } = options;
  const cfg = loadConfig();
  const t = getDocTranslator(lang);

  return new Promise((resolve, reject) => {
    try {
      majStatutsTransches(ecoleId); // S'assurer que les retards sont à jour

      let sql = `
        SELECT e.id AS eleve_id, e.nom, e.prenom, c.nom_classe, e.telephone_parent,
               ft.nom AS nom_frais, t.numero_tranche, t.montant, t.date_echeance, t.statut
        FROM tranches t
        JOIN frais_types ft ON ft.id = t.frais_type_id
        JOIN eleves e ON e.id = t.eleve_id
        LEFT JOIN classes c ON c.id = e.classe_id
        WHERE t.statut IN ('en_attente', 'en_retard') AND t.annee_scolaire_id = ? AND t.ecole_id = ?
      `;
      const params = [anneeId, ecoleId];
      if (classeId) { sql += ' AND e.classe_id = ?'; params.push(classeId); }
      if (fraisTypeId) { sql += ' AND t.frais_type_id = ?'; params.push(fraisTypeId); }
      if (numeroTranche) { sql += ' AND t.numero_tranche = ?'; params.push(numeroTranche); }

      sql += ' ORDER BY c.nom_classe, e.nom, e.prenom, t.date_echeance';
      
      const impayesRaw = all(sql, params);

      // --- GROUPEMENT PAR ÉLÈVE ---
      const grouped = [];
      const map = new Map();

      impayesRaw.forEach(i => {
        if (!map.has(i.eleve_id)) {
          const student = {
            nom: i.nom,
            prenom: i.prenom,
            nom_classe: i.nom_classe,
            total: 0,
            types_frais: new Set(),
            statut: 'en_attente'
          };
          map.set(i.eleve_id, student);
          grouped.push(student);
        }
        const s = map.get(i.eleve_id);
        s.total += i.montant;
        s.types_frais.add(i.nom_frais);
        if (i.statut === 'en_retard') s.statut = 'en_retard';
      });
      
      let filterText = lang === 'en' ? 'All Classes' : "Toutes les classes";
      if (classeId) {
        const cRow = get('SELECT nom_classe FROM classes WHERE id = ?', [classeId]);
        if (cRow) filterText = cRow.nom_classe;
      }
      if (fraisTypeId) {
        const ftRow = get('SELECT nom FROM frais_types WHERE id = ?', [fraisTypeId]);
        if (ftRow) filterText += ` | ${ftRow.nom}`;
      }
      if (numeroTranche) filterText += ` | ${t('tranche')} ${numeroTranche}`;

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Helper pour formater proprement
      const locale = lang === 'en' ? 'en-US' : 'fr-FR';
      const fmt = (n) => n.toLocaleString(locale).replace(/\s/g, ' ');

      const y = drawAdminHeader(doc, cfg, 40, lang);
      // Titre
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
          .text(lang === 'en' ? 'UNPAID FEES REPORT' : 'ÉTAT DES IMPAYÉS', 40, y, { width: 515, align: 'center' });
      const y2 = y + 20;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#444444')
          .text(`${filterText}  |  ${t('date')} : ${new Date().toLocaleDateString(locale)}`, 40, y2, { width: 515, align: 'center' });
      const tableTop = y2 + 25;
        const colNom = 145, colClasse = 55, colFrais = 155, colMtn = 80, colStatut = 80;
        const rowH = 18;

        // En-tête tableau
        doc.rect(40, tableTop, 515, rowH).fill(cfg.couleur_primaire || '#1a1e2c');
        doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
        doc.text(t('name_firstname').toUpperCase(), 45, tableTop + 5);
        doc.text(t('class').toUpperCase(), 45 + colNom, tableTop + 5);
        doc.text(t('payment_detail').toUpperCase(), 45 + colNom + colClasse, tableTop + 5);
        doc.text(t('amount').toUpperCase(), 45 + colNom + colClasse + colFrais, tableTop + 5, { width: colMtn, align: 'right' });
        doc.text('STATUT', 45 + colNom + colClasse + colFrais + colMtn, tableTop + 5, { width: colStatut, align: 'center' });

        let currentY = tableTop + rowH;
        doc.fillColor('#000000').font('Helvetica');

        let totalGeneral = 0;

        grouped.forEach((i, index) => {
          if (currentY > 750) {
            doc.addPage();
            currentY = 50;
            // Réafficher l'en-tête sur la nouvelle page
            doc.rect(40, currentY, 515, rowH).fill(cfg.couleur_primaire || '#1a1e2c');
            doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold');
            doc.text(t('name_firstname').toUpperCase(), 45, currentY + 5);
            doc.text(t('class').toUpperCase(), 45 + colNom, currentY + 5);
            doc.text(t('payment_detail').toUpperCase(), 45 + colNom + colClasse, currentY + 5);
            doc.text(t('amount').toUpperCase(), 45 + colNom + colClasse + colFrais, currentY + 5, { width: colMtn, align: 'right' });
            doc.text('STATUT', 45 + colNom + colClasse + colFrais + colMtn, currentY + 5, { width: colStatut, align: 'center' });
            currentY += rowH;
            doc.fillColor('#000000').font('Helvetica');
          }

          const mtnStr = fmt(i.total);
          totalGeneral += i.total;

          // Fond alterné pour lisibilité
          if (index % 2 === 1) {
            doc.rect(40, currentY, 515, rowH).fill('#f9f9f9');
            doc.fillColor('#000000');
          }

          const listeFrais = Array.from(i.types_frais).join(', ');

          doc.fontSize(8);
          doc.text(`${i.nom.toUpperCase()} ${i.prenom}`, 45, currentY + 5, { width: colNom - 5, ellipsis: true });
          doc.text(i.nom_classe || '—', 45 + colNom, currentY + 5);
          doc.text(listeFrais, 45 + colNom + colClasse, currentY + 5, { width: colFrais - 5, ellipsis: true });
          doc.font('Helvetica-Bold').text(mtnStr, 45 + colNom + colClasse + colFrais, currentY + 5, { width: colMtn, align: 'right' });
          
          const isRetard = i.statut === 'en_retard';
          doc.fillColor(isRetard ? '#ff4757' : '#ffa502').font('Helvetica-Bold');
          doc.text(isRetard ? (lang === 'en' ? 'OVERDUE' : 'EN RETARD') : (lang === 'en' ? 'PENDING' : 'EN ATTENTE'), 45 + colNom + colClasse + colFrais + colMtn, currentY + 5, { width: colStatut, align: 'center' });
          doc.fillColor('#000000').font('Helvetica');

          currentY += rowH;
        });

        // Ligne de total
        doc.rect(40, currentY, 515, rowH + 4).fill('#eeeeee');
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9);
        doc.text(t('total_paid').toUpperCase() + ' ' + (lang === 'en' ? 'DUE' : 'DES IMPAYÉS'), 45, currentY + 7);
        doc.text(`${fmt(totalGeneral)} FCFA`, 40, currentY + 7, { width: 510, align: 'right' });

        doc.end();

      stream.on('finish', () => resolve({ success: true, path: outputPath, count: grouped.length }));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { exportImpayesPDF };
