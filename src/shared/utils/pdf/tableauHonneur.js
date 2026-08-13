/**
 * pdf/tableauHonneur.js — Diplômes « Tableau d'honneur »
 *
 * Génère un PDF A4 paysage contenant UN diplôme décoratif par élève honoré.
 * Reprend l'en-tête officiel (drawAdminHeader) et le filigrane du logo
 * (drawLogoFiligrane) identiques aux bulletins.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const { get, all } = require('../../database/db');
const { getUAsForPeriode, getNoteToCode } = require('../../constants/curriculum');
const {
  loadConfig,
  getMention,
  ordinalLang,
  calcMoyMatiere,
  drawAdminHeader,
  drawLogoFiligrane
} = require('./helpers');
const { computeClassStatsQualitatif } = require('./bulletinTrimestre');
const { getDocTranslator } = require('./locales');

const MEDAILLES = {
  or:      { key: 'or',      label: '1',  couleur: '#D4AF37', fond: '#F6E27A', ombre: '#9C7A1C' },
  argent:  { key: 'argent',  label: '2',  couleur: '#C0C0C0', fond: '#E8E8E8', ombre: '#8A8A8A' },
  bronze:  { key: 'bronze',  label: '3',  couleur: '#CD7F32', fond: '#E6A964', ombre: '#8C5314' }
};

// ============================================================
// CALCUL DES MOYENNES
// ============================================================

/**
 * Calcule la moyenne générale /20 de chaque élève d'une classe N3
 * (même formule pondérée que le bulletin trimestriel).
 */
function computeClassStatsN3(classeId, periode) {
  const cfg = loadConfig();
  const poids1 = parseFloat(cfg.calc_poids_seq1 || 50) / 100;
  const poids2 = parseFloat(cfg.calc_poids_seq2 || 50) / 100;

  const rows = all(`
    SELECT e.id,
      SUM(
        CASE
          WHEN s1 IS NOT NULL AND s2 IS NOT NULL THEN (s1 * ? + s2 * ?) * coef
          WHEN s1 IS NOT NULL                    THEN s1 * coef
          WHEN s2 IS NOT NULL                    THEN s2 * coef
          ELSE NULL
        END
      ) / NULLIF(
        SUM(CASE WHEN s1 IS NOT NULL OR s2 IS NOT NULL THEN coef ELSE 0 END),
        0
      ) AS moy_pond
    FROM eleves e
    JOIN (
      SELECT n.eleve_id, n.matiere_id, m.coefficient AS coef,
        MAX(CASE WHEN n.sequence = 1 THEN n.note ELSE NULL END) AS s1,
        MAX(CASE WHEN n.sequence = 2 THEN n.note ELSE NULL END) AS s2
      FROM notes n
      JOIN matieres m ON m.id = n.matiere_id
      WHERE n.periode = ?
      GROUP BY n.eleve_id, n.matiere_id
    ) n ON n.eleve_id = e.id
    WHERE e.classe_id = ?
    GROUP BY e.id
  `, [poids1, poids2, periode, classeId]);

  const stats = rows
    .map(r => ({ id: Number(r.id), moy: r.moy_pond !== null ? Math.round(r.moy_pond * 100) / 100 : null }))
    .filter(s => s.moy !== null)
    .sort((a, b) => b.moy - a.moy);

  return { sorted: stats };
}

// ============================================================
// PRÉPARATION DES DONNÉES
// ============================================================

/**
 * Détermine si un élève est honoré selon les critères configurés.
 * @param {{rang:number, moy:number}} st
 * @param {{regle:string, rang_max:number, seuil:number}} criteres
 */
function estHonore(st, criteres) {
  const rangMax = parseInt(criteres.rang_max, 10) || 5;
  const seuil   = parseFloat(criteres.seuil) || 12;
  const regle   = criteres.regle || 'et';
  const rangOK  = st.rang <= rangMax;
  const moyOK   = st.moy >= seuil;

  if (regle === 'rang')    return rangOK;
  if (regle === 'moyenne') return moyOK;
  if (regle === 'ou')      return rangOK || moyOK;
  return rangOK && moyOK; // 'et'
}

/**
 * Appréciation de l'élève :
 *  - N1/N2 : code qualitatif NA / ECA / A / A+ (getNoteToCode)
 *  - N3    : mention (getMention) selon la config bulletin
 */
const COULEURS_CODE = {
  'NA':  '#f5222d',
  'ECA': '#fa8c16',
  'A':   '#52c41a',
  'A+':  '#00a854'
};

