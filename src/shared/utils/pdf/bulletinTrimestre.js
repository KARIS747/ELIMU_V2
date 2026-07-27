/**
 * pdf/bulletinTrimestre.js — Export PDF du bulletin trimestriel
 * Supporte les styles : Officiel, Moderne, Minimal
 */

const PDFDocument = require('pdfkit');
const fs          = require('fs');
const { run, get, all } = require('../../database/db');
const { getNoteToCode, getUAsForPeriode, SOUS_TYPES, CURRICULUM_TEMPLATES } = require('../../constants/curriculum');
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

    // Calculer les moyennes et rangs de la classe pour N1/N2
    const elevesClasse = all(`SELECT id FROM eleves WHERE classe_id = ?`, [eleve.classe_id]);
    const nbElevesClasse = elevesClasse.length;
    
    const listMoyennes = [];
    elevesClasse.forEach(el => {
      const rowMoy = get(`
        SELECT AVG(note) AS avg_note
        FROM notes
        WHERE eleve_id = ? AND ua IN (${lesUA.map(u => `'${u}'`).join(',')}) AND annee_scolaire_id = ? AND sous_type IS NULL
      `, [el.id, eid]);
      
      const mVal = rowMoy ? rowMoy.avg_note : null;
      listMoyennes.push({ id: el.id, moy: mVal !== null ? mVal : -1 });
    });
    
    listMoyennes.sort((a, b) => b.moy - a.moy);
    const pos = listMoyennes.findIndex(item => item.id === eleveId);
    const rangGeneral = (pos >= 0 && listMoyennes[pos].moy >= 0) ? pos + 1 : null;

    const absRow = get(`SELECT heures FROM heures_absence WHERE eleve_id = ? AND periode = ?`, [eleveId, periode]);
    const heuresAbsence = absRow?.heures || 0;

    return {
      eleve, notesAgg, notesSub, cfg, periode, lang, rangGeneral, nbElevesClasse, heuresAbsence
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
 * Construit un index des sous-compétences avec leur compétence parente et poids
 */
function buildSubCompIndex(lvl) {
  const tmpls = Object.values(CURRICULUM_TEMPLATES);
  const idx = {};
  for (const tmpl of tmpls) {
    for (const [compCode, comp] of Object.entries(tmpl.competences || {})) {
      for (const [scCode, sc] of Object.entries(comp.sousCompetences || {})) {
        idx[scCode] = {
          competenceCode: compCode,
          competenceNom: comp.nom || compCode,
          nom: sc.nom || scCode,
          total: sc.total || 0,
          weights: { orale: sc.orale||0, ecrite: sc.ecrite||0, pratique: sc.pratique||0, savoirEtre: sc.savoirEtre||0 }
        };
      }
    }
  }
  return idx;
}

/**
 * Dessine un bulletin qualitatif (N1/N2) — format référence 2 pages
 * UA1-3 en colonnes horizontales · sous-compétences en lignes
 */
function drawBulletinQualitatif(doc, data, lang = 'fr') {
  const { eleve, notesAgg, notesSub, cfg, periode, rangGeneral, nbElevesClasse, heuresAbsence } = data;
  const t = getDocTranslator(lang);
  const coulPrimaire = cfg.couleur_primaire || '#26337A';
  const lvl = eleve.niveau_v2;

  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const LEFT = doc.page.margins.left;
  let y = doc.page.margins.top;

  const lesUA = getUAsForPeriode(periode);
  const uaCount = lesUA.length;

  // --- CALCUL DYNAMIQUE DES LARGEURS DE COLONNES ---
  const totalParts = 28 + 28 + 20 + uaCount * 18 + 30; // 28 Comp, 28 SousComp, 20 Eval, 18 par UA, 30 totaux
  const scale = pageW / totalParts;
  const colComp = Math.floor(28 * scale);
  const colSousComp = Math.floor(28 * scale);
  const colEval = Math.floor(20 * scale);
  const noteW = Math.floor(9 * scale);
  const coteW = Math.floor(9 * scale);
  const colTot = Math.floor(10 * scale);
  const colMoy20 = Math.floor(10 * scale);
  const colCoteFinale = pageW - (colComp + colSousComp + colEval + (noteW + coteW) * uaCount + colTot + colMoy20);

  const colWidths = [colComp, colSousComp, colEval];
  for (let i = 0; i < uaCount; i++) {
    colWidths.push(noteW, coteW);
  }
  colWidths.push(colTot, colMoy20, colCoteFinale);

  // --- CONSTRUIRE LA STRUCTURE DE DONNÉES DU CURRICULUM ---
  const tmpl = CURRICULUM_TEMPLATES[lvl];
  if (!tmpl) return;

  const dataTree = [];
  let totalGeneralObtained = 0;
  let totalGeneralMax = 0;

  const uaGeneralObtained = {};
  const uaGeneralMax = {};
  lesUA.forEach(ua => {
    uaGeneralObtained[ua] = 0;
    uaGeneralMax[ua] = 0;
  });

  for (const [compCode, comp] of Object.entries(tmpl.competences)) {
    const compNode = {
      code: compCode,
      nom: comp.nom,
      totalWeight: comp.total,
      subCompetences: [],
      uaObtained: {},
      uaMax: {},
      totalObtained: 0,
      totalMax: 0
    };
    lesUA.forEach(ua => {
      compNode.uaObtained[ua] = 0;
      compNode.uaMax[ua] = 0;
    });

    for (const [scCode, sc] of Object.entries(comp.sousCompetences)) {
      const scNode = {
        code: scCode,
        nom: sc.nom,
        totalWeight: sc.total,
        evaluations: [],
        uaObtained: {},
        uaMax: {},
        totalObtained: 0,
        totalMax: 0
      };
      lesUA.forEach(ua => {
        scNode.uaObtained[ua] = 0;
        scNode.uaMax[ua] = 0;
      });

      const activeTypes = ['orale', 'ecrite', 'pratique', 'savoirEtre'].filter(type => sc[type] > 0);

      activeTypes.forEach(type => {
        const maxPt = sc[type];
        const evalNode = {
          type,
          label: type === 'savoirEtre' ? 'Savoir-être' : type.charAt(0).toUpperCase() + type.slice(1),
          maxPt,
          uas: {},
          totalObtained: 0,
          totalMax: 0
        };

        lesUA.forEach(ua => {
          const uaSub = notesSub.find(u => u.ua === ua);
          const row = uaSub?.subRows?.find(r => r.sous_competence_code === scCode && r.sous_type === type);
          const rawNote = row ? row.note : null;

          if (rawNote !== null && rawNote !== undefined) {
            const obtained = (rawNote / 20) * maxPt;
            evalNode.uas[ua] = {
              note: Math.round(obtained * 10) / 10,
              cote: getNoteToCode(rawNote)
            };
            evalNode.totalObtained += obtained;
            evalNode.totalMax += maxPt;

            scNode.uaObtained[ua] += obtained;
            scNode.uaMax[ua] += maxPt;
          } else {
            evalNode.uas[ua] = null;
          }
        });

        scNode.totalObtained += evalNode.totalObtained;
        scNode.totalMax += evalNode.totalMax;

        scNode.evaluations.push(evalNode);
      });

      lesUA.forEach(ua => {
        compNode.uaObtained[ua] += scNode.uaObtained[ua];
        compNode.uaMax[ua] += scNode.uaMax[ua];
      });
      compNode.totalObtained += scNode.totalObtained;
      compNode.totalMax += scNode.totalMax;

      compNode.subCompetences.push(scNode);
    }

    lesUA.forEach(ua => {
      uaGeneralObtained[ua] += compNode.uaObtained[ua];
      uaGeneralMax[ua] += compNode.uaMax[ua];
    });
    totalGeneralObtained += compNode.totalObtained;
    totalGeneralMax += compNode.totalMax;

    dataTree.push(compNode);
  }

  // Calcul des moyennes générales
  let totalGeneral = 0;
  let totalGeneralMaxScale = 0;
  dataTree.forEach(comp => {
    let compObtained = 0;
    let compMax = 0;
    comp.subCompetences.forEach(sc => {
      if (sc.totalMax > 0) {
        const scAvgOn20 = (sc.totalObtained / sc.totalMax) * 20;
        const scScore = (scAvgOn20 / 20) * sc.totalWeight;
        compObtained += scScore;
        compMax += sc.totalWeight;
      }
    });
    comp.totalObtained = compObtained;
    comp.totalMax = compMax;

    totalGeneral += compObtained;
    totalGeneralMaxScale += compMax;
  });
  const moy20General = totalGeneralMaxScale > 0 ? (totalGeneral / totalGeneralMaxScale) * 20 : null;

  // --- DESSIN DU BULLETIN ---

  // 1. Mini en-tête
  const etabName = (cfg.etab_nom || 'ÉTABLISSEMENT').toUpperCase();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(coulPrimaire)
    .text(`${etabName}  |  Niveau : ${lvl.replace('N', '')}  |  Classe : ${eleve.nom_classe || '—'}`, LEFT, y);
  y += 10;
  doc.moveTo(LEFT, y).lineTo(LEFT + pageW, y).strokeColor('#ccc').lineWidth(0.4).stroke();
  y += 4;

  // 2. En-tête officiel
  y = drawAdminHeader(doc, cfg, y, lang, true); // isMinimal = true

  // 3. Titre
  const numT = periode.replace(/[^0-9]/g, '') || '1';
  const titreText = `BULLETIN DE NOTES — ${numT}${numT === '1' ? 'er' : 'ème'} TRIMESTRE  |  ANNÉE SCOLAIRE : ${cfg.annee_scolaire || '—'}`;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111')
    .text(titreText, LEFT, y, { width: pageW, align: 'center' });
  y += 12;

  // 4. Infos élève (tableau 4 colonnes, hauteur fixe)
  const profName = get(
    `SELECT nom, prenom FROM professeurs p JOIN classes c ON c.professeur_principal_id = p.id WHERE c.id = ?`,
    [eleve.classe_id]
  ) || { nom: '—', prenom: '' };

  const carteH = 18;
  doc.rect(LEFT, y, pageW, carteH).fill('#f2f2f2');
  doc.rect(LEFT, y, pageW, carteH).stroke('#ccc').lineWidth(0.4);
  const colW1 = pageW * 0.32;
  const colW2 = pageW * 0.18;
  const colW3 = pageW * 0.22;
  const colW4 = pageW * 0.28;

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#666').text('NOM ET PRÉNOM', LEFT + 4, y + 2);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111').text(`${eleve.nom.toUpperCase()} ${eleve.prenom}`, LEFT + 4, y + 8, { width: colW1 - 8, ellipsis: true });

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#666').text('NÉ(E) LE', LEFT + colW1 + 4, y + 2);
  doc.font('Helvetica').fontSize(7).fillColor('#111').text(eleve.date_naissance ? new Date(eleve.date_naissance).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR') : '—', LEFT + colW1 + 4, y + 8);

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#666').text('CLASSE + NIVEAU', LEFT + colW1 + colW2 + 4, y + 2);
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text(`${eleve.nom_classe || '—'} | Niveau ${lvl}`, LEFT + colW1 + colW2 + 4, y + 8);

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#666').text('EFFECTIF + TITULAIRE', LEFT + colW1 + colW2 + colW3 + 4, y + 2);
  doc.font('Helvetica').fontSize(7).fillColor('#111').text(`Eff: ${nbElevesClasse} | M. ${(profName.nom || '').toUpperCase()}`, LEFT + colW1 + colW2 + colW3 + 4, y + 8, { width: colW4 - 8, ellipsis: true });
  y += carteH + 6;

  // 5. Tableau principal des compétences
  const headerH = 15;
  const evalRowH = 8.0;
  const totRowH = 9.0;
  const grandTotRowH = 11;
  
  const fontHeader = 6.2;
  const fontEval = 5.8;
  const fontTotal = 6.0;
  const fontGrandTotal = 6.5;

  // Couleurs de fond par compétence
  const COMP_COLORS = {
    'C1': '#DCE9FF',
    'C2': '#DCFFDC',
    'C3': '#FFF8D0',
    'C4': '#FFE0E0',
    'C5': '#F0DFFF',
    'C6': '#FFEbD0'
  };

  const SUB_COMP_COLORS = {
    'C1': '#C6D8FF',
    'C2': '#C6FFC6',
    'C3': '#FFF0B5',
    'C4': '#FFC2C2',
    'C5': '#E0C4FF',
    'C6': '#FFDFB5'
  };

  // Dessin de l'en-tête du tableau
  doc.rect(LEFT, y, pageW, headerH).fill('#26337A');
  doc.fillColor('#fff').font('Helvetica-Bold');
  let cx = LEFT;
  
  doc.fontSize(fontHeader).text('COMPÉTENCE', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colComp - 4, align: 'center' });
  cx += colComp;
  
  doc.fontSize(fontHeader).text('SOUS-COMPÉTENCE', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colSousComp - 4, align: 'center' });
  cx += colSousComp;
  
  doc.fontSize(fontHeader).text('ÉVALUATION', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colEval - 4, align: 'center' });
  cx += colEval;
  
  lesUA.forEach(ua => {
    doc.fontSize(fontHeader - 1.0).text(ua, cx + 2, y + 2, { width: noteW + coteW - 4, align: 'center' });
    doc.fontSize(fontHeader - 0.4).text('Note', cx + 2, y + 8, { width: noteW - 4, align: 'center' });
    cx += noteW;
    doc.text('Cote', cx + 2, y + 8, { width: coteW - 4, align: 'center' });
    cx += coteW;
  });
  
  doc.fontSize(fontHeader).text('TOTAL', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colTot - 4, align: 'center' });
  cx += colTot;
  
  doc.fontSize(fontHeader).text('MOY./20', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colMoy20 - 4, align: 'center' });
  cx += colMoy20;
  
  doc.fontSize(fontHeader).text('COTE', cx + 2, y + (headerH - fontHeader) / 2 - 0.5, { width: colCoteFinale - 4, align: 'center' });

  // Tracer les bordures de l'en-tête (sharper lines: 0.25 width, light blue-gray color)
  doc.rect(LEFT, y, pageW, headerH).stroke('#b0c4de').lineWidth(0.25);
  let tcx = LEFT;
  colWidths.forEach(w => {
    doc.moveTo(tcx, y).lineTo(tcx, y + headerH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
    tcx += w;
  });
  doc.moveTo(LEFT + pageW, y).lineTo(LEFT + pageW, y + headerH).strokeColor('#b0c4de').lineWidth(0.25).stroke();

  y += headerH;

  // Tableau de textes différés pour les colonnes 1 (compétence) et 2 (sous-compétence)
  // On les dessine APRÈS tous les fonds du tableau pour éviter qu'ils soient masqués
  const deferredLabels = [];

  // Parcourir les compétences
  dataTree.forEach(comp => {
    const compYStart = y;
    const bgComp = COMP_COLORS[comp.code] || '#ffffff';
    const bgSubComp = SUB_COMP_COLORS[comp.code] || '#ffffff';

    comp.subCompetences.forEach(sc => {
      const scYStart = y;
      const evalsCount = sc.evaluations.length;

      sc.evaluations.forEach((ev, ei) => {
        // Colorer les colonnes
        let rowX = LEFT;
        colWidths.forEach((w, i) => {
          let bg = '#ffffff';
          if (i === 0) bg = bgComp;
          doc.rect(rowX, y, w, evalRowH).fill(bg);
          rowX += w;
        });

        // Contenu de la ligne d'évaluation (Col 3 à N)
        let cellX = LEFT + colComp + colSousComp;
        
        // Col 3: Evaluation
        doc.fillColor('#333').font('Helvetica').fontSize(fontEval)
           .text(`${ev.label} /${ev.maxPt}`, cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: colEval - 4, align: 'center' });
        cellX += colEval;

        // UAs Note & Cote
        lesUA.forEach(ua => {
          const uaData = ev.uas[ua];
          if (uaData) {
            doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontEval)
               .text(String(uaData.note), cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: noteW - 4, align: 'center' });
            cellX += noteW;
            doc.fillColor('#333').font('Helvetica').fontSize(fontEval)
               .text(uaData.cote, cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: coteW - 4, align: 'center' });
            cellX += coteW;
          } else {
            doc.fillColor('#bbb').font('Helvetica').fontSize(fontEval)
               .text('—', cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: noteW - 4, align: 'center' });
            cellX += noteW;
            doc.text('—', cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: coteW - 4, align: 'center' });
            cellX += coteW;
          }
        });

        // Column TOTAL
        const totStr = ev.totalMax > 0 ? `${Math.round(ev.totalObtained * 10) / 10}/${ev.totalMax}` : '—';
        doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontEval)
           .text(totStr, cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: colTot - 4, align: 'center' });
        cellX += colTot;

        // Column MOY./20
        const moy20Val = ev.totalMax > 0 ? (ev.totalObtained / ev.totalMax) * 20 : null;
        doc.text(moy20Val !== null ? moy20Val.toFixed(1) : '—', cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: colMoy20 - 4, align: 'center' });
        cellX += colMoy20;

        // Column COTE
        doc.text(moy20Val !== null ? getNoteToCode(moy20Val) : '—', cellX + 2, y + (evalRowH - fontEval) / 2 - 0.5, { width: colCoteFinale - 4, align: 'center' });

        // Tracer les bordures de la ligne (sharper lines: 0.25 width, light blue-gray color)
        doc.moveTo(LEFT + colComp + colSousComp, y + evalRowH).lineTo(LEFT + pageW, y + evalRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
        let borderX = LEFT;
        colWidths.forEach(w => {
          doc.moveTo(borderX, y).lineTo(borderX, y + evalRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
          borderX += w;
        });
        doc.moveTo(LEFT + pageW, y).lineTo(LEFT + pageW, y + evalRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();

        y += evalRowH;
      });

      // Ligne TOTAL sous-compétence (si plus de 1 évaluation)
      if (evalsCount > 1) {
        let rowX = LEFT;
        colWidths.forEach((w, i) => {
          let bg = bgSubComp;
          if (i === 0) bg = bgComp;
          doc.rect(rowX, y, w, totRowH).fill(bg);
          rowX += w;
        });

        let cellX = LEFT + colComp;
        
        // Col 2: TOTAL sous-compétence
        doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontTotal)
           .text(`TOTAL ${sc.code}`, cellX + 3, y + (totRowH - fontTotal) / 2 - 0.5, {
             width: colSousComp - 6,
             height: totRowH - 0.5,
             align: 'left',
             ellipsis: true
           });
        cellX += colSousComp;

        // Col 3: TOTAL weight
        doc.text(`TOTAL /${sc.totalWeight}`, cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colEval - 4, align: 'center' });
        cellX += colEval;

        // UAs Note & Cote
        lesUA.forEach(ua => {
          if (sc.uaMax[ua] > 0) {
            const scUAAverage = (sc.uaObtained[ua] / sc.uaMax[ua]) * 20;
            doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontTotal)
               .text(String(Math.round(sc.uaObtained[ua] * 10) / 10), cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: noteW - 4, align: 'center' });
            cellX += noteW;
            doc.fillColor(coulPrimaire).text(getNoteToCode(scUAAverage), cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: coteW - 4, align: 'center' });
            cellX += coteW;
          } else {
            doc.fillColor('#bbb').font('Helvetica').fontSize(fontTotal)
               .text('—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: noteW - 4, align: 'center' });
            cellX += noteW;
            doc.text('—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: coteW - 4, align: 'center' });
            cellX += coteW;
          }
        });

        // Column TOTAL
        const totStr = sc.totalMax > 0 ? `${Math.round(sc.totalObtained * 10) / 10}/${sc.totalMax}` : '—';
        doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontTotal)
           .text(totStr, cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colTot - 4, align: 'center' });
        cellX += colTot;

        // Column MOY./20
        const moy20Val = sc.totalMax > 0 ? (sc.totalObtained / sc.totalMax) * 20 : null;
        doc.text(moy20Val !== null ? moy20Val.toFixed(1) : '—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colMoy20 - 4, align: 'center' });
        cellX += colMoy20;

        // Column COTE
        doc.text(moy20Val !== null ? getNoteToCode(moy20Val) : '—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colCoteFinale - 4, align: 'center' });

        // Tracer les bordures de la ligne (sharper lines: 0.25 width, light blue-gray color)
        doc.moveTo(LEFT + colComp, y + totRowH).lineTo(LEFT + pageW, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
        let borderX = LEFT;
        colWidths.forEach(w => {
          doc.moveTo(borderX, y).lineTo(borderX, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
          borderX += w;
        });
        doc.moveTo(LEFT + pageW, y).lineTo(LEFT + pageW, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();

        y += totRowH;
      }

      // Tracer la ligne de séparation sous-compétence Col 2
      doc.moveTo(LEFT + colComp, y).lineTo(LEFT + colComp + colSousComp, y).strokeColor('#b0c4de').lineWidth(0.25).stroke();
      
      // Différer le dessin du texte sous-compétence (sera dessiné après tous les fonds)
      const evalRowsH = evalsCount * evalRowH;
      deferredLabels.push({
        type: 'sc',
        text: `${sc.code} - ${sc.nom} (${sc.totalWeight} pts)`,
        x: LEFT + colComp + 3,
        areaY: scYStart,
        areaH: evalRowsH,
        width: colSousComp - 6,
        align: 'left'
      });
    });

    // Ligne TOTAL COMPÉTENCE
    let rowX = LEFT;
    colWidths.forEach(w => {
      doc.rect(rowX, y, w, totRowH).fill(bgComp);
      rowX += w;
    });

    let cellX = LEFT;
    // Col 1: TOTAL compétence
    doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontTotal + 0.3)
       .text(`TOTAL ${comp.code}`, cellX + 3, y + (totRowH - (fontTotal + 0.3)) / 2 - 0.5, {
         width: colComp - 6,
         height: totRowH - 0.5,
         align: 'left',
         ellipsis: true
       });
    cellX += colComp;

    // Col 2: Nom compétence (tronqué pour tenir sur 1 ligne et ne pas déborder sur les lignes/compétences suivantes)
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(fontTotal)
       .text(comp.nom, cellX + 3, y + (totRowH - fontTotal) / 2 - 0.5, {
         width: colSousComp - 6,
         height: totRowH - 0.5,
         align: 'left',
         ellipsis: true
       });
    cellX += colSousComp;

    // Col 3: TOTAL weight
    doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontTotal)
       .text(`TOTAL /${comp.totalWeight}`, cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colEval - 4, align: 'center' });
    cellX += colEval;

    // UAs Note & Cote
    lesUA.forEach(ua => {
      if (comp.uaMax[ua] > 0) {
        const compUAAverage = (comp.uaObtained[ua] / comp.uaMax[ua]) * 20;
        doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontTotal)
           .text(String(Math.round(comp.uaObtained[ua] * 10) / 10), cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: noteW - 4, align: 'center' });
        cellX += noteW;
        doc.fillColor(coulPrimaire).text(getNoteToCode(compUAAverage), cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: coteW - 4, align: 'center' });
        cellX += coteW;
      } else {
        doc.fillColor('#bbb').font('Helvetica').fontSize(fontTotal)
           .text('—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: noteW - 4, align: 'center' });
        cellX += noteW;
        doc.text('—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: coteW - 4, align: 'center' });
        cellX += coteW;
      }
    });

    // Column TOTAL
    const totStr = comp.totalMax > 0 ? `${Math.round(comp.totalObtained * 10) / 10}/${comp.totalMax}` : '—';
    doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontTotal)
       .text(totStr, cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colTot - 4, align: 'center' });
    cellX += colTot;

    // Column MOY./20
    const moy20Val = comp.totalMax > 0 ? (comp.totalObtained / comp.totalMax) * 20 : null;
    doc.text(moy20Val !== null ? moy20Val.toFixed(1) : '—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colMoy20 - 4, align: 'center' });
    cellX += colMoy20;

    // Column COTE
    doc.text(moy20Val !== null ? getNoteToCode(moy20Val) : '—', cellX + 2, y + (totRowH - fontTotal) / 2 - 0.5, { width: colCoteFinale - 4, align: 'center' });

    // Tracer les bordures de la ligne (sharper lines: 0.25 width, light blue-gray color)
    doc.moveTo(LEFT, y + totRowH).lineTo(LEFT + pageW, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
    let borderX = LEFT;
    colWidths.forEach(w => {
      doc.moveTo(borderX, y).lineTo(borderX, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
      borderX += w;
    });
    doc.moveTo(LEFT + pageW, y).lineTo(LEFT + pageW, y + totRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();

    y += totRowH;

    // Tracer la ligne de séparation sous-compétence Col 1
    doc.moveTo(LEFT, y).lineTo(LEFT + colComp, y).strokeColor('#b0c4de').lineWidth(0.25).stroke();

    // Différer le dessin du texte compétence (sera dessiné après tous les fonds)
    const compSpanH = y - compYStart - totRowH;
    deferredLabels.push({
      type: 'comp',
      text: `${comp.code}\n${comp.nom}`,
      x: LEFT + 3,
      areaY: compYStart,
      areaH: compSpanH,
      width: colComp - 6,
      align: 'center',
      color: coulPrimaire
    });
  });

  // --- LIGNE TOTAL GÉNÉRAL ---
  let rowX = LEFT;
  colWidths.forEach(w => {
    doc.rect(rowX, y, w, grandTotRowH).fill('#C0D0F0');
    rowX += w;
  });

  let cellX = LEFT;
  doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontGrandTotal)
     .text('TOTAL GÉNÉRAL', cellX + 3, y + (grandTotRowH - fontGrandTotal) / 2 - 0.5, { width: colComp - 6, align: 'left' });
  cellX += colComp;
  cellX += colSousComp; // laisser vide Col 2

  doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontGrandTotal - 0.5)
     .text('TOTAL /320', cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.5)) / 2 - 0.5, { width: colEval - 4, align: 'center' });
  cellX += colEval;

  lesUA.forEach(ua => {
    if (uaGeneralMax[ua] > 0) {
      const uaAverage = (uaGeneralObtained[ua] / uaGeneralMax[ua]) * 20;
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontGrandTotal - 0.7)
         .text(String(Math.round(uaGeneralObtained[ua] * 10) / 10), cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.7)) / 2 - 0.5, { width: noteW - 4, align: 'center' });
      cellX += noteW;
      doc.fillColor(coulPrimaire).text(getNoteToCode(uaAverage), cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.7)) / 2 - 0.5, { width: coteW - 4, align: 'center' });
      cellX += coteW;
    } else {
      doc.fillColor('#bbb').font('Helvetica').fontSize(fontGrandTotal - 0.7)
         .text('—', cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.7)) / 2 - 0.5, { width: noteW - 4, align: 'center' });
      cellX += noteW;
      doc.text('—', cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.7)) / 2 - 0.5, { width: coteW - 4, align: 'center' });
      cellX += coteW;
    }
  });

  // Column TOTAL
  const totGeneralStr = totalGeneralMax > 0 ? `${Math.round(totalGeneralObtained * 10) / 10}/${totalGeneralMax}` : '—';
  doc.fillColor(coulPrimaire).font('Helvetica-Bold').fontSize(fontGrandTotal - 0.5)
     .text(totGeneralStr, cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.5)) / 2 - 0.5, { width: colTot - 4, align: 'center' });
  cellX += colTot;

  // Column MOY./20
  doc.text(moy20General !== null ? moy20General.toFixed(1) : '—', cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.5)) / 2 - 0.5, { width: colMoy20 - 4, align: 'center' });
  cellX += colMoy20;

  // Column COTE
  doc.text(moy20General !== null ? getNoteToCode(moy20General) : '—', cellX + 2, y + (grandTotRowH - (fontGrandTotal - 0.5)) / 2 - 0.5, { width: colCoteFinale - 4, align: 'center' });

  // Tracer les bordures de la ligne (sharper lines: 0.25 width, light blue-gray color)
  doc.moveTo(LEFT, y + grandTotRowH).lineTo(LEFT + pageW, y + grandTotRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
  let borderX = LEFT;
  colWidths.forEach(w => {
    doc.moveTo(borderX, y).lineTo(borderX, y + grandTotRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();
    borderX += w;
  });
  doc.moveTo(LEFT + pageW, y).lineTo(LEFT + pageW, y + grandTotRowH).strokeColor('#b0c4de').lineWidth(0.25).stroke();

  y += grandTotRowH + 6;

  // --- DESSINER LES TEXTES DIFFÉRÉS (colonnes 1 et 2) ---
  // Maintenant que tous les fonds de tableau sont peints, on dessine les labels par-dessus
  deferredLabels.forEach(lbl => {
    if (lbl.type === 'sc') {
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontTotal);
      const h = doc.heightOfString(lbl.text, { width: lbl.width });
      const clippedH = Math.min(h, lbl.areaH);
      doc.text(lbl.text, lbl.x, lbl.areaY + Math.max(0.5, (lbl.areaH - clippedH) / 2), {
        width: lbl.width,
        height: lbl.areaH,
        align: lbl.align,
        ellipsis: true
      });
    } else {
      doc.fillColor(lbl.color).font('Helvetica-Bold').fontSize(fontTotal + 0.3);
      const h = doc.heightOfString(lbl.text, { width: lbl.width });
      const clippedH = Math.min(h, lbl.areaH);
      doc.text(lbl.text, lbl.x, lbl.areaY + Math.max(1, (lbl.areaH - clippedH) / 2), {
        width: lbl.width,
        height: lbl.areaH,
        align: lbl.align,
        ellipsis: true
      });
    }
  });

  // 6. RANG ET MOYENNE (Bandeau bleu marine)
  const bandeauH = 13;
  doc.rect(LEFT, y, pageW, bandeauH).fill('#26337A');
  const moyText = `MOYENNE GÉNÉRALE : ${moy20General !== null ? moy20General.toFixed(2) : '—'} / 20`;
  const rangText = `RANG : ${rangGeneral ? ordinalLang(rangGeneral, lang) : '—'} / ${nbElevesClasse}`;
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
  doc.text(moyText, LEFT + 8, y + (bandeauH - 7.5) / 2 - 0.5);
  doc.text(rangText, LEFT + pageW - 158, y + (bandeauH - 7.5) / 2 - 0.5, { width: 150, align: 'right' });
  y += bandeauH + 4;

  // 6b. ABSENCES (Bandeau vert, orange ou rouge selon la gravité)
  if (cfg.afficher_absences !== '0') {
    const absColor = heuresAbsence === 0 ? '#2e7d32' : (heuresAbsence < 10 ? '#e65100' : '#b71c1c');
    const absBg = heuresAbsence === 0 ? '#f0fff4' : '#fff8f0';
    doc.rect(LEFT, y, pageW, bandeauH).fill(absBg);
    doc.rect(LEFT, y, pageW, bandeauH).stroke(absColor).lineWidth(0.4);
    
    doc.fillColor('#444').font('Helvetica-Bold').fontSize(7);
    doc.text(t('unjustified_absences') + ' :', LEFT + 8, y + (bandeauH - 7) / 2 - 0.5);
    
    const hLabel = heuresAbsence === 0 
      ? t('no_absence_recorded') 
      : `${heuresAbsence} ${lang === 'en' ? 'unjustified hour(s)' : 'heure(s) non justifiée(s)'}`;
    
    doc.fillColor(absColor).font('Helvetica-Bold').fontSize(7.5);
    doc.text(hLabel, LEFT + pageW - 158, y + (bandeauH - 7.5) / 2 - 0.5, { width: 150, align: 'right' });
    y += bandeauH + 6;
  }

  // 7. LÉGENDE COTATION (Tableau 4 colonnes)
  const legH = 9;
  const legW = pageW / 4;
  const drawLegItem = (label, desc, bg, x) => {
    doc.rect(x, y, legW, legH).fill(bg);
    doc.rect(x, y, legW, legH).stroke('#d0d8e4').lineWidth(0.2);
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(5.2)
       .text(`${label} = ${desc}`, x + 2, y + (legH - 5.2) / 2 - 0.5, { width: legW - 4, align: 'center' });
  };
  drawLegItem('NA', 'Non Acquis (0-10)', '#FFCCCC', LEFT);
  drawLegItem('ECA', "En Cours d'Acquisition (11-14)", '#FFF5C0', LEFT + legW);
  drawLegItem('A', 'Acquis (15-17)', '#D4FCD4', LEFT + legW * 2);
  drawLegItem('A+', 'Expert (18-20)', '#D0E4FF', LEFT + legW * 3);
  
  // Tracer les bordures de la légende
  let legBorderX = LEFT;
  for (let i = 0; i <= 4; i++) {
    doc.moveTo(legBorderX, y).lineTo(legBorderX, y + legH).strokeColor('#d0d8e4').lineWidth(0.2).stroke();
    legBorderX += legW;
  }
  doc.moveTo(LEFT, y + legH).lineTo(LEFT + pageW, y + legH).strokeColor('#d0d8e4').lineWidth(0.2).stroke();
  
  y += legH + 6;

  // 8. OBSERVATIONS ET SIGNATURES (Tableau 4 colonnes, hauteur fixe)
  const sigH = 34; // hauteur fixe compacte
  const colSigW = pageW / 4;
  const nomDir = cfg.directeur_nom || 'Le Directeur';
  const titreDir = cfg.directeur_titre || (lang === 'en' ? 'The Principal' : 'Le Directeur');

  // Appreciation auto
  let appAuto = '';
  if (cfg.appreciation_auto !== '0' && moy20General !== null) {
    appAuto = moy20General >= 18
      ? (lang === 'en' ? 'Excellent results. Congratulations!' : 'Résultats excellents. Félicitations !')
      : moy20General >= 15
      ? (lang === 'en' ? 'Very good results.' : 'Très bons résultats.')
      : moy20General >= 12
      ? (lang === 'en' ? 'Good results. Keep it up.' : 'Bons résultats. Continuez ainsi.')
      : moy20General >= 10
      ? (lang === 'en' ? 'Acceptable results.' : 'Résultats acceptables.')
      : (lang === 'en' ? 'Insufficient results.' : 'Résultats insuffisants.');
  }

  const drawSigBox = (title, content, x) => {
    doc.rect(x, y, colSigW, sigH).stroke('#ccc').lineWidth(0.4);
    doc.fillColor('#444').font('Helvetica-Bold').fontSize(5.5).text(title, x + 3, y + 3, { width: colSigW - 6, align: 'center' });
    if (content) {
      doc.fillColor('#111').font('Helvetica-Oblique').fontSize(6).text(content, x + 4, y + 11, { width: colSigW - 8 });
    }
    doc.fillColor('#bbb').font('Helvetica').fontSize(5).text(title === titreDir ? '(Signature et cachet)' : '(Signature)', x + 2, y + sigH - 7, { width: colSigW - 4, align: 'center' });
  };

  const profFull = profName.nom !== '—' ? `${(profName.nom || '').toUpperCase()} ${profName.prenom}` : '—';
  drawSigBox("Observations de l'enseignant", appAuto, LEFT);
  drawSigBox(lang === 'en' ? 'The Class Teacher' : 'Le Professeur Principal', profFull, LEFT + colSigW);
  drawSigBox(titreDir, nomDir, LEFT + colSigW * 2);
  drawSigBox(t('parent_signature') || 'Le Parent', '', LEFT + colSigW * 3);
  
  // Tracer les bordures de signatures
  let sigBorderX = LEFT;
  for (let i = 0; i <= 4; i++) {
    doc.moveTo(sigBorderX, y).lineTo(sigBorderX, y + sigH).strokeColor('#ccc').lineWidth(0.4).stroke();
    sigBorderX += colSigW;
  }
  doc.moveTo(LEFT, y + sigH).lineTo(LEFT + pageW, y + sigH).strokeColor('#ccc').lineWidth(0.4).stroke();
  
  y += sigH + 5;

  // 9. Pied de page
  const localeDate = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR');
  const footText = `Fait à _____________, le _____________          Généré par Elimu — ${localeDate}`;
  doc.fillColor('#999').font('Helvetica').fontSize(5.5)
    .text(footText, LEFT, y, { width: pageW, align: 'right' });
}

