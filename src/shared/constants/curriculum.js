/**
 * curriculum.js — Constantes et règles du Curriculum National Camerounais
 * Centralise les barèmes et la logique de notation pour éviter les erreurs.
 */

/**
 * Mapping des notes numériques vers les codes qualitatifs (N1/N2)
 * Permet d'effectuer des calculs de moyennes sur des données qualitatives.
 */
const NOTE_MAPPING = {
  'NA': 5,   // Non Acquis (0-10)
  'ECA': 12, // En Cours d'Acquisition (11-14)
  'A': 16,   // Acquis (15-17)
  'A+': 19   // Expert (18-20)
};

/**
 * Convertit une note numérique /20 en code qualitatif.
 * @param {number} note 
 * @returns {string} 'NA' | 'ECA' | 'A' | 'A+'
 */
function getNoteToCode(note) {
  if (note === null || note === undefined || isNaN(note)) return null;
  if (note >= 18) return 'A+';
  if (note >= 15) return 'A';
  if (note >= 11) return 'ECA';
  return 'NA';
}

/**
 * Templates de points par compétence et sous-compétence.
 * Structure: Niveau -> Compétence -> Sous-Compétence -> Points par type d'éval.
 */
const CURRICULUM_TEMPLATES = {
  // NIVEAU 1 : SIL et CP
  'N1': {
    totalPoints: 320,
    competences: {
      'C1': {
        nom: 'Communiquer en Français, Anglais et langue nationale',
        total: 100,
        sousCompetences: {
          '1A': { nom: 'Communiquer en Français', total: 40, orale: 20, ecrite: 15, pratique: 0, savoirEtre: 5 },
          '1B': { nom: 'Communicate in English', total: 40, orale: 20, ecrite: 15, pratique: 0, savoirEtre: 5 },
          '1C': { nom: 'Pratiquer une langue nationale', total: 20, orale: 10, ecrite: 5, pratique: 3, savoirEtre: 2 },
        }
      },
      'C2': {
        nom: 'Utiliser les notions de base en Mathématiques, Science et Technologies',
        total: 60,
        sousCompetences: {
          '2A': { nom: 'Mathématiques', total: 30, orale: 5, ecrite: 20, pratique: 0, savoirEtre: 5 },
          '2B': { nom: 'Science et Technologies', total: 30, orale: 5, ecrite: 15, pratique: 5, savoirEtre: 5 },
        }
      },
      'C3': {
        nom: 'Pratiquer les valeurs sociales et citoyennes',
        total: 40,
        sousCompetences: {
          '3A': { nom: 'Valeurs sociales', total: 20, orale: 3, ecrite: 3, pratique: 10, savoirEtre: 4 },
          '3B': { nom: 'Valeurs citoyennes', total: 20, orale: 5, ecrite: 5, pratique: 8, savoirEtre: 2 },
        }
      },
      'C4': {
        nom: "Démontrer l'autonomie, l'esprit d'initiative, de créativité et d'entrepreneuriat",
        total: 20,
        sousCompetences: {
          '4': { nom: 'Autonomie, créativité et entrepreneuriat', total: 20, orale: 5, ecrite: 3, pratique: 10, savoirEtre: 2 },
        }
      },
      'C5': {
        nom: 'Utiliser les concepts de base et les outils des TIC',
        total: 40,
        sousCompetences: {
          '5': { nom: 'Concepts et outils TIC', total: 40, orale: 4, ecrite: 10, pratique: 20, savoirEtre: 6 },
        }
      },
      'C6': {
        nom: 'Pratiquer les activités physiques, sportives et artistiques',
        total: 60,
        sousCompetences: {
          '6A1': { nom: 'Activités physiques/sportives (aptes)', total: 20, orale: 2, ecrite: 2, pratique: 12, savoirEtre: 4 },
          '6A2': { nom: 'Activités physiques/sportives (inaptes)', total: 20, orale: 3, ecrite: 15, pratique: 0, savoirEtre: 2 },
          '6B': { nom: 'Activités artistiques', total: 20, orale: 2, ecrite: 4, pratique: 12, savoirEtre: 2 },
        }
      }
    }
  },
  // NIVEAU 2 : CE1 et CE2
  'N2': {
    totalPoints: 320,
    competences: {
      'C1': {
        nom: 'Communiquer en Français, Anglais et langue nationale',
        total: 80,
        sousCompetences: {
          '1A': { nom: 'Communiquer en Français', total: 30, orale: 12, ecrite: 15, pratique: 0, savoirEtre: 3 },
          '1B': { nom: 'Communicate in English', total: 30, orale: 12, ecrite: 15, pratique: 0, savoirEtre: 3 },
          '1C': { nom: 'Pratiquer une langue nationale', total: 20, orale: 10, ecrite: 6, pratique: 2, savoirEtre: 0 },
        }
      },
      'C2': {
        nom: 'Utiliser les notions de base en Mathématiques, Science et Technologies',
        total: 80,
        sousCompetences: {
          '2A': { nom: 'Mathématiques', total: 40, orale: 8, ecrite: 28, pratique: 0, savoirEtre: 4 },
          '2B': { nom: 'Science et Technologies', total: 40, orale: 6, ecrite: 7, pratique: 20, savoirEtre: 7 },
        }
      },
      'C3': {
        nom: 'Pratiquer les valeurs sociales et citoyennes',
        total: 40,
        sousCompetences: {
          '3A': { nom: 'Valeurs sociales', total: 20, orale: 3, ecrite: 8, pratique: 5, savoirEtre: 4 },
          '3B': { nom: 'Valeurs citoyennes', total: 20, orale: 3, ecrite: 9, pratique: 5, savoirEtre: 3 },
        }
      },
      'C4': {
        nom: "Démontrer l'autonomie, l'esprit d'initiative, de créativité et d'entrepreneuriat",
        total: 20,
        sousCompetences: {
          '4': { nom: 'Autonomie, créativité et entrepreneuriat', total: 20, orale: 5, ecrite: 2, pratique: 11, savoirEtre: 2 },
        }
      },
      'C5': {
        nom: 'Utiliser les concepts de base et les outils des TIC',
        total: 40,
        sousCompetences: {
          '5': { nom: 'Concepts et outils TIC', total: 40, orale: 4, ecrite: 10, pratique: 20, savoirEtre: 6 },
        }
      },
      'C6': {
        nom: 'Pratiquer les activités physiques, sportives et artistiques',
        total: 60,
        sousCompetences: {
          '6A1': { nom: 'Activités physiques/sportives (aptes)', total: 20, orale: 2, ecrite: 2, pratique: 12, savoirEtre: 4 },
          '6A2': { nom: 'Activités physiques/sportives (inaptes)', total: 20, orale: 3, ecrite: 15, pratique: 0, savoirEtre: 2 },
          '6B': { nom: 'Activités artistiques', total: 20, orale: 2, ecrite: 4, pratique: 12, savoirEtre: 2 },
        }
      }
    }
  },
  // NIVEAU 3 : CM2 (Système Quantitatif Classique) — CM1 est passé en APC (N2)
  'N3': {
    systeme: 'quantitatif',
    matieresFixes: {
      'DICT': 'Dictée',
      'QVOC': 'Question / Vocabulaire',
      'ETXT': 'Etude de Texte',
      'PROD': "Production d'écrits",
      'ECRI': 'Ecriture et Présentation',
      'COPI': 'Copie',
      'CONN': 'Connaissance du Français',
      'CALC': 'Calcul rapide',
      'EXER': 'Exercices / Mathématiques',
      'PROB': 'Problèmes',
      'CGEN': 'Connaissances Gén. / Ed. Civique',
      'SENV': "Science éduc. à l'environnement",
      'LECT': 'Lecture',
      'LANG': 'Langage / Hygiène',
      'CHAN': 'Chant et récitation',
      'ACTP': 'Activités Pratiques / Dessin',
      'EPS': 'EPS (Education Physique et Sportive)',
      'INFO': 'Informatique',
      'GRAM': 'Grammar and Vocabulary',
      'READ': 'Reading Comprehension',
      'DICT_EN': 'Dictation (Anglais)',
      'READ_EN': 'Reading',
    }
  }
};