function getAppreciation(entry, lvl, cfg, lang) {
  if (lvl === 'N1' || lvl === 'N2') {
    const code = getNoteToCode(entry.moy);
    const labels = lang === 'en'
      ? { 'NA': 'Not Acquired', 'ECA': 'Acquisition in Progress', 'A': 'Acquired', 'A+': 'Expert' }
      : { 'NA': 'Non Acquis', 'ECA': "En Cours d'Acquisition", 'A': 'Acquis', 'A+': 'Expert' };
    return { code, label: labels[code] || code, couleur: COULEURS_CODE[code] || '#333' };
  }
  const label = getMention(entry.moy, cfg);
  return { code: label, label, couleur: couleurMention(entry.moy, cfg) };
}

function couleurMention(note, cfg) {
  try {
    const mentions = JSON.parse(cfg.mentions_config || '[]');
    if (Array.isArray(mentions)) {
      const m = mentions.find(m => note >= m.min && note <= m.max);
      if (m && m.couleur) return m.couleur;
    }
  } catch (e) { /* config invalide → fallback */ }
  return note >= 14 ? '#00a854' : note >= 10 ? '#fa8c16' : '#f5222d';
}

/**
 * Prépare la liste des diplômés du tableau d'honneur pour une classe.
 * @param {number} classeId
 * @param {string} periode   — 'Trimestre 1' | 'Trimestre 2' | 'Trimestre 3'
 * @param {{regle:string, rang_max:number, seuil:number}} criteres
 * @param {number|null} anneeId
 */
