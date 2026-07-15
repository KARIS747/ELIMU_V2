/**
 * recuPDF.js — Génération des reçus de paiement PDF
 * VERSION PROFESSIONNELLE 2026 — Filigrane visible + Design amélioré
 * 
 * Améliorations :
 * • Filigrane plus visible (opacité augmentée + meilleur centrage)
 * • Logo configurable
 * • Métadonnées PDF complètes
 * • Design plus moderne et aéré
 * • Ligne de déchirure élégante
 * • Mention officielle en bas
 * • AUTO-SCALING : Ajustement de la taille pour tenir sur une seule page (2 exemplaires)
 */

'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const { get, all } = require('../database/db');
const { getDocTranslator } = require('./pdf/locales');

// ── Helpers ────────────────────────────────────────────────
function formatDate(str, lang = 'fr') {
  if (!str) return '—';
  try { return new Date(str).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR'); } catch { return str; }
}

function formatMontant(n, lang = 'fr') {
  if (n === null || n === undefined) return '0 FCFA';
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  return n.toLocaleString(locale).replace(/\s/g, ' ') + ' FCFA';
}

function loadBulletinConfig() {
  const rows = all('SELECT cle, valeur FROM bulletin_config');
  const cfg = {};
  rows.forEach(r => (cfg[r.cle] = r.valeur));
  return cfg;
}

/**
 * Estime la hauteur d'un bloc de reçu pour calculer le facteur d'échelle
 */
function estimerHauteurBloc(paiement, tranches, restes) {
  let h = 22 + 14 + 12 + 26 + 26 + 11 + 18; // Base header
  h += (tranches.length === 0 ? 20 : tranches.length * 18); // Table content
  h += 26; // Total row
  if (restes && restes.length > 0) {
    h += 12 + (Math.ceil(restes.length / 2) * 12) + 6;
  }
  h += 13; // Mode
  if (paiement.reference) h += 13;
  h += 18; // Caissier
  h += 58; // Signatures
  h += 20; // Mention
  return h + 20; // Marge finale
}

// ── Dessiner un bloc de reçu (réutilisable avec échelle) ──
function dessinerBloc(doc, paiement, tranches, cfg, estPartieParent, startY, pageWidth, leftMargin, restes, lang = 'fr', scale = 1.0) {
  const t = getDocTranslator(lang);
  let y = startY;
  const rightMargin = leftMargin + pageWidth;
  const col = { frais: 172, tranche: 48, echeance: 82, montant: 88 };

  // Helper pour appliquer le scale sur les tailles
  const s = (val) => val * scale;
  const f = (size) => Math.max(5, size * scale); // Font size minimum 5

  // Titre
  doc.font('Helvetica-Bold').fontSize(f(15)).fillColor('#111')
     .text(t('receipt_title'), leftMargin, y, { width: pageWidth, align: 'center' });
  y += s(22);

  // Numéro et Date
  doc.font('Helvetica-Bold').fontSize(f(9.5)).fillColor(cfg.couleur_primaire || '#1a3c6e')
     .text(`N° ${paiement.recu_numero || `P-${paiement.id}`}`, leftMargin, y);
  doc.font('Helvetica').fontSize(f(9.5)).fillColor('#333')
     .text(`${t('date')} : ${formatDate(paiement.date, lang)}`, leftMargin, y, { align: 'right', width: pageWidth });
  y += s(14);

  doc.moveTo(leftMargin, y).lineTo(rightMargin, y).strokeColor('#ddd').lineWidth(1).stroke();
  y += s(12);

  // Infos élève et parent
  const half = pageWidth / 2;
  doc.font('Helvetica-Bold').fontSize(f(7.5)).fillColor('#777')
     .text(t('student').toUpperCase(), leftMargin, y);
  doc.font('Helvetica').fontSize(f(10)).fillColor('#111')
     .text(`${paiement.prenom} ${paiement.nom}`, leftMargin, y + s(9));

  doc.font('Helvetica-Bold').fontSize(f(7.5)).fillColor('#777')
     .text(t('class').toUpperCase(), leftMargin + half, y);
  doc.font('Helvetica').fontSize(f(10)).fillColor('#111')
     .text(paiement.nom_classe || (lang === 'en' ? 'Not assigned' : 'Non affecté'), leftMargin + half, y + s(9));
  y += s(26);

  doc.font('Helvetica-Bold').fontSize(f(7.5)).fillColor('#777')
     .text(lang === 'en' ? 'PARENT / GUARDIAN' : 'PARENT / TUTEUR', leftMargin, y);
  doc.font('Helvetica').fontSize(f(10)).fillColor('#111')
     .text(paiement.nom_parent || '—', leftMargin, y + s(9));
  doc.font('Helvetica-Bold').fontSize(f(7.5)).fillColor('#777')
     .text(lang === 'en' ? 'PHONE' : 'TÉLÉPHONE', leftMargin + half, y);
  doc.font('Helvetica').fontSize(f(10)).fillColor('#111')
     .text(paiement.telephone_parent || '—', leftMargin + half, y + s(9));
  y += s(26);

  // Détail du paiement
  doc.font('Helvetica-Bold').fontSize(f(9.5)).fillColor('#111')
     .text(t('payment_detail').toUpperCase(), leftMargin, y);
  y += s(11);

  // En-tête tableau
  const headerY = y;
  doc.rect(leftMargin, headerY, pageWidth, s(18)).fillAndStroke(cfg.couleur_primaire || '#1a3c6e', '#fff');
  doc.font('Helvetica-Bold').fontSize(f(7.5)).fillColor('#fff');
  doc.text(lang === 'en' ? 'Fee Type' : 'Type de frais', leftMargin + 5, headerY + s(5), { width: col.frais });
  doc.text(t('tranche'), leftMargin + col.frais + 5, headerY + s(5), { width: col.tranche, align: 'center' });
  doc.text(lang === 'en' ? 'Due Date' : 'Échéance', leftMargin + col.frais + col.tranche + 5, headerY + s(5), { width: col.echeance });
  doc.text(t('amount'), leftMargin + col.frais + col.tranche + col.echeance + 5, headerY + s(5), { width: col.montant, align: 'right' });
  y += s(18);

  // Contenu tableau
  if (tranches.length === 0) {
    doc.rect(leftMargin, y, pageWidth, s(20)).fill('#ffffff').stroke('#e9ecef');
    doc.font('Helvetica').fontSize(f(8.5)).fillColor('#444')
       .text(lang === 'en' ? 'Global payment' : 'Paiement global', leftMargin + 5, y + s(6), { width: col.frais });
    doc.text('—', leftMargin + col.frais + 5, y + s(6), { width: col.tranche, align: 'center' });
    doc.text('—', leftMargin + col.frais + col.tranche + 5, y + s(6), { width: col.echeance });
    doc.font('Helvetica-Bold').fontSize(f(9)).fillColor('#111')
       .text(formatMontant(paiement.montant, lang), leftMargin + col.frais + col.tranche + col.echeance + 5, y + s(5), { width: col.montant, align: 'right' });
    y += s(20);
  } else {
    tranches.forEach((t, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
      doc.rect(leftMargin, y, pageWidth, s(18)).fill(bg).stroke('#e9ecef');
      doc.font('Helvetica').fontSize(f(8.5)).fillColor('#333')
         .text(t.nom_frais, leftMargin + 5, y + s(5), { width: col.frais, ellipsis: true });
      doc.text(`T${t.numero_tranche}`, leftMargin + col.frais + 5, y + s(5), { width: col.tranche, align: 'center' });
      doc.text(formatDate(t.date_echeance, lang), leftMargin + col.frais + col.tranche + 5, y + s(5), { width: col.echeance });
      doc.font('Helvetica-Bold').fontSize(f(9)).fillColor('#111')
         .text(formatMontant(t.montant_applique, lang), leftMargin + col.frais + col.tranche + col.echeance + 5, y + s(5), { width: col.montant, align: 'right' });
      y += s(18);
    });
  }

  // Total
  doc.rect(leftMargin, y, pageWidth, s(22)).fill('#f0f4f8').stroke(cfg.couleur_primaire || '#1a3c6e');
  doc.font('Helvetica-Bold').fontSize(f(10)).fillColor('#111')
     .text(t('total_paid'), leftMargin + 5, y + s(7));
  doc.font('Helvetica-Bold').fontSize(f(13)).fillColor(cfg.couleur_primaire || '#1a3c6e')
     .text(formatMontant(paiement.montant, lang), leftMargin + col.frais + col.tranche + col.echeance + 5, y + s(6), { width: col.montant, align: 'right' });
  y += s(26);

  // --- RESTE À PAYER ---
  if (restes && restes.length > 0) {
    doc.font('Helvetica-Bold').fontSize(f(8.5)).fillColor('#555')
       .text(t('balance_due'), leftMargin, y);
    y += s(12);

    const itemsPerRow = 2;
    const itemW = (pageWidth - 20) / itemsPerRow;
    
    restes.forEach((r, idx) => {
      const colIdx = idx % itemsPerRow;
      const rowIdx = Math.floor(idx / itemsPerRow);
      const itemX = leftMargin + (colIdx * (itemW + 20));
      const itemY = y + (rowIdx * s(12));

      doc.font('Helvetica').fontSize(f(8)).fillColor('#444')
         .text(`${r.nom_frais} :`, itemX, itemY);
      doc.font('Helvetica-Bold').fontSize(f(8)).fillColor('#d32f2f')
         .text(formatMontant(r.total_reste, lang), itemX + s(85), itemY, { width: itemW - s(85), align: 'right' });
    });
    
    y += (Math.ceil(restes.length / itemsPerRow) * s(12)) + s(6);
  }

  // Mode, référence et caissier
  const modeLabels = {
    especes: lang === 'en' ? 'Cash' : 'Espèces',
    cheque: lang === 'en' ? 'Check' : 'Chèque',
    virement: lang === 'en' ? 'Bank Transfer' : 'Virement bancaire',
    mobile_money: 'Mobile Money',
    autre: lang === 'en' ? 'Other' : 'Autre'
  };

  doc.font('Helvetica-Bold').fontSize(f(8.5)).fillColor('#555')
     .text(t('payment_mode') + ' :', leftMargin, y);
  doc.font('Helvetica').fontSize(f(8.5)).fillColor('#111')
     .text(modeLabels[paiement.mode] || paiement.mode || '—', leftMargin + s(115), y);
  y += s(13);

  if (paiement.reference) {
    doc.font('Helvetica-Bold').fontSize(f(8.5)).fillColor('#555')
       .text(t('reference') + ' :', leftMargin, y);
    doc.font('Helvetica').fontSize(f(8.5)).fillColor('#111')
       .text(paiement.reference, leftMargin + s(75), y);
    y += s(13);
  }

  doc.font('Helvetica-Bold').fontSize(f(8.5)).fillColor('#555')
     .text(t('received_by') + ' :', leftMargin, y);
  doc.font('Helvetica').fontSize(f(8.5)).fillColor('#111')
     .text(paiement.nom_caissier || '—', leftMargin + s(72), y);
  y += s(18);

  // Signatures
  const sigW = (pageWidth - 30) / 2;
  const sigH = s(52);
  const titreDir = cfg.directeur_titre || (lang === 'en' ? 'The Principal' : 'Le Directeur');
  const nomDir = cfg.directeur_nom || '';

  doc.rect(leftMargin, y, sigW, sigH).stroke('#ddd');
  doc.font('Helvetica-Bold').fontSize(f(8)).fillColor('#444')
     .text(titreDir, leftMargin, y + s(8), { width: sigW, align: 'center' });
  if (nomDir) {
    doc.font('Helvetica').fontSize(f(7.5)).fillColor('#333')
       .text(nomDir, leftMargin, y + s(20), { width: sigW, align: 'center' });
  }
  doc.font('Helvetica').fontSize(f(6.5)).fillColor('#aaa')
     .text(t('seal_and_signature'), leftMargin, y + s(38), { width: sigW, align: 'center' });

  const sig2X = leftMargin + sigW + 30;
  doc.rect(sig2X, y, sigW, sigH).stroke('#ddd');
  if (estPartieParent) {
    doc.font('Helvetica-Bold').fontSize(f(8)).fillColor('#444')
       .text(lang === 'en' ? 'The Parent / Guardian' : 'Le Parent / Tuteur', sig2X, y + s(8), { width: sigW, align: 'center' });
    doc.font('Helvetica').fontSize(f(6.5)).fillColor('#aaa')
       .text('(Signature)', sig2X, y + s(38), { width: sigW, align: 'center' });
  } else {
    doc.font('Helvetica-Bold').fontSize(f(8)).fillColor('#444')
       .text(lang === 'en' ? 'The Institution' : 'L’Établissement', sig2X, y + s(8), { width: sigW, align: 'center' });
    doc.font('Helvetica').fontSize(f(6.5)).fillColor('#aaa')
       .text(lang === 'en' ? '(Internal Copy)' : '(À conserver)', sig2X, y + s(38), { width: sigW, align: 'center' });
  }
  y += sigH + s(6);

  // Mention officielle
  doc.font('Helvetica-Oblique').fontSize(f(7.5)).fillColor('#666')
     .text(t('official_receipt_mention'), 
           leftMargin, y, { width: pageWidth, align: 'center' });

  return y + s(20);
}

// ── Fonction principale ──────────────────────────────────
function genererRecuPDF(paiementId, outputPath, lang = 'fr') {
  const paiement = get(`
    SELECT p.*, e.nom, e.prenom, e.nom_parent, e.telephone_parent,
           c.nom_classe, u.nom_complet AS nom_caissier
    FROM paiements p
    JOIN eleves e ON e.id = p.eleve_id
    LEFT JOIN classes c ON c.id = e.classe_id
    LEFT JOIN utilisateurs u ON u.id = p.utilisateur_id
    WHERE p.id = ?
  `, [paiementId]);

  if (!paiement) return { success: false, error: 'Paiement introuvable' };

  const tranches = all(`
    SELECT t.numero_tranche, t.date_echeance, t.montant AS montant_tranche,
           pt.montant_applique, ft.nom AS nom_frais
    FROM paiement_tranches pt
    JOIN tranches t ON t.id = pt.tranche_id
    JOIN frais_types ft ON ft.id = t.frais_type_id
    WHERE pt.paiement_id = ?
    ORDER BY ft.nom, t.numero_tranche
  `, [paiementId]);

  // --- CALCUL DES RESTES À PAYER ---
  const restes = all(`
    SELECT ft.nom AS nom_frais, SUM(t.montant) AS total_reste
    FROM tranches t
    JOIN frais_types ft ON ft.id = t.frais_type_id
    WHERE t.eleve_id = ? AND t.statut IN ('en_attente', 'en_retard')
    GROUP BY ft.nom
    HAVING total_reste > 0
    ORDER BY ft.nom
  `, [paiement.eleve_id]);

  const cfg = loadBulletinConfig();
  const t = getDocTranslator(lang);
  const params = {};
  try {
    const pRows = all('SELECT cle, valeur FROM parametres');
    pRows.forEach(r => (params[r.cle] = r.valeur));
  } catch (e) {}

  const nomEtab = (lang === 'en' ? (cfg.etab_nom_en || cfg.etab_nom) : cfg.etab_nom) || 'Établissement';
  const filigraneTexte = cfg.filigrane_texte || params.abreviation_etab || nomEtab;
  const anneeScolaire = cfg.annee_scolaire || '2025-2026';
  const logoData = cfg.etab_logo || null;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 20,
        size: 'A4',
        info: {
          Title: `Reçu de paiement N° ${paiement.recu_numero || `P-${paiement.id}`}`,
          Author: nomEtab,
          Subject: 'Reçu de scolarité - Paiement officiel',
          Keywords: 'reçu, paiement, scolarité',
          CreationDate: new Date()
        }
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const LEFT = 32;
      const RIGHT = 578;
      const pageWidth = RIGHT - LEFT;
      let y = 28;

      // ── ESTIMATION ET SCALE ───────────────────────────────────────
      const hBloc = estimerHauteurBloc(paiement, tranches, restes);
      // On a ~180 points de header/tearline fixes. (841 - 180) / 2 = 330 points max par bloc.
      let scale = 1.0;
      if (hBloc > 330) {
        scale = 330 / hBloc;
      }
      scale = Math.max(0.65, scale); // Sécurité lisibilité

      // ── FILIGRANE ──────────────────────────────────────────────────
      doc.save();
      doc.opacity(0.19);
      doc.fillColor('#a8a8a8');
      doc.font('Helvetica-Bold').fontSize(72);

      const centerX = doc.page.width / 2;
      const centerY = doc.page.height / 2 - 10;

      doc.rotate(45, { origin: [centerX, centerY] });
      doc.text(filigraneTexte.toUpperCase(), centerX - 340, centerY - 50, {
        width: 700,
        align: 'center',
        lineBreak: false
      });
      doc.restore();

      // ── En-tête avec logo ─────────────────────────────────────────
      if (logoData) {
        try {
          const imgBuf = Buffer.from(logoData.split(',')[1], 'base64');
          doc.image(imgBuf, LEFT, y, { width: 50 });
          doc.font('Helvetica-Bold').fontSize(16).fillColor(cfg.couleur_primaire || '#1a3c6e')
             .text(nomEtab.toUpperCase(), LEFT + 60, y + 15, { width: pageWidth - 60, align: 'left' });
          y += 65;
        } catch(e) { y += 50; }
      } else {
        doc.font('Helvetica-Bold').fontSize(18).fillColor(cfg.couleur_primaire || '#1a3c6e')
           .text(nomEtab.toUpperCase(), LEFT, y + 10, { width: pageWidth, align: 'center' });
        y += 50;
      }

      // Année scolaire
      doc.font('Helvetica').fontSize(9.8).fillColor('#444')
         .text(`${t('school_year')} : ${anneeScolaire}`, LEFT, y, { width: pageWidth, align: 'center' });
      y += 24;

      // ── Partie Établissement ──────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(cfg.couleur_primaire || '#1a3c6e')
         .text(t('part_school'), LEFT, y, { width: pageWidth, align: 'center' });
      y += 18;
      y = dessinerBloc(doc, paiement, tranches, cfg, false, y, pageWidth, LEFT, restes, lang, scale);

      // Ligne de déchirure
      const tearY = y - 12;
      doc.moveTo(LEFT, tearY).lineTo(RIGHT, tearY).strokeColor('#999').lineWidth(1.3).dash(4, { space: 3 }).stroke();
      doc.undash();
      for (let i = 0; i <= 9; i++) {
        doc.circle(LEFT + i * (pageWidth / 9), tearY, 1.2).fill('#999');
      }
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#777')
         .text(t('tear_here'), LEFT + pageWidth / 2 - 45, tearY - 15);
      y = tearY + 28;

      // ── Partie Parent ─────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(cfg.couleur_primaire || '#1a3c6e')
         .text(t('part_parent'), LEFT, y, { width: pageWidth, align: 'center' });
      y += 18;
      y = dessinerBloc(doc, paiement, tranches, cfg, true, y, pageWidth, LEFT, restes, lang, scale);

      doc.end();

      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { genererRecuPDF };
