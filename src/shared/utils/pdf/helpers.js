/**
 * pdf/helpers.js — Fonctions partagées sans dépendance à PDFKit
 * Version synchrone pour better-sqlite3
 * 
 * NOTE IMPORTANTE : Le cache a été désactivé pour que les modifications
 * de configuration (couleurs, mentions, etc.) soient prises en compte
 * immédiatement sans avoir à redémarrer l'application.
 */

const { get, all } = require('../../database/db');

// ============================================================
// CACHE POUR ÉVITER LES REQUÊTES RÉPÉTITIVES
// ============================================================
let _cachedConfig = null;
let _cachedRegles = null;

// ============================================================
// HELPERS
// ============================================================

/**
 * Charge la configuration du bulletin depuis la base de données.
 * Le cache est désactivé pour garantir que les modifications
 * sont prises en compte immédiatement.
 */
function loadConfig() {
  // Cache désactivé pour éviter les problèmes de mise à jour
  // if (_cachedConfig) return _cachedConfig;
  const rows = all('SELECT cle, valeur FROM bulletin_config');
  const cfg = {};
  rows.forEach(r => cfg[r.cle] = r.valeur);
  _cachedConfig = cfg;
  return cfg;
}

/**
 * Charge le barème d'absences depuis les paramètres.
 * Le cache est désactivé pour garantir que les modifications
 * sont prises en compte immédiatement.
 */
function loadReglesAbsences() {
  // Cache désactivé pour éviter les problèmes de mise à jour
  // if (_cachedRegles) return _cachedRegles;
  try {
    const row = get(`SELECT valeur FROM parametres WHERE cle = 'regles_absences'`);
    _cachedRegles = row ? (JSON.parse(row.valeur || '[]')) : [];
    return _cachedRegles;
  } catch {
    _cachedRegles = [];
    return [];
  }
}

/**
 * Invalide le cache de configuration (appeler après modification des paramètres)
 * Utile si on réactive le cache plus tard.
 */
function invalidateConfigCache() {
  _cachedConfig = null;
  _cachedRegles = null;
  console.log('✅ Cache bulletin invalidé');
}

// Exposer globalement pour les autres modules (parametres.js)
if (typeof window !== 'undefined') {
  window.invalidateBulletinConfigCache = invalidateConfigCache;
}

/**
 * Trouve la sanction correspondant à un nombre d'heures d'absence
 * selon le barème défini par l'établissement
 */
function getSanctionAbsence(heures, regles) {
  if (!regles || !regles.length || heures === 0) return null;
  const sorted = [...regles].sort((a, b) => a.de - b.de);
  for (const r of sorted) {
    if (heures >= r.de && heures <= (r.a || 999)) {
      return r;
    }
  }
  return null;
}

/**
 * Parse matieres_json d'une classe — nouveau format enrichi
 * [ { id, nom, coefficient, enseignant, groupe }, ... ]
 */
function parseMatieresClasse(json) {
  try {
    const parsed = JSON.parse(json || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      if (typeof item === 'string') {
        return { id: null, nom: item, coefficient: 1, enseignant: '', groupe: '' };
      }
      return {
        id:          item.id          || null,
        nom:         item.nom         || item.nom_matiere || '',
        coefficient: item.coefficient !== undefined ? item.coefficient : 1,
        enseignant:  item.enseignant  || '',
        groupe:      item.groupe      || ''
      };
    }).filter(m => m.nom);
  } catch { return []; }
}

// Alias pour les tests (parseMatieresJson pointe vers parseMatieresClasse)
const parseMatieresJson = parseMatieresClasse;

function parseMentions(cfg) {
  try {
    const arr = JSON.parse(cfg.mentions_config || '[]');
    return Array.isArray(arr) && arr.length ? arr : _mentionsDefaut();
  } catch { return _mentionsDefaut(); }
}

function _mentionsDefaut() {
  return [
    { min: 16,   max: 20,    label: 'Très Bien',  couleur: '#00a854' },
    { min: 14,   max: 15.99, label: 'Bien',        couleur: '#52c41a' },
    { min: 12,   max: 13.99, label: 'Assez Bien',  couleur: '#faad14' },
    { min: 10,   max: 11.99, label: 'Passable',    couleur: '#fa8c16' },
    { min: 0,    max: 9.99,  label: 'Insuffisant', couleur: '#f5222d' }
  ];
}