/**
 * Dessine un bulletin complet sur une page du document
 */
function drawBulletinTrimestre(doc, data, lang = 'fr') {
  if (data.eleve.niveau_v2 === 'N1' || data.eleve.niveau_v2 === 'N2') {
    return drawBulletinQualitatif(doc, data, lang);
  }

  const { eleve, matieres, moyGenerale, groupesRendu, moyClasseMap, rangGeneral, nbElevesClasse, heuresAbsence, cfg, periode } = data;
  const t = getDocTranslator(lang);
  
  const style = cfg.style_modele || 'officiel';

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
      const isQual = (data.eleve.niveau_v2 === 'N1' || data.eleve.niveau_v2 === 'N2');
      const doc = new PDFDocument({ margin: isQual ? 23 : 30, size: 'A4' });
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
      let isQual = false;
      if (ids.length > 0) {
        const firstEl = get(`
          SELECT c.niveau_v2
          FROM eleves e
          JOIN classes c ON c.id = e.classe_id
          WHERE e.id = ?
        `, [ids[0]]);
        if (firstEl && (firstEl.niveau_v2 === 'N1' || firstEl.niveau_v2 === 'N2')) {
          isQual = true;
        }
      }
      const doc = new PDFDocument({ margin: isQual ? 23 : 30, size: 'A4' });
      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);
      let count = 0;
      for (const id of ids) {
        const data = prepareBulletinTrimestreData(id, periode, lang, anneeId);
        if (data) {
          if (count > 0) doc.addPage({ margin: isQual ? 23 : 30 });
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
