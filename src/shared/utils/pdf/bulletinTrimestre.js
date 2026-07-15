/**
 * pdf/bulletinTrimestre.js — Export PDF du bulletin trimestriel
 * Supporte les styles : Officiel, Moderne, Minimal
 */

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const { run, get, all } = require('../../database/db');
const { getNoteToCode, getUAsForPeriode, SOUS_TYPES } = require('../../constants/curriculum');
const {
  loadConfig,
  loadReglesAbsences,
  getSanctionAbsence,
  parseMatieresClasse,
  getMention,
  getMentionColor,
  ordinalLang,
  calcMoyMatiere,
  calcMoyGenerale,
  calcTotauxGroupe,
  drawAdminHeader
} = require('./helpers');
const { getDocTranslator } = require('./locales');

/**
 * Prépare les données pour un bulletin trimestriel
 */
function prepareBulletinTrimestreData(eleveId, periode, lang = 'fr', anneeId = null) {
  const t = getDocTranslator(lang);
  const eleve = get(`
    SELECT e.*, c.nom_classe, c.id AS classe_id, c.matieres_json AS matieres_json_classe, c.niveau_v2
    FROM eleves e
    LEFT JOIN classes c ON c.id = e.classe_id
    WHERE e.id = ?
  `, [eleveId]);
  if (!eleve) return null;

  const cfg = loadConfig();
  
  // --- CAS N1 / N2 (Qualitatif) ---
  if (eleve.niveau_v2 === 'N1' || eleve.niveau_v2 === 'N2') {
    const eid = anneeId || eleve.annee_scolaire_id;
    const lesUA = getUAsForPeriode(periode);
    const notesAgg = lesUA.map(ua => {
      const aggRows = all(`
        SELECT n.sous_competence_code, n.note, n.ua
        FROM notes n
        WHERE n.eleve_id = ? AND n.ua = ? AND n.annee_scolaire_id = ?
          AND n.sous_type IS NULL
        ORDER BY n.sous_competence_code
      `, [eleveId, ua, eid]);
      return { ua, aggRows };
    });

    // Sous-types pour le détail optionnel
    const notesSub = lesUA.map(ua => {
      const subRows = all(`
        SELECT n.sous_competence_code, n.sous_type, n.note
        FROM notes n
        WHERE n.eleve_id = ? AND n.ua = ? AND n.annee_scolaire_id = ?
          AND n.sous_type IS NOT NULL
        ORDER BY n.sous_competence_code, n.sous_type
      `, [eleveId, ua, eid]);
      return { ua, subRows };
    });

    return {
      eleve, notesAgg, notesSub, cfg, periode, lang
    };
  }

  // --- CAS N3 (Quantitatif Classique) ---
  const poids1 = parseFloat(cfg.calc_poids_seq1 || 40) / 100;
  const poids2 = parseFloat(cfg.calc_poids_seq2 || 60) / 100;

  const configClasseMats = parseMatieresClasse(eleve.matieres_json_classe);
  const configClasseMap = new Map(configClasseMats.map(m => [m.nom, m]));

  const notesSeq1 = all(`
    SELECT m.nom_matiere, m.coefficient AS coef_global, n.note, m.id AS matiere_id
    FROM notes n JOIN matieres m ON m.id = n.matiere_id
    WHERE n.eleve_id = ? AND n.periode = ? AND n.sequence = 1
    ORDER BY m.nom_matiere
  `, [eleveId, periode]);

  const notesSeq2 = all(`
    SELECT m.nom_matiere, m.coefficient AS coef_global, n.note, m.id AS matiere_id
    FROM notes n JOIN matieres m ON m.id = n.matiere_id
    WHERE n.eleve_id = ? AND n.periode = ? AND n.sequence = 2
    ORDER BY m.nom_matiere
  `, [eleveId, periode]);

  const matieresMap = new Map();
  [...notesSeq1, ...notesSeq2].forEach(n => {
    if (!matieresMap.has(n.matiere_id)) {
      const cfgClasse = configClasseMap.get(n.nom_matiere);
      const coef = cfgClasse ? cfgClasse.coefficient : (n.coef_global || 1);
      const enseignant = cfgClasse ? cfgClasse.enseignant : '';
      const groupe     = cfgClasse ? cfgClasse.groupe     : '';
      matieresMap.set(n.matiere_id, {
        id: n.matiere_id,
        nom: n.nom_matiere,
        coef, enseignant, groupe,
        seq1: null, seq2: null
      });
    }
  });
  notesSeq1.forEach(n => { const m = matieresMap.get(n.matiere_id); if (m) m.seq1 = n.note; });
  notesSeq2.forEach(n => { const m = matieresMap.get(n.matiere_id); if (m) m.seq2 = n.note; });

  const matieres = Array.from(matieresMap.values())
    .map(m => ({ ...m, moy: calcMoyMatiere(m.seq1, m.seq2, poids1, poids2) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const moyGenerale = calcMoyGenerale(matieres);

  const groupesRendu = (() => {
    const seen = new Set();
    const groupesNoms = [];
    for (const m of configClasseMats) {
      if (m.groupe && m.groupe.trim() && !seen.has(m.groupe)) {
        seen.add(m.groupe);
        groupesNoms.push(m.groupe);
      }
    }
    if (groupesNoms.length === 0) return [{ nom_groupe: null, matieres }];
    const result = [];
    const assignees = new Set();
    for (const nomGroupe of groupesNoms) {
      const matsGroupe = configClasseMats
        .filter(cfg => cfg.groupe === nomGroupe)
        .map(cfg => matieres.find(m => m.nom === cfg.nom))
        .filter(Boolean);
      if (matsGroupe.length > 0) {
        matsGroupe.forEach(m => assignees.add(m.nom));
        result.push({ nom_groupe: nomGroupe, matieres: matsGroupe });
      }
    }
    const nonAssignees = matieres.filter(m => !assignees.has(m.nom));
    if (nonAssignees.length > 0) result.push({ nom_groupe: t('other_subjects'), matieres: nonAssignees });
    return result;
  })();

  const moyClasseRows = all(`
    SELECT n.matiere_id,
      AVG(CASE WHEN n.sequence = 1 THEN n.note ELSE NULL END) AS moy_seq1,
      AVG(CASE WHEN n.sequence = 2 THEN n.note ELSE NULL END) AS moy_seq2
    FROM notes n JOIN eleves e ON e.id = n.eleve_id
    WHERE e.classe_id = ? AND n.periode = ?
    GROUP BY n.matiere_id
  `, [eleve.classe_id, periode]);

  const moyClasseMap = new Map();
  moyClasseRows.forEach(r => {
    const s1 = r.moy_seq1 !== null ? Math.round(r.moy_seq1 * 100) / 100 : null;
    const s2 = r.moy_seq2 !== null ? Math.round(r.moy_seq2 * 100) / 100 : null;
    moyClasseMap.set(r.matiere_id, calcMoyMatiere(s1, s2, poids1, poids2));
  });

  let rangGeneral = null;
  let nbElevesClasse = 0;
  if (cfg.afficher_rang_general !== '0') {
    const tousEleves = all(`
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
      ORDER BY moy_pond DESC
    `, [poids1, poids2, periode, eleve.classe_id]);
    nbElevesClasse = tousEleves.length;
    const pos = tousEleves.findIndex(e => e.id === eleveId);
    rangGeneral = pos >= 0 ? pos + 1 : null;
  }

  const absRow = get(`SELECT heures FROM heures_absence WHERE eleve_id = ? AND periode = ?`, [eleveId, periode]);
  const heuresAbsence = absRow?.heures || 0;

  return {
    eleve, matieres, moyGenerale, groupesRendu, moyClasseMap,
    rangGeneral, nbElevesClasse, heuresAbsence,
    cfg, periode
  };
}

/**
 * Dessine un bulletin qualitatif (N1/N2)
 */
function drawBulletinQualitatif(doc, data) {
  const { eleve, notesAgg, notesSub, cfg, periode, lang } = data;
  const t = getDocTranslator(lang);
  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';
  const pageW = 595 - 60;
  const LEFT = 30;
  let y = 28;

  // En-tête standard
  y = drawAdminHeader(doc, cfg, y, lang, false);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(`${t('bulletin_title')} ${periode.replace(/[^0-9]/g, '') || '1'}`, LEFT, y, { width: pageW, align: 'center' });
  y += 18;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(coulPrimaire).text(`${t('school_year')} : ${cfg.annee_scolaire || '2025/2026'}`, LEFT, y, { width: pageW, align: 'center' });
  y += 20;

  // Carte élève
  doc.rect(LEFT, y, pageW, 40).stroke('#333').lineWidth(0.5);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#666').text('NOM & PRÉNOM :', LEFT + 5, y + 5);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(`${eleve.nom.toUpperCase()} ${eleve.prenom.toUpperCase()}`, LEFT + 80, y + 5);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#666').text('CLASSE :', LEFT + 5, y + 18);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(eleve.nom_classe || '—', LEFT + 80, y + 18);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#666').text('PÉRIODE :', LEFT + 5, y + 30);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(periode, LEFT + 80, y + 30);
  y += 50;

  // En-tête tableau
  const colCode = pageW * 0.25;
  const colNom = pageW * 0.35;
  const colRes = pageW * 0.4;
  const headH = 22;

  doc.rect(LEFT, y, pageW, headH).fill(coulPrimaire);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('Code', LEFT + 5, y + 7, { width: colCode });
  doc.text('Sous-compétence', LEFT + colCode + 5, y + 7, { width: colNom });
  doc.text('Résultat', LEFT + colCode + colNom, y + 7, { width: colRes, align: 'center' });
  y += headH;

  // Lignes par UA
  const codeLabel = { 'orale': 'Orale', 'ecrite': 'Écrite', 'pratique': 'Pratique', 'savoirEtre': 'Savoir-Être' };

  notesAgg.forEach(({ ua, aggRows }) => {
    // Bande UA
    doc.rect(LEFT, y, pageW, 15).fill('#f0f4ff');
    doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(8).text(ua, LEFT + 5, y + 4);
    y += 15;

    aggRows.forEach((row, idx) => {
      const code = getNoteToCode(row.note);
      const col = code === 'A+' || code === 'A' ? '#00a854' : code === 'ECA' ? '#faad14' : '#f5222d';
      const bg = idx % 2 === 0 ? '#fff' : '#f9fbff';
      
      doc.rect(LEFT, y, pageW, 16).fill(bg).stroke('#eee').lineWidth(0.2);
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(7.5).text(row.sous_competence_code || '—', LEFT + 5, y + 5, { width: colCode - 5 });
      
      // Résultat : code qualitatif
      doc.fillColor(col).font('Helvetica-Bold').fontSize(8);
      doc.text(`${code} (${row.note.toFixed(1)})`, LEFT + colCode + colNom, y + 5, { width: colRes, align: 'center' });
      y += 16;
    });

    // Afficher les sous-types pour ce UA (en petit)
    const subForUA = notesSub.find(s => s.ua === ua);
    if (subForUA && subForUA.subRows.length > 0) {
      doc.fontSize(6.5).fillColor('#888');
      let subLine = '';
      let lastCode = '';
      subForUA.subRows.forEach(s => {
        if (s.sous_competence_code !== lastCode) {
          if (subLine) {
            doc.fillColor('#888').font('Helvetica').fontSize(6).text(subLine, LEFT + 10, y + 1, { width: pageW - 20 });
            y += 9;
          }
          subLine = `${s.sous_competence_code}: `;
          lastCode = s.sous_competence_code;
        }
        const sc = getNoteToCode(s.note);
        const sCol = sc === 'A+' || sc === 'A' ? '#00a854' : sc === 'ECA' ? '#faad14' : '#f5222d';
        subLine += `${codeLabel[s.sous_type] || s.sous_type}=${s.note.toFixed(1)}(${sc})  `;
      });
      if (subLine) {
        doc.fillColor('#888').font('Helvetica').fontSize(6).text(subLine, LEFT + 10, y + 1, { width: pageW - 20 });
        y += 11;
      }
    }
  });

  // Signature
  y = Math.max(y, 650);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#555').text('Signature du Directeur', LEFT + (pageW / 2) - 50, y, { width: 100, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#999').text('(Cachet et Signature)', LEFT + (pageW / 2) - 50, y + 12, { width: 100, align: 'center' });
}

/**
 * Dessine un bulletin complet sur une page du document
 */
function drawBulletinTrimestre(doc, data, lang = 'fr') {
  if (data.eleve.niveau_v2 === 'N1' || data.eleve.niveau_v2 === 'N2') {
    return drawBulletinQualitatif(doc, data);
  }

  const { eleve, matieres, moyGenerale, groupesRendu, moyClasseMap, rangGeneral, nbElevesClasse, heuresAbsence, cfg, periode } = data;
  const t = getDocTranslator(lang);
  
  const style = cfg.style_modele || 'officiel';
// ... (rest of the existing logic for N3)

  const isModern = style === 'moderne';
  const isMinimal = style === 'minimal';

  const params = {};
  try {
    const pRows = all('SELECT cle, valeur FROM parametres');
    pRows.forEach(r => (params[r.cle] = r.valeur));
  } catch (e) {}

  const nomEtab = cfg.etab_nom || 'ÉTABLISSEMENT SCOLAIRE';
  const filigraneTexte = cfg.filigrane_texte || params.abreviation_etab || nomEtab;
  const logoData = cfg.etab_logo;
  const nomDir = cfg.directeur_nom;
  const titreDir = cfg.directeur_titre || (lang === 'en' ? 'The Principal' : 'Le Directeur');

  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';

  const showCoef = cfg.col_coefficient !== '0';
  const showSeq1 = cfg.col_seq1 !== '0';
  const showSeq2 = cfg.col_seq2 !== '0';
  const showMoyCl = cfg.col_moy_classe !== '0';
  const showApprc = cfg.col_appreciation !== '0';

  const numTrimestre = periode.replace(/[^0-9]/g, '') || '1';
  const annee = cfg.annee_scolaire || '2025/2026';
  const hasSeq2 = matieres.some(m => m.seq2 !== null);

  const pageW = 595 - 60;
  const LEFT = 30;
  let y = 28;

  // FILIGRANE
  if (!isMinimal) {
    doc.save().opacity(0.19).fillColor('#a8a8a8').font('Helvetica-Bold').fontSize(72);
    const centerX = doc.page.width / 2;
    const centerY = doc.page.height / 2 - 10;
    doc.rotate(45, { origin: [centerX, centerY] });
    doc.text(filigraneTexte.toUpperCase(), centerX - 340, centerY - 50, { width: 700, align: 'center', lineBreak: false });
    doc.restore();
  }

  // EN-TÊTE
  if (isModern) {
    y = 28;
  } else if (!isMinimal) {
    y += 6;
  }

  // APPEL À LA FONCTION PARTAGÉE D'EN-TÊTE
  y = drawAdminHeader(doc, cfg, y, lang, isMinimal);

  // Titre du bulletin (sans bande de couleur)
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(`${t('bulletin_title')} ${numTrimestre}`, LEFT, y, { width: pageW, align: 'center' });
  y += 18;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(isModern ? coulPrimaire : '#333').text(`${t('school_year')} : ${annee}`, LEFT, y, { width: pageW, align: 'center' });

  y += 14;
  if (!isMinimal) doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#ccc').lineWidth(0.5).stroke();
  y += 8;

  // CARTE ÉLÈVE
  const carteH = 48;
  if (isModern) doc.save().roundedRect(LEFT, y, pageW, carteH, 8).fill('#f8faff').strokeColor(coulPrimaire).lineWidth(0.8).stroke().restore();
  else doc.rect(LEFT, y, pageW, carteH).stroke(isMinimal ? '#999' : '#333').lineWidth(0.5);
  
  const cellH = carteH / 2;
  const col1W = pageW * 0.50;
  const col2W = pageW * 0.25;
  const col3W = pageW - col1W - col2W;

  const drawInfo = (label, value, x, currentY, w, boldVal=false) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(isModern ? coulPrimaire : '#666').text(label, x + 5, currentY + 4);
    doc.font(boldVal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isModern ? 8.5 : 8).fillColor('#111').text(value, x + 5, currentY + 12, { width: w - 10, ellipsis: true });
  };

  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  drawInfo(t('name_firstname') + ' :', `${eleve.nom.toUpperCase()} ${eleve.prenom.toUpperCase()}`, LEFT, y, col1W, true);
  drawInfo(t('birth_date') + ' :', eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString(locale) : '—', LEFT + col1W, y, col2W);
  drawInfo(t('class') + ' :', eleve.nom_classe || '—', LEFT + col1W + col2W, y, col3W, true);
  
  const profName = (get('SELECT nom, prenom FROM professeurs p JOIN classes c ON c.professeur_principal_id = p.id WHERE c.id = ?', [eleve.classe_id])) || {nom:'—', prenom:''};
  const profFull = profName.nom !== '—' ? `${profName.nom.toUpperCase()} ${profName.prenom}` : '—';

  drawInfo(t('head_teacher') + ' :', profFull, LEFT, y + cellH, col1W);
  drawInfo(t('class_size') + ' :', String(nbElevesClasse || '—'), LEFT + col1W, y + cellH, col2W);
  drawInfo(t('rank') + ' :', (rangGeneral && nbElevesClasse) ? `${ordinalLang(rangGeneral, lang)} / ${nbElevesClasse}` : '—', LEFT + col1W + col2W, y + cellH, col3W, true);
  y += carteH + 10;

  // TABLEAU
  const cols = [];
  cols.push({ label: t('subject') + 's', key: 'mat', width: 0 });
  if (showSeq1) cols.push({ label: lang === 'en' ? 'Grades\nSeq.1' : 'Notes\nSéq.1', key: 'seq1', width: 42 });
  if (showSeq2 && hasSeq2) cols.push({ label: lang === 'en' ? 'Grades\nSeq.2' : 'Notes\nSéq.2', key: 'seq2', width: 42 });
  if (showCoef) cols.push({ label: t('coeff'), key: 'coef', width: 36 });
  cols.push({ label: t('moy_abbr'), key: 'moy', width: 44 });
  cols.push({ label: t('nxc_abbr'), key: 'nxc', width: 44 });
  if (showMoyCl) cols.push({ label: t('moy_class_abbr'), key: 'moycl', width: 44 });
  if (showApprc) cols.push({ label: t('appreciation'), key: 'apprc', width: 85 });

  const fixedW = cols.slice(1).reduce((s, c) => s + c.width, 0);
  cols[0].width = pageW - fixedW;
  const headH = isModern ? 24 : 22;

  let rowH = Math.floor((841 - 480 - headH) / (matieres.length || 1));
  rowH = Math.max(13, Math.min(isModern ? 24 : 22, rowH));

  const matFontSize = rowH >= 18 ? 8 : 7.5;
  const notesFontSize = rowH >= 18 ? 8.5 : 8;

  if (isModern) doc.save().roundedRect(LEFT, y, pageW, headH, 6).fill(coulPrimaire).restore();
  else doc.rect(LEFT, y, pageW, headH).fill(isMinimal ? '#eee' : coulPrimaire);
  
  let cx = LEFT;
  cols.forEach((col) => {
    const lines = col.label.split('\n');
    const startY = y + (headH - (lines.length * 8)) / 2;
    lines.forEach((line, li) => {
      doc.fillColor(isMinimal ? '#000' : '#fff').font('Helvetica-Bold').fontSize(7).text(line, cx + 2, startY + li * 8, { width: col.width - 4, align: 'center' });
    });
    cx += col.width;
  });
  y += headH;

  groupesRendu.forEach((groupe) => {
    if (groupe.nom_groupe) {
      doc.rect(LEFT, y, pageW, 14).fill(isModern ? '#f0f4ff' : '#e8edf5');
      doc.fillColor(isMinimal ? '#333' : coulPrimaire).font('Helvetica-Bold').fontSize(7.5).text(groupe.nom_groupe.toUpperCase(), LEFT + 6, y + 4);
      y += 14;
    }
    groupe.matieres.forEach((mat, idx) => {
      const bg = idx % 2 === 0 ? '#fff' : (isMinimal ? '#fff' : (isModern ? '#f9fbff' : '#f5f7fb'));
      doc.rect(LEFT, y, pageW, rowH).fill(bg);
      if (!isMinimal) doc.rect(LEFT, y, 2.5, rowH).fill(mat.moy !== null ? getMentionColor(mat.moy, cfg) : '#ddd');
      cx = LEFT;
      cols.forEach(col => {
        const textY = y + (rowH - matFontSize) / 2;
        doc.fillColor('#111').font('Helvetica').fontSize(matFontSize);
        switch (col.key) {
          case 'mat': doc.text(mat.nom, cx + 5, textY, { width: col.width - 8, ellipsis: true }); break;
          case 'seq1':
          case 'seq2':
            const val = col.key === 'seq1' ? mat.seq1 : mat.seq2;
            if (val !== null) doc.fillColor(isMinimal ? '#000' : getMentionColor(val, cfg)).font('Helvetica-Bold').fontSize(notesFontSize).text(val.toFixed(2), cx, textY, { width: col.width, align: 'center' });
            else doc.fillColor('#ccc').text('—', cx, textY, { width: col.width, align: 'center' });
            break;
          case 'coef': doc.text(String(mat.coef), cx, textY, { width: col.width, align: 'center' }); break;
          case 'moy':
            if (mat.moy !== null) {
              const mc = getMentionColor(mat.moy, cfg);
              if (isModern) doc.save().fillOpacity(0.08).rect(cx + 2, y + 2, col.width - 4, rowH - 4).fill(mc).restore();
              doc.fillColor(isMinimal ? '#000' : mc).font('Helvetica-Bold').fontSize(notesFontSize + 0.5).text(mat.moy.toFixed(2), cx, textY, { width: col.width, align: 'center' });
            } break;
          case 'nxc': doc.text(mat.moy !== null ? (mat.moy * mat.coef).toFixed(2) : '—', cx, textY, { width: col.width, align: 'center' }); break;
          case 'moycl': doc.fillColor('#666').text(moyClasseMap.get(mat.id) ? moyClasseMap.get(mat.id).toFixed(2) : '—', cx, textY, { width: col.width, align: 'center' }); break;
          case 'apprc': if (mat.moy !== null) doc.fillColor(isMinimal ? '#333' : getMentionColor(mat.moy, cfg)).font('Helvetica-Bold').fontSize(matFontSize - 0.5).text(getMention(mat.moy, cfg), cx + 4, textY, { width: col.width - 8, ellipsis: true }); break;
        }
        cx += col.width;
      });
      if (isMinimal) doc.moveTo(LEFT, y + rowH).lineTo(LEFT + pageW, y + rowH).strokeColor('#eee').lineWidth(0.2).stroke();
      y += rowH;
    });
    if (groupe.nom_groupe) {
      const totaux = calcTotauxGroupe(groupe.matieres);
      doc.rect(LEFT, y, pageW, 16).fill(isModern ? '#f0f4ff' : '#dce4f0');
      doc.fillColor(isMinimal ? '#000' : coulPrimaire).font('Helvetica-Bold').fontSize(7.5).text(`Total ${groupe.nom_groupe}`, LEFT + 5, y + 5);
      cx = LEFT + cols[0].width;
      cols.slice(1).forEach(col => {
        let txt = '';
        if (col.key === 'coef') txt = String(totaux.totalCoef);
        if (col.key === 'nxc')  txt = totaux.totalNxC.toFixed(2);
        if (col.key === 'moy' && totaux.moyGroupe !== null) doc.fillColor(isMinimal ? '#000' : getMentionColor(totaux.moyGroupe, cfg)).text(totaux.moyGroupe.toFixed(2), cx, y + 5, { width: col.width, align: 'center' });
        else if (txt) doc.fillColor(isMinimal ? '#333' : coulPrimaire).text(txt, cx, y + 5, { width: col.width, align: 'center' });
        cx += col.width;
      });
      y += 16;
    }
  });

  y += 10;
  // RÉCAP
  const recapH = 30;
  if (isModern) doc.save().roundedRect(LEFT, y, pageW, recapH, 6).fill('#f0f4ff').strokeColor(coulPrimaire).lineWidth(1).stroke().restore();
  else {
    doc.rect(LEFT, y, pageW, recapH).fill(isMinimal ? '#fff' : '#f0f4f8');
    if (!isMinimal) { doc.rect(LEFT, y, pageW, 1.5).fill(coulPrimaire); doc.rect(LEFT, y + recapH - 1.5, pageW, 1.5).fill(coulPrimaire); }
    else doc.rect(LEFT, y, pageW, recapH).stroke('#ddd');
  }
  if (moyGenerale !== null) {
    const mc = getMentionColor(moyGenerale, cfg);
    doc.fillColor('#444').font('Helvetica-Bold').fontSize(9).text(t('general_average') + ' :', LEFT + 10, y + 10);
    doc.fillColor(isMinimal ? '#000' : mc).font('Helvetica-Bold').fontSize(15).text(`${moyGenerale.toFixed(2)}/20`, LEFT + (lang === 'en' ? 140 : 120), y + 8);
    doc.fillColor(isMinimal ? '#333' : mc).font('Helvetica-Bold').fontSize(9).text(`→ ${getMention(moyGenerale, cfg)}`, LEFT + (lang === 'en' ? 205 : 185), y + 11);
  }
  y += recapH + 10;

  // ABSENCES
  if (cfg.afficher_absences !== '0') {
    const absH = 22;
    const absColor = heuresAbsence === 0 ? '#2e7d32' : (heuresAbsence < 10 ? '#e65100' : '#b71c1c');
    if (isModern) doc.save().roundedRect(LEFT, y, pageW, absH, 5).fill(heuresAbsence === 0 ? '#f0fff4' : '#fff8f0').restore();
    else doc.rect(LEFT, y, pageW, absH).fill(heuresAbsence === 0 ? '#f0fff4' : '#fff8f0');
    doc.fillColor('#444').font('Helvetica-Bold').fontSize(8).text(t('unjustified_absences') + ' :', LEFT + 10, y + 7);
    const hLabel = heuresAbsence === 0 ? t('no_absence_recorded') : `${heuresAbsence} ${lang === 'en' ? 'unjustified hour(s)' : 'heure(s) non justifiée(s)'}`;
    doc.fillColor(isMinimal ? '#000' : absColor).font('Helvetica-Bold').fontSize(8.5).text(hLabel, LEFT + (lang === 'en' ? 140 : 185), y + 7);
    y += absH + 8;
  }

  // APPRÉCIATION
  if (cfg.afficher_appreciation_generale !== '0') {
    const appH = 46;
    if (isModern) doc.save().roundedRect(LEFT, y, pageW, appH, 6).strokeColor('#d0d8e4').lineWidth(0.5).stroke().restore();
    else doc.rect(LEFT, y, pageW, appH).stroke('#d0d8e4').lineWidth(0.5);
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(8.5).text(t('conseil_appreciation') + ' :', LEFT + 10, y + 8);
    if (cfg.appreciation_auto !== '0' && moyGenerale !== null) {
      const auto = moyGenerale >= 16 ? (lang === 'en' ? 'Excellent results. Congratulations!' : 'Résultats excellents. Félicitations !') 
                 : moyGenerale >= 14 ? (lang === 'en' ? 'Very good term. Remarkable efforts.' : 'Très bon trimestre. Efforts remarquables.') 
                 : moyGenerale >= 12 ? (lang === 'en' ? 'Good term. Keep it up.' : 'Bon trimestre. Continuez ainsi.') 
                 : moyGenerale >= 10 ? (lang === 'en' ? 'Acceptable results. Progress possible.' : 'Résultats acceptables. Progrès possibles.') 
                 : (lang === 'en' ? 'Insufficient results. Sustained work needed.' : 'Résultats insuffisants. Travail soutenu nécessaire.');
      doc.fillColor('#555').font('Helvetica-Oblique').fontSize(9).text(auto, LEFT + 10, y + 22, { width: pageW - 20 });
    }
    y += appH + 10;
  }

  // SIGNATURES
  y = Math.max(y, 690);
  const sigH = 58;
  const sigW = (pageW - 12) / 3;
  const drawSigBox = (title, val, x) => {
    if (isModern) doc.save().roundedRect(x, y, sigW, sigH, 6).strokeColor('#d0d8e4').lineWidth(0.5).stroke().restore();
    else doc.rect(x, y, sigW, sigH).stroke('#d0d8e4');
    doc.fillColor('#555').font('Helvetica-Bold').fontSize(7.5).text(title, x, y + 6, { width: sigW, align: 'center' });
    if (val) doc.fillColor('#111').font('Helvetica').fontSize(8).text(val, x, y + 20, { width: sigW, align: 'center' });
    doc.fillColor('#ccc').font('Helvetica').fontSize(6.5).text(title === titreDir ? t('seal_and_signature') : '(Signature)', x, y + 46, { width: sigW, align: 'center' });
  };
  drawSigBox(lang === 'en' ? 'The Class Teacher' : 'Le Professeur Principal', profFull, LEFT);
  if (cfg.pied_signature !== '0') drawSigBox(titreDir, nomDir, LEFT + sigW + 6);
  drawSigBox(t('parent_signature'), '', LEFT + (sigW + 6) * 2);
  
  y += sigH + 10;
  if (cfg.pied_texte) { doc.fillColor('#777').font('Helvetica').fontSize(8).text(cfg.pied_texte, LEFT, y, { width: pageW }); y += 12; }
  doc.fillColor('#bbb').font('Helvetica').fontSize(6).text(`${t('generated_by_elimu')} — ${new Date().toLocaleDateString(locale)}`, LEFT, y, { width: pageW, align: 'center' });
}

/**
 * Exporte un bulletin individuel
 */
function exportBulletinTrimestre(eleveId, periode, outputPath, onProgress, anneeId, lang = 'fr') {
  return new Promise((resolve, reject) => {
    try {
    const data = prepareBulletinTrimestreData(eleveId, periode, lang, anneeId);
    if (!data) return resolve({ success: false, error: 'Données élève non trouvées' });
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      drawBulletinTrimestre(doc, data, lang);
      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath }));
      stream.on('error', reject);
    } catch (err) { reject(err); }
  });
}

/**
 * Exporte tous les bulletins d'une classe
 */
function exportBulletinClassePDF(elevesIds, periode, outputPath, anneeId, lang = 'fr', onProgress = null) {
  // Adaptation pour accepter soit un tableau d'IDs, soit un ID de classe
  let ids = [];
  if (Array.isArray(elevesIds)) {
    ids = elevesIds;
  } else {
    ids = all('SELECT id FROM eleves WHERE classe_id = ?', [elevesIds]).map(r => r.id);
  }

  if (!ids.length) return Promise.resolve({ success: false, error: 'Aucun élève trouvé' });

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      let count = 0;
      for (const id of ids) {
        const data = prepareBulletinTrimestreData(id, periode, lang, anneeId);
        if (data) {
          if (count > 0) doc.addPage();
          drawBulletinTrimestre(doc, data, lang);
        }
        count++;
        if (onProgress) onProgress(count, ids.length);
      }
      doc.end();
      stream.on('finish', () => resolve({ success: true, path: outputPath, count }));
      stream.on('error', reject);
    } catch (err) { reject(err); }
  });
}

module.exports = { exportBulletinTrimestre, exportBulletinClassePDF };