/**
 * Mapping UA → Trimestre pour N1/N2.
 * Trimestre 1 = UA1, UA2, UA3
 * Trimestre 2 = UA4, UA5, UA6
 * Trimestre 3 = UA7, UA8
 */
const UA_TRIMESTRE_MAP = {
  'Trimestre 1': ['UA1', 'UA2', 'UA3'],
  'Trimestre 2': ['UA4', 'UA5', 'UA6'],
  'Trimestre 3': ['UA7', 'UA8'],
};

/** Retourne les UA appartenant à un trimestre donné */
function getUAsForPeriode(periode) {
  return UA_TRIMESTRE_MAP[periode] || [];
}

/** Retourne le trimestre auquel appartient une UA */
function getPeriodeForUA(ua) {
  for (const [periode, uas] of Object.entries(UA_TRIMESTRE_MAP)) {
    if (uas.includes(ua)) return periode;
  }
  return null;
}

const SOUS_TYPES = ['orale', 'ecrite', 'pratique', 'savoirEtre'];

/**
 * Retourne les poids (orale, ecrite, pratique, savoirEtre) d'une sous-compétence.
 * @param {string} niveauV2 - 'N1' ou 'N2'
 * @param {string} sousCode - ex: '1A', '2B', '4', '6A1'
 * @returns {{ orale: number, ecrite: number, pratique: number, savoirEtre: number }|null}
 */
function getWeightsForSousCompetence(niveauV2, sousCode) {
  const niveau = CURRICULUM_TEMPLATES[niveauV2];
  if (!niveau || !niveau.competences) return null;
  for (const comp of Object.values(niveau.competences)) {
    if (comp.sousCompetences[sousCode]) {
      const sc = comp.sousCompetences[sousCode];
      return { orale: sc.orale || 0, ecrite: sc.ecrite || 0, pratique: sc.pratique || 0, savoirEtre: sc.savoirEtre || 0 };
    }
  }
  return null;
}

/**
 * Calcule la note agrégée /20 d'une sous-compétence à partir de ses sous-notes.
 * Chaque sous-note est sur son échelle réelle (0 à max du sous-type).
 * Retourne une note /20.
 */
function calcAggregateFromSubNotes(subNotes, weights) {
  let total = 0;
  let totalPoids = 0;
  for (const type of SOUS_TYPES) {
    const val = subNotes[type];
    const poids = weights[type];
    if (val != null && poids > 0) {
      total += val;
      totalPoids += poids;
    }
  }
  return totalPoids > 0 ? (total / totalPoids) * 20 : null;
}

module.exports = {
  NOTE_MAPPING,
  getNoteToCode,
  CURRICULUM_TEMPLATES,
  UA_TRIMESTRE_MAP,
  getUAsForPeriode,
  getPeriodeForUA,
  SOUS_TYPES,
  getWeightsForSousCompetence,
  calcAggregateFromSubNotes,
};