function prepareDiplomes(classeId, periode, criteres, anneeId = null) {
  const cfg = loadConfig();
  const classe = get('SELECT nom_classe, niveau_v2 FROM classes WHERE id = ?', [classeId]);
  if (!classe) return { error: 'Classe non trouvée' };
  const lvl = classe.niveau_v2;

  const anneeLib = anneeId
    ? (get('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]))?.libelle || ''
    : (cfg.annee_scolaire || '');

  const eleves = all(
    'SELECT id, nom, prenom FROM eleves WHERE classe_id = ? ORDER BY nom, prenom',
    [classeId]
  );
  if (!eleves.length) return { error: 'Aucun élève dans cette classe' };

  let sorted;
  if (lvl === 'N1' || lvl === 'N2') {
    const lesUA = getUAsForPeriode(periode);
    if (!lesUA.length) return { error: 'Aucune unité d\'apprentissage pour la période sélectionnée' };
    const eid = anneeId || (get('SELECT annee_scolaire_id FROM eleves WHERE classe_id = ? LIMIT 1', [classeId]))?.annee_scolaire_id || null;
    sorted = computeClassStatsQualitatif(classeId, eid, lvl, lesUA).sorted;
  } else {
    sorted = computeClassStatsN3(classeId, periode).sorted;
  }

  if (!sorted.length) return { error: 'Aucune moyenne trouvée pour cette période' };

  const byId = new Map(eleves.map(e => [Number(e.id), e]));
  const stats = [];
  for (let i = 0; i < sorted.length; i++) {
    const id  = Number(sorted[i].id);
    const el  = byId.get(id);
    if (!el) continue;
    const moy = sorted[i].moy;
    stats.push({ id, nom: el.nom, prenom: el.prenom, moy, rang: i + 1 });
  }

  const honores = stats
    .map(st => ({ ...st, honore: estHonore(st, criteres) }))
    .filter(st => st.honore)
    .map(st => {
      const appr = getAppreciation(st, lvl, cfg, 'fr');
      return {
        id: st.id,
        nom: st.nom,
        prenom: st.prenom,
        moy: st.moy,
        rang: st.rang,
        medaille: MEDAILLES[st.rang === 1 ? 'or' : st.rang === 2 ? 'argent' : st.rang === 3 ? 'bronze' : null] || null,
        appreciation: appr.label,
        appreciationCode: appr.code,
        appreciationCouleur: appr.couleur
      };
    });

  return {
    success: honores.length > 0,
    honores,
    total: stats.length,
    classe: classe.nom_classe,
    niveau: lvl,
    periode,
    annee: anneeLib,
    criteres: {
      regle: criteres.regle || 'et',
      rang_max: parseInt(criteres.rang_max, 10) || 5,
      seuil: parseFloat(criteres.seuil) || 12
    },
    cfg
  };
}

/**
 * Dessine un paragraphe centré composé de segments aux styles différents
 * (couleur/police) sans recourir aux fragments ni au mode `continued` de
 * PDFKit (qui casse le centrage et superpose les mots). Fait le wrapping
 * manuellement et centre chaque ligne.
 *
 * @param {PDFDocument} doc
 * @param {Array<{text:string, font?:string, color?:string, size?:number, bold?:boolean}>} segments
 * @param {number} x       — bord gauche de la zone
 * @param {number} y       — haut de la zone
 * @param {number} width   — largeur de la zone
 * @param {number} lineGap — espace inter-lignes
 * @returns {number} hauteur totale occupée
 */
function textSegmentsCentered(doc, segments, x, y, width, lineGap = 4) {
  const fontOblique = 'Helvetica-Oblique';
  const size = 12.5;

  const words = [];
  segments.forEach((seg, idx) => {
    const font = seg.bold ? 'Helvetica-Bold' : (seg.font || fontOblique);
    const color = seg.color || '#333';
    if (idx > 0) words.push({ text: ' ', font, color, size, espace: true });
    (seg.text.match(/\S+/g) || []).forEach((mot, i) => {
      if (i > 0) words.push({ text: ' ', font, color, size, espace: true });
      words.push({ text: mot, font, color, size, espace: false });
    });
  });

  const lignes = [];
  let ligne = [];
  let largeur = 0;
  words.forEach(mot => {
    doc.font(mot.font).fontSize(mot.size);
    const l = doc.widthOfString(mot.text);
    if (ligne.length && largeur + l > width) {
      if (ligne[ligne.length - 1].espace) { ligne.pop(); }
      lignes.push(ligne);
      ligne = []; largeur = 0;
    }
    if (mot.espace && !ligne.length) return;
    ligne.push(mot); largeur += l;
  });
  if (ligne[ligne.length - 1] && ligne[ligne.length - 1].espace) { ligne.pop(); }
  if (ligne.length) lignes.push(ligne);

  let ly = y;
  lignes.forEach(l => {
    let lw = 0;
    l.forEach(mot => { doc.font(mot.font).fontSize(mot.size); lw += doc.widthOfString(mot.text); });
    let cx = x + (width - lw) / 2;
    l.forEach(mot => {
      doc.font(mot.font).fontSize(mot.size).fillColor(mot.color).text(mot.text, cx, ly);
      doc.font(mot.font).fontSize(mot.size);
      cx += doc.widthOfString(mot.text);
    });
    ly += size + lineGap;
  });

  return lignes.length * (size + lineGap) - lineGap;
}

// ============================================================
// DESSIN DU DIPLÔME
// ============================================================

/**
 * Dessine un diplôme sur la page courante (A4 paysage).
 */
function drawDiplome(doc, data, honore, lang = 'fr') {
  const t = getDocTranslator(lang);
  const cfg = data.cfg;
  const coulPrimaire  = cfg.couleur_primaire   || '#1a3c6e';
  const coulSecondaire = cfg.couleur_secondaire || '#c8a415';
  const nomDir  = cfg.directeur_nom || (lang === 'en' ? 'The Principal' : 'Le Directeur');
  const titreDir = cfg.directeur_titre || (lang === 'en' ? 'The Principal' : 'Le Directeur');

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const LEFT  = 36;
  const W     = pageW - 2 * LEFT;

  // ── Cadre décoratif double ────────────────────────────────
  doc.lineWidth(2.5).strokeColor(coulPrimaire)
    .rect(LEFT - 12, 16, W + 24, pageH - 32).stroke();
  doc.lineWidth(1).strokeColor(coulSecondaire)
    .rect(LEFT - 8, 20, W + 16, pageH - 40).stroke();

  // ── En-tête officiel (logo + ministère) ───────────────────
  let y = drawAdminHeader(doc, cfg, 40, lang, true);
  y += 8;

  // ── Bandeau titre ─────────────────────────────────────────
  const bandeauW = W * 0.72;
  const bandeauX = pageW / 2 - bandeauW / 2;
  const bandeauH = 34;
  doc.save().roundedRect(bandeauX, y, bandeauW, bandeauH, 6)
    .fill(coulPrimaire).strokeColor(coulSecondaire).lineWidth(2).stroke().restore();

  // Losanges décoratifs de part et d'autre du titre
  const pyrH = 14, pyrW = 10;
  const pyrBaseY = y + (bandeauH - pyrH) / 2;
  [bandeauX - pyrW - 6, bandeauX + bandeauW + 6].forEach(cx => {
    doc.save()
      .translate(cx + pyrW / 2, pyrBaseY + pyrH / 2)
      .rotate(45)
      .rect(-pyrW / 2, -pyrW / 2, pyrW, pyrW)
      .fill(coulSecondaire)
      .restore();
  });

  const titre = t('honor_title');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(19)
    .text(titre, bandeauX, y + 7, { width: bandeauW, align: 'center' });
  y += bandeauH + 10;

  // ── Sous-titre « Certificat de mérite » ───────────────────
  doc.fillColor(coulSecondaire).font('Helvetica-Oblique').fontSize(12.5)
    .text(t('honor_cert_title'), LEFT, y, { width: W, align: 'center' });
  y += 20;

  // ── Médaille (or / argent / bronze) ───────────────────────
  if (honore.medaille) {
    const m = honore.medaille;
    const cx = pageW / 2;
    const cy = y + 26;
    const r  = 24;
    // Ruban
    doc.save()
      .translate(cx, cy - r)
      .rotate(-28).rect(-16, 0, 12, 26).fill(m.couleur)
      .rotate(56).rect(-6, 0, 12, 26).fill(m.couleur)
      .restore();
    // Disque
    doc.save().circle(cx, cy, r).fill(m.ombre).restore();
    doc.save().circle(cx - 2, cy - 2, r - 3).fill(m.fond).restore();
    doc.save().circle(cx - 2, cy - 2, r - 3).strokeColor(m.couleur).lineWidth(2.5).stroke().restore();
    doc.fillColor('#4a3407').font('Helvetica-Bold').fontSize(20)
      .text(m.label, cx - 22, cy - 13, { width: 44, align: 'center' });
    y += 62;
  } else {
    y += 34;
  }

  // ── « Décerné à » ─────────────────────────────────────────
  doc.fillColor('#666').font('Helvetica-Oblique').fontSize(12)
    .text(t('honor_awarded_to'), LEFT, y, { width: W, align: 'center' });
  y += 16;

  // ── Nom de l'élève (très grand) ───────────────────────────
  const nomComplet = `${(honore.nom || '').toUpperCase()} ${honore.prenom || ''}`.trim();
  doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(30)
    .text(nomComplet, LEFT, y, { width: W, align: 'center' });
  y += 40;
  doc.moveTo(pageW / 2 - 140, y).lineTo(pageW / 2 + 140, y)
    .strokeColor(coulSecondaire).lineWidth(1.2).stroke();
  y += 14;

  // ── Phrase officielle (appréciation colorée) ──────────────
  const moyFmt = honore.moy.toFixed(2);
  const rangFmt = ordinalLang(honore.rang, lang);
  const periodeFmt = lang === 'en'
    ? `${data.periode.replace('Trimestre', 'Term')}`
    : data.periode;

  const phraseTpl = t('honor_phrase');
  const [avantTpl, apresTpl] = phraseTpl.split('{appr}');
  const remplir = s => s
    .replace('{moy}', moyFmt)
    .replace('{rang}', rangFmt)
    .replace('{classe}', data.classe)
    .replace('{periode}', periodeFmt)
    .replace('{annee}', data.annee || '—');

  y += textSegmentsCentered(doc, [
    { text: remplir(avantTpl) },
    { text: honore.appreciation, bold: true, color: honore.appreciationCouleur || '#333' },
    { text: remplir(apresTpl) }
  ], LEFT, y, W, 4) + 14;

  // ── Filigrane logo (à l'emplacement de l'ancien encadré critères) ──
  drawLogoFiligrane(doc, cfg, { maxSize: 160, opacity: 0.5, centerY: y + 26 });

  // ── Signatures ────────────────────────────────────────────
  const sigY = pageH - 118;
  const colSigW = W / 2;

  doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
    .text(titreDir, LEFT + colSigW - 140, sigY, { width: 280, align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#555')
    .text(nomDir, LEFT + colSigW - 140, sigY + 16, { width: 280, align: 'center' });
  doc.moveTo(LEFT + colSigW - 110, sigY + 36).lineTo(LEFT + colSigW + 110, sigY + 36)
    .strokeColor('#888').lineWidth(0.7).stroke();
  doc.fillColor('#999').font('Helvetica-Oblique').fontSize(8.5)
    .text(t('honor_signature_line'), LEFT + colSigW - 140, sigY + 40, { width: 280, align: 'center' });

  const faitALigne = `${t('honor_made_at')} : ______, ${t('honor_on')} ______`;
  doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
    .text(faitALigne, LEFT + 40, sigY, { width: colSigW, align: 'center' });
  doc.moveTo(LEFT + 80, sigY + 36).lineTo(LEFT + colSigW - 80, sigY + 36)
    .strokeColor('#888').lineWidth(0.7).stroke();

  // ── Pied de page ──────────────────────────────────────────
  const localeDate = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR');
  doc.fillColor('#bbb').font('Helvetica').fontSize(7)
    .text(`${t('generated_by_elimu')} — ${localeDate}`, LEFT, pageH - 52, { width: W, align: 'center' });
}

/**
 * Exporte le PDF des diplômes du tableau d'honneur.
 * Un diplôme par page (A4 paysage).
 */
function exportDiplomesPDF(data, outputPath, lang = 'fr') {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      data.honores.forEach((honore, i) => {
        if (i > 0) doc.addPage();
        drawDiplome(doc, data, honore, lang);
      });

      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, count: data.honores.length }));
      stream.on('error', reject);
    } catch (err) { reject(err); }
  });
}

module.exports = { prepareDiplomes, exportDiplomesPDF, computeClassStatsN3 };
