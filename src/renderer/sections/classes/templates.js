/**
 * templates.js - Définition des modèles de classes (Templates V2)
 * Les données de compétences proviennent de curriculum.js (source de vérité unique).
 */

function toArray(competencesObj) {
  return Object.entries(competencesObj).map(([code, comp]) => ({
    code,
    nom: comp.nom,
    total_points: comp.total,
    sous_competences: Object.entries(comp.sousCompetences).map(([scCode, sc]) => ({
      code: scCode,
      nom: sc.nom,
      total_points: sc.total,
      orale: sc.orale,
      ecrite: sc.ecrite,
      pratique: sc.pratique,
      savoirEtre: sc.savoirEtre
    }))
  }));
}

function getCompetencesN1() {
  return toArray(window.curriculum.CURRICULUM_TEMPLATES.N1.competences);
}

function getCompetencesN2() {
  return toArray(window.curriculum.CURRICULUM_TEMPLATES.N2.competences);
}

export const CLASS_TEMPLATES = {
  template_SIL: {
    id: 'template_SIL',
    nom: 'Modèle SIL',
    niveau: 'N1',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN1()
  },
  template_CP: {
    id: 'template_CP',
    nom: 'Modèle CP',
    niveau: 'N1',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN1()
  },
  template_CE1: {
    id: 'template_CE1',
    nom: 'Modèle CE1',
    niveau: 'N2',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN2()
  },
  template_CE2: {
    id: 'template_CE2',
    nom: 'Modèle CE2',
    niveau: 'N2',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN2()
  },
  template_CM1: {
    id: 'template_CM1',
    nom: 'Modèle CM1',
    niveau: 'N2',
    systeme: 'francophone_nouveau',
    total_points: 320,
    competences: getCompetencesN2()
  },
  template_CM2: {
    id: 'template_CM2',
    nom: 'Modèle CM2',
    niveau: 'N3',
    systeme: 'classique',
    total_points: 20,
    competences: []
  }
};