function getMention(note, cfg) {
  if (note === null || note === undefined) return '—';
  const type = cfg.notation_type || 'numerique';
  if (type === 'lettres') {
    if (note >= 16) return 'A+'; if (note >= 14) return 'A';
    if (note >= 12) return 'B';  if (note >= 10) return 'C';
    if (note >= 8)  return 'D';  return 'F';
  }
  if (type === 'mentions') {
    if (note >= 16) return 'TB'; if (note >= 14) return 'B';
    if (note >= 12) return 'AB'; if (note >= 10) return 'P';
    return 'I';
  }
  const m = parseMentions(cfg).find(m => note >= m.min && note <= m.max);
  return m ? m.label : '—';
}

function getMentionColor(note, cfg) {
  if (note === null || note === undefined) return '#999999';
  const m = parseMentions(cfg).find(m => note >= m.min && note <= m.max);
  if (m) return m.couleur;
  return note >= 14 ? '#00a854' : note >= 10 ? '#fa8c16' : '#f5222d';
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

function ordinal(n) { return n === 1 ? '1er' : `${n}ème`; }

function ordinalLang(n, lang = 'fr') {
  if (lang === 'en') {
    if (n === 1) return '1st';
    if (n === 2) return '2nd';
    if (n === 3) return '3rd';
    return `${n}th`;
  }
  return n === 1 ? '1er' : `${n}ème`;
}

/**
 * Calcule la moyenne d'une matière.
 * - Les deux séquences : pondération appliquée
 * - Une seule séquence : note directe sans pondération
 */
function calcMoyMatiere(seq1, seq2, p1, p2) {
  if (seq1 !== null && seq2 !== null)
    return Math.round((seq1 * p1 + seq2 * p2) * 100) / 100;
  if (seq1 !== null) return Math.round(seq1 * 100) / 100;
  if (seq2 !== null) return Math.round(seq2 * 100) / 100;
  return null;
}

/** Calcule la moyenne générale pondérée */
function calcMoyGenerale(matieres) {
  const avecNote = matieres.filter(m => m.moy !== null);
  if (!avecNote.length) return null;
  const totalCoef = avecNote.reduce((s, m) => s + m.coef, 0);
  if (!totalCoef) return null;
  return Math.round(avecNote.reduce((s, m) => s + m.moy * m.coef, 0) / totalCoef * 100) / 100;
}

/** Calcule les totaux d'un groupe : total notes×coef, total coef, moy groupe */
function calcTotauxGroupe(matieresDuGroupe) {
  let totalNxC = 0;
  let totalCoef = 0;
  for (const m of matieresDuGroupe) {
    if (m.moy !== null) {
      totalNxC += Math.round(m.moy * m.coef * 100) / 100;
      totalCoef += m.coef;
    }
  }
  const moyGroupe = totalCoef > 0
    ? Math.round(totalNxC / totalCoef * 100) / 100
    : null;
  return { totalNxC: Math.round(totalNxC * 100) / 100, totalCoef, moyGroupe };
}

/**
 * Dessine l'en-tête administratif (officiel) sur un document PDF
 */
function drawAdminHeader(doc, cfg, yStart, lang = 'fr', isMinimal = false) {
  const LEFT = doc.page.margins.left || 30;
  const pageW = doc.page.width - (doc.page.margins.left + doc.page.margins.right) || 535;
  const colW = pageW / 3;
  const logoSize = isMinimal ? 55 : 62;
  const logoX = LEFT + colW + (colW - logoSize) / 2;
  const logoY = yStart;
  const coulPrimaire = cfg.couleur_primaire || '#1a3c6e';
  const enteteBilingue = cfg.entete_bilingue !== '0'; // Par défaut bilingue si non précisé

  const drawCol = (txtList, x, align) => {
    let currentY = yStart;
    txtList.forEach(ligne => {
      doc.font(ligne.bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(ligne.size)
         .fillColor(ligne.color)
         .text(ligne.text, x, currentY, { width: colW - 4, align });
      currentY += ligne.size + (isMinimal ? 1.2 : 1.8);
    });
    return currentY;
  };

  const getFR = () => [
    { text: cfg.pays || 'RÉPUBLIQUE DU CAMEROUN', bold: true, size: 7, color: isMinimal ? '#000' : coulPrimaire },
    { text: cfg.devise_nationale || 'Paix - Travail - Patrie', bold: false, size: 6.5, color: '#333' },
    { text: '--------', bold: false, size: 6, color: '#aaa' },
    { text: cfg.ministere || 'MINISTÈRE DES ENSEIGNEMENTS SECONDAIRES', bold: true, size: 6.5, color: isMinimal ? '#333' : coulPrimaire },
    { text: (cfg.delegation_regionale || '').toUpperCase(), bold: true, size: 6, color: isMinimal ? '#333' : coulPrimaire },
    { text: (cfg.delegation_departementale || '').toUpperCase(), bold: true, size: 6, color: isMinimal ? '#333' : coulPrimaire },
    { text: '--------', bold: false, size: 6, color: '#aaa' },
    { text: (cfg.etab_nom || 'ÉTABLISSEMENT').toUpperCase(), bold: true, size: 6.5, color: '#111' },
    { text: cfg.etab_devise ? `"${cfg.etab_devise}"` : '', bold: false, size: 6, color: '#555' }
  ].filter(l => l.text);

  const getEN = () => [
    { text: cfg.republique_en || 'REPUBLIC OF CAMEROON', bold: true, size: 7, color: isMinimal ? '#000' : coulPrimaire },
    { text: cfg.devise_etat_en || 'Peace - Work - Fatherland', bold: false, size: 6.5, color: '#333' },
    { text: '--------', bold: false, size: 6, color: '#aaa' },
    { text: cfg.ministere_en || 'MINISTRY OF SECONDARY EDUCATION', bold: true, size: 6.5, color: isMinimal ? '#333' : coulPrimaire },
    { text: (cfg.delegation_regionale_en || '').toUpperCase(), bold: true, size: 6, color: isMinimal ? '#333' : coulPrimaire },
    { text: (cfg.delegation_departementale_en || '').toUpperCase(), bold: true, size: 6, color: isMinimal ? '#333' : coulPrimaire },
    { text: '--------', bold: false, size: 6, color: '#aaa' },
    { text: (cfg.etab_nom_en || cfg.etab_nom || 'SCHOOL').toUpperCase(), bold: true, size: 6.5, color: '#111' },
    { text: cfg.etab_devise_en ? `"${cfg.etab_devise_en}"` : '', bold: false, size: 6, color: '#555' }
  ].filter(l => l.text);

  let yFR = yStart, yEN = yStart;

  if (enteteBilingue) {
    yFR = drawCol(getFR(), LEFT, 'center');
    yEN = drawCol(getEN(), LEFT + colW * 2, 'center');
  } else {
    // Mode unilingue : on centre la colonne choisie au milieu du document
    const centerColX = LEFT + colW;
    if (lang === 'en') yEN = drawCol(getEN(), centerColX, 'center');
    else yFR = drawCol(getFR(), centerColX, 'center');
  }

  // Logo (Toujours au centre si bilingue, ou à côté si unilingue et place dispo)
  // Pour rester simple et cohérent avec l'existant : toujours au centre
  if (cfg.etab_logo) {
    try {
      const logoData = cfg.etab_logo;
      const imgBuf = Buffer.from(logoData.split(',')[1], 'base64');
      doc.image(imgBuf, logoX, logoY + 2, { fit: [logoSize, logoSize], align: 'center' });
    } catch (e) {
      if (!isMinimal) doc.rect(logoX, logoY + 2, logoSize, logoSize).stroke('#ccc');
    }
  } else if (!isMinimal) {
    doc.rect(logoX, logoY + 2, logoSize, logoSize).stroke('#ccc');
  }

  const yFinal = Math.max(yFR, yEN, logoY + logoSize) + 8;
  doc.moveTo(LEFT, yFinal).lineTo(LEFT + pageW, yFinal).strokeColor(coulPrimaire).lineWidth(1.5).stroke();
  return yFinal + 12;
}

/**
 * Dessine le logo de l'établissement en filigrane au centre de la page,
 * au-dessus des écritures. Le logo garde ses couleurs d'origine (non teinté).
 * Si aucun logo n'est configuré, ne fait rien.
 */
function drawLogoFiligrane(doc, cfg, opts = {}) {
  if (!cfg || !cfg.etab_logo) return;
  const { size = 180, opacity = 0.12 } = opts;
  try {
    const logoData = cfg.etab_logo;
    const imgBuf = Buffer.from(logoData.split(',')[1], 'base64');
    const centerX = doc.page.width / 2;
    const centerY = doc.page.height / 2;
    doc.save();
    doc.opacity(opacity);
    doc.image(imgBuf, centerX - size / 2, centerY - size / 2, { fit: [size, size], align: 'center', valign: 'center' });
    doc.restore();
  } catch (e) {
    // Logo invalide : ignorer le filigrane
  }
}

module.exports = {
  loadConfig,
  loadReglesAbsences,
  invalidateConfigCache,
  getSanctionAbsence,
  parseMatieresClasse,
  parseMatieresJson,
  parseMentions,
  getMention,
  getMentionColor,
  hexToRgb,
  ordinal,
  ordinalLang,
  calcMoyMatiere,
  calcMoyGenerale,
  calcTotauxGroupe,
  drawAdminHeader,
  drawLogoFiligrane
};
